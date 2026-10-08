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

const logger = Logger('DataView:Computed')

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
  private readonly relMap = new Map<string, DataResourceRelation>()

  constructor(
    relations: readonly DataResourceRelation[],
    private readonly dataSet: DataSet,
    private readonly defaultParentField: string,
  ) {
    for (const relation of relations) {
      if (!this.relMap.has(relation.childTable)) {
        this.relMap.set(relation.childTable, relation)
      }
    }
  }

  resolveChildRows(childRef: string, parentRow: DataRow): DataRow[] {
    const rel = this.relMap.get(childRef)
    if (!rel) return []
    const childView = this.dataSet.getView(rel.childTable, 'default')
    if (!childView) return []
    const mappings = rel.fieldMappings ?? (rel.childField === undefined
      ? []
      : [{
          parentResourceField: rel.parentField ?? this.defaultParentField,
          childResourceField: rel.childField,
        }])
    if (mappings.length === 0) return []
    return childView.rows.filter(row => mappings.every(mapping => {
      const parentValue = parentRow[mapping.parentResourceField]
      return parentValue !== null
        && parentValue !== undefined
        && row[mapping.childResourceField] === parentValue
    }))
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
): ComputedColumnFn {
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
  const _cache = new Map<string, DataRow[]>()

  const getChildRows = (ref: string): DataRow[] => {
    let cached = _cache.get(ref)
    if (cached === undefined) {
      cached = resolver.resolveChildRows(ref, _row)
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

  return (row: DataRow) => {
    _row = row
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
function compileColumnsExpressions(
  columns: ReadonlyArray<{ name: string; computeExpression?: string }>,
  ctx?: ComputedColumnContext,
  resolver?: ComputedColumnAggregateResolver,
): Map<string, ComputedColumnFn> {
  const result = new Map<string, ComputedColumnFn>()
  for (const col of columns) {
    if (!col.computeExpression) continue
    try {
      result.set(col.name, compileExpression(col.computeExpression, ctx, resolver))
    } catch (error) {
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
  private _columns = new Map<string, ComputedColumnFn>()
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
    return (this._namesCache ??= new Set(this._columns.keys()))
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
    if (columns.length === 0) return

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
    this._compiledExprKey = exprFingerprint
    this._compiledCtxRef = this._ctx

    const compiled = compileColumnsExpressions(columns, this._ctx, this._createAggregateResolver())
    for (const [name, fn] of compiled) this._columns.set(name, fn)
    this._namesCache = undefined
  }

  /** 注册计算列（已编译函数）。 */
  register(name: string, fn: ComputedColumnFn): void {
    this._columns.set(name, fn)
    this._namesCache = undefined
  }

  /** 移除计算列定义（已求值的历史数据保留）。 */
  remove(name: string): void {
    this._columns.delete(name)
    this._namesCache = undefined
  }

  /** 对行集合就地写入所有计算列。无计算列时短路返回，零开销。 */
  apply(rows: DataRow[]): void {
    if (this._columns.size === 0 || rows.length === 0) return
    for (const row of rows) {
      for (const [name, fn] of this._columns) {
        try { row[name] = fn(row) }
        catch (e) {
          row[name] = undefined
          if (import.meta.env.DEV) {
            logger.debug(`计算列 "${name}" 求值失败: ${toErrorMessage(e)}`)
          }
        }
      }
    }
  }

  /** 剥离计算列字段，返回浅拷贝；无计算列时返回原对象（零开销）。 */
  strip(data: Partial<DataRow>): Partial<DataRow> {
    if (this._columns.size === 0) return data
    const result: Partial<DataRow> = {}
    for (const [key, value] of Object.entries(data)) {
      if (!this._columns.has(key)) result[key] = value
    }
    return result
  }

  /** 清空所有状态（DataView.destroy 时调用）。 */
  destroy(): void {
    this._columns.clear()
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
