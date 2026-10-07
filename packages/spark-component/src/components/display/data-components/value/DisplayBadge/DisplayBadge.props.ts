/**
 * @module @spark-appworks/spark-component:components/display/data-components/value/DisplayBadge/DisplayBadge.props
 * 职责：定义 DisplayBadge（r-badge）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 display/data-display 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 display badge 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkDataDisplayProps, SparkNodeProps } from '../../../../shared-types'

/** RBadge Props 的属性契约。 */
export type RBadgeProps = SparkNodeProps & SparkDataDisplayProps<string | number> & {
  /** 徽标显示值（优先使用该字段渲染角标）。 */
    badgeValue?: string | number
    /** 徽标的最大显示阈值；超出后按 `99+` 这类形式展示。 */
    max?: number
    /** 是否仅显示小红点。 */
    isDot?: boolean
    /** 是否隐藏徽标。 */
    hiddenBadge?: boolean
    /** 徽标主题类型。 */
    badgeType?: '' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
    /** 值为 0 时是否仍显示徽标。 */
    showZero?: boolean
    /** 自定义徽标颜色。 */
    color?: string
    /** 徽标偏移量 [x, y]。 */
    offset?: [number, number]
    /** 徽标内联样式对象。 */
    badgeStyle?: object
    /** 徽标附加 class。 */
    badgeClass?: string}
