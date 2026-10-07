/**
 * @module @spark-appworks/spark-component:components/fields/data-components/choice/FieldCheckboxGroup/FieldCheckboxGroup.props
 * 职责：定义 FieldCheckboxGroup（r-checkbox-group）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 field-level/data-field 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 field checkbox group 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkButtonOptionFieldProps, SparkNodeProps } from '../../../../shared-types'

/** Checkbox Group Multi Value 的语义模型。 */
export type CheckboxGroupMultiValue = Array<string | number | boolean>

/** RCheckbox Group Props 的属性契约。 */
export type RCheckboxGroupProps = SparkNodeProps & SparkButtonOptionFieldProps<CheckboxGroupMultiValue>
