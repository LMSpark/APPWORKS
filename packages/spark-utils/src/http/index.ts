/**
 * @module @spark-appworks/spark-utils:http/index
 * 职责：提供框架无关的 index 基础工具能力，支撑日志、HTTP、capability、克隆或快照等通用场景。
 * 边界：必须保持纯 TypeScript 基础层，不依赖 Vue、spark-data、spark-component 或应用运行时。
 * AI用途：需要复用底层工具或判断包边界是否被破坏时，用本模块确认最底层能力语义。
 */
/**
 * HTTP 模块 — 请求 + 文件加载
 *
 * @example
 * ```ts
 * import { createRequest, createFileLoader } from '@spark-appworks/spark-utils'
 * const http = createRequest({ baseURL: '/api', timeout: 5000 })
 * const data = await http.get<User[]>('/users')
 * ```
 */

export { HttpClientBase } from './HttpClientBase'
export { Request, createRequest } from './Request'
export { createHttpClient } from './HttpClientFactory'
export { FileLoader, TransformedFileLoader, createFileLoader } from './FileLoader'
export { isRequestError } from './guards'
export { sendBeacon } from './beacon'
export type { LoadOptions, JsonLoadOptions, TextLoadOptions, TransformLoadOptions, TransformedFileLoadOptions } from './FileLoader'
export type {
	RequestConfig,
	Method,
	ApiEnvelope,
	ApiEnvelopeError,
	FileLoadOptions,
	FileLoadResult,
	FileLoaderEventMap,
	CacheEntry,
	CacheExpirationTier,
	RequestError,
	RequestInterceptor,
	ResponseInterceptor,
	HttpResponse,
	HttpClientFactoryOptions,
	ApiEnvelopeContext,
	ApiEnvelopeEvent,
} from './types'
