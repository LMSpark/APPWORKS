/**
 * @module @spark-appworks/spark-component:components/display/data-components/visual/DisplayAvatar/DisplayAvatar.props
 * 职责：定义 DisplayAvatar（r-avatar）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 display/data-display 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 display avatar 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkDataDisplayProps, SparkNodeProps } from '../../../../shared-types'

/** RAvatar Props 的属性契约。 */
export type RAvatarProps = SparkNodeProps & SparkDataDisplayProps<string> & {
  /** 头像尺寸 */
    avatarSize?: number | 'large' | 'default' | 'small'
    /** 头像形状 */
    shape?: 'circle' | 'square'
    /** 图片地址 */
    src?: string
    /** 响应式图像集合 */
    srcSet?: string
    /** 图片替代文本 */
    alt?: string
    /** 图片填充方式 */
    fit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down'
    /** 文本头像内容 */
    text?: string
    /** 图标名称 */
    icon?: string}
