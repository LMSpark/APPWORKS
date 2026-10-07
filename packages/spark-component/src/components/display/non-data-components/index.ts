/**
 * @module @spark-appworks/spark-component:components/display/non-data-components/index
 * 职责：作为 non-data-components（未注册组件类型）目录的公开导出入口，汇聚渲染器、props、类型和 zero-code 能力。
 * 边界：只维护 display/static-display 的模块出口，不新增业务行为，也不绕过具体实现文件的契约。
 * AI用途：需要发现 non data components 对外暴露哪些子模块时，从本模块进入，再跳到具体 props、Vue 或 zero-code 文件。
 */
export { default as DisplayDescriptions } from './structure/DisplayDescriptions/DisplayDescriptions.vue'
export { default as DisplayDescriptionsItem } from './structure/DisplayDescriptions/DisplayDescriptionsItem.vue'
export { default as DisplayTimeline } from './time/DisplayTimeline/DisplayTimeline.vue'
export { default as DisplayTimelineItem } from './time/DisplayTimeline/DisplayTimelineItem.vue'
export { default as DisplayAlert } from './feedback/DisplayAlert/DisplayAlert.vue'
export { default as DisplayEmpty } from './feedback/DisplayEmpty/DisplayEmpty.vue'
export { default as DisplayResult } from './feedback/DisplayResult/DisplayResult.vue'
export { default as DisplayBreadcrumb } from './structure/DisplayBreadcrumb/DisplayBreadcrumb.vue'
export { default as DisplayBreadcrumbItem } from './structure/DisplayBreadcrumb/DisplayBreadcrumbItem.vue'
export { default as DisplaySkeleton } from './feedback/DisplaySkeleton/DisplaySkeleton.vue'
export { default as DisplayCalendar } from './time/DisplayCalendar/DisplayCalendar.vue'
export { default as DisplayCountdown } from './time/DisplayCountdown/DisplayCountdown.vue'
export { default as DisplayIcon } from './DisplayIcon/DisplayIcon.vue'

// ── Props 类型 ──
export type { RDescriptionsProps } from './structure/DisplayDescriptions/DisplayDescriptions.props'
export type { RDescriptionsItemProps } from './structure/DisplayDescriptions/DisplayDescriptionsItem.props'
export type { RTimelineItemProps } from './time/DisplayTimeline/DisplayTimelineItem.props'
export type { RAlertProps } from './feedback/DisplayAlert/DisplayAlert.props'
export type { REmptyProps } from './feedback/DisplayEmpty/DisplayEmpty.props'
export type { RResultProps } from './feedback/DisplayResult/DisplayResult.props'
export type { RBreadcrumbProps } from './structure/DisplayBreadcrumb/DisplayBreadcrumb.props'
export type { RBreadcrumbItemProps } from './structure/DisplayBreadcrumb/DisplayBreadcrumbItem.props'
export type { RSkeletonProps } from './feedback/DisplaySkeleton/DisplaySkeleton.props'
export type { RDisplayCalendarProps } from './time/DisplayCalendar/DisplayCalendar.props'
export type { RDisplayCountdownProps } from './time/DisplayCountdown/DisplayCountdown.props'
export type { RDisplayIconProps } from './DisplayIcon/DisplayIcon.props'
