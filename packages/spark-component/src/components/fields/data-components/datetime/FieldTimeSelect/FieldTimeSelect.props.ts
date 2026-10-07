/**
 * @module @spark-appworks/spark-component:components/fields/data-components/datetime/FieldTimeSelect/FieldTimeSelect.props
 * 职责：定义 FieldTimeSelect（r-time-select）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 field-level/data-field 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 field time select 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkFieldSemanticProps, SparkNodeProps } from '../../../../shared-types'

/** RTime Select Props 的属性契约。 */
export type RTimeSelectProps = SparkNodeProps & SparkFieldSemanticProps<string> & {
  /** 可选时间段的起始时间。 */
    start?: string
    /** 可选时间段的结束时间。 */
    end?: string
    /** 相邻时间选项之间的步长。 */
    step?: string
    /** 可选择的最小时间。 */
    minTime?: string
    /** 可选择的最大时间。 */
    maxTime?: string}
