import {HttpClientBase, type HttpResponse, type RequestConfig, type RequestError} from '@spark-appworks/spark-utils'
import {describe, expect, it} from 'vitest'

import {LowcodeApiError} from './lowcode-api-error.js'
import {LowcodeClient} from './lowcode-client.js'

class RequestFailureHttp extends HttpClientBase {
  calls = 0
  constructor(private readonly status: number, private readonly body: unknown) { super({retry: 2, retryDelay: 0}) }

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.calls += 1
    const error = Object.assign(new Error(`HTTP ${this.status}`), {
      name: 'RequestError', config, status: this.status, response: this.body,
    }) as RequestError
    throw error
  }
}

describe('LowcodeClient HTTP failure handling', () => {
  it('preserves a real RequestError and disables configured retries when requested', async () => {
    const http = new RequestFailureHttp(503, {Code: 1004, Message: 'business body on HTTP failure'})
    const client = new LowcodeClient(http)
    let caught: unknown
    try {
      await client.requestResult({path: '/write', method: 'POST', retry: 0, preserveHttpError: true})
    } catch (error) { caught = error }
    expect(caught).toMatchObject({name: 'RequestError', status: 503, response: {Code: 1004}})
    expect(http.calls).toBe(1)
  })

  it('keeps legacy AjaxResult unwrapping as the default mode', async () => {
    const http = new RequestFailureHttp(400, {Code: 1004, Message: 'definite refusal'})
    const client = new LowcodeClient(http)
    await expect(client.requestResult({path: '/legacy', method: 'POST', retry: 0})).rejects.toMatchObject({
      name: 'LowcodeApiError', code: 1004,
    } satisfies Partial<LowcodeApiError>)
    expect(http.calls).toBe(1)
  })
})
