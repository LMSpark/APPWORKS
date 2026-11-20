/**
 * @module @spark-appworks/spark-component:components/containers/layout/structure/RendererDivider/RendererDivider.props
 * 职责：定义 RendererDivider（r-divider）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 container/layout-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer divider 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkNodeProps } from '../../../../shared-types'

/** RDivider Props 的属性契约。 */
export type RDividerProps = SparkNodeProps & {
  /** 分割方向 */
    direction?: 'horizontal' | 'vertical'
    /** 边框样式 */
    borderStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none'
    /** 文本位置（横向模式） */
    contentPosition?: 'left' | 'center' | 'right'
    /** 分割线文本 */
    content?: string}
