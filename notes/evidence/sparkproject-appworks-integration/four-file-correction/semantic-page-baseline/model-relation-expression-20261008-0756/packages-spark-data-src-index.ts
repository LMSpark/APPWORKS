/**
 * @module @spark-appworks/spark-data:index
 * 职责：提供 spark-data 数据管线中的 index 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */
/**
 * @spark-appworks/spark-data
 * SPARK 数据空间 — 数据模型 + CRUD + 树结构 + 权限
 *
 * **推荐入口**：`SparkData` 命名空间（工厂方法 + 解析工具）
 *
 * 精简公共 API，只暴露外部消费者实际需要的最小集合：
 * - 命名空间：`SparkData`
 * - 核心类：`DataSet`、`DataView`（纯 TS，无框架依赖）
 * - DataViewKey / DataMember 解析工具函数
 * - 权限渲染常量
 * - 数据配置所需的类型
 */

// ===== 命名空间 API（推荐入口）=====

export { SparkData } from './spark-data'

// ===== 核心类（框架层必要直接引用）=====

export { DataSet } from './dataset'
export { DataTable } from './data-table'
export { DataView } from './data-view'
export { DataViewFilter } from './query/filter/data-view-filter'
export type { DataViewFilterTree, DataViewFilterOperator, DataViewFilterJsonValue } from './query/filter/data-view-filter-contract'
export type {
  DataViewFilterField, DataViewFilterFunctionContext, DataViewFilterValueFunction,
  DataViewFilterFunctionField, DataViewFilterIssue, DataViewFilterValidationContext,
} from './query/filter/data-view-filter-contract'
export {
  getDataViewFilterFieldOperators, getDataViewFilterFunctionDefinitions, isUnaryDataViewFilterOperator,
} from './query/filter/data-view-filter-catalog'
export { isDataRow } from './core/data-row-guards'

export type { FieldRenderState, PermissionActionContext } from './script-types'

export { TreeManager } from './node-tree/tree-manager'
export { DataSetCrudTool } from './dataset-crud-tool'

// ===== Node Tree（页面节点树模型，从 spark-project-model 迁入）=====

export {
  SPARK_NODE_STRUCT_KEYS,
  SPARK_PAGE_NODE_TYPE,
  SPARK_PAGE_ROOT_ID,
  SparkNodeTree,
  isSparkNode,
  normalizeSparkNode,
  getSparkNodeChildren,
  nodeId,
  nodeInputProp,
  nodeInputProps,
} from './node-tree'

export type {
  SparkNode,
  SparkNodeChildren,
  SparkNodeFindByTypeMatch,
  SparkNodeFindByTypeParams,
  SparkNodeFindByTypeResult,
  SparkNodeLocation,
  SparkNodeTreeChildrenParams,
  SparkNodeTreeLookupParams,
  SparkNodeAddResult,
  SparkNodeMoveResult,
  SparkNodeRemoveResult,
  SparkNodeReplaceResult,
  SparkNodeSetPropsResult,
  SparkNodeAddNodesResult,
  SparkNodeRemoveNodesResult,
  SparkNodeReplaceNodesResult,
  SparkNodeSetPropsBatchResult,
  SparkNodeTreeAddNodesParams,
  SparkNodeTreeAddParams,
  SparkNodeTreeMoveParams,
  SparkNodeTreeRemoveNodesParams,
  SparkNodeTreeRemoveParams,
  SparkNodeTreeReplaceNodesParams,
  SparkNodeTreeReplaceParams,
  SparkNodeTreeSetPropsParams,
  SparkNodeTreeReplaceNodesItem,
  SparkNodeTreeSetPropsBatchItem,
  SparkNodeTreeSetPropsBatchParams,
  SparkNodeTreeFromJsonOptions,
  SparkNodeTreeJsonInput,
  SparkNodeTreeMethodKey,
  SparkNodeTreeRootParams,
  SparkNodeTreeRuleJsonInput,
} from './node-tree'
export {
  clearDataSetSnapshots,
  commitDataSetSnapshot,
  createLocalStorageHistoryAdapter,
  formatPageDataSnapshot,
  getDataSetSnapshot,
  listDataSetSnapshots,
  resolveDataSetHistoryKey,
} from './dataset-history'
export type {
  DataSetCommitSnapshotOptions,
  DataSetHistorySnapshot,
  DataSetHistoryListOptions,
  DataSetHistoryScope,
  DataSetSnapshotSelector,
  DataSetHistoryStorageAdapter,
} from './dataset-history'

// ===== DataViewKey / DataMember 统一解析 =====

export {
  DataMember,
  isDataViewKey,
  parseDataViewKey,
  diagnoseDataViewKey,
  resolveDataViewKey,
  buildDataViewKey,
  resolveDataViewMember,
  diagnoseDataViewMember,
  resolveDataViewMemberBinding,
  getDataViewIdentity,
  resolveDataViewCapabilities,
} from './core/data-view-key'
export type {
  DataViewKeyDescriptor,
  DataViewKeyDiagnostic,
  DataViewKeyDiagnosticStatus,
  DataViewMemberBinding,
  DataViewMemberDescriptor,
  DataViewMemberDiagnostic,
  DataViewMemberDiagnosticStatus,
  DataViewMemberInput,
  DataViewMemberValue,
  ResolvedDataViewCapabilities,
} from './core/data-view-key'

// ===== 核心类型 =====

export type {
  // 基础数据行 / 数据源契约
  DataRow,
  DataSource,
  DataViewEditingFieldChangeEvent,
  DataViewApplyEditingRowsResult,
  DataSetSaveChangesOptions,
  DataSetSaveChangesResult,
  DataSetSaveChangesViewResult,
  DataSetSaveChangesViewSelector,
  DataSetSaveChangesMode,
  DataSetSaveChangesConfig,
  DataSetSaveChangesTransactionConfig,
  DataSetSaveChangesTransactionOptions,
  DataSetTransactionOperation,
  DataSetTransactionRequest,
  DataSetTransactionResponse,
  DataSetTransactionOperationResult,
  DataSetContract,

  // DataSet 配置（createDataSet / fromJson 参数类型）
  DataSetMetadata,
  TableMetadata,
  DataColumn,
  ColumnType,
  DataResourceRelation,
  DataResourceRelationFieldMapping,
  DataViewCascade,
  DataViewCascadeFilterBinding,
  DataViewCascadeSelector,
  DependencyType,
  TableResourceType,
  TableBusinessCategory,
  TableModelBinding,
  TableSemanticMetadata,
  CrudApi,
  CrudResult,
  HttpEndpoint,
  QueryParams,

  // 视图配置
  ViewMetadata,
  SortExpression,
  SortDirection,
  SortField,
  TreeConfig,
  TreePath,
  FlatTreeNode,
  NestedTreeNode,
  NestedTreeSearchResult,
  AggregateType,
  AggregateColumnConfig,

  // 提交模式
  CommitMode,

  // 事件订阅
  ViewChangeHandlers,

  // lowcode 后端最终权限快照
  DataPermissionSets,
  DataViewFieldProjection,
  DataViewQueryContext,
} from './types'

// ===== 枚举 & 权限渲染常量 =====

export {
  TABLE_RESOURCE_TYPE_RECOMMENDED_VALUES,
  TABLE_BUSINESS_CATEGORY_RECOMMENDED_VALUES,
  RequestState,
  FieldVisibility,
  ComponentLevel,
} from './types'

// ===== 列验证规则 =====

export { extractColumnRules, isColumnRequired } from './validation/column-validation'
export type { ColumnValidationRule, ValidationRuleType } from './validation/column-validation'

// ===== 事件发射器（spark-data 是 SSoT；spark-component 等下游 re-export） =====

export { createEventEmitter } from './core/event-emitter'
export type { SparkEventEmitter } from './types'
