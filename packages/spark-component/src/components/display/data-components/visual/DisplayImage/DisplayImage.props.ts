/**
 * @module @spark-appworks/spark-component:components/display/data-components/visual/DisplayImage/DisplayImage.props
 * 职责：定义 DisplayImage（display-image）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 display/data-display 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 display image 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkDataDisplayProps, SparkNodeProps } from '../../../../shared-types'

/** RDisplay Image Props 的属性契约。 */
export type RDisplayImageProps = SparkNodeProps & SparkDataDisplayProps<string> & {
  /** 图片 URL（静态传入）。 */
    src?: string
    /** 图片适应模式 */
    fit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down'
    /** 替代文本 */
    alt?: string
    /** 是否懒加载 */
    lazy?: boolean
    /** 预览图列表（静态传入） */
    previewSrcList?: string[]
    /** 预览图字段名（从当前行读取数组） */
    previewField?: string
    /** 初始预览索引 */
    initialIndex?: number
    /** 预览层级 */
    zIndex?: number
    /** 点击蒙层关闭预览 */
    hideOnClickModal?: boolean
    /** 预览传送至 body */
    previewTeleported?: boolean
    /** ESC 关闭预览 */
    closeOnPressEscape?: boolean
    /** 图片宽度 */
    width?: string | number
    /** 图片高度 */
    height?: string | number}
