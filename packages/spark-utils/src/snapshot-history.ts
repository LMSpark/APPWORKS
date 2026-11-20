/**
 * @module @spark-appworks/spark-utils:snapshot-history
 * 职责：提供框架无关基础设施 snapshot-history 能力，围绕 SnapshotHistory 支撑 capability、HTTP、日志、脚本类型或历史快照。
 * 边界：保持底层工具包纯净，不依赖 Vue、spark-data 或应用壳层，也不承载业务配置。
 * AI用途：需要跨包复用基础能力或确认底层协议时，用本模块理解 snapshot-history。
 */
/**
 * 通用快照历史管理器 — push / undo / redo / cursor。
 *
 * 设计目标：
 * 1. 纯 TypeScript，零框架依赖。
 * 2. 供 SparkNodeTree 和 DataSetCrudTool 共用，消除重复的 _history[] + _cursor 模式。
 * 3. 内存级轻量快照，非持久化（StorageAdapter 面向 localStorage，不同场景）。
 */
export class SnapshotHistory<T> {
  private readonly _snapshots: T[] = []
  private _cursor = -1

    /** 创建 Snapshot History 实例。 */
constructor(private readonly _limit = 50) {
    if (!Number.isInteger(_limit) || _limit < 0) {
      this._limit = 50
    }
  }

  /**
   * 追加快照。截断 cursor 之后的前进条目（标准分支语义），超出限额时移除最旧条目。
   */
  push(snapshot: T): void {
    if (this._limit <= 0) return

    // 截断 redo 分支
    if (this._cursor < this._snapshots.length - 1) {
      this._snapshots.splice(this._cursor + 1)
    }
    this._snapshots.push(snapshot)
    this._cursor = this._snapshots.length - 1

    // 限幅
    if (this._limit > 0 && this._snapshots.length > this._limit) {
      const excess = this._snapshots.length - this._limit
      this._snapshots.splice(0, excess)
      this._cursor = Math.max(0, this._cursor - excess)
    }
  }

  /**
   * 撤销：cursor 后退一步，返回前一个快照；不可撤销时返回 null。
   */
  undo(): T | null {
    if (!this.canUndo) return null
    this._cursor--
    return this._snapshots[this._cursor] ?? null
  }

  /**
   * 重做：cursor 前进一步，返回下一个快照；不可重做时返回 null。
   */
  redo(): T | null {
    if (!this.canRedo) return null
    this._cursor++
    return this._snapshots[this._cursor] ?? null
  }

  get canUndo(): boolean {
    return this._cursor > 0
  }

  get canRedo(): boolean {
    return this._cursor < this._snapshots.length - 1
  }

  /**
   * 当前游标位置（0-based）。-1 表示空。
   */
  get cursor(): number {
    return this._cursor
  }

  /**
   * 当前游标指向的快照；空时返回 null。
   */
  get current(): T | null {
    return this._snapshots[this._cursor] ?? null
  }

  /**
   * 快照总数。
   */
  get length(): number {
    return this._snapshots.length
  }

  /**
   * 清空全部历史。
   */
  clear(): void {
    this._snapshots.length = 0
    this._cursor = -1
  }
}
