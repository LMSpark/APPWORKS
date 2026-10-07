/**
 * @module @spark-appworks/spark-component:components/containers/layout/overlay/RendererDrawer/RendererDrawer.props
 * 职责：定义 RendererDrawer（r-drawer）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 container/layout-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer drawer 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type {
  SparkGridLayoutProps,
  SparkNodeProps,
  SparkVisibilityContainerProps,
} from '../../../../shared-types'
import type { RFooterProps } from '../../../zones/RendererFooter.types'
import type { RHeaderProps } from '../../../zones/RendererHeader.types'

/** RDrawer Props 的属性契约。 */
export type RDrawerProps = SparkNodeProps & SparkVisibilityContainerProps & SparkGridLayoutProps & {
  /** 结构化头部 */
    header?: RHeaderProps
    /** 结构化底部 */
    footer?: RFooterProps
    /** 抽屉标题 */
    title?: string
    /** 控制显隐 */
    modelValue?: boolean
    /** 内容区 CSS 类名 */
    bodyClass?: string}
