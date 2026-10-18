/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/data-space
 * 职责：保留后端资源类型及关系记录合同，供正式元数据读取与存储适配使用。
 * 边界：页面模型、列与视图归SPARK data；此处不建立另一套可编辑模型实体。
 */
/** 数据资源 wire 类型；仅 table/view 可在设计态解析稳定目录身份。 */
export type DataSpaceResourceType = 'table' | 'view' | 'dictionary' | 'interface' | 'json' | 'file'

/** 目录可解析的物理资源子集。 */
export type DataSpaceDatabaseResourceType = Extract<DataSpaceResourceType, 'table' | 'view'>

/** lowcode Base_DataModel_Relation 的只读原始合同。 */
export type LowcodeModelRelationRecord = Readonly<{
  sourceRelationId: string
  dataSpaceId: string
  parentModelId: string
  childModelId: string
  parentResourceName: string
  childResourceName: string
  filterExpression: string
  dependencyType: string
  cascadeDelete: boolean
}>
