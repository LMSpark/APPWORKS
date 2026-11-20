/**
 * @module @spark-appworks/spark-data:query/sort-expression
 * 职责：提供按 DataColumn 类型解释 SortExpression 的纯行投影排序。
 * 边界：不查询、不修改行、不读取权限；消费者须先确认本次正式行对排序字段可读。
 * AI用途：在不改变 DataView 查询状态的临时投影中复用声明列类型和排序方向。
 */
import type {DataColumn, DataRow, SortExpression} from '../types'

type SortCriterion = Readonly<{
  field: string
  direction: 1 | -1
  type: string
}>

function isSortableColumnType(type: string): boolean {
  return ['number', 'int', 'integer', 'decimal', 'float', 'double', 'string', 'varchar', 'text', 'enum',
    'boolean', 'bool', 'date', 'datetime'].includes(type)
}

function compareValues(left: unknown, right: unknown, type: string): number {
  const leftEmpty = left === null || left === undefined
  const rightEmpty = right === null || right === undefined
  if (leftEmpty || rightEmpty) {
    if (leftEmpty && rightEmpty) return 0
    return leftEmpty ? -1 : 1
  }
  if (['number', 'int', 'integer', 'decimal', 'float', 'double'].includes(type)) {
    const leftNumber = typeof left === 'number' ? left : typeof left === 'string' && left.trim() !== '' ? Number(left) : Number.NaN
    const rightNumber = typeof right === 'number' ? right : typeof right === 'string' && right.trim() !== '' ? Number(right) : Number.NaN
    if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
      if (Number.isFinite(leftNumber)) return -1
      if (Number.isFinite(rightNumber)) return 1
      return 0
    }
    return leftNumber - rightNumber
  }
  if (['string', 'varchar', 'text', 'enum'].includes(type)) {
    if (typeof left !== 'string' || typeof right !== 'string') {
      return typeof left === 'string' ? -1 : typeof right === 'string' ? 1 : 0
    }
    return left.localeCompare(right)
  }
  if (['boolean', 'bool'].includes(type)) {
    if (typeof left !== 'boolean' || typeof right !== 'boolean') {
      return typeof left === 'boolean' ? -1 : typeof right === 'boolean' ? 1 : 0
    }
    return Number(left) - Number(right)
  }
  const leftDate = left instanceof Date ? left.getTime() : typeof left === 'string' ? Date.parse(left) : Number.NaN
  const rightDate = right instanceof Date ? right.getTime() : typeof right === 'string' ? Date.parse(right) : Number.NaN
  if (!Number.isFinite(leftDate) || !Number.isFinite(rightDate)) {
    if (Number.isFinite(leftDate)) return -1
    if (Number.isFinite(rightDate)) return 1
    return 0
  }
  return leftDate - rightDate
}

/**
 * Sorts a temporary row projection by declared columns without mutating the source rows or expression.
 * If a referenced column is missing or has an unknown type, the original row order is retained.
 * @param rows Rows from the current DataView projection.
 * @param columns Formal column metadata for type-aware comparison.
 * @param expression The DataView's existing sort expression.
 */
export function sortDataRowsByExpression(
  rows: readonly DataRow[],
  columns: readonly DataColumn[],
  expression: SortExpression,
): DataRow[] {
  const columnsByName = new Map(columns.map(column => [column.name, column]))
  const criteria: SortCriterion[] = []
  for (const sort of expression) {
    const column = columnsByName.get(sort.field)
    if (!column || !isSortableColumnType(column.type)) return [...rows]
    criteria.push({field: sort.field, direction: sort.direction === 'desc' ? -1 : 1, type: column.type})
  }
  if (criteria.length === 0) return [...rows]

  return rows.map((row, index) => ({row, index})).sort((left, right) => {
    for (const criterion of criteria) {
      const compared = compareValues(left.row[criterion.field], right.row[criterion.field], criterion.type)
      if (compared !== 0) return compared * criterion.direction
    }
    return left.index - right.index
  }).map(item => item.row)
}
