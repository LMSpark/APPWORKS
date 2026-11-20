/**
 * @module @spark-appworks/spark-component:components/display/non-data-components/time/DisplayTimeline/DisplayTimelineItem.props
 * 职责：定义 DisplayTimelineItem（r-timeline-item）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 display/static-display 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 display timeline item 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkNodeProps } from '../../../../shared-types'

/** RTimeline Item Props 的属性契约。 */
export type RTimelineItemProps = SparkNodeProps & {
  /** 时间戳文本 */
    timestamp?: string
    /** 是否隐藏时间戳 */
    hideTimestamp?: boolean
    /** 是否垂直居中 */
    center?: boolean
    /** 时间戳位置 */
    placement?: 'top' | 'bottom'
    /** 节点类型 */
    itemType?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
    /** 节点颜色 */
    color?: string
    /** 节点尺寸 */
    itemSize?: 'normal' | 'large'
    /** 是否空心节点 */
    hollow?: boolean
    /** 内容文本 */
    content?: string}
