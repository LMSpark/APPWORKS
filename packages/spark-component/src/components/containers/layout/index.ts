/**
 * @module @spark-appworks/spark-component:components/containers/layout/index
 * 职责：作为 layout（未注册组件类型）目录的公开导出入口，汇聚渲染器、props、类型和 zero-code 能力。
 * 边界：只维护 container/layout-container 的模块出口，不新增业务行为，也不绕过具体实现文件的契约。
 * AI用途：需要发现 layout 对外暴露哪些子模块时，从本模块进入，再跳到具体 props、Vue 或 zero-code 文件。
 */
export { default as RendererTabs } from './navigation/RendererTabs/index.js'
export type { RendererTabsApi } from './navigation/RendererTabs/index.js'
export { default as RendererTabPane } from './navigation/RendererTabs/RendererTabPane.vue'
export { default as RendererCollapse } from './structure/RendererCollapse/index.js'
export type { RendererCollapseApi } from './structure/RendererCollapse/index.js'
export { default as RendererCollapseItem } from './structure/RendererCollapse/RendererCollapseItem.vue'
export { default as RendererDialog } from './overlay/RendererDialog/index.js'
export { default as RendererDrawer } from './overlay/RendererDrawer/index.js'
export { default as RendererSteps } from './navigation/RendererSteps/index.js'
export type { RendererStepsApi } from './navigation/RendererSteps/index.js'
export { default as RendererStepItem } from './navigation/RendererSteps/RendererStepItem.vue'
export { default as RendererSection } from './structure/RendererSection/index.js'
export type { RendererSectionApi } from './structure/RendererSection/index.js'
export { default as RendererToolbar } from './action/RendererToolbar/RendererToolbar.vue'
export { default as RendererCard } from './structure/RendererCard/RendererCard.vue'
export { default as RendererSpace } from './structure/RendererSpace/RendererSpace.vue'
export { default as RendererDivider } from './structure/RendererDivider/RendererDivider.vue'
export { default as RendererButton } from './action/RendererButton/RendererButton.vue'
export { default as RendererLink } from './navigation/RendererLink/RendererLink.vue'
export { default as RendererPageHeader } from './structure/RendererPageHeader/RendererPageHeader.vue'
export { default as RendererDropdown } from './overlay/RendererDropdown/RendererDropdown.vue'
export { default as RendererTooltip } from './overlay/RendererTooltip/RendererTooltip.vue'
export { default as RendererPopover } from './overlay/RendererPopover/RendererPopover.vue'
export { default as RendererPopconfirm } from './overlay/RendererPopconfirm/RendererPopconfirm.vue'
export { default as RendererTour } from './overlay/RendererTour/RendererTour.vue'
export { default as RendererAnchor } from './navigation/RendererAnchor/RendererAnchor.vue'
export { default as RendererAnchorLink } from './navigation/RendererAnchor/RendererAnchorLink.vue'

// ── Props 类型 ──
export type { RTabsProps, TabsClickEvent } from './navigation/RendererTabs/index.js'
export type { RCollapseProps } from './structure/RendererCollapse/index.js'
export type { RDialogProps } from './overlay/RendererDialog/index.js'
export type { RDrawerProps } from './overlay/RendererDrawer/index.js'
export type { RStepsProps } from './navigation/RendererSteps/index.js'
export type { RSectionProps } from './structure/RendererSection/index.js'
export type { InlineAlign, InlineJustify, RToolbarProps } from './action/RendererToolbar/RendererToolbar.types'
export type { RCardProps } from './structure/RendererCard/RendererCard.props'
export type { RSpaceProps } from './structure/RendererSpace/RendererSpace.props'
export type { RDividerProps } from './structure/RendererDivider/RendererDivider.props'
export type { RButtonProps } from './action/RendererButton/RendererButton.props'
export type { RLinkProps } from './navigation/RendererLink/RendererLink.props'
export type { RPageHeaderProps } from './structure/RendererPageHeader/RendererPageHeader.props'
export type { RDropdownProps, DropdownItem } from './overlay/RendererDropdown/RendererDropdown.props'
export type { RTooltipProps } from './overlay/RendererTooltip/RendererTooltip.props'
export type { RPopoverProps } from './overlay/RendererPopover/RendererPopover.props'
export type { RPopconfirmProps } from './overlay/RendererPopconfirm/RendererPopconfirm.props'
export type { RTourProps, TourStep } from './overlay/RendererTour/RendererTour.props'
export type { RAnchorProps } from './navigation/RendererAnchor/RendererAnchor.props'
export type { RAnchorLinkProps } from './navigation/RendererAnchor/RendererAnchorLink.props'

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
