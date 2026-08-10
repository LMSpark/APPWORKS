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
  DataRow, ViewMetadata, FilterExpression, FilterOperator, FilterValueExpression, SortExpression,
  QueryParams, DataColumn, DataRelation,
  CrudResult, CrudOperationConfig,
  DataSource,
  AggregateResultRow,
  FlatTreeNode, TreePath, NestedTreeSearchResult, NestedTreeNode,
  TreeConfig, AggregateColumnConfig, CrudApi,
  CommitMode, RetrieveRecordOptions,
  SparkEventEmitter,
  DataViewEditingFieldChangeEvent, DataViewApplyEditingRowsResult,
  DataPermissionSnapshot, DataPermissionSnapshotInput,
} from './types'

/** 过滤值字段引用形状（与 types.ts 中 FilterValueExpression 的内联形状一致） */
type FilterFieldRefShape = {
  kind: 'field'
  field: string}
import { RequestState } from './types'
import { TreeManager } from './tree-manager'
import type { DataTable } from './data-table'
import type { DataSet } from './dataset'
import type { CrudService } from './crud-service'
import type { DataValidator } from './validation'
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

/** rowsChanged 事件按微任务合并，保证同一同步批次只通知一次，同时让 Vue nextTick 可观测。 */
const REQUEST_SUPERSEDED_MESSAGE = 'Request superseded'

const LEGACY_FILTER_PLACEHOLDER_TOKEN_RE = /\\?\$\[/
const LEGACY_PARENT_FILTER_PLACEHOLDER_TOKEN_RE = /\\?\$parent\[/

function dataRowFromRecord(record: Record<string, unknown>): DataRow {
  return { ...record }
}

function dataRowFromPartial(record: Partial<DataRow>): DataRow {
  return { ...record }
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

function isFilterFieldRef(value: unknown): value is FilterFieldRefShape {
  return isRecord(value)
    && value['kind'] === 'field'
    && typeof value['field'] === 'string'
}

function resolveFilterFieldRef(fieldName: string, row: DataRow): unknown {
  if (!(fieldName in row)) {
    throw new Error(`过滤值表达式引用了不存在的字段 "${fieldName}"`)
  }
  return row[fieldName]
}

function assertNoLegacyFilterPlaceholderString(value: string): void {
  if (LEGACY_PARENT_FILTER_PLACEHOLDER_TOKEN_RE.test(value)) {
    throw new Error('过滤值中的 "$parent[...]" 协议已移除，请改用 DataRelation.parentField / childField')
  }
  if (LEGACY_FILTER_PLACEHOLDER_TOKEN_RE.test(value)) {
    throw new Error('过滤值占位字符串协议已移除，请改用结构化字段引用 { kind: "field", field: "..." }')
  }
}

function compareFilterScalar(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left ?? '').localeCompare(String(right ?? ''))
}

function includesFilterValue(container: unknown, needle: unknown): boolean {
  if (Array.isArray(container)) return container.includes(needle)
  return String(container ?? '').includes(String(needle ?? ''))
}

function startsWithFilterValue(container: unknown, needle: unknown): boolean {
  return String(container ?? '').startsWith(String(needle ?? ''))
}

function endsWithFilterValue(container: unknown, needle: unknown): boolean {
  return String(container ?? '').endsWith(String(needle ?? ''))
}

function getArrayFilterValue(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null
}

// ─────────────────────────────────────────────
// DataView 类
// ─────────────────────────────────────────────

/**
 * DataView - 单个表视图的数据操作子模块。
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
    this._columnMap = new Map(table.columns.map(c => [c.name, c]))
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

    /** 行数据集合。 */
rows: DataRow[] = []

  /** 与当前 rows 同一次查询登记的后端最终权限事实。 */
  permissionSnapshot: DataPermissionSnapshot | null = null

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

    /** filter Expression 字段。 */
filterExpression?: FilterExpression
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
    return table.resourceType === 'static-data' || (table.api?.list === undefined && this.rows.length > 0)
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

  private _validateFilterValueExpression(
    value: FilterValueExpression,
    availableFields?: ReadonlySet<string>,
  ): void {
    if (typeof value === 'string') {
      assertNoLegacyFilterPlaceholderString(value)
      return
    }

    if (Array.isArray(value)) {
      value.forEach(item => this._validateFilterValueExpression(item, availableFields))
      return
    }

    if (isFilterFieldRef(value)) {
      const fieldName = value.field.trim()
      if (fieldName === '') {
        throw new Error(`过滤字段引用不能为空 [${this.tableName}@${this.viewId}]`)
      }
      if (availableFields !== undefined && availableFields.size > 0 && !availableFields.has(fieldName)) {
        throw new Error(`过滤值表达式引用了不存在的字段 "${fieldName}"`)
      }
      if (availableFields === undefined) {
        this._assertKnownFilterFieldExists(fieldName)
      }
      return
    }

    if (value === null || typeof value === 'number' || typeof value === 'boolean') return

    throw new Error(`非法过滤值表达式 [${this.tableName}@${this.viewId}]`)
  }

  private _validateFilterExpressionNode(
    expr: FilterExpression,
    availableFields?: ReadonlySet<string>,
  ): void {
    if ('type' in expr) {
      switch (expr.type) {
        case 'and':
        case 'or':
        case '!and':
        case '!or':
          expr.children.forEach(child => this._validateFilterExpressionNode(child, availableFields))
          return
        case '!condition':
          if (expr.field.trim() === '') {
            throw new Error(`过滤条件字段不能为空 [${this.tableName}@${this.viewId}]`)
          }
          this._validateFilterValueExpression(expr.value, availableFields)
          return
        default:
          throw new Error(`非法过滤表达式类型 [${this.tableName}@${this.viewId}]`)
      }
    }

    if (expr.field.trim() === '') {
      throw new Error(`过滤条件字段不能为空 [${this.tableName}@${this.viewId}]`)
    }
    if (availableFields !== undefined && availableFields.size > 0 && !availableFields.has(expr.field)) {
      throw new Error(`过滤条件字段不存在 "${expr.field}" [${this.tableName}@${this.viewId}]`)
    }
    if (availableFields === undefined) {
      this._assertKnownFilterFieldExists(expr.field)
    }
    this._validateFilterValueExpression(expr.value, availableFields)
  }

  private _validateFilterExpression(expr: FilterExpression): void {
    const availableFields = this._shouldApplyStaticLocalFilter()
      ? this._getAvailableLocalFilterFields()
      : undefined

    this._validateFilterExpressionNode(expr, availableFields)
  }

  private _isSameFilterExpression(
    left: FilterExpression | undefined,
    right: FilterExpression | undefined,
  ): boolean {
    if (left === right) return true
    if (!left || !right) return false
    return JSON.stringify(left) === JSON.stringify(right)
  }

  private _createRequestSupersededResult<T = unknown>(): CrudResult<T> {
    return { success: false, message: REQUEST_SUPERSEDED_MESSAGE }
  }

  private _mergeRemoteFilters(
    relationFilter: FilterExpression | undefined,
    userFilter: FilterExpression | undefined,
  ): FilterExpression | undefined {
    if (!relationFilter) return userFilter
    if (!userFilter) return relationFilter
    return {
      type: 'and',
      children: [relationFilter, userFilter],
    }
  }

  private _resolveFilterValueExpression(value: FilterValueExpression, row: DataRow): unknown {
    if (typeof value === 'string') {
      assertNoLegacyFilterPlaceholderString(value)
      return value
    }
    if (Array.isArray(value)) return value.map(item => this._resolveFilterValueExpression(item, row))
    if (isFilterFieldRef(value)) return resolveFilterFieldRef(value.field, row)
    return value
  }

  private _matchesFilterCondition(
    row: DataRow,
    expr: Extract<FilterExpression, { field: string; op: FilterOperator }>,
  ): boolean {
    const rowValue = row[expr.field]
    const resolvedValue = this._resolveFilterValueExpression(expr.value, row)
    const arrayValue = getArrayFilterValue(resolvedValue)

    switch (expr.op) {
      case '==': return rowValue === resolvedValue
      case '!=': return rowValue !== resolvedValue
      case '>': return compareFilterScalar(rowValue, resolvedValue) > 0
      case '>=': return compareFilterScalar(rowValue, resolvedValue) >= 0
      case '<': return compareFilterScalar(rowValue, resolvedValue) < 0
      case '<=': return compareFilterScalar(rowValue, resolvedValue) <= 0
      case 'in':
        return arrayValue !== null
          ? (Array.isArray(rowValue)
            ? rowValue.some(item => arrayValue.includes(item))
            : arrayValue.includes(rowValue))
          : false
      case 'not in':
        return arrayValue !== null
          ? (Array.isArray(rowValue)
            ? rowValue.every(item => !arrayValue.includes(item))
            : !arrayValue.includes(rowValue))
          : true
      case 'like':
      case 'contains':
        return includesFilterValue(rowValue, resolvedValue)
      case 'not like':
        return !includesFilterValue(rowValue, resolvedValue)
      case 'startsWith':
        return startsWithFilterValue(rowValue, resolvedValue)
      case 'endsWith':
        return endsWithFilterValue(rowValue, resolvedValue)
      case 'is null':
        return rowValue === null || rowValue === undefined || rowValue === ''
      case 'is not null':
        return rowValue !== null && rowValue !== undefined && rowValue !== ''
      case 'between':
        return arrayValue !== null
          && arrayValue.length >= 2
          && compareFilterScalar(rowValue, arrayValue[0]) >= 0
          && compareFilterScalar(rowValue, arrayValue[1]) <= 0
      case 'not between':
        return arrayValue !== null
          && arrayValue.length >= 2
          && (compareFilterScalar(rowValue, arrayValue[0]) < 0 || compareFilterScalar(rowValue, arrayValue[1]) > 0)
      default:
        throw new Error(`未知过滤操作符 "${String(expr.op)}" [${this.tableName}@${this.viewId}]`)
    }
  }

  private _matchesFilterExpression(row: DataRow, expr: FilterExpression): boolean {
    if ('type' in expr) {
      switch (expr.type) {
        case '!condition':
          return !this._matchesFilterCondition(row, expr)
        case 'and':
          return expr.children.every(child => this._matchesFilterExpression(row, child))
        case 'or':
          return expr.children.some(child => this._matchesFilterExpression(row, child))
        case '!and':
          return !expr.children.every(child => this._matchesFilterExpression(row, child))
        case '!or':
          return !expr.children.some(child => this._matchesFilterExpression(row, child))
        default:
          throw new Error(`未知过滤表达式节点 [${this.tableName}@${this.viewId}]`)
      }
    }

    return this._matchesFilterCondition(row, expr)
  }

  private _syncStaticLocalFilterRows(): void {
    if (!this._shouldApplyStaticLocalFilter()) return

    const sourceRows = this._getStaticLocalFilterSourceRows()
    const filterExpression = this.filterExpression
    const nextRows = filterExpression === undefined
      ? sourceRows
      : sourceRows.filter(row => this._matchesFilterExpression(row, filterExpression))

    this.localMutationDelegate.replaceRows(nextRows)
    this.syncTreeManagerFromRows()
    this.total = nextRows.length
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
    if (this.commitMode === 'staged') return false
    const api = this.getCrudApiConfig()
    if (!api) return false
    return api[operation] !== undefined
  }

  /** @internal DataSet 关系规范化完成后由 DataTable 调用——重挂级联订阅并重编译计算列（含聚合 resolver） */
  onDataSetRelationsReady(): void {
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
    return this._dataTable?.columns ?? []
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
      const parents = ds ? ds.getParentRelations(this.tableName, this.viewId) : []

      const relationFilters: FilterExpression[] = []
      for (const rel of parents) {
        this.requestIdleDependencyViewSources(rel)
        const relationFilter = ds?.resolveDependencyFilter(rel)
        if (relationFilter === null) {
          this.setRequestState(RequestState.Failed)
          return
        }
        if (relationFilter !== undefined) relationFilters.push(relationFilter)
      }

      const params: QueryParams = {}
      const relationFilter = relationFilters.length === 0
        ? undefined
        : relationFilters.length === 1
          ? relationFilters[0]
          : { type: 'and', children: relationFilters } satisfies FilterExpression
      const mergedFilter = this._mergeRemoteFilters(relationFilter, this.filterExpression)
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

  private requestIdleDependencyViewSources(rel: DataRelation): void {
    const ds = this.dataSet
    if (!ds) return
    const parentView = ds.getView(rel.parentTable, rel.parentViewId ?? 'default')
    if (parentView?.requestState === RequestState.Idle) {
      void parentView.requestData()
    }
  }

  /**
   * 从服务器拉取列表（带防重入 + 请求 ID 竞态保护）。
   *
   * @param params 查询参数；省略时由当前视图配置生成。
   */
  async loadFromServer(params?: QueryParams): Promise<CrudResult> {
    this.checkDestroyed()
    if (this.requestState === RequestState.Loading) return { success: false, message: 'Already loading' }

    this.loadingError = null
    this.setRequestState(RequestState.Loading)

    const requestId = ++this.currentLoadRequestId

    try {
      const loadParams = this.buildTreeModeParams(params)
      const result = await this.crudDelegate.list(loadParams)

      if (requestId !== this.currentLoadRequestId) {
        this.logger.debug(`loadFromServer 请求 ${requestId} 被更新的请求 ${this.currentLoadRequestId} 替代，忽略响应`)
        return this._createRequestSupersededResult()
      }

      if (result.success && result.data !== undefined) {
        this.updateFromServer(normalizeServerRowsData(result.data, `DataView.loadFromServer ${this.tableName}@${this.viewId}`))
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

    /** 加载 Tree Nested。 */
async loadTreeNested(rootId?: string | number | null, limit?: number, depthLimit?: number): Promise<CrudResult<NestedTreeNode[]>> {
    this.checkDestroyed()
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

  /** 强制刷新：先置 Idle 再 requestData()；远程表重拉，静态/无 API 表走本地同步。清除 staged 模式的脏追踪状态。 */
  async refresh(): Promise<void> {
    this._dirtyTrackingDelegate?.clearAll()
    this.setRequestState(RequestState.Idle)
    return this.requestData()
  }

  /**
   * 无 API 时的内存级联过滤（从 DataTable.rows 按依赖过滤条件写入视图）。
   *
   * @param rel 父子视图依赖关系。
   * @param parentRows 父视图当前参与级联的行列表。
   */
  applyInMemoryCascade(rel: DataRelation, parentRows: readonly DataRow[]): void {
    // 从 DataTable.rows 读取全量静态源数据（可在多次父行切换中反复过滤）
    const srcRows: DataRow[] = this._dataTable?.rows ?? []
    const relationFilter = this.dataSet?.resolveDependencyFilter(rel)
    let filteredRows = srcRows.slice()

    if (relationFilter === null) {
      filteredRows = []
    } else if (relationFilter !== undefined) {
      filteredRows = srcRows.filter((row: DataRow) => this._matchesFilterExpression(row, relationFilter))
    } else if (parentRows.length > 0 && typeof rel.childField === 'string') {
      const pField = typeof rel.parentField === 'string' ? rel.parentField : 'id'
      const childField = rel.childField
      const parentValues = new Set<unknown>(parentRows.map((r: DataRow) => r[pField]))
      filteredRows = srcRows.filter((r: DataRow) => parentValues.has(r[childField]))
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
    this.localMutationDelegate.updateFromServer(data)
    this.syncTreeManagerFromRows()
    this.emitRowsChanged()
  }

  /**
   * 本地追加一行，触发计算列求值 + 聚合重算 + rowsChanged。
   *
   * @param row 要追加的行。
   */
  appendRow(row: DataRow): void {
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
    const deleted = this.localMutationDelegate.deleteRowById(id)
    if (deleted) {
      this.syncTreeManagerFromRows()
    }
    return deleted
  }

  /**
   * 本地整批替换所有行，清理无效选中引用，清除 staged 模式的脏追踪状态。
   *
   * @param rows 新的完整行列表。
   */
  replaceRows(rows: DataRow[]): void {
    this._dirtyTrackingDelegate?.clearAll()
    this.clearEditingState()
    this.localMutationDelegate.replaceRows(rows)
    this.syncTreeManagerFromRows()
  }

  /**
   * 原子登记一次后端运行查询：数据、原始行、总数、五集合权限和系统键共享同一基线。
   */
  ingestPermissionSnapshot(input: DataPermissionSnapshotInput): void {
    const rows = input.rows.map((row, index) => {
      if (row.lingma_sys_params === undefined) {
        throw new Error(`权限快照 rows[${index}] 缺少 lingma_sys_params`)
      }
      return { ...row, lingma_sys_params: { ...row.lingma_sys_params } }
    })
    const nextSnapshot: DataPermissionSnapshot = {
      formKey: input.formKey,
      dataSpaceId: input.dataSpaceId,
      modelId: input.modelId,
      allowAdd: input.allowAdd,
      systemKey: input.systemKey,
      originalRows: input.originalRows.map((row) => ({ ...row })),
      authorizedFeatureTags: [...input.authorizedFeatureTags],
    }
    const previousRows = this.rows
    const previousTotal = this.total
    const previousSnapshot = this.permissionSnapshot
    try {
      this.replaceRows(rows)
      this.total = input.total
      this.permissionSnapshot = nextSnapshot
    } catch (error) {
      this.rows = previousRows
      this.total = previousTotal
      this.permissionSnapshot = previousSnapshot
      throw error
    }
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
    this.checkDestroyed()
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

  /**
   * 将编辑态 patch 应用到现有 editRowById 管线。
   *
   * @param ids 可选行主键值列表；省略时应用全部编辑态变更。
   */
  async applyEditingRows(ids?: Array<string | number>): Promise<CrudResult<DataViewApplyEditingRowsResult>> {
    this.checkDestroyed()
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
    this.checkDestroyed()
    const row = this._primaryKeyDelegate.ensurePrimaryKey(data)
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
    this.checkDestroyed()
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
    this.checkDestroyed()
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
   * 将待提交变更（新增→更新→删除）逐条保存到服务端。单行失败不中断后续行。
   *
   * @param ids 可选行主键值列表；省略时保存全部脏行。
   */
  async saveChanges(ids?: Array<string | number>): Promise<CrudResult<SaveChangesData>> {
    this.checkDestroyed()
    return this.dirtyTrackingDelegate.executeChanges(this, this.crudDelegate, ids)
  }


  // ─────────────────────────────────────────────
  // 状态重置
  // ─────────────────────────────────────────────

  /** 清空所有状态并发射 cleared 事件（通知 UI 和子视图） */
  clearAll(): void {
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
   * 同时清除脏追踪状态（staged 模式下的未提交变更）。
   * 通过领域事件通知订阅者刷新 rows / selection / request / aggregate / editing。
   */
  resetState(): void {
    this.resetStateInternal({ emitEvents: true })
  }

  private resetStateInternal(options: { emitEvents: boolean }): void {
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
moveTreeNode(nodeId: string | number, newParentId: string | number | null, index?: number): Promise<DataRow | null> {
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
    return config
  }

  /**
   * 设置当前页；远端视图自动重新查询。
   *
   * @param page 新页码。
   */
  async setPage(page: number): Promise<void> {
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
  async setFilter(filter: FilterExpression | undefined): Promise<void> {
    if (this._isSameFilterExpression(this.filterExpression, filter)) return

    if (filter === undefined) {
      delete this.filterExpression
    } else {
      this._validateFilterExpression(filter)
      this.filterExpression = filter
    }
    this.page = 1
    this.emitConfigChanged()
    if (this._shouldApplyStaticLocalFilter()) {
      this._syncStaticLocalFilterRows()
      return
    }
    await this.refresh()
  }

  /**
   * 显式执行过滤：即使表达式未变化也会处理数据（用于“查询”按钮语义）。
   *
   * @param filter 要执行的过滤表达式；undefined 表示清除过滤。
   */
  async executeFilter(filter: FilterExpression | undefined): Promise<void> {
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
    this.resetState()

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
    if (vc.filterExpression !== undefined) {
      this._validateFilterExpression(vc.filterExpression)
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
    if (vc.aggregates !== undefined) {
      for (const key of Object.keys(this.aggregates)) {
        Reflect.deleteProperty(this.aggregates, key)
      }
      Object.assign(this.aggregates, vc.aggregates)
    }
    this.page = vc.page ?? 1
    this.pageSize = vc.pageSize ?? 20
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
    const serializedRows = this.rows.map((row) => dataRowFromPartial(this.stripComputedColumns(row)))

    const result: ViewMetadata = {
      tableName: this.tableName,
      viewId: this.viewId,
      page: this.page,
      pageSize: this.pageSize,
      rows: serializedRows,
    }
    if (this.filterExpression !== undefined) result.filterExpression = this.filterExpression
    if (this.sortExpression !== undefined) result.sortExpression = this.sortExpression
    // 只在非默认值时序列化（减少 JSON 体积）
    if (this.autoCurrentFirst) result.autoCurrentFirst = this.autoCurrentFirst
    if (this.autoSelectFirst) result.autoSelectFirst = this.autoSelectFirst
    if (this.treeConfig !== undefined) result.treeConfig = this.treeConfig
    if (this.autoLoad !== false) result.autoLoad = this.autoLoad
    if (this.commitMode !== 'immediate') result.commitMode = this.commitMode
    if (this.valueField !== undefined) result.valueField = this.valueField
    if (this.labelField !== undefined) result.labelField = this.labelField
    if (this.selectionDelimiter !== ',') result.selectionDelimiter = this.selectionDelimiter
    if (Object.keys(this.aggregates).length > 0) result.aggregates = this.aggregates
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
