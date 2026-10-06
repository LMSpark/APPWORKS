/**
 * @module app:views/app/dev-system/childPlacementLabels
 * 职责：提供正式navigation.placement的界面选项与标签。
 * 边界：只翻译展示文本，不持有布局真源或重写业务kind。
 * AI用途：显示top/left/right/parent/tabs/popup正式布局值。
 */
const LABELS: Record<string,string> = {top:'顶部',left:'左侧',right:'右侧',parent:'继承父级',tabs:'页签',popup:'弹出窗口'}
export const CHILD_PLACEMENT_OPTIONS = Object.entries(LABELS).map(([value,label]) => ({value,label}))
export function formatNavigationPlacementLabel(value: string | null | undefined): string { return value ? LABELS[value] ?? value : '' }
