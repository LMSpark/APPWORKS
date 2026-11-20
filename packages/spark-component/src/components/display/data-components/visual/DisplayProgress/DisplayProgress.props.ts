/**
 * @module @spark-appworks/spark-component:components/display/data-components/visual/DisplayProgress/DisplayProgress.props
 * 职责：定义 DisplayProgress（r-progress）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 display/data-display 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 display progress 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkDataDisplayProps, SparkNodeProps } from '../../../../shared-types'

// 这里不再为 JS 基础类型保留导出别名，进度色直接内联到属性上。

/** RProgress Props 的属性契约。 */
export type RProgressProps = SparkNodeProps & SparkDataDisplayProps<number> & {
  /** 百分比值（优先级高于 value/field） */
    percentage?: number
    /** 进度条类型 */
    progressType?: 'line' | 'circle' | 'dashboard'
    /** 线宽 */
    strokeWidth?: number
    /** 线形时文本是否内嵌 */
    textInside?: boolean
    /** 状态 */
    status?: 'success' | 'exception' | 'warning'
    /** 是否不确定进度 */
    indeterminate?: boolean
    /** 动画时长（毫秒） */
    duration?: number
    /** 进度色 */
    color?: string | Array<{ color: string; percentage: number }>
    /** 圆形进度宽度 */
    circleWidth?: number
    /** 是否显示文本 */
    showText?: boolean
    /** 线帽样式 */
    strokeLinecap?: 'butt' | 'round' | 'square'
    /** 文本模板 */
    formatText?: string}
