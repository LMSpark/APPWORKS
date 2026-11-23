/**
 * @module @spark-appworks/spark-data:runtime-data-set-plan/types
 * 职责：定义后端独立 Dataset Plan 的 schemaVersion 1 JSON 合约。
 * 边界：文件只描述数据空间结构，不承载 rows、权限凭据、运行草稿或页面工具文件。
 * AI用途：生成或验证 `{scenarioId}.dataset.json` 时，沿此唯一文件合同读写。
 */
import type { DataViewFieldCascade } from '../types'

export const RUNTIME_DATA_SET_PLAN_SCHEMA_VERSION = 1 as const
export const RUNTIME_DATA_SET_PLAN_KIND = 'spark.runtimeDataSetPlan' as const

/** 依赖值为空时的查询策略，与 reference Dataset Plan 文件一致。 */
export type RuntimeDataSetPlanDependencyEmptyValueMode = 'emptyResult' | 'omit' | 'asNull'

/** 一个 DataView Filter GetDependValue 到源视图字段的正式依赖。 */
export type RuntimeDataSetPlanDependency = Readonly<{
  /** Filter ValueFun.DependKey。 */
  dependKey: string
  /** 上游 DataView ID。 */
  sourceDataViewId: string
  /** 上游模型正式 ID。 */
  sourceModelId: string
  /** 上游 activeRows 中提供级联值的字段。 */
  sourceField: string
  /** 设计态人读名称。 */
  label: string
  /** 上游无可用值时的查询行为。 */
  emptyValueMode: RuntimeDataSetPlanDependencyEmptyValueMode
}>

/** Dataset 运行入参定义；运行时值不写入 Plan。 */
export type RuntimeDataSetPlanInputParam = Readonly<{
  /** 入参记录正式 ID。 */
  rowid: string
  /** 运行过滤中的 ParamName。 */
  name: string
  /** 设计态说明。 */
  description: string
  /** 是否业务入参。 */
  isBusParam: boolean
}>

/** Plan 中的正式模型投影；物理查询与写回 owner 仍由 runtime metadata 绑定。 */
export type RuntimeDataSetPlanModel = Readonly<{
  /** Base_DataModel 正式 ID。 */
  id: string
  /** 查询使用的模型注册名。 */
  metaName: string
  /** 业务展示名。 */
  name: string
  /** 模型说明。 */
  description: string
  /** 正式资源来源类型。 */
  sourceType: string
  /** 是否业务主模型。 */
  isBusinessMain: boolean
  /** 是否业务模型。 */
  isBusiness: boolean
  /** 默认输出类型。 */
  outputType: string
  /** 模型固定过滤 JSON。 */
  filter: string
  /** 自引用父字段。 */
  parentField: string
  /** 自引用是否有子节点字段。 */
  hasChildField: string
  /** 自引用方向。 */
  selfType: string
  /** 自引用根值。 */
  topValue: string
  /** 后端缓存策略。 */
  cacheType: string
  /** 连接来源配置。 */
  join: Readonly<{
    /** 连接类型。 */
    joinType: string
    /** 外键字段集合。 */
    foreignKeyFields: string
    /** 连接过滤 JSON。 */
    joinFilter: string
    /** 连接主体 ID。 */
    pId: string
  }>
  /** 后端 CRUD API 名称。 */
  crud: Readonly<{
    /** 新增 API。 */
    addApi: string
    /** 更新 API。 */
    updateApi: string
    /** 删除 API。 */
    deleteApi: string
  }>
}>

/** Plan 中单个正式模型字段投影。 */
export type RuntimeDataSetPlanModelField = Readonly<{
  /** Base_DataModel_Field 正式 ID。 */
  id: string
  /** 所属模型 ID。 */
  dataModelId: string
  /** 字段记录类别，Plan 只接受 dataModel。 */
  type: string
  /** 正式字段名。 */
  name: string
  /** 字段说明。 */
  description: string
  /** 字段类型。 */
  fieldType: string
  /** 是否为正式输出。 */
  isOutput: boolean
  /** 输出别名。 */
  asName: string
  /** 默认排序方向。 */
  orderType: string
  /** 字段顺序。 */
  order: number
  /** 分组顺序。 */
  group: number
  /** 是否声明为主键；运行时仍须与正式 metadata 对账。 */
  isPKey: boolean
}>

/** Plan 中单个命名 DataView 的查询与依赖配置。 */
export type RuntimeDataSetPlanView = Readonly<{
  /** 命名 DataView 正式 ID。 */
  id: string
  /** 设计态代码。 */
  code: string
  /** 视图名称。 */
  name: string
  /** 视图说明。 */
  description: string
  /** 所属模型 ID。 */
  dataModelId: string
  /** 是否模型默认视图。 */
  isDefault: boolean
  /** 查询输出类型。 */
  outputType: string
  /** 后端 Filter JSON；GetDependValue 由 spark-data 物化。 */
  filter: string
  /** 当前视图的源字段依赖。 */
  dependencies: readonly RuntimeDataSetPlanDependency[]
  /** 树查询父字段。 */
  parentField: string
  /** 树查询子节点标记字段。 */
  hasChildField: string
  /** 树查询类型。 */
  selfType: string
  /** 树查询根值。 */
  topValue: string
  /** 视图缓存策略。 */
  cacheType: string
  /** 查询分页模式；缺省兼容既有 paged Plan。 */
  pagination: 'paged' | 'none'
  /** 是否逐页读取完整后端集合。 */
  allPages: boolean
  /** 初始页码；非分页视图忽略。 */
  page: number
  /** 每页行数；非分页视图忽略。 */
  pageSize: number
}>

/** 视图字段的人读显示策略；map 只影响呈现，不参与查询级联。 */
export type RuntimeDataSetPlanViewFieldDisplay = Readonly<{
  /** text 原值或 map 参照呈现。 */
  kind: 'text' | 'map'
  /** map 使用的来源 DataView ID。 */
  fromDataViewId: string
  /** map 值字段。 */
  valueField: string
  /** map 标签字段。 */
  labelField: string
}>

/** 命名 DataView 的字段投影与显示合同。 */
export type RuntimeDataSetPlanViewField = Readonly<{
  /** 视图字段正式 ID。 */
  id: string
  /** 所属命名 DataView ID。 */
  dataViewId: string
  /** 所属模型 ID。 */
  dataModelId: string
  /** 正式字段名。 */
  name: string
  /** 字段说明。 */
  description: string
  /** 字段类型。 */
  fieldType: string
  /** 该视图是否输出。 */
  isOutput: boolean
  /** 该视图输出别名。 */
  asName: string
  /** 排序方向。 */
  orderType: string
  /** 模型级字段顺序。 */
  order: number
  /** 分组顺序。 */
  group: number
  /** 视图投影顺序。 */
  sort: number
  /** 是否声明主键；运行时使用正式 metadata 的结果。 */
  isPKey: boolean
  /** 列表显示配置。 */
  display: RuntimeDataSetPlanViewFieldDisplay
  /** 值来源，model 或 dependency。 */
  valueSource: 'model' | 'dependency'
  /** 旧依赖来源视图 ID。 */
  sourceDataViewId: string
  /** 旧依赖来源模型 ID。 */
  sourceModelId: string
  /** 旧依赖来源字段。 */
  sourceField: string
}>

/** 后端正式模型关系；结构关系与运行级联依赖分别保存。 */
export type RuntimeDataSetPlanRelation = Readonly<{
  /** Base_DataModel_Relation 正式 ID。 */
  id: string
  /** 父模型正式 ID。 */
  parentModelId: string
  /** 子模型正式 ID。 */
  childModelId: string
  /** 关系依赖类型。 */
  depType: string
  /** 完整过滤表达式 JSON。 */
  filter: string
  /** 是否声明删除级联。 */
  cascadeDel: boolean
  /** 子模型注册名。 */
  childTable: string
  /** 父模型注册名。 */
  parentTable: string
}>

/** 后端生成的独立 Runtime Dataset Plan 根合同。 */
export type RuntimeDataSetPlanFile = Readonly<{
  /** 独立 Plan schema 版本。 */
  schemaVersion: typeof RUNTIME_DATA_SET_PLAN_SCHEMA_VERSION
  /** 独立 Plan 文件类型。 */
  kind: typeof RUNTIME_DATA_SET_PLAN_KIND
  /** Base_DataSet.rowid。 */
  scenarioId: string
  /** 数据空间名称。 */
  name: string
  /** 数据空间说明。 */
  description: string
  /** 数据空间类型。 */
  type: string
  /** 后端生成时间。 */
  savedAt: string
  /** 后端稳定结构哈希。 */
  contentHash: string
  /** 文件导出来源。 */
  source: Readonly<{
    /** 原数据空间 ID。 */
    dataSetId: string
    /** 固定导出域。 */
    exportedFrom: 'data-space-design'
    /** 设计布局文件名；运行时不读取布局。 */
    graphFile: string
  }>
  /** 运行入参定义。 */
  inputParams: readonly RuntimeDataSetPlanInputParam[]
  /** 正式模型投影。 */
  models: readonly RuntimeDataSetPlanModel[]
  /** 模型字段投影。 */
  modelFields: readonly RuntimeDataSetPlanModelField[]
  /** 命名 DataView。 */
  views: readonly RuntimeDataSetPlanView[]
  /** DataView 字段投影。 */
  viewFields: readonly RuntimeDataSetPlanViewField[]
  /** 字段值输入级联；query 级联由 view.dependencies 编码。 */
  fieldCascades: readonly DataViewFieldCascade[]
  /** 稳定模型关系。 */
  relations: readonly RuntimeDataSetPlanRelation[]
  /** 设计关系边摘要，不替代 relations。 */
  linkage: Readonly<{
    /** 模型关系链接。 */
    edges: ReadonlyArray<Readonly<{
      /** 父模型 ID。 */
      parentModelId: string
      /** 子模型 ID。 */
      childModelId: string
      /** 关系类型。 */
      depType: string
      /** 过滤表达式。 */
      filter: string
      /** 固定运行触发方式。 */
      trigger: 'current'
    }>>
  }>
}>
