/**
 * @module @spark-appworks/spark-data:strategies/selection-delegate
 * 职责：提供 spark-data 数据管线中的 selection delegate 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */

import { Logger } from '@spark-appworks/spark-utils'
import { isDataRow } from '../core/data-row-guards'
import type { DataRow } from '../types'
import type { DataView } from '../data-view'
import { pruneInvalidSelections } from '../core/utils'

const logger = Logger('DataView:Selection')

/** Emit Current Row Changed Fn 的语义模型。 */
type EmitCurrentRowChangedFn = {
  (originatorId?: string): void}
/** Emit Selected Rows Changed Fn 的语义模型。 */
type EmitSelectedRowsChangedFn = {
  (originatorId?: string): void}

/** Selection Delegate 的语义模型。 */
export class SelectionDelegate {

  /** @internal 抑制单选同步（applyAutoFirst 内部用） */
  private _suppressSelectionSync = false

  /** @internal version-cached pk→row Map: reused while host.rows reference is stable */
  private _cachedRows: DataRow[] | undefined
  private _cachedIdToRowMap: Map<string | number, DataRow> | undefined

    /** 创建 Selection Delegate 实例。 */
constructor(
    private host: DataView,
    private emitCurrentRowChanged: EmitCurrentRowChangedFn,
    private emitSelectedRowsChanged: EmitSelectedRowsChangedFn,
  ) {}

  // ─────────────────────────────────────────────
  // 内部辅助
  // ─────────────────────────────────────────────

  /** 检查宿主是否已销毁，已销毁则抛出 */
  private checkDestroyed(): void {
    if (this.host.isDestroyed()) {
      throw new Error(`DataView ${this.host.tableName}:${this.host.viewId} has been destroyed`)
    }
  }

  /** 深度遍历整棵 rows 树（含 nested children） */
  private getAllRows(): DataRow[] {
    const result: DataRow[] = []
    const stack = [...this.host.rows]
    while (stack.length > 0) {
      const row = stack.shift()
      if (!row) continue
      result.push(row)
      const children = row['children']
      if (Array.isArray(children) && children.length > 0) {
        stack.unshift(...children.filter(isDataRow))
      }
    }
    return result
  }

  /** 获取 pk → row 映射（version-cached：行引用不变时复用） */
  private getIdToRowMap(): Map<string | number, DataRow> {
    const rows = this.host.rows
    if (rows === this._cachedRows && this._cachedIdToRowMap) return this._cachedIdToRowMap
    const m = new Map<string | number, DataRow>()
    for (const row of this.getAllRows()) {
      const pk = this.host.getPkKey(row)
      if (pk !== undefined) m.set(pk, row)
    }
    this._cachedRows = rows
    this._cachedIdToRowMap = m
    return m
  }

  // ─────────────────────────────────────────────
  // 自动首选（数据加载后应用）
  // ─────────────────────────────────────────────

  /**
   * 数据加载完成后应用 autoCurrentFirst / autoSelectFirst 逻辑。
   *
   * updateFromServer() 替换了全部行引用，旧的 currentRow/selectedRows 指针已失效。
   * 先强制清零（无事件），再通过正式 setter 写入新值；setter 发射领域事件，
   * DataSet.onAnyViewChange 订阅者（如 SparkPageRenderer）因此能正确收到事件。
   *
   * autoCurrentFirst / autoSelectFirst 彼此独立，各自触发自己的事件。
   * 单选模式下 setCurrentRow 内部会自动同步 selectedRows，这里用
   * _suppressSelectionSync 抑制，让 autoSelectFirst 独立决定。
   */
  applyAutoFirst(): void {
    const host = this.host
    const prevHadCurrent = host._currentRowId !== null
    const prevHadSelected = host._selectedRowIds.length > 0
    host._currentRowId = null
    host._selectedRowIds = []

    const firstRow = host.rows[0] ?? null
    const firstPk = firstRow !== null ? (host.getPkKey(firstRow) ?? null) : null

    // ── autoCurrentFirst ──
    if (host.autoCurrentFirst !== false && firstPk !== null) {
      // 抑制单选同步，让 autoSelectFirst 独立控制
      this._suppressSelectionSync = true
      this._setCurrentId(firstPk)
      this._suppressSelectionSync = false
    } else if (prevHadCurrent) {
      this.emitCurrentRowChanged()
    }

    // ── autoSelectFirst ──
    if (host.autoSelectFirst !== false && firstPk !== null) {
      this._setSelectedIds([firstPk])
    } else if (prevHadSelected) {
      this.emitSelectedRowsChanged()
    }
  }

  // ─────────────────────────────────────────────
  // 底层 PK 操作（所有 setter 汇聚于此）
  // ─────────────────────────────────────────────

  /**
   * 底层：按主键设置当前行（幂等 + 单选同步）
   * @param id - 主键值，null 表示清空
   */
  private _setCurrentId(id: string | number | null, originatorId?: string): void {
    const host = this.host

    // 幂等守卫
    if (id === host._currentRowId) return

    host._currentRowId = id
    this.emitCurrentRowChanged(originatorId)

    if (!this._suppressSelectionSync && !host.isMultiSelect) {
      this._setSelectedIds(id !== null ? [id] : [], originatorId)
    }
  }

  /**
   * 底层：按主键数组设置多选行（幂等：集合相同则跳过）
   */
  private _setSelectedIds(ids: Array<string | number>, originatorId?: string): void {
    const host = this.host
    const oldIds = host._selectedRowIds

    // 幂等守卫：长度 + 集合比较（忽略顺序）
    if (oldIds.length === ids.length) {
      if (ids.length === 0) return
      const oldSet = new Set(oldIds)
      if (ids.every(id => oldSet.has(id))) return
    }

    host._selectedRowIds = [...ids]
    this.emitSelectedRowsChanged(originatorId)
  }

  // ─────────────────────────────────────────────
  // 当前行 / 多选行 setter（行对象入口）
  // ─────────────────────────────────────────────

  /**
   * 设置当前行（通过行对象）
   *
   * 内部提取 PK 后委托给 {@link _setCurrentId}。
   * 外部 UI 层推荐使用 {@link setCurrentRowById}。
   */
  setCurrentRow(row: DataRow | null, originatorId?: string): void {
    if (row === null) {
      this._setCurrentId(null, originatorId)
      return
    }
    const pk = this.host.getPkKey(row) ?? null
    if (pk === null) {
      logger.warn('setCurrentRow: 行缺少主键，无法存储', { tableName: this.host.tableName, viewId: this.host.viewId })
      return
    }
    this._setCurrentId(pk, originatorId)
  }

  /**
   * 设置多选行（通过行对象数组）
   *
   * 内部提取 PK 后委托给 {@link _setSelectedIds}。
   * 外部 UI 层推荐使用 {@link setSelectedRowsById}。
   */
  setSelectedRows(rows: DataRow[], originatorId?: string): void {
    const host = this.host
    if (!Array.isArray(rows)) {
      logger.warn('setSelectedRows 收到非数组参数', { rows, tableName: host.tableName, viewId: host.viewId })
      return
    }
    const ids: Array<string | number> = []
    for (const r of rows) {
      const pk = host.getPkKey(r)
      if (pk !== undefined) ids.push(pk)
    }
    this._setSelectedIds(ids, originatorId)
  }

  // ─────────────────────────────────────────────
  // 按主键操作
  // ─────────────────────────────────────────────

  /**
   * 根据主键设置当前行
   *
   * @param id - 主键值，null 表示清空
   * @param originatorId - UI 操作来源实例 ID（可选）
   * @returns 是否成功（行不存在时返回 false；null 始终返回 true）
   */
  setCurrentRowById(id: string | number | null, originatorId?: string): boolean {
    if (id === null) {
      this._setCurrentId(null, originatorId)
      return true
    }
    this.checkDestroyed()

    if (!this.getIdToRowMap().has(id)) {
      logger.warn('setCurrentRowById: 行不存在', {
        tableName: this.host.tableName,
        viewId: this.host.viewId,
        primaryKey: this.host.primaryKey,
        id,
        totalRows: this.host.rows.length
      })
      return false
    }

    this._setCurrentId(id, originatorId)
    return true
  }

  /**
   * 根据主键数组设置多选行
   *
   * @param ids - 主键值数组
   * @param originatorId - UI 操作来源实例 ID（可选）
   * @param options.strict - 严格模式：任何 ID 找不到则抛错（默认 false）
   * @returns 成功找到的行数
   */
  setSelectedRowsById(
    ids: Array<string | number>,
    originatorId?: string,
    options?: { strict?: boolean },
  ): number {
    this.checkDestroyed()
    const host = this.host

    if (!Array.isArray(ids)) {
      logger.warn('setSelectedRowsById 收到非数组参数', { ids, tableName: host.tableName, viewId: host.viewId })
      return 0
    }

    if (ids.length === 0) {
      this._setSelectedIds([], originatorId)
      return 0
    }

    const idToRow = this.getIdToRowMap()
    const validIds: Array<string | number> = []
    const notFoundIds: Array<string | number> = []

    for (const id of ids) {
      if (idToRow.has(id)) {
        validIds.push(id)
      } else {
        notFoundIds.push(id)
      }
    }

    if (options?.strict && notFoundIds.length > 0) {
      const error = new Error(
        `setSelectedRowsById (strict): 有 ${notFoundIds.length} 个 ID 找不到对应行`
      )
      logger.error('setSelectedRowsById: 严格模式下有 ID 找不到', {
        tableName: host.tableName,
        viewId: host.viewId,
        primaryKey: host.primaryKey,
        notFoundIds,
        totalRows: host.rows.length
      })
      throw error
    }

    if (notFoundIds.length > 0) {
      logger.warn('setSelectedRowsById: 部分 ID 找不到对应行', {
        tableName: host.tableName,
        viewId: host.viewId,
        primaryKey: host.primaryKey,
        notFoundIds,
        foundCount: validIds.length,
        totalRows: host.rows.length
      })
    }

    this._setSelectedIds(validIds, originatorId)
    return validIds.length
  }

  /**
   * 清空选中行
   */
  clearSelectedRows(): void {
    this._setSelectedIds([])
  }

  /**
   * 添加行到选中集（去重）
   *
   * @returns 实际添加的行数
   */
  addSelectedRows(rows: DataRow[]): number {
    this.checkDestroyed()
    const host = this.host

    if (!Array.isArray(rows)) {
      logger.warn('addSelectedRows 收到非数组参数', { rows, tableName: host.tableName, viewId: host.viewId })
      return 0
    }
    if (rows.length === 0) return 0

    const selectedSet = new Set(host._selectedRowIds)
    const toAddIds: Array<string | number> = []
    for (const r of rows) {
      const pk = host.getPkKey(r)
      if (pk !== undefined && !selectedSet.has(pk)) toAddIds.push(pk)
    }
    if (toAddIds.length === 0) return 0

    host._selectedRowIds = [...host._selectedRowIds, ...toAddIds]
    this.emitSelectedRowsChanged()
    return toAddIds.length
  }

  /**
   * 从选中集移除行
   *
   * @returns 实际移除的行数
   */
  removeSelectedRows(rows: DataRow[]): number {
    this.checkDestroyed()
    const host = this.host

    if (!Array.isArray(rows)) {
      logger.warn('removeSelectedRows 收到非数组参数', { rows, tableName: host.tableName, viewId: host.viewId })
      return 0
    }
    if (rows.length === 0 || host._selectedRowIds.length === 0) return 0

    const toRemoveSet = new Set<string | number>()
    for (const r of rows) {
      const pk = host.getPkKey(r)
      if (pk !== undefined) toRemoveSet.add(pk)
    }
    if (toRemoveSet.size === 0) return 0

    const newIds = host._selectedRowIds.filter(id => !toRemoveSet.has(id))
    const removedCount = host._selectedRowIds.length - newIds.length
    if (removedCount > 0) {
      host._selectedRowIds = newIds
      this.emitSelectedRowsChanged()
    }
    return removedCount
  }

  /**
   * 根据主键数组添加选中行
   *
   * @param options.strict - 严格模式：任何 ID 找不到则抛错
   * @returns 实际添加的行数
   */
  addSelectedRowsById(
    ids: Array<string | number>,
    options?: { strict?: boolean }
  ): number {
    this.checkDestroyed()
    const host = this.host

    if (!Array.isArray(ids)) {
      logger.warn('addSelectedRowsById 收到非数组参数', { ids, tableName: host.tableName, viewId: host.viewId })
      return 0
    }
    if (ids.length === 0) return 0

    const idToRow = this.getIdToRowMap()
    const selectedSet = new Set(host._selectedRowIds)
    const toAddIds: Array<string | number> = []
    const notFoundIds: Array<string | number> = []

    for (const id of ids) {
      if (selectedSet.has(id)) continue
      if (idToRow.has(id)) {
        toAddIds.push(id)
      } else {
        notFoundIds.push(id)
      }
    }

    if (options?.strict && notFoundIds.length > 0) {
      throw new Error(`addSelectedRowsById (strict): 有 ${notFoundIds.length} 个 ID 找不到对应行`)
    }
    if (notFoundIds.length > 0) {
      logger.warn('addSelectedRowsById: 部分 ID 找不到对应行', {
        tableName: host.tableName, viewId: host.viewId, notFoundIds, foundCount: toAddIds.length,
      })
    }
    if (toAddIds.length === 0) return 0

    host._selectedRowIds = [...host._selectedRowIds, ...toAddIds]
    this.emitSelectedRowsChanged()
    return toAddIds.length
  }

  /**
   * 根据主键数组移除选中行
   *
   * @returns 实际移除的行数
   */
  removeSelectedRowsById(ids: Array<string | number>): number {
    this.checkDestroyed()
    const host = this.host

    if (!Array.isArray(ids)) {
      logger.warn('removeSelectedRowsById 收到非数组参数', { ids, tableName: host.tableName, viewId: host.viewId })
      return 0
    }
    if (ids.length === 0 || host._selectedRowIds.length === 0) return 0

    const toRemoveSet = new Set(ids)
    const newIds = host._selectedRowIds.filter(id => !toRemoveSet.has(id))
    const removedCount = host._selectedRowIds.length - newIds.length
    if (removedCount > 0) {
      host._selectedRowIds = newIds
      this.emitSelectedRowsChanged()
    }
    return removedCount
  }

  // ─────────────────────────────────────────────
  // 状态清理
  // ─────────────────────────────────────────────

  /**
   * 清理已不在 rows 中的选中状态
   *
   * 在 rows 被部分刷新（非整体替换）时调用，同步清理失效的指针。
   * @returns 是否发生了清理
   */
  cleanupInvalidSelections(): boolean {
    const host = this.host
    const rowPkSet = new Set(this.getIdToRowMap().keys())
    const { currentRowPruned, selectedRowsPruned } = pruneInvalidSelections(host, rowPkSet)

    if (currentRowPruned) {
      this.emitCurrentRowChanged()
    }
    if (selectedRowsPruned) {
      this.emitSelectedRowsChanged()
    }

    return currentRowPruned || selectedRowsPruned
  }

  // ─────────────────────────────────────────────
  // 值序列化层（value / labels / label）
  // ─────────────────────────────────────────────

  /**
   * 选中行的序列化字符串（供表单 v-model / API 传值使用）。
   *
   * 读取：按 valueField → 主键值 → 分隔符拼接。
   * 写入：按分隔符拆分 token → 匹配行 → setSelectedRowsById。
   */
  get value(): string {
    const host = this.host
    if (host.valueField !== undefined) {
      const rows = host.selectedRows
      if (Array.isArray(host.valueField)) {
        const fields = host.valueField
        const values: string[] = []
        for (const r of rows) {
          const parts = fields.map(f => {
            const v: unknown = r[f]
            return v !== undefined && v !== null ? String(v) : ''
          })
          if (parts.some(p => p !== '')) values.push(parts.join(':'))
        }
        return host.selectionDelimiter ? values.join(host.selectionDelimiter) : (values[0] ?? '')
      }
      const field = host.valueField
      const values: string[] = []
      for (const r of rows) {
        const v: unknown = r[field]
        if (v !== undefined && v !== null) values.push(String(v))
      }
      return host.selectionDelimiter ? values.join(host.selectionDelimiter) : (values[0] ?? '')
    }
    // 默认：主键快速路径
    if (!host.selectionDelimiter) {
      return host._selectedRowIds.length > 0 ? String(host._selectedRowIds[0]) : ''
    }
    return host._selectedRowIds.join(host.selectionDelimiter)
  }

  set value(value: string | null | undefined) {
    const host = this.host
    if (!value) { this.clearSelectedRows(); return }

    const tokens = host.selectionDelimiter
      ? value.split(host.selectionDelimiter).map(s => s.trim()).filter(s => s !== '')
      : [value.trim()].filter(s => s !== '')
    if (tokens.length === 0) { this.clearSelectedRows(); return }

    if (host.valueField !== undefined) {
      if (Array.isArray(host.valueField)) {
        const fields = host.valueField
        const tokenSet = new Set(tokens)
        const matchedPks: Array<string | number> = []
        for (const row of this.getAllRows()) {
          const parts = fields.map(f => {
            const v: unknown = row[f]
            return v !== undefined && v !== null ? String(v) : ''
          })
          if (tokenSet.has(parts.join(':'))) {
            const pk = host.getPkKey(row)
            if (pk !== undefined) matchedPks.push(pk)
          }
        }
        this.setSelectedRowsById(matchedPks)
        return
      }
      const field = host.valueField
      const tokenSet = new Set(tokens)
      const matchedPks: Array<string | number> = []
      for (const row of this.getAllRows()) {
        const fv: unknown = row[field]
        if (fv !== undefined && fv !== null && tokenSet.has(String(fv))) {
          const pk = host.getPkKey(row)
          if (pk !== undefined) matchedPks.push(pk)
        }
      }
      this.setSelectedRowsById(matchedPks)
      return
    }

    // 默认：token 作为主键值，类型与首行主键保持一致
    const firstRow = host.rows[0]
    const samplePkType = firstRow ? typeof host.getPkKey(firstRow) : 'string'
    const ids: Array<string | number> = samplePkType === 'number'
      ? tokens.map(s => { const n = Number(s); return Number.isFinite(n) ? n : s })
      : tokens
    this.setSelectedRowsById(ids)
  }

  /**
   * 选中行的显示标签数组（供渲染 tag 使用）。
   *
   * 有 labelField 时取对应字段值；否则回退到主键字符串。
   */
  get labels(): string[] {
    const host = this.host
    if (!host.labelField) {
      return host._selectedRowIds.map(id => String(id))
    }
    const field = host.labelField
    const rowMap = this.getIdToRowMap()
    return host._selectedRowIds.map(id => {
      const row = rowMap.get(id)
      if (!row) return String(id)
      const v: unknown = row[field]
      return v !== undefined && v !== null ? String(v) : String(id)
    })
  }

  /**
   * 当前行的显示标签（供单选 tag / 面包屑使用）。
   *
   * 有 labelField 时取 currentRow[labelField]；否则回退到主键字符串；无当前行返回 null。
   */
  get label(): string | null {
    const host = this.host
    if (host._currentRowId === null) return null
    if (!host.labelField) return String(host._currentRowId)
    const row = host.currentRow
    if (!row) return String(host._currentRowId)
    const v: unknown = row[host.labelField]
    return v !== undefined && v !== null ? String(v) : String(host._currentRowId)
  }
}
