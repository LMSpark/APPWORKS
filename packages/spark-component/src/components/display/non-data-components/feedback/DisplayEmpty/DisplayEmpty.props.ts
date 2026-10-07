/**
 * @module @spark-appworks/spark-component:components/display/non-data-components/feedback/DisplayEmpty/DisplayEmpty.props
 * 职责：定义 DisplayEmpty（r-empty）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 display/static-display 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 display empty 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkNodeProps } from '../../../../shared-types'

/** REmpty Props 的属性契约。 */
export type REmptyProps = SparkNodeProps & {
  /** 空状态图片地址 */
    image?: string
    /** 图片尺寸（像素） */
    imageSize?: number
    /** 空状态描述文案 */
    description?: string}
