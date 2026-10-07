/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererDetail/RendererDetail.props
 * 职责：定义 RendererDetail（r-detail）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 table-level/data-view-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer detail 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { DataMember, DataView } from '@spark-appworks/spark-data'
import type {
  SparkCrudDataContainerProps,
  SparkGridLayoutProps,
  SparkNodeProps,
} from '../../../shared-types'
import type { RToolbarProps } from '../../layout/action/RendererToolbar/RendererToolbar.types'

/**
 * r-detail 组件公开属性接口。
 *
 * 命名规范：组件 type `r-detail` → 接口名 `RDetailProps`。
 */
export type RDetailProps = SparkNodeProps & SparkCrudDataContainerProps & SparkGridLayoutProps & {
  /** 显式收窄为详情容器使用的 DataView 数据线。 */
    dataSource?: DataView
    /** 结构化工具栏 */
    toolbar?: RToolbarProps
    /** 上下文 DataView 成员，默认 currentRow。 */
    contextDataMember?: DataMember | `${DataMember}`
    /** 上下文成员内部业务字段或点路径。 */
    contextDataField?: string
    /** 没有显式 children 时，是否从 DataView.columns 自动生成字段。默认 true。 */
    autoColumns?: boolean
    /** 标题对齐 */
    titleAlign?: 'left' | 'center' | 'right'
    /** 值对齐 */
    valueAlign?: 'left' | 'center' | 'right'
    /** 透传给详情根节点的显式属性 */
    detailProps?: Record<string, unknown>}
