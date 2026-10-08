/**
 * @module @spark-appworks/spark-data:types
 * 职责：定义数据行、模型绑定、表与视图元数据、资源关系、输入级联和保存协议。
 * 边界：保持框架和后端无关，查询输入与私有权限保存上下文分离，不承载页面调用生命周期。
 * AI用途：确认数据配置与运行消费的边界，以及单场景多视图的序列化形状。
 */
/**
 * @packageDocumentation
 * SPARK 数据空间类型定义 —— 数据模型、视图、权限、过滤/排序、关系、树的唯一类型源。
 *
 * 类型分组（按数据从底层结构到顶层数据集的消费流顺序）：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 1. 基础数据行 / 事件发射器   DataRow, SparkEventEmitter        │
 * │ 2. 列类型系统               ColumnType, ColumnTypeMap, DataColumn │
 * │ 3. 表语义元数据             TableResourceType, TableBusinessCategory │
 * │ 4. 权限快照                DataPermissionSnapshot                  │
 * │ 5. 树 API 端点             TreeApi, HttpEndpoint                 │
 * │ 6. 表级元数据              TableMetadata, CrudApi                │
 * │ 7. 过滤 & 排序             DataViewFilterTree, SortExpression      │
 * │ 8. 视图级元数据            ViewMetadata, AggregateType           │
 * │ 9. 树结构配置             TreeConfig, 树节点类型                 │
 * │ 10. 资源关系 & 视图级联    DataResourceRelation, DataViewCascade       │
 * │ 11. 请求状态 & 提交模式     RequestState, CommitMode             │
 * │ 12. 数据集元数据           DataSetMetadata, DataSetLayoutMetadata │
 * │ 13. 数据源契约             DataSource, ViewChangeHandlers         │
 * │ 14. 数据集合同             DataSetContract                       │
 * │ 15. 保存 & 事务类型        DataSetSaveChanges* 系列              │
 * │ 16. CRUD 服务类型          CrudResult, QueryParams, BatchResult, CrudOperationConfig │
 * └──────────────────────────────────────────────────────────────┘
 */

import type { DataViewFilterTree } from './query/filter/data-view-filter-contract'
import type { DataTable } from './data-table'
import type { DataView } from './data-view'
import type { LoggerApi, Method } from '@spark-appworks/spark-utils'

// ═══════════════════════════════════════════════════════
// 1. 基础数据行 & 事件发射器
//
// 所有数据容器中最底层的行结构和事件机制。
// ═══════════════════════════════════════════════════════

/** 事件发射器：DataSet/DataView 内部使用的最小事件接口 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SparkEventEmitter<TEventMap extends Record<string, any[]> = Record<string, any[]>> = {
  /** 订阅指定事件；同一 handler 可重复注册，每次 emit 都会调用 */
  on<K extends string & keyof TEventMap>(event: K, handler: (...args: TEventMap[K]) => void): void
  /** 取消订阅指定事件的指定 handler；必须与 on 传入的是同一函数引用 */
  off<K extends string & keyof TEventMap>(event: K, handler: (...args: TEventMap[K]) => void): void
  /** 同步触发指定事件，按注册顺序调用所有 handler */
  emit<K extends string & keyof TEventMap>(event: K, ...args: TEventMap[K]): void
  /** 移除指定事件的所有 handler；省略 event 时移除全部事件的所有 handler */
  removeAllListeners<K extends string & keyof TEventMap>(event?: K): void
  /** 返回指定事件当前注册的 handler 数量；省略 event 时返回所有事件 handler 总数 */
  listenerCount<K extends string & keyof TEventMap>(event?: K): number}

/** 数据行：所有数据容器的基本行形状，可选携带 lowcode 后端权限事实。 */
export type DataRow = Record<string, unknown> & {
  /** lowcode 后端对当前行计算出的五个稀疏权限集合。 */
  lingma_sys_params?: DataPermissionSets
  /** lowcode 后端签发的当前行防篡改上下文。 */
  lingma_sys_key?: string
}

// ═══════════════════════════════════════════════════════
// 2. 列类型系统
//
// 描述 DataTable 中每一列的值类型、验证属性和渲染元数据。
// 类型映射 → 列定义 → 计算列，是数据模型的最小构建块。
// ═══════════════════════════════════════════════════════

/**
 * 列类型字面量联合——涵盖 DataValidator 中所有已知类型。
 *
 * 末尾的 `(string & {})` 保持对自定义类型的开放性，同时不影响已知值的自动补全。
 */
export type ColumnType =
  // 数字类
  | 'number' | 'int' | 'integer' | 'decimal' | 'float' | 'double'
  // 字符串类
  | 'string' | 'varchar' | 'text'
  // 布尔
  | 'boolean' | 'bool'
  // 日期
  | 'date' | 'datetime' | 'time'
  // 复合
  | 'object' | 'array'
  // 枚举
  | 'enum'
  // 自定义扩展（保留开放，不影响已知值提示）
  | (string & {})

/** ColumnType → TypeScript 类型映射表，用于泛型推断和类型匹配 */
export type ColumnTypeMap = {
  // 数字类
  /** 通用数字列值。 */
  number: number
  /** 整数列值。 */
  int: number
  /** 整数列值的完整写法。 */
  integer: number
  /** 十进制数字列值。 */
  decimal: number
  /** 单精度浮点列值。 */
  float: number
  /** 双精度浮点列值。 */
  double: number
  // 字符串类
  /** 通用字符串列值。 */
  string: string
  /** 变长字符串列值。 */
  varchar: string
  /** 长文本列值。 */
  text: string
  // 布尔
  /** 布尔列值。 */
  boolean: boolean
  /** 布尔列值的短写。 */
  bool: boolean
  // 日期
  /** 日期列值，允许 Date 或 ISO 日期字符串。 */
  date: Date | string
  /** 日期时间列值，允许 Date 或 ISO 日期时间字符串。 */
  datetime: Date | string
  /** 时间列值。 */
  time: string
  // 复合
  /** 对象列值。 */
  object: Record<string, unknown>
  /** 数组列值。 */
  array: unknown[]
  // 枚举
  /** 枚举列值。 */
  enum: string | number
}

/**
 * 根据 ColumnType 字符串推断对应的 TypeScript 值类型。
 *
 * @example
 * ```ts
 * type T = InferColumnValue<'number'>  // number
 * type S = InferColumnValue<'date'>    // Date | string
 * type U = InferColumnValue<'json'>    // unknown（未注册到 ColumnTypeMap）
 * ```
 */
export type InferColumnValue<T extends ColumnType> =
  T extends keyof ColumnTypeMap ? ColumnTypeMap[T] : unknown

/** 计算列函数签名：接收当前行，返回计算值 */
export type ComputedColumnFn = {
  (row: DataRow): unknown}

/**
 * 数据列定义
 *
 * 分为两个部分：
 * - **数据属性**（name, type, isPrimaryKey, ...）：描述数据结构，供校验 / 计算列 / CRUD 使用
 * - **渲染属性**（label, visible, editable, ...）：描述 UI 呈现方式，供表格 / 表单组件消费
 *
 * 渲染属性均为可选，不影响纯数据层使用。
 * UI 组件通过 `DataSource.columns` 或 `DataView.columns` 读取列元数据。
 */
export type DataColumn = {
  /** 列名称 */
  name: string
  /**
   * 列值类型。已知类型见 `ColumnType`；未知业务类型按 unknown 处理。
   *
   * 常用值：`'string'` | `'number'` | `'boolean'` | `'date'` | `'datetime'`
   */
  type: ColumnType
  /** 列标题（UI 表头 / 表单标签 / 描述列标题）。未设置时 UI 回退到 `name` */
  label?: string
  /** 是否允许数据库 NULL 值 */
  allowDBNull?: boolean
  /** 默认值 */
  defaultValue?: unknown
  /** 是否为主键字段 */
  isPrimaryKey?: boolean
  /** 是否自增 */
  autoIncrement?: boolean

  /**
   * 是否为框架计算列（如 `_pk`）。
   *
   * 计算列的值由框架自动维护，不参与序列化（`DataTable.toJson()` 自动排除）。
   * UI 组件可通过 `columns.filter(c => !c.isComputed)` 获取用户定义列。
   */
  isComputed?: boolean

  // ── 验证属性 ──
  // 字段级验证元数据，UI 层通过 DataView.columns 读取并自动生成表单验证规则。
  // spark-data 保持框架无关，验证规则到 Element Plus FormItemRule 的转换由渲染层完成。

  /**
   * UI 必填标记。
   *
   * - `true`：表单中必填（生成 required 验证规则）
   * - 未设置时回退到 `!allowDBNull`（allowDBNull 显式为 false 也视为必填）
   */
  required?: boolean
  /** 字符串最小长度（仅 type 为 string 系列时生效） */
  minLength?: number
  /** 字符串最大长度（仅 type 为 string 系列时生效） */
  maxLength?: number
  /** 数值最小值（仅 type 为 number 系列时生效） */
  min?: number
  /** 数值最大值（仅 type 为 number 系列时生效） */
  max?: number
  /**
   * 正则校验模式（字符串形式，运行时编译为 RegExp）。
   *
   * @example `"^[\\w.-]+@[\\w.-]+\\.\\w+$"`
   */
  pattern?: string
  /** 正则校验失败时的自定义提示消息。未设置时使用默认提示 */
  patternMessage?: string

  // ── 计算字段属性 ──

  /**
   * 计算列表达式（JS 表达式字符串）。
   *
   * 行字段直接引用（无需前缀），外部上下文通过 `ctx` 对象引用，
   * 子表聚合通过 `$sum` / `$count` / `$avg` / `$min` / `$max` / `$list` / `$join` 函数。
   * 当前源码按 DataResourceRelation 的 `childTable` 匹配子资源 default 视图。
   * 计算列先于 `view.aggregates` 求值，因此视图级聚合可以聚合计算列。
   *
   * @example
   * `"price * qty"`
   * `"firstName + ' ' + lastName"`
   * `"ctx.taxRate ? amount * ctx.taxRate : amount"`
   * `"$sum('OrderItems', 'amount')"`
   * `"$count('OrderItems')"`
   * `"$join('Tags', 'name', ' | ')"`
   */
  computeExpression?: string}

// ═══════════════════════════════════════════════════════
// 3. 表语义元数据
//
// 描述 DataTable 的"资源身份"和"业务角色"，不参与运行时行为，
// 是给 AI 规划、管理后台、建模工具、导出元数据时消费的语义标签。
// ═══════════════════════════════════════════════════════

/**
 * 表资源类型——标记该表背后对应的资源来源或承载形态。
 *
 * 推荐值：
 * - `database-table`   — 直接映射数据库表
 * - `database-view`    — 直接映射数据库视图
 * - `third-party-api`  — 数据由外部第三方 API 提供
 * - `static-data`      — 数据以内联/本地静态资源形式存在（唯一允许直接声明 rows 的资源类型）
 * - `dictionary`       — 明确对应字典/枚举/选项型资源
 * - `logical-view`     — 应用层拼装出的逻辑视图/投影视图
 *
 * 保留 `(string & {})` 扩展口，允许业务侧继续定义更细的资源类型。
 */
export type TableResourceType =
  | 'database-table'
  | 'database-view'
  | 'third-party-api'
  | 'static-data'
  | 'dictionary'
  | 'logical-view'
  | (string & {})

/** 表资源类型推荐值列表，供建模工具和校验使用 */
export const TABLE_RESOURCE_TYPE_RECOMMENDED_VALUES: readonly TableResourceType[] = [
  'database-table',
  'database-view',
  'third-party-api',
  'static-data',
  'dictionary',
  'logical-view',
]

/**
 * 表业务分类——标记当前表在业务模型中的角色。
 *
 * 推荐值：
 * - `master`    — 主表
 * - `child`     — 从表 / 明细表
 * - `reference` — 引用表 / 参考表 / 查找表
 */
export type TableBusinessCategory =
  | 'master'
  | 'child'
  | 'reference'
  | (string & {})

/** 表业务分类推荐值列表 */
export const TABLE_BUSINESS_CATEGORY_RECOMMENDED_VALUES: readonly TableBusinessCategory[] = [
  'master',
  'child',
  'reference',
]

/** 表绑定的后端模型身份；modelName 是查询用的模型 Name，不是物理资源名。 */
export type TableModelBinding = Readonly<{
  modelId: string
  modelName: string
}>

/** 表级语义元数据接口，组合资源类型、资源 ID 和业务分类 */
export type TableSemanticMetadata = {
  /** 资源类型：决定该表是否允许直接声明静态 rows */
  resourceType?: TableResourceType
  /** 资源 ID：对应外部系统中的稳定标识，如库表名、字典编码、第三方资源编码或静态资源标识 */
  resourceId?: string
  /** 模型绑定：该表对应的后端模型；未绑定的本地表不声明 */
  modelBinding?: TableModelBinding
  /** 业务分类：标记当前表在业务模型中的角色 */
  businessCategory?: TableBusinessCategory}

// ═══════════════════════════════════════════════════════
// 4. 权限快照
//
// 权限由 lowcode 后端一次性计算并返回；前端只渲染和构造受约束的 mutation。
// ═══════════════════════════════════════════════════════

/** 字段可见性枚举 */
export enum FieldVisibility {
    /** Visible 字段。 */
Visible = 'visible',
    /** Masked 字段。 */
Masked = 'masked',
    /** Hidden 字段。 */
Hidden = 'hidden'
}

/** 组件级别枚举 */
export enum ComponentLevel {
    /** Model 字段。 */
Model = 'model',
    /** Instance 字段。 */
Instance = 'instance',
    /** Field 字段。 */
Field = 'field'
}

// ═══════════════════════════════════════════════════════
// 5. HTTP 端点 & 树 API
//
// 定义树操作端点族，是 CRUD API 中树相关部分的基接口。
// ═══════════════════════════════════════════════════════

/** HTTP 端点定义，描述一个 API 请求的完整元数据 */
export type HttpEndpoint = {
  /** 请求 URL */
  url: string
  /** HTTP 方法（复用 spark-utils Method，禁止再内联联合） */
  method?: Method
  /** 请求头 */
  headers?: Record<string, string>
  /** URL 查询参数 */
  params?: Record<string, unknown>
  /** URL 路径参数模板字段列表 */
  pathParams?: string[]
  /** API 基础地址 */
  baseURL?: string
}

/**
 * 树操作端点配置——flat/nested 双模式成套接口族。
 *
 * 每个端点均继承 `HttpEndpoint`，`url` 中可使用 `{id}`、`{parentId}` 等路径占位符。
 * flat 模式（node/children/path/subtree/move/search）与 nested 模式（nested/nestedSearch）可按需配置，互不依赖。
 */
export type TreeApi = {
  /** /tree/node — 获取单节点详情，params: id */
  node?: HttpEndpoint
  /** /tree/children — 获取直接子节点列表，params: parentId, limit? */
  children?: HttpEndpoint & {
    /** 最大返回子节点数，防止宽度爆炸 */
    limit?: number
  }
  /** /tree/path — 获取祖先链 ID 列表，params: id，response: { pathIds: string[] } */
  path?: HttpEndpoint
  /** /tree/subtree — 差量补齐路径区间（expandToNode 使用），params: fromId, toId, includeTargetChildren? */
  subtree?: HttpEndpoint & {
    /** 是否包含目标节点的直接子节点（默认 true） */
    includeTargetChildren?: boolean
  }
  /** /tree/move — 移动节点到新父节点下，params/body: id, newParentId?, index? */
  move?: HttpEndpoint
  /** /tree/search — 扁平模式搜索（返回匹配节点 + pathIds），params: keyword, limit? */
  search?: HttpEndpoint & {
    /** 最大返回匹配节点数，防止搜索结果过大 */
    limit?: number
  }
  /** /tree/nested — 获取嵌套层级树，params: rootId?, depthLimit?, limit?，response: NestedTreeNode[] */
  nested?: HttpEndpoint & {
    /** 最大递归深度，用于限制嵌套树展开层级 */
    depthLimit?: number
    /** 最大返回节点数，用于限制嵌套树总体体量 */
    limit?: number
  }
  /** /tree/nested/search — 层次模式搜索（返回匹配节点 + 嵌套祖先链），params: keyword, limit? */
  nestedSearch?: HttpEndpoint & {
    /** 最大返回匹配节点数，防止层次搜索结果过大 */
    limit?: number
  }}

// ═══════════════════════════════════════════════════════
// 6. 表级元数据 & CRUD API
//
// TableMetadata 是 DataTable 的序列化形状，描述列、API、视图集合。
// ═══════════════════════════════════════════════════════

/**
 * CRUD 操作到端点的映射定义。
 *
 * 语义：描述"每个操作对应哪个接口"。
 * 这里只定义各 CRUD / Tree 操作对应的 URL、HTTP 方法和端点级参数，不包含重试、校验、转换等运行策略。
 */
export type CrudApi = TreeApi & {
  /** 创建单条记录 */
  create?: HttpEndpoint
  /** 拉取单条记录 */
  retrieve?: HttpEndpoint & {
    /** 拉取选项 */
    options?: RetrieveRecordOptions
  }
  /** 更新单条记录 */
  update?: HttpEndpoint
  /** 删除单条记录 */
  delete?: HttpEndpoint
  /** 事务提交端点（一次请求包含多个 CRUD 操作） */
  transaction?: HttpEndpoint
  /** 列表查询端点 */
  list?: HttpEndpoint & {
    /** 分页配置 */
    pagination?: {
      /** 页码参数名 */
      pageParam?: string
      /** 每页大小参数名 */
      sizeParam?: string
      /** 排序参数名 */
      sortParam?: string
    }
  }
  /** 批量操作端点组 */
  batch?: {
    /** 批量创建 */
    create?: HttpEndpoint
    /** 批量更新 */
    update?: HttpEndpoint
    /** 批量删除 */
    delete?: HttpEndpoint
  }
  /** 导入端点 */
  import?: HttpEndpoint
  /** 导出端点 */
  export?: HttpEndpoint}

/** 单条记录拉取选项 */
export type RetrieveRecordOptions = {
  /** 是否将拉取结果同步回本地 rows。默认 true */
  syncToRows?: boolean
  /** 是否将拉取结果设为当前行。默认 false */
  setCurrentRow?: boolean}

/**
 * 表级元数据（对应 DataTable 核）
 *
 * 表级关注点：表名、列定义、CRUD API、CRUD 配置和视图集合。
 * 以实体序列化结果 `DataTable.toJson()` 为准：
 * - 所有默认视图字段均必须进入 `views.default`
 * - 表级不再承载 `rows / autoCurrentFirst / autoSelectFirst / page / pageSize` 等视图字段
 */
export type TableMetadata = TableSemanticMetadata & {
  /** 表名 */
  tableName: string
  /** 列定义数组 */
  columns: DataColumn[]
  /**
   * CRUD API 配置。支持三种形式：
   * - 完整对象 `CrudApi`
   * - 字符串简写（RESTful 基础路径）：`"/api/users"` → 自动展开为完整 CRUD 端点
   * - `true`：从 tableName 按约定生成路径（`/api/${kebab-case(tableName)}`）
   */
  api?: CrudApi | string | boolean | undefined
  /** 表级 CRUD 配置（超时、重试、权限等） */
  crudConfig?: CrudOperationConfig | undefined
  /**
   * 视图集合；canonical 结构中必须包含 `default` 视图。
   * 视图级字段（rows, page, pageSize, filter, sort 等）全部下沉到 ViewMetadata。
   */
  views: {
    /** canonical default 视图；表序列化结构必须包含该视图 */
    default: ViewMetadata
  } & Record<string, ViewMetadata>}

// ═══════════════════════════════════════════════════════
// 7. 过滤 & 排序
//
// 树形过滤表达式和排序数组，用于视图级数据筛选和排序。
// ═══════════════════════════════════════════════════════

/** 排序方向（小写） */
export type SortDirection = 'asc' | 'desc'

/** 排序规则项（direction 默认 'asc'） */
export type SortField = {
  /** 排序字段名 */
  field: string
  /** 排序方向，默认升序 */
  direction?: SortDirection}

/**
 * 排序表达式——统一数组格式，UI 和服务端提交共用。
 *
 * @example
 * ```ts
 * // 单字段升序（direction 可省略，默认 'asc'）
 * [{ field: 'name' }]
 * // 多字段排序
 * [{ field: 'age', direction: 'desc' }, { field: 'name' }]
 * ```
 */
export type SortExpression = SortField[]

// ═══════════════════════════════════════════════════════
// 8. 视图级元数据 & 聚合
//
// ViewMetadata 是 DataView 的序列化形状，描述行数据、过滤、排序、聚合等视图层配置。
// ═══════════════════════════════════════════════════════

/**
 * 视图聚合函数类型。
 *
 * 配置在 `ViewMetadata.aggregates`（运行时为 `view.aggregates`）上。DataView 会先
 * 对 `computeExpression` 求值，再按 aggregates 的 key 生成输出行：
 * `view.aggregateResult[key]` / `view.selectionAggregateResult[key]`。
 *
 * - `sum`   — `Number(raw ?? 0)` 累加；null/undefined 按 0，非数字会得到 NaN
 * - `count` — 非 null/undefined 值计数（空字符串也计数）
 * - `avg`   — 对可转为数字的值求平均；空集或无有效数字 → 0
 * - `min`   — 可转为数字的最小值；空集或无有效数字 → undefined
 * - `max`   — 可转为数字的最大值；空集或无有效数字 → undefined
 * - `join`  — 字符串拼接（默认 `", "` 分隔，跳过 null/undefined/空串；空集 → ''）
 */
export type AggregateType = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'join'

/** 视图聚合输出行（key 来自 aggregates 的输出字段名） */
export type AggregateResultRow = {
  [field: string]: number | string | undefined}

/**
 * 单个聚合列配置。
 *
 * - `type`  — 聚合函数（sum / count / avg / min / max / join）
 * - `field` — 源字段名（省略时默认与 key 同名），可指向基础列或计算列
 * - `separator` — `join` 的字符串分隔符
 *
 * @example
 * ```json
 * {
 *   "totalPrice": { "type": "sum", "field": "price" },
 *   "avgScore":   { "type": "avg", "field": "score" }
 * }
 * ```
 */
export type AggregateColumnConfig = {
  /** 聚合函数类型 */
  type: AggregateType
  /**
   * 源字段名（聚合哪个字段的值；省略时默认取与 aggregates 的 key 同名的字段）。
   *
   * 注意：`field` 只决定从行里读哪个源字段，结果仍写入 aggregates 的 key。
   */
  field?: string
  /** join 聚合分隔符（默认 ', '），仅 type='join' 时有效 */
  separator?: string}

/** DataView 对一个 DataTable 资源字段或派生字段的稳定投影。 */
export type DataViewFieldProjection = Readonly<{
  fieldId: string
  source: 'resource' | 'derived'
  resourceFieldId: string | null
  resourceField: string
  viewField: string
  type: ColumnType
  label: string
  output: boolean
  sortOrder: number
  sortDirection: SortDirection | null
  group: number
  distinct: boolean
  primaryKey: boolean
  value: string
  valueFunction: string
  expression: string
}>

/** 后端无关的视图查询上下文；具体适配器解释其中的身份和输入参数。 */
export type DataViewQueryContext = Readonly<Record<string, unknown>>

/**
 * 数据视图元数据
 *
 * 视图层关注点：行数据、过滤、排序、分页、树配置、聚合、序列化字段。
 * 当表的 resourceType = 'static-data' 时，才应在配置中直接声明 rows；
 * 其他资源类型应把数据视为远端来源，通过 requestData/loadFromServer 等机制获取。
 */
export type ViewMetadata = {
  /** 所属表名 */
  tableName?: string
  /** 视图 ID */
  viewId?: string
  /** 视图对资源字段的稳定投影；viewId 可直接承载外部模型 ID。 */
  fieldProjection?: readonly DataViewFieldProjection[]
  /** 由 DataView 随查询提交、由 DataTable.crudService 适配的后端无关上下文。 */
  queryContext?: DataViewQueryContext
  /**
   * 视图行数据。
   *
   * 当前建模约定：仅当表的 resourceType = 'static-data' 时，才应在配置中直接声明 rows；
   * 其他资源类型应把数据视为远端来源，通过 requestData/loadFromServer 等机制获取。
   */
  rows?: DataRow[]
  /** 过滤表达式 */
  filterExpression?: DataViewFilterTree
  /** 排序表达式 */
  sortExpression?: SortExpression
  /** 请求成功后自动将 currentRow 设为第一行 */
  autoCurrentFirst?: boolean
  /** 请求成功后自动将 selectedRows 设为第一行 */
  autoSelectFirst?: boolean
  /** 当前页码 */
  page?: number
  /** 每页行数 */
  pageSize?: number
  /** 树结构字段配置（idField/parentIdField/textField/depthLimit/lazy/treeMode），属于视图层关注点 */
  treeConfig?: TreeConfig
  /**
   * 值字段名（用于 value getter/setter 序列化）。
   * 未指定时回退到主键字段。
   *
   * - 单字段：`'code'` → value 返回各选中行的 code 字段值
   * - 多字段（复合值）：`['code', 'region']` → value 以 `:` 连接各字段，如 `'A:US'`
   */
  valueField?: string | string[]
  /**
   * 标签显示字段名（用于 labels / label getter，渲染 tag 时使用）。
   * 未指定时回退到主键值字符串。
   */
  labelField?: string
  /**
   * 值序列化分隔符（默认 ','）。
   *
   * - **非空字符串**（`','` / `'|'` / `';'` 等）：多选模式，value 以此分隔多个主键值
   * - **空字符串 `''`**：单选模式，value 仅保留一个值，赋值时不拆分
   *
   * 通过 `isMultiSelect` getter 可读取当前模式。
   */
  selectionDelimiter?: string
  /**
   * 是否在 DataSet 初始化后自动加载数据（默认 false）。
   *
   * 设为 `true` 时，页面调用渲染层在构建 DataSet 后自动调用 `view.requestData()`，
   * 业务脚本无需在 `__init__` 中手动编写加载代码。
   * 仅对有配置 `api` 且为 default 视图的主表有意义。
   */
  autoLoad?: boolean
  /**
   * 增删改提交模式（默认 `'immediate'`）。
   *
   * - `'immediate'`（默认）：`addRow` / `editRowById` / `removeRow` 立即调用对应网络 CRUD（如已配置 API）
   * - `'staged'`：仅修改内存并标记脏状态，调用 `saveChanges()` 批量提交
   */
  commitMode?: CommitMode
  /**
   * 视图级聚合配置——输出名 → 聚合列配置。
   *
   * `aggregates` 是配置态输出，会被 `DataView.toJson()` 持久化；每个 key 是
   * `aggregateResult / selectionAggregateResult` 上的结果字段名。`config.field` 只决定从哪一列取源值，
   * 因而 key 与 field 可以不同。
   *
   * 聚合配置与列定义（`DataColumn.computeExpression`）完全独立：
   * 列负责逐行求值，聚合负责对已求值的行集合做整列汇总。
   */
  aggregates?: Record<string, AggregateColumnConfig>}

// ═══════════════════════════════════════════════════════
// 9. 树结构配置 & 树节点类型
//
// 树形态由视图层组织，模型层始终存储平铺数据。
// ═══════════════════════════════════════════════════════

/**
 * 树结构字段配置（属于视图层，固化在 DataView）。
 *
 * 树操作 HTTP 接口族配置在 `CrudApi`；模型层始终存储平铺数据，树形态由视图层组织。
 */
export type TreeConfig = {
  /** 节点 ID 字段名 */
  idField?: string
  /** 父节点 ID 字段名 */
  parentIdField?: string
  /** 节点文本显示字段名 */
  textField?: string
  /** 最大展开深度 */
  depthLimit?: number
  /** 是否懒加载子节点 */
  lazy?: boolean
  /**
   * 树视图模式（默认 'flat'）：模型层始终存储平铺数据，视图层选择返回 flat 还是 nested 组织方式
   */
  treeMode?: 'flat' | 'nested'
  /**
   * 服务端分页策略：root 按根节点分页并返回 descendants；flat 按扁平行集合分页。
   */
  serverPaginationMode?: 'root' | 'flat'
  /** 服务端过滤树时是否保留祖先链，默认 include-ancestors */
  filterMode?: 'include-ancestors' | 'node-only'}

/** 平面树节点——服务端 flat 模式返回的基本行形状 */
export type FlatTreeNode = {
  /** 节点 ID */
  id: string | number
  /** 父节点 ID */
  parentId?: string | number | null
  /** 节点名称 */
  name: string
  /** 节点深度（根节点为 0） */
  level?: number
  /** 是否有子节点 */
  hasChildren?: boolean
  /** 子节点是否已加载 */
  isLoaded?: boolean
  /** 扩展字段 */
  [key: string]: unknown}

/** 嵌套树节点——在 FlatTreeNode 基础上增加 children 数组 */
export type NestedTreeNode = FlatTreeNode & {
  /** 子节点列表 */
  children: NestedTreeNode[]}

/** 树路径——祖先链 ID 列表和可选的节点详情 */
export type TreePath = {
  /** 从根到当前节点的 ID 路径 */
  pathIds: Array<string | number>
  /** 从根到当前节点的节点详情（可选） */
  pathNodes?: FlatTreeNode[]}

/**
 * 嵌套树搜索结果——对应 /tree/nested/search 接口返回格式。
 * 匹配节点 + 从根到该节点的祖先链（含自身），前端可直接展开定位。
 */
export type NestedTreeSearchResult = {
  /** 匹配的节点 */
  node: FlatTreeNode
  /** 从根到该节点的祖先链（含自身，顺序为根→叶） */
  path: FlatTreeNode[]}

// ═══════════════════════════════════════════════════════
// 10. 数据资源关系 & DataView 输入级联
//
// DataResourceRelation 声明稳定资源间的完整过滤条件（数据 Schema）。
// DataViewCascade 只声明视图输入联动（UI/运行 Schema）。
// 两类关系分别索引、分别消费，不再合并成第三种关系。
// ═══════════════════════════════════════════════════════

/**
 * 数据资源关系 — 声明两个 DataTable 所对应资源之间的完整过滤条件。
 *
 * 纯数据结构描述，不涉及 UI 联动。
 * 消费者：计算列聚合函数（$sum/$count）、提交排序与资源结构设计。
 *
 * 条件可使用过滤树支持的运算符和值函数；本地聚合仅执行 DataViewFilterLocal 支持的函数。
 * 条件 field 属于子资源，GetTableField.Field 属于父资源。
 */
export type DataResourceRelationFieldMapping = Readonly<{
  parentResourceField: string
  childResourceField: string
}>

export type DataResourceRelation = {
  /** AppWorks 关系身份；外部适配关系应提供稳定值。 */
  relationId?: string
  /** 原始平台关系 ID，仅用于来源追踪。 */
  sourceRelationId?: string
  /** 关系名称（可选，用于日志和调试） */
  relationName?: string
  /** 父表名 */
  parentTable: string
  /** 子表名 */
  childTable: string

  /** 唯一关系条件真源；field 指向子表，GetTableField.Field 指向父表。函数定义完整保留。 */
  filterExpression: DataViewFilterTree


  // ── 声明性元数据 ──
  /** 父表记录更新时是否级联更新子表 */
  cascadeUpdate?: boolean
  /** 父表记录删除时是否级联删除子表 */
  cascadeDelete?: boolean}

/** DataSet 输入边界接受的历史关系形式；归一输出仅使用 DataResourceRelation。 */
export type DataResourceRelationInput = Omit<DataResourceRelation, 'filterExpression'> & {
  filterExpression?: DataViewFilterTree
  childField?: string
  parentField?: string
  fieldMappings?: readonly DataResourceRelationFieldMapping[]
  condition?: Record<string, unknown>
}

/**
 * 目标 DataView 响应源 DataView 数据变化的触发源。
 *
 * 配置在 `DataViewCascade.dependencyType`，决定源 DataView 的哪种数据变化会触发目标 DataView 重新查询。
 *
 * - `'currentRow'`   — 父表 default 视图当前聚焦行变化时触发（默认值）；子表 default 视图用当前行主键过滤
 * - `'selectedRows'` — 父表 default 视图选中行集合变化时触发；子表 default 视图用所有选中行的主键 in-list 过滤
 * - `'allRows'`      — 父表 default 视图全量行集合变化时触发（不区分分页）
 * - `'pagedRows'`    — 父表 default 视图当前分页行集合变化时触发
 */
export type DependencyType =
  | 'currentRow'
  | 'selectedRows'
  | 'allRows'
  | 'pagedRows'
  | (string & {})

/**
 * DataView 输入级联 — 显式声明源/目标 DataView 和字段过滤绑定。
 *
 * 它与 DataResourceRelation 独立，不从资源关系自动推导。
 *
 * @example
 * ```json
 * {
 *   "parentTable": "Users", "childTable": "Orders",
 *   "parentViewId": "userGrid",
 *   "childViewId": "orderGrid",
 *   "filterBindings": [{ "sourceField": "id", "targetField": "userId" }],
 *   "dependencyType": "selectedRows"
 * }
 * ```
 */
export type DataViewCascadeFilterBinding = Readonly<{
  /** 从源 DataView 行读取的字段。 */
  sourceField: string
  /** 作为目标 DataView 查询过滤条件的字段。 */
  targetField: string
}>

/** 既有 DataView 查询级联；不引用 DataResourceRelation。 */
export type DataViewQueryCascade = {
  kind?: 'query'
  /** AppWorks 级联身份。 */
  cascadeId?: string
  /** 原始平台关系 ID，仅用于来源追踪。 */
  sourceRelationId?: string
  /** 源 DataTable 名。 */
  parentTable: string
  /** 源 DataView ID。 */
  parentViewId: string
  /** 目标 DataTable 名。 */
  childTable: string
  /** 目标 DataView ID。 */
  childViewId: string
  /** 源字段到目标过滤字段的绑定。 */
  filterBindings: readonly DataViewCascadeFilterBinding[]
  /** 响应源视图的哪种数据变化（默认 'currentRow'）。 */
  dependencyType?: DependencyType
  /** 源变化时是否自动重新查询目标视图（默认 true）。 */
  autoLoad?: boolean
}

export type DataViewFieldCascade = Readonly<{
  kind: 'field'
  cascadeId: string
  tableName: string
  viewId: string
  targetField: string
  /** 原生字段值，或按选项 DataView 配置编码的选中值字符串。 */
  valueFormat: 'native' | 'selection-string'
  /** field 缺省时取该视图选中主键数组；指针和编辑覆盖仅属于取值绑定。 */
  parents: ReadonlyArray<Readonly<{ tableName: string; viewId: string; field?: string; parameter: string }>>
  optionsView: Readonly<{ tableName: string; viewId: string }>
  valuePolicy: Readonly<{ mode: 'retain' } | { mode: 'clear' | 'retain-valid';
    clearValue: string | number | boolean | null | ReadonlyArray<string | number | boolean> }>
}>

/** 同一持久关系域中的两种独立运行语义。 */
export type DataViewCascade = DataViewQueryCascade | DataViewFieldCascade

export type DataViewFieldCascadeAddress = Readonly<{
  tableName: string
  viewId: string
  field: string
}>

export type DataViewFieldCascadeState = Readonly<{
  status: 'idle' | 'loading' | 'ready' | 'error'
  options: readonly DataRow[]
  valueStatus: 'empty' | 'valid' | 'invalid' | 'unverified'
  error?: string
}>

/** 唯一定位一个 DataView 输入级联。 */
export type DataViewCascadeSelector = Readonly<{
  cascadeId: string
  parentTable?: never
  parentViewId?: never
  childTable?: never
  childViewId?: never
} | {
  parentTable: string
  parentViewId: string
  childTable: string
  childViewId: string
  cascadeId?: string
}>

// ═══════════════════════════════════════════════════════
// 11. 请求状态 & 提交模式
//
// 描述视图数据加载的生命周期状态和编辑提交策略。
// ═══════════════════════════════════════════════════════

/**
 * DataView 请求状态机。
 *
 * ```
 * Idle ──requestData()──▶ Preparing ──loadFromServer()──▶ Loading
 *                                                                │
 *                                                ┌──────────────┴──────────────┐
 *                                              Loaded                        Failed
 * ```
 */
export enum RequestState {
  /** 未请求（初始态 / 被外部重置后） */
  Idle = 0,
  /** 准备中：逐个检查父依赖、组装查询参数（条件具备前） */
  Preparing = 1,
  /** loadFromServer 网络请求中（从服务器请求中） */
  Loading = 2,
  /** 已完成 */
  Loaded = 3,
  /** 失败（父依赖不满足 / 网络错误） */
  Failed = 4,
}

/**
 * 增删改提交模式。
 *
 * - `'immediate'`（默认）：`addRow` / `editRowById` / `removeRow` 立即调用对应网络 CRUD（如已配置 API）
 * - `'staged'`：仅修改内存并标记脏状态，需调用 `saveChanges()` 批量提交
 */
export type CommitMode = 'immediate' | 'staged'

// ═══════════════════════════════════════════════════════
// 12. 数据集元数据
//
// DataSetMetadata 是 DataSet 的序列化形状（对应 DataSet.toJson() 输出）。
// 顶层只承载数据集自身字段；表的默认视图数据继续下沉到 tables.*.views.default。
// ═══════════════════════════════════════════════════════

/**
 * DataSet 级布局元数据。
 *
 * 该结构不参与运行时数据计算，仅用于设计器/编辑器恢复画布布局。
 */
export type DataSetLayoutMetadata = {
  /** 表名 -> 画布位置 */
  tablePositions?: Record<string, { x: number; y: number }>}

/**
 * 数据集元数据（对应 DataSet.toJson() 输出）
 *
 * 顶层只承载数据集自身字段；表的默认视图数据必须继续下沉到 `tables.*.views.default`。
 */
export type DataSetMetadata = {
  /**
   * Schema 格式版本（用于未来迁移兼容）。
   * 当前 canonical 结构为 2：`tables -> views -> default`。
   */
  schemaVersion?: number
  /** 数据集名称 */
  dataSetName: string
  /** SPARK 场景身份（页面绑定的 formKey）；未绑定场景的本地数据集不声明 */
  scenarioId?: string
  /** 表集合（表名 -> 表元数据） */
  tables: Record<string, TableMetadata>

  /** 数据资源关系 — 声明 DataTable 所对应资源间的字段关系 */
  resourceRelations?: DataResourceRelation[]
  /** DataView 输入级联 — 显式声明运行时输入图；不从 resourceRelations 自动推导 */
  viewCascades?: DataViewCascade[]
  /** 业务数据版本号（乐观锁），与 schemaVersion 含义不同 */
  version?: number
  /** 页面 ID */
  pageId?: string
  /** DataSet.saveChanges 的默认提交策略 */
  saveChanges?: DataSetSaveChangesConfig
  /** 可选的设计器布局信息（如画布坐标） */
  layout?: DataSetLayoutMetadata}

// ═══════════════════════════════════════════════════════
// 13. 数据源契约 & 视图变更事件
//
// DataSource 是 UI 读取 DataView 时看到的运行时数据结构；
// ViewChangeHandlers 描述视图级状态变化的订阅接口。
// ═══════════════════════════════════════════════════════

/**
 * DataSet 用到的应用服务最小形状（避免依赖上层能力体系类型）。
 */
export type DataSetAppServices = {
  /** 路由快照 */
  router?: {
    currentRoute: unknown
  }
  /** 租户信息 */
  tenant?: { tenantId: string; tenantName?: string; [key: string]: unknown }
  /** 日志服务 */
  logger?: LoggerApi}

/**
 * 完整数据源全量接口，包含分页、聚合结果、权限、值序列化。
 *
 * DataView 实现此接口。可将其理解为"UI 读取 DataView（API 视图）时看到的运行时数据结构"。
 *
 * 边界：
 * - DataView 对应 table + viewId 的 API 视图（含 requestData/refresh/requestState）。
 * - DataSource 只暴露 UI 消费所需的输出字段，不承载 API 配置定义本身（例如 viewId 应由 dataViewKey 解析得到）。
 *
 * 1. 行级计算列：`columns[].computeExpression` 对每一行求值，结果写回该行字段。
 *    表达式可直接读取行字段，可通过 `ctx` 读取外部上下文，也可通过
 *    `$sum/$count/$avg/$min/$max/$list/$join` 读取 DataResourceRelation 匹配到的子资源行。
 * 2. 视图级聚合配置：定义在 `ViewMetadata.aggregates`，不是 `DataSource` 字段。
 *    每个输出项包含 `type / field / separator` 等后端 API 认得的规则信息。
 * 3. 运行时聚合结果：`aggregateResult` 基于当前 `rows` 计算，`selectionAggregateResult`
 *    基于当前 `selectedRows` 计算；二者都是由 aggregates 配置生成的"聚合结果输出行"，
 *    字段名来自 aggregates 的输出 key，字段值是对应聚合计算结果。
 * 4. UI / DataView 成员消费：组件可直接读取 `dataSource.aggregateResult`，也可通过
 *    dataViewKey=`Table@default` + dataMember=`aggregateResult` + dataField=`totalAmount` 引用。
 * 5. 序列化边界：`DataView.toJson()` 只持久化 `aggregates` 配置；`aggregateResult`、
 *    `selectionAggregateResult` 和计算列写回 rows 的派生值都是运行时结果，不写入配置 JSON。
 */
export type DataSource = {
  /** 当前视图行集合，表格/列表/树等数据容器的主要渲染输入 */
  rows?: readonly DataRow[]
  /** 列定义数组（只读，来自 DataTable.columns）。UI 组件据此渲染表头 / 表单标签 */
  columns?: readonly DataColumn[]
  /** 表名（来自 DataView.tableName） */
  tableName?: string
  /** 数据加载状态（Idle / Loading / Loaded / Failed） */
  requestState?: RequestState
  /** 当前聚焦行（UI 高亮行 / 级联父行） */
  currentRow?: DataRow | null
  /** 当前选中行集合（勾选行 / 级联选中行） */
  selectedRows?: readonly DataRow[]
  /** 后端最终权限快照；缺失时权限组件必须 fail-closed。 */
  /** 当前查询结果总行数，用于分页器展示总量 */
  total?: number
  /** 当前页码，通常从 1 开始 */
  page?: number
  /** 每页行数，用于分页查询和分页器状态同步 */
  pageSize?: number
  /**
   * 当前 `rows` 的全量聚合输出行；按视图 aggregates 配置自动计算，行变更后自动重算。
   *
   * 注意它不是单个标量，而是 `AggregateResultRow` 形状的结果容器：
   * 每个字段名来自 aggregates 的输出 key，每个字段值是对应聚合计算结果。
   * 例如 aggregates 配置了 `totalAmount`、`avgScore` 两个输出名，则结果形如：
   * `{ totalAmount: 1234, avgScore: 87.5 }`。
   * 当视图已配置 aggregates 且 rows 为空时，源码按类型填默认输出：
   * `sum/count/avg` 为 `0`，`min/max` 为 `undefined`，`join` 为空字符串。
   */
  aggregateResult?: Readonly<AggregateResultRow>
  /**
   * 当前 `selectedRows` 的选中聚合输出行；按视图 aggregates 配置自动计算，选中/数据变更后自动重算。
   *
   * 无选中行时源码直接返回空对象 `{}`，而不是按聚合类型填默认输出。
   * 选中行存在时字段结构与 aggregateResult 相同。
   */
  selectionAggregateResult?: Readonly<AggregateResultRow>

  // ── 选中值序列化（el-select / el-radio-group 等值型组件消费）──

  /** 选中行序列化值（按 valueField + selectionDelimiter 拼接，可 v-model 绑定） */
  value?: string
  /** 当前行显示标签（按 labelField 或主键回退） */
  label?: string | null
  /** 选中行标签数组 */
  labels?: readonly string[]}

/** DataView 编辑态字段变更事件 */
export type DataViewEditingFieldChangeEvent = {
  /** 表名 */
  tableName: string
  /** 视图 ID */
  viewId: string
  /** 行 ID */
  rowId: string | number
  /** 变更字段名 */
  field: string
  /** 变更前的值 */
  previousValue: unknown
  /** 变更后的值 */
  nextValue: unknown
  /** 编辑中的行数据 */
  editingRow: DataRow
  /** 变更补丁 */
  patch: Partial<DataRow>}

/** DataView 编辑态应用结果 */
export type DataViewApplyEditingRowsResult = {
  /** 成功应用的行数 */
  appliedCount: number
  /** 失败的行数 */
  failedCount: number
  /** 失败的行 ID 列表 */
  failedIds: Array<string | number>
  /** 失败的行 ID -> 错误消息映射 */
  failedErrors: Record<string, string>}

/**
 * DataSet 级视图变更处理器映射
 *
 * 用于 `DataSet.onAnyViewChange()`：
 * 订阅者按需注册感兴趣的事件类型，每个回调接收 `(tableName, viewId, ...payload)`。
 *
 * @example
 * ```ts
 * dataSet.onAnyViewChange({
 *   currentRowChanged(tableName, viewId, currentRow, originatorId) {
 *     syncCurrentRowToUI(tableName, viewId, currentRow)
 *   },
 *   cleared(tableName, viewId) {
 *     clearUI(tableName, viewId)
 *   },
 * })
 * ```
 */
export type ViewChangeHandlers = {
  /** 当前行变化 */
  currentRowChanged?: (tableName: string, viewId: string, currentRow: DataRow | null, originatorId?: string) => void
  /** 选中行集合变化 */
  selectedRowsChanged?: (tableName: string, viewId: string, selectedRows: DataRow[], originatorId?: string) => void
  /** 行数据变化（不区分具体行） */
  rowsChanged?: (tableName: string, viewId: string) => void
  /** 编辑态字段变化 */
  editingFieldChanged?: (tableName: string, viewId: string, event: DataViewEditingFieldChangeEvent) => void
  /** 编辑态开关变化 */
  editingChanged?: (tableName: string, viewId: string) => void
  /** 显式取消编辑；undefined 表示全部行 */
  editingDiscarded?: (tableName: string, viewId: string, ids: ReadonlyArray<string | number> | undefined) => void
  /** 视图清空 */
  cleared?: (tableName: string, viewId: string) => void
  /** 视图配置变化 */
  configChanged?: (tableName: string, viewId: string) => void
  /** 请求状态变化 */
  requestStateChanged?: (tableName: string, viewId: string, requestState: RequestState) => void
  /** 变更中标记变化 */
  mutatingChanged?: (tableName: string, viewId: string, mutating: boolean) => void
  /** 聚合结果变化 */
  summaryChanged?: (tableName: string, viewId: string) => void
  /** 选中聚合结果变化 */
  selectionSummaryChanged?: (tableName: string, viewId: string) => void}

// ═══════════════════════════════════════════════════════
// 14. 数据集合同
//
// DataSetContract 是消费者（渲染层、能力系统）应依赖的接口，
// 而非具体 DataSet 类，便于测试 mock 与未来扩展。
// ═══════════════════════════════════════════════════════

/**
 * 数据集公共契约
 *
 * 消费者（渲染层、能力系统）应依赖此接口而非具体 DataSet 类，
 * 便于测试 mock 与未来扩展。
 */
export type DataSetContract = {
  /** 数据集名称 */
  readonly dataSetName: string
  /** 数据表集合 */
  readonly tables: Record<string, DataTable>
  /** 数据资源关系定义 */
  readonly resourceRelations: DataResourceRelation[] | undefined
  /** DataView 输入级联定义 */
  readonly viewCascades: DataViewCascade[] | undefined
  /** Schema 格式版本（默认 1） */
  readonly schemaVersion: number
  /** 业务数据版本号（乐观锁） */
  readonly version: number | undefined
  /** 页面 ID */
  readonly pageId: string | undefined

  /** 查询以指定 DataView 为源的目标级联（视图级索引） */
  getChildCascades(parentTable: string, parentViewId: string): DataViewQueryCascade[]
  /** 查询以指定 DataView 为目标的源级联（视图级索引） */
  getParentCascades(childTable: string, childViewId: string): DataViewQueryCascade[]
  /** 查询以指定资源为父的所有资源关系（聚合函数消费） */
  getResourceChildRelations(parentTable: string): DataResourceRelation[]
  /** 查询以指定资源为子的所有资源关系 */
  getResourceParentRelations(childTable: string): DataResourceRelation[]
  /** 动态添加数据表 */
  addTable(tableName: string, columns: DataColumn[]): DataTable
  /** 删除未被关系或依赖引用的数据表 */
  removeTable(tableName: string): void
  /** 添加数据资源关系 */
  addResourceRelation(params: DataResourceRelationInput): DataResourceRelation
  /** 更新数据资源关系 */
  updateResourceRelation(
    selector: {
      parentTable: string
      childTable: string
      relationId?: string
      parentField?: string
      childField?: string
    },
    updates: Partial<DataResourceRelation>,
  ): DataResourceRelation
  /** 删除数据资源关系 */
  removeResourceRelation(selector: {
    parentTable: string
    childTable: string
    relationId?: string
    parentField?: string
    childField?: string
  }): void
  /** 添加 DataView 输入级联 */
  addCascade(cascade: DataViewCascade): DataViewCascade
  /** 按唯一选择器读取级联，未命中返回 undefined，歧义报错。 */
  getCascade(selector: DataViewCascadeSelector): DataViewCascade | undefined
  /** 更新 DataView 输入级联 */
  updateCascade(
    selector: DataViewCascadeSelector,
    updates: Partial<DataViewCascade>,
  ): DataViewCascade
  /** 删除 DataView 输入级联 */
  removeCascade(selector: DataViewCascadeSelector): void
  /** 将 DataView 输入级联解析为目标视图过滤表达式；返回 null 表示源 DataView 输入不满足 */
  resolveCascadeFilter(rel: DataViewQueryCascade): DataViewFilterTree | undefined | null
  getFieldCascadeState(address: DataViewFieldCascadeAddress): DataViewFieldCascadeState
  refreshFieldCascade(address: DataViewFieldCascadeAddress): Promise<DataViewFieldCascadeState>
  onFieldCascadeChange(listener: (address: DataViewFieldCascadeAddress, state: DataViewFieldCascadeState) => void): () => void
  /** 获取数据表 */
  getTable(name: string): DataTable | undefined
  /** 获取数据视图（委托到 DataTable） */
  getView(tableName: string, viewId?: string): DataView | undefined
  /** 保存 DataSet 范围内的编辑态和 staged 变更；默认按数据资源关系父资源先于子资源提交所有有变更视图 */
  saveChanges(options?: DataSetSaveChangesOptions): Promise<CrudResult<DataSetSaveChangesResult>>
  /** 注入页面运行时服务（用于 URL 模板 tenant/project 作用域解析） */
  setAppServices(appServices: DataSetAppServices): void
  /** 注入页面路由快照（页面运行时服务缺失时用于 URL 模板 tenant/project 作用域解析） */
  setPageRoute(route: unknown): void
  /** 生成端点 URL 模板上下文参数 */
  getRequestTemplateParams(): Record<string, unknown>
  /** 序列化为 JSON 友好的元数据对象 */
  toJson(): DataSetMetadata
  /**
   * 订阅数据集级别的加载事件（覆盖所有已注册表的所有视图）
   * @returns 取消订阅函数
   */
  on(
    event: 'loadSuccess' | 'loadError',
    handler: (payload: { tableName: string; viewId: string; error?: Error }) => void
  ): () => void
  /**
   * 订阅此 DataSet 内任意视图的状态变化。
   *
   * 严格作用于本 DataSet 实例，多实例并存时互不干扰（替代全局 event-bus）。
   * 订阅时遍历当前已存在的所有视图；如需监听后续动态创建的视图，可在创建后重新订阅。
   *
   * @returns 取消订阅函数（组件卸载时调用）
   */
  onAnyViewChange(handlers: ViewChangeHandlers): () => void
  /**
   * 触发所有标记了 `autoLoad: true` 的 default 视图自动加载。
   * 渲染层构建 DataSet 后调用；业务脚本无需手动编写加载代码。
   */
  triggerAutoLoad(): void
  /**
   * 销毁 DataSet 及其所有 DataTable/DataView 的资源。
   * 清理所有事件订阅、委托、共享 HTTP 客户端引用。
   */
  destroy(): void
  /** 数据集是否已被销毁 */
  readonly destroyed: boolean}

// ═══════════════════════════════════════════════════════
// 15. 保存 & 事务类型
//
// DataSet.saveChanges 相关的选择器、模式、事务、结果类型。
// ═══════════════════════════════════════════════════════

/** DataSet 级保存目标：用于一次提交一个主从编辑范围 */
export type DataSetSaveChangesViewSelector = {
  /** 表名 */
  tableName: string
  /** 视图 ID（省略则提交该表所有有变更的视图） */
  viewId?: string
  /** 行 ID 列表（省略则提交该视图所有有变更的行） */
  ids?: Array<string | number>}

/** DataSet 级保存模式 */
export type DataSetSaveChangesMode = 'perView' | 'transaction'

/** 事务中的单个 CRUD 操作 */
export type DataSetTransactionOperation = {
  /** 操作 ID（可选，用于追踪） */
  operationId?: string
  /** 表名 */
  tableName: string
  /** 操作类型 */
  op: 'create' | 'update' | 'delete'
  /** 操作数据（create/update 时有效） */
  data?: Record<string, unknown>
  /** 主键（delete/update 时有效） */
  pk?: Record<string, unknown>}

/** 事务请求：包含一组事务操作 */
export type DataSetTransactionRequest = {
  /** 请求 ID（可选，用于追踪） */
  requestId?: string
  /** 操作列表 */
  operations: DataSetTransactionOperation[]}

/** 事务中单个操作的结果 */
export type DataSetTransactionOperationResult = {
  /** 对应的操作 ID */
  operationId?: string
  /** 操作状态 */
  status?: string
  /** 操作结果数据 */
  result?: unknown
  /** 错误消息（失败时有效） */
  error?: string}

/** 事务响应：服务端返回的完整事务结果 */
export type DataSetTransactionResponse = {
  /** 事务是否全部成功 */
  success?: boolean
  /** 事务 ID */
  transactionId?: string
  /** 对应的请求 ID */
  requestId?: string
  /** 操作总数 */
  operationCount?: number
  /** 各操作结果列表 */
  results?: DataSetTransactionOperationResult[]
  /** 是否为重放结果 */
  replayed?: boolean}

/** DataSet.saveChanges 事务配置（ViewMetadata 中持久化用） */
export type DataSetSaveChangesTransactionConfig = {
  /** 事务端点 */
  endpoint: HttpEndpoint
  /** 请求 ID（可选） */
  requestId?: string}

/** DataSet.saveChanges 事务选项（运行时传递用） */
export type DataSetSaveChangesTransactionOptions = {
  /** 事务端点（可选） */
  endpoint?: HttpEndpoint
  /** 请求 ID（可选） */
  requestId?: string}

/** DataSet.saveChanges 配置（ViewMetadata 中持久化用） */
export type DataSetSaveChangesConfig = {
  /** 提交模式（默认 'perView'） */
  mode?: DataSetSaveChangesMode
  /** 事务配置（mode='transaction' 时有效） */
  transaction?: DataSetSaveChangesTransactionConfig}

/** DataSet 级保存选项（运行时传递给 saveChanges） */
export type DataSetSaveChangesOptions = {
  /** 指定要提交的视图选择器列表（省略则提交所有有变更的视图） */
  views?: DataSetSaveChangesViewSelector[]
  /** 是否先应用编辑态行再提交 */
  applyEditingRows?: boolean
  /** 提交模式（覆盖 ViewMetadata 中的默认值） */
  mode?: DataSetSaveChangesMode
  /** 事务选项 */
  transaction?: DataSetSaveChangesTransactionOptions}

/** DataSet 级单视图保存结果 */
export type DataSetSaveChangesViewResult = {
  /** 表名 */
  tableName: string
  /** 视图 ID */
  viewId: string
  /** 成功应用的编辑态行数 */
  appliedEditingRows: number
  /** 失败的编辑态行数 */
  failedEditingRows: number
  /** 新增记录数 */
  createdCount: number
  /** 保存（更新）记录数 */
  savedCount: number
  /** 删除记录数 */
  deletedCount: number
  /** 失败记录数 */
  failedCount: number
  /** 失败的行 ID 列表 */
  failedIds: Array<string | number>
  /** 失败的行 ID -> 错误消息映射 */
  failedErrors: Record<string, string>}

/** DataSet 级跨视图保存结果 */
export type DataSetSaveChangesResult = {
  /** 涉及的视图总数 */
  viewCount: number
  /** 成功应用的编辑态行数 */
  appliedEditingRows: number
  /** 失败的编辑态行数 */
  failedEditingRows: number
  /** 新增记录总数 */
  createdCount: number
  /** 保存（更新）记录总数 */
  savedCount: number
  /** 删除记录总数 */
  deletedCount: number
  /** 失败记录总数 */
  failedCount: number
  /** 失败的视图列表 */
  failedViews: Array<{ tableName: string; viewId: string }>
  /** 各视图的保存结果详情 */
  viewResults: DataSetSaveChangesViewResult[]
  /** 事务响应（mode='transaction' 时有效） */
  transaction?: DataSetTransactionResponse}

// ═══════════════════════════════════════════════════════
// 16. CRUD 服务类型
//
// CRUD 操作结果、查询参数、批量结果和运行策略配置。
// ═══════════════════════════════════════════════════════

/** CRUD 操作结果 */
export type CrudResult<T = unknown> = {
  /** 是否成功 */
  success: boolean
  /** 成功时的返回数据 */
  data?: T
  /** 错误对象（失败时有效） */
  error?: Error
  /** 错误消息 */
  message?: string
  /** 错误码 */
  code?: string
  /** 时间戳 */
  timestamp?: number}

/**
 * 分页查询参数 - 支持权限快照传递
 */
export type QueryParams = {
  /** 页码 */
  page?: number
  /** 每页大小 */
  pageSize?: number
  /** 排序字符串 */
  sort?: string
  /** 过滤条件 */
  filter?: DataViewFilterTree
  /** 搜索关键字 */
  search?: string
  /** 要查询的字段列表 */
  fields?: string[]
  /** 要包含的关联数据 */
  include?: string[]
  /** 视图 ID */
  viewId?: string
  /** 视图配置 */
  viewConfig?: ViewMetadata
  /** 当前 DataView 的字段投影。 */
  projection?: readonly DataViewFieldProjection[]
  /** 当前 DataView 的运行查询上下文。 */
  context?: DataViewQueryContext
  /** 树模式 */
  treeMode?: 'flat' | 'nested'
  /** 父节点 ID */
  parentId?: string | number | null
  /** 根节点 ID */
  rootId?: string | number | null
  /** 最大展开深度 */
  depthLimit?: number
  /** 最大返回行数 */
  limit?: number

  /** 扩展参数 */
  [key: string]: unknown}

/** 批量操作结果 */
export type BatchResult = {
  /** 成功数量 */
  successCount: number
  /** 失败数量 */
  failureCount: number
  /** 各操作结果列表 */
  results: CrudResult[]
  /** 错误列表 */
  errors: Error[]
  /** 总耗时（毫秒） */
  totalTime?: number}

/**
 * CRUD 通用运行策略配置。
 *
 * 语义：描述"调用端点时应用什么策略"。
 * 这里定义超时、重试、数据校验，以及请求/响应转换等运行期策略，不负责声明端点映射。
 */
export type CrudOperationConfig = {
  /** 请求超时（毫秒） */
  timeout?: number
  /** 重试次数 */
  retryCount?: number
  // ── 数据处理 ──
  /** 是否校验数据 */
  validateData?: boolean
  /** 请求数据转换函数 */
  transformRequest?: (data: unknown) => unknown
  /** 响应数据转换函数 */
  transformResponse?: (data: unknown, request: unknown) => unknown}
/** 后端最终返回的五个稀疏权限集合；字段集合互相独立，不得压缩为枚举。 */
export type DataPermissionSets = Readonly<{
  r: readonly string[]
  e: readonly string[]
  h: readonly string[]
  m: readonly string[]
  d: boolean
}>
