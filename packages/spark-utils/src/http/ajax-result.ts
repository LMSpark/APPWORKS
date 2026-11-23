/**
 * @module @spark-appworks/spark-utils:http/ajax-result
 * 职责：严格解包 AjaxResult，并保留拒绝码。
 * 边界：不负责端点、认证或重试策略。
 * AI用途：复用旧 wire 合同，同时允许命令 owner 区分业务拒绝与未知 HTTP 结果。
 */
import { isRecord } from '../internal/guards.js'
import { isRequestError } from './guards.js'
import type { HttpClientBase } from './HttpClientBase.js'
import type { RequestConfig } from './types.js'

/** `code` comes from AjaxResult.Code; zero denotes a local validation or protocol error. */
export class AjaxResultError extends Error {
  public constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message)
    this.name = 'AjaxResultError'
  }
}

type AjaxResultRequestOptions = Readonly<{
  /** Keep the original HTTP RequestError instead of unwrapping its response body. */
  preserveHttpError?: boolean
  /** Let an adapter classify malformed or rejected envelopes in its own domain. */
  errorType?: new (code: number, message: string) => Error
}>

/** Return AjaxResult.Result only when Code is 200; requests use the caller's HTTP configuration unchanged. */
export async function requestAjaxResult(
  http: HttpClientBase,
  config: RequestConfig,
  options: AjaxResultRequestOptions = {},
): Promise<unknown> {
  let response: unknown
  try {
    response = await http.request<unknown>(config)
  } catch (error) {
    if (!isRequestError(error) || options.preserveHttpError === true || error.response === undefined) throw error
    response = error.response
  }

  const ErrorType = options.errorType ?? AjaxResultError
  if (!isRecord(response)) throw new ErrorType(0, 'lowcode 响应不是 AjaxResult 对象')
  const code = response['Code']
  if (typeof code !== 'number') throw new ErrorType(0, 'lowcode 响应缺少数字 Code')
  if (code !== 200) {
    const message = response['Message']
    throw new ErrorType(code, typeof message === 'string' && message.trim() !== '' ? message : 'lowcode 请求失败')
  }
  return response['Result']
}
