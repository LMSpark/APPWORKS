/**
 * @module @spark-appworks/spark-data:strategies/dirty-tracking-delegate
 * 职责：提供 spark-data 数据管线中的 dirty tracking delegate 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */
/**
 * DirtyTrackingDelegate — 本地变更追踪委托（三态：新增 / 编辑 / 待删除）
 *
 * ## 背景
 *
 * DataView.rows 与 UI 双向绑定，增删改立即反映到界面，但不自动提交服务端。
 * 本 delegate 追踪三种"本地-only"操作，由 saveChanges() 统一提交。
 *
 * | DataView 方法      | 本地 rows | 服务端 | 追踪类型        |
 * |--------------------|-----------|--------|-----------------|
 * | addRow(data)       | 立即追加  | ❌     | pending create  |
 * | editRowById(id, d) | 立即更新  | ❌     | dirty update    |
 * | removeRow(id)      | 立即删除  | ❌     | pending delete  |
 *
 * ## 行级状态机
 *
 * ```
 * [server-clean]
 *     ├─ editRowById  → [dirty update]
 *     │     └─ removeRow → [pending delete]（清除 dirty）
 *     └─ removeRow    → [pending delete]
 *
 * [pending create]（本地新行，服务端不存在）
 *     ├─ editRowById  → 无需额外标记（行本身就是最新状态）
 *     └─ removeRow    → 取消创建（不产生 server delete）
 * ```
 *
 * ## 快照弱引用策略
 *
 * - **dirty update 快照** (`_dirtySnapshots`)：`WeakRef`——仅用于 diff/撤销，
 *   内存紧张时允许 GC 回收，saveChanges 降级为"提交当前行数据"。
 * - **pending delete 快照** (`_deleteSnapshots`)：强引用——提交失败可将行还原回 UI。
 */

import type { DataRow, DataColumn, CrudResult } from '../types'
import type { DataView } from '../data-view'
import type { CrudDelegate } from './crud-delegate'

// ─────────────────────────────────────────────
// 导出类型
// ─────────────────────────────────────────────

/** 单字段变更记录（from → to） */
export type FieldChange = {
  /** 修改前的原始值 */
  from: unknown
  /** 修改后的当前值 */
  to: unknown}

/** 行级字段变更映射（字段名 → 变更） */
export type RowDiff = {
  [field: string]: FieldChange}

/**
 * saveChanges() 执行结果（三态统计）
 */
export type SaveChangesData = {
  /** 新增行成功提交数 */
  createdCount: number
  /** 编辑行成功保存数 */
  savedCount: number
  /** 删除行成功提交数 */
  deletedCount: number
  /** 总失败数（三态合计） */
  failedCount: number
  /** 失败的行主键列表（可用于精准重试或 UI 高亮） */
  failedIds: Array<string | number>
  /** 失败行的错误详情映射（主键 → 错误消息，用于诊断和 UI 提示） */
  failedErrors: Record<string | number, string>}

// ─────────────────────────────────────────────
// DirtyTrackingDelegate
// ─────────────────────────────────────────────

/** Dirty Tracking Delegate 的语义模型。 */
export class DirtyTrackingDelegate {

    /** 创建 Dirty Tracking Delegate 实例。 */
constructor(
    private readonly getColumns: () => readonly DataColumn[] | undefined,
    private readonly getComputedColumnNames: () => ReadonlySet<string>,
    private readonly getPrimaryKeyFields: () => string[],
  ) {}

  // ── 列元数据辅助 ─────────────────────────

  /**
   * 获取"可变业务列"名集合（排除主键、计算列、权限元字段）。
   *
   * 快照和 diff 只关注这些字段，避免把主键变更、计算列中间值、
   * `lingma_sys_*` 后端权限字段混入脏数据对比。
   *
   * 无列定义时回退到 null（getDiff/snapshot 降级为全字段对比）。
   */
  private _getEditableFields(): Set<string> | null {
    const columns = this.getColumns()
    if (!columns?.length) return null

    // 实际生效的主键字段（可能来自 override 而非 col.isPrimaryKey）
    const pkFields = new Set(this.getPrimaryKeyFields())
    const computedNames = this.getComputedColumnNames()
    const fields = new Set<string>()
    for (const col of columns) {
      // 排除主键列——同时兼顾 col.isPrimaryKey 标记和实际 primaryKey 覆盖
      if (col.isPrimaryKey || pkFields.has(col.name)) continue
      if (col.computeExpression || computedNames.has(col.name)) continue
      fields.add(col.name)
    }
    return fields.size > 0 ? fields : null
  }

  // ── pending creates ───────────────────────
  /** 待新增行数据（pk → row），行从未在服务端存在，强引用保留 */
  private _createRows = new Map<string | number, DataRow>()
  /** 待新增行主键集合（与 _createRows 同步维护，避免每次 getter 创建新 Set） */
  private _createIds = new Set<string | number>()

  // ── dirty updates ─────────────────────────
  /** 被手工编辑的行主键集合 */
  private _dirtyIds = new Set<string | number>()
  /**
   * 首次编辑前的行快照（弱引用）。
   * 连续编辑不覆盖——diff 始终相对于服务端原始值。
   * WeakRef：GC 压力下允许回收，saveChanges 降级为"提交当前数据"。
   */
  private _dirtySnapshots = new Map<string | number, WeakRef<DataRow>>()

  // ── pending deletes ───────────────────────
  /** 待删除行主键集合 */
  private _deleteIds = new Set<string | number>()
  /** 待删除行快照（强引用：提交失败时需还原 UI） */
  private _deleteSnapshots = new Map<string | number, DataRow>()

  // ─────────────────────────────────────────────
  // 写入 — 新增
  // ─────────────────────────────────────────────

  /**
   * 将行登记为"待新增"。
   *
   * 特殊情况：若该 id 曾被登记为待删除（先删后撤销），则改为撤销删除，
   * 新行直接进入 clean 状态（仅还原，不重复追踪新增）。
   */
  trackCreate(id: string | number, row: DataRow): void {
    if (this._deleteIds.has(id)) {
      // 撤销删除：清除 pending delete，行回到 clean
      this._deleteIds.delete(id)
      this._deleteSnapshots.delete(id)
      return
    }
    this._createRows.set(id, row)
    this._createIds.add(id)
  }

  /**
   * 取消指定行的"待新增"登记。
   *
   * 场景：pending create 行在未保存前被用户删除——无需 server delete，直接遗忘。
   * @returns 该行是否确实是 pending create（false = 不是，无操作）
   */
  cancelCreate(id: string | number): boolean {
    if (!this._createRows.has(id)) return false
    this._createRows.delete(id)
    this._createIds.delete(id)
    return true
  }

  // ─────────────────────────────────────────────
  // 写入 — 编辑
  // ─────────────────────────────────────────────

  /**
   * 标注指定行为手工编辑（dirty update）。
   *
   * - pending create 行：**忽略**（新行本身就是最终数据，无需记录"编辑前"快照）
   * - 连续编辑同一行：**不覆盖快照**（diff 始终相对于服务端原始值）
   *
   * @param id       行主键
   * @param original 编辑**前**的行对象（浅拷贝后以 WeakRef 包装）
   */
  markDirty(id: string | number, original: DataRow): void {
    if (this._createRows.has(id)) return   // pending create 不需要 dirty 追踪
    if (!this._dirtyIds.has(id)) {
      // 只快照可变业务列（排除 pk、计算列、lingma_sys_*）
      const fields = this._getEditableFields()
      if (fields) {
        const snapshot: DataRow = {}
        for (const f of fields) snapshot[f] = original[f]
        this._dirtySnapshots.set(id, new WeakRef(snapshot))
      } else {
        const snapshot = Object.fromEntries(
          Object.entries(original).filter(([field]) => !field.startsWith('lingma_sys_')),
        )
        this._dirtySnapshots.set(id, new WeakRef(snapshot))
      }
    }
    this._dirtyIds.add(id)
  }

  /**
   * 清除指定行（或全部）的 dirty-update 状态。
   * @param id 不传则清除全部
   */
  clearDirty(id?: string | number): void {
    if (id !== undefined) {
      this._dirtyIds.delete(id)
      this._dirtySnapshots.delete(id)
    } else {
      this._dirtyIds.clear()
      this._dirtySnapshots.clear()
    }
  }

  // ─────────────────────────────────────────────
  // 写入 — 删除
  // ─────────────────────────────────────────────

  /**
   * 将行登记为"待删除"。
   *
   * 特殊情况：若该行是 pending create（从未在服务端存在），
   * 直接取消新增，**不产生** server delete。
   *
   * @param id       行主键
   * @param snapshot 被删除行的完整快照（强引用，提交失败时用于还原 UI）
   */
  trackDelete(id: string | number, snapshot: DataRow): void {
    if (this._createRows.has(id)) {
      // 本地新行被删除 → 取消新增即可，不产生 server delete
      this.cancelCreate(id)
      return
    }
    // 若该行同时有 dirty update，清除（待删除优先于待保存）
    this._dirtyIds.delete(id)
    this._dirtySnapshots.delete(id)

    if (!this._deleteIds.has(id)) {
      this._deleteIds.add(id)
      this._deleteSnapshots.set(id, { ...snapshot })
    }
  }

  /**
   * 撤销指定行（或全部）的 pending-delete 状态。
   *
   * 注意：撤销仅清除追踪记录，**不**自动将行还原回 rows——
   * 由调用方（DataView）负责将快照 appendRow 回去。
   */
  cancelDelete(id?: string | number): void {
    if (id !== undefined) {
      this._deleteIds.delete(id)
      this._deleteSnapshots.delete(id)
    } else {
      this._deleteIds.clear()
      this._deleteSnapshots.clear()
    }
  }

  /**
   * 清除全部三态追踪状态（视图全量刷新 / 销毁时调用）。
   */
  clearAll(): void {
    this._createRows.clear()
    this._createIds.clear()
    this._dirtyIds.clear()
    this._dirtySnapshots.clear()
    this._deleteIds.clear()
    this._deleteSnapshots.clear()
  }

  // ─────────────────────────────────────────────
  // 读取
  // ─────────────────────────────────────────────

  /**
   * 是否存在任意未提交的本地变更（新增 / 编辑 / 待删除）。
   *
   * @param id 不传 → 整个视图；传入 id → 指定行（任意态）
   */
  hasPendingChanges(id?: string | number): boolean {
    if (id !== undefined) {
      return this._createRows.has(id) || this._dirtyIds.has(id) || this._deleteIds.has(id)
    }
    return this._createRows.size > 0 || this._dirtyIds.size > 0 || this._deleteIds.size > 0
  }

  /**
   * 是否有 dirty-update 未提交。
   * @param id 不传 → 整体；传入 id → 指定行
   */
  isDirty(id?: string | number): boolean {
    if (id !== undefined) return this._dirtyIds.has(id)
    return this._dirtyIds.size > 0
  }

  /** 指定行是否是待新增状态 */
  isPendingCreate(id: string | number): boolean { return this._createRows.has(id) }

  /** 指定行是否是待删除状态 */
  isPendingDelete(id: string | number): boolean { return this._deleteIds.has(id) }

  /** 全部 dirty-update 行主键（ReadonlySet） */
  get dirtyRowIds(): ReadonlySet<string | number> { return this._dirtyIds }

  /** 待新增行主键（ReadonlySet——与 _createRows 同步，零分配） */
  get pendingCreateIds(): ReadonlySet<string | number> {
    return this._createIds
  }

  /** 待新增行数组 */
  get pendingCreateRows(): DataRow[] { return [...this._createRows.values()] }

  /** 待删除行主键（ReadonlySet） */
  get pendingDeleteIds(): ReadonlySet<string | number> { return this._deleteIds }

  /**
   * 获取 pending-delete 行的快照（提交失败时用于还原 UI）。
   */
  getPendingDeleteSnapshot(id: string | number): DataRow | undefined {
    return this._deleteSnapshots.get(id)
  }

  /**
   * 获取指定行在首次手工编辑**前**的快照（dirty update 专用）。
   *
   * @returns 快照；行不脏或弱引用已被 GC 回收时返回 undefined
   */
  getOriginal(id: string | number): DataRow | undefined {
    return this._dirtySnapshots.get(id)?.deref()
  }

  /**
   * 计算指定行的字段级变更明细（dirty update 专用）。
   *
   * @param id      行主键
   * @param current 当前行对象
   * @returns 字段名 → `{ from, to }`；行不脏或快照已被 GC 回收时返回 `{}`
   */
  getDiff(id: string | number, current: DataRow): RowDiff {
    const original = this._dirtySnapshots.get(id)?.deref()
    if (!original) return {}

    const diff: RowDiff = {}
    // 优先按列定义的可变业务字段对比；无列定义时降级为全字段
    const fields = this._getEditableFields()
    if (fields) {
      for (const key of fields) {
        const fromVal = original[key]
        const toVal = current[key]
        if (!Object.is(fromVal, toVal)) diff[key] = { from: fromVal, to: toVal }
      }
    } else {
      const allKeys = new Set([...Object.keys(original), ...Object.keys(current)])
      for (const key of allKeys) {
        const fromVal = original[key]
        const toVal = current[key]
        if (!Object.is(fromVal, toVal)) diff[key] = { from: fromVal, to: toVal }
      }
    }
    return diff
  }

  // ─────────────────────────────────────────────
  // 批量保存（三阶段提交）
  // ─────────────────────────────────────────────

  /**
   * 将所有待提交变更（新增 / 手工编辑 / 删除）逐条保存到服务端。
   *
   * 提交顺序：**新增 → 更新 → 删除**（依赖关系最少）。
   * 任意单行失败**不中断**后续行；失败行保留对应追踪状态。
   *
   * @param host 提供行数据读写的宿主（DataView 实现此接口）
   * @param crud CRUD 网络操作接口（通常为 CrudDelegate）
   * @param ids  指定要保存的行主键列表；不传则保存全部待提交变更
   */
  async executeChanges(
    host: DataView,
    crud: CrudDelegate,
    ids?: Array<string | number>,
  ): Promise<CrudResult<SaveChangesData>> {
    const filterByIds = ids !== undefined ? new Set(ids) : undefined

    if (filterByIds === undefined && !this.hasPendingChanges()) {
      return {
        success: true,
        message: '没有待提交的变更',
        data: { createdCount: 0, savedCount: 0, deletedCount: 0, failedCount: 0, failedIds: [], failedErrors: {} },
      }
    }

    let createdCount = 0
    let savedCount = 0
    let deletedCount = 0
    const failedIds: Array<string | number> = []
    const failedErrors: Record<string | number, string> = {}

    // O(n) 构建 pk→row 索引，避免循环内 O(n) rows.find
    const pkToRow = new Map<string | number, DataRow>()
    for (const r of host.rows) {
      const pk = host.getPkKey(r)
      if (pk !== undefined) pkToRow.set(pk, r)
    }

    // ── 1. 新增 ──────────────────────────────────────────────
    const createIds = filterByIds
      ? [...this.pendingCreateIds].filter(id => filterByIds.has(id))
      : [...this.pendingCreateIds]

    for (const tempId of createIds) {
      const row = pkToRow.get(tempId)
      if (!row) { this.cancelCreate(tempId); continue }
      try {
        const result = await crud.createRecord(host.stripComputedColumns({ ...row }))
        if (result.success) {
          this.cancelCreate(tempId)
          if (result.data) {
            host.deleteRowById(tempId)
            host.appendRow(result.data)
          }
          createdCount++
        } else {
          failedIds.push(tempId)
          failedErrors[tempId] = result.message ?? '创建失败'
        }
      } catch (err) {
        failedIds.push(tempId)
        failedErrors[tempId] = err instanceof Error ? err.message : String(err)
      }
    }

    // ── 2. 更新 ──────────────────────────────────────────────
    const updateIds = filterByIds
      ? [...this.dirtyRowIds].filter(id => filterByIds.has(id))
      : [...this.dirtyRowIds]

    for (const id of updateIds) {
      const row = pkToRow.get(id)
      if (!row) { this.clearDirty(id); continue }
      try {
        const serverPk = host.buildServerPk(row)
        const result = await crud.updateRecord(id, host.stripComputedColumns({ ...row }), serverPk)
        if (result.success) {
          this.clearDirty(id)
          savedCount++
        } else {
          failedIds.push(id)
          failedErrors[id] = result.message ?? '更新失败'
        }
      } catch (err) {
        failedIds.push(id)
        failedErrors[id] = err instanceof Error ? err.message : String(err)
      }
    }

    // ── 3. 删除 ──────────────────────────────────────────────
    const deleteIds = filterByIds
      ? [...this.pendingDeleteIds].filter(id => filterByIds.has(id))
      : [...this.pendingDeleteIds]

    for (const id of deleteIds) {
      try {
        const snapshot = this.getPendingDeleteSnapshot(id)
        const serverPk = snapshot ? host.buildServerPk(snapshot) : { [host.primaryKey]: id }
        const result = await crud.deleteRecord(id, serverPk)
        if (result.success) {
          this.cancelDelete(id)
          deletedCount++
        } else {
          failedIds.push(id)
          failedErrors[id] = result.message ?? '删除失败'
        }
      } catch (err) {
        failedIds.push(id)
        failedErrors[id] = err instanceof Error ? err.message : String(err)
      }
    }

    const failedCount = failedIds.length
    return {
      success: failedCount === 0,
      message: failedCount === 0
        ? `新增 ${createdCount} 行，更新 ${savedCount} 行，删除 ${deletedCount} 行`
        : `成功：新增 ${createdCount}，更新 ${savedCount}，删除 ${deletedCount}；失败 ${failedCount} 行`,
      data: { createdCount, savedCount, deletedCount, failedCount, failedIds, failedErrors },
    }
  }

  // ─────────────────────────────────────────────
  // 生命周期
  // ─────────────────────────────────────────────

  /** 销毁——清理所有内存状态 */
  destroy(): void { this.clearAll() }
}
