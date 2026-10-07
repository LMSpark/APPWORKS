/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererList/RendererList.props
 * 职责：定义 RendererList（r-list）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 table-level/data-view-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer list 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
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

/**
 * r-list 组件公开属性接口。
 *
 * 命名规范：组件 type `r-list` → 接口名 `RListProps`。
 */
export type RListProps = SparkNodeProps & SparkCrudDataContainerProps & SparkGridLayoutProps & {
  /** 显式收窄为列表容器使用的 DataView 数据线。 */
    dataSource?: DataView
    /** 结构化工具栏 */
    toolbar?: RToolbarProps
    /** 结构化列表项动作（toolbar 结构） */
    actions?: RToolbarProps
    /** 列数 */
    columns?: number
    /** 最小项宽度 */
    minItemWidth?: string
    /** 行唯一键字段 */
    rowKey?: string
    /** 空数据提示文案 */
    emptyText?: string
    /** 列表项 CSS 类名 */
    itemClass?: string
    /** 列表项行内样式 */
    itemStyle?: CSSProperties
    /** 使用卡片包裹 */
    useCard?: boolean
    /** 卡片阴影模式 */
    cardShadow?: 'always' | 'hover' | 'never'
    /** 项跨列数 */
    itemColSpan?: number
    /** 项跨行数 */
    itemRowSpan?: number
    /** 列表项点击回调 */
    onItemClick?: RowClickHandler
    /** 透传给列表根节点的显式属性 */
    listProps?: Record<string, unknown>
    /** 是否显示分页器。默认 true。 */
    showPagination?: boolean}
