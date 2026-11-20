/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/protocol/data-space-value-function
 * 职责：解析模型字段保存的单个 SPARK ValueFun JSON 定义。
 * 边界：不处理过滤树 wire envelope，也不执行或筛选值函数类型。
 * AI用途：统一设计编辑与 DataView 投影对字段值函数的结构校验。
 */
import { DataViewFilter } from '@spark-appworks/spark-data'
import type { DataViewFilterValueFunction } from '@spark-appworks/spark-data'

/** 解析函数对象 JSON；上下文名称仅用于保留消费端原错误语义。 */
export function parseDataSpaceValueFunction(
  serialized: string,
  validationFieldName: string,
  displayFieldName = validationFieldName,
): DataViewFilterValueFunction {
  let value: unknown
  try { value = JSON.parse(serialized) } catch { throw new TypeError(`SPARK 字段 ${displayFieldName} ValueFun 不是有效 JSON`) }
  const parsed = DataViewFilter.parse({ field: validationFieldName, operator: 'eq', value })
  if (!parsed.ok) throw new TypeError(parsed.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n'))
  const tree = parsed.value.toJSON()
  const functionValue = 'field' in tree ? tree.value : undefined
  if (functionValue === null || typeof functionValue !== 'object' || Array.isArray(functionValue)
    || !('Type' in functionValue) || typeof functionValue['Type'] !== 'string') {
    throw new TypeError(`SPARK 字段 ${displayFieldName} ValueFun 缺少 Type`)
  }
  return { ...functionValue, Type: functionValue['Type'] }
}
