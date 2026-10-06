/**
 * @module @spark-appworks/spark-component:components/containers/data-views/view-runtime-state
 * 职责：支撑 view-runtime-state（未注册组件类型）在 table-level/data-view-container 中的运行时协作，补齐配置、状态或渲染器之间的连接逻辑。
 * 边界：只覆盖当前组件目录 containers/data-views 的局部能力，不定义全局页面模型，也不越级操作业务数据源。
 * AI用途：需要判断 view runtime state 的组件分层、辅助类型或内部接线时，用本模块作为局部语义入口。
 */
import { computed, shallowRef } from 'vue'
import type { ComputedRef } from 'vue'
import {
  RequestState,
  type DataView,
  type DataColumn,
  type DataRow,
  type TreeConfig,
} from '@spark-appworks/spark-data'
import type { ValueRef } from '../../shared-types.js'
import { toDataRecord } from './data-row-utils.js'
import { useDataViewEventBridge } from '../runtime/useDataViewEventBridge.js'

/**
 * DataView 标识态：来自 DataView 快照的静态元信息。
 */
export type DataViewIdentityState = {
  /** DataView 所属表名，用于诊断和表级能力定位。 */
  tableName: ComputedRef<string>
  /** DataView 的视图 id；缺省时表示使用表默认视图。 */
  viewId: ComputedRef<string | undefined>
  /** 当前 DataView 的主键字段名。 */
  primaryKey: ComputedRef<string | undefined>
  /** 树形 DataView 的层级字段配置；非树形视图为空。 */
  treeConfig: ComputedRef<TreeConfig | undefined>
}

/** DataView 行数据态：当前视图下的行级数据与选择状态。 */
export type DataViewRowsState = {
  /** 当前页或当前视图范围内的行数据。 */
  rows: ComputedRef<readonly DataRow[]>
  /** 当前视图可渲染的列定义。 */
  columns: ComputedRef<readonly DataColumn[]>
  /** 当前行；表格高亮、详情容器和字段上下文共享该值。 */
  currentRow: ComputedRef<DataRow | null>
  /** 当前已选择行集合。 */
  selectedRows: ComputedRef<readonly DataRow[]>
  /** 当前处于编辑态的行集合。 */
  editingRows: ComputedRef<readonly DataRow[]>
  /** 当前视图是否启用多选能力。 */
  isMultiSelect: ComputedRef<boolean>
}

/** DataView 显示态：用于下拉/选择器等展示场景的 value/label 信息。 */
export type DataViewDisplayState = {
  /** 当前值字段的字符串化结果。 */
  value: ComputedRef<string>
  /** 当前显示标签；没有当前行或标签字段时为空。 */
  label: ComputedRef<string | null>
  /** 多选场景下的显示标签集合。 */
  labels: ComputedRef<readonly string[]>
}

/** DataView 后端最终权限快照。 */
export type DataViewPermissionState = {
  /** 当前 DataView 对应模型的读写权限配置。 */
}

/** DataView 请求与聚合态：分页、加载状态、聚合结果等运行时动态信息。 */
export type DataViewRequestAndAggregateState = {
  /** 当前数据请求状态，用于 loading/empty/error 渲染。 */
  requestState: ComputedRef<RequestState>
  /** 全量或当前查询条件下的聚合结果。 */
  aggregateResult: ComputedRef<AggregateResultState>
  /** 已选择行集合的聚合结果。 */
  selectionAggregateResult: ComputedRef<AggregateResultState>
  /** 当前查询结果总条数。 */
  total: ComputedRef<number>
  /** 当前页码，从 1 开始。 */
  page: ComputedRef<number>
  /** 当前分页大小。 */
  pageSize: ComputedRef<number>
  /** 当前是否存在本地或远端变更中的写操作。 */
  mutating: ComputedRef<boolean>
  /** 最近一次写操作错误。 */
  mutatingError: ComputedRef<Error | null>
  /** 最近一次加载数据错误。 */
  loadingError: ComputedRef<Error | null>
}

/** DataView 完整运行时投影（不含容器级解析上下文）。 */
export type DataViewRuntimeState = DataViewIdentityState & DataViewRowsState & DataViewPermissionState & DataViewDisplayState & DataViewRequestAndAggregateState

/** 容器级数据解析上下文（不属于 DataView 原始字段）。 */
export type ContainerDataViewContextState = {
  /** 容器最终解析到的数据视图实例。 */
  resolvedView: ComputedRef<DataView | null>
  /** 容器最终解析到的行上下文，优先来自 dataMember/dataField。 */
  resolvedDataRow: ComputedRef<DataRow | null>
}

/** 五类容器共享顶层视图态。 */
export type DataViewState = DataViewRuntimeState & ContainerDataViewContextState

/** 聚合结果运行时类型（key -> 聚合值）。 */
export type AggregateResultState = {
  readonly [key: string]: unknown}

/** resolvedView 的标准只读 ref 形态。 */
export type ResolvedViewRef = {
  /** 当前 DataView ref 值；为空表示容器还未解析到数据源。 */
  readonly value: DataView | null
}

const EMPTY_AGGREGATE_RESULT: AggregateResultState = Object.freeze({})
const EMPTY_SELECTION_AGGREGATE_RESULT: AggregateResultState = Object.freeze({})
const EMPTY_ROWS: readonly DataRow[] = Object.freeze([])
const EMPTY_COLUMNS: readonly DataColumn[] = Object.freeze([])
const EMPTY_LABELS: readonly string[] = Object.freeze([])

type DataViewRuntimeRevisions = {
  rowsRevision: ValueRef<number>
  selectionRevision: ValueRef<number>
  requestRevision: ValueRef<number>
  aggregateRevision: ValueRef<number>
  mutationRevision: ValueRef<number>
  configRevision: ValueRef<number>
  editingRevision: ValueRef<number>}

function normalizeAggregateResult(value: unknown, emptyValue: AggregateResultState): AggregateResultState {
  return toDataRecord(value) ?? emptyValue
}

function bumpRevision(revision: ValueRef<number>): void {
  revision.value += 1
}

function useDataViewRuntimeRevisions(resolvedView: ResolvedViewRef): DataViewRuntimeRevisions {
  const rowsRevision = shallowRef(0)
  const selectionRevision = shallowRef(0)
  const requestRevision = shallowRef(0)
  const aggregateRevision = shallowRef(0)
  const mutationRevision = shallowRef(0)
  const configRevision = shallowRef(0)
  const editingRevision = shallowRef(0)

  function bumpAll(): void {
    bumpRevision(rowsRevision)
    bumpRevision(selectionRevision)
    bumpRevision(requestRevision)
    bumpRevision(aggregateRevision)
    bumpRevision(mutationRevision)
    bumpRevision(configRevision)
    bumpRevision(editingRevision)
  }

  const handleRowsChanged = () => {
    bumpRevision(rowsRevision)
    // currentRow/selectedRows are row-derived getters; refresh them when row objects are replaced.
    bumpRevision(selectionRevision)
    bumpRevision(aggregateRevision)
  }

  useDataViewEventBridge({
    resolvedView,
    onDetached: bumpAll,
    onAttached: bumpAll,
    onRowsChanged: handleRowsChanged,
    onCurrentRowChanged: () => bumpRevision(selectionRevision),
    onSelectedRowsChanged: () => bumpRevision(selectionRevision),
    onRequestStateChanged: () => bumpRevision(requestRevision),
    onMutatingChanged: () => bumpRevision(mutationRevision),
    onSummaryChanged: () => bumpRevision(aggregateRevision),
    onSelectionSummaryChanged: () => bumpRevision(aggregateRevision),
    onConfigChanged: () => bumpRevision(configRevision),
    onEditingChanged: () => bumpRevision(editingRevision),
    onCleared: bumpAll,
  })

  return {
    rowsRevision,
    selectionRevision,
    requestRevision,
    aggregateRevision,
    mutationRevision,
    configRevision,
    editingRevision,
  }
}

/**
 * 将 DataView 实例统一投影为容器可消费的 UI 只读状态。
 */
export function useDataViewState(
  resolvedView: ResolvedViewRef,
): DataViewRuntimeState & DataViewPermissionState {
  const revisions = useDataViewRuntimeRevisions(resolvedView)

  const tableName = computed<string>(() => {
    revisions.configRevision.value
    return resolvedView.value?.tableName ?? ''
  })

  const viewId = computed<string | undefined>(() => {
    revisions.configRevision.value
    return resolvedView.value?.viewId
  })

  const primaryKey = computed<string | undefined>(() => {
    revisions.configRevision.value
    return resolvedView.value?.primaryKey
  })
  const treeConfig = computed<TreeConfig | undefined>(() => {
    revisions.configRevision.value
    return resolvedView.value?.treeConfig
  })

  const rows = computed<readonly DataRow[]>(() => {
    revisions.rowsRevision.value
    return resolvedView.value?.rows ?? EMPTY_ROWS
  })
  const columns = computed<readonly DataColumn[]>(() => {
    revisions.configRevision.value
    return resolvedView.value?.columns ?? EMPTY_COLUMNS
  })
  const currentRow = computed<DataRow | null>(() => {
    revisions.selectionRevision.value
    revisions.rowsRevision.value
    return resolvedView.value?.currentRow ?? null
  })
  const selectedRows = computed<readonly DataRow[]>(() => {
    revisions.selectionRevision.value
    revisions.rowsRevision.value
    return resolvedView.value?.selectedRows ?? EMPTY_ROWS
  })
  const editingRows = computed<readonly DataRow[]>(() => {
    revisions.editingRevision.value
    revisions.rowsRevision.value
    return resolvedView.value?.editingRows ?? EMPTY_ROWS
  })
  const isMultiSelect = computed<boolean>(() => {
    revisions.configRevision.value
    return resolvedView.value?.isMultiSelect ?? false
  })

  const value = computed<string>(() => {
    revisions.selectionRevision.value
    revisions.rowsRevision.value
    revisions.configRevision.value
    return resolvedView.value?.value ?? ''
  })
  const label = computed<string | null>(() => {
    revisions.selectionRevision.value
    revisions.rowsRevision.value
    revisions.configRevision.value
    return resolvedView.value?.label ?? null
  })
  const labels = computed<readonly string[]>(() => {
    revisions.selectionRevision.value
    revisions.rowsRevision.value
    revisions.configRevision.value
    return resolvedView.value?.labels ?? EMPTY_LABELS
  })

  const requestState = computed<RequestState>(() => {
    revisions.requestRevision.value
    return resolvedView.value?.requestState ?? RequestState.Idle
  })

  const aggregateResult = computed<AggregateResultState>(() => {
    revisions.aggregateRevision.value
    return normalizeAggregateResult(resolvedView.value?.aggregateResult, EMPTY_AGGREGATE_RESULT)
  })

  const selectionAggregateResult = computed<AggregateResultState>(() => {
    revisions.aggregateRevision.value
    return normalizeAggregateResult(resolvedView.value?.selectionAggregateResult, EMPTY_SELECTION_AGGREGATE_RESULT)
  })

  const total = computed<number>(() => {
    revisions.rowsRevision.value
    revisions.configRevision.value
    return resolvedView.value?.total ?? 0
  })
  const page = computed<number>(() => {
    revisions.rowsRevision.value
    revisions.configRevision.value
    return resolvedView.value?.page ?? 1
  })
  const pageSize = computed<number>(() => {
    revisions.rowsRevision.value
    revisions.configRevision.value
    return resolvedView.value?.pageSize ?? 20
  })

  const mutating = computed<boolean>(() => {
    revisions.mutationRevision.value
    return resolvedView.value?.mutating ?? false
  })
  const mutatingError = computed<Error | null>(() => {
    revisions.mutationRevision.value
    return resolvedView.value?.mutatingError ?? null
  })
  const loadingError = computed<Error | null>(() => {
    revisions.requestRevision.value
    return resolvedView.value?.loadingError ?? null
  })

  return {
    tableName, viewId, primaryKey, treeConfig,
    rows, columns, currentRow, selectedRows, editingRows, isMultiSelect,
    value, label, labels,
    requestState, aggregateResult, selectionAggregateResult,
    total, page, pageSize,
    mutating, mutatingError, loadingError,
  }
}
