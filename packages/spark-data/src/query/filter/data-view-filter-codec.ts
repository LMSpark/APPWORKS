/**
 * @module @spark-appworks/spark-data:query/filter/data-view-filter-codec
 * 职责：转换公开过滤树与 SPARK 协议树。
 * 边界：完整校验全部子项与值函数，拒绝循环和残缺条件。
 * AI用途：在 API 边界保留显式空值并转换运算符。
 */
import { DataViewFilter } from './data-view-filter'
import type { DataViewFilterTree, DataViewFilterValueFunction } from './data-view-filter-contract'

const wireOperators = {
  eq: 'equal', ne: 'notequal', gt: 'greaterthan', gte: 'greaterthanorequal',
  lt: 'lessthan', lte: 'lessthanorequal', 'is-null': 'isnull', 'is-not-null': 'isnotnull',
  contains: 'contains', 'not-contains': 'nolike', 'starts-with': 'startswith',
  'not-starts-with': 'nostartswith', 'ends-with': 'endswith', 'not-ends-with': 'notendswith',
  in: 'in', 'not-in': 'notin', 'is-empty': 'isempty', 'is-not-empty': 'isnotempty',
} as const

/** SPARK保存和请求使用的过滤格式；由数据层统一转换。 */
export type DataViewFilterWire = Readonly<{
  Type: 'cond'; Field: string; Operator: typeof wireOperators[keyof typeof wireOperators]; Value: null; ValueFun: DataViewFilterValueFunction
}> | Readonly<{ Type: 'and' | 'or'; Filters: readonly DataViewFilterWire[] }>

function encodeTree(tree: DataViewFilterTree): DataViewFilterWire {
  if ('logic' in tree) return { Type: tree.logic, Filters: tree.filters.map(encodeTree) }
  const value = tree.value
  const valueFunction = value !== null && typeof value === 'object' && !Array.isArray(value)
    && 'Type' in value && typeof value['Type'] === 'string'
    ? { ...value, Type: value['Type'] }
    : { Type: 'GetConstValue', Value: value === undefined ? null : value }
  return { Type: 'cond', Field: tree.field, Operator: wireOperators[tree.operator], Value: null, ValueFun: valueFunction }
}

/** 只接收已验证的公开过滤树。 */
function encodeFilter(filter: DataViewFilter): DataViewFilterWire {
  return encodeTree(filter.toJSON())
}

type FilterDecodeContext = { path: string; ancestors: Set<object> }

function isWireRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function decodeTree(input: unknown, context: FilterDecodeContext): unknown {
  if (!isWireRecord(input)) throw new Error(`${context.path}: 过滤定义必须是 wire 节点对象`)
  if (context.ancestors.has(input)) throw new Error(`${context.path}: 过滤定义包含循环引用`)
  context.ancestors.add(input)
  try {
    if (input['Type'] === 'and' || input['Type'] === 'or') {
      const filters = input['Filters']
      if (!Array.isArray(filters)) throw new Error(`${context.path}.Filters: 必须是数组`)
      const children: unknown[] = []
      for (let index = 0; index < filters.length; index += 1) {
        children.push(decodeTree(filters[index], { path: `${context.path}.Filters[${index}]`, ancestors: context.ancestors }))
      }
      return { logic: input['Type'], filters: children }
    }
    if (input['Type'] !== 'cond') throw new Error(`${context.path}.Type: 不支持的 wire 节点类型`)
    const entry = Object.entries(wireOperators).find(([, wire]) => wire === input['Operator'])
    if (!entry) throw new Error(`${context.path}.Operator: 不支持的 wire 运算符`)
    const valueFunction = input['ValueFun']
    if (!isWireRecord(valueFunction) || typeof valueFunction['Type'] !== 'string' || !valueFunction['Type'].trim()) {
      throw new Error(`${context.path}.ValueFun: 缺少有效值函数`)
    }
    // ValueFun 是正式值来源，不以 Value 兜底修复损坏定义。
    const constant = valueFunction['Value']
    const canUnwrap = valueFunction['Type'] === 'GetConstValue'
      && Object.keys(valueFunction).every(key => key === 'Type' || key === 'Value')
      && !(isWireRecord(constant) && 'Type' in constant)
    return { field: input['Field'], operator: entry[0], value: canUnwrap ? constant : valueFunction }
  } finally {
    context.ancestors.delete(input)
  }
}

/** 后端正式过滤定义进入公开合同的唯一转换；失败显式抛错，不代表清空。 */
function decodeFilter(input: unknown): DataViewFilter {
  let source = input
  if (typeof input === 'string') {
    try { source = JSON.parse(input) } catch { throw new Error('$: 过滤定义不是有效 JSON') }
  }
  const result = DataViewFilter.parse(decodeTree(source, { path: '$', ancestors: new Set() }))
  if (!result.ok) throw new Error(result.issues.map(item => `${item.path}: ${item.message}`).join('\n'))
  return result.value
}

/** 统一SPARK过滤定义与原生树的边界；不请求网络、不求值后端函数。 */
export class DataViewFilterCodec {
  /** 将已校验原生树编码为SPARK格式，保留值函数完整JSON载荷。 */
  public static encode(filter: DataViewFilter): DataViewFilterWire { return encodeFilter(filter) }

  /** 完整解码；任何坏节点都拒绝整树，不将失败当成清空。 */
  public static decode(input: unknown): DataViewFilter { return decodeFilter(input) }

  /** 数据库过滤字段的读取边界；只有缺省或空白文本表示未配置。 */
  public static parseStored(serialized: string | null | undefined): DataViewFilter | undefined {
    if (serialized === null || serialized === undefined || serialized.trim() === '') return undefined
    return this.decode(serialized)
  }

  /** 数据库过滤字段的保存边界；显式清空编码为空字符串。 */
  public static serializeStored(filter: DataViewFilter | undefined): string {
    return filter === undefined ? '' : JSON.stringify(this.encode(filter))
  }
}
