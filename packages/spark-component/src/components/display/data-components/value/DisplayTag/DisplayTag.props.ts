/**
 * @module @spark-appworks/spark-component:components/display/data-components/value/DisplayTag/DisplayTag.props
 * 职责：定义 DisplayTag（display-tag）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 display/data-display 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 display tag 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkDataDisplayProps, SparkNodeProps } from '../../../../shared-types'

/** Tag Type 的语义模型。 */
export type TagType = 'success' | 'info' | 'warning' | 'danger'

/** RTag Props 的属性契约。 */
export type RTagProps = SparkNodeProps & SparkDataDisplayProps<string> & {
  /** 显式内容，优先级高于 value/field */
    content?: string
    /** 标签类型 */
    tagType?: '' | TagType
    /** 动态类型映射（按值命中） */
    dynamicType?: Record<string, '' | TagType>
    /** 是否可关闭 */
    closable?: boolean
    /** 是否禁用过渡动画 */
    disableTransitions?: boolean
    /** 是否描边 */
    hit?: boolean
    /** 是否圆角 */
    round?: boolean
    /** 自定义颜色 */
    color?: string
    /** 尺寸 */
    size?: 'large' | 'default' | 'small'
    /** 视觉效果 */
    effect?: 'dark' | 'light' | 'plain'}
