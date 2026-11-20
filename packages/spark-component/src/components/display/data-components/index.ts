/**
 * @module @spark-appworks/spark-component:components/display/data-components/index
 * 职责：作为 data-components（未注册组件类型）目录的公开导出入口，汇聚渲染器、props、类型和 zero-code 能力。
 * 边界：只维护 display/data-display 的模块出口，不新增业务行为，也不绕过具体实现文件的契约。
 * AI用途：需要发现 data components 对外暴露哪些子模块时，从本模块进入，再跳到具体 props、Vue 或 zero-code 文件。
 */
export { default as DisplayStatistic } from './value/DisplayStatistic/DisplayStatistic.vue'
export { default as DisplayProgress } from './visual/DisplayProgress/DisplayProgress.vue'
export { default as DisplayTag } from './value/DisplayTag/DisplayTag.vue'
export { default as DisplayBadge } from './value/DisplayBadge/DisplayBadge.vue'
export { default as DisplayAvatar } from './visual/DisplayAvatar/DisplayAvatar.vue'
export { default as DisplayText } from './value/DisplayText/DisplayText.vue'
export { default as DisplayPagination } from './DisplayPagination/DisplayPagination.vue'
export { default as DisplayImage } from './visual/DisplayImage/DisplayImage.vue'

// ── Props 类型 ──
export type { RStatisticProps } from './value/DisplayStatistic/DisplayStatistic.props'
export type { RProgressProps } from './visual/DisplayProgress/DisplayProgress.props'
export type { RTagProps, TagType } from './value/DisplayTag/DisplayTag.props'
export type { RBadgeProps } from './value/DisplayBadge/DisplayBadge.props'
export type { RAvatarProps } from './visual/DisplayAvatar/DisplayAvatar.props'
export type { RTextDisplayProps } from './value/DisplayText/DisplayText.props'
export type { RPaginationProps } from './DisplayPagination/DisplayPagination.props'
export type { RDisplayImageProps } from './visual/DisplayImage/DisplayImage.props'
