/**
 * @module app:lowcode/resources/structured-config/dimension-source/view-support
 * 职责：维度来源三类编辑器（来源绑定、数据模型事件、来源提交协议）共用的 DataView 取值归一、static-data 候选视图与单次保存回读核验。
 * 边界：只组合 spark-data DataSet/DataView 公共 API；不拼请求、不持有第二份草稿，正式写入仍由 DataSet.saveChanges 的存储适配完成。
 * AI用途：新增维度来源编辑器时复用本模块的候选视图与提交核验，不在各编辑器复制回执计数与回读比较。
 */
import {dataSetCommandQueryResultFromLocalRows, ensureDataSetStaticInputTable, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'

/** DataView 行主键身份（GUID 文本或数值）。 */
export type Id = string | number
/** 数据空间设计 API 返回的正式模型（含字段）。 */
export type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModels']>>[number]
/** 正式模型字段。 */
export type FormalField = FormalModel['fields'][number]
/** 保存与回读比较时的字段归一类别。 */
export type FieldKind = 'text' | 'integer' | 'number' | 'bit'

/** 维度来源编辑的正式目标：蓝图应用、节点与该节点已保存回读的主数据空间；assertCurrent 拒绝迟到结果。 */
export type DimensionSourceTarget = Readonly<{
  /** 蓝图所属应用 ID，写入 source_application_id。 */
  applicationId: string
  /** 蓝图节点稳定 ID，写入 source_node_id。 */
  nodeId: string
  /** 节点已保存的主数据空间（conid）；来源模型必须属于该空间。 */
  dataSpaceId: string
  /** 编辑目标仍为当前节点与上下文；失效时抛错。 */
  assertCurrent: () => void
}>

export function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim()
}
export function requiredText(value: unknown, label: string): string {
  const result = text(value)
  if (!result) throw new Error(`${label}不能为空`)
  return result
}
export function positiveInteger(value: unknown, label: string): number {
  const result = text(value) === '' ? Number.NaN : Number(value)
  if (!Number.isInteger(result) || result < 1) throw new Error(`${label}必须是正整数`)
  return result
}
export function bit(value: unknown): number {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return value === 0 ? 0 : 1
  return ['1', 'true', 'yes', '\u0001'].includes(text(value).toLowerCase()) ? 1 : 0
}
export function normalized(kind: FieldKind, value: unknown): string | number {
  if (kind === 'bit') return bit(value)
  if (kind === 'integer' || kind === 'number') return text(value) === '' ? '' : Number(value)
  return text(value)
}
export function hasColumn(view: DataView, field: string): boolean {
  return view.columns.some(column => column.name === field)
}
export function assertColumns(view: DataView, fields: readonly string[], label: string): void {
  const missing = fields.filter(field => !hasColumn(view, field))
  if (missing.length) throw new Error(`${label}视图缺少正式字段：${missing.join('、')}`)
}
export function assertReadable(view: DataView, row: Readonly<DataRow>, fields: readonly string[]): void {
  for (const field of fields) {
    if (view.fieldAccess(row, field).read !== 'visible') throw new Error(`字段 ${field} 无法读取，不能核验维度来源配置`)
  }
}
/** 按正式列类型写入整数或 0/1 标志：布尔列写布尔，文本列写数字文本，其余写数字，避免 DataView 类型校验拒绝。 */
export function columnValue(view: DataView, field: string, value: number | boolean): string | number | boolean {
  const type = view.columns.find(column => column.name === field)?.type.toLowerCase() ?? ''
  const numeric = typeof value === 'boolean' ? (value ? 1 : 0) : value
  if (type === 'boolean' || type === 'bool') return numeric === 1
  return ['string', 'varchar', 'text'].includes(type) ? String(numeric) : numeric
}
export function requireView(dataSet: DataSet, tableName: string, viewId: string): DataView {
  const view = dataSet.getView(tableName, viewId)
  if (!view) throw new Error(`维度设计场景缺少视图 ${tableName}.${viewId}`)
  return view
}
/** 刷新视图结果；存在未保存或结果未知的修改时由 DataView 拒绝替换。 */
export async function refreshView(view: DataView, assertCurrent: () => void): Promise<void> {
  view.assertResultReplacementAllowed()
  await view.refresh()
  assertCurrent()
  if (view.loadingError) throw view.loadingError
}
/** 按顺序写入编辑值（值相同则跳过）；返回首个写入失败原因，供保存前统一拒绝。 */
export function pairEditing(view: DataView, id: Id, values: Readonly<Record<string, unknown>>): Error | undefined {
  try {
    for (const [field, value] of Object.entries(values)) {
      if (text(view.getEditingRow(id)?.[field]) !== text(value)) view.updateEditingValue(id, field, value)
    }
    return undefined
  } catch (cause) {
    return cause instanceof Error ? cause : new Error(String(cause))
  }
}
/** 读取目标节点已保存数据空间的正式模型。 */
export async function readFormalModels(readModels: DataSpaceDesignApi['readModels'], target: DimensionSourceTarget): Promise<readonly FormalModel[]> {
  if (!target.dataSpaceId) throw new Error('正式蓝图节点没有绑定数据空间')
  const models = await readModels({designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: target.dataSpaceId, assertCurrent: target.assertCurrent})
  target.assertCurrent()
  return models
}
/** 正式模型的唯一可用主键字段：输出、非计算且名称等于模型主键。 */
export function formalPrimaryField(model: FormalModel): FormalField | undefined {
  const found = model.fields.filter(field => field.output && !field.computed && field.canonicalName === model.primaryKey)
  return found.length === 1 ? found[0] : undefined
}

/** 维度来源编辑器的 static-data 候选/输入视图集合；随编辑器释放整体移除，不作为正式数据保存。 */
export class DimensionSourceOptionTables {
  readonly #dataSet: DataSet
  readonly #target: DimensionSourceTarget
  readonly #tables: string[] = []

  constructor(dataSet: DataSet, target: DimensionSourceTarget) {
    this.#dataSet = dataSet
    this.#target = target
  }

  /** 挂载候选视图：首列为主键，结果每次查询时由 rows 重新计算。 */
  mount(prefix: string, columns: readonly string[], rows: () => readonly DataRow[]): DataView {
    const view = this.#create(prefix, columns)
    const table = view.dataTable
    if (!table) throw new Error('维度来源候选 DataTable 未装配')
    const resourceId = `blueprint-dimension-source:${this.#target.applicationId}:${crypto.randomUUID()}`
    table.resourceId = resourceId
    view.bindQueryExecutor({
      localAggregates: false,
      executeQuery: async query => {
        this.#target.assertCurrent()
        return dataSetCommandQueryResultFromLocalRows(query, rows().map(row => ({...row})), this.#target.assertCurrent)
      },
    }, {resource: {resourceType: 'static-data', resourceId}})
    return view
  }

  /** 挂载暂存输入视图：只在内存编辑，保存时由编辑器读取编辑值并写入正式视图。 */
  input(prefix: string, columns: readonly string[]): DataView {
    const view = this.#create(prefix, columns)
    view.commitMode = 'staged'
    return view
  }

  release(): void {
    for (const tableName of this.#tables.splice(0)) {
      if (!this.#dataSet.destroyed && this.#dataSet.getTable(tableName)) this.#dataSet.removeTable(tableName)
    }
  }

  #create(prefix: string, columns: readonly string[]): DataView {
    const tableName = `${prefix}${crypto.randomUUID().replaceAll('-', '')}`
    if (this.#dataSet.getTable(tableName)) throw new Error('维度来源候选临时表名称冲突')
    ensureDataSetStaticInputTable(this.#dataSet, tableName, columns.map((name, index) => index === 0 ? {name, primary: true} : {name}))
    this.#tables.push(tableName)
    const view = this.#dataSet.getView(tableName, 'default')
    if (!view) throw new Error('维度来源候选 DataView 未装配')
    return view
  }
}

type SaveAction = 'added' | 'changed' | 'deleted'
type CapturedRow = Readonly<{id: Id; action: SaveAction; values: Readonly<Record<string, string | number>>}>
type CapturedGroup = Readonly<{view: DataView; ids: readonly Id[]; rows: readonly CapturedRow[]; kinds: Readonly<Record<string, FieldKind>>}>
/** 一个正式视图的待提交行及按字段的归一类别。 */
export type DimensionSourceCommitTarget = Readonly<{view: DataView; ids: readonly Id[]; kinds: Readonly<Record<string, FieldKind>>}>

/**
 * 维度来源编辑器的单次 DataSet 提交与回读核验：捕获本次变更，一次 saveChanges，按回执计数确认，再刷新并逐字段比较。
 * 保存结果未知时保留原捕获，重试只核验原提交，不以新身份重提；预检失败或明确失败时清除捕获。
 */
export class DimensionSourceChangeSubmission {
  readonly #dataSet: DataSet
  readonly #label: string
  readonly #assertCurrent: () => void
  #captured: readonly CapturedGroup[] | undefined
  #unknown: Error | undefined

  constructor(dataSet: DataSet, label: string, assertCurrent: () => void) {
    this.#dataSet = dataSet
    this.#label = label
    this.#assertCurrent = assertCurrent
  }

  /** 存在保存结果未知的提交。 */
  get unknown(): boolean { return this.#unknown !== undefined }

  assertSettled(): void {
    if (this.#unknown) throw new Error(`存在保存结果未知的${this.#label}提交，请先重试保存核验`)
  }

  /** 捕获各视图的待提交行；返回是否存在修改。 */
  capture(targets: readonly DimensionSourceCommitTarget[]): boolean {
    this.assertSettled()
    const groups: CapturedGroup[] = []
    for (const {view, ids, kinds} of targets) {
      const changed = ids.filter(id => view.hasEditingChanges(id) || view.dirtyTracking.hasPendingChanges(id))
      if (!changed.length) continue
      groups.push({view, ids: changed, kinds, rows: changed.map((id): CapturedRow => {
        if (view.dirtyTracking.pendingDeleteIds.has(id)) return {id, action: 'deleted', values: {}}
        const row = view.getEditingRow(id)
        if (!row) throw new Error(`待保存${this.#label}行已不存在`)
        return {id, action: view.dirtyTracking.isPendingCreate(id) ? 'added' : 'changed',
          values: Object.fromEntries(Object.entries(kinds).map(([field, kind]) => [field, normalized(kind, row[field])]))}
      })})
    }
    this.#captured = groups
    return groups.length > 0
  }

  /** 提交已捕获的修改并回读逐字段核验；没有捕获时返回 false。 */
  async submit(): Promise<boolean> {
    const groups = this.#captured
    if (!groups?.length) return false
    try {
      const response = await this.#dataSet.saveChanges({views: groups.map(group => ({tableName: group.view.tableName, viewId: group.view.viewId, ids: [...group.ids]}))})
      this.#assertCurrent()
      if (!response.data) throw new Error(response.error?.message ?? response.message ?? `${this.#label}保存缺少回执`)
      const complete = groups.every(group => {
        const receipt = response.data?.viewResults.find(item => item.tableName === group.view.tableName && item.viewId === group.view.viewId)
        const counted = (action: SaveAction) => group.rows.filter(row => row.action === action).length
        return receipt?.failedCount === 0 && receipt.failedEditingRows === 0
          && receipt.createdCount === counted('added') && receipt.savedCount === counted('changed') && receipt.deletedCount === counted('deleted')
      })
      if (!response.success || !complete) throw new Error(response.error?.message ?? response.message ?? `${this.#label}保存未全部确认`)
      this.#unknown = undefined
    } catch (cause) {
      if (cause instanceof Error && groups.some(group => group.view.hasUnconfirmedSaveFor(group.ids, cause))) {
        this.#unknown = cause
        throw new Error(`${cause.message}；${this.#label}保存结果未知，请重试“保存”核验原提交，不会以新身份重新提交`)
      }
      this.#unknown = undefined
      this.#captured = undefined
      throw cause
    }
    this.#captured = undefined
    await this.#readback(groups)
    return true
  }

  async #readback(groups: readonly CapturedGroup[]): Promise<void> {
    const mismatch = (detail: string) => new Error(`${this.#label}已提交，但回读核验失败：${detail}`)
    for (const view of new Set(groups.map(group => group.view))) {
      if (view.hasPendingSavedRowPermissions) await view.refreshSavedRowPermissions()
      await refreshView(view, this.#assertCurrent)
    }
    for (const group of groups) for (const expected of group.rows) {
      const row = group.view.rows.find(item => group.view.getPkKey(item) === expected.id)
      if (expected.action === 'deleted') {
        if (row) throw mismatch(`已删除记录 ${String(expected.id)} 仍存在`)
        continue
      }
      if (!row) throw mismatch(`记录 ${String(expected.id)} 未回读`)
      for (const [field, value] of Object.entries(expected.values)) {
        assertReadable(group.view, row, [field])
        const kind = group.kinds[field]
        if (!kind || normalized(kind, row[field]) !== value) throw mismatch(`记录 ${String(expected.id)} 的 ${field}`)
      }
    }
  }
}
