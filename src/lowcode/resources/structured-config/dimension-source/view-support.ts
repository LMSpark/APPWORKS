/**
 * @module app:lowcode/resources/structured-config/dimension-source/view-support
 * 职责：维度来源三类编辑器（来源绑定、数据模型事件、来源提交协议）共用的取值归一、7AB 候选视图解析与 DataSet 单次保存。
 * 边界：只组合 spark-data DataSet/DataView 公共 API；候选、回填、列规则与引用核验由场景 pagedata 声明，
 *   保存只经 DataSet.saveChanges，结果未知时再次保存只核验原捕获。
 * AI用途：新增维度来源编辑器时复用本模块，不在各编辑器复制候选表、配对写值或回执比较。
 */
import {buildDataViewKey, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY, LOWCODE_APPLICATION_CATALOG_FORM_KEY, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'

/** DataView 行主键身份（GUID 文本或数值）。 */
export type Id = string | number
/** 数据空间设计 API 返回的正式模型（含字段）。 */
export type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModels']>>[number]
/** 正式模型字段。 */
export type FormalField = FormalModel['fields'][number]
/** 快照比较时的字段归一类别。 */
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

/** 同一保存中的一个正式视图及本次提交的行。 */
export type DimensionSourceSaveTarget = Readonly<{view: DataView; ids: readonly Id[]}>
/** 一次维度来源保存：label 用于提示，assertCurrent 在保存回执后核验目标未切换。 */
export type DimensionSourceSave = Readonly<{dataSet: DataSet; targets: readonly DimensionSourceSaveTarget[]; label: string; assertCurrent: () => void}>

export function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim()
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
/** 同一 PageRuntime 中应用目录空间（7AB）的正式模型/字段候选视图。 */
export function catalogView(dataSet: DataSet, tableName: string, viewId: string): DataView {
  const view = dataSet.resolveOptionView({scope: LOWCODE_APPLICATION_CATALOG_FORM_KEY, tableName, viewId})
  if (!view) throw new Error(`蓝图运行时缺少应用目录候选视图 ${tableName}.${viewId}`)
  return view
}
/** 视图在所属 PageRuntime 中的完整绑定键。 */
export function viewKey(view: DataView): string {
  const scenarioId = view.dataSet?.scenarioId
  if (!scenarioId) throw new Error(`视图 ${view.tableName}.${view.viewId} 未装配到数据空间`)
  return buildDataViewKey(view.tableName, view.viewId, scenarioId)
}
/** 刷新视图结果；存在未保存或结果未知的修改时由 DataView 拒绝替换。 */
export async function refreshView(view: DataView, assertCurrent: () => void): Promise<void> {
  view.assertResultReplacementAllowed()
  await view.refresh()
  assertCurrent()
  if (view.loadingError) throw view.loadingError
}
/** 视图中呈现的行 ID，不含待删除行。 */
export function liveIds(view: DataView): readonly Id[] {
  return view.rows.flatMap(row => {
    const id = view.getPkKey(row)
    return id === undefined || view.dirtyTracking.pendingDeleteIds.has(id) ? [] : [id]
  })
}
/** 行存在编辑覆盖或待提交变更。 */
export function changed(view: DataView, id: Id): boolean {
  return view.hasEditingChanges(id) || view.dirtyTracking.hasPendingChanges(id)
}
/** 读取目标节点已保存数据空间的正式模型，供保存前的结构核验。 */
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

/**
 * 以一次 DataSet.saveChanges 提交各视图本次变更并刷新回读；没有变更返回 false。
 * 存在结果未知的原捕获时只提交这些视图，由 DataSet 核验原捕获，不以新身份重提。
 */
export async function saveDimensionSourceViews({dataSet, targets, label, assertCurrent}: DimensionSourceSave): Promise<boolean> {
  const recovering = targets.some(({view}) => view.hasUnconfirmedSave)
  const selected = targets.flatMap(({view, ids}) => {
    const pending = recovering ? (view.hasUnconfirmedSave ? ids : []) : ids.filter(id => changed(view, id))
    return pending.length ? [{view, ids: pending}] : []
  })
  if (!selected.length && !recovering) return false
  const unknownMessage = `${label}保存结果未知，请重试“保存”核验原提交，不会以新身份重新提交`
  const unknown = () => targets.some(({view}) => view.hasUnconfirmedSave)
  let result: Awaited<ReturnType<DataSet['saveChanges']>>
  try {
    result = await dataSet.saveChanges({views: selected.map(({view, ids}) => ({tableName: view.tableName, viewId: view.viewId, ids: [...ids]}))})
  } catch (cause) {
    if (!unknown()) throw cause
    throw new Error(`${cause instanceof Error ? cause.message : String(cause)}；${unknownMessage}`)
  }
  assertCurrent()
  if (!result.success) {
    const message = result.error?.message ?? result.message ?? `${label}保存失败`
    throw new Error(unknown() ? `${message}；${unknownMessage}` : message)
  }
  if (unknown()) throw new Error(unknownMessage)
  for (const view of new Set(targets.map(target => target.view))) await refreshView(view, assertCurrent)
  return true
}
