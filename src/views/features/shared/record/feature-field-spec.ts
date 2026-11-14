/**
 * @module app:views/features/shared/record/feature-field-spec
 * 职责：声明统一记录对话框的一个编辑字段（组件类型、候选来源、必填、只读与显示条件）。
 * 边界：只描述字段；跨记录约束由页面基于正式DataView结果判断并经对话框validate返回。
 */
import type {DataRow} from '@spark-appworks/spark-data'

export type FeatureFieldOption = Readonly<{value: string | number | boolean; label: string}>

/** when 返回 false 时隐藏；requiredWhen 和 readonlyWhen 按当前行判断，optionKey 指向同一PageRuntime的选项DataView。 */
export type FeatureFieldSpec = Readonly<{
  field: string
  label: string
  kind?: 'text' | 'textarea' | 'number' | 'select' | 'radio' | 'switch'
  options?: readonly FeatureFieldOption[]
  optionKey?: string
  labelFields?: string[]
  labelJoiner?: string
  placeholder?: string
  required?: boolean
  requiredWhen?: (row: Readonly<DataRow>) => boolean
  readonly?: boolean
  readonlyWhen?: (row: Readonly<DataRow>) => boolean
  when?: (row: Readonly<DataRow>) => boolean
}>

export function visibleFeatureFields(specs: readonly FeatureFieldSpec[], row: Readonly<DataRow> | undefined): readonly FeatureFieldSpec[] {
  return specs.filter(spec => !spec.when || (row !== undefined && spec.when(row)))
}

export function missingFeatureField(specs: readonly FeatureFieldSpec[], row: Readonly<DataRow>): FeatureFieldSpec | undefined {
  return visibleFeatureFields(specs, row).find(spec => {
    const value = row[spec.field]
    return spec.required && (!spec.requiredWhen || spec.requiredWhen(row))
      && (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))
  })
}
