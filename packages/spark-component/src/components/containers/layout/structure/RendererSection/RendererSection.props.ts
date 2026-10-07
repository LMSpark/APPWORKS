/**
 * @module @spark-appworks/spark-component:components/containers/layout/structure/RendererSection/RendererSection.props
 * 职责：定义 RendererSection（r-section）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 container/layout-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer section 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkGridLayoutProps, SparkNodeProps } from '../../../../shared-types'
import type { RHeaderProps } from '../../../zones/RendererHeader.types'

/** RSection Props 的属性契约。 */
export type RSectionProps = SparkNodeProps & SparkGridLayoutProps & {
  /** 结构化头部 */
    header?: RHeaderProps
    /** 分区标题 */
    title?: string
    /** 分区描述 */
    description?: string
    /** 是否可折叠 */
    collapsible?: boolean
    /** 默认折叠 */
    defaultCollapsed?: boolean
    /** 显示边框 */
    bordered?: boolean
    /** 使用卡片样式 */
    useCard?: boolean
    /** 卡片阴影模式 */
    cardShadow?: 'always' | 'hover' | 'never'
    /** 内容区 CSS 类名 */
    bodyClass?: string
    /** 展开文案 */
    expandText?: string
    /** 收起文案 */
    collapseText?: string
    /** 显示切换图标 */
    showToggleIcon?: boolean
    /** 展开图标文案 */
    expandIconText?: string
    /** 收起图标文案 */
    collapseIconText?: string}
