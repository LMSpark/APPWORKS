/**
 * @module @spark-appworks/spark-data:dataset
 * 职责：持有单场景或本地数据表、多视图、资源关系及输入级联，协调订阅和保存。
 * 边界：场景身份只读，场景保存使用既有查询 owner 且不保证事务，多空间由 PageRuntime 持有。
 * AI用途：解析视图、组织级联或保存场景内多个模型时确认数据集的不变量。
 */
import { DataViewFilter } from './query/filter/data-view-filter'
import type { DataViewFilterTree } from './query/filter/data-view-filter-contract'

import type {
  DataSetContract, DataSetMetadata, TableMetadata, DataResourceRelation, DataResourceRelationInput, DataViewCascade,
  DataViewQueryCascade, DataViewCascadeSelector, DataViewFieldCascadeAddress, DataViewFieldCascadeState, DataRow, DataColumn,
  ColumnType, ViewChangeHandlers, CrudResult,
  DataSetSaveChangesOptions, DataSetSaveChangesResult, DataSetSaveChangesViewResult,
  DataSetSaveChangesConfig, DataSetTransactionOperation, DataSetTransactionRequest,
  DataSetTransactionResponse, HttpEndpoint,
} from './types'
import { RequestState } from './types'
import type { DataSetAppServices } from './types'
import { DataView } from './data-view'
import type { HttpClientBase } from '@spark-appworks/spark-utils'
import { deepClone, Logger, isRecord, SparkAIModel } from '@spark-appworks/spark-utils'

const dsLogger = Logger('DataSet')
import {
  commitDataSetSnapshot,
  getDataSetSnapshot,
  listDataSetSnapshots,
} from './dataset-history'
import type {
  DataSetCommitSnapshotOptions,
  DataSetHistorySnapshot,
  DataSetHistoryListOptions,
  DataSetHistoryScope,
  DataSetSnapshotSelector,
} from './dataset-history'
import { DataTable } from './data-table'
import { createCrudService } from './strategies/crud-service'
import { normalizeDataSetMetadata, normalizeScenarioId } from './metadata'
import { assertNoSeparator, getParentRows } from './core/utils'
import { ResourceRelationDefinition } from './resource-relation/resource-relation-definition'
import { DataViewFieldCascadeDefinition } from './strategies/cascade/field-cascade-definition'
import { DataViewFieldCascadeRuntime } from './strategies/cascade/field-cascade-runtime'

/** @internal 从未知值推断列类型 */
function inferColumnType(v: unknown): ColumnType {
  if (typeof v === 'number') return 'number'
  if (typeof v === 'boolean') return 'boolean'
  if (v === null) return 'string'
  if (typeof v === 'object') return 'object'
  return 'string'
}

/** @internal 从对象的键推断列配置（fromJson 内部复用，避免两处重复 Object.keys.map） */
function inferColumnsFromRecord(obj: Record<string, unknown>): DataColumn[] {
  return Object.keys(obj).map(n => ({ name: n, type: inferColumnType(obj[n]), label: n }))
}

function normalizePageDataTableMetadata(
  tableName: string,
  table: Omit<TableMetadata, 'tableName'> & { tableName?: string },
): TableMetadata {
  return {
    ...table,
    tableName: typeof table.tableName === 'string' && table.tableName.trim() !== ''
      ? table.tableName
      : tableName,
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function pickFirstString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        const trimmed = item.trim()
        if (trimmed.length > 0) return trimmed
      }
    }
  }
  return undefined
}

function resolveRouteTemplateParams(routeLike: unknown): {
  tenantId?: string
  projectId?: string
} {
  const routeRecord = asRecord(routeLike)
  const paramsRecord = asRecord(routeRecord?.['params'])
  const queryRecord = asRecord(routeRecord?.['query'])

  const tenantId =
    pickFirstString(paramsRecord?.['tenantId'])
    ?? pickFirstString(paramsRecord?.['tenant'])
    ?? pickFirstString(queryRecord?.['tenantId'])
    ?? pickFirstString(queryRecord?.['tenant'])
  const projectId =
    pickFirstString(paramsRecord?.['projectId'])
    ?? pickFirstString(paramsRecord?.['project'])
    ?? pickFirstString(queryRecord?.['projectId'])
    ?? pickFirstString(queryRecord?.['project'])

  const result: { tenantId?: string; projectId?: string } = {}
  if (tenantId !== undefined) result.tenantId = tenantId
  if (projectId !== undefined) result.projectId = projectId
  return result
}

type DataSetSaveChangesTarget = {
  view: DataView
  ids?: Array<string | number>}

type DataSetScenarioSavePlan = {
  target: DataSetSaveChangesTarget
  viewResult: DataSetSaveChangesViewResult
}

type DataSetTransactionOperationPlan = {
  operation: DataSetTransactionOperation
  view: DataView
  id: string | number
  kind: DataSetTransactionOperation['op']}

type DataSetTransactionViewPlan = {
  viewResult: DataSetSaveChangesViewResult
  operations: DataSetTransactionOperationPlan[]}

/** Data Set Config 的配置结构。 */
type DataSetConfig = {
    /** data Set Name 名称。 */
dataSetName: string
    /** SPARK 场景身份。 */
scenarioId?: string | undefined
    /** tables 字段。 */
tables: Record<string, TableMetadata>
    /** schema Version 字段。 */
schemaVersion?: number | undefined
    /** table Relations 字段。 */
resourceRelations?: DataResourceRelationInput[] | undefined
    /** view Dependencies 字段。 */
viewCascades?: DataViewCascade[] | undefined
    /** version 字段。 */
version?: number | undefined
    /** page Id 标识。 */
pageId?: string | undefined
    /** save Changes 字段。 */
saveChanges?: DataSetSaveChangesConfig | undefined
    /** layout 字段。 */
layout?: DataSetMetadata['layout'] | undefined}

function emptyDataSetSaveChangesResult(viewCount: number): DataSetSaveChangesResult {
  return {
    viewCount,
    appliedEditingRows: 0,
    failedEditingRows: 0,
    createdCount: 0,
    savedCount: 0,
    deletedCount: 0,
    failedCount: 0,
    failedViews: [],
    viewResults: [],
  }
}

function hasEditingChanges(view: DataView, ids?: Array<string | number>): boolean {
  return ids === undefined
    ? view.hasEditingChanges()
    : ids.some(id => view.hasEditingChanges(id))
}

function hasPendingChanges(view: DataView, ids?: Array<string | number>): boolean {
  if (ids === undefined) return view.dirtyTracking.hasPendingChanges()
  return ids.some(id =>
    view.dirtyTracking.isDirty(id)
    || view.dirtyTracking.isPendingCreate(id)
    || view.dirtyTracking.isPendingDelete(id)
  )
}

function toUploadRecord(data: Partial<DataRow>): Record<string, unknown> {
  return { ...data }
}

function dataRowFromRecord(record: Record<string, unknown>): DataRow {
  return { ...record }
}

function dataRowFromValue(value: unknown): DataRow {
  return { value }
}

function toFilterScalar(value: unknown, fieldName: string): string | number | boolean | null {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  throw new Error(`远端关系过滤字段 "${fieldName}" 只支持 string/number/boolean/null 值`)
}

function isTableMetadataInput(value: unknown): value is Omit<TableMetadata, 'tableName'> & { tableName?: string } {
  const record = asRecord(value)
  return record !== null
    && Array.isArray(record['columns'])
    && isRecord(record['views'])
    && isRecord(record['views']['default'])
}

function normalizeTableMap(rawTables: unknown): Record<string, TableMetadata> {
  if (!isRecord(rawTables)) {
    throw new Error('DataSet.fromJson: tables 必须是对象')
  }

  const normalizedTables: Record<string, TableMetadata> = {}
  for (const [tableName, table] of Object.entries(rawTables)) {
    if (!isTableMetadataInput(table)) {
      throw new Error(`DataSet.fromJson: 表 "${tableName}" 缺少 columns 或 views.default`)
    }
    normalizedTables[tableName] = normalizePageDataTableMetadata(tableName, table)
  }
  return normalizedTables
}

function isDataResourceRelation(value: unknown): value is DataResourceRelationInput {
  const record = asRecord(value)
  return record !== null
    && typeof record['parentTable'] === 'string'
    && typeof record['childTable'] === 'string'
}

function readResourceRelations(value: unknown): DataResourceRelationInput[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || !value.every(isDataResourceRelation)) {
    throw new Error('DataSet.fromJson: resourceRelations 必须是 DataResourceRelation 数组')
  }
  return value
}

function isDataViewQueryCascade(value: unknown): value is DataViewQueryCascade {
  const record = asRecord(value)
  return record !== null
    && (record['kind'] === undefined || record['kind'] === 'query')
    && typeof record['parentTable'] === 'string'
    && typeof record['parentViewId'] === 'string'
    && typeof record['childTable'] === 'string'
    && typeof record['childViewId'] === 'string'
    && Array.isArray(record['filterBindings'])
    && record['filterBindings'].length > 0
    && record['filterBindings'].every((binding) => {
      const bindingRecord = asRecord(binding)
      return bindingRecord !== null
        && typeof bindingRecord['sourceField'] === 'string'
        && bindingRecord['sourceField'].trim() !== ''
        && typeof bindingRecord['targetField'] === 'string'
        && bindingRecord['targetField'].trim() !== ''
    })
}

function readViewCascades(value: unknown): DataViewCascade[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new Error('DataSet.fromJson: viewCascades 必须是 DataViewCascade 数组')
  }
  const cascades = value.map((item: unknown): DataViewCascade => {
    if (isRecord(item) && item['kind'] === 'field') return DataViewFieldCascadeDefinition.parse(item)
    if (isDataViewQueryCascade(item)) return item
    throw new Error('DataSet.fromJson: viewCascades 必须是 DataViewCascade 数组')
  })
  DataViewFieldCascadeDefinition.validateAll(cascades)
  return cascades
}

function isSaveChangesConfig(value: unknown): value is DataSetSaveChangesConfig {
  const record = asRecord(value)
  if (record === null) return false
  const mode = record['mode']
  if (mode !== undefined && mode !== 'perView' && mode !== 'transaction') return false
  const transaction = record['transaction']
  if (transaction === undefined) return true
  const transactionRecord = asRecord(transaction)
  const endpoint = asRecord(transactionRecord?.['endpoint'])
  return endpoint !== null && typeof endpoint['url'] === 'string'
}

function readSaveChangesConfig(value: unknown): DataSetSaveChangesConfig | undefined {
  if (value === undefined) return undefined
  if (!isSaveChangesConfig(value)) {
    throw new Error('DataSet.fromJson: saveChanges 配置无效')
  }
  return value
}

function isDataSetLayout(value: unknown): value is DataSetMetadata['layout'] {
  const record = asRecord(value)
  if (record === null) return false
  const tablePositions = record['tablePositions']
  if (tablePositions === undefined) return true
  if (!isRecord(tablePositions)) return false
  return Object.values(tablePositions).every((item) => {
    const position = asRecord(item)
    return position !== null
      && typeof position['x'] === 'number'
      && typeof position['y'] === 'number'
  })
}

function readDataSetLayout(value: unknown): DataSetMetadata['layout'] | undefined {
  if (value === undefined) return undefined
  if (!isDataSetLayout(value)) {
    throw new Error('DataSet.fromJson: layout 配置无效')
  }
  return value
}

function buildCanonicalDataSetConfig(rawJson: Record<string, unknown>): DataSetConfig {
  const dataSetName = typeof rawJson['dataSetName'] === 'string' && rawJson['dataSetName'].trim() !== ''
    ? rawJson['dataSetName']
    : 'PageDataSet'

  const config: DataSetConfig = {
    dataSetName,
    tables: normalizeTableMap(rawJson['tables']),
  }

  const scenarioId = normalizeScenarioId(rawJson['scenarioId'])
  if (scenarioId !== undefined) config.scenarioId = scenarioId

  const resourceRelations = readResourceRelations(rawJson['resourceRelations'])
  if (resourceRelations !== undefined) config.resourceRelations = resourceRelations.map(relation =>
    ResourceRelationDefinition.normalize(relation, config.tables))

  const viewCascades = readViewCascades(rawJson['viewCascades'])
  if (viewCascades !== undefined) config.viewCascades = viewCascades

  if (typeof rawJson['schemaVersion'] === 'number') config.schemaVersion = rawJson['schemaVersion']
  if (typeof rawJson['version'] === 'number') config.version = rawJson['version']
  if (typeof rawJson['pageId'] === 'string') config.pageId = rawJson['pageId']

  const saveChanges = readSaveChangesConfig(rawJson['saveChanges'])
  if (saveChanges !== undefined) config.saveChanges = saveChanges

  const layout = readDataSetLayout(rawJson['layout'])
  if (layout !== undefined) config.layout = layout

  return config
}

function mergeViewResult(target: DataSetSaveChangesResult, viewResult: DataSetSaveChangesViewResult): void {
  target.appliedEditingRows += viewResult.appliedEditingRows
  target.failedEditingRows += viewResult.failedEditingRows
  target.createdCount += viewResult.createdCount
  target.savedCount += viewResult.savedCount
  target.deletedCount += viewResult.deletedCount
  target.failedCount += viewResult.failedCount
  if (viewResult.failedCount > 0 || viewResult.failedEditingRows > 0) {
    target.failedViews.push({ tableName: viewResult.tableName, viewId: viewResult.viewId })
  }
  target.viewResults.push(viewResult)
}

function buildDataSetHistoryScope(
  dataSet: Pick<DataSet, 'dataSetName' | 'pageId'>,
  options?: Pick<DataSetHistoryListOptions, 'scopeId' | 'namespace'>,
): DataSetHistoryScope {
  return {
    dataSetName: dataSet.dataSetName,
    ...(dataSet.pageId !== undefined ? { pageId: dataSet.pageId } : {}),
    ...(options?.scopeId !== undefined ? { scopeId: options.scopeId } : {}),
    ...(options?.namespace !== undefined ? { namespace: options.namespace } : {}),
  }
}

/** Data Set 的语义模型。 */
export class DataSet extends SparkAIModel implements DataSetContract {

  // ===== 属性定义 =====

  /** 数据集名称 */
  dataSetName: string

  /** 数据表集合 */
  tables: Record<string, DataTable> = {}

  /** 数据资源关系定义 */
  resourceRelations: DataResourceRelation[] | undefined

  /** DataView 输入级联定义 */
  viewCascades: DataViewCascade[] | undefined

  /** Schema 格式版本（默认 1） */
  schemaVersion = 2

  /** SPARK 场景身份只读；变更时重新装配运行 DataSet。本地数据集为 undefined。 */
  readonly scenarioId: string | undefined

  /** 业务数据版本号（乐观锁） */
  version: number | undefined

  /** 页面ID */
  pageId: string | undefined

  /** DataSet.saveChanges 的默认提交策略。 */
  saveChangesConfig: DataSetSaveChangesConfig | undefined

  /** 设计器布局信息（不参与运行时数据逻辑）。 */
  layout: DataSetMetadata['layout'] | undefined

  /**
    * M5: 共享 HTTP 客户端——所有 DataTable 的 CrudService 复用同一 HttpClientBase 实例。
   * 由外部通过 `setSharedHttpClient(client)` 注入。未设置时各 CrudService 各自 createRequest()。
   * @internal
   */
    _sharedHttpClient?: HttpClientBase | undefined

  /** @internal 页面运行时服务上下文（用于 URL 模板 tenant/project 占位参数解析） */
  _appServices?: DataSetAppServices | undefined

  /** @internal 页面路由快照（页面运行时服务缺失时的作用域兜底） */
  _pageRoute?: unknown

  /** @internal DataView 级联索引：parentTable:parentViewId → target cascades */
  private _childCascadeIdx = new Map<string, DataViewQueryCascade[]>()
  /** @internal DataView 级联索引：childTable:childViewId → source cascades */
  private _parentCascadeIdx = new Map<string, DataViewQueryCascade[]>()
  private _fieldCascadeRuntime: DataViewFieldCascadeRuntime | undefined
  private _fieldCascadeListeners = new Map<
    (address: DataViewFieldCascadeAddress, state: DataViewFieldCascadeState) => void, () => void>()

  /** @internal 资源关系索引：parentTable → DataResourceRelation[]（聚合函数消费） */
  private _resourceChildRelationIdx = new Map<string, DataResourceRelation[]>()
  /** @internal 资源关系索引：childTable → DataResourceRelation[] */
  private _resourceParentRelationIdx = new Map<string, DataResourceRelation[]>()

  // ===== 动态视图订阅追踪 =====

  /**
   * 活跃的 onAnyViewChange 订阅（handler + 每个视图的清理函数）。
   * 当 DataTable.getOrCreateView() 创建新视图时，
   * DataSet._subscribeNewView() 自动为所有活跃订阅追加监听。
   * @internal
   */
  _activeViewSubs: Array<{
    handlers: ViewChangeHandlers
    unsubs: Array<() => void>
  }> = []

  /**
   * 活跃的 on('loadSuccess'|'loadError') 订阅追踪。
   * @internal
   */
  _activeOnSubs: Array<{
    event: 'loadSuccess' | 'loadError'
    handler: (payload: { tableName: string; viewId: string; error?: Error }) => void
    unsubs: Array<() => void>
  }> = []



  // ===== 构造函数 =====

  /**
   * 创建数据集实例
   * @param config 数据集配置
   */
  constructor(config: DataSetConfig) {
    super({ dataSetName: config.dataSetName })
    assertNoSeparator(config.dataSetName, 'dataSetName')
    this.dataSetName = config.dataSetName
    this.scenarioId = normalizeScenarioId(config.scenarioId)
    Object.defineProperty(this, 'scenarioId', { writable: false, configurable: false })
    this._applyNormalizedMetadata({
      dataSetName: config.dataSetName,
      tables: config.tables,
      schemaVersion: config.schemaVersion ?? 2,
      ...(config.scenarioId !== undefined ? { scenarioId: config.scenarioId } : {}),
      ...(config.resourceRelations !== undefined ? { resourceRelations: config.resourceRelations.map(relation => ResourceRelationDefinition.normalize(relation, config.tables)) } : {}),
      ...(config.viewCascades !== undefined ? { viewCascades: config.viewCascades } : {}),
      ...(config.version !== undefined ? { version: config.version } : {}),
      ...(config.pageId !== undefined ? { pageId: config.pageId } : {}),
      ...(config.saveChanges !== undefined ? { saveChanges: config.saveChanges } : {}),
      ...(config.layout !== undefined ? { layout: config.layout } : {}),
    })
  }

  /**
   * 对所有表的 default 视图触发 autoCurrentFirst / autoSelectFirst 初始选中逻辑。
   *
   * 必须在页面脚本（__init__）完成事件订阅**之后**调用，确保订阅者能收到
   * `currentRowChanged` 事件。渲染层在组件 mounted 钩子中、
   * `__init__` 执行完毕后调用此方法。
   */
  initAutoSelection(): void {
    for (const table of Object.values(this.tables)) {
      for (const view of Object.values(table.views)) {
        view.initAutoSelection()
      }
    }
  }

  // ===== HTTP 客户端共享 =====

  /**
   * 注入共享 HTTP 客户端（M5）——所有 DataTable 的 CrudService 将复用该实例。
   *
   * 调用时机：DataSet 构建完成后、首次数据请求之前。
  * 已创建的 CrudService 实例不受影响（它们保留初始化时的 HttpClientBase）。
   *
   * @param client  HttpClientBase 实例（通常由应用层 auth 模块创建，带统一拦截器）
   */
  setSharedHttpClient(client: HttpClientBase): void {
    this._sharedHttpClient = client
  }

    /** 设置 App Services。 */
setAppServices(appServices: DataSetAppServices): void {
    this._appServices = appServices
  }

    /** 设置 Page Route。 */
setPageRoute(route: unknown): void {
    this._pageRoute = route
  }

    /** 读取 Request Template Params。 */
getRequestTemplateParams(): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    const appServices = this._appServices
    const tenantFromService = pickFirstString(appServices?.tenant?.tenantId)
    if (tenantFromService !== undefined) result['tenantId'] = tenantFromService

    const routeFromServices = resolveRouteTemplateParams(appServices?.router?.currentRoute)
    const routeFromPage = resolveRouteTemplateParams(this._pageRoute)

    const tenantFromRoute = routeFromServices.tenantId ?? routeFromPage.tenantId
    const projectFromRoute = routeFromServices.projectId ?? routeFromPage.projectId

    if (tenantFromRoute !== undefined) result['tenantId'] = tenantFromRoute
    if (projectFromRoute !== undefined) result['projectId'] = projectFromRoute
    return result
  }

  // ===== 数据集级别事件订阅（页面脚本便捷 API） =====

  /**
   * 订阅数据集级别的加载事件（覆盖所有已注册表的所有视图）
   *
   * - `'loadSuccess'`：任一视图从服务器成功加载数据后触发
   * - `'loadError'`：任一视图加载失败后触发（payload.error 含错误对象）
   *
   * @returns 取消订阅函数（页面卸载时调用以防内存泄漏）
   *
   * @example
   * ```js
   * const off = dataSet.on('loadSuccess', ({ tableName }) => {
   *   ElMessage.success(`${tableName} 加载完成`)
   * })
   * // 资源释放时: off()
   * ```
   */
  on(
    event: 'loadSuccess' | 'loadError',
    handler: (payload: { tableName: string; viewId: string; error?: Error }) => void
  ): () => void {
    const entry: (typeof this._activeOnSubs)[number] = { event, handler, unsubs: [] }
    this._activeOnSubs.push(entry)

    // 订阅当前已存在的所有视图
    for (const table of Object.values(this.tables)) {
      table.forEachView(view => this._subscribeOnView(entry, view))
    }

    return () => {
      for (const u of entry.unsubs) u()
      entry.unsubs.length = 0
      const idx = this._activeOnSubs.indexOf(entry)
      if (idx >= 0) this._activeOnSubs.splice(idx, 1)
    }
  }

  /**
   * 订阅此 DataSet 内任意视图的状态变化（替代全局 event-bus）。
   *
   * 接收 ViewChangeHandlers 映射，按需注册感兴趣的事件类型。
   * 自动追踪：后续通过 getOrCreateView() 动态创建的视图也会被订阅。
   * 作用域严格限定于本实例，不同页面的 DataSet 相互隔离。
   *
   * @example
   * ```ts
   * const off = dataSet.onAnyViewChange({
   *   currentRowChanged(tableName, viewId, currentRow) { ... },
   *   selectedRowsChanged(tableName, viewId, selectedRows) { ... },
   *   cleared(tableName, viewId) { ... },
   * })
   * ```
   */
  onAnyViewChange(handlers: ViewChangeHandlers): () => void {
    const entry: (typeof this._activeViewSubs)[number] = { handlers, unsubs: [] }
    this._activeViewSubs.push(entry)

    // 订阅当前已存在的所有视图
    for (const table of Object.values(this.tables)) {
      table.forEachView(view => this._subscribeViewChange(entry, view))
    }

    return () => {
      for (const u of entry.unsubs) u()
      entry.unsubs.length = 0
      const idx = this._activeViewSubs.indexOf(entry)
      if (idx >= 0) this._activeViewSubs.splice(idx, 1)
    }
  }

  // ===== 动态视图订阅内部方法 =====

  /** @internal 为单个视图订阅独立事件（onAnyViewChange 用） */
  private _subscribeViewChange(
    entry: (typeof this._activeViewSubs)[number],
    view: DataView,
  ): void {
    const tn = view.tableName
    const vid = view.viewId
    const h = entry.handlers

    if (h.currentRowChanged !== undefined) {
      const fn = (currentRow: DataRow | null, originatorId?: string) => h.currentRowChanged?.(tn, vid, currentRow, originatorId)
      view.events.on('currentRowChanged', fn)
      entry.unsubs.push(() => view.events.off('currentRowChanged', fn))
    }
    if (h.selectedRowsChanged !== undefined) {
      const fn = (selectedRows: DataRow[], originatorId?: string) => h.selectedRowsChanged?.(tn, vid, selectedRows, originatorId)
      view.events.on('selectedRowsChanged', fn)
      entry.unsubs.push(() => view.events.off('selectedRowsChanged', fn))
    }
    if (h.rowsChanged !== undefined) {
      const fn = () => h.rowsChanged?.(tn, vid)
      view.events.on('rowsChanged', fn)
      entry.unsubs.push(() => view.events.off('rowsChanged', fn))
    }
    if (h.editingFieldChanged !== undefined) {
      const fn = (event: Parameters<NonNullable<ViewChangeHandlers['editingFieldChanged']>>[2]) => h.editingFieldChanged?.(tn, vid, event)
      view.events.on('editingFieldChanged', fn)
      entry.unsubs.push(() => view.events.off('editingFieldChanged', fn))
    }
    if (h.editingChanged !== undefined) {
      const fn = () => h.editingChanged?.(tn, vid)
      view.events.on('editingChanged', fn)
      entry.unsubs.push(() => view.events.off('editingChanged', fn))
    }
    if (h.editingDiscarded !== undefined) {
      const fn = (ids: ReadonlyArray<string | number> | undefined) => h.editingDiscarded?.(tn, vid, ids)
      view.events.on('editingDiscarded', fn)
      entry.unsubs.push(() => view.events.off('editingDiscarded', fn))
    }
    if (h.cleared !== undefined) {
      const fn = () => h.cleared?.(tn, vid)
      view.events.on('cleared', fn)
      entry.unsubs.push(() => view.events.off('cleared', fn))
    }
    if (h.configChanged !== undefined) {
      const fn = () => h.configChanged?.(tn, vid)
      view.events.on('configChanged', fn)
      entry.unsubs.push(() => view.events.off('configChanged', fn))
    }
    if (h.requestStateChanged !== undefined) {
      const fn = (requestState: RequestState) => h.requestStateChanged?.(tn, vid, requestState)
      view.events.on('requestStateChanged', fn)
      entry.unsubs.push(() => view.events.off('requestStateChanged', fn))
    }
    if (h.mutatingChanged !== undefined) {
      const fn = (mutating: boolean) => h.mutatingChanged?.(tn, vid, mutating)
      view.events.on('mutatingChanged', fn)
      entry.unsubs.push(() => view.events.off('mutatingChanged', fn))
    }
    if (h.summaryChanged !== undefined) {
      const fn = () => h.summaryChanged?.(tn, vid)
      view.events.on('summaryChanged', fn)
      entry.unsubs.push(() => view.events.off('summaryChanged', fn))
    }
    if (h.selectionSummaryChanged !== undefined) {
      const fn = () => h.selectionSummaryChanged?.(tn, vid)
      view.events.on('selectionSummaryChanged', fn)
      entry.unsubs.push(() => view.events.off('selectionSummaryChanged', fn))
    }
  }

  /** @internal 为单个视图订阅 loadSuccess/loadError（on() 用） */
  private _subscribeOnView(
    entry: (typeof this._activeOnSubs)[number],
    view: DataView,
  ): void {
    const h = (requestState: RequestState) => {
      if (entry.event === 'loadSuccess' && requestState === RequestState.Loaded) {
        entry.handler({ tableName: view.tableName, viewId: view.viewId })
      } else if (entry.event === 'loadError'
        && requestState === RequestState.Failed
        && view.loadingError !== null) {
        entry.handler({ tableName: view.tableName, viewId: view.viewId, error: view.loadingError })
      }
    }
    view.events.on('requestStateChanged', h)
    entry.unsubs.push(() => view.events.off('requestStateChanged', h))
  }

  /**
   * 将动态创建的视图注册到所有活跃订阅中。
   * 由 DataTable.getOrCreateView() 在创建新视图时调用。
   * @internal
   */
  _subscribeNewView(view: DataView): void {
    for (const entry of this._activeViewSubs) {
      this._subscribeViewChange(entry, view)
    }
    for (const entry of this._activeOnSubs) {
      this._subscribeOnView(entry, view)
    }
  }

  /** @internal 在结构变化后重绑所有活跃订阅，避免悬空闭包持有已删除视图。 */
  private _rebindActiveSubscriptions(): void {
    for (const entry of this._activeViewSubs) {
      for (const u of entry.unsubs) u()
      entry.unsubs.length = 0
      for (const table of Object.values(this.tables)) {
        table.forEachView(view => this._subscribeViewChange(entry, view))
      }
    }

    for (const entry of this._activeOnSubs) {
      for (const u of entry.unsubs) u()
      entry.unsubs.length = 0
      for (const table of Object.values(this.tables)) {
        table.forEachView(view => this._subscribeOnView(entry, view))
      }
    }
  }

  /**
   * 触发所有标记了 `autoLoad: true` 的 default 视图自动加载。
   *
   * 页面调用渲染层在构建 DataSet 后调用此方法；
   * 业务脚本不再需要在 `__init__` 中手动写 `view.loadFromServer()`。
   *
   * 仅处理 default 视图——命名视图和从表通常由级联机制驱动。
   */
  triggerAutoLoad(): void {
    for (const table of Object.values(this.tables)) {
      const defaultView = table.getView('default')
      if (defaultView?.autoLoad && defaultView.requestState === RequestState.Idle) {
        defaultView.requestData().catch((err: unknown) => {
          dsLogger.warn(`autoLoad 请求失败: ${table.tableName}`, err)
        })
      }
    }
  }

  // ===== 关系图查询（网状关系，非树形） =====

  /**
   * 查询以指定 DataView 为源的目标级联（视图级索引）
   * @param parentTable 父表名
   * @param parentViewId 父视图ID
   */
  getChildCascades(parentTable: string, parentViewId: string): DataViewQueryCascade[] {
    return this._childCascadeIdx.get(`${parentTable}:${parentViewId}`) ?? []
  }

  /**
   * 查询以指定 DataView 为目标的源级联（视图级索引）
   * @param childTable 子表名
   * @param childViewId 子视图ID
   */
  getParentCascades(childTable: string, childViewId: string): DataViewQueryCascade[] {
    return this._parentCascadeIdx.get(`${childTable}:${childViewId}`) ?? []
  }

  /** 将 DataView 输入级联解析为目标视图过滤表达式。 */
  resolveCascadeFilter(rel: DataViewQueryCascade): DataViewFilterTree | undefined | null {
    const parentView = this.getView(rel.parentTable, rel.parentViewId)
    if (!parentView) return null

    const parentRows = getParentRows(parentView, rel.dependencyType ?? 'currentRow')
    const parentReady = parentView.requestState === RequestState.Loaded || parentView.rows.length > 0
    if (!parentReady || parentRows.length === 0) return null

    const filters: DataViewFilterTree[] = []
    for (const binding of rel.filterBindings) {
      const isComputedField = parentView.columns.some(
        column => column.name === binding.sourceField && column.computeExpression !== undefined,
      )
      const values: Array<string | number | boolean | null> = []
      const seen = new Set<unknown>()

      for (const row of parentRows) {
        if (binding.sourceField in row) {
          const value = row[binding.sourceField]
          if (value === undefined) {
            if (!isComputedField) {
              throw new Error(`远端级联过滤字段 "${binding.sourceField}" 解析为 undefined [${rel.childTable}:${rel.childViewId}]`)
            }
            continue
          }
          if (!seen.has(value)) {
            seen.add(value)
            values.push(toFilterScalar(value, binding.sourceField))
          }
        } else if (!isComputedField) {
          throw new Error(`远端级联过滤引用了不存在的源字段 "${binding.sourceField}" [${rel.childTable}:${rel.childViewId}]`)
        }
      }

      if (values.length === 0) return null

      if (values.length > 1) {
        filters.push(DataViewFilter.condition({ field: binding.targetField, operator: 'in', value: values }).toJSON())
      } else {
        const firstValue = values[0]
        if (firstValue === undefined) return null
        filters.push(DataViewFilter.condition({ field: binding.targetField, operator: 'eq', value: firstValue }).toJSON())
      }
    }

    if (filters.length === 1) return filters[0]
    return DataViewFilter.group({ logic: 'and', filters }).toJSON()
  }

  /**
   * 查询以指定资源为父的所有资源关系（聚合函数消费）
   */
  getResourceChildRelations(parentTable: string): DataResourceRelation[] {
    return this._resourceChildRelationIdx.get(parentTable) ?? []
  }

  /**
   * 查询以指定资源为子的所有资源关系
   */
  getResourceParentRelations(childTable: string): DataResourceRelation[] {
    return this._resourceParentRelationIdx.get(childTable) ?? []
  }

  /** @internal 构建 DataView 输入级联双向索引。 */
  private _buildViewCascadeIndex(): void {
    this._childCascadeIdx.clear()
    this._parentCascadeIdx.clear()
    for (const r of this.viewCascades ?? []) {
      if (r.kind === 'field') continue
      const cKey = `${r.childTable}:${r.childViewId}`
      let cArr = this._parentCascadeIdx.get(cKey)
      if (!cArr) { cArr = []; this._parentCascadeIdx.set(cKey, cArr) }
      cArr.push(r)

      const pKey = `${r.parentTable}:${r.parentViewId}`
      let pArr = this._childCascadeIdx.get(pKey)
      if (!pArr) { pArr = []; this._childCascadeIdx.set(pKey, pArr) }
      pArr.push(r)
    }
  }

  /** @internal 构建数据资源关系双向索引。 */
  private _buildResourceRelationIndex(): void {
    this._resourceChildRelationIdx.clear()
    this._resourceParentRelationIdx.clear()
    for (const tr of this.resourceRelations ?? []) {
      let pArr = this._resourceChildRelationIdx.get(tr.parentTable)
      if (!pArr) { pArr = []; this._resourceChildRelationIdx.set(tr.parentTable, pArr) }
      pArr.push(tr)
      let cArr = this._resourceParentRelationIdx.get(tr.childTable)
      if (!cArr) { cArr = []; this._resourceParentRelationIdx.set(tr.childTable, cArr) }
      cArr.push(tr)
    }
  }

  /** @internal 重建运行时关系图与索引，并通知各视图刷新级联订阅/聚合解析。 */
  private _rebuildDataLinks(): void {
    const fields = DataViewFieldCascadeDefinition.validateAll(this.viewCascades ?? [])
    DataViewFieldCascadeDefinition.validateRuntime(fields, this)
    for (const unsubscribe of this._fieldCascadeListeners.values()) unsubscribe()
    this._fieldCascadeRuntime?.destroy()
    this._buildResourceRelationIndex()
    this._buildViewCascadeIndex()

    this._fieldCascadeRuntime = new DataViewFieldCascadeRuntime(this, fields)
    for (const listener of this._fieldCascadeListeners.keys()) {
      this._fieldCascadeListeners.set(listener, this._fieldCascadeRuntime.onChange(listener))
    }

    for (const table of Object.values(this.tables)) {
      table.onDataSetStructureReady()
    }
  }

  private _createTablesFromMetadata(tableDefs: Record<string, TableMetadata>): void {
    this.tables = {}
    for (const [name, td] of Object.entries(tableDefs)) {
      const table = DataTable.fromJson(td)
      table.setDataSet(this)
      this.tables[name] = table
    }
  }

  private _applyNormalizedMetadata(normalized: DataSetMetadata): void {
    for (const unsubscribe of this._fieldCascadeListeners.values()) unsubscribe()
    this._fieldCascadeRuntime?.destroy()
    this._fieldCascadeRuntime = undefined
    this.dataSetName = normalized.dataSetName
    this.schemaVersion = normalized.schemaVersion ?? 2
    this.resourceRelations = undefined
    this.viewCascades = normalized.viewCascades
    this.version = normalized.version
    this.pageId = normalized.pageId
    this.saveChangesConfig = normalized.saveChanges
    this.layout = normalized.layout
    this._childCascadeIdx.clear()
    this._parentCascadeIdx.clear()
    this._createTablesFromMetadata(normalized.tables)
    this.resourceRelations = normalized.resourceRelations?.map(relation => ResourceRelationDefinition.normalize(relation, this.tables))
    this._rebuildDataLinks()
  }

    /** 执行 replace From Json 操作。 */
replaceFromJson(json: DataSetMetadata | Record<string, unknown> | string): void {
    const candidate = DataSet.fromJson(json)
    let normalized: DataSetMetadata
    try { normalized = normalizeDataSetMetadata(candidate.toJson()) } finally { candidate.destroy() }
    if (normalized.scenarioId !== this.scenarioId) {
      throw new Error('DataSet.replaceFromJson: 场景身份不可变更，请重新装配运行 DataSet')
    }

    for (const table of Object.values(this.tables)) {
      table.destroy()
      table.dataSet = undefined
    }

    this._applyNormalizedMetadata(normalized)
    this._rebindActiveSubscriptions()
  }

    /** 执行 list Snapshots 操作。 */
listSnapshots(options?: DataSetHistoryListOptions): DataSetHistorySnapshot[] {
    return listDataSetSnapshots(buildDataSetHistoryScope(this, options), options)
  }

    /** 读取 Snapshot。 */
getSnapshot(selector: DataSetSnapshotSelector, options?: DataSetHistoryListOptions): DataSetHistorySnapshot | null {
    return getDataSetSnapshot(buildDataSetHistoryScope(this, options), selector, options)
  }

    /** 执行 commit Snapshot 操作。 */
commitSnapshot(options?: DataSetCommitSnapshotOptions): DataSetHistorySnapshot {
    const latestHistoryVersion = this.listSnapshots(options)[0]?.version ?? 0
    const timestamp = options?.timestamp ?? Date.now()
    const nextVersion = options?.bumpVersion === false
      ? Math.max(this.version ?? 0, latestHistoryVersion)
      : Math.max(this.version ?? 0, latestHistoryVersion) + 1

    this.version = nextVersion

    const committed = commitDataSetSnapshot(this, {
      ...options,
      dataSetName: this.dataSetName,
      ...(options?.pageId !== undefined
        ? { pageId: options.pageId }
        : this.pageId !== undefined
          ? { pageId: this.pageId }
          : {}),
      version: nextVersion,
      timestamp,
    })

    if (committed) {
      return committed
    }

    return {
      id: `${nextVersion}-${timestamp}`,
      version: nextVersion,
      timestamp,
      dataSetName: this.dataSetName,
      ...(this.pageId !== undefined ? { pageId: this.pageId } : {}),
      ...(options?.label ? { label: options.label } : {}),
      ...(options?.summary ? { summary: options.summary } : {}),
      snapshot: this.toJson(),
      ...(options?.sourceData ? { sourceData: deepClone(options.sourceData) } : {}),
    }
  }

    /** 执行 restore Snapshot 操作。 */
restoreSnapshot(selector: DataSetSnapshotSelector, options?: DataSetHistoryListOptions): DataSetHistorySnapshot | null {
    const entry = this.getSnapshot(selector, options)
    if (!entry) return null
    this.replaceFromJson(entry.snapshot)
    this.version = entry.version
    return entry
  }

  // ===== 结构变更 =====

  /**
   * 动态添加一张表（含 default 视图）。
   * @returns 新建的 DataTable 实例
   * @throws 表名已存在时抛 Error
   */
  addTable(tableName: string, columns: DataColumn[]): DataTable {
    if (this.tables[tableName]) {
      throw new Error(`Table "${tableName}" already exists in DataSet "${this.dataSetName}"`)
    }

    const table = new DataTable(tableName, columns)
    this.tables[tableName] = table
    table.setDataSet(this)
    table.forEachView(view => this._subscribeNewView(view))
    return table
  }

  /**
   * 删除未被数据资源关系或 DataView 输入级联引用的数据表。
   * fail-fast：若仍被 resourceRelations / viewCascades 引用，则拒绝删除。
   */
  removeTable(tableName: string): void {
    const table = this.tables[tableName]
    if (!table) throw new Error(`Table "${tableName}" not found in DataSet "${this.dataSetName}"`)

    const relatedRelation = (this.resourceRelations ?? []).find(
      rel => rel.parentTable === tableName || rel.childTable === tableName || this._relationReferencesTable(rel, tableName),
    )
    if (relatedRelation) {
      throw new Error(`Table "${tableName}" is referenced by resourceRelations, remove resource relation first`)
    }

    const relatedCascade = (this.viewCascades ?? []).find(
      dep => dep.kind === 'field'
        ? dep.tableName === tableName || dep.optionsView.tableName === tableName
        : dep.parentTable === tableName || dep.childTable === tableName,
    )
    if (relatedCascade) {
      throw new Error(`Table "${tableName}" is referenced by viewCascades, remove cascade first`)
    }

    table.destroy()
    table.dataSet = undefined
    const { [tableName]: _removed, ...rest } = this.tables
    this.tables = rest
    this._rebindActiveSubscriptions()
  }

  private _relationReferencesTable(relation: DataResourceRelation, tableName: string): boolean {
    return ResourceRelationDefinition.referencesTable(relation.filterExpression, tableName)
  }

  private _resolveResourceRelationIndex(selector: {
    parentTable: string
    childTable: string
    relationId?: string
    parentField?: string
    childField?: string
  }): number {
    const matches = (this.resourceRelations ?? [])
      .map((relation, index) => ({ relation, index }))
      .filter(({ relation }) => {
        if (relation.parentTable !== selector.parentTable || relation.childTable !== selector.childTable) return false
        if (selector.relationId !== undefined && relation.relationId !== selector.relationId) return false
        if (selector.parentField !== undefined && !this._relationHasField(relation, selector.parentField, 'parent')) return false
        if (selector.childField !== undefined && !this._relationHasField(relation, selector.childField, 'child')) return false
        return true
      })

    if (matches.length === 0) {
      throw new Error(`Relation ${selector.parentTable}→${selector.childTable} not found`)
    }
    if (matches.length > 1) {
      throw new Error(`Relation ${selector.parentTable}→${selector.childTable} is ambiguous, specify relationId`)
    }
    const match = matches[0]
    if (!match) {
      throw new Error(`Relation ${selector.parentTable}→${selector.childTable} not found`)
    }
    return match.index
  }

  private _relationHasField(relation: DataResourceRelation, fieldName: string, side: 'parent' | 'child'): boolean {
    return ResourceRelationDefinition.referencesField({expression: relation.filterExpression,
      parentTable: relation.parentTable, childTable: relation.childTable,
      tableName: side === 'parent' ? relation.parentTable : relation.childTable, fieldName})
  }

  private _resolveCascadeIndex(selector: DataViewCascadeSelector): number {
    this.viewCascades ??= []
    const idx = this.viewCascades.findIndex(dep => {
      if (dep.kind === 'field') return false
      if (dep.parentTable !== selector.parentTable || dep.parentViewId !== selector.parentViewId) return false
      if (dep.childTable !== selector.childTable || dep.childViewId !== selector.childViewId) return false
      return selector.cascadeId === undefined || dep.cascadeId === selector.cascadeId
    })
    if (idx < 0) {
      throw new Error(`Cascade ${selector.parentTable}:${selector.parentViewId}→${selector.childTable}:${selector.childViewId} not found`)
    }
    return idx
  }

  /**
   * 添加 DataResourceRelation（数据资源字段关系）。
   * @throws 引用的表/字段不存在或关系已重复时抛 Error
   */
  addResourceRelation(params: DataResourceRelationInput): DataResourceRelation {
    const relation = ResourceRelationDefinition.normalize(params, this.tables)
    const parentTable = this.getTable(relation.parentTable)
    const childTable = this.getTable(relation.childTable)
    if (!parentTable) throw new Error(`Parent table "${relation.parentTable}" not found`)
    if (!childTable) throw new Error(`Child table "${relation.childTable}" not found`)
    const duplicate = (this.resourceRelations ?? []).some(existing => relation.relationId !== undefined
      ? existing.relationId === relation.relationId
      : JSON.stringify(existing.filterExpression) === JSON.stringify(relation.filterExpression)
        && existing.parentTable === relation.parentTable && existing.childTable === relation.childTable)
    if (duplicate) throw new Error(`Relation ${relation.parentTable}→${relation.childTable} already exists`)
    this.resourceRelations = [...(this.resourceRelations ?? []), relation]
    this._rebuildDataLinks()
    return relation
  }

  /**
   * 更新 DataResourceRelation。
   * 若存在多个同 parentTable→childTable 的关系，必须显式指定 parentField/childField 消歧。
   */
  updateResourceRelation(
    selector: {
      parentTable: string
      childTable: string
      relationId?: string
      parentField?: string
      childField?: string
    },
    updates: Partial<DataResourceRelation>,
  ): DataResourceRelation {
    const idx = this._resolveResourceRelationIndex(selector)
    const current = this.resourceRelations?.[idx]
    if (!current) {
      throw new Error(`Relation ${selector.parentTable}→${selector.childTable} not found`)
    }
    const next = ResourceRelationDefinition.normalize({...current, ...updates}, this.tables)
    if (!this.getTable(next.parentTable) || !this.getTable(next.childTable)) throw new Error('Relation endpoints must reference existing tables')

    const duplicate = (this.resourceRelations ?? []).some((relation, relationIndex) => {
      if (relationIndex === idx) return false
      if (next.relationId !== undefined && relation.relationId === next.relationId) return true
      return next.relationId === undefined && relation.parentTable === next.parentTable && relation.childTable === next.childTable
        && JSON.stringify(relation.filterExpression) === JSON.stringify(next.filterExpression)
    })
    if (duplicate) {
      throw new Error(`Relation ${next.parentTable}→${next.childTable} already exists`)
    }

    this.resourceRelations = (this.resourceRelations ?? []).map((relation, relationIndex) => relationIndex === idx ? next : relation)
    this._rebuildDataLinks()
    return next
  }

  /**
   * 删除 DataResourceRelation。
   * @throws 关系不存在时抛 Error
   */
  removeResourceRelation(selector: {
    parentTable: string
    childTable: string
    relationId?: string
    parentField?: string
    childField?: string
  }): void
  removeResourceRelation(selector: {
    parentTable: string
    childTable: string
    relationId?: string
    parentField?: string
    childField?: string
  }): void {
    const idx = this._resolveResourceRelationIndex(selector)
    const relation = this.resourceRelations?.[idx]
    if (!relation) {
      throw new Error(`Relation ${selector.parentTable}→${selector.childTable} not found`)
    }

    this.resourceRelations = (this.resourceRelations ?? []).filter((_item, index) => index !== idx)
    this._rebuildDataLinks()
  }

  private _assertCascadeShape(cascade: DataViewQueryCascade): void {
    const parentTable = this.getTable(cascade.parentTable)
    if (!parentTable) throw new Error(`Parent table "${cascade.parentTable}" not found`)
    const childTable = this.getTable(cascade.childTable)
    if (!childTable) throw new Error(`Child table "${cascade.childTable}" not found`)
    const parentView = parentTable.getView(cascade.parentViewId)
    if (!parentView) throw new Error(`Parent view "${cascade.parentTable}:${cascade.parentViewId}" not found`)
    const childView = childTable.getView(cascade.childViewId)
    if (!childView) throw new Error(`Child view "${cascade.childTable}:${cascade.childViewId}" not found`)
    if (cascade.filterBindings.length === 0) {
      throw new Error(`Cascade ${cascade.parentTable}:${cascade.parentViewId}→${cascade.childTable}:${cascade.childViewId} requires filterBindings`)
    }
    for (const binding of cascade.filterBindings) {
      if (!parentView.columns.some(column => column.name === binding.sourceField)) {
        throw new Error(`Source field "${binding.sourceField}" not found in view "${cascade.parentTable}:${cascade.parentViewId}"`)
      }
      if (!childView.columns.some(column => column.name === binding.targetField)) {
        throw new Error(`Target field "${binding.targetField}" not found in view "${cascade.childTable}:${cascade.childViewId}"`)
      }
    }
  }

  /**
   * 添加 DataViewCascade（DataView 输入级联）。
   * @throws 级联引用非法或重复时抛 Error
   */
  addCascade(cascade: DataViewCascade): void {
    if (cascade.kind === 'field') {
      const next = DataViewFieldCascadeDefinition.parse(cascade)
      DataViewFieldCascadeDefinition.validateAll([...(this.viewCascades ?? []), next])
      DataViewFieldCascadeDefinition.validateRuntime([next], this)
      this.viewCascades = [...(this.viewCascades ?? []), next]
      this._rebuildDataLinks()
      return
    }
    this._assertCascadeShape(cascade)
    this.viewCascades ??= []

    const dup = this.viewCascades.some(dep => {
      if (dep.kind === 'field') return dep.cascadeId === cascade.cascadeId
      if (cascade.cascadeId !== undefined && dep.cascadeId === cascade.cascadeId) return true
      return dep.parentTable === cascade.parentTable
        && dep.parentViewId === cascade.parentViewId
        && dep.childTable === cascade.childTable
        && dep.childViewId === cascade.childViewId
        && JSON.stringify(dep.filterBindings) === JSON.stringify(cascade.filterBindings)
    })
    if (dup) {
      throw new Error(`Cascade ${cascade.parentTable}:${cascade.parentViewId}→${cascade.childTable}:${cascade.childViewId} already exists`)
    }

    this.viewCascades.push(deepClone({
      ...cascade,
      dependencyType: cascade.dependencyType ?? 'currentRow',
    }))
    this._rebuildDataLinks()
  }

  /**
   * 更新 DataViewCascade。
   * 资源关系与输入级联独立；这里只校验 DataView 端点和字段绑定。
   */
  updateCascade(
    selector: DataViewCascadeSelector,
    updates: Partial<DataViewQueryCascade>,
  ): DataViewQueryCascade {
    this.viewCascades ??= []

    const idx = this._resolveCascadeIndex(selector)
    const current = this.viewCascades[idx]
    if (!current) {
      throw new Error(`Cascade ${selector.parentTable}:${selector.parentViewId}→${selector.childTable}:${selector.childViewId} not found`)
    }
    if (current.kind === 'field') throw new Error('FIELD_CASCADE_QUERY_ONLY: 此入口只维护查询级联')
    const next: DataViewQueryCascade = {
      ...current,
      ...updates,
      parentTable: updates.parentTable ?? current.parentTable,
      parentViewId: updates.parentViewId ?? current.parentViewId,
      childTable: updates.childTable ?? current.childTable,
      childViewId: updates.childViewId ?? current.childViewId,
      filterBindings: updates.filterBindings ?? current.filterBindings,
    }

    this._assertCascadeShape(next)

    const duplicate = this.viewCascades.some((dep, depIndex) => {
      if (depIndex === idx) return false
      if (dep.kind === 'field') return next.cascadeId !== undefined && dep.cascadeId === next.cascadeId
      if (next.cascadeId !== undefined && dep.cascadeId === next.cascadeId) return true
      return dep.parentTable === next.parentTable
        && dep.parentViewId === next.parentViewId
        && dep.childTable === next.childTable
        && dep.childViewId === next.childViewId
        && JSON.stringify(dep.filterBindings) === JSON.stringify(next.filterBindings)
    })
    if (duplicate) {
      throw new Error(`Cascade ${next.parentTable}:${next.parentViewId}→${next.childTable}:${next.childViewId} already exists`)
    }

    this.viewCascades[idx] = next
    this._rebuildDataLinks()
    return next
  }

  /**
   * 删除 DataViewCascade。
   * @throws 级联不存在时抛 Error
   */
  removeCascade(selector: DataViewCascadeSelector): void {
    this.viewCascades ??= []

    const idx = this._resolveCascadeIndex(selector)

    this.viewCascades.splice(idx, 1)
    this._rebuildDataLinks()
  }

  getFieldCascadeState(address: DataViewFieldCascadeAddress): DataViewFieldCascadeState {
    if (!this._fieldCascadeRuntime) throw new Error('FIELD_CASCADE_RUNTIME: 未初始化')
    return this._fieldCascadeRuntime.getState(address)
  }

  refreshFieldCascade(address: DataViewFieldCascadeAddress): Promise<DataViewFieldCascadeState> {
    if (!this._fieldCascadeRuntime) throw new Error('FIELD_CASCADE_RUNTIME: 未初始化')
    return this._fieldCascadeRuntime.refresh(address)
  }

  onFieldCascadeChange(listener: (address: DataViewFieldCascadeAddress, state: DataViewFieldCascadeState) => void): () => void {
    if (!this._fieldCascadeRuntime) throw new Error('FIELD_CASCADE_RUNTIME: 未初始化')
    this._fieldCascadeListeners.get(listener)?.()
    this._fieldCascadeListeners.set(listener, this._fieldCascadeRuntime.onChange(listener))
    return () => {
      this._fieldCascadeListeners.get(listener)?.()
      this._fieldCascadeListeners.delete(listener)
    }
  }

  // ===== 数据访问 =====

  /**
   * 销毁 DataSet 及其所有 DataTable/DataView 的资源。
   *
   * 调用后：
   * - 所有 `onAnyViewChange` / `on('loadSuccess'|'loadError')` 订阅被清理
   * - 所有 DataView 的 destroy() 被调用（清理级联、CRUD、计算列、脏追踪等委托）
   * - 共享 HTTP 客户端引用被释放
   * - 标记为已销毁，后续操作静默忽略
   *
   * 使用场景：页面调用 dispose 时释放其拥有的 DataSet。
   */
  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    this._fieldCascadeRuntime?.destroy()
    this._fieldCascadeRuntime = undefined
    this._fieldCascadeListeners.clear()

    // 1. 清理 DataSet 级别的事件订阅
    for (const entry of this._activeViewSubs) {
      for (const u of entry.unsubs) u()
      entry.unsubs.length = 0
    }
    this._activeViewSubs.length = 0

    for (const entry of this._activeOnSubs) {
      for (const u of entry.unsubs) u()
      entry.unsubs.length = 0
    }
    this._activeOnSubs.length = 0

    // 2. 销毁所有 DataTable 下的 DataView
    for (const table of Object.values(this.tables)) {
      table.forEachView(view => view.destroy())
    }

    // 3. 释放共享 HTTP 客户端引用
    this._sharedHttpClient = undefined
    this._appServices = undefined
    this._pageRoute = undefined
  }

  /** @internal 是否已销毁 */
  private _destroyed = false

  /** 数据集是否已被销毁 */
  get destroyed(): boolean {
    return this._destroyed
  }

  /**
   * 获取数据表
   * @param name 表名
   * @returns 数据表实例
   */
  getTable(name: string): DataTable | undefined {
    return this.tables[name]
  }

  /**
   * 获取已存在的数据视图（不会创建新视图）
   */
  getView(tableName: string, viewId = 'default'): DataView | undefined {
    const t = this.getTable(tableName)
    if (!t) return undefined
    return t.getView(viewId)
  }

  /**
   * 保存 DataSet 范围内的编辑态和 staged 变更。
   *
   * 默认保存所有有变更视图；如果传入 views，则只保存指定视图/行。
   * 场景视图通过同一查询 owner 一次保存；本地 CRUD 视图按资源关系顺序提交。
   */
  async saveChanges(options?: DataSetSaveChangesOptions): Promise<CrudResult<DataSetSaveChangesResult>> {
    const targets = this.resolveSaveChangesTargets(options)
    const mode = options?.mode ?? this.saveChangesConfig?.mode ?? 'perView'
    this.assertScenarioSaveTargets(targets, mode, options)
    if (this.scenarioId !== undefined) {
      for (const target of targets) {
        if (!hasPendingChanges(target.view, target.ids)
          && !((options?.applyEditingRows ?? true) && hasEditingChanges(target.view, target.ids))) continue
        target.view.assertQuerySaveColumns({ ...(target.ids === undefined ? {} : { ids: target.ids }),
          includeEditingRows: options?.applyEditingRows ?? true })
      }
    }
    if (mode === 'transaction') {
      return this.withCascadeSuspended(() => this.saveChangesInTransaction(targets, options))
    }

    return this.withCascadeSuspended(async () => {
      const result = emptyDataSetSaveChangesResult(targets.length)
      const shouldApplyEditingRows = options?.applyEditingRows ?? true
      const querySaves: DataSetScenarioSavePlan[] = []

      for (const target of targets) {
        const view = target.view
        const shouldApply = shouldApplyEditingRows && hasEditingChanges(view, target.ids)
        const shouldSave = hasPendingChanges(view, target.ids)
        if (!shouldApply && !shouldSave) continue

        const viewResult: DataSetSaveChangesViewResult = {
          tableName: view.tableName,
          viewId: view.viewId,
          appliedEditingRows: 0,
          failedEditingRows: 0,
          createdCount: 0,
          savedCount: 0,
          deletedCount: 0,
          failedCount: 0,
          failedIds: [],
          failedErrors: {},
        }

        if (shouldApply) {
          const applyResult = await view.applyEditingRows(target.ids)
          const applyData = applyResult.data
          viewResult.appliedEditingRows = applyData?.appliedCount ?? 0
          viewResult.failedEditingRows = applyData?.failedCount ?? 0
          if (applyData) {
            viewResult.failedIds.push(...applyData.failedIds)
            Object.assign(viewResult.failedErrors, applyData.failedErrors)
          }
        }

        if (viewResult.failedEditingRows === 0 && (shouldSave || viewResult.appliedEditingRows > 0)) {
          if (this.scenarioId !== undefined) querySaves.push({ target, viewResult })
          else {
            const saveResult = await view.saveChanges(target.ids)
            const saveData = saveResult.data
            if (saveData) {
              viewResult.createdCount = saveData.createdCount
              viewResult.savedCount = saveData.savedCount
              viewResult.deletedCount = saveData.deletedCount
              viewResult.failedCount = saveData.failedCount
              viewResult.failedIds.push(...saveData.failedIds)
              for (const [id, message] of Object.entries(saveData.failedErrors)) {
                viewResult.failedErrors[id] = message
              }
            } else if (!saveResult.success) {
              viewResult.failedCount = 1
              viewResult.failedErrors['*'] = saveResult.message ?? saveResult.error?.message ?? '保存失败'
            }
          }
        }

        mergeViewResult(result, viewResult)
      }

      if (querySaves.length > 0) {
        const saved = await DataView.saveQueryViews(querySaves.map(plan => plan.target))
        querySaves.forEach((plan, index) => {
          const saveData = saved[index]?.data
          if (saveData === undefined) throw new Error('DATA_SET_SAVE_RECEIPT: 缺少视图保存统计')
          Object.assign(plan.viewResult, saveData)
          result.createdCount += saveData.createdCount
          result.savedCount += saveData.savedCount
          result.deletedCount += saveData.deletedCount
          result.failedCount += saveData.failedCount
          if (saveData.failedCount > 0) result.failedViews.push({ tableName: plan.target.view.tableName, viewId: plan.target.view.viewId })
        })
      }

      return {
        success: result.failedCount === 0 && result.failedEditingRows === 0,
        message: result.failedCount === 0 && result.failedEditingRows === 0
          ? `保存 ${result.viewResults.length} 个视图：新增 ${result.createdCount}，更新 ${result.savedCount}，删除 ${result.deletedCount}`
          : `保存 ${result.viewResults.length} 个视图存在失败：编辑态失败 ${result.failedEditingRows}，提交失败 ${result.failedCount}`,
        data: result,
      }
    })
  }

  private assertScenarioSaveTargets(
    targets: DataSetSaveChangesTarget[],
    mode: NonNullable<DataSetSaveChangesOptions['mode']>,
    options?: DataSetSaveChangesOptions,
  ): void {
    const active = targets.filter(target => hasPendingChanges(target.view, target.ids)
      || ((options?.applyEditingRows ?? true) && hasEditingChanges(target.view, target.ids)))
    if (this.scenarioId === undefined) {
      if (active.some(target => target.view.dataTable?.modelBinding !== undefined)) {
        throw new Error('DATA_SET_SAVE_IDENTITY: 模型保存必须绑定明确场景')
      }
      return
    }
    if (mode === 'transaction') {
      throw new Error('DATA_SET_SAVE_TRANSACTION_UNSUPPORTED: SPARK save 不提供事务保证')
    }
    const modelIds = new Set<string>()
    const modelNames = new Set<string>()
    for (const { view } of active) {
      if (view.dataSet !== this) throw new Error('DATA_SET_SAVE_IDENTITY: 保存视图不属于当前场景运行实例')
      const binding = view.dataTable?.modelBinding
      if (!binding) throw new Error(`DATA_SET_SAVE_IDENTITY: ${view.tableName}@${view.viewId} 缺少正式模型绑定`)
      if (modelIds.has(binding.modelId) || modelNames.has(binding.modelName)) {
        throw new Error(`DATA_SET_SAVE_MODEL_CONFLICT: ${binding.modelName} 存在多个有变更视图，请明确选择一个视图`)
      }
      modelIds.add(binding.modelId)
      modelNames.add(binding.modelName)
    }
  }

  private async withCascadeSuspended<T>(work: () => Promise<T>): Promise<T> {
    const views: DataView[] = []
    for (const table of Object.values(this.tables)) {
      table.forEachView((view) => {
        view.cascade.teardownCascade()
        views.push(view)
      })
    }

    try {
      return await work()
    } finally {
      await Promise.resolve()
      for (const view of views) {
        if (!view.destroyed) view.cascade.setupCascade()
      }
    }
  }

  private async saveChangesInTransaction(
    targets: DataSetSaveChangesTarget[],
    options?: DataSetSaveChangesOptions,
  ): Promise<CrudResult<DataSetSaveChangesResult>> {
    const result = emptyDataSetSaveChangesResult(targets.length)
    const shouldApplyEditingRows = options?.applyEditingRows ?? true
    const viewPlans: DataSetTransactionViewPlan[] = []

    for (const target of targets) {
      const view = target.view
      const shouldApply = shouldApplyEditingRows && hasEditingChanges(view, target.ids)
      const shouldSave = hasPendingChanges(view, target.ids)
      if (!shouldApply && !shouldSave) continue

      const viewResult: DataSetSaveChangesViewResult = {
        tableName: view.tableName,
        viewId: view.viewId,
        appliedEditingRows: 0,
        failedEditingRows: 0,
        createdCount: 0,
        savedCount: 0,
        deletedCount: 0,
        failedCount: 0,
        failedIds: [],
        failedErrors: {},
      }

      if (shouldApply) {
        const applyResult = await view.applyEditingRows(target.ids)
        const applyData = applyResult.data
        viewResult.appliedEditingRows = applyData?.appliedCount ?? 0
        viewResult.failedEditingRows = applyData?.failedCount ?? 0
        if (applyData) {
          viewResult.failedIds.push(...applyData.failedIds)
          Object.assign(viewResult.failedErrors, applyData.failedErrors)
        }
      }

      if (viewResult.failedEditingRows > 0) {
        mergeViewResult(result, viewResult)
        continue
      }

      const operations = this.collectTransactionOperations(view, target.ids, viewResult)
      if (operations.length === 0) {
        mergeViewResult(result, viewResult)
        continue
      }
      viewPlans.push({ viewResult, operations })
    }

    if (result.failedEditingRows > 0) {
      return {
        success: false,
        message: `事务保存中止：编辑态失败 ${result.failedEditingRows}`,
        data: result,
      }
    }

    const operationPlans = viewPlans.flatMap(plan => plan.operations)
    if (operationPlans.length === 0) {
      return {
        success: true,
        message: `保存 ${result.viewResults.length} 个视图：新增 0，更新 0，删除 0`,
        data: result,
      }
    }

    const transaction = this.resolveSaveChangesTransaction(options)
    const request: DataSetTransactionRequest = {
      operations: operationPlans.map(plan => plan.operation),
    }
    if (transaction.requestId !== undefined) request.requestId = transaction.requestId

    const service = createCrudService(
      { transaction: transaction.endpoint },
      this._sharedHttpClient,
      () => this.getRequestTemplateParams(),
    )
    const transactionResult = await service.executeTransaction<DataSetTransactionResponse>(request)
    if (!transactionResult.success || !transactionResult.data) {
      const message = transactionResult.message ?? transactionResult.error?.message ?? '事务提交失败'
      for (const plan of viewPlans) {
        plan.viewResult.createdCount = 0
        plan.viewResult.savedCount = 0
        plan.viewResult.deletedCount = 0
        plan.viewResult.failedCount = plan.operations.length
        plan.viewResult.failedIds.push(...plan.operations.map(op => op.id))
        plan.viewResult.failedErrors['*'] = message
        mergeViewResult(result, plan.viewResult)
      }
      const failure: CrudResult<DataSetSaveChangesResult> = {
        success: false,
        message,
        data: result,
      }
      if (transactionResult.error !== undefined) failure.error = transactionResult.error
      return failure
    }

    this.applySuccessfulTransactionOperations(operationPlans, transactionResult.data)
    for (const plan of viewPlans) mergeViewResult(result, plan.viewResult)
    result.transaction = transactionResult.data

    return {
      success: true,
      message: `事务保存 ${result.viewResults.length} 个视图：新增 ${result.createdCount}，更新 ${result.savedCount}，删除 ${result.deletedCount}`,
      data: result,
    }
  }

  private resolveSaveChangesTransaction(options?: DataSetSaveChangesOptions): {
    endpoint: HttpEndpoint
    requestId?: string
  } {
    const endpoint = options?.transaction?.endpoint ?? this.saveChangesConfig?.transaction?.endpoint
    if (!endpoint) {
      throw new Error('DataSet.saveChanges(transaction): transaction endpoint not configured')
    }
    const requestId = options?.transaction?.requestId ?? this.saveChangesConfig?.transaction?.requestId
    return requestId === undefined ? { endpoint } : { endpoint, requestId }
  }

  private collectTransactionOperations(
    view: DataView,
    ids: Array<string | number> | undefined,
    viewResult: DataSetSaveChangesViewResult,
  ): DataSetTransactionOperationPlan[] {
    const idFilter = ids !== undefined ? new Set<string | number>(ids) : undefined
    const includesId = (id: string | number): boolean => idFilter === undefined || idFilter.has(id)
    const plans: DataSetTransactionOperationPlan[] = []
    const rowById = new Map<string | number, DataRow>()
    for (const row of view.rows) {
      const rowId = view.getPkKey(row)
      if (rowId !== undefined) rowById.set(rowId, row)
    }
    const pendingCreateRows = new Map<string | number, DataRow>()
    for (const row of view.dirtyTracking.pendingCreateRows) {
      const rowId = view.getPkKey(row)
      if (rowId !== undefined) pendingCreateRows.set(rowId, row)
    }

    for (const id of view.dirtyTracking.pendingCreateIds) {
      if (!includesId(id)) continue
      const row = pendingCreateRows.get(id) ?? rowById.get(id)
      if (!row) throw new Error(`DataSet.saveChanges(transaction): pending create row not found ${view.tableName}@${view.viewId}:${String(id)}`)
      const operation: DataSetTransactionOperation = {
        operationId: this.buildTransactionOperationId('create', view, id),
        tableName: view.tableName,
        op: 'create',
        data: toUploadRecord(view.stripComputedColumns({ ...row })),
      }
      plans.push({ operation, view, id, kind: 'create' })
      viewResult.createdCount++
    }

    for (const id of view.dirtyTracking.dirtyRowIds) {
      if (!includesId(id)) continue
      const row = rowById.get(id)
      if (!row) throw new Error(`DataSet.saveChanges(transaction): dirty row not found ${view.tableName}@${view.viewId}:${String(id)}`)
      const operation: DataSetTransactionOperation = {
        operationId: this.buildTransactionOperationId('update', view, id),
        tableName: view.tableName,
        op: 'update',
        pk: view.buildServerPk(row),
        data: toUploadRecord(view.stripComputedColumns({ ...row })),
      }
      plans.push({ operation, view, id, kind: 'update' })
      viewResult.savedCount++
    }

    for (const id of view.dirtyTracking.pendingDeleteIds) {
      if (!includesId(id)) continue
      const snapshot = view.dirtyTracking.getPendingDeleteSnapshot(id)
      if (!snapshot && view.primaryKey === '_pk') {
        throw new Error('Cannot submit without the original business primary key fields')
      }
      const operation: DataSetTransactionOperation = {
        operationId: this.buildTransactionOperationId('delete', view, id),
        tableName: view.tableName,
        op: 'delete',
        pk: snapshot ? view.buildServerPk(snapshot) : { [view.primaryKey]: id },
      }
      plans.push({ operation, view, id, kind: 'delete' })
      viewResult.deletedCount++
    }

    return plans
  }

  private buildTransactionOperationId(
    kind: DataSetTransactionOperation['op'],
    view: DataView,
    id: string | number,
  ): string {
    return `${view.tableName}@${view.viewId}:${kind}:${String(id)}`
  }

  private applySuccessfulTransactionOperations(
    plans: DataSetTransactionOperationPlan[],
    response: DataSetTransactionResponse,
  ): void {
    const resultByOperationId = new Map<string, unknown>()
    for (const item of response.results ?? []) {
      if (typeof item.operationId === 'string') resultByOperationId.set(item.operationId, item.result)
    }

    for (const plan of plans) {
      const operationId = plan.operation.operationId
      const rawResult = operationId ? resultByOperationId.get(operationId) : undefined
      const serverRow = asRecord(rawResult)
      if (plan.kind === 'create') {
        plan.view.dirtyTracking.cancelCreate(plan.id)
        if (serverRow) this.syncTransactionCreatedRow(plan.view, plan.id, dataRowFromRecord(serverRow))
        continue
      }
      if (plan.kind === 'update') {
        plan.view.dirtyTracking.clearDirty(plan.id)
        if (serverRow) plan.view.updateRowById(plan.id, dataRowFromRecord(serverRow))
        continue
      }
      plan.view.dirtyTracking.cancelDelete(plan.id)
    }
  }

  private syncTransactionCreatedRow(view: DataView, localId: string | number, serverRow: DataRow): void {
    const serverId = view.getPkKey(serverRow)
    if (serverId !== undefined && serverId !== localId) {
      view.deleteRowById(localId)
      view.appendRow(serverRow)
      return
    }
    view.updateRowById(localId, serverRow)
  }

  private resolveSaveChangesTargets(options?: DataSetSaveChangesOptions): DataSetSaveChangesTarget[] {
    const targets: DataSetSaveChangesTarget[] = []
    const seen = new Set<string>()

    if (options?.views !== undefined) {
      for (const selector of options.views) {
        const viewId = selector.viewId ?? 'default'
        const key = `${selector.tableName}@${viewId}`
        if (seen.has(key)) throw new Error(`DataSet.saveChanges: duplicate view selector "${key}"`)
        const view = this.getView(selector.tableName, viewId)
        if (!view) throw new Error(`DataSet.saveChanges: view not found "${key}"`)
        seen.add(key)
        targets.push({ view, ...(selector.ids !== undefined ? { ids: selector.ids } : {}) })
      }
    } else {
      for (const table of Object.values(this.tables)) {
        table.forEachView(view => {
          targets.push({ view })
        })
      }
    }

    const tableOrder = this.getSaveChangesTableOrder()
    targets.sort((a, b) => {
      const tableDiff = (tableOrder.get(a.view.tableName) ?? Number.MAX_SAFE_INTEGER)
        - (tableOrder.get(b.view.tableName) ?? Number.MAX_SAFE_INTEGER)
      if (tableDiff !== 0) return tableDiff
      if (a.view.viewId === b.view.viewId) return 0
      if (a.view.viewId === 'default') return -1
      if (b.view.viewId === 'default') return 1
      return a.view.viewId.localeCompare(b.view.viewId)
    })
    return targets
  }

  private getSaveChangesTableOrder(): Map<string, number> {
    const tableNames = Object.keys(this.tables)
    const children = new Map<string, Set<string>>()
    const inDegree = new Map<string, number>()
    for (const tableName of tableNames) {
      children.set(tableName, new Set())
      inDegree.set(tableName, 0)
    }

    for (const relation of this.resourceRelations ?? []) {
      if (!children.has(relation.parentTable) || !children.has(relation.childTable)) continue
      if (relation.parentTable === relation.childTable) continue
      const childSet = children.get(relation.parentTable)
      if (!childSet || childSet.has(relation.childTable)) continue
      childSet.add(relation.childTable)
      inDegree.set(relation.childTable, (inDegree.get(relation.childTable) ?? 0) + 1)
    }

    const queue = tableNames.filter(tableName => (inDegree.get(tableName) ?? 0) === 0)
    const ordered: string[] = []
    for (const tableName of queue) {
      ordered.push(tableName)
      for (const childTable of children.get(tableName) ?? []) {
        const nextDegree = (inDegree.get(childTable) ?? 0) - 1
        inDegree.set(childTable, nextDegree)
        if (nextDegree === 0) queue.push(childTable)
      }
    }

    for (const tableName of tableNames) {
      if (!ordered.includes(tableName)) ordered.push(tableName)
    }
    return new Map(ordered.map((tableName, index) => [tableName, index]))
  }

  // ===== 序列化 =====

  /**
   * 序列化为 JSON 友好的元数据对象
   * @returns 数据集元数据
   */
  toJson(): DataSetMetadata {
    const tables: Record<string, TableMetadata> = {}
    for (const [n, t] of Object.entries(this.tables)) {
      tables[n] = t.toJson()
    }
    const result: DataSetMetadata = {
      schemaVersion: this.schemaVersion,
      dataSetName: this.dataSetName,
      tables,
    }
    if (this.scenarioId !== undefined) result.scenarioId = this.scenarioId
    if (this.resourceRelations !== undefined) result.resourceRelations = this.resourceRelations
    if (this.viewCascades !== undefined) result.viewCascades = this.viewCascades
    if (this.version !== undefined) result.version = this.version
    if (this.pageId !== undefined) result.pageId = this.pageId
    if (this.saveChangesConfig !== undefined) result.saveChanges = this.saveChangesConfig
    if (this.layout !== undefined) result.layout = this.layout
    return result
  }

  // ===== 反序列化工厂方法 =====

  /**
   * 从 JSON 对象或 JSON 字符串创建数据集实例。
   *
   * 支持：
   * 1. canonical DataSet 元数据对象
   * 2. pagedata.json 原始对象（任意 key-value）
   * 3. 上述两种结构的 JSON 字符串
   *
   * 明确拒绝历史 `{ dataset: ... }` 包裹结构，避免模型层同时维护两套顶层事实源。
   *
   * @param json 数据集元数据对象、pagedata 原始对象或 JSON 字符串
   * @returns 数据集实例
   */
  static fromJson(json: DataSetMetadata | Record<string, unknown> | string): DataSet {
    if (typeof json === 'string') {
      let parsed: unknown
      try {
        parsed = JSON.parse(json)
      } catch {
        throw new Error('DataSet.fromJson: 无效的 JSON 数据')
      }

      if (!isRecord(parsed)) {
        return DataSet.fromJson({ value: parsed })
      }

      return DataSet.fromJson(parsed)
    }

    const rawJson: Record<string, unknown> = { ...json }

    const wrappedDataSetCandidate = asRecord(rawJson['dataset'])
    if (
      !('tables' in rawJson)
      && wrappedDataSetCandidate
      && ('tables' in wrappedDataSetCandidate || 'dataSetName' in wrappedDataSetCandidate)
    ) {
      throw new Error('DataSet.fromJson: 不再支持 dataset 包裹结构，请传入 canonical DataSetMetadata')
    }

    const directDataSetCandidate = 'tables' in rawJson ? rawJson : null
    const canonicalCandidate = directDataSetCandidate

    // 情形 1：直接根级 DataSet → 规范化后透传
    if (canonicalCandidate) {
      return new DataSet(buildCanonicalDataSetConfig(canonicalCandidate))
    }

    const rawPageData = rawJson

    // 情形 2：将整个 pagedata 的每个 key 归一化为一张表
    const tables: Record<string, Omit<TableMetadata, 'tableName'> & { tableName: string }> = {}

    for (const [key, val] of Object.entries(rawPageData)) {
      // 数组 → 表格行
      if (Array.isArray(val)) {
        const rows: DataRow[] = []
        let columns: DataColumn[] = []

        if (val.length === 0) {
          columns = []
        } else if (isRecord(val[0])) {
          // 对象数组：以第一个元素的键推断列
          const sample = dataRowFromRecord(val[0])
          columns = inferColumnsFromRecord(sample)
          for (const r of val) {
            if (isRecord(r)) rows.push(dataRowFromRecord(r))
          }
        } else {
          // 基础类型数组：单列 value
          columns = [{ name: 'value', type: inferColumnType(val[0]), label: 'value' }]
          for (const r of val) rows.push(dataRowFromValue(r))
        }

        tables[key] = { tableName: key, columns, views: { default: { rows } } }
        continue
      }

      // 对象 → 单行表
      const obj = asRecord(val)
      if (obj !== null) {
        const columns = inferColumnsFromRecord(obj)
        const row = dataRowFromRecord(obj)
        tables[key] = { tableName: key, columns, views: { default: { rows: [row] } } }
        continue
      }

      // 基础类型 → 单列单行表
      tables[key] = {
        tableName: key,
        columns: [{ name: 'value', type: inferColumnType(val), label: 'value' }],
        views: { default: { rows: [dataRowFromValue(val)] } },
      }
    }

    // 构造函数会自动设置单行表的 currentRow
    return new DataSet({ dataSetName: 'PageDataSet', tables })
  }
}
