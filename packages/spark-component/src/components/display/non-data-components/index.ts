/**
 * @module @spark-appworks/spark-component:components/display/non-data-components/index
 * 职责：作为 non-data-components（未注册组件类型）目录的公开导出入口，汇聚渲染器、props、类型和 zero-code 能力。
 * 边界：只维护 display/static-display 的模块出口，不新增业务行为，也不绕过具体实现文件的契约。
 * AI用途：需要发现 non data components 对外暴露哪些子模块时，从本模块进入，再跳到具体 props、Vue 或 zero-code 文件。
 */
export { default as DisplayDescriptions } from './DisplayDescriptions.vue'
export { default as DisplayDescriptionsItem } from './DisplayDescriptionsItem.vue'
export { default as DisplayTimeline } from './DisplayTimeline.vue'
export { default as DisplayTimelineItem } from './DisplayTimelineItem.vue'
export { default as DisplayAlert } from './DisplayAlert.vue'
export { default as DisplayEmpty } from './DisplayEmpty.vue'
export { default as DisplayResult } from './DisplayResult.vue'
export { default as DisplayBreadcrumb } from './DisplayBreadcrumb.vue'
export { default as DisplayBreadcrumbItem } from './DisplayBreadcrumbItem.vue'
export { default as DisplaySkeleton } from './DisplaySkeleton.vue'
export { default as DisplayCalendar } from './DisplayCalendar.vue'
export { default as DisplayCountdown } from './DisplayCountdown.vue'
export { default as DisplayIcon } from './DisplayIcon.vue'

// ── Props 类型 ──
export type { RDescriptionsProps } from './DisplayDescriptions.props'
export type { RDescriptionsItemProps } from './DisplayDescriptionsItem.props'
export type { RTimelineItemProps } from './DisplayTimelineItem.props'
export type { RAlertProps } from './DisplayAlert.props'
export type { REmptyProps } from './DisplayEmpty.props'
export type { RResultProps } from './DisplayResult.props'
export type { RBreadcrumbProps } from './DisplayBreadcrumb.props'
export type { RBreadcrumbItemProps } from './DisplayBreadcrumbItem.props'
export type { RSkeletonProps } from './DisplaySkeleton.props'
export type { RDisplayCalendarProps } from './DisplayCalendar.props'
export type { RDisplayCountdownProps } from './DisplayCountdown.props'
export type { RDisplayIconProps } from './DisplayIcon.props'
