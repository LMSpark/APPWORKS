/**
 * @module @spark-appworks/spark-component:components/containers/layout/overlay/RendererPopconfirm/RendererPopconfirm.props
 * 职责：定义 RendererPopconfirm（r-popconfirm）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 container/layout-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer popconfirm 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkNodeProps } from '../../../../shared-types'

/** RPopconfirm Props 的属性契约。 */
export type RPopconfirmProps = SparkNodeProps & {
  /** 确认框标题 */
    title?: string
    /** 确认按钮文案 */
    confirmButtonText?: string
    /** 取消按钮文案 */
    cancelButtonText?: string
    /** 确认按钮类型 */
    confirmButtonType?: '' | 'default' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
    /** 取消按钮类型 */
    cancelButtonType?: '' | 'default' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
    /** 图标名称 */
    icon?: string
    /** 图标颜色 */
    iconColor?: string
    /** 是否隐藏图标 */
    hideIcon?: boolean
    /** 自动隐藏延迟（毫秒） */
    hideAfter?: number
    /** 浮层宽度 */
    width?: number | string}
