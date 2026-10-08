/**
 * @module @spark-appworks/spark-data:strategies/cascade-delegate
 * 职责：提供 spark-data 数据管线中的 cascade delegate 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */

import { Logger } from '@spark-appworks/spark-utils'
import { RequestState, type DataViewCascade } from '../types'
import type { DataView } from '../data-view'
import { getParentRows } from '../core/utils'

const logger = Logger('DataView:Cascade')

/** Cascade Delegate 的语义模型。 */
export class CascadeDelegate {
  /** 级联取消订阅句柄 */
  private cascadeUnsubscribers: Array<() => void> = []
  /** 待处理的级联请求 */
  private pendingCascadeRequest?: {
    requestId: number
    cancel: () => void
  } | undefined
  /** 级联请求 ID 计数器 */
  private nextCascadeRequestId = 0

    /** 创建 Cascade Delegate 实例。 */
constructor(
    private host: DataView,
  ) {}

  // ─────────────────────────────────────────────
  // 级联订阅
  // ─────────────────────────────────────────────

  /**
   * 建立级联监听
   *
  * 沿 parent 链找到 DataSet → 查询以本视图为 child 的关系 →
  * 按 dependencyType 订阅对应的父视图独立事件。
   */
  setupCascade(): void {
    this.teardownCascade()

    // DataTable 尚未绑定时 dataSet 为 undefined（如独立创建的 DataView），直接跳过
    const dataSet = this.host.dataSet
    if (!dataSet) return
    const parentRels = dataSet.getParentCascades(this.host.tableName, this.host.viewId)

    for (const rel of parentRels) {
      const parentView = dataSet.getView(rel.parentTable, rel.parentViewId)
      if (!parentView) throw new Error(`父视图 ${rel.parentTable}:${rel.parentViewId} 不存在，请检查 DataSet 级联配置`)

      const handler = () => {
        try {
          this.respondToParentChange(rel, parentView)
        } catch (error) {
          logger.error(`级联加载 ${this.host.tableName}:${this.host.viewId} 失败`, error)
        }
      }

      // rowsChanged + cleared 对所有 dep 类型都相关
      parentView.events.on('rowsChanged', handler)
      parentView.events.on('cleared', handler)
      this.cascadeUnsubscribers.push(
        () => parentView.events.off('rowsChanged', handler),
        () => parentView.events.off('cleared', handler),
      )

      const dep = rel.dependencyType ?? 'currentRow'
      if (dep === 'currentRow') {
        parentView.events.on('currentRowChanged', handler)
        this.cascadeUnsubscribers.push(() => parentView.events.off('currentRowChanged', handler))
      } else if (dep === 'selectedRows') {
        parentView.events.on('selectedRowsChanged', handler)
        this.cascadeUnsubscribers.push(() => parentView.events.off('selectedRowsChanged', handler))
      }
      // allRows / pagedRows: 只响应 rowsChanged + cleared（已订阅）
    }
  }

  /** 清理全部级联订阅 */
  teardownCascade(): void {
    for (const unsub of this.cascadeUnsubscribers) unsub()
    this.cascadeUnsubscribers = []
  }

  /** 取消待处理的级联请求 */
  cancelPendingRequest(): void {
    if (this.pendingCascadeRequest) {
      this.pendingCascadeRequest.cancel()
      this.pendingCascadeRequest = undefined
    }
  }

  // ─────────────────────────────────────────────
  // 级联响应
  // ─────────────────────────────────────────────

  /**
   * 响应父视图状态变化
   *
   * 由 setupCascade 中按 dependencyType 订阅的具体事件触发，
   * 无需再做 changeType 过滤——订阅时已完成过滤。
   */
  private respondToParentChange(rel: DataViewCascade, parentView: DataView): void {
    // 子视图正在等待该父视图完成时，当前 requestData 会在 await 后读取最新父状态。
    // 此处再次 refresh 会与原请求并发并把 requestState 留在 Loading。
    if (this.host.requestState === RequestState.Preparing) return

    // 取消待处理的级联请求
    if (this.pendingCascadeRequest) {
      this.pendingCascadeRequest.cancel()
      logger.debug(`取消级联请求 ${this.pendingCascadeRequest.requestId} (父视图 ${rel.parentTable}:${rel.parentViewId} 变化)`)
      this.pendingCascadeRequest = undefined
    }

    const parentRows = getParentRows(parentView, rel.dependencyType ?? 'currentRow')

    if (!parentRows.length) {
      this.host.clearAll()
      return
    }

    if (rel.autoLoad !== false) {
      // 无 API 配置（内联静态数据）→ 内存级联过滤，无需发起网络请求
      if (!this.host.crudService) {
        logger.debug(`内存级联过滤 ${this.host.tableName}:${this.host.viewId}（无 API 配置）`)
        this.host.applyInMemoryCascade(rel, parentRows)
        return
      }

      const requestId = ++this.nextCascadeRequestId
      let cancelled = false

      void this.host.refresh()
        .then(() => {
          if (!cancelled && this.pendingCascadeRequest?.requestId === requestId) {
            this.pendingCascadeRequest = undefined
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            logger.error(`级联加载 ${this.host.tableName}:${this.host.viewId} 失败 [${requestId}]`, err)
          }
        })

      this.pendingCascadeRequest = {
        requestId,
        cancel: () => { cancelled = true }
      }
    }
  }

  // ─────────────────────────────────────────────
  // 生命周期
  // ─────────────────────────────────────────────

  /** 销毁 — 清理订阅 + 取消待处理请求 */
  destroy(): void {
    this.teardownCascade()
    this.cancelPendingRequest()
  }
}
