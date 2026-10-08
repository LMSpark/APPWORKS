/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/data-space-runtime-contract
 * 职责：声明场景模型查询与请求执行域契约。
 * 边界：查询输入不携带结果权限，模型 Name 不等于物理资源名。
 * AI用途：构造过滤、排序、分页和显式树查询。
 */
import type { DataViewFilter, DataViewFilterJsonValue } from '@spark-appworks/spark-data'
import type { OrderType } from '../../../contracts/lowcode-wire-query'

/** 后端场景注册身份；metaName 是模型 Name，不是物理资源名。 */
export type DataSpaceQueryIdentity = Readonly<{ scenarioId: string; metaName: string }>

/** 请求层负责生成包含全部身份通道的 token；数据实体不解释应用、租户或会话。 */
export type DataSpaceRequestScope = Readonly<{
  token: string
  headers: Readonly<Record<string, string>>
}>

/** 显式分页参数；页码从 1 开始，页大小必须为正整数且不超过 1000。 */
export type DataSpaceQueryPage = Readonly<{ index: number; size: number }>
/** 显式树查询的键、父键和目标节点；字段由正式模型查询边界解析。 */
export type DataSpaceQueryTree = Readonly<{
  keyField: string
  parentField: string
  nodeId: string
  hasChildrenField?: string
  mode?: 'child' | 'parent'
}>
/** 查询字段的值函数数据，保留 Type 与 JSON 扩展字段交给后端。 */
type DataSpaceQueryValueFunction = Readonly<{ Type: string; [key: string]: DataViewFilterJsonValue }>
/** 查询字段投影；绑定正式模型的视图不得重定义其表达式或输出别名。 */
type DataSpaceQueryField = Readonly<{
  name: string
  alias?: string | null
  group?: number
  isOutput?: boolean
  expression?: string | null
  order?: number
  orderType?: OrderType | null
  valueFun?: DataSpaceQueryValueFunction | null
}>
/** 查询字段排序方向；字段名称在正式模型边界映射为请求字段。 */
type DataSpaceQuerySort = Readonly<{ field: string; direction: 'asc' | 'desc' }>
/** 传递给查询的具名输入值，不承载应用或租户身份。 */
type DataSpaceQueryInput = Readonly<{ name: string; value: unknown }>

/** 查询输入独立于结果权限；singleFlight 由请求生命周期所有者处理。 */
export type DataSpaceQueryOptions = Readonly<{
  filter?: DataViewFilter | null
  sort?: readonly DataSpaceQuerySort[]
  page?: DataSpaceQueryPage
  allPages?: boolean
  maxRows?: number
  tree?: DataSpaceQueryTree
  inputParams?: readonly DataSpaceQueryInput[]
  singleFlight?: boolean
  fields?: ReadonlyArray<string | DataSpaceQueryField>
  outputType?: string
}>
