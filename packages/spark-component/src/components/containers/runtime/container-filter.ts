/**
 * @module @spark-appworks/spark-component:components/containers/runtime/container-filter
 * 职责：提供 container filter 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */

import { computed, reactive, toValue, watch } from 'vue'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import { type SparkNode, type FilterExpression, type FilterOperator, type FilterValueExpression, nodeInputProp } from '@spark-appworks/spark-data'
import { isRecord } from '@spark-appworks/spark-utils'

// ============================================================
// § 过滤器常量
// ============================================================

/** setFilter 路径同步失败的错误消息前缀。 */
const FILTER_SYNC_ERROR_MESSAGE = 'RendererFilter: 同步过滤表达式失败'
/** executeFilter 路径应用失败的错误消息前缀。 */
const FILTER_APPLY_ERROR_MESSAGE = 'RendererFilter: 应用过滤失败'

/** 过滤操作符常量：范围（日期/数字）。 */
const FILTER_OPERATOR_BETWEEN: FilterOperator = 'between'
/** 过滤操作符常量：多值 IN。 */
const FILTER_OPERATOR_IN: FilterOperator = 'in'
/** 过滤操作符常量：文本包含。 */
const FILTER_OPERATOR_CONTAINS: FilterOperator = 'contains'
/** 过滤操作符常量：精确匹配（默认）。 */
const FILTER_OPERATOR_EQUALS: FilterOperator = '=='

/** 过滤值类型标记：字段引用。 */
const FILTER_VALUE_KIND_FIELD = 'field'

/** 文本字段组件类型。 */
const FILTER_NODE_TYPE_TEXT = 'r-text'
/** 日期字段组件类型。 */
const FILTER_NODE_TYPE_DATE = 'r-date'
/** 数字字段组件类型。 */
const FILTER_NODE_TYPE_NUMBER = 'r-number'
const FILTER_OPERATORS: ReadonlySet<string> = new Set([
  '==', '!=', '>', '>=', '<', '<=',
  'in', 'not in', 'like', 'not like',
  'is null', 'is not null',
  'between', 'not between',
  'startsWith', 'endsWith', 'contains',
])

// ============================================================
// § 内部类型与工具函数
// ============================================================

/** 极简日志接口（最小化依赖）。 */
type ErrorLoggerLike = {
  /** 记录错误消息及可选异常对象，用于过滤同步/应用失败时的非侵入式日志。 */
  error(message: string, error?: unknown): void}

/** Filter Panel Data View 的语义模型。 */
type FilterPanelDataView = {
    /** 行数据集合。 */
readonly rows: ReadonlyArray<Record<string, unknown>>
    /** 列定义集合。 */
readonly columns?: readonly unknown[]
    /** filter Expression 字段。 */
readonly filterExpression?: FilterExpression | undefined
    /** data Table 字段。 */
readonly dataTable?: {
    readonly api?: { readonly list?: unknown } | undefined
    readonly resourceType?: string | undefined
  } | null | undefined
    /** get Column 回调。 */
getColumn?: (field: string) => unknown
  /** 同步过滤表达式到 DataView（不触发远端查询，后续 watch 自动 refresh）。 */
  setFilter(expr: FilterExpression | undefined): Promise<void>
  /** 立即执行过滤查询（用于"搜索"按钮主动触发远端查询）。 */
  executeFilter(expr: FilterExpression | undefined): Promise<void>
  /** 重新拉取远端数据并刷新当前视图行。 */
  refresh(): Promise<void>}

type ApplyFilterSafelyOptions = {
  readonly view: FilterPanelDataView | null | undefined
  readonly expr: FilterExpression | undefined
  readonly hasFilters: boolean
  readonly logger: ErrorLoggerLike
  readonly message: string
  /** set=同步表达式；execute=立即执行过滤查询。 */
  readonly mode?: 'set' | 'execute'
}

/** 判断过滤值是否为空（空字符串、空数组、null、undefined 均视为空）。 */
function isEmptyFilterValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0 || value.every(isEmptyFilterValue)
  return false
}

function hasNamedColumn(columns: unknown, field: string): boolean | undefined {
  if (!Array.isArray(columns)) return undefined
  return columns.some((column: unknown) =>
    isRecord(column) && column['name'] === field,
  )
}

function viewHasField(view: FilterPanelDataView | null | undefined, field: string): boolean {
  if (!view) return true

  if (view.getColumn?.(field) !== undefined) return true

  const columnMatch = hasNamedColumn(view.columns, field)
  if (columnMatch !== undefined) return columnMatch

  if (view.rows.length === 0) return true
  return view.rows.some(row => Object.prototype.hasOwnProperty.call(row, field))
}

function assertResidentFieldRefs(
  view: FilterPanelDataView | null | undefined,
  descriptors: ReadonlyArray<InputFilterDescriptor | ResidentFieldRefFilterDescriptor>,
): void {
  for (const descriptor of descriptors) {
    if (descriptor.kind !== 'field-ref') continue
    if (!viewHasField(view, descriptor.field)) {
      throw new Error(`RendererFilter: 过滤条件字段不存在 "${descriptor.field}"`)
    }
    if (!viewHasField(view, descriptor.refField)) {
      throw new Error(`RendererFilter: 过滤值表达式引用了不存在的字段 "${descriptor.refField}"`)
    }
  }
}

function isRemoteListView(view: FilterPanelDataView): boolean {
  const table = view.dataTable
  return table?.resourceType !== 'static-data' && table?.api?.list !== undefined
}

function isSameFilterExpression(
  left: FilterExpression | undefined,
  right: FilterExpression | undefined,
): boolean {
  if (left === right) return true
  if (left === undefined || right === undefined) return false
  return JSON.stringify(left) === JSON.stringify(right)
}

/** 判断节点是否为范围过滤配置（filterMode === 'range'）。 */
function isRangeFilterConfig(config: SparkNode): boolean {
  return nodeInputProp(config, 'filterMode') === 'range'
}

/** 从节点获取 field 属性。 */
function getNodeField(config: SparkNode): string | undefined {
  const f = nodeInputProp(config, 'field')
  return typeof f === 'string' ? f : undefined
}

/**
 * 从节点获取 filterValueRefField 属性。
 * - 非字符串或空字符串时抛出（配置错误应 fail-fast）。
 */
function getNodeFilterValueRefField(config: SparkNode): string | undefined {
  const value = nodeInputProp(config, 'filterValueRefField')
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('RendererFilter: filterValueRefField 必须是非空字符串')
  }
  return value.trim()
}

function isFilterOperator(value: string): value is FilterOperator {
  return FILTER_OPERATORS.has(value)
}

function toFilterValueExpression(value: unknown): FilterValueExpression {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value
  }
  if (Array.isArray(value)) return value.map(toFilterValueExpression)
  throw new Error(`RendererFilter: 不支持的过滤值类型 ${Object.prototype.toString.call(value)}`)
}

/** 断言过滤节点数组类型（配置错误 fail-fast）。 */
function assertFilterNodesArray(value: unknown): asserts value is SparkNode[] {
  if (Array.isArray(value)) return
  throw new Error('RendererFilter: r-filter children 必须是数组节点配置')
}

/**
 * 推断过滤操作符（优先级：显式配置 > 数组类型推断 > 节点类型推断 > 默认精确匹配）。
 */
function inferFilterOperator(config: SparkNode, value: unknown): FilterOperator {
  const explicit = nodeInputProp(config, 'filterOp') ?? nodeInputProp(config, 'filterOperator')
  if (typeof explicit === 'string') {
    if (!isFilterOperator(explicit)) {
      throw new Error(`RendererFilter: 不支持的过滤操作符 "${explicit}"`)
    }
    return explicit
  }

  if (Array.isArray(value)) {
    if (
      isRangeFilterConfig(config) ||
      config.type === FILTER_NODE_TYPE_DATE ||
      config.type === FILTER_NODE_TYPE_NUMBER
    ) {
      return FILTER_OPERATOR_BETWEEN
    }
    return FILTER_OPERATOR_IN
  }

  switch (config.type) {
    case FILTER_NODE_TYPE_TEXT:
      return FILTER_OPERATOR_CONTAINS
    default:
      return FILTER_OPERATOR_EQUALS
  }
}

// ============================================================
// § 过滤描述符类型
// ============================================================

type InputFilterDescriptor = {
  kind: 'input'
  config: SparkNode
  field: string | undefined}

type ResidentFieldRefFilterDescriptor = {
  kind: 'field-ref'
  field: string
  op: FilterOperator
  refField: string}

/**
 * 尝试从节点创建常驻字段引用描述符（filterValueRefField 存在时）。
 *
 * 常驻字段引用不进入 filterModel，它直接把 DataView 中另一个字段作为过滤值；
 * 因此创建时必须立即校验 field/refField，避免后续应用过滤时才暴露配置错误。
 */
function createResidentFieldRefDescriptor(
  config: SparkNode,
): ResidentFieldRefFilterDescriptor | undefined {
  const refField = getNodeFilterValueRefField(config)
  if (refField === undefined) return undefined

  const field = getNodeField(config)
  if (!field) {
    throw new Error('RendererFilter: 配置 filterValueRefField 的筛选节点必须声明 field')
  }

  return {
    kind: 'field-ref',
    field,
    op: inferFilterOperator(config, undefined),
    refField,
  }
}

/** 将节点配置描述为过滤描述符（优先检测 field-ref，否则作为用户输入过滤器）。 */
function describeFilterNode(config: SparkNode): InputFilterDescriptor | ResidentFieldRefFilterDescriptor {
  const residentFieldRef = createResidentFieldRefDescriptor(config)
  if (residentFieldRef) return residentFieldRef
  return { kind: 'input', config, field: getNodeField(config) }
}

function isInputFilterDescriptor(
  descriptor: InputFilterDescriptor | ResidentFieldRefFilterDescriptor,
): descriptor is InputFilterDescriptor {
  return descriptor.kind === 'input'
}

/**
 * 将描述符数组拆分为 input 和 field-ref 两组。
 *
 * 拆分后执行顺序更清晰：
 * - input 描述符负责驱动 UI 和 filterModel 双向绑定。
 * - field-ref 描述符始终进入最终表达式，不需要用户输入。
 */
function splitFilterDescriptors(descriptors: ReadonlyArray<InputFilterDescriptor | ResidentFieldRefFilterDescriptor>): {
  input: InputFilterDescriptor[]
  residentFieldRef: ResidentFieldRefFilterDescriptor[]
} {
  const input: InputFilterDescriptor[] = []
  const residentFieldRef: ResidentFieldRefFilterDescriptor[] = []
  for (const descriptor of descriptors) {
    if (isInputFilterDescriptor(descriptor)) input.push(descriptor)
    else residentFieldRef.push(descriptor)
  }
  return { input, residentFieldRef }
}

/** 将 field-ref 描述符转换为 FilterExpression（引用另一字段的值）。 */
function toResidentFieldRefCondition(descriptor: ResidentFieldRefFilterDescriptor): FilterExpression {
  return {
    field: descriptor.field,
    op: descriptor.op,
    value: {
      kind: FILTER_VALUE_KIND_FIELD,
      field: descriptor.refField,
    },
  }
}

/** 从模型值构建单条过滤条件（值为空则返回 undefined）。 */
function buildCondition(config: SparkNode, value: unknown): FilterExpression | undefined {
  const field = getNodeField(config)
  if (!field || isEmptyFilterValue(value)) return undefined
  if (isRangeFilterConfig(config)) {
    return buildRangeCondition(field, value)
  }
  return {
    field,
    op: inferFilterOperator(config, value),
    value: toFilterValueExpression(value),
  }
}

function toOptionalFilterValueExpression(value: unknown): FilterValueExpression | undefined {
  if (isEmptyFilterValue(value)) return undefined
  return toFilterValueExpression(value)
}

function buildRangeCondition(field: string, value: unknown): FilterExpression | undefined {
  if (!Array.isArray(value)) {
    return {
      field,
      op: FILTER_OPERATOR_EQUALS,
      value: toFilterValueExpression(value),
    }
  }

  const start = toOptionalFilterValueExpression(value[0])
  const end = toOptionalFilterValueExpression(value[1])
  if (start === undefined && end === undefined) return undefined
  if (start !== undefined && end !== undefined) {
    return {
      field,
      op: FILTER_OPERATOR_BETWEEN,
      value: [start, end],
    }
  }
  if (start !== undefined) return { field, op: '>=', value: start }
  if (end !== undefined) return { field, op: '<=', value: end }
  return undefined
}

// ============================================================
// § filterModel 工具函数
// ============================================================

/**
 * 同步 filterModel 的键集合与当前过滤器配置节点。
 *
 * - 删除已移除节点对应的键（赋值为 undefined）
 * - 添加新增节点对应的键（初始化为 undefined）
 * - 保持 filterModel 对象引用不变（支持双向绑定）
 */
function syncFilterModelKeys(
  filterModel: Record<string, unknown>,
  configs: readonly SparkNode[],
): void {
  const validKeys = new Set<string>()
  for (const config of configs) {
    const field = getNodeField(config)
    if (typeof field === 'string') validKeys.add(field)
  }
  for (const key of Object.keys(filterModel)) {
    if (!validKeys.has(key)) filterModel[key] = undefined
  }
  for (const key of validKeys) {
    if (!(key in filterModel)) filterModel[key] = undefined
  }
}

/** 从模型中获取单个 input 描述符的当前值。 */
function getInputFilterModelValue(
  descriptor: InputFilterDescriptor,
  model: Record<string, unknown>,
): unknown {
  return typeof descriptor.field === 'string' ? model[descriptor.field] : undefined
}

/**
 * 从输入描述符列表和模型构建所有过滤条件（跳过空值）。
 */
function buildInputFilterConditions(
  descriptors: readonly InputFilterDescriptor[],
  model: Record<string, unknown>,
): FilterExpression[] {
  return descriptors
    .map(descriptor => buildCondition(descriptor.config, getInputFilterModelValue(descriptor, model)))
    .filter((expr): expr is FilterExpression => expr !== undefined)
}

/**
 * 合并多条过滤条件为单个表达式（AND 关系）。
 *
 * - 0 条 → undefined（无过滤）
 * - 1 条 → 直接返回
 * - 多条 → `{ type: 'and', children: [...] }`
 */
function combineFilterConditions(conditions: FilterExpression[]): FilterExpression | undefined {
  if (conditions.length === 0) return undefined
  if (conditions.length === 1) return conditions[0]
  return { type: 'and', children: conditions }
}

/** 统计当前有值的 input 过滤器数量（用于 badge 显示）。 */
function countActiveInputFilters(
  descriptors: readonly InputFilterDescriptor[],
  model: Record<string, unknown>,
): number {
  let count = 0
  for (const descriptor of descriptors) {
    if (!isEmptyFilterValue(getInputFilterModelValue(descriptor, model))) count += 1
  }
  return count
}

/** 清空 filterModel 所有键的值（赋值为 undefined，保留键结构）。 */
function clearFilterModel(model: Record<string, unknown>): void {
  for (const key of Object.keys(model)) {
    model[key] = undefined
  }
}

// ============================================================
// § applyFilterSafely（过滤应用）
// ============================================================

/**
 * 安全地将过滤表达式应用到 DataView。
 *
 * - `execute` 模式：调用 `view.executeFilter(expr)`（适合"搜索"按钮触发场景）
 * - `set` 模式：调用 `view.setFilter(expr)`
 * - 捕获所有异常并通过 logger 记录（不向外抛出）
 */
async function applyFilterSafely(params: ApplyFilterSafelyOptions): Promise<boolean> {
  const { view, expr, hasFilters, logger, message, mode = 'set' } = params
  if (!view || !hasFilters) return false

  try {
    if (mode === 'execute') {
      await view.executeFilter(expr)
    } else {
      await view.setFilter(expr)
      if (
        isRemoteListView(view) &&
        !isSameFilterExpression(view.filterExpression, expr)
      ) {
        await view.refresh()
      }
    }
    return true
  } catch (error) {
    logger.error(message, error)
    return false
  }
}

// ============================================================
// § useFilterPanel
// ============================================================

/** Use Filter Panel Options 的调用配置。 */
type UseFilterPanelOptions = {
  /** 过滤器子节点列表（响应式）。 */
  filterChildren: MaybeRefOrGetter<SparkNode[]>
  /** 目标 DataView（响应式）。 */
  dataView: MaybeRefOrGetter<FilterPanelDataView | null>
  /** 错误日志接口。 */
  logger: ErrorLoggerLike}

/** `useFilterPanel` 返回状态。 */
export type FilterPanelState = {
  /** 双向绑定的过滤模型（field → 用户输入值）。 */
  filterModel: Record<string, unknown>
  /** 当前可渲染的过滤器配置列表（input 类型）。 */
  filterConfigs: ComputedRef<SparkNode[]>
  /** 是否有可渲染的过滤器。 */
  hasFilters: ComputedRef<boolean>
  /** 当前有值的过滤器数量（用于 badge）。 */
  activeFilterCount: ComputedRef<number>
  /** 应用过滤（executeFilter 模式，用于搜索按钮）。 */
  searchFilters: () => Promise<void>
  /** 重置所有过滤值。 */
  resetFilters: () => Promise<void>}

/**
 * 过滤面板完整状态管理。
 *
 * 内部流程：
 * 1. `filterChildren` → 描述符（describeFilterNode） → input / field-ref 两组
 * 2. `filterModel`（reactive）按 input 描述符同步键集（syncFilterModelKeys）
 * 3. `filterExpression`（computed）= combineFilterConditions(field-ref 条件 + input 条件)
 * 4. `watch(resolvedView)` → 视图切换时同步应用当前表达式
 * 5. `watch(filterExpression)` → 表达式变化时自动应用（setFilter + 可选 refresh）
 * 6. `searchFilters` → executeFilter（主动搜索）
 * 7. `resetFilters` → clearFilterModel
 */
export function useFilterPanel(options: UseFilterPanelOptions): FilterPanelState {
  const filterModel = reactive<Record<string, unknown>>({})

  const allFilterNodes = computed(() => {
    const nodes = toValue(options.filterChildren)
    assertFilterNodesArray(nodes)
    return nodes
  })

  const resolvedFilterDataView = computed(() => toValue(options.dataView))
  const filterDescriptors = computed(() => {
    const descriptors = allFilterNodes.value.map(config => describeFilterNode(config))
    assertResidentFieldRefs(resolvedFilterDataView.value, descriptors)
    return descriptors
  })
  const descriptorBuckets = computed(() => splitFilterDescriptors(filterDescriptors.value))
  const inputFilterDescriptors = computed(() => descriptorBuckets.value.input)
  const filterConfigs = computed(() => inputFilterDescriptors.value.map(descriptor => descriptor.config))

  const residentFieldRefConditions = computed<FilterExpression[]>(() =>
    descriptorBuckets.value.residentFieldRef.map(descriptor => toResidentFieldRefCondition(descriptor)),
  )

  // filterModel 键集与当前可渲染过滤器配置同步（新增初始化 / 删除清理）。
  watch(filterConfigs, (configs) => {
    syncFilterModelKeys(filterModel, configs)
  }, { immediate: true })

  // 合并 field-ref 常驻条件 + 用户输入条件 → 最终 FilterExpression。
  const filterExpression = computed<FilterExpression | undefined>(() => {
    const conditions = [
      ...residentFieldRefConditions.value,
      ...buildInputFilterConditions(inputFilterDescriptors.value, filterModel),
    ]
    return combineFilterConditions(conditions)
  })

  const hasRenderableFilters = computed(() => filterConfigs.value.length > 0)
  const hasAnyFilterNodes = computed(() => allFilterNodes.value.length > 0)

  // DataView 切换时：将当前过滤表达式应用到新 view（用于持续过滤场景）。
  watch(resolvedFilterDataView, async (view) => {
    if (filterExpression.value === undefined) return
    await applyFilterSafely({
      view,
      expr: filterExpression.value,
      hasFilters: hasAnyFilterNodes.value,
      logger: options.logger,
      message: FILTER_SYNC_ERROR_MESSAGE,
    })
  }, { immediate: true })

  // 表达式变化时：自动应用（set 模式，后续行为由 DataView 决定）。
  watch(filterExpression, async (expr) => {
    await applyFilterSafely({
      view: resolvedFilterDataView.value,
      expr,
      hasFilters: hasAnyFilterNodes.value,
      logger: options.logger,
      message: FILTER_APPLY_ERROR_MESSAGE,
    })
  }, { deep: true })

  const activeFilterCount = computed(() =>
    countActiveInputFilters(inputFilterDescriptors.value, filterModel),
  )

  function resetFilters(): Promise<void> {
    clearFilterModel(filterModel)
    return Promise.resolve()
  }

  async function searchFilters(): Promise<void> {
    await applyFilterSafely({
      view: resolvedFilterDataView.value,
      expr: filterExpression.value,
      hasFilters: hasAnyFilterNodes.value,
      logger: options.logger,
      message: FILTER_APPLY_ERROR_MESSAGE,
      mode: 'execute',
    })
  }

  return {
    filterModel,
    filterConfigs,
    hasFilters: hasRenderableFilters,
    activeFilterCount,
    searchFilters,
    resetFilters,
  }
}
