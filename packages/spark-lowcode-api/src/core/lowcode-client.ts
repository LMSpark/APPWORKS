/**
 * lowcode HTTP 薄封装：发起请求并强制解包 `AjaxResult`。
 * HTTP 4xx/5xx 若仍携带 AjaxResult 体则按业务码处理；非 AjaxResult 或 `Code !== 200` 一律抛 `LowcodeApiError`。
 */
import { isRequestError, type HttpClientBase, type Method, type RequestConfig } from '@spark-appworks/spark-utils'

import { LowcodeApiError } from './lowcode-api-error.js'

const LOWCODE_SUCCESS_CODE = 200

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 面向 lowcode 后端的通用请求客户端，返回值仅为 AjaxResult.Result 载荷。 */
export class LowcodeClient {
  public constructor(private readonly http: HttpClientBase) {}

  /** 执行单次 lowcode 请求；`authenticated: false` 时跳过根门面注入的 Bearer（如登录接口）。 */
  public async requestResult(command: LowcodeClientCommand): Promise<unknown> {
    const config: RequestConfig = {
      url: command.path,
      method: command.method,
      ...(command.data === undefined ? {} : { data: command.data }),
      ...(command.params === undefined ? {} : { params: { ...command.params } }),
      ...(command.headers === undefined ? {} : { headers: { ...command.headers } }),
      ...(command.authenticated === false ? { meta: { lowcodeSkipAuth: true } } : {}),
    }

    let response: unknown
    try {
      response = await this.http.request<unknown>(config)
    } catch (error) {
      if (!isRequestError(error) || error.response === undefined) throw error
      response = error.response
    }

    return this.unwrapResult(response)
  }

  private unwrapResult(response: unknown): unknown {
    if (!isRecord(response)) {
      throw new LowcodeApiError(0, 'lowcode 响应不是 AjaxResult 对象')
    }

    const code = response['Code']
    if (typeof code !== 'number') {
      throw new LowcodeApiError(0, 'lowcode 响应缺少数字 Code')
    }
    if (code !== LOWCODE_SUCCESS_CODE) {
      const message = response['Message']
      throw new LowcodeApiError(
        code,
        typeof message === 'string' && message.trim() !== '' ? message : 'lowcode 请求失败',
      )
    }

    return response['Result']
  }
}

/** 单次 lowcode 请求描述；path 为相对 API 路径，method 受底层 HttpClient 约束。 */
export type LowcodeClientCommand = Readonly<{
  path: string
  method: Method
  data?: unknown
  params?: Readonly<Record<string, unknown>>
  headers?: Readonly<Record<string, string>>
  authenticated?: boolean
}>
