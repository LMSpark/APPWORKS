/**
 * @module @spark-appworks/spark-component:components/containers/layout/overlay/RendererTour/RendererTour.props
 * 职责：定义 RendererTour（r-tour）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 container/layout-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer tour 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkNodeProps } from '../../../../shared-types'

/** Tour Step 的语义模型。 */
export type TourStep = {
  /** CSS 选择器或元素引用（运行时解析） */
  target?: string | HTMLElement | null
  /** 步骤标题 */
  title?: string
  /** 步骤描述 */
  description?: string
  /** 弹出位置 */
  placement?: string
  /** 是否显示遮罩 */
  mask?: boolean
  /** 是否显示箭头 */
  showArrow?: boolean}

/** RTour Props 的属性契约。 */
export type RTourProps = SparkNodeProps & {
  /** 步骤配置列表 */
    steps?: TourStep[]
    /** 是否显示 */
    open?: boolean
    /** 弹出位置（默认） */
    placement?: string
    /** 是否显示箭头 */
    showArrow?: boolean
    /** 是否显示遮罩 */
    mask?: boolean
    /** 引导类型 */
    tourType?: 'default' | 'primary'
    /** ESC 关闭 */
    closeOnPressEscape?: boolean
    /** 滚动选项 */
    scrollIntoViewOptions?: boolean | ScrollIntoViewOptions}
