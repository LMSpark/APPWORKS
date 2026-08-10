/**
 * @module @spark-appworks/spark-component:components/containers/index
 * 职责：汇总导出 components/containers 的组件、props、types 和 zero-code 能力。
 * 边界：只维护目录级公开表面，不实现具体渲染逻辑，也不创建新的运行时状态。
 * AI用途：判断某个组件能力是否应对外暴露或被注册表扫描时，用本模块确认导出入口。
 */
/**
 * 容器组件统一分类入口。
 */

// 平铺导出（组件）
export {
	RendererDetail,
	RendererForm,
	RendererList,
	RendererTable,
	RendererTree,
	RendererVirtualCard,
} from './data-views/index.js'
export type {
	RDetailProps,
	RFormProps,
	RListProps,
	RVirtualCardProps,
	RendererDetailApi,
	RendererFormApi,
	RendererListApi,
	RendererTableApi,
	RendererTreeApi,
	RendererVirtualCardApi,
	RendererTreePath,
	RTableProps,
	RTreeProps,
} from './data-views/index.js'
export {
	RendererAffix,
	RendererAnchor,
	RendererAnchorLink,
	RendererAside,
	RendererBacktop,
	RendererButton,
	RendererButtonGroup,
	RendererCard,
	RendererCarousel,
	RendererCarouselItem,
	RendererCol,
	RendererCollapse,
	RendererCollapseItem,
	RendererContainer,
	RendererDialog,
	RendererDivider,
	RendererDrawer,
	RendererDropdown,
	RendererLayoutFooter,
	RendererLayoutHeader,
	RendererLink,
	RendererMain,
	RendererPageHeader,
	RendererPopconfirm,
	RendererPopover,
	RendererRow,
	RendererScrollbar,
	RendererSection,
	RendererSpace,
	RendererStepItem,
	RendererSteps,
	RendererTabPane,
	RendererTabs,
	RendererToolbar,
	RendererTooltip,
	RendererTour,
	RendererWatermark,
} from './layout/index.js'
export type {
	DropdownItem,
	RAnchorLinkProps,
	RAnchorProps,
	RButtonProps,
	RCardProps,
	RCollapseProps,
	RDialogProps,
	RDividerProps,
	RDrawerProps,
	RDropdownProps,
	RLinkProps,
	RPageHeaderProps,
	RPopconfirmProps,
	RPopoverProps,
	RSectionProps,
	RendererCollapseApi,
	RendererSectionApi,
	RendererStepsApi,
	RendererTabsApi,
	RSpaceProps,
	RStepsProps,
	RTabsProps,
	RTooltipProps,
	RTourProps,
	TabsClickEvent,
	TourStep,
} from './layout/index.js'
export { default as RendererFilter } from './zones/RendererFilter.vue'
export { default as RendererEditor } from './zones/RendererEditor.vue'
export { default as RendererHeader } from './zones/RendererHeader.vue'
export { default as RendererFooter } from './zones/RendererFooter.vue'
export { default as RendererTail } from './zones/RendererTail.vue'
export { default as RendererFieldScope } from './support/RendererFieldScope.vue'

// ── 结构节点类型（供容器 Props 组合使用） ──
export type { RToolbarProps, InlineAlign, InlineJustify } from './layout/RendererToolbar.types.js'
export type { RFilterProps } from './zones/RendererFilter.types.js'
export type { ActionsAlign, ActionsPosition, RendererActionsProps } from './support/RendererActions.types.js'
export type { VisibilityContainerApi } from './support/base-container-api.js'
export type { REditorProps } from './zones/RendererEditor.types.js'
export type { RHeaderProps } from './zones/RendererHeader.types.js'
export type { RFooterProps } from './zones/RendererFooter.types.js'
export type { RTailProps } from './zones/RendererTail.types.js'
export type { ToolbarPosition } from './runtime/container-ui.js'

export {
	useContainerDataSource,
	useContainerDataSourceEffects,
} from './runtime/index.js'
