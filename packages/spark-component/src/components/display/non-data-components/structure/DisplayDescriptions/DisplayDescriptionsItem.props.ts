/**
 * @module @spark-appworks/spark-component:components/display/non-data-components/structure/DisplayDescriptions/DisplayDescriptionsItem.props
 * 职责：定义 DisplayDescriptionsItem（r-descriptions-item）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 display/static-display 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 display descriptions item 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkNodeProps } from '../../../../shared-types'

/** RDescriptions Item Props 的属性契约。 */
export type RDescriptionsItemProps = SparkNodeProps & {
  /** 描述项标签文本 */
    label?: string
    /** 该项占据的列数 */
    span?: number
    /** 标签对齐方式 */
    labelAlign?: 'left' | 'center' | 'right'
    /** 内容对齐方式 */
    contentAlign?: 'left' | 'center' | 'right'
    /** 标签自定义 class */
    labelClassName?: string
    /** 内容自定义 class */
    className?: string
    /** 显式内容文本 */
    content?: string
    /** 显式展示值 */
    value?: unknown
    /** 数据字段绑定键 */
    field?: string}
