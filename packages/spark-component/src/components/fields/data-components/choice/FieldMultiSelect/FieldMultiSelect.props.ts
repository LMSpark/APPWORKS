/**
 * @module @spark-appworks/spark-component:components/fields/data-components/choice/FieldMultiSelect/FieldMultiSelect.props
 * 职责：定义 FieldMultiSelect（r-multi-select）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 field-level/data-field 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 field multi select 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkNodeProps, SparkOptionFieldProps } from '../../../../shared-types'

/** 多选字段值数组；每一项是最终写入业务字段的候选值。 */
export type MultiValue = Array<string | number | boolean>

/** RMulti Select Props 的属性契约。 */
export type RMultiSelectProps = SparkNodeProps & SparkOptionFieldProps<MultiValue> & {
  /** 选中项较多时是否折叠标签。 */
    collapseTags?: boolean
    /** 折叠标签时是否在悬停中展示完整内容。 */
    collapseTagsTooltip?: boolean
    /** 折叠后最多显示的标签数量。 */
    maxCollapseTags?: number}
