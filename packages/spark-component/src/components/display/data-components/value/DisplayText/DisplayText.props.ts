/**
 * @module @spark-appworks/spark-component:components/display/data-components/value/DisplayText/DisplayText.props
 * 职责：定义 DisplayText（r-text-display）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 display/data-display 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 display text 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkDataDisplayProps, SparkNodeProps } from '../../../../shared-types'

/** RText Display Props 的属性契约。 */
export type RTextDisplayProps = SparkNodeProps & SparkDataDisplayProps<unknown> & {
  /** 包裹标签名，如 span/div */
    tag?: string
    /** 前缀 */
    prefix?: string
    /** 后缀 */
    suffix?: string
    /** 格式化方式 */
    format?: 'number' | 'currency' | 'percent' | 'date'
    /** 小数精度 */
    precision?: number
    /** 空值占位文本 */
    placeholder?: string
    /** 文本 class */
    textClass?: string
    /** 文本样式 */
    textStyle?: Record<string, unknown> | string}
