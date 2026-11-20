/**
 * @module @spark-appworks/spark-data:query/filter/data-view-filter-local
 * 职责：对静态行执行公开过滤树。
 * 边界：仅支持常量与当前行字段函数，先检查整树再求值，不模拟服务端函数。
 * AI用途：在静态视图中执行受支持的本地过滤。
 */
import { isRecord } from '@spark-appworks/spark-utils'
import type { DataViewFilter } from './data-view-filter'
import type { DataViewFilterCondition, DataViewFilterJsonValue, DataViewFilterTree } from './data-view-filter-contract'

/** 静态过滤读取的业务行；字段值由当前行提供，不是后端函数结果。 */
type DataViewFilterLocalRow = Readonly<Record<string, unknown>>

function compare(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left ?? '').localeCompare(String(right ?? ''))
}

/** 静态视图只执行常量和当前行字段；先检查整树，禁止短路掩盖服务端函数。 */
export class DataViewFilterLocal {
  readonly #tree: DataViewFilterTree
  readonly #fields = new Set<string>()

  /** 捕获冻结过滤树并预检查全部节点；不支持的后端值函数立即失败。 */
  public constructor(filter: DataViewFilter) {
    this.#tree = filter.toJSON()
    this.inspect(this.#tree)
  }

  public validateFields(fields: ReadonlySet<string>): void {
    for (const field of this.#fields) {
      if (!fields.has(field)) throw new Error(`过滤表达式引用了不存在的字段 "${field}"`)
    }
  }

  public matches(row: DataViewFilterLocalRow): boolean { return this.matchNode(this.#tree, row) }

  private inspect(node: DataViewFilterTree): void {
    if ('logic' in node) {
      node.filters.forEach(child => this.inspect(child))
      return
    }
    this.#fields.add(node.field)
    const value = node.value
    if (!isRecord(value) || !('Type' in value)) return
    if (value['Type'] === 'GetConstValue') return
    if (value['Type'] === 'GetTableField' && typeof value['Field'] === 'string' && value['Field'].trim()) {
      this.#fields.add(value['Field'])
      return
    }
    throw new Error(`DATA_VIEW_FILTER_LOCAL_FUNCTION: 静态视图无法执行值函数 ${String(value['Type'])}`)
  }

  private value(input: DataViewFilterJsonValue | undefined, row: DataViewFilterLocalRow): unknown {
    if (!isRecord(input) || !('Type' in input)) return input
    if (input['Type'] === 'GetConstValue') return input['Value']
    const field = input['Field']
    if (typeof field !== 'string' || !Object.hasOwn(row, field)) {
      throw new Error(`过滤值表达式引用了不存在的字段 "${String(field)}"`)
    }
    return row[field]
  }

  private matchNode(node: DataViewFilterTree, row: DataViewFilterLocalRow): boolean {
    if ('logic' in node) {
      return node.logic === 'and'
        ? node.filters.every(child => this.matchNode(child, row))
        : node.filters.some(child => this.matchNode(child, row))
    }
    return this.matchCondition(node, row)
  }

  private matchCondition(node: DataViewFilterCondition, row: DataViewFilterLocalRow): boolean {
    const left = row[node.field]
    const right = this.value(node.value, row)
    const text = String(left ?? '')
    const needle = String(right ?? '')
    const includes = () => Array.isArray(left) ? left.includes(right) : text.includes(needle)
    const inValues = () => Array.isArray(right) && (Array.isArray(left)
      ? left.some(value => right.includes(value)) : right.includes(left))
    switch (node.operator) {
      case 'eq': return left === right
      case 'ne': return left !== right
      case 'gt': return compare(left, right) > 0
      case 'gte': return compare(left, right) >= 0
      case 'lt': return compare(left, right) < 0
      case 'lte': return compare(left, right) <= 0
      case 'is-null': return left === null || left === undefined
      case 'is-not-null': return left !== null && left !== undefined
      case 'is-empty': return left === ''
      case 'is-not-empty': return left !== null && left !== undefined && left !== ''
      case 'contains': return includes()
      case 'not-contains': return !includes()
      case 'starts-with': return text.startsWith(needle)
      case 'not-starts-with': return !text.startsWith(needle)
      case 'ends-with': return text.endsWith(needle)
      case 'not-ends-with': return !text.endsWith(needle)
      case 'in': return inValues()
      case 'not-in': return !inValues()
    }
  }
}
