/**
 * @module @spark-appworks/spark-data:data-table
 * 职责：提供 spark-data 数据管线中的 data table 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */

import { DataView } from './data-view'
import type {
  DataRow,
  DataColumn,
  CrudApi,
  TableMetadata,
  CrudOperationConfig,
  TableResourceType,
  TableBusinessCategory,
  DataPermissionSnapshotInput,
} from './types'
import type { DataSet } from './dataset'
import { DataValidator } from './validation'
import { type CrudService, createCrudService } from './crud-service'
import { parseTableMetadataInput } from './metadata'
import { assertNoSeparator, resolveApi } from './core/utils'

/** DataTable.addColumns 的执行结果摘要。 */
export type DataTableAddColumnsResult = {
  /** 实际追加成功的列名列表。 */
  added: string[]
  /** 因列名已存在而跳过的列名列表。 */
  skipped: string[]
}

/**
 * DataTable - 管理单表的结构定义与配置
 *
 * 说明：管理表结构（columns）、资源语义（resourceType/resourceId/businessCategory）、
 * 视图集合（DataView）、CRUD 配置（api, crudConfig）；
 * 其中 `api` 负责定义“各 CRUD 操作映射到哪个端点”，`crudConfig` 负责定义“调用这些端点时采用什么通用运行策略”。
 * 数据操作由 DataView 负责。
 *
 */
export class DataTable {
  // ===== DataSet 引用 =====

  /** 所属 DataSet（由 DataSet 在构建时通过 setDataSet 设置，独立使用时为 undefined） */
  dataSet: DataSet | undefined

  // ===== 表元数据 =====

  /** 表名 */
  tableName: string

  /** 列定义 */
  columns: DataColumn[]

  /**
  * 资源类型：描述该表背后真实对应的资源形态。
  * 例如数据库表、数据库视图、第三方 API、静态数据、字典表、逻辑视图等。
   *
  * 当前建模约定下，只有 resourceType = 'static-data' 的表才应直接声明 rows；
  * 其他资源类型默认视为远端数据来源。
   */
  resourceType?: TableResourceType

  /**
   * 资源 ID：描述该表在外部资源系统中的稳定标识。
   *
   * 示例：
   * - 数据库表：`crm.customer`
   * - 数据库视图：`vw_order_summary`
   * - 第三方 API：`sap.business-partner`
   * - 字典：`common.order-status`
   */
  resourceId?: string

  /**
   * 业务分类：描述该表在当前业务模型中的角色。
   * 例如主表、从表、引用表、静态数据表。
   *
   * 注意：该字段仅用于语义建模，不代替 tableRelations / viewDependencies。
   */
  businessCategory?: TableBusinessCategory

  /**
    * 远端 CRUD 操作到端点的映射定义。
   *
    * 语义：描述“每个操作对应哪个接口”。
    * 这里存放 list/create/retrieve/update/delete/batch/tree 等操作对应的 URL、HTTP 方法及端点级参数。
   */
  api?: CrudApi

  /**
    * CRUD 通用运行策略配置。
   *
    * 语义：描述“调用端点时应用什么策略”。
    * 这里存放 timeout、retryCount、validateData、权限跳过、请求/响应转换等与端点无关的运行参数。
   */
  crudConfig?: CrudOperationConfig

  // ===== CrudService 缓存 =====

  /** CrudService 实例缓存（懒初始化，模型级共享） */
  private _crudService?: CrudService | undefined

  /**
   * 获取或创建 CrudService（懒初始化，配置变更时自动清除缓存）
   *
   * CrudService 属于模型层（DataTable），多个 DataView 共享同一实例。
   */
  get crudService(): CrudService | undefined {
    if (this._crudService === undefined && this.api !== undefined) {
      // M5: 若 DataSet 提供共享 httpClient，所有表的 CrudService 复用同一 Request 实例
      const sharedClient = this.dataSet?._sharedHttpClient
      const endpointContextProvider = () => this.dataSet?.getRequestTemplateParams() ?? {}
      this._crudService = createCrudService(this.api, sharedClient, endpointContextProvider)
    }
    return this._crudService
  }

  // ===== 数据校验 =====

  /** 数据校验器（基于列定义创建） */
  validator?: DataValidator

  // ===== 视图容器 =====

  /**
  * 内联静态行（来自 pagedata.json 配置）——级联内存过滤的 source of truth。
   *
   * 与 DataView.rows 不同：DataView.rows 是当前视图（可能已过滤）的行；
   * 此字段存储全量原始行，供无 API 的内存级联过滤重复使用。
  * 按当前建模约定，该字段主要仅用于 resourceType = 'static-data' 的表；
  * 其他资源类型应视为远端数据来源，此字段通常保持空数组。
   */
  rows: DataRow[] = []

  /** 视图集合（包含 'default'） */
  views: Record<string, DataView> = {}

  /** 当前表的全部视图实例。 */
  get viewList(): DataView[] {
    return Object.values(this.views)
  }

  // ===== 构造函数 =====

  /**
   * 创建 DataTable 实例，并自动创建 `default` DataView。
   *
   * @param tableName 表名，在所属 DataSet 内必须唯一。
   * @param columns 初始列定义；后续列变更必须通过公开方法维护派生状态。
   */
  constructor(tableName: string, columns: DataColumn[] = []) {
    assertNoSeparator(tableName, 'tableName')
    this.tableName = tableName
    this.columns = columns

    // 保存原始用户列数（dataTable setter 会注入 _pk 计算列变更 columns.length）
    const hasUserColumns = columns.length > 0
    const defaultView = new DataView(tableName, 'default')
    // 提前设置引用，使 view.primaryKey getter 可访问列定义。
    defaultView.dataTable = this
    this.views['default'] = defaultView

    // 初始化数据校验器（仅对用户定义列创建，排除框架计算列）
    if (hasUserColumns) {
      const schemaColumns: DataColumn[] = []
      for (const column of this.columns) {
        if (column.isComputed === true) continue
        schemaColumns.push(column)
      }
      this.validator = new DataValidator({ columns: schemaColumns })
    }
  }

  /**
   * 列结构变更后刷新运行时派生状态。
   *
   * 作用：
   * - 重建 validator，使校验规则与最新列定义一致。
   * - 重新把 dataTable 绑定到所有视图，刷新列缓存、主键列等派生信息。
   */
  private _refreshColumnRuntime(): void {
    const schemaColumns = this.columns.filter((column) => column.isComputed !== true)

    if (schemaColumns.length > 0) {
      this.validator = new DataValidator({ columns: schemaColumns })
    } else {
      delete this.validator
    }

    for (const view of Object.values(this.views)) {
      view.dataTable = this
    }
  }

  // ===== DataSet 关联（设置引用链） =====

  /**
   * 将 DataTable 绑定到 DataSet
   *
   * - 设置 `this.dataSet = ds`
   * - 为已存在的所有视图建立级联订阅
   *
  * 注意：`view.dataTable` 在视图创建时（构造函数 / getOrCreateView / fromJson）
   * 已确保赋值，此处不重复赋值，避免触发冗余的 syncFromConfig()。
   *
   * @param ds 所属 DataSet 实例。
   */
  setDataSet(ds: DataSet): void {
    this.dataSet = ds
    for (const view of Object.values(this.views)) {
      view.cascade.setupCascade()
    }
  }

  /**
   * DataSet 关系规范化完成后调用——通知所有视图重编译含聚合的计算列并重算聚合行。
   *
   * 封装后置重算职责：DataSet 只需调用此方法，不直接触碰 view 内部。
   * 遍历各视图委托给 view.onDataSetRelationsReady()，DataSet 不需要了解视图内部细节。
   */
  onDataSetRelationsReady(): void {
    for (const view of Object.values(this.views)) {
      view.onDataSetRelationsReady()
    }
  }

  // ===== 视图管理 =====

  /**
   * 获取已存在的视图（不会创建新视图）。
   *
   * @param viewId 视图 ID。
   */
  getView(viewId: string): DataView | undefined {
    return this.views[viewId]
  }

  /**
   * 获取或创建视图
   * @param viewId - 视图 ID（'default' 为主视图）
   * @returns 对应的 DataView 实例
   * @behavior 若表已关联 DataSet，会为新视图设置 dataTable 引用并触发 setupCascade
   */
  getOrCreateView(viewId: string): DataView {
    if (!this.views[viewId]) {
      const view = new DataView(this.tableName, viewId)
      // 始终设置 dataTable 引用（使 view.primaryKey getter 可访问列定义）
      view.dataTable = this
      // 视图管理职责：设置级联
      view.cascade.setupCascade()
      // Phase 6 M2: 动态视图自动订阅——通知 DataSet 将活跃的 on/onAnyViewChange 绑定到新视图
      this.dataSet?._subscribeNewView(view)
      this.views[viewId] = view
    }
    return this.views[viewId]
  }

  /**
   * 遍历所有视图（包含 default 和命名视图）——DataSet 的内部实现可选择此入口，
   * 避免直接访问 `views` 属性（封装内部集合）。
   *
   * @param cb 每个视图都会调用一次的回调函数。
   */
  forEachView(cb: (view: DataView) => void): void {
    for (const view of Object.values(this.views)) {
      cb(view)
    }
  }

  // ===== 配置管理 =====

  /**
    * 设置 CRUD 端点映射配置（支持字符串简写和 `true` 约定模式）
   * @param api - CRUD 端点配置（完整对象 / 字符串基础路径 / `true` 约定）
   * @remarks 配置变更时自动清除 CrudService 缓存，下次访问时重建
   */
  setApi(api: CrudApi | string | boolean): void {
    const resolved = resolveApi(api, this.tableName)
    if (resolved !== undefined) this.api = resolved
    else delete this.api
    this._crudService = undefined
  }

  /**
   * 设置 CRUD 通用运行策略（权限、超时、重试、转换等）
   * @param config - CRUD 通用运行策略配置
   */
  setCrudConfig(config: CrudOperationConfig): void {
    this.crudConfig = config
  }

  // ===== 序列化 / 反序列化 =====

  /**
   * 将 DataTable 序列化为 canonical TableMetadata（表核 + views 壳）。
   */
  toJson(): TableMetadata {
    const defaultView = this.views['default']
    if (defaultView === undefined) {
      throw new Error(`Table "${this.tableName}" is missing required default view`)
    }
    const viewsData: TableMetadata['views'] = { default: defaultView.toJson() }
    for (const [id, view] of Object.entries(this.views)) {
      if (id === 'default') continue
      viewsData[id] = view.toJson()
    }

    return {
      tableName: this.tableName,
      columns: this.columns.filter(c => !c.isComputed),
      views: viewsData,
      ...(this.resourceType !== undefined ? { resourceType: this.resourceType } : {}),
      ...(this.resourceId !== undefined ? { resourceId: this.resourceId } : {}),
      ...(this.businessCategory !== undefined ? { businessCategory: this.businessCategory } : {}),
      ...(this.api !== undefined ? { api: this.api } : {}),
      ...(this.crudConfig !== undefined ? { crudConfig: this.crudConfig } : {}),
    }
  }

  // ===== 结构变更 =====

  /**
   * 向表追加列（同名列跳过不覆盖）。
   *
   * @param columns 待追加的列定义列表。
   * @returns `{ added, skipped }` — 分别列出实际追加和因同名跳过的列名
   */
  addColumns(columns: DataColumn[]): DataTableAddColumnsResult {
    const existingNames = new Set(this.columns.map((c) => c.name))
    const added: string[] = []
    const skipped: string[] = []

    for (const col of columns) {
      if (existingNames.has(col.name)) {
        skipped.push(col.name)
      } else {
        this.columns.push(col)
        existingNames.add(col.name)
        added.push(col.name)
      }
    }

    if (added.length > 0) {
      this._refreshColumnRuntime()
    }

    return { added, skipped }
  }

  /**
   * 修改单列属性（不允许改 name）。
   *
   * @param columnName 要更新的列名。
   * @param updates 要合并到列定义上的字段更新；name 会被忽略。
   * @returns 被变更的字段名列表
   * @throws 列不存在时抛 Error
   */
  updateColumn(columnName: string, updates: Partial<DataColumn>): string[] {
    const col = this.columns.find((c) => c.name === columnName)
    if (!col) {
      throw new Error(`Column "${columnName}" not found in table "${this.tableName}"`)
    }

    const { name: _name, ...safeUpdates } = updates
    Object.assign(col, safeUpdates)
    this._refreshColumnRuntime()
    return Object.keys(safeUpdates)
  }

  /**
   * 删除列。
   *
   * @param columnName 要删除的列名。
   * @throws 列不存在时抛 Error
   */
  removeColumn(columnName: string): void {
    const idx = this.columns.findIndex((c) => c.name === columnName)
    if (idx < 0) {
      throw new Error(`Column "${columnName}" not found in table "${this.tableName}"`)
    }
    this.columns.splice(idx, 1)
    this._refreshColumnRuntime()
  }

  /**
   * 写入内联静态行到 DataTable.rows 并同步到 default 视图。
   *
   * 追加模式：新行 append 到 table.rows 尾部，default 视图用完整 rows 替换。
   *
   * @param rows 要追加的行数据列表。
   * @returns 追加后的总行数
   */
  addRows(rows: DataRow[]): number {
    const nextRows = [...this.rows, ...rows]
    this.rows = nextRows

    const defaultView = this.getView('default')
    if (defaultView) {
      defaultView.replaceRows([...nextRows])
    }

    return nextRows.length
  }

  /** 将同一次后端查询的行、权限和原始基线登记到指定视图。 */
  ingestPermissionSnapshot(input: DataPermissionSnapshotInput, viewId = 'default'): void {
    const view = this.getOrCreateView(viewId)
    view.ingestPermissionSnapshot(input)
  }

  /**
   * 创建命名视图。
   *
   * @param viewId - 视图 ID
   * @returns 新创建的 DataView
   * @throws 当视图已存在时抛 Error
   */
  addView(viewId: string): DataView {
    if (this.getView(viewId)) {
      throw new Error(`View "${viewId}" already exists in table "${this.tableName}"`)
    }

    return this.getOrCreateView(viewId)
  }

  // ===== 销毁与内存管理 =====

  /**
   * 销毁指定视图
   * @param viewId - 视图ID
   * @remarks 调用视图的 destroy() 方法并从视图集合中移除
   */
  destroyView(viewId: string): void {
    const view = this.views[viewId]
    if (view) {
      view.destroy()
      const { [viewId]: _, ...rest } = this.views
      this.views = rest
    }
  }

  /**
   * 销毁所有视图（包括 default 视图）
   * @remarks 应在 DataTable 不再使用时调用，防止内存泄漏
   */
  destroy(): void {
    for (const view of Object.values(this.views)) {
      view.destroy()
    }
    this.views = {}
    this._crudService = undefined
  }

  // ===== 工厂方法 =====

  /**
   * 从表元数据恢复 DataTable。
   */
  static fromJson(data: TableMetadata | Record<string, unknown> | string): DataTable {
    const normalized = parseTableMetadataInput(data)
    const t = new DataTable(normalized.tableName, normalized.columns)
    // P2: API 简写展开（字符串 / true → CrudApi 对象）
    if (normalized.api !== undefined) {
      const resolved = resolveApi(normalized.api, normalized.tableName)
      if (resolved !== undefined) t.api = resolved
    }
    if (normalized.resourceType !== undefined) t.resourceType = normalized.resourceType
    if (normalized.resourceId !== undefined) t.resourceId = normalized.resourceId
    if (normalized.businessCategory !== undefined) t.businessCategory = normalized.businessCategory
    if (normalized.crudConfig !== undefined) t.crudConfig = normalized.crudConfig

    const def = t.getOrCreateView('default')
    const defaultViewCfg = normalized.views['default']
    const sourceRows = defaultViewCfg.rows
    if (sourceRows) {
      // 存入 DataTable.rows（内联静态数据 source of truth，供无 API 内存级联过滤使用）
      t.rows = [...sourceRows]
      // 同时初始化 default 视图的初始数据（渲染层可直接展示，无需 loadFromServer）
      def.rows = [...sourceRows]
    }

    def.applyViewConfig(defaultViewCfg)

    // 注意：不在此处调用 initAutoSelection()。
    // autoCurrentFirst / autoSelectFirst 的初始选中事件必须在消费者（如页面脚本）
    // 完成订阅后再发射，由渲染层在渲染器 mounted 后调用 DataSet.initAutoSelection() 统一触发。

    // 处理命名视图（非 default）
    for (const [cid, cd] of Object.entries(normalized.views)) {
      if (cid === 'default') continue
      const namedView = DataView.fromJson(cd, t.tableName, cid)
      namedView.dataTable = t   // 确保 primaryKey getter 可访问列定义
      t.views[cid] = namedView
    }
    return t
  }
}
