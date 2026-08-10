/**
 * @module @spark-appworks/spark-component:components/containers/layout/index
 * 职责：作为 layout（未注册组件类型）目录的公开导出入口，汇聚渲染器、props、类型和 zero-code 能力。
 * 边界：只维护 container/layout-container 的模块出口，不新增业务行为，也不绕过具体实现文件的契约。
 * AI用途：需要发现 layout 对外暴露哪些子模块时，从本模块进入，再跳到具体 props、Vue 或 zero-code 文件。
 */
export { default as RendererTabs } from './RendererTabs/index.js'
export type { RendererTabsApi } from './RendererTabs/index.js'
export { default as RendererTabPane } from './RendererTabPane.vue'
export { default as RendererCollapse } from './RendererCollapse/index.js'
export type { RendererCollapseApi } from './RendererCollapse/index.js'
export { default as RendererCollapseItem } from './RendererCollapseItem.vue'
export { default as RendererDialog } from './RendererDialog/index.js'
export { default as RendererDrawer } from './RendererDrawer/index.js'
export { default as RendererSteps } from './RendererSteps/index.js'
export type { RendererStepsApi } from './RendererSteps/index.js'
export { default as RendererStepItem } from './RendererStepItem.vue'
export { default as RendererSection } from './RendererSection/index.js'
export type { RendererSectionApi } from './RendererSection/index.js'
export { default as RendererToolbar } from './RendererToolbar.vue'
export { default as RendererCard } from './RendererCard.vue'
export { default as RendererSpace } from './RendererSpace.vue'
export { default as RendererDivider } from './RendererDivider.vue'
export { default as RendererButton } from './RendererButton.vue'
export { default as RendererLink } from './RendererLink.vue'
export { default as RendererPageHeader } from './RendererPageHeader.vue'
export { default as RendererDropdown } from './RendererDropdown.vue'
export { default as RendererTooltip } from './RendererTooltip.vue'
export { default as RendererPopover } from './RendererPopover.vue'
export { default as RendererPopconfirm } from './RendererPopconfirm.vue'
export { default as RendererTour } from './RendererTour.vue'
export { default as RendererAnchor } from './RendererAnchor.vue'
export { default as RendererAnchorLink } from './RendererAnchorLink.vue'

// ── Props 类型 ──
export type { RTabsProps, TabsClickEvent } from './RendererTabs/index.js'
export type { RCollapseProps } from './RendererCollapse/index.js'
export type { RDialogProps } from './RendererDialog/index.js'
export type { RDrawerProps } from './RendererDrawer/index.js'
export type { RStepsProps } from './RendererSteps/index.js'
export type { RSectionProps } from './RendererSection/index.js'
export type { InlineAlign, InlineJustify, RToolbarProps } from './RendererToolbar.types'
export type { RCardProps } from './RendererCard.props'
export type { RSpaceProps } from './RendererSpace.props'
export type { RDividerProps } from './RendererDivider.props'
export type { RButtonProps } from './RendererButton.props'
export type { RLinkProps } from './RendererLink.props'
export type { RPageHeaderProps } from './RendererPageHeader.props'
export type { RDropdownProps, DropdownItem } from './RendererDropdown.props'
export type { RTooltipProps } from './RendererTooltip.props'
export type { RPopoverProps } from './RendererPopover.props'
export type { RPopconfirmProps } from './RendererPopconfirm.props'
export type { RTourProps, TourStep } from './RendererTour.props'
export type { RAnchorProps } from './RendererAnchor.props'
export type { RAnchorLinkProps } from './RendererAnchorLink.props'

// ── Passthrough（工厂生成，替代独立 .vue 文件）──
import { createPassthrough } from '../../create-passthrough.js'

export const RendererButtonGroup = createPassthrough('el-button-group', 'r-button-group')
export const RendererContainer = createPassthrough('el-container', 'r-container')
export const RendererMain = createPassthrough('el-main', 'r-main')
export const RendererAside = createPassthrough('el-aside', 'r-aside', { propDefaults: { width: '300px' } })
export const RendererLayoutHeader = createPassthrough('el-header', 'r-layout-header', { propDefaults: { height: '60px' } })
export const RendererLayoutFooter = createPassthrough('el-footer', 'r-layout-footer', { propDefaults: { height: '60px' } })
export const RendererRow = createPassthrough('el-row', 'r-row')
export const RendererCol = createPassthrough('el-col', 'r-col')
export const RendererAffix = createPassthrough('el-affix', 'r-affix')
export const RendererBacktop = createPassthrough('el-backtop', 'r-backtop')
export const RendererScrollbar = createPassthrough('el-scrollbar', 'r-scrollbar')
export const RendererCarousel = createPassthrough('el-carousel', 'r-carousel')
export const RendererCarouselItem = createPassthrough('el-carousel-item', 'r-carousel-item')
export const RendererWatermark = createPassthrough('el-watermark', 'r-watermark')
