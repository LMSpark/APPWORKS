/**
 * @module app:services/project-model-artifacts/page-data-designer
 * 职责：提供应用运行时 service 层的 page data designer 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
/**
 * DevSystem DataSet 设计器制品：JSON Schema、画布投影与 UI 状态对账。
 * 属于应用层，不属于 spark-project-model 领域包。
 */

import {
  canonicalizePageDataJson,
} from '@spark-appworks/spark-project-model'
import type {
  DataColumn,
  DataSetMetadata,
  TableMetadata,
  DataResourceRelation,
} from '@spark-appworks/spark-data'
import { withMeta } from '@spark-appworks/spark-json-document'

// ── 页面数据 JSON Schema ──────────────────────────────────

/** Page Data Editor Mode 的语义模型。 */
export type PageDataEditorMode = 'tree' | 'text' | 'table'

const knownColumnTypes = [
  'number',
  'int',
  'integer',
  'decimal',
  'float',
  'double',
  'string',
  'varchar',
  'text',
  'boolean',
  'bool',
  'date',
  'datetime',
  'time',
  'object',
  'array',
  'enum',
]
const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const aggregateTypes = ['sum', 'count', 'avg', 'min', 'max', 'join']
const dependencyTypes = ['currentRow', 'selectedRows', 'allRows', 'pagedRows']
const sortDirections = ['asc', 'desc']
const treeModes = ['flat', 'nested']
const commitModes = ['immediate', 'staged']
const resourceTypes = [
  'database-table',
  'database-view',
  'third-party-api',
  'static-data',
  'dictionary',
  'logical-view',
]
const businessCategories = ['master', 'child', 'reference']


export function canUseStructuredPageDataEditor(rawText: string): boolean {
  if (rawText.trim() === '') return false
  try {
    canonicalizePageDataJson(rawText)
    return true
  } catch {
    // canonicalize 失败 → 无法使用结构化编辑器，返回 false 让调用方降级
    return false
  }
}

export const PAGE_DATA_JSON_SCHEMA: Record<string, unknown> = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'SPARK 标准化页面数据',
  description: 'SPARK DataSet 的标准序列化结构。术语与 spark-data 运行时保持一致。',
  type: 'object',
  properties: {
    schemaVersion: withMeta('Schema 版本号', '当前 pagedata.json 使用的结构版本号。', { type: 'number' }),
    dataSetName: withMeta('DataSet 名称', '当前页面数据空间的名称。', { type: 'string' }),
    tables: withMeta('数据表集合', 'DataSet 中的全部数据表。', {
      type: 'object',
      additionalProperties: { $ref: '#/$defs/tableMetadata' },
    }),
    resourceRelations: withMeta('数据资源关系集合', '描述 DataTable 所对应数据资源之间的字段关系，不表示 UI 输入联动。', {
      type: 'array',
      items: { $ref: '#/$defs/dataResourceRelation' },
    }),
    viewCascades: withMeta('DataView 输入级联集合', '描述源 DataView 的运行状态如何通过显式字段绑定驱动目标 DataView 查询。', {
      type: 'array',
      items: { $ref: '#/$defs/dataViewCascade' },
    }),
    saveChanges: withMeta('保存策略', '描述 DataSet.saveChanges 的默认提交方式，例如走逐视图 CRUD 或后端统一事务。', {
      $ref: '#/$defs/dataSetSaveChangesConfig',
    }),
    version: withMeta('页面数据版本号', '页面数据内容本身的业务版本号，可选。', { type: 'number' }),
    pageId: withMeta('页面 ID', '当前页面配置的 pageId，可选。', { type: 'string' }),
  },
  required: ['tables'],
  additionalProperties: false,
  $defs: {
    jsonObject: withMeta('通用对象', '用于承载 headers、params、condition、crudConfig 等开放结构对象。', {
      type: 'object',
      additionalProperties: true,
    }),
    dataRow: withMeta('数据行', '表或视图中的单条行对象。键名应与列定义保持一致。', {
      type: 'object',
      additionalProperties: true,
    }),
    httpEndpoint: withMeta('HTTP 端点', '描述单个 CRUD 或树接口端点。', {
      type: 'object',
      properties: {
        url: withMeta('接口地址', '请求 URL。', { type: 'string' }),
        method: withMeta('HTTP 方法', '请求方法。', { type: 'string', enum: httpMethods }),
        headers: withMeta('请求头', '请求头键值对。', { type: 'object', additionalProperties: { type: 'string' } }),
        params: withMeta('查询参数模板', 'URL 查询参数模板。', { $ref: '#/$defs/jsonObject' }),
        pathParams: withMeta('路径参数名', '路径占位参数名数组。', { type: 'array', items: { type: 'string' } }),
        baseURL: withMeta('基础地址', '可选 API 基础地址。', { type: 'string' }),
      },
      required: ['url'],
      additionalProperties: false,
    }),
    crudApi: withMeta('CRUD API 配置', '描述每个操作对应哪个接口。', {
      type: 'object',
      properties: {
        create: { $ref: '#/$defs/httpEndpoint' },
        retrieve: { $ref: '#/$defs/httpEndpoint' },
        update: { $ref: '#/$defs/httpEndpoint' },
        delete: { $ref: '#/$defs/httpEndpoint' },
        transaction: { $ref: '#/$defs/httpEndpoint' },
        list: { $ref: '#/$defs/httpEndpoint' },
        batch: { $ref: '#/$defs/jsonObject' },
        import: { $ref: '#/$defs/httpEndpoint' },
        export: { $ref: '#/$defs/httpEndpoint' },
        node: { $ref: '#/$defs/httpEndpoint' },
        children: { $ref: '#/$defs/httpEndpoint' },
        path: { $ref: '#/$defs/httpEndpoint' },
        subtree: { $ref: '#/$defs/httpEndpoint' },
        move: { $ref: '#/$defs/httpEndpoint' },
        search: { $ref: '#/$defs/httpEndpoint' },
        nested: { $ref: '#/$defs/httpEndpoint' },
        nestedSearch: { $ref: '#/$defs/httpEndpoint' },
      },
      additionalProperties: false,
    }),
    dataSetSaveChangesConfig: withMeta('DataSet 保存策略', '描述 DataSet.saveChanges 默认采用的提交方式。transaction 模式会把 staged 变更提交到统一事务端点。', {
      type: 'object',
      properties: {
        mode: withMeta('提交模式', 'perView 为逐视图 CRUD；transaction 为统一事务提交。', { type: 'string', enum: ['perView', 'transaction'] }),
        transaction: { $ref: '#/$defs/dataSetTransactionConfig' },
      },
      additionalProperties: false,
    }),
    dataSetTransactionConfig: withMeta('统一事务配置', '描述 DataSet.saveChanges(transaction) 使用的后端事务端点与可选幂等请求号。', {
      type: 'object',
      properties: {
        endpoint: { $ref: '#/$defs/httpEndpoint' },
        requestId: withMeta('幂等请求号', '可选。重复提交相同 requestId 和相同 operations 时，后端应 replay 已提交结果。', { type: 'string' }),
      },
      required: ['endpoint'],
      additionalProperties: false,
    }),
    aggregateColumnConfig: withMeta('聚合列配置', '描述 aggregateResult / selectionAggregateResult 的聚合方式。', {
      type: 'object',
      properties: {
        type: withMeta('聚合类型', '聚合类型。', { type: 'string', enum: aggregateTypes }),
        field: withMeta('源字段名', '聚合来源字段名。', { type: 'string' }),
        label: withMeta('展示标题', '聚合结果的 UI 展示标题。', { type: 'string' }),
        separator: withMeta('拼接分隔符', 'join 聚合时使用的分隔符。', { type: 'string' }),
      },
      required: ['type'],
      additionalProperties: false,
    }),
    sortField: withMeta('排序字段', '描述单个排序字段与方向。', {
      type: 'object',
      properties: {
        field: withMeta('字段名', '参与排序的字段名。', { type: 'string' }),
        direction: withMeta('排序方向', '排序方向。', { type: 'string', enum: sortDirections }),
      },
      required: ['field'],
      additionalProperties: false,
    }),
    treeConfig: withMeta('树配置', '描述视图树形结构。', {
      type: 'object',
      properties: {
        idField: { type: 'string' },
        parentIdField: { type: 'string' },
        textField: { type: 'string' },
        depthLimit: { type: 'number' },
        lazy: { type: 'boolean' },
        treeMode: { type: 'string', enum: treeModes },
      },
      additionalProperties: false,
    }),
    dataColumn: withMeta('数据列定义', '描述数据结构与渲染元信息。', {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: knownColumnTypes },
        label: { type: 'string' },
        allowDBNull: { type: 'boolean' },
        defaultValue: {},
        isPrimaryKey: { type: 'boolean' },
        autoIncrement: { type: 'boolean' },
        isComputed: { type: 'boolean' },
        required: { type: 'boolean' },
        minLength: { type: 'number' },
        maxLength: { type: 'number' },
        min: { type: 'number' },
        max: { type: 'number' },
        pattern: { type: 'string' },
        patternMessage: { type: 'string' },
        computeExpression: { type: 'string' },
      },
      required: ['name', 'type'],
      additionalProperties: false,
    }),
    viewMetadata: withMeta('视图元数据', '描述 DataView 的运行配置。', {
      type: 'object',
      properties: {
        tableName: { type: 'string' },
        viewId: { type: 'string' },
        rows: { type: 'array', items: { $ref: '#/$defs/dataRow' } },
        filterExpression: { $ref: '#/$defs/jsonObject' },
        sortExpression: { type: 'array', items: { $ref: '#/$defs/sortField' } },
        autoCurrentFirst: { type: 'boolean' },
        autoSelectFirst: { type: 'boolean' },
        page: { type: 'number' },
        pageSize: { type: 'number' },
        treeConfig: { $ref: '#/$defs/treeConfig' },
        valueField: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        labelField: { type: 'string' },
        selectionDelimiter: { type: 'string' },
        autoLoad: { type: 'boolean' },
        commitMode: { type: 'string', enum: commitModes },
        aggregates: { type: 'object', additionalProperties: { $ref: '#/$defs/aggregateColumnConfig' } },
      },
      additionalProperties: false,
    }),
    dataResourceRelationFieldMapping: withMeta('数据资源字段映射', '描述父数据资源字段与子数据资源字段的对应关系。', {
      type: 'object',
      properties: {
        parentResourceField: { type: 'string' },
        childResourceField: { type: 'string' },
      },
      required: ['parentResourceField', 'childResourceField'],
      additionalProperties: false,
    }),
    dataResourceRelation: withMeta('数据资源关系', '描述两个 DataTable 所对应数据资源之间的字段关系；不承担 DataView 输入级联。', {
      type: 'object',
      properties: {
        relationId: { type: 'string' },
        sourceRelationId: { type: 'string' },
        relationName: { type: 'string' },
        parentTable: { type: 'string' },
        childTable: { type: 'string' },
        childField: { type: 'string' },
        parentField: { type: 'string' },
        fieldMappings: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/dataResourceRelationFieldMapping' },
        },
        condition: { $ref: '#/$defs/jsonObject' },
        cascadeUpdate: { type: 'boolean' },
        cascadeDelete: { type: 'boolean' },
      },
      required: ['parentTable', 'childTable'],
      additionalProperties: false,
    }),
    dataViewCascadeFilterBinding: withMeta('DataView 过滤绑定', '把源 DataView 行字段绑定为目标 DataView 的查询过滤字段。', {
      type: 'object',
      properties: {
        sourceField: { type: 'string' },
        targetField: { type: 'string' },
      },
      required: ['sourceField', 'targetField'],
      additionalProperties: false,
    }),
    dataViewCascade: withMeta('DataView 输入级联', '描述两个明确 DataView 之间的运行时输入级联，不从数据资源关系自动推导。', {
      type: 'object',
      properties: {
        cascadeId: { type: 'string' },
        sourceRelationId: { type: 'string' },
        parentTable: { type: 'string' },
        parentViewId: { type: 'string' },
        childTable: { type: 'string' },
        childViewId: { type: 'string' },
        filterBindings: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/dataViewCascadeFilterBinding' },
        },
        dependencyType: { type: 'string', enum: dependencyTypes },
        autoLoad: { type: 'boolean' },
      },
      required: ['parentTable', 'parentViewId', 'childTable', 'childViewId', 'filterBindings'],
      additionalProperties: false,
    }),
    tableMetadata: withMeta('数据表元数据', '描述一张表的列、资源语义、API 与视图配置。', {
      type: 'object',
      properties: {
        tableName: { type: 'string' },
        columns: { type: 'array', items: { $ref: '#/$defs/dataColumn' } },
        resourceType: { type: 'string', enum: resourceTypes },
        resourceId: { type: 'string' },
        businessCategory: { type: 'string', enum: businessCategories },
        api: { $ref: '#/$defs/crudApi' },
        crudConfig: { $ref: '#/$defs/jsonObject' },
        views: {
          type: 'object',
          properties: {
            default: { $ref: '#/$defs/viewMetadata' },
          },
          required: ['default'],
          additionalProperties: { $ref: '#/$defs/viewMetadata' },
        },
      },
      required: ['columns', 'views'],
      additionalProperties: false,
    }),
  },
}

// ── DataSet 设计器投影 ────────────────────────────────────

/** Designer Column Projection 的语义模型。 */
export type DesignerColumnProjection = DataColumn & {
    /** 列在画布中的唯一标识（跨对账保持稳定）。 */
id: string
}

/** Designer Table Projection 的语义模型。 */
export type DesignerTableProjection = Omit<TableMetadata, 'columns'> & {
    /** 表在画布中的唯一标识（跨对账保持稳定）。 */
id: string
    /** 画布 X 坐标（像素）。 */
x: number
    /** 画布 Y 坐标（像素）。 */
y: number
    /** 列定义集合（带画布 ID）。 */
columns: DesignerColumnProjection[]
}

/** Designer Relation Projection 的语义模型。 */
export type DesignerRelationProjection = DataResourceRelation & {
    /** 关系类型：one-to-many（默认）/ one-to-one / many-to-many。 */
relationType?: 'one-to-many' | 'one-to-one' | 'many-to-many'
}

/** Designer Table Ui State 的运行状态。 */
export type DesignerTableUiState = {
    /** 表在画布中的唯一标识。 */
id: string
    /** 画布 X 坐标（像素）。 */
x: number
    /** 画布 Y 坐标（像素）。 */
y: number
    /** 列名到列 ID 的映射（跨对账保持列标识稳定）。 */
columnIds: Record<string, string>
}

/** Layout For New Table 的语义模型。 */
type LayoutForNewTable = (tableName: string, newIndex: number) => { x: number; y: number }

/** Designer Table Ui State Reconcile Input 的输入数据。 */
export type DesignerTableUiStateReconcileInput = Readonly<{
  /** 目标 DataSet 元数据，包含 tables / resourceRelations / layout 等完整定义。 */
  metadata: DataSetMetadata
  /** 当前画布中已有的表投影快照，用于保留已有 ID 和坐标。 */
  currentTables: ReadonlyArray<Pick<DesignerTableProjection, 'tableName' | 'id' | 'x' | 'y' | 'columns'>>
  /** 生成唯一 ID 的工厂函数（通常为 nanoid 或 uuid）。 */
  createId: () => string
  /** 新增表的布局策略回调；缺省使用 3 列网格自动定位。 */
  layoutForNewTable?: LayoutForNewTable | undefined
}>

function getDefaultTablePosition(index: number): { x: number; y: number } {
  return {
    x: 50 + (index % 3) * 220,
    y: 50 + Math.floor(index / 3) * 200,
  }
}

export function reconcileDesignerTableUiState(input: DesignerTableUiStateReconcileInput): Record<string, DesignerTableUiState> {
  const { metadata, currentTables, createId, layoutForNewTable } = input
  const oldByName = new Map(currentTables.map(table => [table.tableName, table]))
  const persistedPositions = metadata.layout?.tablePositions
  const nextUiState: Record<string, DesignerTableUiState> = {}
  let newTableCount = 0

  Object.entries(metadata.tables).forEach(([tableName, tableConfig], idx) => {
    const oldTable = oldByName.get(tableName)
    const oldColumnIdMap = new Map((oldTable?.columns ?? []).map(col => [col.name, col.id]))
    const defaultLayout = getDefaultTablePosition(idx)
    const newLayout = layoutForNewTable?.(tableName, newTableCount) ?? defaultLayout
    const persistedLayout = persistedPositions?.[tableName]
    if (!oldTable) newTableCount += 1

    nextUiState[tableName] = {
      id: oldTable?.id ?? createId(),
      x: persistedLayout?.x ?? oldTable?.x ?? newLayout.x,
      y: persistedLayout?.y ?? oldTable?.y ?? newLayout.y,
      columnIds: Object.fromEntries(
        tableConfig.columns.map((column) => [column.name, oldColumnIdMap.get(column.name) ?? createId()]),
      ),
    }
  })

  return nextUiState
}

export function projectDesignerTables(
  metadata: DataSetMetadata,
  tableUiState: Record<string, DesignerTableUiState>,
  createId: () => string,
): DesignerTableProjection[] {
  return Object.entries(metadata.tables).map(([tableName, tableConfig], idx) => {
    const uiState = tableUiState[tableName]
    const persistedLayout = metadata.layout?.tablePositions?.[tableName]
    const defaultLayout = getDefaultTablePosition(idx)
    const columnIds = uiState?.columnIds ?? {}

    return {
      id: uiState?.id ?? createId(),
      x: uiState?.x ?? persistedLayout?.x ?? defaultLayout.x,
      y: uiState?.y ?? persistedLayout?.y ?? defaultLayout.y,
      ...tableConfig,
      columns: tableConfig.columns.map((column) => ({
        id: columnIds[column.name] ?? createId(),
        ...column,
      })),
    }
  })
}

export function projectDesignerRelations(metadata: DataSetMetadata): DesignerRelationProjection[] {
  return (metadata.resourceRelations ?? []).map((rel) => ({
    ...rel,
    relationType: 'one-to-many',
  }))
}

export function buildDataSetMetadataFromDesignerProjection(params: {
  dataSetName: string
  tables: readonly DesignerTableProjection[]
  relations: readonly DesignerRelationProjection[]
  viewCascades?: NonNullable<DataSetMetadata['viewCascades']>
}): DataSetMetadata {
  const tablesObj: Record<string, TableMetadata> = {}
  const tablePositions: Record<string, { x: number; y: number }> = {}

  for (const table of params.tables) {
    const { id: _id, x: _x, y: _y, columns: designerCols, ...tableRest } = table
    const columns: DataColumn[] = designerCols.map(({ id: _cid, ...col }) => col)
    tablesObj[table.tableName] = { ...tableRest, columns }
    tablePositions[table.tableName] = { x: table.x, y: table.y }
  }

  return {
    dataSetName: params.dataSetName,
    tables: tablesObj,
    resourceRelations: params.relations.map((rel) => ({
      ...(rel.relationId !== undefined ? { relationId: rel.relationId } : {}),
      ...(rel.sourceRelationId !== undefined ? { sourceRelationId: rel.sourceRelationId } : {}),
      parentTable: rel.parentTable,
      childTable: rel.childTable,
      ...(rel.parentField !== undefined ? { parentField: rel.parentField } : {}),
      ...(rel.childField !== undefined ? { childField: rel.childField } : {}),
      ...(rel.fieldMappings !== undefined ? { fieldMappings: rel.fieldMappings } : {}),
      ...(rel.relationName !== undefined ? { relationName: rel.relationName } : {}),
      ...(rel.condition !== undefined ? { condition: rel.condition } : {}),
      ...(rel.cascadeUpdate !== undefined ? { cascadeUpdate: rel.cascadeUpdate } : {}),
      ...(rel.cascadeDelete !== undefined ? { cascadeDelete: rel.cascadeDelete } : {}),
    })),
    ...(params.viewCascades !== undefined ? { viewCascades: params.viewCascades } : {}),
    layout: { tablePositions },
  }
}

export function hasDesignerProjectionChanges(current: DataSetMetadata, persisted: DataSetMetadata | null): boolean {
  if (!persisted) {
    return Object.keys(current.tables).length > 0 || (current.resourceRelations?.length ?? 0) > 0
  }

  if (current === persisted) return false

  return !isEqualComparableMetadata(
    normalizeDesignerComparableMetadata(current),
    normalizeDesignerComparableMetadata(persisted),
  )
}

function isEqualComparableMetadata(a: DataSetMetadata, b: DataSetMetadata): boolean {
  if (a.dataSetName !== b.dataSetName) return false

  const aTableKeys = Object.keys(a.tables)
  const bTableKeys = Object.keys(b.tables)
  if (aTableKeys.length !== bTableKeys.length) return false
  for (const key of aTableKeys) {
    const at = a.tables[key]
    const bt = b.tables[key]
    if (!at || !bt) return false
    if (!isEqualTableMetadata(at, bt)) return false
  }

  const aRels = a.resourceRelations ?? []
  const bRels = b.resourceRelations ?? []
  if (aRels.length !== bRels.length) return false
  for (let i = 0; i < aRels.length; i++) {
    const ar = aRels[i]
    const br = bRels[i]
    if (!ar || !br) return false
    if (!isEqualRelation(ar, br)) return false
  }

  if (!isEqualViewDeps(a.viewCascades, b.viewCascades)) return false

  const aPos = a.layout?.tablePositions
  const bPos = b.layout?.tablePositions
  if (aPos && bPos) {
    const aKeys = Object.keys(aPos)
    const bKeys = Object.keys(bPos)
    if (aKeys.length !== bKeys.length) return false
    for (const key of aKeys) {
      const ap = aPos[key]
      const bp = bPos[key]
      if (ap?.x !== bp?.x || ap?.y !== bp?.y) return false
    }
  } else if (aPos !== bPos) {
    return false
  }

  return true
}

function isEqualTableMetadata(a: TableMetadata, b: TableMetadata): boolean {
  if (a.tableName !== b.tableName) return false
  if (a.resourceType !== b.resourceType) return false
  if (a.resourceId !== b.resourceId) return false
  if (a.businessCategory !== b.businessCategory) return false

  const aCols = a.columns
  const bCols = b.columns
  if (aCols.length !== bCols.length) return false
  for (let i = 0; i < aCols.length; i++) {
    const ac = aCols[i]
    const bc = bCols[i]
    if (!ac || !bc) return false
    if (!isEqualColumn(ac, bc)) return false
  }

  if (!isEqualObject(a.api, b.api)) return false
  if (!isEqualObject(a.views, b.views)) return false

  return true
}

function isEqualColumn(a: DataColumn, b: DataColumn): boolean {
  return (
    a.name === b.name &&
    a.type === b.type &&
    a.label === b.label &&
    a.allowDBNull === b.allowDBNull &&
    a.isPrimaryKey === b.isPrimaryKey &&
    isEqualObject(a.defaultValue, b.defaultValue)
  )
}

function isEqualRelation(a: DataResourceRelation, b: DataResourceRelation): boolean {
  return (
    a.relationId === b.relationId &&
    a.sourceRelationId === b.sourceRelationId &&
    a.parentTable === b.parentTable &&
    a.childTable === b.childTable &&
    a.parentField === b.parentField &&
    a.childField === b.childField &&
    isEqualObject(a.fieldMappings, b.fieldMappings) &&
    a.relationName === b.relationName &&
    a.condition === b.condition &&
    a.cascadeUpdate === b.cascadeUpdate &&
    a.cascadeDelete === b.cascadeDelete
  )
}

function isViewDepArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value)
}

function isEqualViewDeps(
  a: DataSetMetadata['viewCascades'],
  b: DataSetMetadata['viewCascades'],
): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  if (!isViewDepArray(a) || !isViewDepArray(b)) return false
  return isEqualArray(a, b)
}

function getObjectEntries(value: object): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = []
  for (const key of Object.keys(value)) {
    const desc = Object.getOwnPropertyDescriptor(value, key)
    if (desc) entries.push([key, desc.value])
  }
  return entries
}

function isEqualObject(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || a === undefined || b === null || b === undefined) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) return isEqualArray(a, b)
  const aEntries = getObjectEntries(a)
  const bEntries = getObjectEntries(b)
  if (aEntries.length !== bEntries.length) return false
  const bMap = new Map(bEntries)
  for (const [key, aVal] of aEntries) {
    if (!bMap.has(key) || !isEqualObject(aVal, bMap.get(key))) return false
  }
  return true
}

function isEqualArray(a: unknown[] | undefined, b: unknown[] | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!isEqualObject(a[i], b[i])) return false
  }
  return true
}

function normalizeDesignerComparableMetadata(metadata: DataSetMetadata): DataSetMetadata {
  const rest = { ...metadata }
  delete rest.pageId
  const tableEntries = Object.entries(metadata.tables)
  const tablePositions = Object.fromEntries(
    tableEntries.map(([tableName], index) => [
      tableName,
      metadata.layout?.tablePositions?.[tableName] ?? getDefaultTablePosition(index),
    ]),
  )

  return {
    ...rest,
    resourceRelations: metadata.resourceRelations ?? [],
    ...(tableEntries.length > 0
      ? {
          layout: {
            ...(metadata.layout ?? {}),
            tablePositions,
          },
        }
      : {}),
  }
}
