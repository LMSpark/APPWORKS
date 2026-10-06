/**
 * @module @spark-appworks/spark-data:strategies/crud-delegate
 * 职责：提供 spark-data 数据管线中的 crud delegate 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */

import { Logger } from '@spark-appworks/spark-utils'
import { isDataRow } from '../core/data-row-guards'
import type { CrudService } from '../crud-service'
import type {
  DataRow, CrudResult, BatchResult,
  CrudOperationConfig, QueryParams,
} from '../types'
import type { ValidationResult, ValidationError } from '../validation'
import type { DataView } from '../data-view'
import type { CrudLifecycleEvent, CrudOperation } from './types'
import { createCrudLifecycleEvent } from './types'

const logger = Logger('DataView:CRUD')

/** Emit Crud Lifecycle Fn 的语义模型。 */
type EmitCrudLifecycleFn = {
  (event: CrudLifecycleEvent): void}
/** Mutating Fn 的语义模型。 */
type MutatingFn = {
  (delta: 1 | -1, error?: Error | null): void}

function dataRowFromPartial(row: Partial<DataRow>): DataRow {
  return { ...row }
}

/**
 * CRUD 委托
 *
 * 封装所有 CRUD 相关逻辑，包括数据校验、单条 & 批量操作、导入导出。
 * CrudService 由 DataTable 持有，本委托通过 host.dataTable 获取。
 * 每个操作前后发射 crud:before / crud:after 事件，供业务脚本层拦截和联动。
 */
export class CrudDelegate {

    /** 创建 Crud Delegate 实例。 */
constructor(
    private host: DataView,
    private emitCrudLifecycle: EmitCrudLifecycleFn,
    private emitMutating: MutatingFn,
  ) {}

  /**
   * 包装网络变更操作：emitMutating(+1) → 执行 → emitMutating(-1)
   * 仅在 fireBefore 通过、校验通过后调用，不追踪取消/校验失败。
   */
  private async withMutating<T>(fn: () => Promise<T>): Promise<T> {
    this.emitMutating(1)
    let caughtError: Error | null = null
    try {
      return await fn()
    } catch (error) {
      caughtError = error instanceof Error ? error : new Error(String(error))
      throw error
    } finally {
      this.emitMutating(-1, caughtError)
    }
  }

  // ─────────────────────────────────────────────
  // CrudService 获取
  // ─────────────────────────────────────────────

  /** 确保 CrudService 已初始化，否则抛出 */
  ensureCrudService(): CrudService {
    const svc = this.host.crudService
    if (!svc) throw new Error(`Table ${this.host.tableName} has no API configuration`)
    return svc
  }

  // ─────────────────────────────────────────────
  // 配置 & 校验
  // ─────────────────────────────────────────────

  /** 获取 CRUD 操作配置（超时、重试等） */
  getCrudConfig(): CrudOperationConfig | undefined {
    return this.host.crudConfig
  }

  /** 从数据中剥离计算列字段（提交前调用） */
  private stripComputed(data: Partial<DataRow>): Partial<DataRow> {
    return this.host.stripComputedColumns(data)
  }

  /** 批量剥离计算列 */
  private stripComputedBatch(items: Array<Partial<DataRow>>): Array<Partial<DataRow>> {
    if (this.host.computedColumnNames.size === 0) return items
    return items.map(item => this.host.stripComputedColumns(item))
  }

  /** 校验数据行 */
  private validateRow(row: DataRow): ValidationResult | null {
    if (!this.host.validator) return null
    return this.host.validator.validate(row)
  }

  // ─────────────────────────────────────────────
  // 生命周期事件辅助
  // ─────────────────────────────────────────────

  /**
   * 发射 before 事件，返回是否继续执行
   * @returns `true` = 继续执行，`false` = 已取消
   */
  private fireBefore(operation: CrudOperation, data: unknown): boolean {
    const event = createCrudLifecycleEvent({ operation, phase: 'before', data })
    this.emitCrudLifecycle(event)
    return !event.cancelled
  }

  /** 发射 after 事件（通知性质，不可取消） */
  private fireAfter(operation: CrudOperation, data: unknown, result: CrudResult): void {
    const event = createCrudLifecycleEvent({ operation, phase: 'after', data, result })
    this.emitCrudLifecycle(event)
  }

  /** 创建取消结果 */
  private cancelledResult<T>(operation: string): CrudResult<T> {
    return { success: false, message: `${operation} cancelled by before hook` }
  }

  /** 创建校验失败结果（消除 createRecord/updateRecord 中的重复块） */
  private validationFailedResult<T>(errors: ValidationError[]): CrudResult<T> {
    const msg = errors[0]?.message ?? '数据校验失败'
    return {
      success: false,
      message: `数据校验失败: ${msg}`,
      error: new Error(msg)
    }
  }

  /** 批量校验所有行，返回错误消息列表（消除 batchCreateRecords/batchUpdateRecords 中的重复循环） */
  private collectBatchValidationErrors(items: Array<Partial<DataRow>>): string[] {
    if (!this.host.validator) return []
    const errors: string[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item === undefined) continue
      const result = this.validateRow(dataRowFromPartial(item))
      if (result && !result.valid) {
        errors.push(`第${i + 1}条: ${result.errors[0]?.message ?? '校验失败'}`)
      }
    }
    return errors
  }

  // ─────────────────────────────────────────────
  // 列表查询（供 DataView.loadFromServer 使用）
  // ─────────────────────────────────────────────

  /** 执行列表查询 */
  async list(params?: QueryParams): Promise<CrudResult> {
    return this.ensureCrudService().list(params, this.getCrudConfig())
  }

  // ─────────────────────────────────────────────
  // 单条 CRUD
  // ─────────────────────────────────────────────

  /** 查询单条记录，不修改本地 rows。 */
  async retrieveRecord(pk: Record<string, unknown>): Promise<CrudResult<DataRow>> {
    if (!this.fireBefore('retrieve', pk)) return this.cancelledResult('retrieve')

    const result = await this.ensureCrudService().retrieve<DataRow>(pk, this.getCrudConfig())
    this.fireAfter('retrieve', pk, result)
    return result
  }

  /** 新增记录，成功后追加至 rows */
  async createRecord(data: Partial<DataRow>): Promise<CrudResult<DataRow>> {
    if (!this.fireBefore('create', data)) return this.cancelledResult('create')

    const cleanData = this.stripComputed(data)
    const validationResult = this.validateRow(dataRowFromPartial(cleanData))
    if (validationResult && !validationResult.valid) {
      return this.validationFailedResult(validationResult.errors)
    }

    return this.withMutating(async () => {
      const svc = this.ensureCrudService()
      const result = await svc.create<DataRow>(cleanData, this.getCrudConfig())
      if (result.success && result.data) {
        this.host.appendRow(result.data)   // appendRow 内部已发射 rowsChanged
      }
      this.fireAfter('create', data, result)
      return result
    })
  }

  /**
   * 更新记录，成功后刷新对应行
   * @param id 本地主键值（用于本地 rows 更新）
   * @param data 更新数据
   * @param serverPk 服务端 PK payload（用于 HTTP 请求，可选，默认从 id 构建）
   */
  async updateRecord(
    id: string | number,
    data: Partial<DataRow>,
    serverPk?: Record<string, unknown>,
  ): Promise<CrudResult<DataRow>> {
    if (!this.fireBefore('update', { id, ...data })) return this.cancelledResult('update')

    const cleanData = this.stripComputed(data)
    const originalRow = this.host.rows.find(row => this.host.getPkKey(row) === id)
    const requestData = originalRow
      ? this.stripComputed({ ...originalRow, ...cleanData })
      : cleanData
    const validationTarget = requestData
    const validationResult = this.validateRow(dataRowFromPartial(validationTarget))
    if (validationResult && !validationResult.valid) {
      return this.validationFailedResult(validationResult.errors)
    }

    return this.withMutating(async () => {
      const svc = this.ensureCrudService()
      const pk = serverPk ?? this._extractPkPayload(id, originalRow)
      this.assertBusinessPk(pk)
      const result = await svc.update<DataRow>(pk, requestData, this.getCrudConfig())
      if (result.success && result.data) {
        this.host.updateRowById(id, result.data)
      }
      this.fireAfter('update', { id, ...data }, result)
      return result
    })
  }

  /**
   * 删除记录，成功后从 rows 移除
   * @param id 本地主键值
   * @param serverPk 服务端 PK payload（用于 HTTP 请求，可选，默认从 id 构建）
   */
  async deleteRecord(
    id: string | number,
    serverPk?: Record<string, unknown>,
  ): Promise<CrudResult<boolean>> {
    if (!this.fireBefore('delete', { id })) return this.cancelledResult('delete')

    return this.withMutating(async () => {
      const svc = this.ensureCrudService()
      const row = this.host.rows.find(item => this.host.getPkKey(item) === id)
      const pk = serverPk ?? this._extractPkPayload(id, row)
      this.assertBusinessPk(pk)
      const result = await svc.delete(pk, this.getCrudConfig())
      if (result.success) {
        this.host.deleteRowById(id)
      }
      this.fireAfter('delete', { id }, result)
      return result
    })
  }

  // ─────────────────────────────────────────────
  // 批量 CRUD
  // ─────────────────────────────────────────────

  /** 批量新增 */
  async batchCreateRecords(items: Array<Partial<DataRow>>): Promise<CrudResult<BatchResult>> {
    if (!this.fireBefore('batchCreate', items)) return this.cancelledResult('batchCreate')

    const cleanItems = this.stripComputedBatch(items)
    const validationErrors = this.collectBatchValidationErrors(cleanItems)
    if (validationErrors.length > 0) {
      return {
        success: false,
        message: `批量数据校验失败: ${validationErrors.join('; ')}`,
        error: new Error(validationErrors[0])
      }
    }

    return this.withMutating(async () => {
      const svc = this.ensureCrudService()
      const result = await svc.batchCreate<DataRow>(cleanItems, this.getCrudConfig())
      if (result.success && result.data !== undefined) {
        for (const r of result.data.results) {
          if (r.success && isDataRow(r.data)) this.host.appendRow(r.data)  // 每行 appendRow 内部已发射（防抖合并）
        }
      }
      this.fireAfter('batchCreate', items, result)
      return result
    })
  }

  /** 批量更新（items 中必须包含主键字段，主键名由 host.primaryKey 决定） */
  async batchUpdateRecords(items: Array<Partial<DataRow>>): Promise<CrudResult<BatchResult>> {
    if (!this.fireBefore('batchUpdate', items)) return this.cancelledResult('batchUpdate')

    const cleanItems = this.stripComputedBatch(items)
    const validationErrors = this.collectBatchValidationErrors(cleanItems)
    if (validationErrors.length > 0) {
      return {
        success: false,
        message: `批量数据校验失败: ${validationErrors.join('; ')}`,
        error: new Error(validationErrors[0])
      }
    }

    return this.withMutating(async () => {
      const svc = this.ensureCrudService()
      const result = await svc.batchUpdate<DataRow>(cleanItems, this.getCrudConfig())
      if (result.success && result.data !== undefined) {
        for (const r of result.data.results) {
          if (r.success && isDataRow(r.data)) {
            const record = r.data
            const id = this.host.getPkKey(record)
            if (id !== undefined) this.host.updateRowById(id, record)  // updateRowById 内部已发射
          }
        }
      }
      this.fireAfter('batchUpdate', items, result)
      return result
    })
  }

  /** 批量删除 */
  async batchDeleteRecords(ids: Array<string | number>): Promise<CrudResult<BatchResult>> {
    if (!this.fireBefore('batchDelete', ids)) return this.cancelledResult('batchDelete')

    return this.withMutating(async () => {
      const svc = this.ensureCrudService()
      // 构建 pk→row Map（O(n)），避免 _buildServerPkFromId 每次 O(n) find（O(n²) → O(n)）
      const rowMap = new Map<string | number, DataRow>()
      for (const row of this.host.rows) {
        const pk = this.host.getPkKey(row)
        if (pk !== undefined) rowMap.set(pk, row)
      }
      const pkPayloads = ids.map(id => this._buildServerPkFromIdWithMap(id, rowMap))
      const result = await svc.batchDelete(pkPayloads, this.getCrudConfig())

      if (result.success && result.data) {
        const successIds = new Set<string | number>()
        for (const [i, r] of result.data.results.entries()) {
          const id = ids[i]
          if (r.success && id !== undefined) {
            successIds.add(id)
          }
        }

        for (const id of successIds) {
          this.host.deleteRowById(id)
        }

        if (result.data.failureCount > 0) {
          logger.warn(`批量删除部分失败: ${result.data.failureCount}/${ids.length}`, {
            successCount: result.data.successCount,
            failureCount: result.data.failureCount
          })
        }
      }

      this.fireAfter('batchDelete', ids, result)
      return result
    })
  }

  // ─────────────────────────────────────────────
  // Server PK 构建辅助
  // ─────────────────────────────────────────────

  /**
   * 从本地 ID 构建服务端 PK payload。
   * 从原始行提取业务主键；只有单列业务键可直接使用本地 ID。
   */
  /** 使用预构建 Map 查找行（批量操作用，避免 O(n²)） */
  private _buildServerPkFromIdWithMap(id: string | number, rowMap: Map<string | number, DataRow>): Record<string, unknown> {
    return this._extractPkPayload(id, rowMap.get(id))
  }

  /** 合成主键缺少原始行时禁止提交，不能拆解组合值推测业务字段。 */
  private _extractPkPayload(id: string | number, row: DataRow | undefined): Record<string, unknown> {
    if (row) {
      const result = this.host.buildServerPk(row)
      this.assertBusinessPk(result)
      return result
    }
    if (this.host.primaryKey === '_pk') {
      throw new Error('Cannot submit without the original business primary key fields')
    }
    return { [this.host.primaryKey]: id }
  }

  private assertBusinessPk(pk: Record<string, unknown>): void {
    if (Object.hasOwn(pk, '_pk')) throw new Error('_pk cannot be submitted as a business primary key')
  }

  // ─────────────────────────────────────────────
  // 导入 / 导出
  // ─────────────────────────────────────────────

  /** 导入文件，成功后重置状态并重新走完整编排 */
  async importData(file: File): Promise<CrudResult<{ imported: number; failed: number }>> {
    if (!this.fireBefore('import', file)) return this.cancelledResult('import')

    return this.withMutating(async () => {
      const svc = this.ensureCrudService()
      const result = await svc.importData(file)
      if (result.success) {
        this.host.resetState()
        // fire-and-forget：结果经领域事件通知；捕获异常防止 unhandled rejection
        void this.host.requestData().catch((e: unknown) => {
          logger.error('importData 后 requestData 失败', e)
        })
      }
      this.fireAfter('import', file, result)
      return result
    })
  }

  /** 导出数据 */
  async exportData(params?: QueryParams): Promise<CrudResult<Blob>> {
    return this.ensureCrudService().exportData(params)
  }

  // ─────────────────────────────────────────────
  // 生命周期
  // ─────────────────────────────────────────────

  /** 销毁 — CrudService 由 DataTable 管理，此处无需释放 */
  destroy(): void {
    // CrudService 归属 DataTable，delegate 无持有
  }
}
