/**
 * @module @spark-appworks/spark-component:components/containers/layout/navigation/RendererAnchor/RendererAnchor.props
 * 职责：定义 RendererAnchor（r-anchor）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 container/layout-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer anchor 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkNodeProps } from '../../../../shared-types'

/** RAnchor Props 的属性契约。 */
export type RAnchorProps = SparkNodeProps & {
  /** 滚动容器选择器 */
    container?: string
    /** 偏移量 */
    offset?: number
    /** 边界值 */
    bound?: number
    /** 滚动动画时长 */
    duration?: number
    /** 是否显示标记 */
    marker?: boolean
    /** 排列方向 */
    direction?: 'vertical' | 'horizontal'
    /** 锚点类型（避免与 SparkNode.type 冲突） */
    anchorType?: 'default' | 'underline'}
