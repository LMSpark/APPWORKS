/**
 * @module @spark-appworks/spark-component:components/containers/runtime/index
 * 职责：维护 @spark-appworks/spark-component 中 components/containers/runtime/index 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/containers/runtime/index 的声明、导出和使用边界时，从本模块开始。
 */
export {
  useContainerDataSource,
  useContainerDataSourceEffects,
} from '../data-views/view-data-source.js'

export {
  useContainerModuleContext,
  useContainerToolbar,
  useDataViewSyncGuard,
  type ToolbarPosition,
  type ContainerToolbarState,
  type DataViewSyncGuardState,
} from './container-ui.js'

export {
  useFormDetailContainer,
} from './container-form-detail.js'

export {
  useContainerGrid,
  useCompositeItemGrid,
  normalizeGridGap,
  normalizeSpan,
  type UseContainerGridOptions,
  type ContainerGridState,
  type CompositeItemGridState,
} from './container-layout.js'

export {
  useFilterPanel,
  type FilterPanelState,
} from './container-filter.js'

export {
  useDataViewEventBridge,
  type DataViewBridgeEventName,
  type DataViewBridgeBaseContext,
  type CurrentRowChangedContext,
  type SelectedRowsChangedContext,
  type RowsChangedContext,
  type ClearedContext,
  type RequestStateChangedContext,
  type SummaryChangedContext,
  type SelectionSummaryChangedContext,
  type MutatingChangedContext,
  type OriginatorFilterContext,
  type DataViewEventBridgeOptions,
} from './useDataViewEventBridge.js'
