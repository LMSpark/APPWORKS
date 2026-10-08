/**
 * @module @spark-appworks/spark-data:strategies/computed-column-delegate
 * 职责：提供 spark-data 数据管线中的 computed column delegate 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */

import { Logger, toErrorMessage, createSafeProxy } from '@spark-appworks/spark-utils'
import type { DataRow, ComputedColumnFn, DataResourceRelation } from '../types'
import type { DataSet } from '../dataset'
import type { DataView } from '../data-view'
import { ResourceRelationDefinition } from '../resource-relation/resource-relation-definition'

const logger = Logger('DataView:Computed')

type ComputedEvaluation = { deny(): void; isDenied(): boolean;
  values: Map<string, { success: boolean; value: unknown }> }
type CompiledColumn = (row: DataRow, evaluation?: ComputedEvaluation) => unknown
type BoundReadRowOptions = Readonly<{ view: DataView; row: DataRow; evaluation: ComputedEvaluation; chain?: boolean }>

/** A view read is checked before touching the source value; the proxy never writes to it. */
function createBoundReadRow(options: BoundReadRowOptions): DataRow {
  const { view, row, evaluation, chain = false } = options
  const fields = new Set([...(view.dataTable?.columns.map(column => column.name) ?? []),
    ...view.columns.map(column => column.name), ...Object.keys(row)])
  const values = new Map<string, unknown>()
  return new Proxy({}, {
    has(_target, key) {
      return typeof key === 'string' && fields.has(key)
    },
    get(_target, key) {
      if (key === Symbol.unscopables) return undefined
      if (typeof key !== 'string') return undefined
      if (chain && evaluation.values.has(key)) {
        const computed = evaluation.values.get(key)
        if (!computed?.success) { evaluation.deny(); throw new Error(`computed input denied: ${key}`) }
        return computed.value
      }
      const configuredChildRead = !chain && view.columns.some(column => column.name === key && Boolean(column.computeExpression))
        && view.fieldAccess(row, key).read === 'visible'
      if (!fields.has(key) || (!configuredChildRead && !view.computedInputIsVisible(row, key))) {
        evaluation.deny()
        throw new Error(`computed input denied: ${key}`)
      }
      if (!values.has(key)) values.set(key, structuredClone(row[key]))
      return values.get(key)
    },
    getOwnPropertyDescriptor(_target, key) {
      return typeof key === 'string' && fields.has(key)
        ? { configurable: true, enumerable: true, writable: false, value: undefined } : undefined
    },
    ownKeys() { return [...fields] },
    set() { evaluation.deny(); return true },
    deleteProperty() { evaluation.deny(); return true },
    defineProperty() { evaluation.deny(); return true },
  })
}

// ─────────────────────────────────────────────
// 类型
// ─────────────────────────────────────────────

/** 表达式求值时可传入的外部上下文（在表达式中以 `ctx` 变量引用） */
type ComputedColumnContext = {
  [key: string]: unknown}

/**
 * 子表聚合行解析器（$sum/$count/$avg/$min/$max/$list/$join）。
 *
 * 子表引用格式：`'子表名'`。当前 resolver 按 DataResourceRelation.childTable 匹配并读取 default 视图。
 */
class ComputedColumnAggregateResolver {
  private readonly relMap = new Map<string, DataResourceRelation[]>()

  constructor(
    relations: readonly DataResourceRelation[],
    private readonly dataSet: DataSet,
    _defaultParentField: string,
  ) {
    for (const relation of relations) {
      const relationsForChild = this.relMap.get(relation.childTable) ?? []
      relationsForChild.push(relation)
      this.relMap.set(relation.childTable, relationsForChild)
    }
  }

  resolveChildRows(childRef: string, parentRow: DataRow, evaluation?: ComputedEvaluation): DataRow[] {
    const relations = this.relMap.get(childRef)
    if (!relations || relations.length === 0) return []
    if (relations.length > 1) throw new Error(`子表 ${childRef} 存在多个模型关系，聚合引用无法隐式选择`)
    const rel = relations[0]
    if (!rel?.filterExpression) throw new Error(`模型关系 ${childRef} 缺少 filterExpression`)
    const expression = rel.filterExpression
    const childView = this.dataSet.getView(rel.childTable, 'default')
    if (!childView) return []
    const childTable = this.dataSet.getTable(rel.childTable)
    const parentTable = this.dataSet.getTable(rel.parentTable)
    if (!childTable || !parentTable) throw new Error(`模型关系 ${childRef} 引用的表不存在`)
    const matches = ResourceRelationDefinition.createMatcher({expression, parentTable: rel.parentTable, childTable: rel.childTable,
      parent: parentRow, parentFields: new Set(parentTable.columns.map(column => column.name)),
      childFields: new Set(childTable.columns.map(column => column.name))})
    const rows = evaluation === undefined ? childView.rows
      : childView.rows.map(row => createBoundReadRow({ view: childView, row, evaluation }))
    return rows.filter(matches)
  }
}

// ─────────────────────────────────────────────
// 表达式编译器
// ─────────────────────────────────────────────

/** 表达式最大长度限制（防止超长代码注入） */
const MAX_EXPRESSION_LENGTH = 2048

/** 行数据安全代理（复用 spark-utils 共享沙箱策略） */
const createSafeRowProxy = (row: DataRow): DataRow => createSafeProxy(row)

/** 检测表达式中是否含有子表聚合函数调用 */
const AGG_PATTERN = /\$(?:sum|count|avg|min|max|list|join)\s*\(/

/**
 * 将表达式字符串编译为 ComputedColumnFn。
 *
 * - 行字段直接引用（`with(__row)` 解构），无需前缀
 * - 外部上下文通过 `ctx` 参数
 * - 子表聚合通过 `$sum` 等注入函数（需提供 `resolver`）
 *
 * @throws 编译期语法错误；运行期错误由 ComputedColumnDelegate._apply 捕获
 *
 * @example
 * compileExpression('price * qty')
 * compileExpression('amount * ctx.taxRate', { taxRate: 0.13 })
 * compileExpression("$sum('Items', 'amount')", undefined, resolver)
 */
function compileExpression(
  expression: string,
  ctx?: ComputedColumnContext,
  resolver?: ComputedColumnAggregateResolver,
): CompiledColumn {
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new Error(`表达式超长（${expression.length} > ${MAX_EXPRESSION_LENGTH}），已拒绝编译`)
  }
  const _ctx = ctx ?? {}
  const hasAgg = resolver !== undefined && AGG_PATTERN.test(expression)

  // 判断表达式是否为多语句函数体（包含 return 关键字）
  const isBlock = /\breturn\b/.test(expression)
  const body = isBlock
    ? `with(__row) { ${expression} }`
    : `with(__row) { return (${expression}) }`

  if (!hasAgg) {
    // 快速路径：无聚合函数
    const compiled = new Function('__row', 'ctx', body)
    return (row: DataRow) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- Computed expressions are the deliberate runtime Function boundary.
      const value: unknown = compiled(createSafeRowProxy(row), _ctx)
      return value
    }
  }

  // 聚合路径：注入 $sum/$count/$avg/$min/$max/$list/$join
  const compiled = new Function(
    '__row', '$sum', '$count', '$avg', '$min', '$max', '$list', '$join', 'ctx',
    body,
  )

  // 可变引用——逐行切换，避免每行创建新函数
  let _row: DataRow
  let _evaluation: ComputedEvaluation | undefined
  const _cache = new Map<string, DataRow[]>()

  const getChildRows = (ref: string): DataRow[] => {
    let cached = _cache.get(ref)
    if (cached === undefined) {
      cached = resolver.resolveChildRows(ref, _row, _evaluation)
      _cache.set(ref, cached)
    }
    return cached
  }

  const $sum   = (t: string, f: string): number => getChildRows(t).reduce((a, r) => a + Number(r[f] ?? 0), 0)
  const $count = (t: string): number => getChildRows(t).length
  const $avg   = (t: string, f: string): number => {
    const rows = getChildRows(t)
    return rows.length === 0 ? 0 : rows.reduce((a, r) => a + Number(r[f] ?? 0), 0) / rows.length
  }
  const $min   = (t: string, f: string): number | undefined => {
    const rows = getChildRows(t)
    if (rows.length === 0) return undefined
    let result = Infinity
    for (const r of rows) { const v = Number(r[f]); if (v < result) result = v }
    return result
  }
  const $max   = (t: string, f: string): number | undefined => {
    const rows = getChildRows(t)
    if (rows.length === 0) return undefined
    let result = -Infinity
    for (const r of rows) { const v = Number(r[f]); if (v > result) result = v }
    return result
  }
  const $list  = (t: string, f: string): unknown[] => getChildRows(t).map(r => r[f])
  const $join  = (t: string, f: string, sep = ', '): string =>
    getChildRows(t).map(r => String(r[f] ?? '')).join(sep)

  return (row: DataRow, evaluation?: ComputedEvaluation) => {
    _row = row
    _evaluation = evaluation
    _cache.clear()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- Computed expressions are the deliberate runtime Function boundary.
    const value: unknown = compiled(createSafeRowProxy(row), $sum, $count, $avg, $min, $max, $list, $join, _ctx)
    return value
  }
}

/**
 * 从 DataColumn[] 批量编译含 `computeExpression` 的列。
 * 编译失败的列跳过并打印警告，不中断其他列。
 */
type CompileColumnsOptions = Readonly<{
  columns: ReadonlyArray<{ name: string; computeExpression?: string }>
  ctx: ComputedColumnContext
  resolver: ComputedColumnAggregateResolver | undefined
  strict: boolean
}>

function compileColumnsExpressions(options: CompileColumnsOptions): Map<string, CompiledColumn> {
  const { columns, ctx, resolver, strict } = options
  const result = new Map<string, CompiledColumn>()
  for (const col of columns) {
    if (!col.computeExpression) continue
    try {
      result.set(col.name, compileExpression(col.computeExpression, ctx, resolver))
    } catch (error) {
      if (strict) throw new Error(`计算列 "${col.name}" 表达式编译失败: ${toErrorMessage(error)}`)
      logger.warn(`计算列 "${col.name}" 表达式编译失败: ${toErrorMessage(error)}`)
    }
  }
  return result
}

// ─────────────────────────────────────────────
// ComputedColumnDelegate
// ─────────────────────────────────────────────

/**
 * 计算列管理器——编译、求值、缓存的统一委托。
 *
 * 通过 DataView 访问运行时状态，自身管理：
 * - 已编译函数注册表（Map<name, fn>）
 * - 编译缓存（列指纹字符串 + ctx 对象引用，=== 比较，零序列化开销）
 * - 聚合解析器构建（DataResourceRelation → 子行解析）
 */
export class ComputedColumnDelegate {
  private _registeredColumns = new Map<string, ComputedColumnFn>()
  private _configuredColumns = new Map<string, CompiledColumn>()
  private _readable = new WeakMap<DataRow, Map<string, object>>()
  private _namesCache: ReadonlySet<string> | undefined
  /** 上次编译时的列表达式指纹（用于检测列定义变更） */
  private _compiledExprKey: string | undefined
  /** 上次编译时传入的 ctx 对象引用（用于检测 ctx 切换，不做深比较） */
  private _compiledCtxRef: ComputedColumnContext | undefined
  private _ctx: ComputedColumnContext = {}

    /** 创建 Computed Column Delegate 实例。 */
constructor(private readonly host: DataView) {}

  // ── 公共 API ─────────────────────────────────

  /** 已注册的计算列名集合（CrudDelegate 用于提交前剥离）。缓存，变更时失效。 */
  get names(): ReadonlySet<string> {
    return (this._namesCache ??= new Set([...this._registeredColumns.keys(), ...this._configuredColumns.keys()]))
  }

  isConfigured(name: string): boolean { return this._configuredColumns.has(name) }

  configuredReadAccess(row: DataRow, name: string, queryToken: object): boolean {
    return this._readable.get(row)?.get(name) === queryToken
  }

  /** 设置计算列共享上下文，失效缓存并触发重编译。 */
  setContext(ctx: ComputedColumnContext): void {
    this._ctx = ctx
    this._compiledExprKey = undefined
    this._compiledCtxRef = undefined
    this.syncFromConfig()
  }

  /** 获取当前上下文（只读）。 */
  get context(): ComputedColumnContext {
    return this._ctx
  }

  /** @internal 失效编译缓存，下次 syncFromConfig 将强制重编译。 */
  invalidateCache(): void {
    this._compiledExprKey = undefined
    this._compiledCtxRef = undefined
  }

  /**
   * 从宿主的 DataTable 列定义编译并注册计算列。
   * 内置编译缓存：列指纹 + ctx 不变时跳过。
   */
  syncFromConfig(): void {
    const columns = this.host.columns

    // 编译缓存：列表达式指纹（字符串比较）+ ctx 对象引用（=== 比较，不做深序列化）
    // 单次遍历构建指纹，避免 filter+map+join 分配临时数组
    let exprFingerprint = ''
    for (const c of columns) {
      if (c.computeExpression) {
        if (exprFingerprint) exprFingerprint += '|'
        exprFingerprint += `${c.name}:${c.computeExpression}`
      }
    }
    if (exprFingerprint === this._compiledExprKey && this._ctx === this._compiledCtxRef) return   // 缓存命中，跳过编译
    const compiled = compileColumnsExpressions({ columns, ctx: this._ctx, resolver: this._createAggregateResolver(),
      strict: Boolean(this.host.dataTable?.modelBinding) })
    const removed = [...this._configuredColumns.keys()].filter(name => !compiled.has(name))
    this._configuredColumns = compiled
    for (const row of this.host.rows) for (const name of removed) Reflect.deleteProperty(row, name)
    this._compiledExprKey = exprFingerprint
    this._compiledCtxRef = this._ctx
    this._readable = new WeakMap<DataRow, Map<string, object>>()
    this._namesCache = undefined
  }

  /** 注册计算列（已编译函数）。 */
  register(name: string, fn: ComputedColumnFn): void {
    this._registeredColumns.set(name, fn)
    this._namesCache = undefined
  }

  /** 移除计算列定义（已求值的历史数据保留）。 */
  remove(name: string): void {
    this._registeredColumns.delete(name)
    this._configuredColumns.delete(name)
    this._namesCache = undefined
  }

  /** 对行集合就地写入所有计算列。无计算列时短路返回，零开销。 */
  apply(rows: DataRow[]): void {
    this.syncFromConfig()
    if (this.names.size === 0 || rows.length === 0) return
    const bound = Boolean(this.host.dataTable?.modelBinding)
    const token = bound ? this.host.computedQueryToken() : undefined
    for (const row of rows) {
      for (const [name, fn] of this._registeredColumns) {
        try { row[name] = fn(row) }
        catch (e) {
          row[name] = undefined
          if (import.meta.env.DEV) {
            logger.debug(`计算列 "${name}" 求值失败: ${toErrorMessage(e)}`)
          }
        }
      }
      const values = new Map<string, { success: boolean; value: unknown }>()
      const readable = new Map<string, object>()
      for (const [name, fn] of this._configuredColumns) {
        let denied = false
        const evaluated: ComputedEvaluation = { deny: () => { denied = true }, isDenied: () => denied, values }
        try {
          const input = bound ? createBoundReadRow({ view: this.host, row, evaluation: evaluated, chain: true }) : row
          const value = fn(input, bound ? evaluated : undefined)
          if (evaluated.isDenied()) throw new Error(`computed input denied: ${name}`)
          row[name] = value
          evaluated.values.set(name, { success: true, value })
          if (token) readable.set(name, token)
        } catch (e) {
          row[name] = undefined
          evaluated.values.set(name, { success: false, value: undefined })
          if (import.meta.env.DEV) logger.debug(`计算列 "${name}" 求值失败: ${toErrorMessage(e)}`)
        }
      }
      this._readable.set(row, readable)
    }
  }

  /** 剥离计算列字段，返回浅拷贝；无计算列时返回原对象（零开销）。 */
  strip(data: Partial<DataRow>): Partial<DataRow> {
    if (this.names.size === 0) return data
    const result: Partial<DataRow> = {}
    for (const [key, value] of Object.entries(data)) {
      if (!this.names.has(key)) result[key] = value
    }
    return result
  }

  /** 清空所有状态（DataView.destroy 时调用）。 */
  destroy(): void {
    this._registeredColumns.clear()
    this._configuredColumns.clear()
    this._readable = new WeakMap<DataRow, Map<string, object>>()
    this._namesCache = undefined
    this._ctx = {}
    this._compiledExprKey = undefined
    this._compiledCtxRef = undefined
  }

  // ── 内部：聚合解析器 ─────────────────────────

  /**
   * 构建聚合解析器——子表行解析。
   */
  private _createAggregateResolver(): ComputedColumnAggregateResolver | undefined {
    const ds = this.host.getDataSet()
    if (!ds) return undefined

    const resourceRelations = ds.resourceRelations?.length
      ? ds.getResourceChildRelations(this.host.tableName)
      : []
    return new ComputedColumnAggregateResolver(resourceRelations, ds, this.host.primaryKey)
  }
}
