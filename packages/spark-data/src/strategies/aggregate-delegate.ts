/**
 * @module @spark-appworks/spark-data:strategies/aggregate-delegate
 * 职责：提供 spark-data 数据管线中的 aggregate delegate 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */
/**
 * AggregateDelegate — 视图级聚合委托
 *
 * 持有本地aggregateResult（已加载行聚合）和selectionAggregateResult（选中行聚合）的缓存状态，
 * 并在行数据或选中行变更时完成重算与事件通知。DataView按查询owner的能力拦截禁止的远程旧配置；本委托不推断服务端统计。
 *
 * `computeAggregateRow` 纯函数也在此文件定义（原位于 computed-column-delegate.ts）。
 */

import type { DataRow, AggregateColumnConfig, AggregateType, AggregateResultRow } from '../types'

/** Aggregate Delegate Options 的调用配置。 */
type AggregateDelegateOptions = {
  /** 返回当前视图聚合配置（每次调用时读取，支持运行时动态配置）。 */
  readonly getAggregates: () => Record<string, AggregateColumnConfig>
  /** 通知订阅方全部聚合行已更新（aggregateResult + selectionAggregateResult）。 */
  readonly emitSummaryChanged: () => void
  /** 通知订阅方仅选中行聚合已更新（selectionAggregateResult）。 */
  readonly emitSelectionSummaryChanged: () => void
}

/** Aggregate Recompute Options 的调用配置。 */
type AggregateRecomputeOptions = {
    /** emit 字段。 */
readonly emit?: boolean
}

// ─────────────────────────────────────────────
// 聚合行计算（纯函数）
// ─────────────────────────────────────────────

/**
 * 根据视图级聚合配置（`view.aggregates`）计算聚合输出行。
 *
 * **纯函数**——无副作用，不依赖 DataView/DataSet 实例，方便独立测试。
 *
 * @param aggregates 聚合配置：`{ outputName: AggregateColumnConfig }`，对象 key 是结果行字段名
 * @param rows       参与聚合的行集合
 * @returns 聚合输出行对象；aggregates 为空时返回 `{}`，rows 为空但 aggregates 非空时按类型返回默认输出
 */
export function computeAggregateRow(
  aggregates: Record<string, AggregateColumnConfig>,
  rows: readonly DataRow[],
): AggregateResultRow {
  const aggCols = Object.entries(aggregates)
  if (aggCols.length === 0) return {}

  // 空行时提前返回每种聚合类型的默认零值
  if (rows.length === 0) {
    const result: AggregateResultRow = {}
    for (const [name, config] of aggCols) {
      switch (config.type) {
        case 'sum':   result[name] = 0; break
        case 'count': result[name] = 0; break
        case 'avg':   result[name] = 0; break
        case 'min':   result[name] = undefined; break
        case 'max':   result[name] = undefined; break
        case 'join':  result[name] = ''; break
        default: break
      }
    }
    return result
  }

  // ── 单遍扫描：一次遍历 rows 更新所有聚合列的累加器 ──
  type Acc = { type: AggregateType; field: string; name: string; count: number; sum: number; extremum: number; separator: string; segments: string[]}
  const accs: Acc[] = aggCols.map(([name, config]) => ({
    type: config.type, field: config.field ?? name, name,
    count: 0,       // count / avg 非空计数
    sum: 0,         // sum / avg 累加
    extremum: config.type === 'min' ? Infinity : config.type === 'max' ? -Infinity : 0,
    separator: config.separator ?? ', ',
    segments: [],
  }))

  for (const row of rows) {
    for (const a of accs) {
      const raw = row[a.field]
      switch (a.type) {
        case 'sum':   a.sum += Number(raw ?? 0); break
        case 'count': if (raw !== null && raw !== undefined) a.count++; break
        case 'avg': {
          const v = Number(raw ?? NaN)
          if (!isNaN(v)) { a.sum += v; a.count++ }
          break
        }
        case 'min': { const v = Number(raw); if (!isNaN(v) && v < a.extremum) a.extremum = v; break }
        case 'max': { const v = Number(raw); if (!isNaN(v) && v > a.extremum) a.extremum = v; break }
        case 'join':  if (raw !== null && raw !== undefined && raw !== '') a.segments.push(String(raw)); break
        default: break
      }
    }
  }

  const result: AggregateResultRow = {}
  for (const a of accs) {
    switch (a.type) {
      case 'sum':   result[a.name] = a.sum; break
      case 'count': result[a.name] = a.count; break
      case 'avg':   result[a.name] = a.count > 0 ? a.sum / a.count : 0; break
      case 'min':   result[a.name] = a.extremum === Infinity ? undefined : a.extremum; break
      case 'max':   result[a.name] = a.extremum === -Infinity ? undefined : a.extremum; break
      case 'join':  result[a.name] = a.segments.join(a.separator); break
      default: break
    }
  }

  return result
}

// ─────────────────────────────────────────────
// AggregateDelegate
// ─────────────────────────────────────────────

/**
 * 视图级聚合委托——持有并管理 aggregateResult / selectionAggregateResult 缓存状态。
 *
 * - `recompute(rows, selectedRows)` — 行数据变更时全量重算（含选中行），发射 summaryChanged
 * - `recomputeSelection(selectedRows)` — 仅选中行变更时局部重算，发射 selectionSummaryChanged
 */
export class AggregateDelegate {
  private _summaryRow: AggregateResultRow = {}
  private _selectionSummaryRow: AggregateResultRow = {}

  private readonly getAggregates: () => Record<string, AggregateColumnConfig>
  private readonly emitSummaryChanged: () => void
  private readonly emitSelectionSummaryChanged: () => void

    /** 创建 Aggregate Delegate 实例。 */
constructor(options: AggregateDelegateOptions) {
    this.getAggregates = options.getAggregates
    this.emitSummaryChanged = options.emitSummaryChanged
    this.emitSelectionSummaryChanged = options.emitSelectionSummaryChanged
  }

  get aggregateResult(): Readonly<AggregateResultRow> { return this._summaryRow }
  get selectionAggregateResult(): Readonly<AggregateResultRow> { return this._selectionSummaryRow }

  /**
   * 全量重算（行数据变更时调用，必须在 `_applyComputedColumns` 之后）。
   *
   * @param rows         全部行（已含计算列求值结果）
   * @param selectedRows 当前选中行（无选中时传空数组）
   */
  recompute(rows: DataRow[], selectedRows: DataRow[], options?: AggregateRecomputeOptions): void {
    const aggs = this.getAggregates()
    if (Object.keys(aggs).length === 0) return
    this._summaryRow = computeAggregateRow(aggs, rows)
    this._selectionSummaryRow = selectedRows.length > 0
      ? computeAggregateRow(aggs, selectedRows)
      : {}
    if (options?.emit !== false) {
      this.emitSummaryChanged()
    }
  }

  /**
   * 仅重算选中行聚合（选中行变更时调用，行数据本身未变）。
   *
   * @param selectedRows 当前选中行
   */
  recomputeSelection(selectedRows: DataRow[], options?: AggregateRecomputeOptions): void {
    const aggs = this.getAggregates()
    if (Object.keys(aggs).length === 0) return
    this._selectionSummaryRow = selectedRows.length > 0
      ? computeAggregateRow(aggs, selectedRows)
      : {}
    if (options?.emit !== false) {
      this.emitSelectionSummaryChanged()
    }
  }
}
