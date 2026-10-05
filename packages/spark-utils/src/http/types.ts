/**
 * @module @spark-appworks/spark-utils:http/types
 * 职责：提供框架无关的 types 基础工具能力，支撑日志、HTTP、capability、克隆或快照等通用场景。
 * 边界：必须保持纯 TypeScript 基础层，不依赖 Vue、spark-data、spark-component 或应用运行时。
 * AI用途：需要复用底层工具或判断包边界是否被破坏时，用本模块确认最底层能力语义。
 */
/**
 * HTTP 模块类型定义
 * @packageDocumentation
 */

import type { HttpClientBase } from './HttpClientBase'

// ==================== 请求配置 ====================

/** Method 的语义模型。 */
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * 请求配置
 */
export type RequestConfig = {
    /** 资源地址。 */
url: string
    /** 请求方法或动作方法。 */
method?: Method
    /** 请求头集合。 */
headers?: Record<string, string>
    /** 参数集合。 */
params?: Record<string, unknown>
    /** 业务数据载荷。 */
data?: unknown
    /** 超时时间。 */
timeout?: number
  /** 响应类型（默认 json） */
  responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'formdata'
    /** base URL 地址。 */
baseURL?: string

  // 缓存（仅 GET）
    /** cache 字段。 */
cache?: boolean
    /** cache Key 键。 */
cacheKey?: string
  /** 缓存过期（ms，默认 300000） */
  cacheExpiry?: number

  // 重试
  /** 重试次数（默认 0） */
  retry?: number
  /** 重试延迟（ms，默认 1000） */
  retryDelay?: number

  /** AbortSignal —— 用于取消请求（组件卸载时中止在途请求） */
  signal?: AbortSignal

  /** 跨域请求携带 cookie（对应 axios withCredentials / fetch credentials:'include'） */
  withCredentials?: boolean

  /** 自定义元数据（透传给拦截器） */
  meta?: Record<string, unknown>

  /** fetch-only: 页面卸载时保持连接（日志传输场景） */
  keepalive?: boolean}

// ==================== 响应 ====================

/** HTTP 响应（不泄露 axios 实现） */
export type HttpResponse<T = unknown> = {
    /** 业务数据载荷。 */
data: T
    /** 当前状态。 */
status: number
    /** status Text 文本。 */
statusText: string
    /** 请求头集合。 */
headers: Record<string, string>}

/** SPARK v4 API envelope。 */
export type ApiEnvelope<T = unknown> = {
    /** protocol Version 字段。 */
protocolVersion: 4
    /** ok 字段。 */
ok: boolean
    /** 业务数据载荷。 */
data?: T | null
    /** 错误对象或错误信息。 */
error?: ApiEnvelopeError | null
    /** 运行上下文。 */
context?: ApiEnvelopeContext
    /** event 字段。 */
event?: ApiEnvelopeEvent}

/** Api Envelope Error 的错误信息。 */
export type ApiEnvelopeError = {
    /** 稳定错误码或诊断码。 */
code: string
    /** 用户可读消息。 */
message: string
    /** category 字段。 */
category: string
    /** severity 字段。 */
severity?: string
    /** retry Policy 字段。 */
retryPolicy?: string
    /** details 字段。 */
details?: Record<string, unknown>}

/** Api Envelope Context 的运行上下文。 */
export type ApiEnvelopeContext = {
    /** request Id 标识。 */
requestId?: string
    /** tenant Id 标识。 */
tenantId?: string
    /** project Id 标识。 */
projectId?: string
    /** username 字段。 */
username?: string
    /** 业务作用域。 */
scope?: {
    moduleId?: string
    moduleInstanceId?: string
    instanceId?: string
    runtimeInstanceId?: string
  }
    /** session 字段。 */
session?: { sessionId?: string }
    /** turn 字段。 */
turn?: {
    turnId?: string
    turnKey?: string
    seq?: number
    baseRevision?: number
  }
    /** stream 字段。 */
stream?: {
    streamId?: string
    streamKey?: string
  }
}

/** Api Envelope Event 的事件载荷。 */
export type ApiEnvelopeEvent = {
    /** transport 字段。 */
transport?: 'http' | 'sse'
    /** 显示或业务名称。 */
name?: string
    /** terminal 字段。 */
terminal?: boolean
    /** sequence 字段。 */
sequence?: number
}

// ==================== 错误 ====================

/** Request Error 的错误信息。 */
export type RequestError = Error & {
    /** 配置对象。 */
config: RequestConfig
        /** 稳定错误码或诊断码。 */
code?: string
        /** 当前状态。 */
status?: number
        /** 响应对象。 */
response?: unknown}

// ==================== 拦截器 ====================

/** Request Interceptor 的语义模型。 */
export type RequestInterceptor = {
    /** 显示或业务名称。 */
name?: string
    /** on Request 事件回调。 */
onRequest?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>
  /**
   * 请求阶段错误回调。
   *
   * 当前版本中，此回调在**同一拦截器**的 `onRequest` 抛出异常时被调用，
   * 允许拦截器自行记录或处理自身引发的错误。异常仍会向上传播。
   */
  onRequestError?: (error: RequestError) => void | Promise<void>}

/** Response Interceptor 的语义模型。 */
export type ResponseInterceptor = {
    /** 显示或业务名称。 */
name?: string
    /** on Response 事件回调。 */
onResponse?: <T>(response: HttpResponse<T>) => HttpResponse<T> | Promise<HttpResponse<T>>
    /** on Response Error 事件回调。 */
onResponseError?: (error: RequestError) => RequestError | Promise<RequestError>}

/** createHttpClient 工厂参数 */
export type HttpClientFactoryOptions = Partial<RequestConfig>

// ==================== 文件加载器 / 缓存层 ====================

/** 缓存过期策略级别定义 */
export type CacheExpirationTier = {
  /** 级别编号 */
  level: number
  /** 最大闲置时间（毫秒），Infinity 表示永不过期 */
  maxAge: number
  /** 级别说明 */
  description?: string}

/** File Load Options 的调用配置。 */
export type FileLoadOptions = {
  /** API 基础路径（文件 HTTP 加载使用） */
  baseUrl: string
  /** 缓存存储方式 */
  storage?: 'localStorage' | 'sessionStorage' | 'memory'
  /** 缓存键前缀 */
  cachePrefix?: string
  /** 自定义 HTTP client；用于复用上层认证、租户作用域或 URL 重写能力 */
  request?: HttpClientBase
  /** 超时（ms） */
  timeout?: number
  /** 自定义请求头（静态） */
  headers?: Record<string, string>
  /** 动态请求头回调（每次请求时调用，优先级高于 headers） */
  getHeaders?: () => Record<string, string>
  /** 网络失败时降级到缓存 */
  fallbackToCache?: boolean
  /**
   * 过期策略级别定义（默认：0=永不过期, 1=3天, 2=7天, 3=15天, 4=30天）
   * 可自定义级别定义
   */
  expirationTiers?: CacheExpirationTier[]
  /** 默认过期级别（默认 3 = 15天），对应 expirationTiers 中的 level */
  defaultExpirationLevel?: number
  /** 最大缓存条目数（默认 100），超过按 LRU 清理 */
  maxCacheSize?: number
  /** 当前 cachePrefix 在 Web Storage 中最多占用的估算字节数，超过按 LRU 清理 */
  maxStorageBytes?: number
  /** Web Storage 总占用的估算字节上限；只驱逐当前缓存前缀下的条目 */
  maxStorageTotalBytes?: number
  /** 单个 Web Storage 缓存项最大估算字节数，超过则跳过持久化 */
  maxEntryStorageBytes?: number}

/**
 * 通用缓存条目（泛型）
 * - 文件内容：T = string
 * - DataSet、编译后脚本、编译后规则等计算结果：T = 具体类型
 */
export type CacheEntry<T = string> = {
  /** 缓存的数据（文件原始内容或任意计算结果） */
  data: T
  /**
   * 来源时间戳（来自文件服务器的 mtime、版本号或任意标识）
   * 对比此字段判断缓存是否仍有效。
   */
  sourceTimestamp: string
  /** 缓存创建时间（毫秒时间戳，用于兜底） */
  cachedAt: number
  /** 最后访问时间（毫秒时间戳，用于滑动过期 + LRU 清理） */
  lastAccess: number
  /** 过期级别（0=永不过期, 1=3天, 2=7天, 3=15天, 4=30天） */
  expirationLevel: number}

/** File Load Result 的返回结果。 */
export type FileLoadResult<T = unknown> = {
    /** success 字段。 */
success: boolean
    /** 业务数据载荷。 */
data?: T
  /** 来源时间戳 */
  timestamp?: string
    /** from Cache 字段。 */
fromCache: boolean
    /** 错误对象或错误信息。 */
error?: string
    /** not Modified 字段。 */
notModified?: boolean
  /** 失败状态码（如 404） */
  status?: number
  /** 失败原因（用于上游订阅消费，不再依赖字符串匹配） */
  reason?: 'not-found' | 'network' | 'invalid-response' | 'parse' | 'unknown'}

/** FileLoader 事件映射（用于全链路订阅消费） */
export type FileLoaderEventMap = {
    /** file loaded 字段。 */
'file-loaded': {
    fileName: string
    fromCache: boolean
    timestamp?: string
    notModified?: boolean
  }
    /** file missing 字段。 */
'file-missing': {
    fileName: string
    status?: number
    reason: 'not-found'
  }
    /** file error 字段。 */
'file-error': {
    fileName: string
    status?: number
    error: string
    reason: 'network' | 'invalid-response' | 'parse' | 'unknown'
  }}
