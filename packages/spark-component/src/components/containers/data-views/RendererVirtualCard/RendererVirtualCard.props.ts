/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererVirtualCard/RendererVirtualCard.props
 * 职责：定义 RendererVirtualCard（r-virtual-card）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 table-level/data-view-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer virtual card 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { CSSProperties } from 'vue'
import type { DataView } from '@spark-appworks/spark-data'
import type {
  SparkCrudDataContainerProps,
  SparkGridLayoutProps,
  SparkNodeProps,
} from '../../../shared-types'
import type { RowClickHandler } from '../../support'
import type { RToolbarProps } from '../../layout/action/RendererToolbar/RendererToolbar.types'

/** RVirtual Card Props 的属性契约。 */
export type RVirtualCardProps = SparkNodeProps & SparkCrudDataContainerProps & SparkGridLayoutProps & {
  /** 显式收窄为虚拟卡片容器使用的 DataView 数据线。 */
  dataSource?: DataView
  /** 结构化工具栏。 */
  toolbar?: RToolbarProps
  /** 行唯一键字段。 */
  rowKey?: string
  /** 空数据提示文案。 */
  emptyText?: string
  /** 单个虚拟页块高度，单位 px。 */
  pageHeight?: number
  /** 移动端单个虚拟页块高度，单位 px。 */
  mobilePageHeight?: number
  /** 移动端断点，单位 px。 */
  mobileBreakpoint?: number
  /** 视口高度 CSS 值。 */
  viewportHeight?: string
  /** 视口最小高度 CSS 值。 */
  minViewportHeight?: string
  /** 前后额外渲染的虚拟页数。 */
  overscanPages?: number
  /** 本地全量 rows 模式下，预热目标页前后的页数；远端 DataView 仍只加载目标页。 */
  prefetchPages?: number
  /** 最多保留的页缓存数量。 */
  maxCachedPages?: number
  /** 每页卡片网格列数。 */
  columns?: number
  /** 移动端每页卡片网格列数。 */
  mobileColumns?: number
  /** 停稳后触发 DataView 页加载的延迟，单位 ms。 */
  settleDelay?: number
  /** 滚轮距离换算为页数的基础像素值。 */
  wheelStepPx?: number
  /** 单次滚轮最多跳转页数。 */
  maxWheelJumpPages?: number
  /** 列表项 CSS 类名。 */
  itemClass?: string
  /** 列表项行内样式。 */
  itemStyle?: CSSProperties
  /** 是否显示顶部标题与进度。 */
  showHeader?: boolean
  /** 是否显示悬浮页码提示。 */
  showHud?: boolean
  /** 是否显示每个页块的页状态。 */
  showPageMeta?: boolean
  /** 卡片点击回调。 */
  onItemClick?: RowClickHandler
  /** 页加载回调。 */
  onPageChange?: (page: number) => void | Promise<void>
}
