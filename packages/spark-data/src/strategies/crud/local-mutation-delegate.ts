/**
 * @module @spark-appworks/spark-data:strategies/crud/local-mutation-delegate
 * 职责：提供 spark-data 数据管线中的 local mutation delegate 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */
/**
 * LocalMutationDelegate — 本地内存变更委托
 *
 * 承载 DataView 的本地行数据同步逻辑：
 *   - updateFromServer : 将服务端响应同步到 rows / total / page / pageSize
 *   - appendRow        : 追加单行
 *   - updateRowById    : 按主键就地更新行，同步选中状态引用
 *   - deleteRowById    : 按主键删除行，清理选中状态
 *   - replaceRows      : 整批替换行，清理无效选中引用
 *
 * 私有辅助：
 *   - buildRowIndexMap : O(n) 构建 row→index 映射（加速 updateRowById 行对象替换）
 */

import type { DataRow } from '../../types'
import type { DataView } from '../../data-view'
import { buildPkSet, pruneInvalidSelections } from '../../core/utils'

/** Emit Rows Changed Fn 的语义模型。 */
type EmitRowsChangedFn = {
  (options?: { selectionChanged?: boolean }): void}
/** Post Mutation Fn 的语义模型。 */
type PostMutationFn = {
  (affectedRows: DataRow[] | 'all' | null): void}

/** Local Mutation Delegate 的语义模型。 */
export class LocalMutationDelegate {
    /** 创建 Local Mutation Delegate 实例。 */
constructor(
    private readonly host: DataView,
    private readonly emitRowsChanged: EmitRowsChangedFn,
    private readonly postMutation?: PostMutationFn,
  ) {}

  // ─────────────────────────────────────────────
  // 私有辅助
  // ─────────────────────────────────────────────

  private hasSelectionStateChanged(before: {
    currentRowId: string | number | null
    selectedRowIds: Array<string | number>
  }): boolean {
    const host = this.host
    if (before.currentRowId !== host._currentRowId) return true
    if (before.selectedRowIds.length !== host._selectedRowIds.length) return true
    return before.selectedRowIds.some((id, index) => id !== host._selectedRowIds[index])
  }

  /** 构建 row → index 映射（O(n)），供 updateRowById 原地更新 rowIndexMap 复用 */
  buildRowIndexMap(rows: DataRow[]): Map<DataRow, number> {
    const m = new Map<DataRow, number>()
    let i = 0
    for (const row of rows) m.set(row, i++)
    return m
  }

  // ─────────────────────────────────────────────
  // 公共 API
  // ─────────────────────────────────────────────

  /**
   * 将服务端响应同步到本地字段（rows / total / page / pageSize）
   */
  updateFromServer(
    data: { rows?: DataRow[]; total?: number; page?: number; pageSize?: number } | DataRow[],
  ): void {
    const h = this.host
    if (Array.isArray(data)) {
      h.rows = [...data]
    } else {
      if (data.rows) h.rows = [...data.rows]
      if (data.total !== undefined) h.total = data.total
      if (data.page !== undefined) h.page = data.page
      if (data.pageSize !== undefined) h.pageSize = data.pageSize
    }
    // 清除索引缓存（行数据变更后缓存失效）
    h.rowIndexMap = undefined
    this.postMutation?.('all')
  }

  /** 本地追加一行，发射 rowsChanged */
  appendRow(row: DataRow): void {
    this.host.rows = [...this.host.rows, row]
    this.host.rowIndexMap = undefined   // 新行未加入缓存，直接失效
    this.postMutation?.([row])
    this.emitRowsChanged()
  }

  /**
   * 本地按主键部分更新一行，发射 rowsChanged
   * 同步 currentRow / selectedRows 引用（引用已变，UI 需感知）
   * @returns 是否成功（行不存在时 false）
   */
  updateRowById(id: string | number, data: Partial<DataRow>): boolean {
    const h = this.host
    const idx = h.rows.findIndex(r => h.getPkKey(r) === id)
    if (idx < 0) return false

    const oldRow = h.rows[idx]
    if (!oldRow) return false

    // L3: 拦截主键变更——data 中不允许修改主键字段值，否则选中状态指针悬空
    // 使用 effectivePkFields 而非 primaryKey，确保自动合成 _pk 时仍校验真实字段
    const pkFields = h.effectivePkFields
    for (const field of pkFields) {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        const newVal = data[field]
        const oldVal = oldRow[field]
        if (newVal !== oldVal) {
          throw new Error(
            `updateRowById: 不允许修改主键字段 "${field}"（旧值=${String(oldVal)}, 新值=${String(newVal)}）。` +
            `如需更换主键，请先 deleteRowById 旧行再 appendRow 新行。`
          )
        }
      }
    }

    const newRow = { ...oldRow, ...data }
    const rowsCopy = [...h.rows]
    rowsCopy[idx] = newRow
    h.rows = rowsCopy
    // 行对象已替换：在 Map 中原地更新 O(1)，避免 updateRowById 时全量重建
    if (h.rowIndexMap) {
      h.rowIndexMap.delete(oldRow)
      h.rowIndexMap.set(newRow, idx)
    }

    // 主键未变，_currentRowId / _selectedRowIds 仍有效。
    // Phase 4 M5: 仅发射 rows 事件，订阅方从 getter 获取最新行对象引用。
    this.postMutation?.([newRow])
    this.emitRowsChanged()
    return true
  }

  /**
   * 本地按主键删除一行，清理选中引用，发射 rowsChanged
   * @returns 是否成功（行不存在时 false）
   */
  deleteRowById(id: string | number): boolean {
    const h = this.host
    const selectionBefore = {
      currentRowId: h._currentRowId,
      selectedRowIds: [...h._selectedRowIds],
    }
    const idx = h.rows.findIndex(r => h.getPkKey(r) === id)
    if (idx < 0) return false

    h.rows = h.rows.filter((_, i) => i !== idx)
    h.rowIndexMap = undefined  // 行集合已变，缓存失效

    // Phase 4 M5: 先更新内部状态，再统一发射 rows 事件（防抖 16ms）。
    // 不单独发射 currentRow/selectedRows 事件——订阅方从 rows 事件回调重新读取 getter 即可
    // 获得最新状态，避免即时事件先于防抖 rows 事件到达导致的时序反转。
    if (h._currentRowId === id) {
      h._currentRowId = null
    }

    if (h._selectedRowIds.length > 0) {
      const newIds = h._selectedRowIds.filter(sid => sid !== id)
      if (newIds.length !== h._selectedRowIds.length) {
        h._selectedRowIds = newIds
      }
    }

    this.postMutation?.(null)
    if (this.hasSelectionStateChanged(selectionBefore)) {
      this.emitRowsChanged({ selectionChanged: true })
    } else {
      this.emitRowsChanged()
    }
    return true
  }

  /** 本地整批替换所有行，清理无效选中引用，发射 rowsChanged */
  replaceRows(rows: DataRow[]): void {
    const h = this.host
    const selectionBefore = {
      currentRowId: h._currentRowId,
      selectedRowIds: [...h._selectedRowIds],
    }
    h.rows = [...rows]
    h.rowIndexMap = undefined  // 行集合已替换，缓存失效

    // Phase 5 M4: 委托 pruneInvalidSelections 清理已失效的选中状态（纯状态修改，不发事件）
    const validPks = buildPkSet(rows, r => h.getPkKey(r))
    pruneInvalidSelections(h, validPks)

    this.postMutation?.('all')
    if (this.hasSelectionStateChanged(selectionBefore)) {
      this.emitRowsChanged({ selectionChanged: true })
    } else {
      this.emitRowsChanged()
    }
  }
}
