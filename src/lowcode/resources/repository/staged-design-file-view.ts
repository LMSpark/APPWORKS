/**
 * @module app:lowcode/resources/repository/staged-design-file-view
 * 专用设计/内容：正式场景声明的单 file 资源 DataView 的查询/保存执行器；目标来自视图 queryContext，HTTP 仅在 load/persist 回调内。
 */
import {
  dataSetCommandQueryResultFromLocalRows,
  DataViewSaveNotAppliedError,
  type DataRow,
  type DataView,
} from '@spark-appworks/spark-data'
import {DesignResourceRejection} from '@spark-appworks/spark-lowcode-api'

export type StagedDesignColumn = Readonly<{name: string; primary?: boolean}>

/** 设计文件执行器选项；表与视图由正式场景声明，执行器只负责读写本次 queryContext 目标。 */
export type StagedDesignExecutorOptions = Readonly<{
  /** 视图 queryContext 中的目标字段，同时是设计行的同名字段。 */
  scopeField: string
  resourceId: string
  columns: readonly StagedDesignColumn[]
  /** JSON文本字段按解析后的结构核验，其他字段逐值比较。 */
  jsonFields?: readonly string[]
  /** 文件定义字段的编辑授权由当次正式目录查询提供；省略仍为只读查询结果。不能用于数据库权限推导。 */
  editing?: Readonly<{fields: readonly string[]; allowed: (scopeId: string, view: DataView) => boolean}>
  loadRow: (scopeId: string) => Promise<Record<string, unknown>>
  persistRow: (row: Readonly<DataRow>) => Promise<void>
}>

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

type StagedDesignExecutor = Parameters<DataView['bindQueryExecutor']>[0]

/** 读取视图当前声明的设计目标；空串表示尚未选择目标。 */
function viewScope(view: DataView, field: string): string {
  return String(view.queryContext[field] ?? '').trim()
}

/** 单文件设计执行器：保存后按原目标回读核对；结果不明保留待核验，重提只核验不重发。 */
export function createStagedDesignExecutor(options: StagedDesignExecutorOptions, guard: () => void): StagedDesignExecutor {
  const owners = new WeakMap<object, DataView>()
  const pending = new WeakMap<object, Readonly<{row: DataRow; baseline: DataRow; scope: string}>>()
  const assertScope = (view: DataView, expected: string): void => {
    guard()
    if (view.destroyed || viewScope(view, options.scopeField) !== expected) throw new Error('DESIGN_SCOPE_STALE: 设计目标已变化，请重开对应目标')
  }
  const queryResult = async (view: DataView, rows: readonly DataRow[], scope: string) => {
    const base = await dataSetCommandQueryResultFromLocalRows(view, rows, () => assertScope(view, scope))
    const editing = options.editing
    const result = editing ? {...base, fieldAccess: (key: unknown, field: string) => {
      const access = base.fieldAccess(key, field)
      const writable = access.read === 'visible' && editing.fields.includes(field) && allowed()
      return {...access, write: writable ? 'allowed' as const : 'denied' as const, component: writable ? 'editable' as const : access.component,
        writeMode: writable ? 'editable' as const : 'readonly' as const}
    }, editActionState: (key: unknown) => base.viewActionState(key) === 'enabled' && allowed() ? 'enabled' as const : 'disabled' as const} : base
    function allowed(): boolean {assertScope(view, scope); return editing?.allowed(scope, view) === true}
    owners.set(result, view)
    return result
  }
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

  return {
    localAggregates: false,
    executeQuery: async target => {
      guard()
      const scope = viewScope(target, options.scopeField)
      if (!scope) return queryResult(target, [], scope)
      const row = await options.loadRow(scope)
      assertScope(target, scope)
      const pk = String(row['rowid'] ?? scope)
      if (pk !== scope || row[options.scopeField] !== scope) throw new Error('DESIGN_SCOPE_STALE: 设计回读目标不一致')
      return queryResult(target, [{...row, rowid: pk}], scope)
    },
    save: async command => {
      guard()
      const receipts = []
      for (const change of command.changes) {
        const view = owners.get(change.context)
        if (!view) throw new Error('DESIGN_SCOPE_STALE: 设计提交缺少原查询视图')
        const scope = viewScope(view, options.scopeField)
        if (options.editing && !options.editing.allowed(scope, view)) throw new Error('DESIGN_EDIT_DENIED: 当前目录查询不允许编辑设计')
        if (change.changes.changed?.length !== 1 || change.changes.added?.length || change.changes.deleted?.length) {
          throw new Error('DESIGN_SAVE_SINGLE_ROW: 设计保存只接受一条已读取记录的修改')
        }
        const row = change.changes.changed[0]
        if (!row) throw new Error(`${view.tableName} 保存缺少编辑行`)
        change.context.assertIdentity(change.identity)
        if (row['rowid'] !== scope || row[options.scopeField] !== scope) throw new Error('DESIGN_SCOPE_STALE: 提交目标不一致')
        const recovering = pending.has(change.context)
        const original = change.context.rows.filter(item => item['rowid'] === scope && item[options.scopeField] === scope)
        const baseline = original[0]
        if (original.length !== 1 || !baseline) throw new Error('DESIGN_SCOPE_STALE: 原设计查询基线不唯一')
        const captured = pending.get(change.context) ?? {row: structuredClone(row), baseline: structuredClone(baseline), scope}
        if (!recovering) {
          pending.set(change.context, captured)
          try {await options.persistRow(captured.row)}
          catch (error) {
            if (error instanceof DesignResourceRejection || error instanceof SyntaxError) pending.delete(change.context)
            throw error
          }
        }
        assertScope(view, captured.scope)
        const read = await options.loadRow(captured.scope)
        assertScope(view, captured.scope)
        if (!options.columns.every(column => matches(column.name, captured.row[column.name], read[column.name]))) {
          if (recovering && options.columns.every(column => matches(column.name, captured.baseline[column.name], read[column.name]))) {
            pending.delete(change.context)
            throw new DataViewSaveNotAppliedError([change], 'SPARK_SAVE_NOT_APPLIED: 原设计核验仍为原查询基线；草稿保留，未重新提交')
          }
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
          context: await queryResult(view, [saved], captured.scope),
        })
        pending.delete(change.context)
      }
      return receipts
    },
    hasUnconfirmedSave: context => pending.has(context),
    abandonUnconfirmedSave: context => {pending.delete(context)},
  }
}