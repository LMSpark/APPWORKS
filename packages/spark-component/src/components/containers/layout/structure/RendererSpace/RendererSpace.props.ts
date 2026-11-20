/**
 * @module @spark-appworks/spark-component:components/containers/layout/structure/RendererSpace/RendererSpace.props
 * 职责：定义 RendererSpace（r-space）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 container/layout-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer space 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkNodeProps } from '../../../../shared-types'

/** RSpace Props 的属性契约。 */
export type RSpaceProps = SparkNodeProps & {
  /** 主轴方向 */
    direction?: 'horizontal' | 'vertical'
    /** 间距 */
    size?: number | string
    /** 是否自动换行 */
    wrap?: boolean
    /** 是否填充父容器 */
    fill?: boolean
    /** 交叉轴对齐方式 */
    alignment?: 'stretch' | 'center' | 'flex-start' | 'flex-end' | 'baseline'}
