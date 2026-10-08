/**
 * @module @spark-appworks/spark-data:query/filter/data-view-filter-contract
 * 职责：声明公开过滤树与值函数编辑契约。
 * 边界：树数据不含后端协议字段，编辑目录不授权函数执行。
 * AI用途：生成字段条件、逻辑组和编辑校验上下文。
 */
import type { DATA_VIEW_FILTER_OPERATORS } from './data-view-filter-catalog'

/** 公开过滤树的运算符；取自统一目录，不使用后端协议缩写。 */
export type DataViewFilterOperator = typeof DATA_VIEW_FILTER_OPERATORS[number]
/** 过滤值的递归 JSON 数据；解析拒绝非有限数、循环与数组空洞。 */
export type DataViewFilterJsonValue = null | boolean | number | string
  | readonly DataViewFilterJsonValue[] | DataViewFilterJsonObject
/** 过滤值对象；保留值函数扩展字段的原始 JSON 值。 */
export type DataViewFilterJsonObject = { readonly [key: string]: DataViewFilterJsonValue }

/** 字段条件；一元运算省略 value，其余运算要求显式值并保留空值。 */
export type DataViewFilterCondition = Readonly<{
  field: string
  operator: DataViewFilterOperator
  value?: DataViewFilterJsonValue
}>
/** and/or 条件组；子项继续使用同一公开过滤树，空组仍是合法结构。 */
export type DataViewFilterGroup = Readonly<{
  logic: 'and' | 'or'
  filters: readonly DataViewFilterTree[]
}>
/** 公开过滤树只由字段条件或逻辑组组成，不混入协议 Type/Filters。 */
export type DataViewFilterTree = DataViewFilterCondition | DataViewFilterGroup
/** 过滤解析或编辑校验的问题；path 指向原树中的出错位置。 */
export type DataViewFilterIssue = Readonly<{
  code: 'invalid-json' | 'invalid-node' | 'invalid-operator' | 'field-required'
    | 'value-required' | 'invalid-value-function' | 'invalid-value' | 'cycle'
    | 'unknown-field' | 'operator-not-allowed' | 'max-depth' | 'max-rules'
  path: string
  message: string
}>
/** 编辑校验使用的字段类型与运算符集合；显式空集合不采用默认目录。 */
export type DataViewFilterField = Readonly<{
  name: string
  type: 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'select'
  operators?: readonly DataViewFilterOperator[]
}>
/** 已有过滤树的编辑校验边界，提供字段与深度、条件数限制。 */
export type DataViewFilterValidationContext = Readonly<{
  fields: readonly DataViewFilterField[]
  maxDepth?: number
  maxRules?: number
  /** 仅编辑校验使用；未提供时不把编辑器目录当作后端函数白名单。 */
  valueFunctions?: DataViewFilterFunctionContext
}>

/** 以 Type 标识的值函数数据；函数实际求值由执行端负责。 */
export type DataViewFilterValueFunction = DataViewFilterJsonObject & Readonly<{ Type: string }>
/** 值函数编辑器的可选值及禁用状态。 */
export type DataViewFilterValueOption = Readonly<{
  label: string
  value: string | number | boolean
  disabled?: boolean
}>
/** 值函数编辑器可引用的表字段名称及显示标签。 */
export type DataViewFilterFunctionTableField = Readonly<{ name: string; label?: string }>
/** 值函数编辑器的表与字段目录，不代表查询结果或物理表绑定。 */
export type DataViewFilterFunctionTable = Readonly<{
  name: string
  label?: string
  fields?: readonly DataViewFilterFunctionTableField[]
}>
/** 按流程模型 ID 分组的节点选项，供值函数字段选择。 */
export type DataViewFilterFlowNodeOptions = Readonly<Record<string, readonly DataViewFilterValueOption[]>>
/** 控制扩展值函数编辑入口的能力标识，不授予后端执行权限。 */
export type DataViewFilterFunctionCapability = 'huoshan' | 'api-account' | 'coze-auth'
/** 值函数编辑目录与扩展定义；不作为后端函数白名单。 */
export type DataViewFilterFunctionContext = Readonly<{
  tables?: readonly DataViewFilterFunctionTable[]
  relatedFields?: readonly DataViewFilterValueOption[]
  systemParams?: readonly DataViewFilterValueOption[]
  groupValueTypes?: readonly DataViewFilterValueOption[]
  apiPublicParams?: readonly DataViewFilterValueOption[]
  inputParams?: readonly DataViewFilterValueOption[]
  apiAccounts?: readonly DataViewFilterValueOption[]
  roleClassItems?: readonly DataViewFilterValueOption[]
  capabilities?: readonly DataViewFilterFunctionCapability[]
  flowModelOptions?: readonly DataViewFilterValueOption[]
  flowNodeOptionsByModelId?: DataViewFilterFlowNodeOptions
  definitions?: readonly DataViewFilterFunctionDefinition[]
}>
/** 值函数字段的静态选项或依当前函数值计算的选项。 */
export type DataViewFilterFunctionOptions = readonly DataViewFilterValueOption[]
  | ((value: DataViewFilterValueFunction, context: DataViewFilterFunctionContext) => readonly DataViewFilterValueOption[])
/** 根据函数值和编辑上下文判定字段可见性的条件。 */
export type DataViewFilterFunctionPredicate = (value: DataViewFilterValueFunction, context: DataViewFilterFunctionContext) => boolean
/** 值函数编辑字段的控件、必填、选项与可见性声明。 */
export type DataViewFilterFunctionField = Readonly<{
  key: string
  label: string
  control?: 'text' | 'password' | 'textarea' | 'json' | 'select' | 'checkbox'
  required?: boolean
  multiple?: boolean
  options?: DataViewFilterFunctionOptions
  visible?: DataViewFilterFunctionPredicate
}>
/** 值函数编辑定义与校验器；只校验数据，不执行后端函数。 */
export type DataViewFilterFunctionDefinition = Readonly<{
  type: string
  label: string
  fields: readonly DataViewFilterFunctionField[]
  enabled?: (context: DataViewFilterFunctionContext) => boolean
  validate?: (value: DataViewFilterValueFunction, context: DataViewFilterFunctionContext) => string | null
}>
