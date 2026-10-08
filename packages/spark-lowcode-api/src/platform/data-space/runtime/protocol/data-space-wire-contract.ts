/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/protocol/data-space-wire-contract
 * 职责：声明 SPARK 查询封包的协议字段。
 * 边界：只供协议转换使用，不替代公开过滤树和场景模型身份。
 * AI用途：核对 Table、ValueFun 与分页树参数的实际请求形状。
 */
import type { DataViewFilterJsonValue } from '@spark-appworks/spark-data'
import type { OrderType, WireFilterOperator } from '../../../../contracts/lowcode-wire-query'
import type { DataSpaceQueryOptions } from '../data-space-runtime-contract'

/** 协议值函数封包；Type 决定函数，JSON 扩展值原样传递。 */
type DataSpaceValueFunction = Readonly<{
  Type: string
  [key: string]: DataViewFilterJsonValue
}>

/** 后端查询字段描述；Name 与 AsName 区分请求名和输出名。 */
type DataSpaceWireQueryField = Readonly<{
  Name: string
  AsName?: string | null
  IsOutput: boolean
  Group?: number
  Expression?: string | null
  Order?: number
  OrderType?: OrderType | null
  ValueFun?: DataSpaceValueFunction | null
}>
/** 协议排序字段及顺序，OrderType 使用后端枚举。 */
type DataSpaceWireSort = Readonly<{ Field: string; OrderType: OrderType; Order: number }>
/** 协议输入参数的 Name/Value 封包。 */
type DataSpaceWireInput = Readonly<{ Name: string; Value: unknown }>
/** 已规范化的树查询协议参数，明确节点、关系字段与方向。 */
type DataSpaceWireTree = Readonly<{
  keyField: string; parentField: string; nodeid: string; hasChildField: string; type: 'child' | 'parent'
}>

/** 已转换的内部查询选项，供查询表组装 SPARK 封包。 */
export type DataSpaceWireQueryOptions = Readonly<{
  filter?: DataSpaceWireFilter
  sortFields?: readonly DataSpaceWireSort[]
  pageIndex?: number
  pageSize?: number
  allPages?: boolean
  maxRows?: number
  outputType?: string
  outputFieldMode?: DataSpaceQueryOptions['outputFieldMode']
  tree?: DataSpaceWireTree
  fields?: readonly DataSpaceWireQueryField[]
  inputParams?: readonly DataSpaceWireInput[]
}>

/** 协议条件使用 ValueFun 且 Value 固定为 null；组以 Filters 递归组合。 */
export type DataSpaceWireFilter = Readonly<{
  Type: 'cond'
  Field: string
  Operator: WireFilterOperator
  Value: null
  ValueFun: DataSpaceValueFunction
}> | Readonly<{
  Type: 'and' | 'or'
  Filters: readonly DataSpaceWireFilter[]
}>

/** 查询表内部描述对象，由模型身份与已转换选项构造。 */
type DataSpaceWireQueryDescriptor = Readonly<Record<string, unknown>>
/** 实际 GetData 请求体；场景身份由请求头 x-FormKey 携带。 */
export type DataSpaceWireQueryRequest = Readonly<{
  Table: readonly DataSpaceWireQueryDescriptor[]
  OutputFieldMode?: DataSpaceWireQueryOptions['outputFieldMode']
  PageParam?: Readonly<{ index: number; size: number }>
  keyField?: string
  parentField?: string
  nodeid?: string
  hasChildField?: string
  type?: 'child' | 'parent'
}>
