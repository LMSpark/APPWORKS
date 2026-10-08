/**
 * @module @spark-appworks/spark-component:index
 * 职责：汇总导出 index 的组件、props、types 和 zero-code 能力。
 * 边界：只维护目录级公开表面，不实现具体渲染逻辑，也不创建新的运行时状态。
 * AI用途：判断某个组件能力是否应对外暴露或被注册表扫描时，用本模块确认导出入口。
 */
/**
 * SPARK 组件系统 - 公共 API
 *
 * @packageDocumentation
 */

// ── 1. System 层（命名空间 / 插件 / 注册表） ──
export { Spark } from './core/system/index.js'
export type {
  SparkSystem
} from './core/system/index.js'

// ── 2. Core 层（基础 composable / 类型 / 能力键） ──
export { useSparkComponent, useSparkConsume, useSparkPageComponent, useSparkContextScope, resolvePlaceholderProps } from './core/index.js'
export type {
  UseSparkComponentReturn,
  UseSparkPageComponentReturn,
  UseSparkCapabilityReaderReturn,
  UseSparkComponentOptions,
  SparkNodeInput,
} from './core/index.js'

// ── 3. Vue 插件 + 注册表 ──
// 公共入口收束到 Spark 命名空间：Spark.createPlugin/createRegistry/getRegistry。

// ── 3.5 权限渲染 API ──
export * as permission from './permission/index.js'

// ── 4. 核心类型 ──
export type {
  FilterItemConfig,
  ComponentDefinition,
  ComponentRegistry,
} from './core/index.js'
export type { CancellableControl } from './components/containers/support/interactionControl.js'

// ── 5. DI Keys + SparkNode 结构常量 ──
export {
  SPARK_REGISTRY_KEY,
} from './core/index.js'

// ── 5.5 页面运行时服务（能力键） ──
export {
  PAGE_RUNTIME_SERVICES,
} from './runtime/index.js'
export type {
  PageRuntimeServicesCapability,
} from './runtime/index.js'

// ── 6. 数据 + Renderer 能力键 ──
export {
  PAGE_SERVICE,
  PAGE_PERMISSION_MODE,
  PAGE_RUNTIME,
  DATA_SOURCE,
  DATA_ROW,
  PAGE_COMPONENT_REGISTRY,
  MODULE_CONTEXT,
  CSS_SCOPE,
  isThemeMode,
} from './core/index.js'
export type {
  PageServiceCapability,
  ThemeCapability,
  ThemeMode,
  ModuleContextCapability,
  PageMessageType,
  PageDialogResult,
  PageDialogOptions,
  PageBrowseFilesOptions,
  PageUploadFilesOptions,
  PageSelectEntitiesOptions,
  PageSelectorOption,
  PageSelectedFile,
  PageUploadedFile,
  PageComponentRegistry,
  PageComponentApiEntry,
  PageCssScopeCapability,
} from './core/index.js'
export type {
  RendererTableApi,
  RendererTreePath,
  RendererFormApi,
  RendererDetailApi,
  RendererTreeApi,
  RendererListApi,
  RendererVirtualCardApi,
  RendererTabsApi,
  RendererCollapseApi,
  RendererStepsApi,
  RendererSectionApi,
  VisibilityContainerApi,
  RTableProps,
  RFormProps,
  RDetailProps,
  RTreeProps,
  RListProps,
  RVirtualCardProps,
  RToolbarProps,
  InlineAlign,
  InlineJustify,
  RFilterProps,
  ActionsAlign,
  ActionsPosition,
  RendererActionsProps,
  REditorProps,
  RHeaderProps,
  RFooterProps,
  RTailProps,
  ToolbarPosition,
} from './components/containers/index.js'

// ── 7. 页面渲染引擎 ──
export {
  SparkPageRenderer,
} from './page/index.js'
// 组件层公共导出（容器 / 字段 / 展示 / 支持组件）
export {
  DisplayAlert,
  DisplayAvatar,
  DisplayBadge,
  DisplayBreadcrumb,
  DisplayBreadcrumbItem,
  DisplayCalendar,
  DisplayCountdown,
  DisplayDescriptions,
  DisplayDescriptionsItem,
  DisplayEmpty,
  DisplayIcon,
  DisplayImage,
  DisplayPagination,
  DisplayProgress,
  DisplayResult,
  DisplaySkeleton,
  DisplayStatistic,
  DisplayTag,
  DisplayText,
  DisplayTimeline,
  DisplayTimelineItem,
  FieldAutocomplete,
  FieldCascader,
  FieldCheckTag,
  FieldCheckbox,
  FieldCheckboxGroup,
  FieldColor,
  FieldContextRenderer,
  FieldDate,
  FieldDeptPicker,
  FieldEntityPicker,
  FieldFileBrowser,
  FieldFilePath,
  FieldHtmlEditor,
  FieldIcon,
  FieldImage,
  FieldMention,
  FieldMultiSelect,
  FieldNumber,
  FieldProductPicker,
  FieldRadio,
  FieldRate,
  FieldSegmented,
  FieldSelect,
  FieldSlider,
  FieldSwitch,
  FieldText,
  FieldTextarea,
  FieldTimePicker,
  FieldTimeSelect,
  FieldTransfer,
  FieldTreeNodeSummary,
  FieldTreeSelect,
  FieldUpload,
  FieldUserPicker,
  FilterExpressionEditor,
  FilterValueFunctionDialog,
  JsonTreeEditor,
  registerAllRenderers,
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
  RendererDetail,
  RendererDialog,
  RendererDivider,
  RendererDrawer,
  RendererDropdown,
  RendererForm,
  RendererLayoutFooter,
  RendererLayoutHeader,
  RendererLink,
  RendererList,
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
  RendererTable,
  RendererTabs,
  RendererToolbar,
  RendererTooltip,
  RendererTour,
  RendererTree,
  RendererVirtualCard,
  RendererWatermark,
  SparkCodeEditor,
  SparkComponentRenderer,
  SparkJsonEditor,
  useFieldPermission,
} from './components/index.js'

export type {
  CascaderPath,
  CascaderValue,
  CheckboxGroupMultiValue,
  DatePickerType,
  DropdownItem,
  FetchSuggestionsCallback,
  MultiValue,
  RAlertProps,
  RAnchorLinkProps,
  RAnchorProps,
  RAutocompleteProps,
  RAvatarProps,
  RBadgeProps,
  RBreadcrumbItemProps,
  RBreadcrumbProps,
  RButtonProps,
  RCardProps,
  RCascaderProps,
  RCheckTagProps,
  RCheckboxGroupProps,
  RCheckboxProps,
  RCollapseProps,
  RColorProps,
  RDateProps,
  RDescriptionsItemProps,
  RDescriptionsProps,
  RDialogProps,
  RDisplayCalendarProps,
  RDisplayCountdownProps,
  RDisplayIconProps,
  RDisplayImageProps,
  RDividerProps,
  RDrawerProps,
  RDropdownProps,
  REmptyProps,
  REntityPickerProps,
  RFileBrowserProps,
  RFilePathProps,
  RHtmlEditorProps,
  RIconProps,
  RImageProps,
  RLinkProps,
  RMentionProps,
  RMultiSelectProps,
  RNumberProps,
  RPageHeaderProps,
  RPaginationProps,
  RPopconfirmProps,
  RPopoverProps,
  RProgressProps,
  RRadioProps,
  RRateProps,
  RResultProps,
  RSectionProps,
  RSegmentedProps,
  RSelectProps,
  RSkeletonProps,
  RSliderProps,
  RSpaceProps,
  RStatisticProps,
  RStepsProps,
  RSwitchProps,
  RTabsProps,
  RTagProps,
  RTextDisplayProps,
  RTextareaProps,
  RTextProps,
  RTimePickerProps,
  RTimeSelectProps,
  RTimelineItemProps,
  RTooltipProps,
  RTourProps,
  RTransferProps,
  RTreeNodeSummaryProps,
  RTreeSelectProps,
  RUploadProps,
  TabsClickEvent,
  TagType,
  TourStep,
  TransferValue,
} from './components/index.js'

export type {
  PageContext,
} from './page/index.js'

// ── AI 会话监视组件 ──
export {
  AiSessionTracePanel,
  AiToolApprovalCard,
  AiToolApprovalPanel,
  SparkAgentPanel,
} from './ai/index.js'

export type {
  AiSessionTracePanelProps,
  SessionStreamViewProps,
  SessionChatBubbleProps,
  SessionReasoningBlockProps,
  SessionToolCallCardProps,
  SessionDiagnosticsPanelProps,
  AiToolApprovalCardProps,
  AiToolApprovalCardEmits,
  AiToolApprovalPanelProps,
  SparkAgentPanelProps,
  StreamDisplayEntry,
  ToolCallDisplayItem,
  ReasoningDisplayItem,
  SessionDiagnosticsData,
  SessionDiagnosticIssue,
  SparkAgentTimelineEvent,
  ToolApprovalDisplayItem,
} from './ai/index.js'
