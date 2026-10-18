/**
 * @module app:lowcode/data-space/model-source/lowcode-data-space-source-catalog
 * 职责：六类正式来源的输出字段合同及当前候选取值。
 * 边界：只消费正式DataView和当次字段权限，不查询、不缓存候选、不保存定义。
 * AI用途：来源选择器以配置绑定真实字段，确认后交原owner精确重读。
 */
import {RequestState, type DataSet, type DataView, type DataRow} from '@spark-appworks/spark-data'
export type PageDataSpaceModelSourceType = 'table' | 'dict' | 'interface' | 'json' | 'logicView' | 'databaseView'
export type PageDataSpaceModelSource = Readonly<{
  type: PageDataSpaceModelSourceType; id: string; name: string; description: string
  dbid: string; databaseName: string; providerId: string
}>
export type PageDataSpaceModelSourceQuery = Readonly<{
  type: PageDataSpaceModelSourceType; keyword?: string; description?: string
  databaseName?: string; page?: number; pageSize?: number
}>
export type PageDataSpaceModelSourceField = Readonly<{
  type: 'dataModel' | 'inputParams'; Name: string; description: string; FieldType: string
  IsPKey: number; IsOutput: number; AsName: string; ValueFun: string
  Expression: string; allowAIAdd: number; OrderType: string; Order: number; Group: number
}>
export type PageDataSpaceModelSourcePrepared = Readonly<{
  source: PageDataSpaceModelSource
  model: Readonly<{ Type: string; MetaName: string; description: string; DbId: string; DbName: string;
    JoinType: string; ForeignKeyFields: string; JoinFilter: string; PId: string }>
  fields: readonly PageDataSpaceModelSourceField[]
}>
export type PageDataSpaceModelSourceReader = Readonly<{
  query(input: PageDataSpaceModelSourceQuery, dataSet: DataSet): Promise<Readonly<{rows: readonly PageDataSpaceModelSource[]; total: number}>>
  prepare(source: PageDataSpaceModelSource, dataSet: DataSet): Promise<PageDataSpaceModelSourcePrepared>
}>
/** 正式来源的输出字段映射，不重新定义来源模型。 */
type SourceConfig = Readonly<{
  /** 正式模型名称。 */
  metaName: string
  /** 来源类型显示名。 */
  label: string
  /** 来源名称输出字段。 */
  name: string
  /** 说明输出字段；未声明时不提供说明筛选。 */
  description?: string
  /** 数据库身份输出字段。 */
  dbid?: string
  /** 数据库显示名输出字段。 */
  databaseName?: string
  /** 接口提供方身份输出字段。 */
  providerId?: string
}>
/** 按本次查询权限读取一个来源字段的输入。 */
type VisibleField = Readonly<{
  /** 持有本次查询及权限的视图。 */
  context: DataView
  /** 本次查询中的原始候选行。 */
  row: DataRow
  /** 正式输出字段名。 */
  fieldName: string
  /** 仅展示字段不可读时返回空文本，必要身份不可使用此选项。 */
  optionalPresentation?: boolean
}>
const sourceConfigs: Record<PageDataSpaceModelSourceType, SourceConfig> = {
  table: { metaName: 'View_TblList', label: '数据库表', name: 'tblname', description: 'tbldesc', dbid: 'dbid', databaseName: 'DbName' },
  dict: { metaName: '_Base_DictType', label: '字典', name: 'TypeName', description: 'functiondesc' },
  interface: { metaName: 'Base_DataServiceInterface', label: '接口', name: 'Name', description: 'Desc', providerId: 'ProviderID' },
  json: { metaName: 'Base_JsonData', label: 'JSON', name: 'name' },
  logicView: { metaName: 'Base_DataViewList', label: '视图', name: 'name' },
  databaseView: { metaName: 'View_ViewList', label: '数据库视图', name: 'vewname', description: 'vewdesc', dbid: 'dbid', databaseName: 'DbName' },
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    throw new Error('模型来源字段不是标量值')
  }
  return String(value).trim()
}

function visible({context, row, fieldName, optionalPresentation}: VisibleField): string {
  if (context.fieldAccess(row, fieldName).read !== 'visible') {
    if (!optionalPresentation) throw new Error(`模型来源字段 ${fieldName} 不可读`)
    return ''
  }
  return scalar(row[fieldName])
}


/** 正式来源合同目录，与精确读取共用。 */
export class LowcodeDataSpaceSourceCatalog {
  /** 来源类型目录；控件值保持正式枚举。 */
  static readonly types = Object.freeze(Object.entries(sourceConfigs).map(([value, spec]) => ({value: value as PageDataSpaceModelSourceType, label: spec.label})))
  /** 校验来源类型并返回既有模型字段映射。 */
  static config(type: PageDataSpaceModelSourceType): SourceConfig {
    const value = Object.hasOwn(sourceConfigs, type) ? sourceConfigs[type] : undefined
    if (!value) throw new Error('模型来源类型不受支持')
    return value
  }
  /** 当前查询行转换为来源身份；隐藏的必要字段明确拒绝。 */
  static source(type: PageDataSpaceModelSourceType, context: DataView,
  row: DataRow): PageDataSpaceModelSource {
  const spec = this.config(type)
  const id = visible({context, row, fieldName: 'rowid'})
  const name = visible({context, row, fieldName: spec.name})
  if (!id || !name) throw new Error('模型来源缺少稳定身份或名称')
  const dbid = spec.dbid ? visible({context, row, fieldName: spec.dbid}) : ''
  const databaseName = spec.databaseName ? visible({context, row, fieldName: spec.databaseName}) : ''
  const providerId = spec.providerId ? visible({context, row, fieldName: spec.providerId}) : ''
  return Object.freeze({ type, id, name, description: spec.description ? visible({context, row, fieldName: spec.description, optionalPresentation: true}) : '',
    dbid, databaseName, providerId })
}

  /** 以列表的唯一选择值确认来源，不以指针行取代选择；不复用旧查询或隐藏身份。 */
  static selected(type: PageDataSpaceModelSourceType, view: DataView): PageDataSpaceModelSource {
    if (view.destroyed || view.dataSet?.destroyed || view.requestState !== RequestState.Loaded
      || view.dataTable?.modelBinding?.modelName !== this.config(type).metaName
      || view.dataTable.getView(view.viewId) !== view) throw new Error('来源候选已失效，请重新选择')
    const values = view.getSelectedValues(), row = view.selectedRows[0]
    if (values.length !== 1 || !row) throw new Error('请在来源列表选择一个模型')
    return this.source(type, view, row)
  }
}
