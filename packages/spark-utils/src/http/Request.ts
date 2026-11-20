/**
 * @module @spark-appworks/spark-utils:http/Request
 * 职责：提供框架无关的 Request 基础工具能力，支撑日志、HTTP、capability、克隆或快照等通用场景。
 * 边界：必须保持纯 TypeScript 基础层，不依赖 Vue、spark-data、spark-component 或应用运行时。
 * AI用途：需要复用底层工具或判断包边界是否被破坏时，用本模块确认最底层能力语义。
 */
/**
 * Request — 基于 axios 的 HTTP 客户端
 *
 * 继承 HttpClientBase（重试/缓存/拦截器/快捷方法），
 * 仅实现 axios 特有的：配置转换 + 请求执行 + 错误归一化。
 */

import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { isRecord } from '../internal/guards.js'
import { HttpClientBase, DEFAULT_TIMEOUT } from './HttpClientBase'
import type { RequestConfig, Method, HttpResponse, RequestError } from './types'

/** Request 的语义模型。 */
export class Request extends HttpClientBase {
  private ax: AxiosInstance

    /** 创建 Request 实例。 */
constructor(defaults: Partial<RequestConfig> = {}) {
    super(defaults, 'Http')
    // 所有实际请求配置均6 toAxios() 中完整提供，无需在实例层重复设置
    this.ax = axios.create()
  }

  // ==================== 模板方法实现 ====================

    /** 执行 execute Request 操作。 */
protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    const res: AxiosResponse<unknown> = await this.ax.request(this.toAxios(config))
    return this.toHttpResponse(res)
  }

    /** normalize Transport Error 错误信息。 */
protected override normalizeTransportError(err: unknown, config?: RequestConfig): RequestError {
    const base = err instanceof Error ? err : new Error(String(err))

    if (axios.isAxiosError(err)) {
      const responseBody: unknown = err.response?.data
      const message = this.extractApiEnvelopeErrorMessage(responseBody) ?? base.message
      return this.buildRequestError(message, err.config ? this.fromAxios(err.config) : (config ?? { url: '' }), {
        code: err.code ?? 'ERR_NETWORK',
        status: err.response?.status ?? 0,
        response: responseBody,
      })
    }

    return this.buildRequestError(base.message, config ?? { url: '' }, { code: 'ERR_NETWORK' })
  }

  // ==================== Axios 配置转换（适配层私有） ====================

  private toAxios(config: RequestConfig | Partial<RequestConfig>): AxiosRequestConfig {
    const c: AxiosRequestConfig = {
      url: config.url ?? '',
      method: config.method ?? 'GET',
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      responseType: config.responseType ?? 'json',
      baseURL: config.baseURL ?? '',
    }
    if (config.params !== undefined) c.params = config.params
    if (config.data !== undefined) c.data = config.data
    if (config.headers !== undefined) c.headers = config.headers
    if (config.signal !== undefined) c.signal = config.signal
    if (config.withCredentials === true) c.withCredentials = true
    return c
  }

  private fromAxios(c: AxiosRequestConfig): RequestConfig {
    const headers: Record<string, string> = {}
    if (c.headers !== undefined && typeof c.headers === 'object') {
      for (const [k, v] of Object.entries(c.headers)) {
        if (typeof v === 'string') headers[k] = v
      }
    }
    const result: RequestConfig = {
      url: c.url ?? '',
      method: this.toMethod(c.method),
      headers,
      data: c.data,
      timeout: c.timeout ?? DEFAULT_TIMEOUT,
      responseType: this.toResponseType(c.responseType),
      baseURL: c.baseURL ?? '',
    }
    if (isRecord(c.params)) {
      result.params = c.params
    }
    return result
  }

  private toMethod(method: string | undefined): Method {
    const normalized = method?.toUpperCase()
    switch (normalized) {
      case 'POST':
      case 'PUT':
      case 'PATCH':
      case 'DELETE':
        return normalized
      case 'GET':
      case undefined:
      default:
        return 'GET'
    }
  }

  private toResponseType(
    responseType: AxiosRequestConfig['responseType'] | undefined,
  ): NonNullable<RequestConfig['responseType']> {
    switch (responseType) {
      case 'arraybuffer':
      case 'blob':
      case 'document':
      case 'json':
      case 'text':
      case 'formdata':
        return responseType
      case 'stream':
      case undefined:
      default:
        return 'json'
    }
  }

  private toHttpResponse(res: AxiosResponse<unknown>): HttpResponse<unknown> {
    const headers: Record<string, string> = {}
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- axios headers 可能为任意结构
    if (res.headers && typeof res.headers === 'object') {
      for (const [k, v] of Object.entries(res.headers)) {
        if (typeof v === 'string') headers[k] = v
      }
    }
    return { data: res.data, status: res.status, statusText: res.statusText, headers }
  }
}

// ==================== 工厂函数 ====================

/** 创建 HTTP 客户端实例（默认基于 axios）；支持传入默认配置（baseURL、timeout、headers 等） */
export function createRequest(config?: Partial<RequestConfig>): Request {
  return new Request(config)
}
