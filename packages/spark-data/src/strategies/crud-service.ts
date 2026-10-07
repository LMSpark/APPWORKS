/**
 * @module @spark-appworks/spark-data:strategies/crud-service
 * 职责：提供 spark-data 数据管线中的 crud service 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */
/**
 * 业务层网络CRUD服务
 *
 * 基于 spark-utils HTTP客户端，封装标准CRUD操作
 * 与 DataSet/DataTable 深度集成，支持权限和数据转换
 */

import { HttpClientBase, createRequest, Logger, toError, isRecord } from '@spark-appworks/spark-utils'
import type {
  RequestConfig
} from '@spark-appworks/spark-utils'
import type {
  CrudApi,
  HttpEndpoint,
  DataRow,
  CrudResult,
  QueryParams,
  BatchResult,
  CrudOperationConfig,
  DataSetTransactionRequest,
  DataSetTransactionResponse,
} from '../types'
import { resolveUrlTemplate } from '../core/url-template'

const UNRESOLVED_URL_TEMPLATE_RE = /:\w+|\{\w+\}/

/** 批量操作默认并发度 */
const DEFAULT_BATCH_CONCURRENCY = 5

type BatchExecutionOptions<T> = {
  endpoint: HttpEndpoint
  items: T[]
  config?: Partial<RequestConfig>
  concurrency?: number
  onProgress?: (completed: number, total: number) => void}

function isHttpClient(value: unknown): value is HttpClientBase {
  return value instanceof HttpClientBase
}

// ===== 接口定义 =====

// 接口已在 types.ts 中定义，此处不再重复

/**
 * 业务层CRUD服务
 *
 * 封装网络请求，提供类型安全的CRUD操作
 * 自动处理权限、数据转换、分页等业务逻辑
 */
export class CrudService {
  private http: HttpClientBase
  private logger = Logger('CrudService')
  private endpointContextProvider?: (() => Record<string, unknown>) | undefined

  // ===== 构造函数 =====

  /**
   * 创建CRUD服务实例
   * @param api CRUD API配置
   * @param httpConfigOrClient 可选：HTTP 客户端配置对象 **或** 已有 HttpClientBase 实例（共享 auth/拦截器）
   */
  constructor(
    private api: CrudApi,
    httpConfigOrClient?: Partial<RequestConfig> | HttpClientBase,
    endpointContextProvider?: () => Record<string, unknown>
  ) {
    this.endpointContextProvider = endpointContextProvider
    if (isHttpClient(httpConfigOrClient)) {
      // M5: 传入现有 HttpClientBase 实例，跳过 createRequest（共享 auth/拦截器）
      this.http = httpConfigOrClient
    } else {
      this.http = httpConfigOrClient
        ? createRequest(httpConfigOrClient)
        : createRequest()
    }
  }

  /**
   * 获取内部 HTTP 客户端实例（供 TreeManager 等模块共享拦截器/认证/配置）
   *
   * @returns HttpClientBase 实例
   */
  getHttpClient(): HttpClientBase {
    return this.http
  }

  // ===== 基础CRUD操作 =====

  /**
   * 创建记录
   * @param data 记录数据
   * @param config CRUD操作配置（包含权限快照）
   * @returns CRUD操作结果
   */
  async create<T extends Record<string, unknown> = DataRow>(
    data: Partial<T>,
    config?: CrudOperationConfig
  ): Promise<CrudResult<T>> {
    if (!this.api.create) {
      return this.errorResult('Create API not configured')
    }

    try {
      const requestConfig = this.buildRequestConfig(config)
      const sanitizedData = this.sanitizeDataForUpload(data)
      const result = await this.executeEndpoint<T>(this.api.create, sanitizedData, requestConfig)
      this.logger.info('记录创建成功', { data: result })
      return { success: true, data: result }
    } catch (error) {
      this.logger.error('记录创建失败', error)
      return this.errorResult('Create failed', error)
    }
  }

  /**
   * 查询单条记录
   * @param pk 服务端 PK payload（如 { id: 1 } 或 { orderId: 1, productId: 10 }）
   * @param config CRUD操作配置（包含权限快照）
   * @returns CRUD操作结果
   */
  async retrieve<T extends Record<string, unknown> = DataRow>(
    pk: Record<string, unknown>,
    config?: CrudOperationConfig
  ): Promise<CrudResult<T>> {
    if (!this.api.retrieve) {
      return this.errorResult('Retrieve API not configured')
    }

    try {
      const endpointConfig = this.api.retrieve
      const endpoint = this.resolveEndpoint(endpointConfig, pk)
      const requestConfig = this.buildRequestConfig(config)
      let result: T
      switch (endpointConfig.method ?? 'GET') {
        case 'POST':
          result = await this.http.post<T>(endpoint.url, pk, {
            ...requestConfig,
            headers: { ...endpoint.headers, ...requestConfig?.headers }
          })
          break
        case 'PUT':
          result = await this.http.put<T>(endpoint.url, pk, {
            ...requestConfig,
            headers: { ...endpoint.headers, ...requestConfig?.headers }
          })
          break
        case 'PATCH':
          result = await this.http.patch<T>(endpoint.url, pk, {
            ...requestConfig,
            headers: { ...endpoint.headers, ...requestConfig?.headers }
          })
          break
        case 'GET':
          result = await this.http.get<T>(endpoint.url, endpoint.params, {
            ...requestConfig,
            headers: { ...endpoint.headers, ...requestConfig?.headers }
          })
          break
        case 'DELETE':
          throw new Error('Retrieve API does not support DELETE')
        default:
          throw new Error(`Retrieve API method is not supported: ${endpointConfig.method}`)
      }
      this.logger.info('记录查询成功', { pk, data: result })
      return { success: true, data: result }
    } catch (error) {
      this.logger.error('记录查询失败', { pk }, error)
      return this.errorResult('Retrieve failed', error)
    }
  }

  /**
   * 更新记录
   * @param pk 服务端 PK payload（如 { id: 1 } 或 { orderId: 1, productId: 10 }）
   * @param data 更新数据
   * @param config CRUD操作配置（包含权限快照）
   * @returns CRUD操作结果
   */
  async update<T extends Record<string, unknown> = DataRow>(
    pk: Record<string, unknown>,
    data: Partial<T>,
    config?: CrudOperationConfig
  ): Promise<CrudResult<T>> {
    if (!this.api.update) {
      return this.errorResult('Update API not configured')
    }

    try {
      const requestConfig = this.buildRequestConfig(config)
      const sanitizedData = this.sanitizeDataForUpload(data)
      const updateData = { ...sanitizedData, ...pk }
      const result = await this.executeEndpoint<T>(this.api.update, updateData, requestConfig)
      this.logger.info('记录更新成功', { pk, data: result })
      return { success: true, data: result }
    } catch (error) {
      this.logger.error('记录更新失败', { pk }, error)
      return this.errorResult('Update failed', error)
    }
  }

  /**
   * 删除记录
   * @param pk 服务端 PK payload（如 { id: 1 } 或 { orderId: 1, productId: 10 }）
   * @param config CRUD操作配置（包含权限快照）
   * @returns CRUD操作结果
   */
  async delete(
    pk: Record<string, unknown>,
    config?: CrudOperationConfig
  ): Promise<CrudResult<boolean>> {
    if (!this.api.delete) {
      return this.errorResult('Delete API not configured')
    }

    try {
      const requestConfig = this.buildRequestConfig(config)
      await this.executeEndpoint(this.api.delete, pk, requestConfig)
      this.logger.info('记录删除成功', { pk })
      return { success: true, data: true }
    } catch (error) {
      this.logger.error('记录删除失败', { pk }, error)
      return this.errorResult('Delete failed', error)
    }
  }

  /**
   * 查询列表（支持分页）
   * @param params 查询参数（包含权限令牌）
   * @param config CRUD操作配置（包含权限快照）
   * @returns CRUD操作结果
   */
  async list(
    params?: QueryParams,
    config?: CrudOperationConfig
  ): Promise<CrudResult> {
    if (!this.api.list) {
      return this.errorResult('List API not configured')
    }

    try {
      const endpoint = this.api.list
      const resolvedEndpoint = this.resolveEndpoint(endpoint)
      const queryParams = this.buildQueryParams(params, endpoint)
      const requestConfig = this.buildRequestConfig(config)
      const mergedQueryParams = { ...(resolvedEndpoint.params ?? {}), ...queryParams }
      const transformedRequest = config?.transformRequest === undefined
        ? mergedQueryParams
        : config.transformRequest(mergedQueryParams)

      let result: unknown
      switch (endpoint.method ?? 'POST') {
        case 'GET':
          if (!isRecord(transformedRequest)) {
            throw new Error('List GET transformRequest 必须返回对象参数')
          }
          result = await this.http.get<unknown>(resolvedEndpoint.url, transformedRequest, {
            ...requestConfig,
            headers: { ...resolvedEndpoint.headers, ...requestConfig?.headers }
          })
          break
        case 'POST':
          result = await this.http.post<unknown>(resolvedEndpoint.url, config?.transformRequest === undefined
            ? { query: transformedRequest }
            : transformedRequest, {
            ...requestConfig,
            headers: { ...resolvedEndpoint.headers, ...requestConfig?.headers }
          })
          break
        case 'PUT':
        case 'PATCH':
        case 'DELETE':
          throw new Error(`List API only supports GET or POST, got ${endpoint.method}`)
        default:
          throw new Error(`List API only supports GET or POST, got ${endpoint.method}`)
      }

      if (config?.transformResponse !== undefined) {
        result = config.transformResponse(result, mergedQueryParams)
      }
      this.logger.info('列表查询成功', { params, count: this.getResultCount(result) })
      return { success: true, data: result }
    } catch (error) {
      this.logger.error('列表查询失败', { params }, error)
      return this.errorResult('List failed', error)
    }
  }

    /** 执行 execute Transaction 操作。 */
async executeTransaction<T = DataSetTransactionResponse>(
    request: DataSetTransactionRequest,
    endpoint?: HttpEndpoint,
    config?: CrudOperationConfig,
  ): Promise<CrudResult<T>> {
    const transactionEndpoint = endpoint ?? this.api.transaction
    if (!transactionEndpoint) {
      return this.errorResult('Transaction API not configured')
    }

    try {
      const requestConfig = this.buildRequestConfig(config)
      const result = await this.executeEndpointRaw<T>(transactionEndpoint, request, requestConfig)
      this.logger.info('事务提交成功', { operationCount: request.operations.length })
      return { success: true, data: result }
    } catch (error) {
      this.logger.error('事务提交失败', error)
      return this.errorResult('Transaction failed', error)
    }
  }

  // ===== 批量操作 =====

  /**
   * 批量创建
   * @param items 记录数据数组
   * @param config CRUD操作配置（包含权限快照）
   * @returns 批量操作结果
   */
  async batchCreate<T extends Record<string, unknown> = DataRow>(
    items: Array<Partial<T>>,
    config?: CrudOperationConfig
  ): Promise<CrudResult<BatchResult>> {
    if (!this.api.batch?.create) {
      return this.errorResult('Batch create API not configured')
    }

    try {
      const requestConfig = this.buildRequestConfig(config)
      const sanitizedItems = items.map(item => this.sanitizeDataForUpload(item))
      const results = await this.executeBatch({
        endpoint: this.api.batch.create,
        items: sanitizedItems,
        ...(requestConfig === undefined ? {} : { config: requestConfig }),
      })
      const successCount = results.filter(r => r.success).length
      this.logger.info('批量创建完成', { total: items.length, success: successCount })
      return this.buildBatchResult(results, successCount)
    } catch (error) {
      this.logger.error('批量创建失败', error)
      return this.errorResult('Batch create failed', error)
    }
  }

  /**
   * 批量更新
   * @param items 更新数据数组（必须包含主键字段）
   * @param config CRUD操作配置（包含权限快照）
   * @returns 批量操作结果
   */
  async batchUpdate<T extends Record<string, unknown> = DataRow>(
    items: Array<Partial<T>>,
    config?: CrudOperationConfig
  ): Promise<CrudResult<BatchResult>> {
    if (!this.api.batch?.update) {
      return this.errorResult('Batch update API not configured')
    }

    try {
      const requestConfig = this.buildRequestConfig(config)
      const sanitizedItems = items.map(item => this.sanitizeDataForUpload(item))
      const results = await this.executeBatch({
        endpoint: this.api.batch.update,
        items: sanitizedItems,
        ...(requestConfig === undefined ? {} : { config: requestConfig }),
      })
      const successCount = results.filter(r => r.success).length
      this.logger.info('批量更新完成', { total: items.length, success: successCount })
      return this.buildBatchResult(results, successCount)
    } catch (error) {
      this.logger.error('批量更新失败', error)
      return this.errorResult('Batch update failed', error)
    }
  }

  /**
   * 批量删除
   * @param pks 服务端 PK payload 数组（如 [{ id: 1 }, { id: 2 }]）
   * @param config 请求配置
   * @returns 批量操作结果
   */
  async batchDelete(
    pks: Array<Record<string, unknown>>,
    config?: CrudOperationConfig
  ): Promise<CrudResult<BatchResult>> {
    if (!this.api.batch?.delete) {
      return this.errorResult('Batch delete API not configured')
    }

    try {
      const requestConfig = this.buildRequestConfig(config)
      const results = await this.executeBatch({
        endpoint: this.api.batch.delete,
        items: pks,
        ...(requestConfig === undefined ? {} : { config: requestConfig }),
      })
      const successCount = results.filter(r => r.success).length
      this.logger.info('批量删除完成', { total: pks.length, success: successCount })
      return this.buildBatchResult(results, successCount)
    } catch (error) {
      this.logger.error('批量删除失败', error)
      return this.errorResult('Batch delete failed', error)
    }
  }

  // ===== 导入导出 =====

  /**
   * 导入数据
   * @param file 上传的文件
   * @param config 请求配置
   * @returns 导入结果
   */
  async importData(
    file: File,
    config?: Partial<RequestConfig>
  ): Promise<CrudResult<{ imported: number; failed: number }>> {
    if (!this.api.import) {
      return this.errorResult('Import API not configured')
    }

    try {
      const formData = new FormData()
      formData.append('file', file)

      // 不要手动设置 Content-Type：浏览器 / HTTP 客户端会自动添加 boundary
      const result = await this.executeEndpoint<{ imported: number; failed: number }>(this.api.import, formData, {
        ...config,
        headers: {
          ...config?.headers
        }
      })

      this.logger.info('数据导入成功', result)
      return { success: true, data: result }
    } catch (error) {
      this.logger.error('数据导入失败', error)
      return this.errorResult('Import failed', error)
    }
  }

  /**
   * 导出数据
   * @param params 导出参数
   * @param config CRUD操作配置（包含权限快照）
   * @returns 导出结果（Blob）
   */
  async exportData(
    params?: QueryParams,
    config?: CrudOperationConfig
  ): Promise<CrudResult<Blob>> {
    if (!this.api.export) {
      return this.errorResult('Export API not configured')
    }

    try {
      const endpoint = this.api.export
      const resolvedEndpoint = this.resolveEndpoint(endpoint)
      const queryParams = this.buildQueryParams(params, endpoint)
      const requestConfig = this.buildRequestConfig(config)
      const mergedQueryParams = { ...(resolvedEndpoint.params ?? {}), ...queryParams }

      const result = await this.http.requestFull<Blob>({
        url: resolvedEndpoint.url,
        method: endpoint.method ?? 'GET',
        params: mergedQueryParams,
        responseType: 'blob',
        ...requestConfig,
        headers: { ...resolvedEndpoint.headers, ...requestConfig?.headers }
      })

      this.logger.info('数据导出成功')
      return { success: true, data: result.data }
    } catch (error) {
      this.logger.error('数据导出失败', error)
      return this.errorResult('Export failed', error)
    }
  }

  // ===== 私有工具方法 =====

  /**
   * 清理数据中的权限字段（用于上传数据）
   * @param data 原始数据
   * @returns 清理后的数据（不含权限字段）
   */
  private sanitizeDataForUpload<T extends Record<string, unknown>>(data: T): Omit<T, 'lingma_sys_params' | 'lingma_sys_key'> {
    const { lingma_sys_params: _, lingma_sys_key: __, ...sanitized } = data
    return sanitized
  }

  /**
   * 构建请求配置
   * @param config CRUD操作配置
   * @returns HTTP请求配置
   */
  private buildRequestConfig(config?: CrudOperationConfig): Partial<RequestConfig> | undefined {
    if (!config) return undefined

    const result: Partial<RequestConfig> = {}

    if (config.timeout !== undefined) {
      result.timeout = config.timeout
    }

    return result
  }

  /**
   * 执行单个端点
   * @param endpoint HTTP端点配置
   * @param data 请求数据
   * @param config 请求配置
   * @returns 响应数据
   */
  private async executeEndpoint<T>(
    endpoint: HttpEndpoint,
    data?: unknown,
    config?: Partial<RequestConfig>
  ): Promise<T> {
    return this.executeEndpointRaw<T>(endpoint, data, config)
  }

  private async executeEndpointRaw<T>(
    endpoint: HttpEndpoint,
    data?: unknown,
    config?: Partial<RequestConfig>
  ): Promise<T> {
    const resolvedEndpoint = this.resolveEndpoint(endpoint, data)

    switch (endpoint.method) {
      case 'POST':
        return await this.http.post<T>(resolvedEndpoint.url, data, {
          ...config,
          headers: { ...resolvedEndpoint.headers, ...config?.headers }
        })
      case 'PUT':
        return await this.http.put<T>(resolvedEndpoint.url, data, {
          ...config,
          headers: { ...resolvedEndpoint.headers, ...config?.headers }
        })
      case 'PATCH':
        return await this.http.patch<T>(resolvedEndpoint.url, data, {
          ...config,
          headers: { ...resolvedEndpoint.headers, ...config?.headers }
        })
      case 'DELETE':
        return await this.http.delete<T>(resolvedEndpoint.url, resolvedEndpoint.params, {
          ...config,
          headers: { ...resolvedEndpoint.headers, ...config?.headers }
        })
      case 'GET':
      case undefined:
      default:
        return await this.http.get<T>(resolvedEndpoint.url, resolvedEndpoint.params, {
          ...config,
          headers: { ...resolvedEndpoint.headers, ...config?.headers }
        })
    }
  }

  /**
   * 执行批量操作（真滑动窗口并发控制）
   *
   * 与固定批次 Promise.all 不同，此实现在任意一个请求完成后**立即**
   * 启动队列中的下一个，始终保持 concurrency 个在途请求，吞吐量更高。
   *
   * @param endpoint HTTP端点配置
   * @param items 数据项数组
   * @param config 请求配置
   * @param concurrency 最大并发数（默认5）
   * @param onProgress 进度回调 (completed, total) => void
   * @returns 批量操作结果数组（顺序与 items 一致）
   */
  private async executeBatch<T>(options: BatchExecutionOptions<T>): Promise<Array<CrudResult<T>>> {
    const {
      endpoint,
      items,
      config,
      concurrency = DEFAULT_BATCH_CONCURRENCY,
      onProgress,
    } = options
    const results: Array<CrudResult<T>> = items.map(() => ({ success: false, message: 'Batch item not executed' }))
    let nextIndex = 0
    let completed = 0

    const executeNext = async (): Promise<void> => {
      while (nextIndex < items.length) {
        const i = nextIndex++
        const item = items[i]
        if (item === undefined) continue

        try {
          const result = await this.executeEndpoint<T>(endpoint, item, config)
          results[i] = { success: true, data: result }
        } catch (error) {
          this.logger.error(`批量操作项 ${i} 失败`, error)
          results[i] = this.errorResult('Batch item failed', error)
        } finally {
          completed++
          onProgress?.(completed, items.length)
        }
      }
    }

    // 启动 min(concurrency, items.length) 个 worker，每个 worker 完成后立即取下一项
    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      () => executeNext()
    )
    await Promise.all(workers)

    return results
  }

  /**
   * 解析端点（处理路径参数）
   * @param endpoint HTTP端点配置
   * @param data 数据对象
   * @returns 解析后的端点信息
   */
  private resolveEndpoint(
    endpoint: HttpEndpoint,
    data?: unknown
  ): { url: string; params?: Record<string, unknown>; headers?: Record<string, string> } {
    const params: Record<string, unknown> = { ...endpoint.params }
    const headers = { ...endpoint.headers }

    const contextParams = this.endpointContextProvider?.() ?? {}
    const dataParams = isRecord(data) ? data : {}
    const templateParams = { ...contextParams, ...dataParams }
    const resolved = resolveUrlTemplate(endpoint.url, templateParams)
    const url = resolved.url

    if (UNRESOLVED_URL_TEMPLATE_RE.test(url)) {
      throw new Error(`Unresolved URL template params: ${url}`)
    }

    return { url, params, headers }
  }

  /**
   * 构建查询参数（分页、排序等）
   * @param params 查询参数
   * @param endpoint 端点配置
   * @returns 查询参数对象
   */
  private buildQueryParams(
    params?: QueryParams,
    endpoint?: HttpEndpoint & { pagination?: { pageParam?: string; sizeParam?: string; sortParam?: string } }
  ): Record<string, unknown> {
    const query: Record<string, unknown> = { ...params }

    if (endpoint?.pagination && params) {
      const { pageParam = 'page', sizeParam = 'size', sortParam = 'sort' } = endpoint.pagination

      if (params.page !== undefined) query[pageParam] = params.page
      if (params.pageSize !== undefined) query[sizeParam] = params.pageSize
      if (params.sort !== undefined) query[sortParam] = params.sort
    }

    return query
  }

  /**
   * 获取结果计数（用于日志）
   * @param result 结果数据
   * @returns 数据项数量
   */
  private getResultCount(result: unknown): number {
    if (isRecord(result) && 'rows' in result) {
      const rows = result['rows']
      return Array.isArray(rows) ? rows.length : 0
    }
    if (Array.isArray(result)) {
      return result.length
    }
    return 0
  }

  /** 构建批量操作结果（单次遍历收集 errors）*/
  private buildBatchResult<T>(results: Array<CrudResult<T>>, successCount: number): CrudResult<BatchResult> {
    const errors: Error[] = []
    for (const r of results) {
      if (!r.success) errors.push(r.error ?? new Error('Batch operation failed'))
    }
    return {
      success: true,
      data: {
        successCount,
        failureCount: results.length - successCount,
        results,
        errors
      }
    }
  }

  /**
   * 创建错误结果（类型安全：接受 unknown 错误值）
   * @param message 错误消息
   * @param error 错误对象（unknown，自动归一化为 Error）
   * @returns 错误结果
   */
  private errorResult<T>(message: string, error?: unknown): CrudResult<T> {
    return {
      success: false,
      error: error !== undefined ? toError(error) : new Error(message),
      message
    }
  }

}

// ===== 工厂函数 =====

/**
 * 创建CRUD服务工厂函数
 * @param api CRUD API配置
 * @param httpConfigOrClient HTTP 客户端配置 **或** 已有 HttpClientBase 实例（共享 auth/拦截器）
 * @returns CrudService实例
 */
export function createCrudService(
  api: CrudApi,
  httpConfigOrClient?: Partial<RequestConfig> | HttpClientBase,
  endpointContextProvider?: () => Record<string, unknown>
): CrudService {
  return new CrudService(api, httpConfigOrClient, endpointContextProvider)
}
