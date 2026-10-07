/**
 * @module @spark-appworks/spark-component:components/display/non-data-components/time/DisplayCountdown/DisplayCountdown.props
 * 职责：定义 DisplayCountdown（display-countdown）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 display/static-display 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 display countdown 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { CSSProperties } from 'vue'
import type { SparkNodeProps } from '../../../../shared-types'

/** RDisplay Countdown Props 的属性契约。 */
export type RDisplayCountdownProps = SparkNodeProps & {
  /** 目标时间（时间戳或 Date） */
    value?: number | Date
    /** 格式化字符串，如 HH:mm:ss */
    format?: string
    /** 前缀文本 */
    prefix?: string
    /** 后缀文本 */
    suffix?: string
    /** 标题 */
    title?: string
    /** 值样式 */
    valueStyle?: CSSProperties}
