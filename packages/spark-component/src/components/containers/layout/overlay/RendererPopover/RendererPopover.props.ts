/**
 * @module @spark-appworks/spark-component:components/containers/layout/overlay/RendererPopover/RendererPopover.props
 * 职责：定义 RendererPopover（r-popover）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 container/layout-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer popover 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkNode } from '@spark-appworks/spark-data'
import type {
  SparkFloatingLayerProps,
  SparkNodeProps,
  SparkTitleContentProps,
} from '../../../../shared-types'

/** RPopover Props 的属性契约。 */
export type RPopoverProps = SparkNodeProps & SparkFloatingLayerProps & SparkTitleContentProps & {
  /** 浮层正文节点列表。 */
    contentChildren?: SparkNode[]
    /** 浮层宽度。 */
    width?: number | string
    /** 浮层触发方式。 */
    trigger?: 'click' | 'hover' | 'focus' | 'contextmenu'}
