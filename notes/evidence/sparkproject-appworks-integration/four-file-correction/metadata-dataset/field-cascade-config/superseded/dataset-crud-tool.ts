/**
 * @module @spark-appworks/spark-data:dataset-crud-tool
 * 职责：提供数据层 dataset-crud-tool 能力，围绕 DataSetCrudToolCreateTableOptions、DataSetCrudToolColumnUpdate、DataSetCrudToolUpdateTableOptions 等 33 个公开契约 描述 DataSet、DataTable、DataView、策略委托或数据绑定键。
 * 边界：保持框架无关，只处理数据模型、校验和本地策略，不依赖 Vue、路由或 Element Plus。
 * AI用途：生成页面数据绑定、DataViewKey 或数据策略调用时，用本模块确认 dataset-crud-tool 的数据语义。
 */
import { DataSet } from './dataset'
import { SnapshotHistory, deepClone, isRecord } from '@spark-appworks/spark-utils'
import { isDataRow } from './core/data-row-guards'
import { ResourceRelationDefinition } from './resource-relation/resource-relation-definition'
import { DataViewFieldCascadeDefinition } from './strategies/cascade/field-cascade-definition'
import type { DataTable } from './data-table'
import type { DataView } from './data-view'
import type {
  AggregateColumnConfig,
  BatchResult,
  CrudApi,
  CrudOperationConfig,
  CrudResult,
  DataColumn,
  DataSetMetadata,
  DataRow,
  TableMetadata,
  ViewMetadata,
  DataResourceRelation,
  DataResourceRelationInput,
  DataViewCascade,
  DataViewCascadeSelector,
  TableSemanticMetadata,
  TableResourceType,
  TableBusinessCategory,
} from './types'

function isCrudResult(value: unknown): value is CrudResult {
  return isRecord(value) && typeof value['success'] === 'boolean'
}

/**
 * 创建数据表时的输入参数。
 */
type DataSetCrudToolCreateTableOptions = TableSemanticMetadata & {
  /**
     * 表名。
     * 在同一个 DataSet 内必须唯一，后续所有表级 CRUD 都以它为入口。
     */
    tableName: string
    /**
     * 初始列定义。
     */
    columns: DataColumn[]
    /**
     * 可选的 CRUD API 配置。
     * 传入后，表及其视图可直接走远端 CRUD 能力。
     */
    api?: CrudApi | string | boolean
    /**
     * 可选的 CRUD 运行配置。
     */
    crudConfig?: CrudOperationConfig
    /**
     * 需要一起创建或初始化的视图配置。
     * 其中 default 视图不会新建，只会复用建表时自动创建的实例并应用配置。
     */
    views?: Record<string, ViewMetadata>}

/**
 * 字段更新项。
 */
type DataSetCrudToolColumnUpdate = {
  /** 要更新的列名。 */
  columnName: string
  /** 要合并到列定义上的字段更新；不应包含 name 重命名。 */
  updates: Partial<DataColumn>
}

/**
 * 更新数据表时的输入参数。
 */
type DataSetCrudToolUpdateTableOptions = {
  /**
   * 需要新增的列。
   * 内部统一走 DataTable.addColumns，保证 validator 与 DataView 列缓存同步刷新。
   */
  columnsToAdd?: DataColumn[]
  /**
   * 需要更新的列定义。
   */
  columnUpdates?: DataSetCrudToolColumnUpdate[]
  /**
   * 需要删除的列名列表。
   */
  columnsToRemove?: string[]
  /**
   * 新的 CRUD API 配置。
   */
  api?: CrudApi | string | boolean
  /**
   * 新的 CRUD 运行配置。
   * 传入 null 表示显式移除已有 crudConfig。
   */
  crudConfig?: CrudOperationConfig | null
  /**
   * 新的资源类型。
   * 传入 null 表示显式清空已有 resourceType。
   */
  resourceType?: TableResourceType | null
  /**
   * 新的资源 ID。
   * 传入 null 表示显式清空已有 resourceId。
   */
  resourceId?: string | null
  /**
   * 新的业务分类。
   * 传入 null 表示显式清空已有 businessCategory。
   */
  businessCategory?: TableBusinessCategory | null
  /**
   * default 视图需要替换的整批行数据。
   */
  defaultRows?: DataRow[]}

/**
 * 关系选择器。
 *
 * 默认可用 parentTable + childTable 定位；当同一父子表之间存在多条关系时，
 * 需要继续提供 parentField / childField 做字段级消歧。
 */
type ResourceRelationSelector = {
  /** 父表表名。 */
  parentTable: string
  /** 子表表名。 */
  childTable: string
  /** 稳定关系 ID；存在多条同端点关系时用于精确定位。 */
  relationId?: string
  /** 父表关联字段；同一父子表存在多条关系时用于消歧。 */
  parentField?: string
  /** 子表关联字段；同一父子表存在多条关系时用于消歧。 */
  childField?: string}

/** 表名参数对象。 */
type DataSetCrudToolTableNameParams = {
  /** 表名。 */
  tableName: string
}

/** 外部快照替换选项。 */
type DataSetCrudToolReplaceFromJsonOptions = {
  /** 是否将替换结果写入历史栈，默认 true。 */
  commitHistory?: boolean
}

/** 表字段定位参数。 */
type DataSetCrudToolColumnSelectorParams = DataSetCrudToolTableNameParams & {
  /** 列名。 */
  columnName: string
}

/** 新增字段参数。 */
type DataSetCrudToolCreateColumnParams = DataSetCrudToolTableNameParams & {
  /** 新列定义。 */
  column: DataColumn
}

/** 更新字段参数。 */
type DataSetCrudToolUpdateColumnParams = DataSetCrudToolColumnSelectorParams & {
  /** 要合并到现有列定义上的更新内容。 */
  updates: Partial<DataColumn>
}

/** 重命名字段参数。 */
type DataSetCrudToolRenameColumnParams = DataSetCrudToolColumnSelectorParams & {
  /** 新列名。 */
  newColumnName: string
}

/** 更新表参数。 */
type DataSetCrudToolUpdateTableParams = DataSetCrudToolTableNameParams & DataSetCrudToolUpdateTableOptions

/** 重命名表参数。 */
type DataSetCrudToolRenameTableParams = DataSetCrudToolTableNameParams & {
  /** 新表名。 */
  newTableName: string
}

/** 视图定位参数。 */
type DataSetCrudToolViewSelectorParams = DataSetCrudToolTableNameParams & {
  /** 视图 ID；省略时使用 default 视图。 */
  viewId?: string
}

/** 创建视图参数。 */
type DataSetCrudToolCreateViewParams = DataSetCrudToolTableNameParams & {
  /** 新视图 ID。 */
  viewId: string
  /** 可选视图配置。 */
  config?: ViewMetadata
}

/** 更新视图参数。 */
type DataSetCrudToolUpdateViewParams = DataSetCrudToolViewSelectorParams & {
  /** 要合并到视图配置上的更新内容。 */
  updates: Partial<ViewMetadata>
}

/** 删除视图参数。 */
type DataSetCrudToolDeleteViewParams = DataSetCrudToolTableNameParams & {
  /** 要删除的视图 ID。 */
  viewId: string
}

/** 聚合配置定位参数。 */
type DataSetCrudToolAggregateSelectorParams = DataSetCrudToolViewSelectorParams & {
  /** 聚合配置 key，即 aggregateResult 的输出字段名。 */
  key: string
}

/** 新增聚合参数。 */
type DataSetCrudToolAddAggregateParams = DataSetCrudToolAggregateSelectorParams & {
  /** 聚合列配置。 */
  config: AggregateColumnConfig
}

/** 更新聚合参数。 */
type DataSetCrudToolUpdateAggregateParams = DataSetCrudToolAggregateSelectorParams & {
  /** 要合并到聚合配置上的更新内容。 */
  updates: Partial<AggregateColumnConfig>
}

/** 设置计算表达式参数。 */
type DataSetCrudToolSetComputeExpressionParams = DataSetCrudToolColumnSelectorParams & {
  /** 新计算表达式。 */
  expression: string
}

/** 行定位参数。 */
type DataSetCrudToolRowSelectorParams = DataSetCrudToolViewSelectorParams & {
  /** 行主键值。 */
  id: string | number
}

/** 新增行参数。 */
type DataSetCrudToolCreateRowParams = DataSetCrudToolViewSelectorParams & {
  /** 新行数据。 */
  data: Partial<DataRow>
}

/** 批量新增行参数。 */
type DataSetCrudToolCreateRowsParams = DataSetCrudToolViewSelectorParams & {
  /** 待新增的行数据列表。 */
  items: Array<Partial<DataRow>>
}

/** 更新行参数。 */
type DataSetCrudToolUpdateRowParams = DataSetCrudToolRowSelectorParams & {
  /** 要合并到目标行上的字段更新。 */
  data: Partial<DataRow>
}

/** 批量更新行的单条输入。 */
type DataSetCrudToolUpdateRowsItem = {
  /** 目标行主键值。 */
  id: string | number
  /** 要合并到目标行上的字段更新。 */
  data: Partial<DataRow>
}

/** 批量更新行参数。 */
type DataSetCrudToolUpdateRowsParams = DataSetCrudToolViewSelectorParams & {
  /** 待更新的行列表。 */
  items: DataSetCrudToolUpdateRowsItem[]
}

/** 批量删除行参数。 */
type DataSetCrudToolDeleteRowsParams = DataSetCrudToolViewSelectorParams & {
  /** 待删除行的主键值列表。 */
  ids: Array<string | number>
}

/** 更新表关系参数。 */
type DataSetCrudToolUpdateResourceRelationParams = {
  /** 用于定位原关系的选择器。 */
  selector: ResourceRelationSelector
  /** 要合并到关系定义上的更新内容。 */
  updates: Partial<DataResourceRelation>
}

/** 创建 DataView 输入级联参数。 */
type DataSetCrudToolCreateCascadeParams = {
  /** 新 DataView 输入级联定义。 */
  cascade: DataViewCascade
}

/** 更新 DataView 输入级联参数。 */
type DataSetCrudToolUpdateCascadeParams = DataViewCascadeSelector & {
  /** 要合并到级联定义上的更新内容。 */
  updates: Partial<DataViewCascade>
}

type DataSetCrudToolCascadeFilter = { kind: 'field'; tableName?: string; viewId?: string }
  | { kind?: 'query'; parentTable?: string; childTable?: string }

/**
 * DataSet 级统一 CRUD facade。
 *
 * 设计目标：
 * 1. 构造时只要求 dataSetName，外部无需先手动拼装 DataSet。
 * 2. 统一收口表、列、视图、行、关系、依赖这几类对象的常用操作。
 * 3. 全部复用现有 DataSet/DataTable/DataView 能力，避免再造第二套状态模型。
 * 4. 所有公开方法统一使用单一对象参数，便于 LLM / 动态调度直接传 JSON object。
 *
 */
export class DataSetCrudTool {
  private static readonly HISTORY_LIMIT = 50

  /**
   * 当前工具类持有的 DataSet 实例。
   */
  private _dataSet: DataSet
  private _history!: SnapshotHistory<DataSetMetadata>

  /**
   * 创建一个绑定到指定 dataSetName 的统一 CRUD 工具。
   *
   * @param dataSetName DataSet 名称。
   */
  constructor(dataSetName: string) {
    // 从最小空配置创建 DataSet，后续对象全部通过本工具类逐步补齐。
    this._dataSet = DataSet.fromJson({
      dataSetName,
      tables: {},
    })
    this.initializeHistory()
  }

  /**
   * 从已有 DataSet 实例或 JSON 快照创建工具类。
   */
  static fromDataSet(source: DataSet | Record<string, unknown> | string): DataSetCrudTool {
    if (source instanceof DataSet) {
      const tool = new DataSetCrudTool(source.dataSetName)
      tool._dataSet.destroy()
      tool._dataSet = source
      tool.initializeHistory()
      return tool
    }
    return DataSetCrudTool.fromJson(source)
  }

  /**
   * 从 JSON 元数据创建工具类。
   */
  static fromJson(json: DataSetMetadata | Record<string, unknown> | string): DataSetCrudTool {
    const ds = DataSet.fromJson(json)
    return DataSetCrudTool.fromDataSet(ds)
  }

  /**
   * 以模型层方式合并外部快照。
   * - 无当前工具时：创建新工具（历史从快照初始化）。
   * - preserveHistory=false：重建工具并重置历史。
   * - preserveHistory=true：在当前历史链中提交快照，支持 undo/redo。
   */
  static reconcileFromJson(
    snapshot: DataSetMetadata | Record<string, unknown> | string,
    current?: DataSetCrudTool,
    options?: { preserveHistory?: boolean },
  ): DataSetCrudTool {
    const candidate = DataSet.fromJson(snapshot)
    let normalizedSnapshot: DataSetMetadata
    try { normalizedSnapshot = candidate.toJson() } finally { candidate.destroy() }

    if (!current) {
      return DataSetCrudTool.fromJson(normalizedSnapshot)
    }

    if (options?.preserveHistory === false) {
      current.replaceFromJson(normalizedSnapshot, { commitHistory: false })
      return current
    }

    const currentJson = JSON.stringify(current.toJson())
    const nextJson = JSON.stringify(normalizedSnapshot)
    if (currentJson === nextJson) {
      return current
    }

    current.replaceFromJson(normalizedSnapshot, { commitHistory: true })
    return current
  }

  /**
   * 当前工具类持有的 DataSet 实例。
   */
  get dataSet(): DataSet {
    return this._dataSet
  }

  // ====================
  // DataSet 基础信息
  // ====================

  /**
   * 返回当前工具类绑定的 DataSet 名称。
   *
   * @returns DataSet 名称。
   */
  get dataSetName(): string {
    return this.dataSet.dataSetName
  }

  /**
   * 将当前 DataSet 序列化为元数据对象。
   *
   * @returns 可用于持久化或传输的 DataSet 元数据。
   */
  toJson(): DataSetMetadata {
    return this.dataSet.toJson()
  }

  // ====================
  // Undo / Redo
  // ====================

  get canUndo(): boolean {
    return this._history.canUndo
  }

  get canRedo(): boolean {
    return this._history.canRedo
  }

  get historyCursor(): number {
    return this._history.cursor
  }

  /**
   * 查询当前数据集历史是否可撤销。
   *
   */
  getCanUndo(): boolean {
    return this.canUndo
  }

  /**
   * 查询当前数据集历史是否可重做。
   *
   */
  getCanRedo(): boolean {
    return this.canRedo
  }

  /**
   * 查询当前数据集历史栈游标位置。
   *
   */
  getHistoryCursor(): number {
    return this.historyCursor
  }

  /**
   * 撤销最近一次结构写操作。
   * 成功时替换内部 DataSet 并返回 true；无可撤销时返回 false。
   *
   */
  undo(): boolean {
    const snapshot = this._history.undo()
    if (snapshot === null) return false
    this._dataSet.replaceFromJson(snapshot)
    return true
  }

  /**
   * 重做最近一次被撤销的操作。
   * 成功时替换内部 DataSet 并返回 true；无可重做时返回 false。
   *
   */
  redo(): boolean {
    const snapshot = this._history.redo()
    if (snapshot === null) return false
    this._dataSet.replaceFromJson(snapshot)
    return true
  }

  /**
   * 清空当前数据集的 undo/redo 历史，只保留当前快照作为新的历史起点。
   *
   */
  clearHistory(): void {
    const current = this._history.current
    this._history.clear()
    if (current !== null) {
      this._history.push(current)
    }
  }

  /**
   * 用外部快照替换当前 DataSet。
   * 默认会把替换结果压入历史栈，确保该替换可被撤销/重做。
   *
   * @param snapshot 外部 DataSet 元数据快照。
   * @param options 替换写入选项。
   */
  replaceFromJson(snapshot: DataSetMetadata | Record<string, unknown> | string, options?: DataSetCrudToolReplaceFromJsonOptions): void {
    const candidate = DataSet.fromJson(snapshot)
    let normalizedSnapshot: DataSetMetadata
    try { normalizedSnapshot = candidate.toJson() } finally { candidate.destroy() }
    this._dataSet.replaceFromJson(normalizedSnapshot)
    if (options?.commitHistory === false) {
      this.initializeHistory()
      return
    }
    this._history.push(this._dataSet.toJson())
  }

  /**
   * 每次结构写操作成功后调用，将当前状态推入历史栈。
   */
  private _afterWrite(): void {
    this._history.push(this._dataSet.toJson())
  }

  private initializeHistory(): void {
    this._history = new SnapshotHistory<DataSetMetadata>(DataSetCrudTool.HISTORY_LIMIT)
    this._history.push(this._dataSet.toJson())
  }

  // ====================
  // 表与列结构 CRUD
  // ====================

  /**
   * 当前 DataSet 中的全部数据表。
   */
  get tables(): DataTable[] {
    return this.listTables()
  }

  /**
   * 列出当前 DataSet 中的全部数据表。
   *
   * @returns 数据表实例列表。
   */
  listTables(): DataTable[] {
    return Object.values(this.dataSet.tables)
  }

  /**
   * 获取指定数据表。
   *
   * @param tableNameOrParams 表名字符串或表名参数对象。
   * @param tableName 表名。
   * @returns 命中的 DataTable；不存在时返回 undefined。
   */
  getTable(tableNameOrParams: string | DataSetCrudToolTableNameParams): DataTable | undefined {
    return this.dataSet.getTable(this.normalizeTableNameArg(tableNameOrParams, 'getTable'))
  }

  /**
   * 列出指定数据表的全部列定义。
   *
   * @param tableNameOrParams 表名字符串或表名参数对象。
   * @param tableName 表名。
   * @returns 列定义副本列表。
   * @throws 当表不存在时抛错。
   */
  listColumns(tableNameOrParams: string | DataSetCrudToolTableNameParams): DataColumn[] {
    return [...this.getTableOrThrow(this.normalizeTableNameArg(tableNameOrParams, 'listColumns')).columns]
  }

  /**
   * 获取指定数据表中的单个列定义。
   *
   * @param params 字段定位参数。
   * @param tableName 表名。
   * @param columnName 列名。
   * @returns 命中的列定义；不存在时返回 undefined。
   * @throws 当表不存在时抛错。
   */
  getColumn(params: DataSetCrudToolColumnSelectorParams): DataColumn | undefined {
    const tableName = this.requireNonEmptyString(params.tableName, 'getColumn.tableName')
    const columnName = this.requireNonEmptyString(params.columnName, 'getColumn.columnName')
    return this.getTableOrThrow(tableName).columns.find(column => column.name === columnName)
  }

  /**
   * 向指定数据表追加一列。
   *
   * @param params 字段新增参数。
   * @param tableName 表名。
   * @param column 新列定义。
   * @returns 更新后的 DataTable。
   * @throws 当表不存在或列定义非法时抛错。
   */
  createColumn(params: DataSetCrudToolCreateColumnParams): DataTable {
    const tableName = this.requireNonEmptyString(params.tableName, 'createColumn.tableName')
    const column = this.requireObjectArg(params.column, 'createColumn.column')
    const table = this.getTableOrThrow(tableName)
    // 必须走 DataTable.addColumns，不能直接改 metadata，否则 validator / view 列缓存会失效。
    table.addColumns([column])
    this._afterWrite()
    return table
  }

  /**
   * 更新指定列定义。
   *
   * @param params 字段更新参数。
   * @param tableName 表名。
   * @param columnName 列名。
   * @param updates 需要合并到现有列定义中的更新内容。
   * @returns 更新后的 DataTable。
   * @throws 当表或列不存在时抛错。
   */
  updateColumn(params: DataSetCrudToolUpdateColumnParams): DataTable {
    const tableName = this.requireNonEmptyString(params.tableName, 'updateColumn.tableName')
    const columnName = this.requireNonEmptyString(params.columnName, 'updateColumn.columnName')
    const updates = this.requireObjectArg(params.updates, 'updateColumn.updates')
    const table = this.getTableOrThrow(tableName)
    // 列更新后会触发 DataTable 内部运行时刷新链，保证 DataView.getColumn 与 schema 保持一致。
    table.updateColumn(columnName, updates)
    this._afterWrite()
    return table
  }

  /**
   * 重命名指定字段，并迁移行数据、视图字段引用和表关系字段引用。
   *
   * @param params 字段重命名参数。
   * @returns 重命名后的 DataTable。
   */
  renameColumn(params: DataSetCrudToolRenameColumnParams): DataTable {
    const tableName = params.tableName.trim()
    const columnName = params.columnName.trim()
    const newColumnName = params.newColumnName.trim()

    if (!tableName) throw new Error('renameColumn: tableName 不能为空')
    if (!columnName) throw new Error('renameColumn: columnName 不能为空')
    if (!newColumnName) throw new Error('renameColumn: newColumnName 不能为空')
    if (columnName === newColumnName) return this.getTableOrThrow(tableName)

    const snapshot = deepClone(this.toJson())
    const table = snapshot.tables[tableName]
    if (!table) throw new Error(`renameColumn: table ${tableName} 不存在`)
    if (table.columns.some((column) => column.name === newColumnName)) {
      throw new Error(`renameColumn: 列 ${newColumnName} 已存在于表 ${tableName}`)
    }

    const column = table.columns.find((entry) => entry.name === columnName)
    if (!column) throw new Error(`renameColumn: column ${columnName} 不存在于表 ${tableName}`)
    column.name = newColumnName

    const renameRowField = (row: Record<string, unknown>): Record<string, unknown> => {
      if (!Object.prototype.hasOwnProperty.call(row, columnName)) return row
      const nextRow: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(row)) {
        nextRow[key === columnName ? newColumnName : key] = value
      }
      return nextRow
    }

    const renameFieldRefsInPlace = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) renameFieldRefsInPlace(item)
        return
      }
      if (!isRecord(value)) return

      for (const [key, child] of Object.entries(value)) {
        if (key === 'field' && child === columnName) {
          value[key] = newColumnName
          continue
        }
        if (key === 'valueField') {
          if (child === columnName) {
            value[key] = newColumnName
            continue
          }
          if (Array.isArray(child)) {
            value[key] = child.map((item: unknown): unknown => item === columnName ? newColumnName : item)
            continue
          }
        }
        if (key === 'labelField' && child === columnName) {
          value[key] = newColumnName
          continue
        }
        if ((key === 'sourceField' || key === 'targetField' || key === 'matchField') && child === columnName) {
          value[key] = newColumnName
          continue
        }
        if ((key === 'resourceField' || key === 'viewField') && child === columnName) {
          value[key] = newColumnName
          continue
        }
        renameFieldRefsInPlace(child)
      }
    }

    for (const view of Object.values(table.views)) {
      renameFieldRefsInPlace(view)
      if (Array.isArray(view.rows)) {
        view.rows = view.rows.map(row => renameRowField(row))
      }
    }

    if (snapshot.resourceRelations) {
      snapshot.resourceRelations = snapshot.resourceRelations.map(relation => {
        try {
          return {...relation, filterExpression: ResourceRelationDefinition.renameField({
            expression: relation.filterExpression, parentTable: relation.parentTable, childTable: relation.childTable,
            tableName, fieldName: columnName, newFieldName: newColumnName,
          })}
        } catch (error) {
          throw new Error(`renameColumn: ${error instanceof Error ? error.message : String(error)}`)
        }
      })
    }

    if (snapshot.viewCascades) {
      snapshot.viewCascades = snapshot.viewCascades.map((cascade) => cascade.kind === 'field' ? ({
        ...cascade,
        ...(cascade.tableName === tableName ? {
          targetField: cascade.targetField === columnName ? newColumnName : cascade.targetField,
          parents: cascade.parents.map(parent => ({ ...parent,
            field: parent.field === columnName ? newColumnName : parent.field })),
        } : {}),
        ...(cascade.optionsView.tableName === tableName ? { optionsView: { ...cascade.optionsView,
          valueField: cascade.optionsView.valueField === columnName ? newColumnName : cascade.optionsView.valueField,
          labelField: cascade.optionsView.labelField === columnName ? newColumnName : cascade.optionsView.labelField,
        } } : {}),
      }) : ({ ...cascade,
        filterBindings: cascade.filterBindings.map((binding) => ({
          sourceField: cascade.parentTable === tableName && binding.sourceField === columnName
            ? newColumnName
            : binding.sourceField,
          targetField: cascade.childTable === tableName && binding.targetField === columnName
            ? newColumnName
            : binding.targetField,
        })),
      }))
    }

    this.replaceFromJson(snapshot, { commitHistory: true })
    return this.getTableOrThrow(tableName)
  }

  /**
   * 删除指定列。
   *
   * @param params 字段定位参数。
   * @param tableName 表名。
   * @param columnName 列名。
   * @throws 当表或列不存在时抛错。
   */
  deleteColumn(params: DataSetCrudToolColumnSelectorParams): void {
    const tableName = this.requireNonEmptyString(params.tableName, 'deleteColumn.tableName')
    const columnName = this.requireNonEmptyString(params.columnName, 'deleteColumn.columnName')
    const resourceRelation = (this.dataSet.resourceRelations ?? []).find((relation) => (
      this.relationReferencesField(relation, tableName, columnName)
    ))
    if (resourceRelation !== undefined) {
      throw new Error(`deleteColumn: ${tableName}.${columnName} is referenced by resourceRelations`)
    }
    const viewCascade = (this.dataSet.viewCascades ?? []).find((cascade) => (
      cascade.kind === 'field'
        ? (cascade.tableName === tableName && (cascade.targetField === columnName
          || cascade.parents.some(parent => parent.field === columnName)))
          || (cascade.optionsView.tableName === tableName && (cascade.optionsView.valueField === columnName
            || cascade.optionsView.labelField === columnName))
        : (cascade.parentTable === tableName
          && cascade.filterBindings.some(binding => binding.sourceField === columnName))
          || (cascade.childTable === tableName
            && cascade.filterBindings.some(binding => binding.targetField === columnName))
    ))
    if (viewCascade !== undefined) {
      throw new Error(`deleteColumn: ${tableName}.${columnName} is referenced by viewCascades`)
    }
    this.getTableOrThrow(tableName).removeColumn(columnName)
    this._afterWrite()
  }

  private relationReferencesField(relation: DataResourceRelation, tableName: string, fieldName: string): boolean {
    return ResourceRelationDefinition.referencesField({
      expression: relation.filterExpression, parentTable: relation.parentTable, childTable: relation.childTable, tableName, fieldName,
    })
  }

  /**
   * 创建数据表并按需初始化资源语义、API、CRUD 配置和视图。
   *
   * @param options 建表参数。
   * @returns 新创建的数据表实例。
   * @throws 当表已存在或配置非法时抛错。
   */
  createTable(options: DataSetCrudToolCreateTableOptions): DataTable {
    const table = this.dataSet.addTable(options.tableName, options.columns)

    this.applyTableSemanticMetadata(table, options)

    if (options.api !== undefined) {
      table.setApi(options.api)
    }
    if (options.crudConfig !== undefined) {
      table.setCrudConfig(options.crudConfig)
    }

    if (options.views) {
      for (const [viewId, viewConfig] of Object.entries(options.views)) {
        const view = viewId === 'default'
          ? this.getViewOrThrow(options.tableName, 'default')
          : table.addView(viewId)
        this.applyViewMetadata(table, view, viewConfig)
      }
    }

    this._afterWrite()
    return table
  }

  /**
   * 更新数据表结构、资源语义及运行配置。
   *
   * @param params 表更新参数。
   * @param tableName 表名。
   * @param updates 更新内容。
   * @returns 更新后的 DataTable。
   * @throws 当表不存在或某项结构更新非法时抛错。
   */
  updateTable(params: DataSetCrudToolUpdateTableParams): DataTable {
    const tableName = this.requireNonEmptyString(params.tableName, 'updateTable.tableName')
    const table = this.getTableOrThrow(tableName)

    // 结构变更优先执行，避免后续 rows / api / crudConfig 更新面对旧 schema。
    if (params.columnsToAdd?.length) {
      table.addColumns(params.columnsToAdd)
    }
    if (params.columnUpdates?.length) {
      for (const entry of params.columnUpdates) {
        table.updateColumn(entry.columnName, entry.updates)
      }
    }
    if (params.columnsToRemove?.length) {
      for (const columnName of params.columnsToRemove) {
        table.removeColumn(columnName)
      }
    }
    if (params.api !== undefined) {
      table.setApi(params.api)
    }
    if (params.crudConfig !== undefined) {
      if (params.crudConfig === null) {
        delete table.crudConfig
      } else {
        table.setCrudConfig(params.crudConfig)
      }
    }
    this.applyTableSemanticMetadata(table, params, true)
    if (params.defaultRows !== undefined) {
      table.rows = [...params.defaultRows]
      table.getView('default')?.replaceRows([...params.defaultRows])
    }

    this._afterWrite()
    return table
  }

  /**
   * 重命名数据表，并迁移视图 tableName、关系、依赖和布局位置引用。
   *
   * @param params 表重命名参数。
   * @returns 重命名后的 DataTable。
   */
  renameTable(params: DataSetCrudToolRenameTableParams): DataTable {
    const tableName = params.tableName.trim()
    const newTableName = params.newTableName.trim()

    if (!tableName) throw new Error('renameTable: tableName 不能为空')
    if (!newTableName) throw new Error('renameTable: newTableName 不能为空')
    if (tableName === newTableName) return this.getTableOrThrow(tableName)

    const snapshot = deepClone(this.toJson())
    const table = snapshot.tables[tableName]
    if (!table) throw new Error(`renameTable: table ${tableName} 不存在`)
    if (snapshot.tables[newTableName]) {
      throw new Error(`renameTable: table ${newTableName} 已存在`)
    }

    const nextTables: Record<string, TableMetadata> = {}
    for (const [key, value] of Object.entries(snapshot.tables)) {
      if (key !== tableName) {
        nextTables[key] = value
        continue
      }

      const views: TableMetadata['views'] = {
        default: { ...value.views.default, tableName: newTableName },
      }
      for (const [viewId, view] of Object.entries(value.views)) {
        if (viewId === 'default') continue
        views[viewId] = { ...view, tableName: newTableName }
      }
      nextTables[newTableName] = {
        ...value,
        tableName: newTableName,
        views,
      }
    }
    snapshot.tables = nextTables

    if (snapshot.resourceRelations) {
      snapshot.resourceRelations = snapshot.resourceRelations.map(relation => {
        const filterExpression = ResourceRelationDefinition.renameTable({
          expression: relation.filterExpression, parentTable: relation.parentTable, childTable: relation.childTable,
          tableName, newTableName,
        })
        return {...relation,
          ...(relation.parentTable === tableName ? {parentTable: newTableName} : {}),
          ...(relation.childTable === tableName ? {childTable: newTableName} : {}),
          filterExpression,
        }
      })
    }

    if (snapshot.viewCascades) {
      snapshot.viewCascades = snapshot.viewCascades.map((cascade) => cascade.kind === 'field'
        ? { ...cascade,
          ...(cascade.tableName === tableName ? { tableName: newTableName } : {}),
          ...(cascade.optionsView.tableName === tableName ? {
            optionsView: { ...cascade.optionsView, tableName: newTableName },
          } : {}),
        }
        : { ...cascade,
          ...(cascade.parentTable === tableName ? { parentTable: newTableName } : {}),
          ...(cascade.childTable === tableName ? { childTable: newTableName } : {}),
        })
    }

    const currentTablePositions = snapshot.layout?.tablePositions
    const nextLayoutEntry = currentTablePositions?.[tableName]
    if (nextLayoutEntry !== undefined && currentTablePositions !== undefined) {
      const { [tableName]: _removedLayoutEntry, ...rest } = currentTablePositions
      snapshot.layout = {
        tablePositions: {
          ...rest,
          [newTableName]: nextLayoutEntry,
        },
      }
    }

    this.replaceFromJson(snapshot, { commitHistory: true })
    return this.getTableOrThrow(newTableName)
  }

  /**
   * 删除指定数据表。
   *
   * @param tableNameOrParams 表名字符串或表名参数对象。
   * @param tableName 表名。
   * @throws 当表不存在，或仍被 resource relation / view cascade 引用时抛错。
   */
  deleteTable(tableNameOrParams: string | DataSetCrudToolTableNameParams): void {
    this.dataSet.removeTable(this.normalizeTableNameArg(tableNameOrParams, 'deleteTable'))
    this._afterWrite()
  }

  // ====================
  // 视图 CRUD
  // ====================

  /**
   * 列出某个数据表下的全部视图。
   *
   * @param tableNameOrParams 表名字符串或表名参数对象。
   * @param tableName 表名。
   * @returns 视图实例列表。
   * @throws 当表不存在时抛错。
   */
  listViews(tableNameOrParams: string | DataSetCrudToolTableNameParams): DataView[] {
    return Object.values(this.getTableOrThrow(this.normalizeTableNameArg(tableNameOrParams, 'listViews')).views)
  }

  /**
   * 获取指定视图。
   *
   * @param params 视图定位参数。
   * @param tableName 表名。
   * @param viewId 视图 ID，默认 default。
   * @returns 视图实例；不存在时返回 undefined。
   */
  getView(params: DataSetCrudToolViewSelectorParams): DataView | undefined {
    const tableName = this.requireNonEmptyString(params.tableName, 'getView.tableName')
    return this.dataSet.getView(tableName, params.viewId ?? 'default')
  }

  /**
   * 创建一个非 default 视图。
   *
   * @param params 视图创建参数。
   * @param tableName 表名。
   * @param viewId 视图 ID。
   * @param config 视图初始配置。
   * @returns 新创建的视图实例。
   * @throws 当表不存在，或试图创建 default 视图时抛错。
   */
  createView(params: DataSetCrudToolCreateViewParams): DataView {
    const tableName = this.requireNonEmptyString(params.tableName, 'createView.tableName')
    const viewId = this.requireNonEmptyString(params.viewId, 'createView.viewId')
    // default 视图在建表时就存在，单独创建会破坏约定，因此强制改走 updateView。
    if (viewId === 'default') {
      throw new Error('Default view already exists, use updateView instead')
    }
    const table = this.getTableOrThrow(tableName)
    const view = table.addView(viewId)
    if (params.config) {
      this.applyViewMetadata(table, view, params.config)
    }
    this._afterWrite()
    return view
  }

  /**
   * 更新指定视图的元数据配置。
   *
   * @param params 视图更新参数。
   * @param tableName 表名。
   * @param viewId 视图 ID。
   * @param updates 要应用的视图配置。
   * @returns 更新后的视图实例。
   * @throws 当表或视图不存在时抛错。
   */
  updateView(params: DataSetCrudToolUpdateViewParams): DataView {
    const tableName = this.requireNonEmptyString(params.tableName, 'updateView.tableName')
    const viewId = params.viewId ?? 'default'
    const updates = this.requireObjectArg(params.updates, 'updateView.updates')
    const table = this.getTableOrThrow(tableName)
    const view = this.getViewOrThrow(tableName, viewId)
    this.applyViewMetadata(table, view, updates)
    this._afterWrite()
    return view
  }

  /**
   * 删除指定视图。
   *
   * @param params 视图删除参数。
   * @param tableName 表名。
   * @param viewId 视图 ID。
   * @throws 当表不存在，或试图删除 default 视图时抛错。
   */
  deleteView(params: DataSetCrudToolDeleteViewParams): void {
    const tableName = this.requireNonEmptyString(params.tableName, 'deleteView.tableName')
    const viewId = this.requireNonEmptyString(params.viewId, 'deleteView.viewId')
    // default 视图是 DataTable 基础组成部分，不允许删除。
    if (viewId === 'default') {
      throw new Error('Default view cannot be deleted')
    }
    if ((this.dataSet.viewCascades ?? []).some(cascade => cascade.kind === 'field'
      && ((cascade.tableName === tableName && cascade.viewId === viewId)
        || (cascade.optionsView.tableName === tableName && cascade.optionsView.viewId === viewId)))) {
      throw new Error(`deleteView: ${tableName}@${viewId} is referenced by viewCascades`)
    }
    this.getTableOrThrow(tableName).destroyView(viewId)
    this._afterWrite()
  }

  /**
   * 列出指定视图的全部聚合配置。
   *
   * @param params 聚合查询参数。
   * @returns 聚合 key 到聚合配置的映射。
   */
  listAggregates(params: DataSetCrudToolViewSelectorParams): Record<string, AggregateColumnConfig> {
    const tableName = this.requireNonEmptyString(params.tableName, 'listAggregates.tableName')
    const view = this.getViewOrThrow(tableName, params.viewId ?? 'default')
    return { ...view.aggregates }
  }

  /**
   * 读取指定视图中的单个聚合配置。
   *
   * @param params 聚合定位参数。
   * @returns 命中的聚合配置；不存在时返回 undefined。
   */
  getAggregate(params: DataSetCrudToolAggregateSelectorParams): AggregateColumnConfig | undefined {
    const tableName = this.requireNonEmptyString(params.tableName, 'getAggregate.tableName')
    const key = this.requireNonEmptyString(params.key, 'getAggregate.key')
    const view = this.getViewOrThrow(tableName, params.viewId ?? 'default')
    return view.aggregates[key]
  }

  /**
   * 向指定视图新增一个聚合配置。
   *
   * @param params 聚合创建参数。
   */
  addAggregate(params: DataSetCrudToolAddAggregateParams): void {
    const tableName = this.requireNonEmptyString(params.tableName, 'addAggregate.tableName')
    const key = this.requireNonEmptyString(params.key, 'addAggregate.key')
    const config = this.requireObjectArg(params.config, 'addAggregate.config')
    const view = this.getViewOrThrow(tableName, params.viewId ?? 'default')
    if (view.aggregates[key] !== undefined) {
      throw new Error(`Aggregate key "${key}" already exists`)
    }
    view.setAggregates({ ...view.aggregates, [key]: config })
    this._afterWrite()
  }

  /**
   * 更新指定视图中的聚合配置。
   *
   * @param params 聚合更新参数。
   */
  updateAggregate(
    params: DataSetCrudToolUpdateAggregateParams,
  ): void {
    const tableName = this.requireNonEmptyString(params.tableName, 'updateAggregate.tableName')
    const key = this.requireNonEmptyString(params.key, 'updateAggregate.key')
    const updates = this.requireObjectArg(params.updates, 'updateAggregate.updates')
    const view = this.getViewOrThrow(tableName, params.viewId ?? 'default')
    const current = view.aggregates[key]
    if (current === undefined) {
      throw new Error(`Aggregate key "${key}" not found`)
    }
    view.setAggregates({
      ...view.aggregates,
      [key]: {
        ...current,
        ...updates,
      },
    })
    this._afterWrite()
  }

  /**
   * 删除指定视图中的聚合配置。
   *
   * @param params 聚合删除参数。
   */
  removeAggregate(params: DataSetCrudToolAggregateSelectorParams): void {
    const tableName = this.requireNonEmptyString(params.tableName, 'removeAggregate.tableName')
    const key = this.requireNonEmptyString(params.key, 'removeAggregate.key')
    const view = this.getViewOrThrow(tableName, params.viewId ?? 'default')
    if (view.aggregates[key] === undefined) {
      throw new Error(`Aggregate key "${key}" not found`)
    }
    const { [key]: _removedAggregate, ...nextAggregates } = view.aggregates
    view.setAggregates(nextAggregates)
    this._afterWrite()
  }

  /**
   * 读取指定字段的计算表达式。
   *
   * @param params 字段定位参数。
   * @returns 字段计算表达式；未设置时返回 undefined。
   */
  getComputeExpression(params: DataSetCrudToolColumnSelectorParams): string | undefined {
    return this.getColumn(params)?.computeExpression
  }

  /**
   * 设置指定字段的计算表达式。
   *
   * @param params 计算表达式设置参数。
   * @returns 更新后的 DataTable。
   */
  setComputeExpression(params: DataSetCrudToolSetComputeExpressionParams): DataTable {
    const expression = this.requireNonEmptyString(params.expression, 'setComputeExpression.expression')
    return this.updateColumn({
      tableName: params.tableName,
      columnName: params.columnName,
      updates: { computeExpression: expression },
    })
  }

  /**
   * 清除指定字段的计算表达式。
   *
   * @param params 字段定位参数。
   * @returns 更新后的 DataTable。
   */
  clearComputeExpression(params: DataSetCrudToolColumnSelectorParams): DataTable {
    const tableName = this.requireNonEmptyString(params.tableName, 'clearComputeExpression.tableName')
    const columnName = this.requireNonEmptyString(params.columnName, 'clearComputeExpression.columnName')
    const table = this.getTableOrThrow(tableName)
    const column = this.getColumn({ tableName, columnName })
    if (!column) {
      throw new Error(`Column "${columnName}" not found in table "${tableName}"`)
    }

    const { computeExpression: _removedComputeExpression, ...nextColumn } = column
    table.updateColumn(columnName, nextColumn)
    this._afterWrite()
    return table
  }

  // ====================
  // 行数据 CRUD
  // ====================

  /**
   * 列出指定视图当前持有的全部行。
   *
   * @param params 视图定位参数。
   * @param tableName 表名。
   * @param viewId 视图 ID，默认 default。
   * @returns 行数组副本。
   * @throws 当表或视图不存在时抛错。
   */
  listRows(params: DataSetCrudToolViewSelectorParams): DataRow[] {
    const tableName = this.requireNonEmptyString(params.tableName, 'listRows.tableName')
    return [...this.getViewOrThrow(tableName, params.viewId ?? 'default').rows]
  }

  /**
   * 通过主键查找一条行数据。
   *
   * @param params 行定位参数。
   * @param tableName 表名。
   * @param id 主键值。
   * @param viewId 视图 ID，默认 default。
   * @returns 命中的行；不存在时返回 undefined。
   * @throws 当表或视图不存在时抛错。
   */
  getRow(params: DataSetCrudToolRowSelectorParams): DataRow | undefined {
    const tableName = this.requireNonEmptyString(params.tableName, 'getRow.tableName')
    const viewId = params.viewId ?? 'default'
    const view = this.getViewOrThrow(tableName, viewId)
    // 行查找支持树形 children 递归扫描，避免调用方区分平铺表和树表。
    return this.findRowById(view.rows, params.id, row => view.getPkKey(row))
  }

  /**
   * 在指定视图中创建一条新行。
   *
   * @param params 新增行参数。
   * @param tableName 表名。
   * @param data 新行数据。
   * @param viewId 视图 ID，默认 default。
   * @returns 本地模式下通常返回 DataRow；远端 CRUD 模式下可能返回 CrudResult。
   * @throws 当表或视图不存在，或创建失败时抛错。
   */
  async createRow(params: DataSetCrudToolCreateRowParams): Promise<DataRow | CrudResult<DataRow>> {
    const tableName = this.requireNonEmptyString(params.tableName, 'createRow.tableName')
    const data = this.requireObjectArg(params.data, 'createRow.data')
    const viewId = params.viewId ?? 'default'
    const table = this.getTableOrThrow(tableName)
    const view = this.getViewOrThrow(tableName, viewId)
    const result = await view.addRow(data)
    // 无远端 API 的 default view 同时承担 DataTable.rows 的静态源数据，需要双向保持一致。
    this.syncInlineDefaultRows(table, viewId)
    return result
  }

  /**
   * 在指定视图中批量创建多条新行。
   *
   * - immediate + API 模式：优先走 view.crud.batchCreateRecords
   * - 其余模式：逐条复用 view.addRow，并统一收口为 BatchResult
   *
   * @param params 批量新增行参数。
   */
  async createRows(params: DataSetCrudToolCreateRowsParams): Promise<CrudResult<BatchResult>> {
    const tableName = this.requireNonEmptyString(params.tableName, 'createRows.tableName')
    const items = this.requireNonEmptyArray(params.items, 'createRows.items')
    const viewId = params.viewId ?? 'default'
    const table = this.getTableOrThrow(tableName)
    const view = this.getViewOrThrow(tableName, viewId)
    const result = this.shouldUseRemoteBatch(table, view)
      ? await view.crud.batchCreateRecords(items)
      : await this.executeBatchLocal(items, (item) => view.addRow(item))
    this.syncInlineDefaultRows(table, viewId)
    return result
  }

  /**
   * 更新指定主键的行数据。
   *
   * @param params 更新行参数。
   * @param tableName 表名。
   * @param id 主键值。
   * @param data 要合并的字段更新。
   * @param viewId 视图 ID，默认 default。
   * @returns 本地模式下通常返回 boolean；远端 CRUD 模式下可能返回 CrudResult。
   * @throws 当表或视图不存在，或更新失败时抛错。
   */
  async updateRow(params: DataSetCrudToolUpdateRowParams): Promise<boolean | CrudResult<DataRow>> {
    const tableName = this.requireNonEmptyString(params.tableName, 'updateRow.tableName')
    const data = this.requireObjectArg(params.data, 'updateRow.data')
    const viewId = params.viewId ?? 'default'
    const table = this.getTableOrThrow(tableName)
    const view = this.getViewOrThrow(tableName, viewId)
    const result = await view.editRowById(params.id, data)
    // 仅同步内联 default view，避免误把远端视图状态反写成静态源数据。
    this.syncInlineDefaultRows(table, viewId)
    return result
  }

  /**
   * 批量更新多条行数据。
   *
   * 对话侧统一传 id + data，底层再按视图主键字段拼装 batchUpdate payload。
   *
   * @param params 批量更新行参数。
   */
  async updateRows(params: DataSetCrudToolUpdateRowsParams): Promise<CrudResult<BatchResult>> {
    const tableName = this.requireNonEmptyString(params.tableName, 'updateRows.tableName')
    const items = this.requireNonEmptyArray(params.items, 'updateRows.items')
    const viewId = params.viewId ?? 'default'
    const table = this.getTableOrThrow(tableName)
    const view = this.getViewOrThrow(tableName, viewId)
    const result = this.shouldUseRemoteBatch(table, view)
      ? await view.crud.batchUpdateRecords(items.map((item) => ({
        ...item.data,
        [view.primaryKey]: item.id,
      })))
      : await this.executeBatchLocal(items, (item) => view.editRowById(item.id, item.data))
    this.syncInlineDefaultRows(table, viewId)
    return result
  }

  /**
   * 删除指定主键的行数据。
   *
   * @param params 删除行参数。
   * @param tableName 表名。
   * @param id 主键值。
   * @param viewId 视图 ID，默认 default。
   * @returns 本地模式下通常返回 boolean；远端 CRUD 模式下可能返回 CrudResult。
   * @throws 当表或视图不存在，或删除失败时抛错。
   */
  async deleteRow(params: DataSetCrudToolRowSelectorParams): Promise<boolean | CrudResult<boolean>> {
    const tableName = this.requireNonEmptyString(params.tableName, 'deleteRow.tableName')
    const viewId = params.viewId ?? 'default'
    const table = this.getTableOrThrow(tableName)
    const view = this.getViewOrThrow(tableName, viewId)
    const result = await view.removeRow(params.id)
    this.syncInlineDefaultRows(table, viewId)
    return result
  }

  /**
   * 批量删除多条行数据。
   *
   * @param params 批量删除行参数。
   */
  async deleteRows(params: DataSetCrudToolDeleteRowsParams): Promise<CrudResult<BatchResult>> {
    const tableName = this.requireNonEmptyString(params.tableName, 'deleteRows.tableName')
    const ids = this.requireNonEmptyArray(params.ids, 'deleteRows.ids')
    const viewId = params.viewId ?? 'default'
    const table = this.getTableOrThrow(tableName)
    const view = this.getViewOrThrow(tableName, viewId)
    const result = this.shouldUseRemoteBatch(table, view)
      ? await view.crud.batchDeleteRecords(ids)
      : await this.executeBatchLocal(ids, (id) => view.removeRow(id))
    this.syncInlineDefaultRows(table, viewId)
    return result
  }

  // ====================
  // 关系 CRUD
  // ====================

  /**
   * 列出 DataSet 中的表关系。
   *
   * @param filter 可选过滤条件，仅支持按 parentTable / childTable 过滤。
   * @returns 关系列表。
   */
  listResourceRelations(filter?: Partial<Pick<DataResourceRelation, 'parentTable' | 'childTable'>>): DataResourceRelation[] {
    return (this.dataSet.resourceRelations ?? []).filter((relation) => {
      if (filter?.parentTable !== undefined && relation.parentTable !== filter.parentTable) return false
      if (filter?.childTable !== undefined && relation.childTable !== filter.childTable) return false
      return true
    })
  }

  /**
   * 获取单条表关系。
   *
   * @param selector 关系选择器。
   * @returns 命中的表关系；不存在时返回 undefined。
   * @throws 当 selector 命中多条关系且未通过 relationId 消歧时抛错。
   */
  getResourceRelation(selector: ResourceRelationSelector): DataResourceRelation | undefined {
    const matches = (this.dataSet.resourceRelations ?? []).filter((relation) => {
      if (relation.parentTable !== selector.parentTable || relation.childTable !== selector.childTable) return false
      if (selector.relationId !== undefined && relation.relationId !== selector.relationId) return false
      if (selector.parentField !== undefined && !ResourceRelationDefinition.referencesField({
        expression: relation.filterExpression, parentTable: relation.parentTable, childTable: relation.childTable,
        tableName: relation.parentTable, fieldName: selector.parentField,
      })) return false
      if (selector.childField !== undefined && !ResourceRelationDefinition.referencesField({
        expression: relation.filterExpression, parentTable: relation.parentTable, childTable: relation.childTable,
        tableName: relation.childTable, fieldName: selector.childField,
      })) return false
      return true
    })
    if (matches.length > 1) {
      throw new Error(`Relation ${selector.parentTable}→${selector.childTable} is ambiguous, specify relationId`)
    }
    return matches[0]
  }

  /**
   * 创建一条表关系。
   *
   * @param params 关系参数。
   * @returns 新创建的表关系。
   * @throws 当父表、子表、字段不存在或关系重复时抛错。
   */
  createResourceRelation(params: DataResourceRelationInput): DataResourceRelation {
    const relation = this.dataSet.addResourceRelation(params)
    this._afterWrite()
    return relation
  }

  /**
   * 更新一条表关系。
   *
   * @param params 关系更新参数。
   * @param selector 用于定位原关系的选择器。
   * @param updates 关系更新内容。
   * @returns 更新后的表关系。
   * @throws 当关系不存在、选择器不唯一或更新后关系非法时抛错。
   */
  updateResourceRelation(params: DataSetCrudToolUpdateResourceRelationParams): DataResourceRelation {
    const updates = this.requireObjectArg(params.updates, 'updateResourceRelation.updates')
    const result = this.dataSet.updateResourceRelation(params.selector, updates)
    this._afterWrite()
    return result
  }

  /**
   * 删除一条表关系。
   *
   * @param selector 关系选择器。
   * @throws 当关系不存在，或定位到多条关系时抛错。
   */
  deleteResourceRelation(selector: ResourceRelationSelector): void {
    this.dataSet.removeResourceRelation(selector)
    this._afterWrite()
  }

  // ====================
  // DataView 输入级联 CRUD
  // ====================

  /**
   * 列出全部字段输入级联和视图查询依赖；传入过滤时明确选择对应语义。
   *
   * @param filter 字段级联按所在模型/视图过滤；查询依赖按父表/子表过滤。
   * @returns 级联列表。
   */
  listCascades(filter?: DataSetCrudToolCascadeFilter): DataViewCascade[] {
    return (this.dataSet.viewCascades ?? []).filter(cascade => {
      if (!filter) return true
      if (filter.kind === 'field') {
        return cascade.kind === 'field'
          && (filter.tableName === undefined || cascade.tableName === filter.tableName)
          && (filter.viewId === undefined || cascade.viewId === filter.viewId)
      }
      if (cascade.kind === 'field') return false
      if (filter?.parentTable !== undefined && cascade.parentTable !== filter.parentTable) return false
      if (filter?.childTable !== undefined && cascade.childTable !== filter.childTable) return false
      return true
    })
  }

  /**
   * 获取一条 DataView 输入级联。
   *
   * @param params 级联定位参数。
   * @param parentTable 父表名。
   * @param childTable 子表名。
   * @returns 命中的级联；不存在时返回 undefined。
   */
  getCascade(params: DataViewCascadeSelector): DataViewCascade | undefined {
    const selector = this.requireCascadeSelector(params)
    return (this.dataSet.viewCascades ?? []).find(cascade => {
      if (selector.kind === 'field') return cascade.kind === 'field' && cascade.cascadeId === selector.cascadeId
      if (cascade.kind === 'field') return false
      if (cascade.parentTable !== selector.parentTable || cascade.parentViewId !== selector.parentViewId) return false
      if (cascade.childTable !== selector.childTable || cascade.childViewId !== selector.childViewId) return false
      return selector.cascadeId === undefined || cascade.cascadeId === selector.cascadeId
    })
  }

  /**
   * 创建一条 DataView 输入级联。
   *
   * @param params 级联参数。
   * @returns 新创建的级联。
   * @throws 当级联引用非法时抛错。
   */
  createCascade(params: DataSetCrudToolCreateCascadeParams): DataViewCascade {
    const cascadeInput = this.requireViewCascade(params.cascade, 'createCascade.cascade')
    this.dataSet.addCascade(cascadeInput)
    this._afterWrite()
    const cascade = this.getCascade(cascadeInput.kind === 'field' ? {kind: 'field', cascadeId: cascadeInput.cascadeId} : {
      parentTable: cascadeInput.parentTable,
      parentViewId: cascadeInput.parentViewId,
      childTable: cascadeInput.childTable,
      childViewId: cascadeInput.childViewId,
      ...(cascadeInput.cascadeId !== undefined ? { cascadeId: cascadeInput.cascadeId } : {}),
    })
    if (!cascade) {
      throw new Error('Cascade not found after creation')
    }
    return cascade
  }

  /**
   * 更新一条 DataView 输入级联。
   *
   * @param params 级联更新参数。
   * @param parentTable 原父表名。
   * @param childTable 原子表名。
   * @param updates 级联更新内容。
   * @returns 更新后的级联。
   * @throws 当级联不存在或更新目标非法时抛错。
   */
  updateCascade(params: DataSetCrudToolUpdateCascadeParams): DataViewCascade {
    const selector = this.requireCascadeSelector(params)
    const updates = this.requireObjectArg(params.updates, 'updateCascade.updates')
    const result = this.dataSet.updateCascade(selector, updates)
    this._afterWrite()
    return result
  }

  /**
   * 删除一条 DataView 输入级联。
   *
   * @param params 级联定位参数。
   * @param parentTable 父表名。
   * @param childTable 子表名。
   * @throws 当级联不存在时抛错。
   */
  deleteCascade(params: DataViewCascadeSelector): void {
    this.dataSet.removeCascade(this.requireCascadeSelector(params))
    this._afterWrite()
  }

  // ====================
  // 内部辅助方法
  // ====================

  /**
   * 获取数据表；不存在时直接抛错。
   *
   * @param tableName 表名。
   * @returns 数据表实例。
   * @throws 当表不存在时抛错。
   */
  private getTableOrThrow(tableName: string): DataTable {
    const table = this.dataSet.getTable(tableName)
    if (!table) {
      throw new Error(`Table "${tableName}" not found in DataSet "${this.dataSetName}"`)
    }
    return table
  }

  private requireNonEmptyString(value: string | undefined, label: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${label} must be a non-empty string`)
    }
    return value
  }

  private requireObjectArg<T extends object>(value: T, label: string): T {
    if (!isRecord(value)) {
      throw new Error(`${label} must be an object`)
    }
    return value
  }

  private requireNonEmptyArray<T>(value: T[] | undefined, label: string): T[] {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error(`${label} must be a non-empty array`)
    }
    return value
  }

  private requireCascadeSelector(value: DataViewCascadeSelector): DataViewCascadeSelector {
    this.requireObjectArg(value, 'cascade selector')
    if (value.kind === 'field') {
      return {kind: 'field', cascadeId: this.requireNonEmptyString(value.cascadeId, 'cascadeId')}
    }
    return {
      parentTable: this.requireNonEmptyString(value.parentTable, 'parentTable'),
      parentViewId: this.requireNonEmptyString(value.parentViewId, 'parentViewId'),
      childTable: this.requireNonEmptyString(value.childTable, 'childTable'),
      childViewId: this.requireNonEmptyString(value.childViewId, 'childViewId'),
      ...(value.cascadeId === undefined ? {} : {cascadeId: this.requireNonEmptyString(value.cascadeId, 'cascadeId')}),
    }
  }

  private requireViewCascade(value: DataViewCascade, label: string): DataViewCascade {
    this.requireObjectArg(value, label)
    if (value.kind === 'field') return DataViewFieldCascadeDefinition.parse(value)
    const parentTable = this.requireNonEmptyString(value.parentTable, `${label}.parentTable`)
    const parentViewId = this.requireNonEmptyString(value.parentViewId, `${label}.parentViewId`)
    const childTable = this.requireNonEmptyString(value.childTable, `${label}.childTable`)
    const childViewId = this.requireNonEmptyString(value.childViewId, `${label}.childViewId`)
    const filterBindings = this.requireNonEmptyArray(
      value.filterBindings === undefined ? undefined : [...value.filterBindings],
      `${label}.filterBindings`,
    )
    return {
      ...value,
      parentTable,
      parentViewId,
      childTable,
      childViewId,
      filterBindings,
    }
  }

  private normalizeTableNameArg(
    tableNameOrParams: string | { tableName: string },
    methodName: string,
  ): string {
    return typeof tableNameOrParams === 'string'
      ? this.requireNonEmptyString(tableNameOrParams, `${methodName}.tableName`)
      : this.requireNonEmptyString(tableNameOrParams.tableName, `${methodName}.tableName`)
  }

  /**
   * 获取视图；不存在时直接抛错。
   *
   * @param tableName 表名。
   * @param viewId 视图 ID。
   * @returns 视图实例。
   * @throws 当视图不存在时抛错。
   */
  private getViewOrThrow(tableName: string, viewId = 'default'): DataView {
    const view = this.dataSet.getView(tableName, viewId)
    if (!view) {
      throw new Error(`View "${tableName}:${viewId}" not found in DataSet "${this.dataSetName}"`)
    }
    return view
  }

  /**
   * 将视图元数据应用到指定视图实例。
   *
   * @param table 视图所属数据表。
   * @param view 目标视图。
   * @param metadata 需要应用的视图元数据。
   */
  private applyViewMetadata(table: DataTable, view: DataView, metadata: Partial<ViewMetadata>): void {
    const rows = metadata.rows
    if (rows !== undefined) {
      // rows 先落到 DataView，再补齐内联 default view 的 DataTable.rows，保证视图和源数据一致。
      view.replaceRows([...rows])
      if (view.viewId === 'default' && table.api === undefined) {
        table.rows = [...rows]
      }
    }
    view.applyViewConfig(metadata)
  }

  /**
   * 将 default 视图的当前行集同步回 DataTable.rows。
   * 仅内联数据模式需要这样做；远端 API 模式下不应回写静态 rows。
   *
   * @param table 数据表。
   * @param viewId 当前操作的视图 ID。
   */
  private syncInlineDefaultRows(table: DataTable, viewId: string): void {
    if (viewId !== 'default' || table.api !== undefined) return
    const defaultView = table.getView('default')
    table.rows = [...(defaultView?.rows ?? [])]
  }

  private shouldUseRemoteBatch(table: DataTable, view: DataView): boolean {
    return table.api !== undefined && view.commitMode === 'immediate'
  }

  private async executeBatchLocal<T>(
    items: T[],
    executor: (item: T) => Promise<unknown>,
  ): Promise<CrudResult<BatchResult>> {
    const results: CrudResult[] = []
    for (const item of items) {
      try {
        const result = await executor(item)
        if (result === false) {
          results.push({ success: false, message: `Item "${String(item)}" not found` })
        } else {
          results.push(this.toCrudResult(result, true))
        }
      } catch (error) {
        results.push(this.toCrudResult(error, false))
      }
    }
    return this.toBatchCrudResult(results)
  }

  private toCrudResult(result: unknown, defaultSuccess: boolean): CrudResult {
    if (isCrudResult(result)) {
      return result
    }

    if (result instanceof Error) {
      return {
        success: false,
        error: result,
        message: result.message,
      }
    }

    return {
      success: defaultSuccess,
      ...(result !== undefined ? { data: result } : {}),
    }
  }

  private toBatchCrudResult(results: CrudResult[]): CrudResult<BatchResult> {
    const errors = results
      .map((result) => result.error)
      .filter((error): error is Error => error instanceof Error)
    const failureCount = results.filter((result) => result.success === false).length

    return {
      success: true,
      data: {
        successCount: results.length - failureCount,
        failureCount,
        results,
        errors,
      },
      ...(failureCount > 0 ? { message: `Batch completed with ${failureCount} failure(s)` } : {}),
    }
  }


  /**
   * 给数据表写入资源语义元数据。
   *
   * 这些字段只描述“资源身份”和“业务角色”，不参与运行时行为判断。
   */
  private applyTableSemanticMetadata(
    table: DataTable,
    metadata: Pick<DataSetCrudToolUpdateTableOptions, 'resourceType' | 'resourceId' | 'businessCategory'>,
    allowNull = false,
  ): void {
    if (metadata.resourceType !== undefined) {
      if (allowNull && metadata.resourceType === null) delete table.resourceType
      else if (metadata.resourceType !== null) table.resourceType = metadata.resourceType
    }
    if (metadata.resourceId !== undefined) {
      if (allowNull && metadata.resourceId === null) delete table.resourceId
      else if (metadata.resourceId !== null) table.resourceId = metadata.resourceId
    }
    if (metadata.businessCategory !== undefined) {
      if (allowNull && metadata.businessCategory === null) delete table.businessCategory
      else if (metadata.businessCategory !== null) table.businessCategory = metadata.businessCategory
    }
  }

  /**
   * 按主键在 rows 中查找单条记录。
   * 支持递归扫描树形 children 节点。
   *
   * @param rows 起始行集合。
   * @param id 主键值。
   * @param getPkKey 从单行数据中提取主键值的函数。
   * @returns 命中的行；不存在时返回 undefined。
   */
  private findRowById(
    rows: readonly DataRow[],
    id: string | number,
    getPkKey: (row: DataRow) => string | number | undefined,
  ): DataRow | undefined {
    // 使用显式队列遍历 children，避免树形结构场景遗漏深层节点。
    const stack = [...rows]
    while (stack.length > 0) {
      const row = stack.shift()
      if (!row) continue
      if (getPkKey(row) === id) return row
      const children = row['children']
      if (Array.isArray(children)) {
        stack.unshift(...children.filter(isDataRow))
      }
    }
    return undefined
  }
}
