/**
 * @module @spark-appworks/spark-utils:http/HttpClientBase
 * 职责：提供框架无关的 Http Client Base 基础工具能力，支撑日志、HTTP、capability、克隆或快照等通用场景。
 * 边界：必须保持纯 TypeScript 基础层，不依赖 Vue、spark-data、spark-component 或应用运行时。
 * AI用途：需要复用底层工具或判断包边界是否被破坏时，用本模块确认最底层能力语义。
 */
/**
 * HttpClientBase — HTTP 客户端抽象基类
 *
 * 所有公共逻辑的**唯一来源**：
 *   - 重试循环（retry + exponential delay）
 *   - 内存缓存（TTL + LRU 淘汰）
 *   - 拦截器管理（request / response 双链）
 *   - HTTP 快捷方法（get/post/put/patch/delete）
 *   - 错误归一化（统一 RequestError）
 *   - 延时工具（重试用，支持 AbortSignal 取消）
 *
 * 子类仅需实现：
 *   - `executeRequest(config): Promise<HttpResponse<unknown>>`  — 适配层核心
 *   - 需要识别适配器特定错误时，再覆盖 `normalizeTransportError`
 *
 * 设计原则：
 *   - SRP：基类只管公共流程，子类只管传输适配
 *   - OCP：扩展新传输层只需新子类 + executeRequest()
 *   - DRY：重试、缓存、拦截器、快捷方法仅存一处
 */

import { Logger } from '../logger'
import { isRecord } from '../internal/guards.js'
import type {
  RequestConfig, HttpResponse,
  RequestError, RequestInterceptor, ResponseInterceptor, ApiEnvelope,
} from './types'

// ==================== 常量（单一来源） ====================

export const DEFAULT_TIMEOUT = 10_000

/** 缓存条目：存储数据、写入时间戳和过期时长（ms） */
type CacheItem = { data: unknown; timestamp: number; expiry: number}

/**
 * 缓存读取结果。
 *
 * hit 表示是否命中；data 只在命中时由 getCache 写入。这里使用接口承载结果状态，
 * 避免为内部私有流程再定义联合 type alias，同时保留调用侧 `if (cached.hit)` 的
 * 时序表达：先判断命中，再消费缓存数据。
 */
type CacheLookupResult = {
  hit: boolean
  data?: unknown}

/** 缓存最大条目数——超出后淘汰最旧 20% 条目（LRU-like） */
const MAX_CACHE_SIZE = 500

/** 缓存默认过期时间（5分钟） */
const DEFAULT_CACHE_EXPIRY = 5 * 60 * 1000

// ==================== 抽象基类 ====================

/** Http Client Base 的语义模型。 */
export abstract class HttpClientBase {
  private cache = new Map<string, CacheItem>()
  private reqInterceptors: RequestInterceptor[] = []
  private resInterceptors: ResponseInterceptor[] = []
    /** 诊断日志接口。 */
protected readonly logger: ReturnType<typeof Logger>

    /** 创建 Http Client Base 实例。 */
constructor(
    protected defaults: Partial<RequestConfig> = {},
    loggerName = 'Http',
  ) {
    this.logger = Logger(loggerName)
  }

  // ==================== 子类必须实现 ====================

  /**
   * 执行单次 HTTP 请求并返回完整响应。
   *
   * - 不含重试、缓存、拦截器——这些由基类统一处理
   * - 子类只负责"发出请求 → 读取响应"
   */
  protected abstract executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>>

  /** 将错误转换为统一 RequestError，保留已经归一化过的错误。 */
  protected normalizeAdapterError(err: unknown, config?: RequestConfig): RequestError {
    if (this.isRequestError(err)) return err
    return this.normalizeTransportError(err, config)
  }

  /**
   * 将适配器原始错误转换为统一 RequestError。适配器可覆盖以保留 status/code/response 等细节。
   */
  protected normalizeTransportError(err: unknown, config?: RequestConfig): RequestError {
    const base = err instanceof Error ? err : new Error(String(err))
    return this.buildRequestError(base.message, config ?? { url: '' }, { code: 'ERR_NETWORK' })
  }

  // ==================== 拦截器 ====================

    /** interceptors 字段。 */
readonly interceptors = {
    request: {
      use: (interceptor: RequestInterceptor): (() => void) => {
        this.reqInterceptors.push(interceptor)
        return () => {
          const idx = this.reqInterceptors.indexOf(interceptor)
          if (idx >= 0) this.reqInterceptors.splice(idx, 1)
        }
      },
    },
    response: {
      use: (interceptor: ResponseInterceptor): (() => void) => {
        this.resInterceptors.push(interceptor)
        return () => {
          const idx = this.resInterceptors.indexOf(interceptor)
          if (idx >= 0) this.resInterceptors.splice(idx, 1)
        }
      },
    },
  }

  // ==================== 核心请求（单一重试循环） ====================

    /** 请求对象。 */
async request<T = unknown>(config: RequestConfig): Promise<T>
  async request(config: RequestConfig): Promise<unknown> {
    const res = await this.requestWithRetry(config, true)
    return res.data
  }

    /** 执行 request Full 操作。 */
async requestFull<T = unknown>(config: RequestConfig): Promise<HttpResponse<T>>
  async requestFull(config: RequestConfig): Promise<HttpResponse<unknown>> {
    return this.requestWithRetry(config, false)
  }

  /**
   * 统一重试循环——request() 和 requestFull() 的单一实现。
   *
   * @param useCache 仅 request() 启用缓存（返回 data 时），requestFull() 不缓存
   */
  private async requestWithRetry(config: RequestConfig, useCache: boolean): Promise<HttpResponse<unknown>> {
    const merged = this.mergeConfig(config)
    const method = merged.method ?? 'GET'

    // 缓存检查（仅 GET + cache 开启 + useCache=true）
    if (useCache && method === 'GET' && (merged.cache ?? false)) {
      const cached = this.getCache(merged)
      if (cached.hit) return { data: cached.data, status: 200, statusText: 'OK (cached)', headers: {} }
    }

    const maxRetries = Math.max(0, merged.retry ?? 0)  // 防御负数
    const retryDelay = merged.retryDelay ?? 1000

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await this.delay(retryDelay * attempt, merged.signal)
          this.logger.warn(`重试 ${attempt}/${maxRetries}`, { url: merged.url })
        }

        const cfg = await this.applyRequestInterceptors(merged)
        const res = await this.executeRequest(cfg)
        const processed = await this.applyResponseInterceptors(res)
        const unwrapped = this.unwrapApiEnvelopeResponse(processed, cfg)

        // 写入缓存
        if (useCache && method === 'GET' && (merged.cache ?? false)) {
          this.setCache(merged, unwrapped.data)
        }
        return unwrapped
      } catch (err) {
        const normalized = this.normalizeAdapterError(err, merged)
        const transformed = await this.applyResponseErrorInterceptors(normalized)
        // 用户主动取消（signal.abort）不重试——信号已中止说明调用方不希望继续
        const userCancelled = merged.signal?.aborted === true
        const status = transformed.status ?? 0
        const retryable = !userCancelled && (status === 0 || status >= 500)
        if (attempt < maxRetries && retryable) continue

        const meta = merged.meta
        const silentHttpError = meta?.['silentHttpError'] === true
        const silentStatusCodesRaw = meta?.['silentHttpErrorStatusCodes']
        const silentStatusCodes = Array.isArray(silentStatusCodesRaw)
          ? silentStatusCodesRaw.filter((code): code is number => typeof code === 'number')
          : []
        const silentByStatus = silentStatusCodes.includes(status)

        if (!userCancelled && !silentHttpError && !silentByStatus) {
          this.logger.error('HTTP 请求失败', {
            method,
            url: merged.url,
            status,
            code: transformed.code,
            message: transformed.message,
            attempt: attempt + 1,
            maxRetries,
            responsePreview: transformed.response !== undefined ? this.safePreview(transformed.response) : undefined,
          })
        }
        throw transformed
      }
    }

    throw new Error('unreachable')
  }

  // ==================== HTTP 快捷方法（单一来源） ====================

    /** 执行 get 操作。 */
async get<T = unknown>(url: string, params?: Record<string, unknown>, config?: Partial<RequestConfig>): Promise<T>
  async get(url: string, params?: Record<string, unknown>, config?: Partial<RequestConfig>): Promise<unknown> {
    return this.request({ ...config, url, method: 'GET', ...(params !== undefined ? { params } : {}) })
  }

    /** 执行 post 操作。 */
async post<T = unknown>(url: string, data?: unknown, config?: Partial<RequestConfig>): Promise<T>
  async post(url: string, data?: unknown, config?: Partial<RequestConfig>): Promise<unknown> {
    return this.request({ ...config, url, method: 'POST', data })
  }

    /** 执行 put 操作。 */
async put<T = unknown>(url: string, data?: unknown, config?: Partial<RequestConfig>): Promise<T>
  async put(url: string, data?: unknown, config?: Partial<RequestConfig>): Promise<unknown> {
    return this.request({ ...config, url, method: 'PUT', data })
  }

    /** 执行 patch 操作。 */
async patch<T = unknown>(url: string, data?: unknown, config?: Partial<RequestConfig>): Promise<T>
  async patch(url: string, data?: unknown, config?: Partial<RequestConfig>): Promise<unknown> {
    return this.request({ ...config, url, method: 'PATCH', data })
  }

    /** 执行 delete 操作。 */
async delete<T = unknown>(url: string, params?: Record<string, unknown>, config?: Partial<RequestConfig>): Promise<T>
  async delete(url: string, params?: Record<string, unknown>, config?: Partial<RequestConfig>): Promise<unknown> {
    return this.request({ ...config, url, method: 'DELETE', ...(params !== undefined ? { params } : {}) })
  }

  // ==================== 缓存管理（单一来源） ====================

    /** 清空 Cache。 */
clearCache(url?: string): void {
    if (url !== undefined) {
      for (const key of this.cache.keys()) {
        // key format: "METHOD:url" or "METHOD:url?{params}"
        const urlStart = key.indexOf(':') + 1
        const paramsStart = key.indexOf('?', urlStart)
        const keyUrl = paramsStart < 0 ? key.slice(urlStart) : key.slice(urlStart, paramsStart)
        if (keyUrl === url) this.cache.delete(key)
      }
    } else {
      this.cache.clear()
    }
  }

  // ==================== 拦截器链（单一来源） ====================

    /** 执行 apply Request Interceptors 操作。 */
protected async applyRequestInterceptors(config: RequestConfig): Promise<RequestConfig> {
    let cfg = config
    for (const i of this.reqInterceptors) {
      if (i.onRequest !== undefined) {
        try {
          cfg = await i.onRequest(cfg)
        } catch (err) {
          const reqError = this.isRequestError(err) ? err
            : this.buildRequestError(err instanceof Error ? err.message : String(err), cfg)
          if (i.onRequestError !== undefined) {
            await i.onRequestError(reqError)
          }
          throw reqError
        }
      }
    }
    return cfg
  }

    /** 执行 apply Response Interceptors 操作。 */
protected async applyResponseInterceptors<T>(response: HttpResponse<T>): Promise<HttpResponse<T>> {
    let res = response
    for (const i of this.resInterceptors) {
      if (i.onResponse !== undefined) res = await i.onResponse(res)
    }
    return res
  }

    /** 执行 apply Response Error Interceptors 操作。 */
protected async applyResponseErrorInterceptors(error: RequestError): Promise<RequestError> {
    let current = error
    for (const i of this.resInterceptors) {
      if (i.onResponseError !== undefined) current = await i.onResponseError(current)
    }
    return current
  }

  // ==================== 配置合并 ====================

    /** merge Config 配置。 */
protected mergeConfig(config: RequestConfig): RequestConfig {
    const result: RequestConfig = {
      ...this.defaults,
      ...config,
      headers: { ...this.defaults.headers, ...config.headers },
    }
    // 深合并 params，防止 config.params 完全覆盖 defaults.params
    if (this.defaults.params !== undefined && config.params !== undefined) {
      result.params = { ...this.defaults.params, ...config.params }
    }
    return result
  }

  // ==================== 错误工具（单一来源） ====================

    /** 是否 is Request Error。 */
protected isRequestError(err: unknown): err is RequestError {
    return err instanceof Error && err.name === 'RequestError'
  }

    /** build Request Error 错误信息。 */
protected buildRequestError(
    message: string,
    config: RequestConfig,
    opts: { code?: string; status?: number; response?: unknown } = {}
  ): RequestError {
    const result: RequestError = Object.assign(new Error(message), {
      config,
      name: 'RequestError',
      status: opts.status ?? 0,
    })
    if (opts.code !== undefined) result.code = opts.code
    if (opts.response !== undefined) result.response = opts.response
    return result
  }

    /** 执行 extract Api Envelope Error Message 操作。 */
protected extractApiEnvelopeErrorMessage(body: unknown): string | undefined {
    if (!this.isApiEnvelope(body)) return undefined
    const message = body.error?.message
    if (typeof message === 'string' && message.trim() !== '') {
      return message.trim()
    }
    const retryPolicy = body.error?.retryPolicy
    const nextAction = this.extractEnvelopeNextAction(body)
    const code = body.error?.code
    if (typeof code === 'string' && code.trim() !== '') {
      const base = code.trim()
      return typeof nextAction === 'string' && nextAction.trim() !== ''
        ? `${base}：${nextAction.trim()}`
        : (typeof retryPolicy === 'string' && retryPolicy.trim() !== '' ? `${base} (${retryPolicy.trim()})` : base)
    }
    return undefined
  }

  private unwrapApiEnvelopeResponse(response: HttpResponse<unknown>, config: RequestConfig): HttpResponse<unknown> {
    if (config.meta?.['rawEnvelope'] === true || !this.isApiEnvelope(response.data)) {
      return response
    }
    const envelope = response.data
    if (envelope.ok === true) {
      return { ...response, data: envelope.data }
    }
    throw this.buildRequestError(
      this.extractApiEnvelopeErrorMessage(envelope) ?? 'API request failed',
      config,
      {
        status: response.status,
        response: envelope,
        ...(envelope.error?.code !== undefined ? { code: envelope.error.code } : {}),
      },
    )
  }

  private isApiEnvelope(value: unknown): value is ApiEnvelope {
    if (!isRecord(value)) return false
    const record = value
    const context = record['context']
    const hasRequestId = isRecord(context) && typeof context['requestId'] === 'string'
    const ok = record['ok']
    const hasError = Object.prototype.hasOwnProperty.call(record, 'error')
    const hasData = Object.prototype.hasOwnProperty.call(record, 'data')
    return record['protocolVersion'] === 4
      && typeof ok === 'boolean'
      && (ok ? hasData : hasError)
      && hasRequestId
  }

  private extractEnvelopeNextAction(body: ApiEnvelope): string | undefined {
    const details = body.error?.details
    if (!isRecord(details)) return undefined
    const direct = details['nextAction']
    if (typeof direct === 'string' && direct.trim() !== '') return direct
    const responseDetails = details['details']
    if (
      isRecord(responseDetails)
      && typeof responseDetails['nextAction'] === 'string'
      && responseDetails['nextAction'].trim() !== ''
    ) {
      return responseDetails['nextAction']
    }
    return undefined
  }

  private safePreview(value: unknown): string {
    try {
      const text = typeof value === 'string' ? value : JSON.stringify(value)
      return text.length > 1200 ? `${text.slice(0, 1200)}...(truncated)` : text
    } catch {
      return '[unserializable response]'
    }
  }

  // ==================== 缓存内部实现 ====================

  private getCache(config: RequestConfig): CacheLookupResult {
    const key = config.cacheKey ?? this.cacheKey(config)
    const item = this.cache.get(key)
    if (item === undefined) return { hit: false }
    if (Date.now() - item.timestamp > item.expiry) {
      this.cache.delete(key)
      return { hit: false }
    }
    // 命中时刷新顺序，实现 O(1) 近似 LRU（Map 按插入顺序迭代）
    this.cache.delete(key)
    this.cache.set(key, item)
    return { hit: true, data: item.data }
  }

  private setCache(config: RequestConfig, data: unknown): void {
    const key = config.cacheKey ?? this.cacheKey(config)
    if (this.cache.has(key)) this.cache.delete(key)
    if (this.cache.size >= MAX_CACHE_SIZE) this.evictOldestEntries()
    this.cache.set(key, { data, timestamp: Date.now(), expiry: config.cacheExpiry ?? DEFAULT_CACHE_EXPIRY })
  }

  private evictOldestEntries(): void {
    const evictCount = Math.max(1, Math.floor(this.cache.size * 0.2))
    const keys = this.cache.keys()
    for (let i = 0; i < evictCount; i++) {
      const oldest = keys.next()
      if (oldest.done) break
      this.cache.delete(oldest.value)
    }
  }

  private cacheKey(c: RequestConfig): string {
    const base = `${c.method ?? 'GET'}:${c.url}`
    // 空对象视为「无参数」——与 undefined 相同，避免 get() 传 {} 产生 "GET:/url?{}" 与
    // 直接 request({ url }) 产生 "GET:/url" 不一致的缓存双轨问题
    if (c.params === undefined || Object.keys(c.params).length === 0) return base
    // 对键排序后序列化，保证参数顺序不同时缓存 key 仍相同
    const sorted = Object.fromEntries(Object.entries(c.params).sort(([a], [b]) => a.localeCompare(b)))
    return `${base}?${JSON.stringify(sorted)}`
  }

  // ==================== 延时工具（单一来源） ====================

    /** 执行 delay 操作。 */
protected delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted === true) { reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); return }
      const onAbort = (): void => {
        clearTimeout(timer)
        reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, ms)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }
}
