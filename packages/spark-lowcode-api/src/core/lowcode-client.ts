import { isRequestError, type HttpClientBase, type Method, type RequestConfig } from '@spark-appworks/spark-utils'

import { LowcodeApiError } from './lowcode-api-error.js'

const LOWCODE_SUCCESS_CODE = 200

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class LowcodeClient {
  public constructor(private readonly http: HttpClientBase) {}

  public async requestResult(command: LowcodeClientCommand): Promise<unknown> {
    const config: RequestConfig = {
      url: command.path,
      method: command.method,
      ...(command.data === undefined ? {} : { data: command.data }),
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

export type LowcodeClientCommand = Readonly<{
  path: string
  method: Method
  data?: unknown
  headers?: Readonly<Record<string, string>>
  authenticated?: boolean
}>
