/**
 * @module app:lowcode/resources/shared/staged-design-file-view
 * 专用设计/内容：单 file 资源 DataView（staged + refresh/save），HTTP 仅在 load/persist 回调内。
 */
import {
  dataSetCommandQueryResultFromLocalRows,
  ensureDataSetFileCommandView,
  ensureDataSetStaticInputTable,
  type DataRow,
  type DataSet,
  type DataView,
} from '@spark-appworks/spark-data'
import {DesignResourceRejection} from '@spark-appworks/spark-lowcode-api'

export type StagedDesignColumn = Readonly<{name: string; primary?: boolean}>

export type StagedDesignAttachOptions = Readonly<{
  scopeInputTable: string
  scopeField: string
  designViewTable: string
  resourceId: string
  columns: readonly StagedDesignColumn[]
  /** JSON文本字段按解析后的结构核验，其他字段逐值比较。 */
  jsonFields?: readonly string[]
  loadRow: (scopeId: string) => Promise<Record<string, unknown>>
  persistRow: (row: Readonly<DataRow>) => Promise<void>
}>

export type SetDesignScopeValueInput = Readonly<{
  dataSet: DataSet
  tableName: string
  field: string
  scopeId: string
}>

export function setDesignScopeValue(input: SetDesignScopeValueInput): void {
  const table = input.dataSet.getTable(input.tableName)
  if (!table) throw new Error(`设计范围输入表缺失: ${input.tableName}`)
  const current = table.rows[0]
  if (current === undefined) table.addRows([{[input.field]: input.scopeId}])
  else Object.assign(current, {[input.field]: input.scopeId})
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  const value: unknown = JSON.parse(trimmed)
  if (!isJsonObject(value)) throw new DesignResourceRejection('设计内容必须是JSON对象')
  return value
}

export function readJsonArray(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key]
  return Array.isArray(value) ? value : []
}

export function parseJsonValue(raw: string, empty: unknown): unknown {
  const trimmed = raw.trim()
  if (!trimmed) return empty
  return JSON.parse(trimmed)
}

export function attachStagedDesignView(
  dataSet: DataSet,
  options: StagedDesignAttachOptions,
  guard: () => void,
): DataView {
  ensureDataSetStaticInputTable(dataSet, options.scopeInputTable, [{name: options.scopeField, primary: true}])
  const scopeTable = dataSet.getTable(options.scopeInputTable)
  if (scopeTable?.rows.length === 0) {
    scopeTable.addRows([{[options.scopeField]: ''}])
  }

  const editView = ensureDataSetFileCommandView({
    dataSet,
    tableName: options.designViewTable,
    resourceId: options.resourceId,
    columns: options.columns,
  })
  editView.commitMode = 'staged'

  const scopeId = (): string => String(dataSet.getTable(options.scopeInputTable)?.rows[0]?.[options.scopeField] ?? '').trim()
  const assertScope = (expected: string): void => {
    guard()
    if (scopeId() !== expected) throw new Error('DESIGN_SCOPE_STALE: 设计目标已变化，请重开对应目标')
  }
  const pending = new WeakMap<object, Readonly<{row: DataRow; scope: string}>>()
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical)
    if (isJsonObject(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    return value
  }
  const matches = (field: string, left: unknown, right: unknown): boolean => {
    if (!options.jsonFields?.includes(field)) return JSON.stringify(left) === JSON.stringify(right)
    try {
      if (typeof left !== 'string' || typeof right !== 'string') return false
      return JSON.stringify(canonical(JSON.parse(left))) === JSON.stringify(canonical(JSON.parse(right)))
    } catch {return false}
  }

  editView.bindQueryExecutor({
    localAggregates: false,
    executeQuery: async target => {
      guard()
      const scope = scopeId()
      if (!scope) return dataSetCommandQueryResultFromLocalRows(target, [], () => assertScope(scope))
      const row = await options.loadRow(scope)
      assertScope(scope)
      const pk = String(row['rowid'] ?? scope)
      if (pk !== scope || row[options.scopeField] !== scope) throw new Error('DESIGN_SCOPE_STALE: 设计回读目标不一致')
      return dataSetCommandQueryResultFromLocalRows(target, [{...row, rowid: pk}], () => assertScope(scope))
    },
    save: async command => {
      guard()
      const receipts = []
      for (const change of command.changes) {
        if (change.changes.changed?.length !== 1 || change.changes.added?.length || change.changes.deleted?.length) {
          throw new Error('DESIGN_SAVE_SINGLE_ROW: 设计保存只接受一条已读取记录的修改')
        }
        const row = change.changes.changed[0]
        if (!row) throw new Error(`${options.designViewTable} 保存缺少编辑行`)
        const scope = scopeId()
        change.context.assertIdentity(change.identity)
        if (row['rowid'] !== scope || row[options.scopeField] !== scope) throw new Error('DESIGN_SCOPE_STALE: 提交目标不一致')
        const captured = pending.get(change.context) ?? {row: structuredClone(row), scope}
        if (!pending.has(change.context)) {
          pending.set(change.context, captured)
          try {await options.persistRow(captured.row)}
          catch (error) {
            if (error instanceof DesignResourceRejection || error instanceof SyntaxError) pending.delete(change.context)
            throw error
          }
        }
        assertScope(captured.scope)
        const read = await options.loadRow(captured.scope)
        assertScope(captured.scope)
        if (!options.columns.every(column => matches(column.name, captured.row[column.name], read[column.name]))) {
          throw new Error('DESIGN_SAVE_UNCONFIRMED: 设计回读与原提交不一致，请核验或明确放弃后重读')
        }
        const saved: DataRow = {...read}
        const fields = Object.keys(saved).filter(field => !field.startsWith('lingma_sys_'))
        receipts.push({
          metaName: change.identity.metaName,
          added: [],
          changed: [saved],
          deleted: [],
          changedFields: [fields],
          context: await dataSetCommandQueryResultFromLocalRows(editView, [saved], () => assertScope(captured.scope)),
        })
        pending.delete(change.context)
      }
      return receipts
    },
    hasUnconfirmedSave: context => pending.has(context),
    abandonUnconfirmedSave: context => {pending.delete(context)},
  }, {resource: {resourceType: 'file', resourceId: options.resourceId}})

  return editView
}
