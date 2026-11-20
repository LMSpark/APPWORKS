/**
 * @module @spark-appworks/spark-component:components/fields/options/option-normalization
 * 职责：维护 @spark-appworks/spark-component 中 components/fields/options/option-normalization 的模块能力，围绕 FieldOption、NormalizeOptionFields 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/fields/options/option-normalization 的声明、导出和使用边界时，从本模块开始。
 */
// 这里不再为 JS 基础类型保留导出别名，选项值直接使用原生联合类型。

import { isRecord } from '@spark-appworks/spark-utils'

/** Field Option 的语义模型。 */
export type FieldOption = {
    /** 展示标签。 */
label: string
    /** 当前值。 */
value: string | number | boolean
    /** 是否禁用。 */
disabled?: boolean
    /** 子节点集合。 */
children?: FieldOption[]}

/** Normalize Option Fields 的语义模型。 */
export type NormalizeOptionFields = {
    /** label Field 字段。 */
labelField: string
    /** value Field 字段。 */
valueField: string
    /** children Field 字段。 */
childrenField: string
    /** disabled Field 字段。 */
disabledField: string}

function isFieldOptionValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

export function normalizeOption(
  raw: unknown,
  fields: NormalizeOptionFields,
): FieldOption | null {
  const { labelField, valueField, childrenField, disabledField } = fields
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    return { label: String(raw), value: raw }
  }
  if (!isRecord(raw)) return null

  const label = raw[labelField] ?? raw['label'] ?? raw['text'] ?? raw['name'] ?? raw[valueField] ?? raw['value']
  const value = raw[valueField] ?? raw['value'] ?? raw['id'] ?? raw['code'] ?? label
  if (label === undefined || !isFieldOptionValue(value)) return null

  const rawChildren = raw[childrenField] ?? raw['children'] ?? raw['items'] ?? raw['nodes']
  const children = Array.isArray(rawChildren)
    ? rawChildren
      .map(item => normalizeOption(item, fields))
      .filter((item): item is FieldOption => item !== null)
    : []

  const rawDisabled = raw[disabledField] ?? raw['disabled']

  const option: FieldOption = {
    label: String(label),
    value,
    disabled: rawDisabled === true,
  }

  if (children.length > 0) {
    option.children = children
  }

  return option
}

export function normalizeMultiValue(value: unknown, separator = ','): Array<string | number | boolean> {
  if (Array.isArray(value)) return value.filter(isFieldOptionValue)
  if (typeof value === 'string') {
    if (!value.trim()) return []
    if (separator === '') return [value]
    return value.split(separator).map(item => item.trim())
  }
  if (value === null || value === undefined || value === '') return []
  return isFieldOptionValue(value) ? [value] : []
}

export function flattenOptions(source: FieldOption[]): FieldOption[] {
  const result: FieldOption[] = []
  for (const option of source) {
    result.push(option)
    if (option.children && option.children.length > 0) {
      result.push(...flattenOptions(option.children))
    }
  }
  return result
}
