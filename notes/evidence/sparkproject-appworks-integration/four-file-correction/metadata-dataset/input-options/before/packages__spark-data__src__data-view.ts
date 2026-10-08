/**
 * @module @spark-appworks/spark-data:data-view
 * 职责：提供 spark-data 数据管线中的 data view 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */
/**
 * DataView — 数据视图，SPARK 数据层的统一交互枢纽。
 * 引用链：DataView → DataTable → DataSet。
 * 级联加载：子订阅父，父不知子。
 * 请求编排：requestData(上行) / refresh(下行) / requestState(唯一状态源)。
 * 委托分工：CrudDelegate / CascadeDelegate / SelectionDelegate / etc.
 */

import { parseViewMetadataInput } from './metadata'
import type {
  DataRow, ViewMetadata, SortExpression,
  QueryParams, DataColumn, DataViewCascade,
  CrudResult, CrudOperationConfig,
  DataSource,
  AggregateResultRow,
  FlatTreeNode, TreePath, NestedTreeSearchResult, NestedTreeNode,
  TreeConfig, AggregateColumnConfig, CrudApi,
  CommitMode, RetrieveRecordOptions,
  SparkEventEmitter,
  DataViewEditingFieldChangeEvent, DataViewApplyEditingRowsResult,
  DataViewFieldProjection, DataViewQueryContext,
} from './types'

import { DataViewFilter } from './query/filter/data-view-filter'
import { DataViewFilterLocal } from './query/filter/data-view-filter-local'
import type { DataViewFilterTree } from './query/filter/data-view-filter-contract'
import { RequestState } from './types'
import { TreeManager } from './node-tree/tree-manager'
import type { DataTable } from './data-table'
import type { DataSet } from './dataset'
import type { CrudService } from './strategies/crud-service'
import type { DataValidator } from './validation/validation'
import { Logger, toErrorMessage, toError, isRecord } from '@spark-appworks/spark-utils'
import { createEventEmitter } from './core/event-emitter'
import { isDataRow } from './core/data-row-guards'
import { assertNoSeparator } from './core/utils'
import { CrudDelegate } from './strategies/crud-delegate'
import { CascadeDelegate } from './strategies/cascade-delegate'
import { SelectionDelegate } from './strategies/selection-delegate'
import { LocalMutationDelegate } from './strategies/local-mutation-delegate'
import type { CrudLifecycleEvent } from './strategies/types'

import { PrimaryKeyDelegate } from './strategies/primary-key-delegate'
import { ComputedColumnDelegate } from './strategies/computed-column-delegate'
import { DirtyTrackingDelegate } from './strategies/dirty-tracking-delegate'
import { AggregateDelegate } from './strategies/aggregate-delegate'
import type { RowDiff, SaveChangesData } from './strategies/dirty-tracking-delegate'


// ─────────────────────────────────────────────
// 事件类型映射
// ─────────────────────────────────────────────

/** DataView 事件映射 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DataViewEventMap = Record<string, any[]> & {
  /** 当前行变化 */
    currentRowChanged: [currentRow: DataRow | null, originatorId?: string]
    /** 选中行变化 */
    selectedRowsChanged: [selectedRows: DataRow[], originatorId?: string]
    /** 行数据批量变化（防抖 16ms） */
    rowsChanged: []
    /** 编辑态字段变化 */
    editingFieldChanged: [event: DataViewEditingFieldChangeEvent]
    /** 编辑态 patch 集合变化 */
    editingChanged: []
    /** 数据已清空 */
    cleared: []
    /** 视图配置变化（分页、排序、过滤、主键、树、聚合等） */
    configChanged: []
    /** 请求状态变化（Idle→Loading→Loaded/Failed） */
    requestStateChanged: [requestState: RequestState]
    /** CRUD 变更状态变化 */
    mutatingChanged: [mutating: boolean]
    /** aggregateResult 已重算 */
    summaryChanged: []
    /** selectionAggregateResult 已单独重算（仅选中行变更时触发，数据变更走 summaryChanged） */
    selectionSummaryChanged: []
    /** CRUD 提交前事件——业务脚本可调用 event.cancel() 取消操作 */
    'crud:before': [CrudLifecycleEvent]
    /** CRUD 提交后事件——业务脚本可根据 result 执行联动 */
    'crud:after': [CrudLifecycleEvent]}

/** 手动重算计算列时的通知选项。 */
export type DataViewRecomputeColumnsOptions = {
  /** 是否发出 rowsChanged 及聚合通知；false 表示仅更新内部派生值。 */
  emit?: boolean
}

/** 服务端行数据响应载荷。 */
export type DataViewServerRowsPayload = {
  /** 服务端返回的行数据列表。 */
  rows?: DataRow[]
  /** 服务端返回的总行数。 */
  total?: number
  /** 服务端返回或确认的当前页码。 */
  page?: number
  /** 服务端返回或确认的每页行数。 */
  pageSize?: number
}

/** 原查询绑定的场景与正式模型 Name；结果和保存上下文必须匹配此身份。 */
type DataViewQueryIdentity = Readonly<{ scenarioId: string; metaName: string }>
/** 查询 owner 提供的只读业务行；视图复制后编辑，原行保留为私有保存基线。 */
type DataViewQueryRow = Readonly<Record<string, unknown>>
/** 后端权限与当前可用状态共同决定的动作呈现，不等价于保存授权。 */
type DataViewActionState = 'hidden' | 'disabled' | 'enabled'
/** 字段读取、写入和组件呈现的独立通道；必填事实与写白名单由查询 owner 提供。 */
type DataViewFieldAccess = Readonly<{
  read: 'invisible' | 'masked' | 'visible'
  write: 'denied' | 'allowed'
  component: 'hidden' | 'readonly' | 'editable'
  required: boolean
  writeMode: 'required' | 'editable' | 'readonly'
}>
/** 单次查询的私有结果能力；持有原行身份、权限呈现与新增身份准备，不公开签名快照。 */
type DataViewQueryResult = Readonly<{
  rows: readonly DataViewQueryRow[]
  total: number
  assertIdentity(identity: DataViewQueryIdentity): void
  rowKey(row: DataViewQueryRow): unknown
  prepareNewRow?(row: DataViewQueryRow): Record<string, unknown>
  fieldAccess(rowKey: unknown, field: string): DataViewFieldAccess
  readFieldAccess(row: DataViewQueryRow, field: string): DataViewFieldAccess['read']
  addActionState(available?: boolean): DataViewActionState
  editActionState(rowKey: unknown, available?: boolean): DataViewActionState
  deleteActionState(rowKey: unknown, available?: boolean): DataViewActionState
  createChildActionState(rowKey: unknown, available?: boolean): DataViewActionState
  viewActionState(rowKey: unknown, available?: boolean): DataViewActionState
}>
/** 一次运行绑定的查询保存 owner；保存消费原查询上下文，数据层不依赖具体 API 包。 */
type DataViewQueryExecutor = Readonly<{
  executeQuery(view: DataView, params: QueryParams): Promise<DataViewQueryResult>
  save?(command: DataViewQuerySaveCommand): Promise<DataViewQuerySaveReceipt[]>
}>
/** 按新增、更新、删除分组的待保存业务行，捕获时已经剥离前端计算字段。 */
type DataViewQuerySaveChanges = Readonly<{
  added?: readonly DataViewQueryRow[]
  changed?: readonly DataViewQueryRow[]
  deleted?: readonly DataViewQueryRow[]
}>
/** 单模型保存输入，明确绑定原查询身份、私有上下文与当前变更。 */
type DataViewQuerySaveChange = Readonly<{
  identity: DataViewQueryIdentity
  context: DataViewQueryResult
  changes: DataViewQuerySaveChanges
}>
/** 同场景不同模型的一次保存命令；同模型多脏视图被拒绝，不承诺事务。 */
type DataViewQuerySaveCommand = Readonly<{
  changes: readonly DataViewQuerySaveChange[]
}>
/** 模型保存回执；真实接受行、逐行更新字段和新上下文用于接纳结果并保留在途新编辑。 */
type DataViewQuerySaveReceipt = Readonly<{
  metaName: string
  added: readonly DataViewQueryRow[]
  changed: readonly DataViewQueryRow[]
  deleted: readonly DataViewQueryRow[]
  changedFields: ReadonlyArray<readonly string[]>
  context: DataViewQueryResult
}>
type DataViewQuerySaveRow = Readonly<{ id: string | number; row: DataRow }>
/** 保存目标视图及可选本地行定位集合；省略 ids 时捕获全部待提交变更。 */
type DataViewQuerySaveTarget = Readonly<{ view: DataView; ids?: Array<string | number> }>
type DataViewQuerySaveCapture = Readonly<{
  executor: DataViewQueryExecutor
  identity: DataViewQueryIdentity
  context: DataViewQueryResult
  added: readonly DataViewQuerySaveRow[]
  changed: readonly DataViewQuerySaveRow[]
  deleted: readonly DataViewQuerySaveRow[]
}>
type DataViewQuerySaveAcceptance = DataViewQuerySaveCapture & Readonly<{
  receipt: DataViewQuerySaveReceipt
}>

const DENIED_FIELD_ACCESS: DataViewFieldAccess = Object.freeze({ read: 'invisible', write: 'denied',
  component: 'hidden', required: false, writeMode: 'readonly' })

/** rowsChanged 事件按微任务合并，保证同一同步批次只通知一次，同时让 Vue nextTick 可观测。 */
const REQUEST_SUPERSEDED_MESSAGE = 'Request superseded'

function dataRowFromRecord(record: Record<string, unknown>): DataRow {
  return { ...record }
}

function dataRowFromPartial(record: Partial<DataRow>): DataRow {
  return { ...record }
}

/** 行权限线协议字段属于单次查询的运行态，不得进入配置序列化。 */
function withoutPermissionWireFields(record: Partial<DataRow>): Partial<DataRow> {
  const { lingma_sys_params: _permissionSets, lingma_sys_key: _permissionToken, ...rest } = record
  return rest
}

function dataRowsFromUnknown(value: unknown, context: string): DataRow[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context}: rows 必须是数组`)
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`${context}: rows[${index}] 必须是对象`)
    }
    return dataRowFromRecord(item)
  })
}

function normalizeServerRowsData(
  data: unknown,
  context: string,
): DataViewServerRowsPayload | DataRow[] {
  if (Array.isArray(data)) return dataRowsFromUnknown(data, context)
  const record = isRecord(data) ? data : null
  if (record === null) {
    throw new Error(`${context}: 服务端响应必须是数组或对象`)
  }

  const normalized: DataViewServerRowsPayload = {}
  if (record['rows'] !== undefined) normalized.rows = dataRowsFromUnknown(record['rows'], context)
  if (typeof record['total'] === 'number') normalized.total = record['total']
  if (typeof record['page'] === 'number') normalized.page = record['page']
  if (typeof record['pageSize'] === 'number') normalized.pageSize = record['pageSize']
  return normalized
}

// ─────────────────────────────────────────────
// DataView 类
// ─────────────────────────────────────────────

/**
 * DataView - 单个表视图的数据操作子模块。
 * 查询失败保留旧结果并暂停写入；重试成功才恢复，等待期间的编辑必须显式处理。
 *
 */
export class DataView implements DataSource {

  // ─────────────────────────────────────────────
  // DataTable 引用（运行时注入，由 DataTable 在 attach 时赋值）
  // ─────────────────────────────────────────────

  /** 内部存储的 DataTable 引用（运行时由 DataTable.attach 注入） */
  private _dataTable: DataTable | null = null

  /** 列名→列定义缓存 */
  private _columnMap?: Map<string, DataColumn>

  /** 所属 DataTable（赋值时自动重编译计算列）。未 attach 时返回 null，便于任意响应式代理安全读取。 */
  get dataTable(): DataTable | null {
    return this._dataTable
  }
  set dataTable(table: DataTable) {
    this._dataTable = table
    this._rebuildColumnMap()
    // 统一注册 _pk 计算列（单列 / 多列 / 默认 'id' 均覆盖）
    this._primaryKeyDelegate.ensurePkColumn()
    // 注入 _pk 列元数据（table.columns + _columnMap）
    this._ensurePkColumnMeta(table)
    if (this.rows.length > 0) this._applyComputedColumns(this.rows)
    this._computedDelegate.invalidateCache()
    this._computedDelegate.syncFromConfig()
    if (this._shouldApplyStaticLocalFilter() && this.filterExpression !== undefined && this.rows.length > 0) {
      this._syncStaticLocalFilterRows()
    }
  }

    /** 数据表名。 */
tableName: string
    /** 视图标识。 */
viewId: string

  /** 当前模型视图对 DataTable 资源字段的稳定投影。 */
  fieldProjection: readonly DataViewFieldProjection[] = []

  /** 每次查询的输入参数；与私有的结果权限上下文分离。 */
  queryContext: DataViewQueryContext = {}

    /** 行数据集合。 */
rows: DataRow[] = []

  /** 与当前 rows 同一次查询登记的后端最终权限事实。 */

  #queryExecutor: DataViewQueryExecutor | undefined
  #queryResult: DataViewQueryResult | undefined
  #computedQueryToken: object | undefined
  #queryOriginalRows = new WeakMap<DataRow, DataViewQueryRow>()
  #ingestingQueryResult = false

  /** 一次运行只绑定一个查询 owner；改变绑定必须重新装配，数据层不依赖 API 包。 */
  bindQueryExecutor(executor: DataViewQueryExecutor): void {
    this.checkDestroyed()
    if (this.#queryExecutor === executor) return
    if (this.#queryExecutor !== undefined || this.currentLoadRequestId !== 0) {
      throw new Error('DATA_VIEW_QUERY_IDENTITY: 查询 owner 不可改绑，请重新装配运行 DataSet')
    }
    this.assertResultReplacementAllowed()
    this.queryIdentity()
    this.#queryExecutor = executor
  }

  /** 返回字段双通道呈现；查询失败暂停写入，不公开原权限或保存凭据。 */
  fieldAccess(row: DataRow | null, field: string): DataViewFieldAccess {
    const context = this.currentQueryResult()
    if (!context || !row) return DENIED_FIELD_ACCESS
    if (this._computedDelegate.isConfigured(field)) {
      const read = this.#computedQueryToken && this._computedDelegate.configuredReadAccess(row, field, this.#computedQueryToken)
        ? 'visible' : 'invisible'
      return { ...DENIED_FIELD_ACCESS, read, component: read === 'visible' ? 'readonly' : 'hidden' }
    }
    if (this.primaryKey === '') {
      const original = this.rows.includes(row) ? this.#queryOriginalRows.get(row) : undefined
      const read = original ? context.readFieldAccess(original, field) : 'invisible'
      return { ...DENIED_FIELD_ACCESS, read, component: read === 'invisible' ? 'hidden' : 'readonly' }
    }
    const access = context.fieldAccess(context.rowKey(row), field)
    if (!this._resultStale) return access
    return { ...access, write: 'denied', writeMode: 'readonly',
      component: access.read === 'invisible' ? 'hidden' : 'readonly' }
  }

  /** @internal Configured calculations consume only fields visible in this view's current query. */
  computedInputIsVisible(row: DataRow, field: string): boolean {
    const context = this.currentQueryResult()
    if (!context || !this.columns.some(column => column.name === field && !column.computeExpression && !column.isComputed)) return false
    if (!Object.hasOwn(row, field)) return false
    if (this.primaryKey === '') {
      const original = this.#queryOriginalRows.get(row)
      return original !== undefined && context.readFieldAccess(original, field) === 'visible'
    }
    const key = context.rowKey(row)
    return context.fieldAccess(key, field).read === 'visible'
  }

  /** @internal Independent generation token for computed reads; never exposes the query owner context. */
  computedQueryToken(): object | undefined { return this.#computedQueryToken }

  /** 新增呈现来自原查询模型权限，旧结果期间只保留展示。 */
  addActionState(available = true): DataViewActionState {
    return this.currentQueryResult()?.addActionState(available && !this._resultStale) ?? 'hidden'
  }

  /** 行编辑呈现来自原 E 汇总，并受当前结果可写状态约束。 */
  editActionState(row: DataRow | null, available = true): DataViewActionState {
    const context = this.currentQueryResult()
    return context && row ? context.editActionState(context.rowKey(row), available && !this._resultStale) : 'disabled'
  }

  /** 删除呈现消费后端行权限。 */
  deleteActionState(row: DataRow | null, available = true): DataViewActionState {
    const context = this.currentQueryResult()
    return context && row ? context.deleteActionState(context.rowKey(row), available && !this._resultStale) : 'disabled'
  }

  /** 树行新增子行呈现消费后端 c，不由模型新增权限推测。 */
  createChildActionState(row: DataRow | null, available = true): DataViewActionState {
    const context = this.currentQueryResult()
    return context && row ? context.createChildActionState(context.rowKey(row), available && !this._resultStale) : 'disabled'
  }

  /** 查看只消费已登记返回行的身份。 */
  viewActionState(row: DataRow | null, available = true): DataViewActionState {
    const context = this.currentQueryResult()
    return context && row ? context.viewActionState(context.rowKey(row), available) : 'disabled'
  }

  private queryIdentity(): DataViewQueryIdentity {
    const scenarioId = this.dataSet?.scenarioId
    const metaName = this._dataTable?.modelBinding?.modelName
    if (!scenarioId || !metaName) throw new Error('DATA_VIEW_QUERY_IDENTITY: 查询必须绑定明确场景与模型')
    return { scenarioId, metaName }
  }

  private currentQueryResult(): DataViewQueryResult | undefined {
    this.checkDestroyed()
    this.#queryResult?.assertIdentity(this.queryIdentity())
    return this.#queryResult
  }

  // ─────────────────────────────────────────────
  // 主键（全部委托给 _primaryKeyDelegate）
  // ─────────────────────────────────────────────

  /** 主键字段名 getter/setter（委托给 _primaryKeyDelegate） */
  get primaryKey(): string { return this._primaryKeyDelegate.primaryKey }
  set primaryKey(value: string) {
    this._primaryKeyDelegate.primaryKey = value
    // 重新注册 _pk 计算列（基于新的覆盖字段）
    this._primaryKeyDelegate.ensurePkColumn()
    if (this._dataTable) this._ensurePkColumnMeta(this._dataTable)
    if (this.rows.length > 0) this._applyComputedColumns(this.rows)
    this.emitConfigChanged()
  }

  /** 清除显式覆盖，恢复从 DataTable 列定义自动推导主键 */
  resetPrimaryKey(): void {
    this._primaryKeyDelegate.resetPrimaryKey()
    // 重新注册 _pk 计算列（基于列定义推导）
    this._primaryKeyDelegate.ensurePkColumn()
    if (this._dataTable) this._ensurePkColumnMeta(this._dataTable)
    if (this.rows.length > 0) this._applyComputedColumns(this.rows)
    this.emitConfigChanged()
  }

  // ─────────────────────────────────────────────
  // 选中状态（主键存储，getter 按需解析）
  // ─────────────────────────────────────────────

  /** 当前行主键值（null 表示未选中）。通过 currentRow getter 取对应行对象 */
  _currentRowId: string | number | null = null
  /** 多选行主键值列表。通过 selectedRows getter 取对应行对象数组 */
  _selectedRowIds: Array<string | number> = []

  // ─────────────────────────────────────────────
  // 选中值序列化配置（单选 / 多选通用）
  // ─────────────────────────────────────────────

  /** 值字段名（用于 value getter/setter 序列化），未指定时回退到主键字段 */
  valueField?: string | string[]
  /** 标签显示字段名（用于 labels/label getter），未指定时回退到主键值字符串 */
  labelField?: string
  /** 值序列化分隔符（默认 ','）。非空=多选，空字符串=单选 */
  selectionDelimiter = ','

  /** 是否为多选模式（selectionDelimiter 非空时为多选） */
  get isMultiSelect(): boolean { return this.selectionDelimiter !== '' }

  /** 当前行（getter：按主键从整棵 rows 树查找，带缓存；rows 刷新后自动指向新对象） */
  get currentRow(): DataRow | null {
    if (this._currentRowId === null) return null
    const c = this._crCache
    if (c.id === this._currentRowId && c.ver === this._rowsVersion) return c.row
    const row = this.getRowById(this._currentRowId)
    this._crCache = { id: this._currentRowId, ver: this._rowsVersion, row }
    return row
  }

  /** 多选行数组（getter：按主键从整棵 rows 树查找，带缓存；rows 刷新后自动指向新对象） */
  get selectedRows(): DataRow[] {
    if (this._selectedRowIds.length === 0) return []
    const c = this._srCache
    if (c.selVer === this._selectionIdsVersion && c.rowsVer === this._rowsVersion) return c.rows
    const rowById = this.getRowByIdMap()
    const rows = this._selectedRowIds
      .map(id => rowById.get(id) ?? null)
      .filter((row): row is DataRow => row !== null)
    this._srCache = { selVer: this._selectionIdsVersion, rowsVer: this._rowsVersion, rows }
    return rows
  }

  // ─────────────────────────────────────────────
  // 值序列化层（委托给 SelectionDelegate）
  // ─────────────────────────────────────────────

  /** 选中行的序列化字符串（供 v-model / API 传值） */
  get value(): string { return this.selectionDelegate.value }
  set value(v: string | null | undefined) { this.selectionDelegate.value = v }

  /** 选中行的显示标签数组（供渲染 tag 使用） */
  get labels(): string[] { return this.selectionDelegate.labels }

  /** 当前行的显示标签，无当前行时返回 null */
  get label(): string | null { return this.selectionDelegate.label }

  // ─────────────────────────────────────────────
  // 选中状态操作（委托给 SelectionDelegate）
  // ─────────────────────────────────────────────

  /**
   * 设置当前行（自动提取主键存储，null 清除）。
   *
   * @param row 要设为当前行的行对象；null 表示清除当前行。
   * @param originatorId 可选变更来源标识，用于级联订阅方避免回环。
   */
  setCurrentRow(row: DataRow | null, originatorId?: string): void {
    this.selectionDelegate.setCurrentRow(row, originatorId)
  }

  /**
   * 通过主键设置当前行（行不存在时返回 false）。
   *
   * @param id 目标行主键值；null 表示清除当前行。
   * @param originatorId 可选变更来源标识，用于级联订阅方避免回环。
   */
  setCurrentRowById(id: string | number | null, originatorId?: string): boolean {
    return this.selectionDelegate.setCurrentRowById(id, originatorId)
  }

  /**
   * 设置多选行（覆盖式）。
   *
   * @param rows 新的选中行列表。
   * @param originatorId 可选变更来源标识，用于级联订阅方避免回环。
   */
  setSelectedRows(rows: DataRow[], originatorId?: string): void {
    this.selectionDelegate.setSelectedRows(rows, originatorId)
  }

  /**
   * 追加多选行（返回实际新增数量）。
   *
   * @param rows 要追加到选中集的行列表。
   */
  addSelectedRows(rows: DataRow[]): number {
    return this.selectionDelegate.addSelectedRows(rows)
  }

  /**
   * 移除多选行（返回实际移除数量）。
   *
   * @param rows 要从选中集中移除的行列表。
   */
  removeSelectedRows(rows: DataRow[]): number {
    return this.selectionDelegate.removeSelectedRows(rows)
  }

  /**
   * 通过主键批量移除多选行（返回实际移除数量）。
   *
   * @param ids 要从选中集中移除的行主键值列表。
   */
  removeSelectedRowsById(ids: Array<string | number>): number {
    return this.selectionDelegate.removeSelectedRowsById(ids)
  }

  /** 清空多选行 */
  clearSelectedRows(): void {
    this.selectionDelegate.clearSelectedRows()
  }

  // ─────────────────────────────────────────────
  // 分页 & 加载状态
  // ─────────────────────────────────────────────

    /** 总记录数。 */
total = 0
    /** 当前页码。 */
page = 1
    /** 分页大小。 */
pageSize = 20

    /** loading Error 错误信息。 */
loadingError: Error | null = null
  /** 请求状态机，见 {@link RequestState}。唯一状态源，勿另设布尔标志。 */
  requestState: RequestState = RequestState.Idle
  /** 增删改批网络请求进行中（与 requestState 独立，可同时为 true） */
  mutating = false
  /** 最近一次增删改批操作的错误；成功或未发起时为 null */
  mutatingError: Error | null = null

  // ─────────────────────────────────────────────
  // 视图配置
  // ─────────────────────────────────────────────

  private appliedFilter: DataViewFilter | undefined

  /** SPARK 公开过滤树；所有入口解析为私有不可变快照，修改前保护未保存数据。 */
  get filterExpression(): DataViewFilterTree | undefined { return this.appliedFilter?.toJSON() }
  set filterExpression(input: DataViewFilterTree | undefined) {
    const next = input === undefined ? undefined : this._parseFilter(input)
    if (this.appliedFilter?.serialize() === next?.serialize()) return
    this.assertResultReplacementAllowed()
    const localRows = this._shouldApplyStaticLocalFilter() ? this._filteredLocalRows(next) : undefined
    if (next !== undefined && localRows === undefined) this._validateRemoteFilterFields(next.toJSON())
    this.appliedFilter = next
    this.page = 1
    if (localRows !== undefined) this._replaceLocalFilterRows(localRows)
    this.emitConfigChanged()
  }
    /** sort Expression 字段。 */
sortExpression?: SortExpression
  /** 请求成功后是否自动 currentRow = rows[0]（默认 true） */
  autoCurrentFirst = true
  /** 请求成功后是否自动 selectedRows = [rows[0]]（默认 true） */
  autoSelectFirst = true
  /** 树结构字段配置 */
  treeConfig?: TreeConfig

  /** DataSet 初始化后是否自动加载数据（默认 false） */
  autoLoad = false
  /** autoLoad 是否来自显式视图配置，而不是类默认值。 */
  autoLoadConfigured = false

  private _shouldApplyStaticLocalFilter(): boolean {
    const table = this._dataTable
    if (!table) return false
    if (this.#queryExecutor !== undefined) return false
    return table.resourceType === 'static-data' || (table.api?.list === undefined && this.rows.length > 0)
  }

  /** 远端数据来源的行是查询结果，不属于配置，序列化时不写出。 */
  private _holdsRemoteRows(): boolean {
    const table = this._dataTable
    if (this.#queryExecutor !== undefined) return true
    if (table === null || table.resourceType === 'static-data') return false
    return table.resourceType !== undefined || table.api?.list !== undefined
  }

  private _getStaticLocalFilterSourceRows(): DataRow[] {
    const sourceRows = this._dataTable?.rows ?? this.rows
    const clonedRows = sourceRows.map(row => ({ ...row }))
    if (clonedRows.length > 0) this._applyComputedColumns(clonedRows)
    return clonedRows
  }

  private _getAvailableLocalFilterFields(): ReadonlySet<string> {
    const fields = new Set<string>()

    if (this._columnMap) {
      for (const fieldName of this._columnMap.keys()) fields.add(fieldName)
    }

    const rows = this._getStaticLocalFilterSourceRows()
    for (const row of rows) {
      for (const fieldName of Object.keys(row)) fields.add(fieldName)
    }

    return fields
  }

  private _assertKnownFilterFieldExists(fieldName: string): void {
    if ((this._columnMap?.size ?? 0) === 0) return
    if (this.getColumn(fieldName) !== undefined) return
    throw new Error(`过滤表达式引用了不存在的字段 "${fieldName}"`)
  }

  private _parseFilter(input: unknown): DataViewFilter {
    const result = DataViewFilter.parse(input)
    if (!result.ok) throw new Error(result.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n'))
    return result.value
  }

  private _validateRemoteFilterFields(tree: DataViewFilterTree): void {
    if ('logic' in tree) tree.filters.forEach(child => this._validateRemoteFilterFields(child))
    else this._assertKnownFilterFieldExists(tree.field)
  }

  private _isSameFilterExpression(left: DataViewFilterTree | undefined, right: DataViewFilterTree | undefined): boolean {
    return left === right || JSON.stringify(left) === JSON.stringify(right)
  }

  private _createRequestSupersededResult<T = unknown>(): CrudResult<T> {
    return { success: false, message: REQUEST_SUPERSEDED_MESSAGE }
  }

  private _mergeRemoteFilters(cascadeFilter: DataViewFilterTree | undefined, userFilter: DataViewFilterTree | undefined): DataViewFilterTree | undefined {
    if (!cascadeFilter) return userFilter
    if (!userFilter) return cascadeFilter
    return DataViewFilter.group({ logic: 'and', filters: [cascadeFilter, userFilter] }).toJSON()
  }

  private _filteredLocalRows(filter: DataViewFilter | undefined): DataRow[] {
    const sourceRows = this._getStaticLocalFilterSourceRows()
    if (filter === undefined) return sourceRows
    const local = new DataViewFilterLocal(filter)
    local.validateFields(this._getAvailableLocalFilterFields())
    return sourceRows.filter(row => local.matches(row))
  }

  private _replaceLocalFilterRows(rows: DataRow[]): void {
    this.localMutationDelegate.replaceRows(rows)
    this.syncTreeManagerFromRows()
    this.total = rows.length
  }

  private _syncStaticLocalFilterRows(): void {
    if (!this._shouldApplyStaticLocalFilter()) return
    this.assertResultReplacementAllowed()
    this._replaceLocalFilterRows(this._filteredLocalRows(this.appliedFilter))
  }

  /**
   * 增删改提交模式（默认 `'immediate'`）。
   *
   * - `'immediate'`：每次 addRow/editRowById/removeRow 立即调用网络 CRUD（如已配置 API）
   * - `'staged'`：仅修改内存并标脏，调用 saveChanges() 批量提交
   */
  commitMode: CommitMode = 'immediate'

  /** 视图级聚合配置——行变更后自动重算 aggregateResult / selectionAggregateResult。仅由 applyViewConfig() 初始化 */
  readonly aggregates: Record<string, AggregateColumnConfig> = {}

  /** 树视图模式，代理到 treeConfig.treeMode（默认 'flat'） */
  get treeMode(): 'flat' | 'nested' { return this.treeConfig?.treeMode ?? 'flat' }
  set treeMode(v: 'flat' | 'nested') {
    (this.treeConfig ??= {}).treeMode = v
    this.emitConfigChanged()
  }

  // ─────────────────────────────────────────────
  // 计算列
  // ─────────────────────────────────────────────

  /**
   * 设置计算列共享上下文（表达式中通过 ctx 引用），重新编译并对现有 rows 求值。
   *
   * @param ctx 计算列表达式可通过 ctx 读取的共享上下文。
   */
  setComputedContext(ctx: Record<string, unknown>): void {
    this._computedDelegate.setContext(ctx)
    this._applyComputedColumns(this.rows)
    this.aggregateDelegate.recompute(this.rows, this.selectedRows)
    this.emitRowsChanged()
  }

  /**
   * 手动触发全量计算列重新求值 + 聚合重算。常规行操作已自动触发，仅用于特殊场景。
   *
   * @param options 重算通知选项。
   */
  recomputeColumns(options?: DataViewRecomputeColumnsOptions): void {
    this._applyComputedColumns(this.rows)
    const aggregateOptions = options?.emit === undefined ? undefined : { emit: options.emit }
    this.aggregateDelegate.recompute(this.rows, this.selectedRows, aggregateOptions)
    if (options?.emit !== false) this.emitRowsChanged()
  }

  /** @internal 已注册的计算列名集合（CrudDelegate 用于提交前剥离） */
  get computedColumnNames(): ReadonlySet<string> {
    return this._computedDelegate.names
  }

  /** @internal 从数据对象中移除计算列字段，返回浅拷贝；无计算列时返回原对象。 */
  stripComputedColumns(data: Partial<DataRow>): Partial<DataRow> {
    return this._computedDelegate.strip(data)
  }

  private getCrudApiConfig(): CrudApi | undefined {
    return this._dataTable?.api
  }

  private shouldDirectCommitCrud(operation: 'create' | 'update' | 'delete'): boolean {
    if (this.#queryExecutor !== undefined) return false
    if (this.commitMode === 'staged') return false
    const api = this.getCrudApiConfig()
    if (!api) return false
    return api[operation] !== undefined
  }

  /** @internal DataSet 资源关系与视图级联索引完成后由 DataTable 调用——重挂级联订阅并重编译计算列（含聚合 resolver） */
  onDataSetStructureReady(): void {
    // DataTable.setDataSet() 发生在 DataSet 展开视图级关系之前，
    // 关系图就绪后需要重新挂载一次 cascade 订阅，确保 currentRow 联动真正生效。
    this.cascade.setupCascade()

    const hasComputedCols = this._computedDelegate.names.size > 0
    const hasAgg = Object.keys(this.aggregates).length > 0
    if (hasComputedCols) {
      // 失效缓存 → 重编译（含完整 DataSet 聚合 resolver）
      this._computedDelegate.invalidateCache()
      this._computedDelegate.syncFromConfig()
    }
    if (hasComputedCols || hasAgg) {
      this.recomputeColumns({ emit: false })
    }
  }

  /** 对行集合及其嵌套子节点执行计算列求值（就地写入）——供 DataView 内部调用。 */
  private _applyComputedColumns(rows: DataRow[]): void {
    const allRows: DataRow[] = []
    const stack = [...rows]
    while (stack.length > 0) {
      const row = stack.shift()
      if (row === undefined) continue
      allRows.push(row)
      const children = row['children']
      if (Array.isArray(children) && children.length > 0) {
        stack.unshift(...children.filter(isDataRow))
      }
    }
    this._computedDelegate.apply(allRows)
  }

  // ─────────────────────────────────────────────
  // 表元数据暴露（DataSource.columns 实现）
  // ─────────────────────────────────────────────

  /**
   * 列定义数组（只读，来自 DataTable.columns）。
   *
   * UI 组件通过此属性获取列名、标题、类型、可见性、可编辑性等元数据，
   * 无需直接访问 DataTable。
   *
   * @returns DataTable 的列定义数组；DataTable 未关联时返回空数组
   */
  get columns(): readonly DataColumn[] {
    const table = this._dataTable
    if (table === null || this.fieldProjection.length === 0) return table?.columns ?? []
    const projected = this.fieldProjection
      .filter((field) => field.output)
      .map((field) => {
        const resourceColumn = table.columns.find((column) => column.name === field.resourceField)
        return {
          ...(resourceColumn ?? {}),
          name: field.viewField,
          type: field.type,
          label: field.label
            ? field.label
            : resourceColumn?.label ?? field.viewField,
          isPrimaryKey: field.primaryKey,
        }
      })
    const localColumns = table.columns.filter(column =>
      (column.name === '_pk' || Boolean(column.computeExpression))
      && !projected.some(field => field.name === column.name))
    return [...projected, ...localColumns]
  }

  /**
   * 按名称获取单个列定义
   *
   * @param name 列名（精确匹配）
   * @returns 对应的列定义，不存在时返回 undefined
   *
   * @example
   * ```ts
   * const col = view.getColumn('price')
   * if (col) {
   *   console.log(col.label)   // '单价'
   *   console.log(col.type)    // 'number'
   * }
   * ```
   */
  getColumn(name: string): DataColumn | undefined {
    return this._columnMap?.get(name)
  }

  /** @internal 返回 DataSet 实例 */
  getDataSet() { return this._dataTable?.dataSet }

  /**
   * 确保 `_pk` 列元数据存在于 `table.columns` 和 `_columnMap` 中。
   *
   * - 已存在时替换（PK 配置可能变化导致 type 不同）
  * - `table.columns` 保证运行时元数据完整；`toJson()` 通过 `isComputed` 过滤排除
   */
  private _ensurePkColumnMeta(table: DataTable): void {
    const meta = this._primaryKeyDelegate.getPkColumnMeta()
    const idx = table.columns.findIndex(c => c.name === '_pk')
    if (idx >= 0) {
      table.columns = table.columns.map((c, i) => i === idx ? meta : c)
    } else {
      table.columns = [...table.columns, meta]
    }
    this._columnMap?.set('_pk', meta)
  }

  private _rebuildColumnMap(): void {
    this._columnMap = new Map(this.columns.map((column) => [column.name, column]))
  }

  // ─────────────────────────────────────────────
  // 视图聚合（aggregateResult / selectionAggregateResult）
  // ─────────────────────────────────────────────

  /** 全量聚合输出行——字段来自 aggregates 的 key，值由对应 AggregateColumnConfig 计算 */
  get aggregateResult(): Readonly<AggregateResultRow> {
    return this._aggregateDelegate?.aggregateResult ?? {}
  }

  /** 选中行聚合输出行——字段结构与 aggregateResult 相同，仅对 selectedRows 执行 */
  get selectionAggregateResult(): Readonly<AggregateResultRow> {
    return this._aggregateDelegate?.selectionAggregateResult ?? {}
  }

    /** tree Manager 字段。 */
treeManager?: TreeManager | undefined

  // ─────────────────────────────────────────────
  // 私有状态
  // ─────────────────────────────────────────────

  /** 行数据版本号——每次 postMutation 后自增，用于 currentRow / selectedRows 缓存失效 */
  private _rowsVersion = 0
  /** 选中 ID 版本号——每次 emitSelectedRowsChanged 后自增 */
  private _selectionIdsVersion = 0
  /** currentRow getter 缓存 */
  private _crCache: { id: string | number | null; ver: number; row: DataRow | null } = { id: null, ver: -1, row: null }
  /** selectedRows getter 缓存 */
  private _srCache: { selVer: number; rowsVer: number; rows: DataRow[] } = { selVer: -1, rowsVer: -1, rows: [] }
  /** 整棵 rows 树的 ID → row 缓存（含 nested children） */
  private _rowByIdCache: { ver: number; rows: Map<string | number, DataRow> } = { ver: -1, rows: new Map() }

  /** 编辑态 patch：UI 字段变化先进入这里，apply 后再进入 editRowById / dirtyTracking。 */
  private _editingPatches = new Map<string | number, Partial<DataRow>>()
  /** 首次进入编辑态前的行快照，用于 discard / diff / 诊断。 */
  private _editingOriginalRows = new Map<string | number, DataRow>()

  /** 当前 loadFromServer 请求 ID（用于防止竞态） */
  private currentLoadRequestId = 0
  /** 并发 CRUD 请求计数器（支持多操作同时在途） */
  private _mutatingCount = 0
  /** 销毁状态标记 */
  private _isDestroyed = false
  /** 失败后保留的结果基线在重试期间也不可写；只有成功登记新结果才恢复。 */
  private _resultStale = false
  /** requestData() 进行中的 Promise（用于并发调用复用，避免丢弃后续请求） */
  private _pendingRequestData: Promise<void> | null = null
  /** 行索引缓存（用于加速 updateRowById 行对象替换）——由 LocalMutationDelegate 管理，内部状态勿直接操作 */
  rowIndexMap?: Map<DataRow, number> | undefined
  /** rowsChanged 事件微任务合并标记 */
  private rowsChangedDebouncer = false
  /** rowsChanged 防抖窗口内是否需要补发 selection/currentRow 领域事件 */
  private pendingRowsSelectionChanged = false

  private emitEditingChanged(event?: DataViewEditingFieldChangeEvent): void {
    if (event) this.events.emit('editingFieldChanged', event)
    this.events.emit('editingChanged')
  }

  private clearEditingState(): boolean {
    if (this._editingPatches.size === 0 && this._editingOriginalRows.size === 0) return false
    this._editingPatches.clear()
    this._editingOriginalRows.clear()
    return true
  }

  private setRequestState(nextState: RequestState): void {
    const previousState = this.requestState
    if (nextState === RequestState.Failed) this._resultStale = true
    else if (nextState === RequestState.Loaded) this._resultStale = false
    this.requestState = nextState
    if (previousState !== nextState) {
      this.events.emit('requestStateChanged', this.requestState)
    }
  }

  /** 深度遍历整棵 rows 树（含 nested children） */
  private visitRowsDeep(visitor: (row: DataRow) => void): void {
    const stack = [...this.rows]
    while (stack.length > 0) {
      const row = stack.shift()
      if (!row) continue
      visitor(row)
      const children = row['children']
      if (Array.isArray(children) && children.length > 0) {
        stack.unshift(...children.filter(isDataRow))
      }
    }
  }

  /** 获取整棵 rows 树的 ID → row 映射（rowsVersion 缓存） */
  private getRowByIdMap(): Map<string | number, DataRow> {
    if (this._rowByIdCache.ver === this._rowsVersion) return this._rowByIdCache.rows
    const rows = new Map<string | number, DataRow>()
    this.visitRowsDeep(row => {
      const pk = this.getPkKey(row)
      if (pk !== undefined) rows.set(pk, row)
    })
    this._rowByIdCache = { ver: this._rowsVersion, rows }
    return rows
  }

  /** 按 ID 从整棵 rows 树查找节点 */
  private getRowById(id: string | number): DataRow | null {
    return this.getRowByIdMap().get(id) ?? null
  }

  private _syncRetrievedRow(
    row: DataRow,
    options?: RetrieveRecordOptions,
    fallbackId?: string | number,
  ): void {
    if (options?.syncToRows === false) {
      if (options.setCurrentRow) {
        const resolvedPk = this.getPkKey(row) ?? fallbackId
        if (resolvedPk !== undefined) this.setCurrentRowById(resolvedPk)
      }
      return
    }

    const resolvedPk = this.getPkKey(row) ?? fallbackId
    let syncedPk = resolvedPk

    if (resolvedPk !== undefined) {
      const updated = this.updateRowById(resolvedPk, row)
      if (!updated) {
        this.appendRow(row)
        syncedPk = this.getPkKey(row) ?? resolvedPk
      }
    } else {
      this.appendRow(row)
      syncedPk = this.getPkKey(row)
    }

    if (options?.setCurrentRow && syncedPk !== undefined) {
      this.setCurrentRowById(syncedPk)
    }
  }

  private collectTreeSeedRowsFromRows(): FlatTreeNode[] {
    if (!this.treeConfig) return []

    const idField = this.treeConfig.idField ?? 'id'
    const parentIdField = this.treeConfig.parentIdField ?? 'parentId'
    const textField = this.treeConfig.textField ?? 'name'
    const result: FlatTreeNode[] = []

    this.visitRowsDeep(row => {
      const rawId = row[idField]
      if (typeof rawId !== 'string' && typeof rawId !== 'number') return
      const rawParentId = row[parentIdField]
      const textValue = row[textField]
      result.push({
        ...row,
        id: rawId,
        parentId: typeof rawParentId === 'string' || typeof rawParentId === 'number'
          ? rawParentId
          : rawParentId === null || rawParentId === undefined
            ? null
            : String(rawParentId),
        name: typeof textValue === 'string'
          ? textValue
          : typeof row['name'] === 'string'
            ? row['name']
            : typeof row['label'] === 'string'
              ? row['label']
              : String(rawId),
      })
    })

    return result
  }

  private syncTreeManagerFromRows(): void {
    if (!this.treeConfig) return
    if (this.rows.length === 0) {
      this.treeManager?.clear()
      return
    }

    const treeManager = this._ensureTreeManager()
    treeManager.clear()
    treeManager.addNodesToCache(this.collectTreeSeedRowsFromRows())
  }

  private syncRowsFromTreeManager(): void {
    if (!this.treeManager) return
    this.replaceRows(this.treeManager.getAllNodes().map(dataRowFromRecord))
  }

  // ─────────────────────────────────────────────
  // 委托实例
  // ─────────────────────────────────────────────

  /** 计算列委托（立即初始化，因 dataTable setter 可能在第一次懒访问之前触发） */
  private _computedDelegate: ComputedColumnDelegate = new ComputedColumnDelegate(this)
  /** 主键委托（立即初始化，因 dataTable setter 在首次懒访问前就可能触发主键列更新） */
  private _primaryKeyDelegate: PrimaryKeyDelegate = new PrimaryKeyDelegate(
    () => this._dataTable?.columns ?? [],
    () => this._columnMap,
    () => this.rows,
    (name, fn) => this._computedDelegate.register(name, fn),
  )
  /** CRUD 操作委托（懒初始化） */
  private _crudDelegate?: CrudDelegate | undefined
  /** 级联订阅委托（懒初始化） */
  private _cascadeDelegate?: CascadeDelegate | undefined
  /** 选中状态委托（懒初始化） */
  private _selectionDelegate?: SelectionDelegate | undefined
  /** 本地内存变更委托（懒初始化） */
  private _localMutationDelegate?: LocalMutationDelegate | undefined
  /** 手工编辑追踪委托（懒初始化） */
  private _dirtyTrackingDelegate?: DirtyTrackingDelegate | undefined
  /** 聚合委托（懒初始化） */
  private _aggregateDelegate?: AggregateDelegate | undefined

  /** 获取 CRUD 委托（懒初始化） */
  private get crudDelegate(): CrudDelegate {
    this._crudDelegate ??= new CrudDelegate(
      this,
      (event) => this.events.emit(
        event.phase === 'before' ? 'crud:before' : 'crud:after',
        event,
      ),
      (delta, error) => this._trackMutating(delta, error),
    )
    return this._crudDelegate
  }

  /** 获取级联委托（懒初始化） */
  private get cascadeDelegate(): CascadeDelegate {
    this._cascadeDelegate ??= new CascadeDelegate(this)
    return this._cascadeDelegate
  }

  /** 获取选中状态委托（懒初始化） */
  private get selectionDelegate(): SelectionDelegate {
    this._selectionDelegate ??= new SelectionDelegate(
      this,
      (originatorId?) => this.emitCurrentRowChanged(originatorId),
      (originatorId?) => this.emitSelectedRowsChanged(originatorId),
    )
    return this._selectionDelegate
  }

  /** 获取本地变更委托（懒初始化） */
  private get localMutationDelegate(): LocalMutationDelegate {
    this._localMutationDelegate ??= new LocalMutationDelegate(
      this,
      (kinds) => this.emitRowsChanged(kinds),
      (affectedRows) => {
        this._rowsVersion++
        if (affectedRows === 'all') {
          this._applyComputedColumns(this.rows)
        } else if (affectedRows !== null) {
          this._applyComputedColumns(affectedRows)
        }
        this.aggregateDelegate.recompute(this.rows, this.selectedRows)
      },
    )
    return this._localMutationDelegate
  }

  /** 获取手工编辑追踪委托（懒初始化） */
  private get dirtyTrackingDelegate(): DirtyTrackingDelegate {
    this._dirtyTrackingDelegate ??= new DirtyTrackingDelegate(
      () => this._dataTable?.columns,
      () => this._computedDelegate.names,
      () => this.effectivePkFields,
    )
    return this._dirtyTrackingDelegate
  }

  /** 获取聚合委托（懒初始化） */
  private get aggregateDelegate(): AggregateDelegate {
    this._aggregateDelegate ??= new AggregateDelegate({
      getAggregates: () => this.aggregates,
      emitSummaryChanged: () => this.emitSummaryChanged(),
      emitSelectionSummaryChanged: () => this.emitSelectionSummaryChanged(),
    })
    return this._aggregateDelegate
  }

  // ─────────────────────────────────────────────
  // 公共委托访问器
  // ─────────────────────────────────────────────

  /** 选中状态委托 */
  get selection(): SelectionDelegate { return this.selectionDelegate }

  /** 本地内存变更委托 */
  get mutation(): LocalMutationDelegate { return this.localMutationDelegate }

  /** 网络 CRUD 委托 */
  get crud(): CrudDelegate { return this.crudDelegate }

  /** 手工编辑追踪委托 */
  get dirtyTracking(): DirtyTrackingDelegate { return this.dirtyTrackingDelegate }

  /** 当前编辑态行集合（按 rows 顺序返回 overlay 后的浅拷贝，含重新求值的计算列）。 */
  get editingRows(): DataRow[] {
    if (this._editingPatches.size === 0) return []
    const result: DataRow[] = []
    const included = new Set<string | number>()
    for (const row of this.rows) {
      const rowId = this.getPkKey(row)
      if (rowId === undefined) continue
      const patch = this._editingPatches.get(rowId)
      if (!patch) continue
      result.push({ ...row, ...patch })
      included.add(rowId)
    }
    for (const [rowId, patch] of this._editingPatches) {
      if (included.has(rowId)) continue
      const original = this._editingOriginalRows.get(rowId)
      if (original) result.push({ ...original, ...patch })
    }
    if (result.length > 0) this._computedDelegate.apply(result)
    return result
  }

  /** 事件总线——独立事件模型（currentRowChanged / selectedRowsChanged / rowsChanged / cleared / configChanged / requestStateChanged / mutatingChanged） */
  readonly events: SparkEventEmitter<DataViewEventMap> = createEventEmitter()

    /** 诊断日志接口。 */
protected logger = Logger('DataView')

  /**
   * 创建数据视图实例。
   *
   * @param tableName 视图所属表名。
   * @param viewId 视图 ID，默认 `default` 表示主数据视图。
   */
  constructor(tableName: string, viewId = 'default') {
    assertNoSeparator(tableName, 'tableName')
    assertNoSeparator(viewId, 'viewId')
    this.tableName = tableName
    this.viewId = viewId
  }

  /** 视图是否已销毁 */
  get destroyed(): boolean {
    return this._isDestroyed
  }

  // ─────────────────────────────────────────────
  // 委托所需的 DataTable 派生能力
  // ─────────────────────────────────────────────

  /** 向上访问 DataSet（独立 DataTable 未关联 DataSet 时返回 undefined） */
  get dataSet(): DataSet | undefined {
    this.checkDestroyed()
    return this.checkDataTableAttached().dataSet
  }

  /** CrudService 实例 */
  get crudService(): CrudService | undefined { this.checkDestroyed(); return this.checkDataTableAttached().crudService }
  /** CRUD 操作配置 */
  get crudConfig(): CrudOperationConfig | undefined { this.checkDestroyed(); return this.checkDataTableAttached().crudConfig }
  /** 数据校验器 */
  get validator(): DataValidator | undefined { this.checkDestroyed(); return this.checkDataTableAttached().validator }

  // ─────────────────────────────────────────────
  // 主键（委托访问器 + 公共访问器）
  // ─────────────────────────────────────────────

  /** 主键委托访问器（setPrimaryKeyGenerator / generatePrimaryKey 等通过 view.pk.xxx 访问） */
  get pk(): PrimaryKeyDelegate { return this._primaryKeyDelegate }

  /** 实际生效的主键字段名列表（不含合成列 `_pk`） */
  get effectivePkFields(): string[] { return this._primaryKeyDelegate.effectivePkFields }

  /**
   * 获取行的主键值（标量）。
   *
   * @param row 目标行。
   */
  getPkKey(row: DataRow): string | number | undefined { return this._primaryKeyDelegate.getPkKey(row) }

  /**
   * 从行数据构建服务端 PK payload。
   *
   * @param row 目标行。
   */
  buildServerPk(row: DataRow): Record<string, unknown> { return this._primaryKeyDelegate.buildServerPk(row) }

  // ─────────────────────────────────────────────
  // 请求流
  // ─────────────────────────────────────────────

  // ── 上行：父依赖解析 → 加载自身 ──────────────

  /**
   * 视图级加载编排器（幂等：requestState≠Idle 时直接返回）。外部应使用 refresh() 或 loadFromServer()。
   */
  async requestData(): Promise<void> {
    this.assertResultReplacementAllowed()
    if (this.requestState !== RequestState.Idle) {
      if (this._pendingRequestData) return this._pendingRequestData
      this.logger.debug(`requestData 跳过（当前状态: ${this.requestState}），请使用 refresh() 强制刷新`)
      return
    }

    // 无远程 list API（含 static-data）时，仅在数据层执行本地过滤同步，不触发网络请求。
    if (this._shouldApplyStaticLocalFilter()) {
      this._syncStaticLocalFilterRows()
      this.selectionDelegate.applyAutoFirst()
      this.setRequestState(RequestState.Loaded)
      return
    }

    const run = async (): Promise<void> => {
      this.setRequestState(RequestState.Preparing)

      // 逐个父视图检查依赖是否满足
      const ds = this.dataSet
      const parents = ds ? ds.getParentCascades(this.tableName, this.viewId) : []

      const cascadeFilters: DataViewFilterTree[] = []
      for (const rel of parents) {
        await this.requestIdleCascadeSource(rel)
        if (this._isDestroyed) return
        const cascadeFilter = ds?.resolveCascadeFilter(rel)
        if (cascadeFilter === null) {
          this.setRequestState(RequestState.Failed)
          return
        }
        if (cascadeFilter !== undefined) cascadeFilters.push(cascadeFilter)
      }

      const params: QueryParams = {}
      const cascadeFilter = cascadeFilters.length === 0
        ? undefined
        : cascadeFilters.length === 1
          ? cascadeFilters[0]
          : DataViewFilter.group({ logic: 'and', filters: cascadeFilters }).toJSON()
      const mergedFilter = this._mergeRemoteFilters(cascadeFilter, this.filterExpression)
      if (mergedFilter !== undefined) params.filter = mergedFilter

      // 注入视图自身的分页/排序/过滤参数
      params.viewId = this.viewId
      params.viewConfig = this._buildRemoteViewConfig()
      params.page = this.page
      params.pageSize = this.pageSize
      if (this.sortExpression !== undefined) params.sort = this._serializeSort(this.sortExpression)

      try {
        const result = await this.loadFromServer(params)
        if (!result.success) return
      } catch (error: unknown) {
        // 不再静默吞异常：记录错误、设置失败状态、通知订阅方
        this.logger.error(`requestData 失败 [${this.tableName}@${this.viewId}]: ${toErrorMessage(error)}`)
        this.loadingError = error instanceof Error ? error : new Error(toErrorMessage(error))
        this.setRequestState(RequestState.Failed)
        return
      }

      // 子视图级联由 rowsChanged 等父视图事件驱动，无需主动推
    }

    this._pendingRequestData = run()
    try {
      await this._pendingRequestData
    } finally {
      this._pendingRequestData = null
    }
  }

  private async requestIdleCascadeSource(rel: DataViewCascade): Promise<void> {
    const ds = this.dataSet
    if (!ds) return
    const parentView = ds.getView(rel.parentTable, rel.parentViewId)
    if (parentView?.requestState === RequestState.Idle) {
      await parentView.requestData()
    }
  }

  /**
   * 从服务器拉取列表（带防重入 + 请求 ID 竞态保护）。
   *
   * @param params 查询参数；省略时由当前视图配置生成。
   */
  async loadFromServer(params?: QueryParams): Promise<CrudResult> {
    this.assertResultReplacementAllowed()
    if (this.requestState === RequestState.Loading) return { success: false, message: 'Already loading' }

    this.loadingError = null
    this.setRequestState(RequestState.Loading)

    const requestId = ++this.currentLoadRequestId

    try {
      const loadParams = this.buildTreeModeParams(params)
      const hasModelQuery = this.#queryExecutor !== undefined || this.fieldProjection.length > 0 || Object.keys(this.queryContext).length > 0
      if (hasModelQuery) {
        loadParams.viewId ??= this.viewId
        loadParams.viewConfig ??= this._buildRemoteViewConfig()
        loadParams.page ??= this.page
        loadParams.pageSize ??= this.pageSize
        loadParams.projection ??= this.fieldProjection
        loadParams.context ??= this.queryContext
        if (loadParams.sort === undefined && this.sortExpression !== undefined) {
          loadParams.sort = this._serializeSort(this.sortExpression)
        }
      }
      let queryResult: DataViewQueryResult | undefined
      let result: CrudResult
      if (this.#queryExecutor !== undefined) {
        queryResult = await this.#queryExecutor.executeQuery(this, loadParams)
        result = { success: true, data: { rows: queryResult.rows, total: queryResult.total } }
      } else {
        result = await this.crudDelegate.list(loadParams)
      }

      if (requestId !== this.currentLoadRequestId) {
        this.logger.debug(`loadFromServer 请求 ${requestId} 被更新的请求 ${this.currentLoadRequestId} 替代，忽略响应`)
        return this._createRequestSupersededResult()
      }

      if (result.success && result.data !== undefined) {
        if (queryResult !== undefined) {
          this.ingestQueryResult(queryResult)
        } else {
          this.updateFromServer(normalizeServerRowsData(result.data, `DataView.loadFromServer ${this.tableName}@${this.viewId}`))
        }
        // 确保树形数据的所有子节点计算列已求值，再触发 autoFirst（会级联到子视图）
        this._applyComputedColumns(this.rows)
        this.selectionDelegate.applyAutoFirst()
        this.setRequestState(RequestState.Loaded)
      } else {
        this.setRequestState(RequestState.Failed)
      }
      return result
    } catch (error) {
      if (requestId !== this.currentLoadRequestId) {
        this.logger.debug(`loadFromServer 请求 ${requestId} 异常被忽略（已被新请求替代）`)
        return this._createRequestSupersededResult()
      }

      this.loadingError = toError(error)
      this.setRequestState(RequestState.Failed)
      throw error
    }
  }

  private ingestQueryResult(context: DataViewQueryResult): void {
    context.assertIdentity(this.queryIdentity())
    this.assertResultReplacementAllowed()
    const originalRows = new WeakMap<DataRow, DataViewQueryRow>()
    const rows = context.rows.map(row => {
      const clone = structuredClone(row)
      originalRows.set(clone, row)
      return clone
    })
    const total = context.total
    const previousContext = this.#queryResult
    const previousComputedToken = this.#computedQueryToken
    const previousOriginalRows = this.#queryOriginalRows
    const previousRows = this.rows
    const previousTotal = this.total
    try {
      this.#queryResult = context
      this.#computedQueryToken = {}
      this.#queryOriginalRows = originalRows
      this.#ingestingQueryResult = true
      this.updateFromServer({ rows, total })
    } catch (error) {
      this.#queryResult = previousContext
      this.#computedQueryToken = previousComputedToken
      this.#queryOriginalRows = previousOriginalRows
      this.rows = previousRows
      this.total = previousTotal
      throw error
    } finally {
      this.#ingestingQueryResult = false
    }
  }

  /**
   * 按服务端 PK 拉取单条记录。
   * 默认会将结果同步回本地 rows；可选设为当前行。
   *
   * @param pk 服务端主键 payload。
   * @param options 单条记录拉取后的同步选项。
   */
  async retrieveRecord(
    pk: Record<string, unknown>,
    options?: RetrieveRecordOptions,
  ): Promise<CrudResult<DataRow>> {
    this.checkDestroyed()
    const result = await this.crudDelegate.retrieveRecord(pk)
    if (result.success && result.data) {
      this._syncRetrievedRow(result.data, options)
    }
    return result
  }

  /**
   * 按本地主键值拉取单条记录。
   * 若本地已存在该行，会优先构造真实服务端 PK；否则回退到 `{ [primaryKey]: id }`。
   *
   * @param id 本地主键值。
   * @param options 单条记录拉取后的同步选项。
   */
  async retrieveRecordById(
    id: string | number,
    options?: RetrieveRecordOptions,
  ): Promise<CrudResult<DataRow>> {
    this.checkDestroyed()
    const localRow = this.getRowById(id)
    const serverPk = localRow
      ? this.buildServerPk(localRow)
      : { [this.primaryKey]: id }
    const result = await this.crudDelegate.retrieveRecord(serverPk)
    if (result.success && result.data) {
      this._syncRetrievedRow(result.data, options, id)
    }
    return result
  }

  private buildTreeModeParams(params?: QueryParams, treeMode?: 'flat' | 'nested'): QueryParams {
    return {
      ...(params ?? {}),
      treeMode: treeMode ?? this.treeMode,
    }
  }

    /** 无未保存修改时加载嵌套树；拒绝发生在请求前，不改变原查询状态。 */
async loadTreeNested(rootId?: string | number | null, limit?: number, depthLimit?: number): Promise<CrudResult<NestedTreeNode[]>> {
    this.assertResultReplacementAllowed()
    if (this.requestState === RequestState.Loading) return { success: false, message: 'Already loading' }

    this.loadingError = null
    this.setRequestState(RequestState.Loading)

    const requestId = ++this.currentLoadRequestId

    try {
      const treeManager: TreeManager = this._ensureTreeManager()
      const rows = await treeManager.fetchNested({ rootId, limit, depthLimit, treeMode: 'nested' })

      if (requestId !== this.currentLoadRequestId) {
        this.logger.debug(`loadTreeNested 请求 ${requestId} 被更新的请求 ${this.currentLoadRequestId} 替代，忽略响应`)
        return this._createRequestSupersededResult()
      }

      this.updateFromServer(rows.map(dataRowFromRecord))
      // 确保树形数据的所有子节点计算列已求值，再触发 autoFirst（会级联到子视图）
      this._applyComputedColumns(this.rows)
      this.selectionDelegate.applyAutoFirst()
      this.setRequestState(RequestState.Loaded)
      return { success: true, data: rows }
    } catch (error) {
      if (requestId !== this.currentLoadRequestId) {
        this.logger.debug(`loadTreeNested 请求 ${requestId} 异常被忽略（已被新请求替代）`)
        return this._createRequestSupersededResult()
      }

      this.loadingError = toError(error)
      this.setRequestState(RequestState.Failed)
      throw error
    }
  }

  /** 拒绝覆盖未保存变更；通过检查后置 Idle 并按当前视图输入重新查询。 */
  async refresh(): Promise<void> {
    this.assertResultReplacementAllowed()
    this.setRequestState(RequestState.Idle)
    return this.requestData()
  }

  private assertResultReplacementAllowed(): void {
    this.checkDestroyed()
    if (this._dirtyTrackingDelegate?.hasPendingChanges() || this.hasEditingChanges()) {
      throw new Error(`DATA_VIEW_UNSAVED_CHANGES: ${this.tableName}@${this.viewId} 必须先保存或明确放弃修改`)
    }
  }

  private assertResultWritable(): void {
    this.checkDestroyed()
    this.#queryResult?.assertIdentity(this.queryIdentity())
    if (this._resultStale) {
      throw new Error(`DATA_VIEW_RESULT_STALE: ${this.tableName}@${this.viewId} 查询结果已过期，重新查询成功后才能修改`)
    }
  }

  /**
   * 无 API 时的内存级联过滤（从 DataTable.rows 按依赖过滤条件写入视图）。
   *
   * @param rel DataView 输入级联。
   * @param _parentRows 父视图当前参与级联的行列表；过滤值统一由 DataSet 解析。
   */
  applyInMemoryCascade(rel: DataViewCascade, _parentRows: readonly DataRow[]): void {
    // 从 DataTable.rows 读取全量静态源数据（可在多次父行切换中反复过滤）
    const srcRows: DataRow[] = this._dataTable?.rows ?? []
    const cascadeFilter = this.dataSet?.resolveCascadeFilter(rel)
    let filteredRows = srcRows.slice()

    if (cascadeFilter === null) {
      filteredRows = []
    } else if (cascadeFilter !== undefined) {
      const local = new DataViewFilterLocal(this._parseFilter(cascadeFilter))
      local.validateFields(this._getAvailableLocalFilterFields())
      filteredRows = srcRows.filter(row => local.matches(row))
    }

    this.updateFromServer(filteredRows)
    this.selectionDelegate.applyAutoFirst()
    // 内存级联不走网络，requestState 直接 Loaded。
    this.setRequestState(RequestState.Loaded)
  }

  // ─────────────────────────────────────────────
  // 本地 CRUD（内存同步，不触发网络请求）
  // ─────────────────────────────────────────────

  /**
   * 将服务端响应同步到本地字段（rows / total / page / pageSize）——splice 保持数组引用稳定。
   *
   * @param data 服务端返回的行数组或行数据响应载荷。
   */
  updateFromServer(data: DataViewServerRowsPayload | DataRow[]): void {
    this.assertResultReplacementAllowed()
    this.localMutationDelegate.updateFromServer(data)
    if (!this.#ingestingQueryResult) this.#queryOriginalRows = new WeakMap<DataRow, DataViewQueryRow>()
    this.syncTreeManagerFromRows()
    this.emitRowsChanged()
  }

  /**
   * 本地追加一行，触发计算列求值 + 聚合重算 + rowsChanged。
   *
   * @param row 要追加的行。
   */
  appendRow(row: DataRow): void {
    this.assertResultWritable()
    this.localMutationDelegate.appendRow(row)
    this.syncTreeManagerFromRows()
  }

  /**
   * 本地按主键部分更新一行；返回是否成功（行不存在时 false）。
   *
   * @param id 目标行主键值。
   * @param data 要合并到目标行上的字段更新。
   */
  updateRowById(id: string | number, data: Partial<DataRow>): boolean {
    this.assertResultWritable()
    const updated = this.localMutationDelegate.updateRowById(id, data)
    if (updated) this.syncTreeManagerFromRows()
    return updated
  }

  /**
   * 本地按主键删除一行，清理选中引用；返回是否成功（行不存在时 false）。
   *
   * @param id 目标行主键值。
   */
  deleteRowById(id: string | number): boolean {
    this.assertResultWritable()
    const deleted = this.localMutationDelegate.deleteRowById(id)
    if (deleted) {
      this.syncTreeManagerFromRows()
    }
    return deleted
  }

  /**
   * 无未保存变更时整批替换行，并清理无效选中引用。
   *
   * @param rows 新的完整行列表。
   */
  replaceRows(rows: DataRow[]): void {
    this.assertResultReplacementAllowed()
    this.localMutationDelegate.replaceRows(rows)
    this.syncTreeManagerFromRows()
  }

  // ─────────────────────────────────────────────
  // 编辑态缓冲（UI 字段编辑 → apply → 手工编辑/脏追踪）
  // ─────────────────────────────────────────────

  /**
   * 是否存在编辑态变更。
   *
   * @param id 可选行主键值；省略时检查是否存在任意编辑态变更。
   */
  hasEditingChanges(id?: string | number): boolean {
    return id === undefined ? this._editingPatches.size > 0 : this._editingPatches.has(id)
  }

  /**
   * 获取指定行当前编辑态 patch。
   *
   * @param id 目标行主键值。
   */
  getEditingPatch(id: string | number): Partial<DataRow> | undefined {
    const patch = this._editingPatches.get(id)
    return patch ? { ...patch } : undefined
  }

  /**
   * 获取指定行的编辑态 overlay；未编辑时返回当前 DataView 行。
   *
   * @param id 目标行主键值。
   */
  getEditingRow(id: string | number): DataRow | null {
    const row = this.getRowById(id) ?? this._editingOriginalRows.get(id) ?? null
    if (!row) return null
    const patch = this._editingPatches.get(id)
    if (!patch) return row
    // 合并编辑态变更后重新求值计算列，使依赖已编辑字段的计算列反映最新编辑状态
    const merged = { ...row, ...patch }
    this._computedDelegate.apply([merged])
    return merged
  }

  /**
   * 将 UI 字段值写入编辑态，不直接污染 rows。
   *
   * @param id 目标行主键值。
   * @param field 要编辑的字段名。
   * @param value 新字段值。
   */
  updateEditingValue(id: string | number, field: string, value: unknown): DataRow {
    this.assertResultWritable()
    const normalizedField = field.trim()
    if (normalizedField.length === 0) {
      throw new Error(`updateEditingValue: field 不能为空 [${this.tableName}@${this.viewId}]`)
    }

    const sourceRow = this.getRowById(id)
    if (!sourceRow) {
      throw new Error(`updateEditingValue: 行不存在 [${this.tableName}@${this.viewId}] id=${String(id)}`)
    }

    for (const pkField of this.effectivePkFields) {
      if (normalizedField === pkField && !Object.is(sourceRow[pkField], value)) {
        throw new Error(`updateEditingValue: 不允许修改主键字段 "${pkField}" [${this.tableName}@${this.viewId}]`)
      }
    }

    const previousPatch = this._editingPatches.get(id) ?? {}
    const previousEditingRow = { ...sourceRow, ...previousPatch }
    const previousValue = previousEditingRow[normalizedField]
    if (Object.is(previousValue, value)) return previousEditingRow

    if (!this._editingOriginalRows.has(id)) {
      this._editingOriginalRows.set(id, { ...sourceRow })
    }

    const originalRow = this._editingOriginalRows.get(id) ?? sourceRow
    const nextPatch: Partial<DataRow> = {}
    for (const [key, patchValue] of Object.entries(previousPatch)) {
      if (key !== normalizedField) nextPatch[key] = patchValue
    }
    if (!Object.is(originalRow[normalizedField], value)) {
      nextPatch[normalizedField] = value
    }

    if (Object.keys(nextPatch).length === 0) {
      this._editingPatches.delete(id)
      this._editingOriginalRows.delete(id)
    } else {
      this._editingPatches.set(id, nextPatch)
    }

    const editingRow = this.getEditingRow(id) ?? { ...sourceRow, [normalizedField]: value }
    const event: DataViewEditingFieldChangeEvent = {
      tableName: this.tableName,
      viewId: this.viewId,
      rowId: id,
      field: normalizedField,
      previousValue,
      nextValue: value,
      editingRow,
      patch: { ...nextPatch },
    }
    this.emitEditingChanged(event)
    return editingRow
  }

  /**
   * 丢弃指定行或全部编辑态变更。
   *
   * @param ids 可选行主键值列表；省略时丢弃全部编辑态变更。
   */
  discardEditingRows(ids?: Array<string | number>): number {
    this.checkDestroyed()
    const targets = ids ?? [...this._editingPatches.keys()]
    let discardedCount = 0
    for (const id of targets) {
      const hadPatch = this._editingPatches.delete(id)
      const hadOriginal = this._editingOriginalRows.delete(id)
      if (hadPatch || hadOriginal) discardedCount++
    }
    if (discardedCount > 0) this.emitEditingChanged()
    return discardedCount
  }

  /** 丢弃 query-backed 视图的待提交本地状态；后续重新查询由调用方显式发起。 */
  discardPendingChanges(ids?: ReadonlyArray<string | number>): number {
    this.checkDestroyed()
    if (ids?.length === 0) return 0
    if (this.mutating || this.requestState === RequestState.Loading) {
      throw new Error('DATA_VIEW_DISCARD_BUSY: 保存或查询期间不能丢弃待处理变更')
    }
    const executor = this.#queryExecutor
    const context = this.currentQueryResult()
    if (executor === undefined || context === undefined) {
      throw new Error('DATA_VIEW_DISCARD_OWNER: 丢弃需要原查询 owner 与强查询基线')
    }

    const tracking = this.dirtyTrackingDelegate
    const pendingIds = new Set<string | number>([
      ...tracking.pendingCreateIds,
      ...tracking.dirtyRowIds,
      ...tracking.pendingDeleteIds,
      ...this._editingPatches.keys(),
      ...this._editingOriginalRows.keys(),
    ])
    const targets = ids === undefined
      ? [...pendingIds]
      : [...new Set(ids)].filter(id => pendingIds.has(id))
    if (targets.length === 0) return 0
    const targetIds = new Set(targets)

    const baselineByOwnerKey = new Map<unknown, DataViewQueryRow[]>()
    const baselineRows = context.rows.map(row => {
      const ownerKey = context.rowKey(row)
      const dataRow = dataRowFromRecord(structuredClone(row))
      this._applyComputedColumns([dataRow])
      const id = this.getPkKey(dataRow)
      if (ownerKey === undefined || ownerKey === null || id === undefined) {
        throw new Error('DATA_VIEW_DISCARD_BASELINE: 查询基线缺少唯一行身份')
      }
      const matches = baselineByOwnerKey.get(ownerKey) ?? []
      matches.push(row)
      baselineByOwnerKey.set(ownerKey, matches)
      return { id, ownerKey, row: dataRow }
    })
    const baselineById = new Map<string | number, typeof baselineRows>()
    for (const item of baselineRows) {
      const matches = baselineById.get(item.id) ?? []
      matches.push(item)
      baselineById.set(item.id, matches)
    }
    const currentById = new Map<string | number, DataRow[]>()
    for (const row of this.rows) {
      const id = this.getPkKey(row)
      if (id === undefined) continue
      const matches = currentById.get(id) ?? []
      matches.push(row)
      currentById.set(id, matches)
    }

    const restoreRows = new Map<string | number, DataRow>()
    const createIds = new Set(tracking.pendingCreateIds)
    for (const id of targets) {
      const pendingCreate = createIds.has(id)
      const pendingDelete = tracking.pendingDeleteIds.has(id)
      const currentRows = currentById.get(id) ?? []
      const deletedSnapshot = tracking.getPendingDeleteSnapshot(id)
      const targetRow = currentRows[0] ?? deletedSnapshot
      if (currentRows.length > 1 || (pendingCreate && currentRows.length !== 1)
        || (pendingDelete && currentRows.length !== 0)) {
        throw new Error(`DATA_VIEW_DISCARD_ROW: 待丢弃行 ${String(id)} 不能唯一定位`)
      }
      if (targetRow === undefined) {
        const editingOriginal = this._editingOriginalRows.get(id)
        const hasEditingOverlay = this._editingPatches.has(id) || editingOriginal !== undefined
        const hasPendingRowState = pendingCreate || pendingDelete || tracking.dirtyRowIds.has(id)
        const editingOwnerKey = editingOriginal === undefined ? undefined : context.rowKey(editingOriginal)
        const baselineHasEditingIdentity = editingOwnerKey === undefined || editingOwnerKey === null
          || baselineByOwnerKey.has(editingOwnerKey) || (baselineById.get(id)?.length ?? 0) > 0
        if (!hasEditingOverlay || hasPendingRowState || editingOriginal === undefined || baselineHasEditingIdentity) {
          throw new Error(`DATA_VIEW_DISCARD_ROW: 待丢弃行 ${String(id)} 缺少本地行身份`)
        }
        continue
      }
      const ownerKey = context.rowKey(targetRow)
      const originals = ownerKey === undefined || ownerKey === null ? [] : baselineByOwnerKey.get(ownerKey) ?? []
      if (pendingCreate) {
        if (originals.length > 0) throw new Error(`DATA_VIEW_DISCARD_BASELINE: 新增行 ${String(id)} 与查询基线身份冲突`)
        continue
      }
      if (originals.length !== 1) throw new Error(`DATA_VIEW_DISCARD_BASELINE: 行 ${String(id)} 缺少唯一查询基线`)
      const originalMatches = baselineById.get(id) ?? []
      const original = originalMatches[0]
      if (originalMatches.length !== 1 || original === undefined || original.ownerKey !== ownerKey) {
        throw new Error(`DATA_VIEW_DISCARD_BASELINE: 行 ${String(id)} 的查询基线身份不匹配`)
      }
      restoreRows.set(id, original.row)
    }

    const nextRows = this.rows.flatMap(row => {
      const id = this.getPkKey(row)
      if (id === undefined || !targetIds.has(id)) return [row]
      if (createIds.has(id)) return []
      const restored = restoreRows.get(id)
      return restored === undefined ? [row] : [restored]
    })
    const nextRowIds = new Set(nextRows.flatMap(row => {
      const id = this.getPkKey(row)
      return id === undefined ? [] : [id]
    }))
    const pendingDeleteIds = new Set([...tracking.pendingDeleteIds].filter(id => targetIds.has(id)))
    const rowsBefore = new Map<string | number, DataRow[]>()
    const rowsAfter = new Map<string | number, DataRow[]>()
    let pendingBeforeNextSurvivor: DataRow[] = []
    let previousSurvivorId: string | number | undefined
    for (const item of baselineRows) {
      if (pendingDeleteIds.has(item.id)) {
        pendingBeforeNextSurvivor.push(item.row)
      } else if (nextRowIds.has(item.id)) {
        if (pendingBeforeNextSurvivor.length > 0) {
          rowsBefore.set(item.id, pendingBeforeNextSurvivor)
          pendingBeforeNextSurvivor = []
        }
        previousSurvivorId = item.id
      }
    }
    let rowsAtStart: DataRow[] = []
    if (pendingBeforeNextSurvivor.length > 0) {
      if (previousSurvivorId === undefined) {
        rowsAtStart = pendingBeforeNextSurvivor
      } else {
        rowsAfter.set(previousSurvivorId, pendingBeforeNextSurvivor)
      }
    }
    const orderedRows: DataRow[] = [...rowsAtStart]
    for (const row of nextRows) {
      const id = this.getPkKey(row)
      if (id !== undefined) orderedRows.push(...(rowsBefore.get(id) ?? []))
      orderedRows.push(row)
      if (id !== undefined) orderedRows.push(...(rowsAfter.get(id) ?? []))
    }

    let editingChanged = false
    for (const id of targets) {
      tracking.cancelCreate(id)
      tracking.clearDirty(id)
      tracking.cancelDelete(id)
      editingChanged = this._editingPatches.delete(id) || editingChanged
      editingChanged = this._editingOriginalRows.delete(id) || editingChanged
    }
    this.mutation.replaceRows(orderedRows)
    this.syncTreeManagerFromRows()
    if (editingChanged) this.emitEditingChanged()
    return targets.length
  }

  /**
   * 将编辑态 patch 应用到现有 editRowById 管线。
   *
   * @param ids 可选行主键值列表；省略时应用全部编辑态变更。
   */
  async applyEditingRows(ids?: Array<string | number>): Promise<CrudResult<DataViewApplyEditingRowsResult>> {
    this.assertResultWritable()
    const targets = ids ?? [...this._editingPatches.keys()]
    let appliedCount = 0
    const failedIds: Array<string | number> = []
    const failedErrors: Record<string, string> = {}

    for (const id of targets) {
      const patch = this._editingPatches.get(id)
      if (!patch || Object.keys(patch).length === 0) continue
      try {
        const result = await this.editRowById(id, patch)
        const success = typeof result === 'boolean' ? result : result.success
        if (success) {
          this._editingPatches.delete(id)
          this._editingOriginalRows.delete(id)
          appliedCount++
        } else {
          failedIds.push(id)
          failedErrors[String(id)] = typeof result === 'boolean' ? '编辑失败' : result.message ?? '编辑失败'
        }
      } catch (error) {
        failedIds.push(id)
        failedErrors[String(id)] = error instanceof Error ? error.message : String(error)
      }
    }

    if (appliedCount > 0) this.emitEditingChanged()
    const failedCount = failedIds.length
    return {
      success: failedCount === 0,
      message: failedCount === 0 ? `应用 ${appliedCount} 行编辑态变更` : `应用 ${appliedCount} 行，失败 ${failedCount} 行`,
      data: { appliedCount, failedCount, failedIds, failedErrors },
    }
  }

  // ─────────────────────────────────────────────
  // 手工编辑（带脏追踪）
  // ─────────────────────────────────────────────

  /**
   * 本地新增行。commitMode='staged' 时标记为 pending-create（saveChanges 统一提交）；
   * commitMode='immediate' 且已配置 API 时立即调用 crud.createRecord。
   *
   * @param data 新行数据。
   */
  async addRow(data: Partial<DataRow>): Promise<DataRow | CrudResult<DataRow>> {
    this.assertResultWritable()
    let row: DataRow
    if (this.#queryExecutor !== undefined) {
      const context = this.#queryResult
      if (context?.prepareNewRow === undefined) throw new Error('DATA_VIEW_NEW_ROW_OWNER: 新增缺少原查询身份准备能力')
      row = context.prepareNewRow(data)
    } else row = this._primaryKeyDelegate.ensurePrimaryKey(data)
    if (this.shouldDirectCommitCrud('create')) {
      return this.crudDelegate.createRecord(row)
    }
    this.appendRow(row)
    const pkKey = this.getPkKey(row)
    if (pkKey !== undefined) {
      this.dirtyTrackingDelegate.trackCreate(pkKey, row)
    }
    return row
  }

  /**
   * 本地删除行。commitMode='staged' 时标记为 pending-delete（saveChanges 统一提交）；
   * commitMode='immediate' 且已配置 API 时立即调用 crud.deleteRecord。
   *
   * @param id 目标行主键值。
   */
  async removeRow(id: string | number): Promise<boolean | CrudResult<boolean>> {
    this.assertResultWritable()
    if (this.shouldDirectCommitCrud('delete')) {
      return this.crudDelegate.deleteRecord(id)
    }
    const snapshot = this.rows.find(r => this.getPkKey(r) === id)
    if (!snapshot) return false
    const result = this.deleteRowById(id)
    if (result) {
      this.dirtyTrackingDelegate.trackDelete(id, snapshot)
    }
    return result
  }

  /**
   * 手工编辑指定行（标脏）。commitMode='staged' 时仅更新内存并标脏；
   * commitMode='immediate' 且已配置 API 时立即调用 crud.updateRecord。
   * 连续编辑同一行只保留首次编辑前的快照。
   *
   * @param id 目标行主键值。
   * @param data 要合并到目标行上的字段更新。
   */
  async editRowById(
    id: string | number,
    data: Partial<DataRow>,
  ): Promise<boolean | CrudResult<DataRow>> {
    this.assertResultWritable()
    if (this.shouldDirectCommitCrud('update')) {
      return this.crudDelegate.updateRecord(id, data)
    }
    // 先获取编辑前快照（updateRowById 会替换行对象，必须在之前取）
    const original = this.rows.find(r => this.getPkKey(r) === id)
    if (!original) return false

    const result = this.updateRowById(id, data)
    if (result) {
      this.dirtyTrackingDelegate.markDirty(id, original)
    }
    return result
  }

  // ─────────────────────────────────────────────
  // 手工编辑查询（dirtyRows / getDirtyChanges 需要行引用，保留在 DataView）
  // ─────────────────────────────────────────────

  /** 当前所有脏行的行对象数组（按 rows 顺序） */
  get dirtyRows(): DataRow[] {
    const ids = this.dirtyTrackingDelegate.dirtyRowIds
    if (ids.size === 0) return []
    return this.rows.filter(r => {
      const pk = this._primaryKeyDelegate.getPkKey(r)
      return pk !== undefined && ids.has(pk)
    })
  }

  /**
   * 获取指定行的字段级变更明细（行不脏时返回 {}）。
   *
   * @param id 目标行主键值。
   */
  getDirtyChanges(id: string | number): RowDiff {
    const current = this.rows.find(r => this._primaryKeyDelegate.getPkKey(r) === id)
    if (!current) return {}
    return this.dirtyTrackingDelegate.getDiff(id, current)
  }

  /**
   * 原查询视图由统一 owner 保存并按真实字段回执接纳；本地 CRUD 视图沿用逐行提交。
   *
   * @param ids 可选行主键值列表；省略时保存全部脏行。
   */
  async saveChanges(ids?: Array<string | number>): Promise<CrudResult<SaveChangesData>> {
    this.assertResultWritable()
    if (this.#queryExecutor !== undefined) {
      const results = await DataView.saveQueryViews([{ view: this, ...(ids === undefined ? {} : { ids }) }])
      const result = results[0]
      if (result === undefined) throw new Error('DATA_VIEW_SAVE_RECEIPT: 缺少视图保存结果')
      return result
    }
    return this.dirtyTrackingDelegate.executeChanges(this, this.crudDelegate, ids)
  }

  /** 同一场景的视图在 class 内捕获私有基线，由同一 owner 一次保存并接纳真实回执。 */
  static async saveQueryViews(targets: readonly DataViewQuerySaveTarget[]): Promise<Array<CrudResult<SaveChangesData>>> {
    const captures = targets.map(target => ({ view: target.view, capture: target.view.captureQuerySave(target.ids) }))
    const active = captures.filter(({ capture }) => capture.added.length + capture.changed.length + capture.deleted.length > 0)
    const first = active[0]
    if (first === undefined) return captures.map(() => ({ success: true, message: '没有待提交的变更',
      data: { createdCount: 0, savedCount: 0, deletedCount: 0, failedCount: 0, failedIds: [], failedErrors: {} } }))
    const executor = first.capture.executor
    const save = executor.save
    if (save === undefined) throw new Error('DATA_VIEW_SAVE_OWNER: 保存需要统一 owner')
    const models = new Set<string>()
    for (const { capture } of active) {
      if (capture.executor !== executor || capture.identity.scenarioId !== first.capture.identity.scenarioId) {
        throw new Error('DATA_VIEW_SAVE_OWNER: 批量保存必须属于同一场景和查询 owner')
      }
      if (models.has(capture.identity.metaName)) throw new Error('DATA_VIEW_SAVE_MODEL_CONFLICT: 同批保存不允许重复模型')
      models.add(capture.identity.metaName)
    }
    active.forEach(({ view }) => view._trackMutating(1))
    let failure: Error | null = null
    try {
      const receipts = await save.call(executor, { changes: active.map(({ capture }) => ({ identity: capture.identity,
        context: capture.context, changes: { added: capture.added.map(item => item.row),
          changed: capture.changed.map(item => item.row), deleted: capture.deleted.map(item => item.row) } })) })
      if (receipts.length !== active.length) throw new Error('DATA_VIEW_SAVE_RECEIPT: 模型回执不完整')
      const acceptances = active.map(({ view, capture }, index) => {
        view.assertResultWritable()
        if (view.#queryResult !== capture.context || view.#queryExecutor !== capture.executor) {
          throw new Error('DATA_VIEW_SAVE_OWNER: 保存期间查询身份已变化')
        }
        const receipt = receipts[index]
        if (receipt?.metaName !== capture.identity.metaName) throw new Error('DATA_VIEW_SAVE_RECEIPT: 缺少唯一模型回执')
        const command = { ...capture, receipt }
        view.validateQuerySaveReceipt(command)
        return { view, command }
      })
      const results = new Map(acceptances.map(({ view, command }) => [view, view.acceptQuerySaveReceipt(command)]))
      return captures.map(({ view }) => results.get(view) ?? { success: true, message: '没有待提交的变更',
        data: { createdCount: 0, savedCount: 0, deletedCount: 0, failedCount: 0, failedIds: [], failedErrors: {} } })
    } catch (error) {
      failure = toError(error)
      throw error
    } finally {
      active.forEach(({ view }) => view._trackMutating(-1, failure))
    }
  }

  private captureQuerySave(ids?: Array<string | number>): DataViewQuerySaveCapture {
    this.assertResultWritable()
    const executor = this.#queryExecutor
    const context = this.currentQueryResult()
    if (executor?.save === undefined || context === undefined) throw new Error('DATA_VIEW_SAVE_OWNER: 保存需要原查询上下文及统一 owner')
    const selected = ids === undefined ? undefined : new Set(ids)
    const capture = (rowIds: ReadonlySet<string | number>, deleted = false): DataViewQuerySaveRow[] =>
      [...rowIds].filter(id => selected === undefined || selected.has(id)).map(id => {
        const row = deleted ? this.dirtyTrackingDelegate.getPendingDeleteSnapshot(id) : this.getRowById(id)
        if (row === null || row === undefined) throw new Error(`DATA_VIEW_SAVE_ROW: 未找到待提交行 ${String(id)}`)
        return { id, row: dataRowFromPartial(this.stripComputedColumns(structuredClone(row))) }
      })
    const added = capture(this.dirtyTrackingDelegate.pendingCreateIds)
    const changed = capture(this.dirtyTrackingDelegate.dirtyRowIds).filter(item => {
      const originals = context.rows.filter(row => this.querySaveKey(context, row) === this.querySaveKey(context, item.row))
      const original = originals[0]
      if (originals.length !== 1 || original === undefined || this.querySaveHasChanges(item.row, original)) return true
      this.rebaseQuerySaveDirty(item.id, original)
      return false
    })
    const deleted = capture(this.dirtyTrackingDelegate.pendingDeleteIds, true)
    return { executor, identity: this.queryIdentity(), context, added, changed, deleted }
  }

  private validateQuerySaveReceipt(command: DataViewQuerySaveAcceptance): void {
    const { identity, context, added, changed, deleted, receipt } = command
    receipt.context.assertIdentity(identity)
    if (receipt.added.length !== added.length || receipt.changed.length !== changed.length
      || receipt.deleted.length !== deleted.length || receipt.changedFields.length !== changed.length) {
      throw new Error('DATA_VIEW_SAVE_RECEIPT: 动作回执不完整')
    }
    for (const [rows, submitted] of [[receipt.changed, changed], [receipt.deleted, deleted]] as const) {
      if (rows.some(row => !submitted.some(item => this.querySaveKey(context, item.row) === this.querySaveKey(context, row)))) {
        throw new Error('DATA_VIEW_SAVE_RECEIPT: 行身份不属于提交')
      }
    }
    for (const accepted of receipt.added) {
      const row = dataRowFromRecord(structuredClone(accepted))
      this._applyComputedColumns([row])
      if (this.getPkKey(row) === undefined) throw new Error('DATA_VIEW_SAVE_RECEIPT: 新增回执缺少本地可定位的正式主键')
    }
  }

  private acceptQuerySaveReceipt(command: DataViewQuerySaveAcceptance): CrudResult<SaveChangesData> {
    const { context, added, changed, deleted, receipt } = command
    this.#queryResult = receipt.context
    receipt.changed.forEach((accepted, index) => {
      const submitted = changed.find(item => this.querySaveKey(context, item.row) === this.querySaveKey(context, accepted))
      if (submitted === undefined) throw new Error('DATA_VIEW_SAVE_RECEIPT: 更新身份不属于提交行')
      const current = this.getRowById(submitted.id)
      if (current === null) return
      const patch: DataRow = {}
      for (const field of receipt.changedFields[index] ?? []) {
        if (field === '_pk' || this.computedColumnNames.has(field) || this.effectivePkFields.includes(field)) continue
        if (this.sameQuerySaveValue(current[field], submitted.row[field])) patch[field] = accepted[field]
      }
      this.updateRowById(submitted.id, structuredClone(patch))
      this.rebaseQuerySaveDirty(submitted.id, accepted)
    })
    receipt.deleted.forEach(accepted => {
      const submitted = deleted.find(item => this.querySaveKey(context, item.row) === this.querySaveKey(context, accepted))
      if (submitted === undefined) throw new Error('DATA_VIEW_SAVE_RECEIPT: 删除身份不属于提交行')
      this.dirtyTrackingDelegate.cancelDelete(submitted.id)
      const restored = this.getRowById(submitted.id)
      if (restored !== null) this.dirtyTrackingDelegate.trackCreate(submitted.id, restored)
    })
    receipt.added.forEach((accepted, index) => {
      const submitted = added[index]
      if (submitted === undefined) throw new Error('DATA_VIEW_SAVE_RECEIPT: 新增行未对应提交')
      const current = this.getRowById(submitted.id)
      const row = dataRowFromRecord(structuredClone(accepted))
      this._applyComputedColumns([row])
      const nextId = this.getPkKey(row)
      if (nextId === undefined) throw new Error('DATA_VIEW_SAVE_RECEIPT: 新增回执缺少本地可定位的正式主键')
      this.dirtyTrackingDelegate.cancelCreate(submitted.id)
      if (current === null) {
        this.dirtyTrackingDelegate.trackDelete(nextId, row)
        return
      }
      for (const [field, value] of Object.entries(this.stripComputedColumns(current))) {
        if (!this.effectivePkFields.includes(field) && !this.sameQuerySaveValue(value, submitted.row[field])) row[field] = value
      }
      const currentId = this._currentRowId
      const selectedIds = [...this._selectedRowIds]
      this.deleteRowById(submitted.id)
      this.appendRow(row)
      if (currentId === submitted.id) this._currentRowId = nextId
      this._selectedRowIds = selectedIds.map(id => id === submitted.id ? nextId : id)
      const editing = this._editingPatches.get(submitted.id)
      if (editing !== undefined) {
        this._editingPatches.delete(submitted.id)
        this._editingPatches.set(nextId, editing)
        this._editingOriginalRows.delete(submitted.id)
        this._editingOriginalRows.set(nextId, structuredClone(accepted))
      }
      this.rebaseQuerySaveDirty(nextId, accepted)
    })
    this.total = receipt.context.total
    this.emitRowsChanged()
    const data: SaveChangesData = { createdCount: receipt.added.length, savedCount: receipt.changed.length,
      deletedCount: receipt.deleted.length, failedCount: 0, failedIds: [], failedErrors: {} }
    return { success: true, message: this.dirtyTrackingDelegate.hasPendingChanges() || this.hasEditingChanges()
      ? '已接纳保存回执，仍有未保存变更' : '已接纳保存回执', data }
  }

  private querySaveKey(context: DataViewQueryResult, row: DataViewQueryRow): string {
    const value = context.rowKey(row)
    return value === undefined || value === null ? '' : String(value).trim()
  }

  private sameQuerySaveValue(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true
    try { return JSON.stringify(left) === JSON.stringify(right) } catch { return false }
  }

  private rebaseQuerySaveDirty(id: string | number, baseline: DataViewQueryRow): void {
    const row = this.getRowById(id)
    if (row === null) return
    this.dirtyTrackingDelegate.clearDirty(id)
    if (this.querySaveHasChanges(row, baseline)) this.dirtyTrackingDelegate.markDirty(id, structuredClone(baseline))
  }

  private querySaveHasChanges(row: DataViewQueryRow, baseline: DataViewQueryRow): boolean {
    return Object.entries(this.stripComputedColumns(row)).some(([field, value]) =>
      !field.startsWith('lingma_sys_') && value !== undefined && !this.effectivePkFields.includes(field)
      && !this.sameQuerySaveValue(value, baseline[field]))
  }


  // ─────────────────────────────────────────────
  // 状态重置
  // ─────────────────────────────────────────────

  /** 无未保存变更时清空状态并发射 cleared 事件。 */
  clearAll(): void {
    this.assertResultReplacementAllowed()
    const had = this.rows.length > 0
      || this.currentRow !== null
      || this.selectedRows.length > 0
      || this.requestState !== RequestState.Idle
      || this.hasEditingChanges()
    this.resetStateInternal({ emitEvents: true })
    if (had) {
      this.emitClearedChanged()
    }
  }

  /**
   * 重置行数据和选中状态，并将 requestState 重置为 Idle。
   * 有未保存变更时拒绝重置；显式保存或放弃由调用方先行处理。
   * 通过领域事件通知订阅者刷新 rows / selection / request / aggregate / editing。
   */
  resetState(): void {
    this.assertResultReplacementAllowed()
    this.resetStateInternal({ emitEvents: true })
  }

  private resetStateInternal(options: { emitEvents: boolean }): void {
    this.#queryResult = undefined
    this.#computedQueryToken = undefined
    this.#queryOriginalRows = new WeakMap<DataRow, DataViewQueryRow>()
    const selectionChanged = this._currentRowId !== null || this._selectedRowIds.length > 0
    this.rows = []
    this._rowsVersion++
    this._currentRowId = null
    this._selectedRowIds = []
    this.rowIndexMap = undefined   // 行集合已清空，索引缓存失效
    this.loadingError = null
    this.setRequestState(RequestState.Idle)
    this._dirtyTrackingDelegate?.clearAll()
    const editingCleared = this.clearEditingState()
    this.aggregateDelegate.recompute(this.rows, this.selectedRows, { emit: options.emitEvents })
    if (options.emitEvents) {
      if (editingCleared) this.emitEditingChanged()
      this.emitRowsChanged({ selectionChanged })
    }
  }

  /** 清理已不在 rows 中的选中状态，返回是否发生了清理（委托给 SelectionDelegate） */
  cleanupInvalidSelections(): boolean {
    return this.selectionDelegate.cleanupInvalidSelections()
  }

  // ─────────────────────────────────────────────
  // 树操作（委托给 TreeManager）
  // ─────────────────────────────────────────────

  /** 懒初始化 TreeManager（传入 treeConfig 字段映射 + DataTable 的 api 和 HTTP 客户端） */
  private _ensureTreeManager(): TreeManager {
    if (!this.treeManager) {
      const cfg = this.treeConfig ?? {}
      // S3: 将 CrudService 的 HTTP 客户端传递给 TreeManager，共享拦截器/认证/配置
      const api = this._dataTable?.api
      const httpClient = this._dataTable?.crudService?.getHttpClient()
      const endpointContextProvider = () => this._dataTable?.dataSet?.getRequestTemplateParams() ?? {}
      this.treeManager = new TreeManager({
        config: cfg,
        ...(api === undefined ? {} : { api }),
        ...(httpClient === undefined ? {} : { httpClient }),
        endpointContextProvider,
      })
    }
    return this.treeManager
  }

  /**
   * 拉取直接子节点并写入缓存（对应 /tree/children）。
   *
   * @param parentId 父节点 ID；null 表示根级节点。
   * @param limit 最大返回子节点数。
   */
  loadTreeChildren(parentId: string | number | null, limit?: number): Promise<FlatTreeNode[]> {
    return this._ensureTreeManager().fetchChildren(parentId, limit).then(rows => {
      this.syncRowsFromTreeManager()
      return rows
    })
  }

  /**
   * 获取节点祖先链 ID（对应 /tree/path）。
   *
   * @param id 目标节点 ID。
   */
  loadTreePath(id: string | number): Promise<TreePath> {
    return this._ensureTreeManager().fetchPath(id)
  }

  /**
   * 展开到目标节点，差量补齐缓存（对应 /tree/path + /tree/subtree）。
   *
   * @param targetId 目标节点 ID。
   */
  expandTreeToNode(targetId: string | number): Promise<void> {
    return this._ensureTreeManager().expandToNode(targetId).then(() => {
      this.syncRowsFromTreeManager()
    })
  }

  // 内部树缓存写入入口；当前 ClassModel action 面不暴露该方法，避免和 SparkNodeTree.moveNode 混淆。
    /** 执行 move Tree Node 操作。 */
async moveTreeNode(nodeId: string | number, newParentId: string | number | null, index?: number): Promise<DataRow | null> {
    this.assertResultWritable()
    return this._ensureTreeManager().moveNode(nodeId, newParentId, index).then(() => {
      this.syncRowsFromTreeManager()
      return this.getRowById(nodeId)
    })
  }

  /**
   * 嵌套模式远端搜索（对应 /tree/nested/search）。
   *
   * @param keyword 搜索关键字。
   * @param limit 最大返回匹配节点数。
   */
  searchTreeNested(keyword: string, limit?: number): Promise<NestedTreeSearchResult[]> {
    return this._ensureTreeManager().fetchNestedSearch(keyword, limit)
  }

  // ─────────────────────────────────────────────
  // 事件通知（独立事件模型）
  // ─────────────────────────────────────────────

  /** 发射 cleared 事件（通知 UI 和子视图） */
  private emitClearedChanged(): void {
    this.events.emit('cleared')
  }

  /** 发射 currentRowChanged 事件（立即） */
  private emitCurrentRowChanged(originatorId?: string): void {
    this.events.emit('currentRowChanged', this.currentRow, originatorId)
  }

  /** 发射 selectedRowsChanged 事件（立即） */
  private emitSelectedRowsChanged(originatorId?: string): void {
    this._selectionIdsVersion++
    this.aggregateDelegate.recomputeSelection(this.selectedRows)
    this.events.emit('selectedRowsChanged', this.selectedRows, originatorId)
  }

  /** 发射 aggregateResult 重算事件（立即） */
  private emitSummaryChanged(): void {
    this.events.emit('summaryChanged')
  }

  /** 发射 selectionAggregateResult 重算事件（立即） */
  private emitSelectionSummaryChanged(): void {
    this.events.emit('selectionSummaryChanged')
  }

  private emitConfigChanged(): void {
    this.events.emit('configChanged')
  }

  /** 发射 rowsChanged 事件（微任务合并批量更新） */
  private emitRowsChanged(options?: { selectionChanged?: boolean }): void {
    this.pendingRowsSelectionChanged ||= options?.selectionChanged === true

    if (this.rowsChangedDebouncer) {
      return
    }
    this.rowsChangedDebouncer = true
    queueMicrotask(() => {
      if (this._isDestroyed) return
      const selectionChanged = this.pendingRowsSelectionChanged
      this.pendingRowsSelectionChanged = false
      this.events.emit('rowsChanged')
      if (selectionChanged) {
        this.events.emit('currentRowChanged', this.currentRow)
        this._selectionIdsVersion++
        this.events.emit('selectedRowsChanged', this.selectedRows)
      }
      this.rowsChangedDebouncer = false
    })
  }

  /** 将 SortExpression 序列化为查询字符串格式（如 `name:asc` 或 `name:asc,age:desc`） */
  private _serializeSort(sort: SortExpression): string {
    return sort.map(f => `${f.field}:${f.direction ?? 'asc'}`).join(',')
  }

  private _buildRemoteViewConfig(): ViewMetadata {
    const config: ViewMetadata = {
      tableName: this.tableName,
      viewId: this.viewId,
      page: this.page,
      pageSize: this.pageSize,
    }
    if (this.filterExpression !== undefined) config.filterExpression = this.filterExpression
    if (this.sortExpression !== undefined) config.sortExpression = this.sortExpression
    if (this.treeConfig !== undefined) config.treeConfig = this.treeConfig
    if (this.valueField !== undefined) config.valueField = this.valueField
    if (this.labelField !== undefined) config.labelField = this.labelField
    if (this.selectionDelimiter !== ',') config.selectionDelimiter = this.selectionDelimiter
    if (Object.keys(this.aggregates).length > 0) config.aggregates = this.aggregates
    if (this.fieldProjection.length > 0) config.fieldProjection = this.fieldProjection
    if (Object.keys(this.queryContext).length > 0) config.queryContext = this.queryContext
    return config
  }

  /**
   * 设置当前页；远端视图自动重新查询。
   *
   * @param page 新页码。
   */
  async setPage(page: number): Promise<void> {
    this.assertResultReplacementAllowed()
    this.page = page
    this.emitConfigChanged()
    if (!this._shouldApplyStaticLocalFilter()) await this.refresh()
  }

  /**
   * 设置每页条数并重置页码为 1；远端视图自动重新查询。
   *
   * @param pageSize 新每页行数。
   */
  async setPageSize(pageSize: number): Promise<void> {
    this.assertResultReplacementAllowed()
    this.pageSize = pageSize
    this.page = 1
    this.emitConfigChanged()
    if (!this._shouldApplyStaticLocalFilter()) await this.refresh()
  }

  /**
   * 设置排序表达式；远端视图自动重新查询。
   *
   * @param sort 新排序表达式；undefined 表示清除排序。
   */
  async setSort(sort: SortExpression | undefined): Promise<void> {
    this.assertResultReplacementAllowed()
    if (sort === undefined) {
      delete this.sortExpression
    } else {
      this.sortExpression = sort
    }
    this.emitConfigChanged()
    if (!this._shouldApplyStaticLocalFilter()) await this.refresh()
  }

  /**
   * 设置过滤表达式并重置页码为 1；表达式变更后由数据层自动处理数据。
   *
   * @param filter 新过滤表达式；undefined 表示清除过滤。
   */
  async setFilter(filter: DataViewFilterTree | undefined): Promise<void> {
    if (this._isSameFilterExpression(this.filterExpression, filter)) return
    this.filterExpression = filter
    if (!this._shouldApplyStaticLocalFilter()) await this.refresh()
  }

  /**
   * 显式执行过滤：即使表达式未变化也会处理数据（用于“查询”按钮语义）。
   *
   * @param filter 要执行的过滤表达式；undefined 表示清除过滤。
   */
  async executeFilter(filter: DataViewFilterTree | undefined): Promise<void> {
    const unchanged = this._isSameFilterExpression(this.filterExpression, filter)
    if (!unchanged) {
      await this.setFilter(filter)
      return
    }

    if (this._shouldApplyStaticLocalFilter()) {
      this._syncStaticLocalFilterRows()
      return
    }

    await this.refresh()
  }

  /** 级联委托（setupCascade / teardownCascade） */
  get cascade(): CascadeDelegate { return this.cascadeDelegate }

  // ─────────────────────────────────────────────
  // 生命周期（销毁与内存管理）
  // ─────────────────────────────────────────────

  /**
   * 销毁视图，释放所有订阅、委托和外部引用
   *
   * 应在资源释放时调用，防止内存泄漏。
   * 销毁顺序：级联委托 → CRUD 委托 → 防抖定时器 → 事件总线 → 行数据 → TreeManager → DataTable 引用
   */
  destroy(): void {
    if (this._isDestroyed) return
    this.currentLoadRequestId++
    this.#queryExecutor = undefined

    this.logger.debug(`销毁 DataView: ${this.tableName}:${this.viewId}`)

    // 1. 销毁级联委托（清理订阅 + 取消待处理请求）
    this._cascadeDelegate?.destroy()
    this._cascadeDelegate = undefined

    // 2. 销毁 CRUD 委托（释放 CrudService）
    this._crudDelegate?.destroy()
    this._crudDelegate = undefined

    // 3. 清除 rowsChanged 微任务合并状态；已排队微任务会通过 _isDestroyed 退出。
    this.rowsChangedDebouncer = false
    this.pendingRowsSelectionChanged = false

    // 4. 清理事件监听器（Batch 2 已扩展 SparkEventEmitter.removeAllListeners）
    this.events.removeAllListeners()

    // 5. 清空数据
    this.resetStateInternal({ emitEvents: true })

    // 6. 清除计算列委托（内部清理跨表订阅 + 缓存 + 上下文）
    this._computedDelegate.destroy()

    // 7. 清除脏追踪委托
    this._dirtyTrackingDelegate?.destroy()
    this._dirtyTrackingDelegate = undefined

    // 8. 清除聚合委托
    this._aggregateDelegate = undefined

    // 9. 清除 TreeManager 引用（_treeHttp 随 DataView GC 自动释放，无需显式清除）
    this.treeManager = undefined

    // 10. 保留 DataTable 引用（现代 JS GC 能正确处理循环引用）。
    // Phase 4 M6: 不再 undefined dataTable，避免销毁后访问 getter（dataSet/crudService 等）
    // 抛出不明确的 "Cannot read property of undefined" 而非清晰的 "已销毁" 错误。

    // 11. 标记为已销毁
    this._isDestroyed = true
  }

  /** 检查视图是否已销毁 */
  isDestroyed(): boolean {
    return this._isDestroyed
  }

  /** @private 检查销毁状态，已销毁则抛出异常 */
  private checkDestroyed(): void {
    if (this._isDestroyed) {
      throw new Error(`DataView ${this.tableName}:${this.viewId} has been destroyed`)
    }
  }

  /** @private 检查 DataTable 是否已绑定，未绑定则抛出描述性异常 */
  private checkDataTableAttached(): DataTable {
    if (!this._dataTable) {
      throw new Error(
        `DataView ${this.tableName}:${this.viewId} 尚未关联 DataTable，` +
        `请通过 DataTable.getOrCreateView() 或 DataSet.fromJson() 创建视图。`
      )
    }
    return this._dataTable
  }

  /** CrudDelegate 回调：追踪并发 CRUD 请求数，维护 mutating / mutatingError */
  private _trackMutating(delta: 1 | -1, error?: Error | null): void {
    if (delta === 1) this.assertResultWritable()
    this._mutatingCount = Math.max(0, this._mutatingCount + delta)
    this.mutating = this._mutatingCount > 0
    if (delta === 1) {
      this.mutatingError = null
    } else {
      if (error) this.mutatingError = error
    }
    this.events.emit('mutatingChanged', this.mutating)
  }

  // ─────────────────────────────────────────────
  // 序列化 / 反序列化
  // ─────────────────────────────────────────────

  /** 将 ViewMetadata 配置字段应用到当前视图实例（不创建新实例，不处理 rows）。 */
  /**
   * 将 ViewMetadata 配置字段应用到当前视图实例（不创建新实例，不处理 rows）。
   *
   * @param vc 要应用的视图配置片段。
   */
  applyViewConfig(vc: Partial<ViewMetadata>): void {
    this.assertResultReplacementAllowed()
    if (vc.filterExpression !== undefined) {
      this.filterExpression = vc.filterExpression
    }
    if (vc.sortExpression !== undefined) this.sortExpression = vc.sortExpression
    if (vc.autoCurrentFirst !== undefined) this.autoCurrentFirst = vc.autoCurrentFirst
    if (vc.autoSelectFirst !== undefined) this.autoSelectFirst = vc.autoSelectFirst
    if (vc.treeConfig !== undefined) this.treeConfig = vc.treeConfig
    if (vc.autoLoad !== undefined) {
      this.autoLoad = vc.autoLoad
      this.autoLoadConfigured = true
    }
    if (vc.commitMode !== undefined) this.commitMode = vc.commitMode
    if (vc.valueField !== undefined) this.valueField = vc.valueField
    if (vc.labelField !== undefined) this.labelField = vc.labelField
    if (vc.selectionDelimiter !== undefined) this.selectionDelimiter = vc.selectionDelimiter
    if (vc.fieldProjection !== undefined) this.fieldProjection = vc.fieldProjection.map((field) => ({ ...field }))
    if (vc.queryContext !== undefined) this.queryContext = { ...vc.queryContext }
    if (vc.aggregates !== undefined) {
      for (const key of Object.keys(this.aggregates)) {
        Reflect.deleteProperty(this.aggregates, key)
      }
      Object.assign(this.aggregates, vc.aggregates)
    }
    this.page = vc.page ?? 1
    this.pageSize = vc.pageSize ?? 20
    this._rebuildColumnMap()
    if (vc.filterExpression !== undefined && this._shouldApplyStaticLocalFilter()) {
      this._syncStaticLocalFilterRows()
    }
    this.emitConfigChanged()
  }

    /** 执行 configure 操作。 */
configure(config: Partial<ViewMetadata>): void {
    this.applyViewConfig(config)
  }

    /** 设置 Aggregates。 */
setAggregates(aggregates: Record<string, AggregateColumnConfig>): void {
    const table = this.checkDataTableAttached()
    const columnNames = new Set(table.columns.map((column) => column.name))
    const missingFields = Object.entries(aggregates)
      .map(([key, config]) => config.field ?? key)
      .filter((field) => !columnNames.has(field))

    if (missingFields.length > 0) {
      throw new Error(`Aggregate fields not found: ${missingFields.join(', ')}`)
    }

    this.applyViewConfig({ aggregates })
  }

    /** set Tree Config 配置。 */
setTreeConfig(treeConfig: TreeConfig): void {
    const table = this.checkDataTableAttached()
    const columnNames = new Set(table.columns.map((column) => column.name))
    const { idField, parentIdField } = treeConfig

    if (idField === undefined || !columnNames.has(idField)) {
      throw new Error(`Tree idField "${idField ?? ''}" not found`)
    }
    if (parentIdField === undefined || !columnNames.has(parentIdField)) {
      throw new Error(`Tree parentIdField "${parentIdField ?? ''}" not found`)
    }

    this.treeConfig = treeConfig
    this.emitConfigChanged()
  }

  /** 对已有 rows 应用 autoCurrentFirst / autoSelectFirst 初始化选中状态（静态数据路径用） */
  initAutoSelection(): void {
    this.selectionDelegate.applyAutoFirst()
  }

    /** 执行 to Json 操作。 */
toJson(): ViewMetadata {
    const serializedRows = this._holdsRemoteRows()
      ? []
      : this.rows.map((row) => dataRowFromPartial(withoutPermissionWireFields(this.stripComputedColumns(row))))

    const result: ViewMetadata = {
      tableName: this.tableName,
      viewId: this.viewId,
      page: this.page,
      pageSize: this.pageSize,
      rows: serializedRows,
    }
    if (this.filterExpression !== undefined) result.filterExpression = this.filterExpression
    if (this.sortExpression !== undefined) result.sortExpression = this.sortExpression
    // 布尔必须显式写出：省略 false 会在重新加载后回到默认 true
    result.autoCurrentFirst = this.autoCurrentFirst
    result.autoSelectFirst = this.autoSelectFirst
    if (this.treeConfig !== undefined) result.treeConfig = this.treeConfig
    if (this.autoLoad !== false) result.autoLoad = this.autoLoad
    if (this.commitMode !== 'immediate') result.commitMode = this.commitMode
    if (this.valueField !== undefined) result.valueField = this.valueField
    if (this.labelField !== undefined) result.labelField = this.labelField
    if (this.selectionDelimiter !== ',') result.selectionDelimiter = this.selectionDelimiter
    if (Object.keys(this.aggregates).length > 0) result.aggregates = this.aggregates
    if (this.fieldProjection.length > 0) result.fieldProjection = this.fieldProjection
    if (Object.keys(this.queryContext).length > 0) result.queryContext = this.queryContext
    return result
  }

    /** 执行 from Json 操作。 */
static fromJson(
    data: ViewMetadata | Record<string, unknown> | string,
    tableName: string,
    viewId: string,
  ): DataView {
    const metadata = parseViewMetadataInput(data, tableName, viewId)
    const v = new DataView(tableName, viewId)
    if (metadata.rows !== undefined) v.rows = [...metadata.rows]
    v.applyViewConfig(metadata)
    return v
  }
}
