/**
 * @module app:views/features/shared/record/feature-field-spec
 * 职责：声明统一记录对话框的一个编辑字段（组件类型、候选来源、必填、只读与显示条件）。
 * 边界：只描述字段；跨记录约束由页面基于正式DataView结果判断并经对话框validate返回。
 */
import type {DataRow} from '@spark-appworks/spark-data'

export type FeatureFieldOption = Readonly<{value: string | number | boolean; label: string}>

/** when 返回 false 时隐藏且不参与必填检查；optionKey 指向同一PageRuntime的选项DataView。 */
export type FeatureFieldSpec = Readonly<{
  field: string
  label: string
  kind?: 'text' | 'textarea' | 'number' | 'select' | 'radio' | 'switch'
  options?: readonly FeatureFieldOption[]
  optionKey?: string
  labelFields?: string[]
  required?: boolean
  readonly?: boolean
  when?: (row: Readonly<DataRow>) => boolean
}>
