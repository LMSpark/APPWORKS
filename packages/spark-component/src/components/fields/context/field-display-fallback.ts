/**
 * @module @spark-appworks/spark-component:components/fields/context/field-display-fallback
 * 职责：按 DataView 当前行字段读取权限解析只读文本的候选值。
 * 边界：只读取已绑定行的显式候选字段，不查询、不编辑、不保存，也不推导模型字段。
 * AI用途：需要字段展示回退时，从本模块确认每个候选值都经过当次 DataView 可读权限。
 */
import type { DataRow, DataView } from '@spark-appworks/spark-data'

/** 依顺序返回首个当前 DataView 允许读取且非空的候选字段值。 */
export function resolveReadableDisplayFallback(input: {
  view: Pick<DataView, 'fieldAccess'> | null | undefined
  row: DataRow
  fields: readonly string[]
}): string {
  const { view, row, fields } = input
  if (!view) return ''
  for (const field of fields) {
    if (!field || view.fieldAccess(row, field).read !== 'visible') continue
    const value = row[field]
    if (value === null || value === undefined || value === '') continue
    return String(value)
  }
  return ''
}
