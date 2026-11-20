/**
 * @module @spark-appworks/spark-component:components/containers/layout/overlay/RendererTooltip/RendererTooltip.props
 * 职责：定义 RendererTooltip（r-tooltip）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 container/layout-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer tooltip 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkFloatingLayerProps, SparkNodeProps } from '../../../../shared-types'

/** RTooltip Props 的属性契约。 */
export type RTooltipProps = SparkNodeProps & SparkFloatingLayerProps & {
  /** 提示内容文本。 */
    content?: string
    /** 鼠标移入浮层内容时是否保持展开。 */
    enterable?: boolean
    /** 是否按原始 HTML 内容渲染。 */
    rawContent?: boolean}
