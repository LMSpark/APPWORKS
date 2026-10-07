/**
 * @module @spark-appworks/spark-component:components/display/data-components/value/DisplayStatistic/DisplayStatistic.props
 * 职责：定义 DisplayStatistic（r-statistic）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 display/data-display 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 display statistic 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkDataDisplayProps, SparkNodeProps } from '../../../../shared-types'

/** RStatistic Props 的属性契约。 */
export type RStatisticProps = SparkNodeProps & SparkDataDisplayProps<number | string> & {
  /** 统计标题 */
    title?: string
    /** 小数精度 */
    precision?: number
    /** 小数分隔符 */
    decimalSeparator?: string
    /** 千分位分隔符 */
    groupSeparator?: string
    /** 前缀 */
    prefix?: string
    /** 后缀 */
    suffix?: string
    /** 数值样式 */
    valueStyle?: Record<string, unknown> | string}
