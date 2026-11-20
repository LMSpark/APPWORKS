import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { describe, expect, it } from 'vitest'

import { LowcodeApi } from '../../../../lowcode-api.js'

class DocumentFixtureHttpClient extends HttpClientBase {
  public readonly requests: RequestConfig[] = []
  public response: {Code: number; Result: unknown; Message?: string; Type?: string} = {
    Code: 200, Result: '文档任务已提交',
  }
  public transportError: Error | null = null

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    if (this.transportError) throw this.transportError
    return {
      data: this.response,
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
}

describe('LowcodeProjectBlueprintApi document endpoint', () => {
  it('submits the real legacy endpoint and reports its limited coverage', async () => {
    const http = new DocumentFixtureHttpClient()
    const task = await new LowcodeApi({ http }).blueprint.submitDocument(
      'PROJECT-1',
      'functional-design',
      { level: 2, includeText: false, includeHtml: true },
    )
    expect(task).toMatchObject({ status: 'submitted', coverage: 'legacy-menu-scope' })
    expect(http.requests[0]).toMatchObject({
      method: 'GET',
      url: '/api/File/exportDesignDoc?sysId=PROJECT-1&level=2&isText=false&isHtml=true',
      retry: 0,
    })
  })

  it('accepts the formal null-result submission receipt without claiming generation', async () => {
    const http = new DocumentFixtureHttpClient()
    http.response = {Code: 200, Type: 'success', Result: null, Message: '任务已提交'}
    const task = await new LowcodeApi({http}).blueprint.submitDocument('PROJECT-1', 'requirements-specification')
    expect(task).toMatchObject({
      status: 'submitted',
      coverage: 'legacy-menu-scope',
      message: '任务提交请求已确认；文档生成状态未知',
    })
    expect(http.requests[0]).toMatchObject({
      url: '/api/File/exportSRS?sysId=PROJECT-1',
      retry: 0,
    })
  })

  it('rejects a business failure and never retries a document submission', async () => {
    const http = new DocumentFixtureHttpClient()
    http.response = {Code: 500, Result: null, Message: '任务拒绝'}
    await expect(new LowcodeApi({http}).blueprint.submitDocument('PROJECT-1', 'system-detailed-design'))
      .rejects.toMatchObject({name: 'LowcodeApiError', code: 500})
    expect(http.requests).toHaveLength(1)
    expect(http.requests[0]).toMatchObject({
      url: '/api/File/exportSDD?sysId=PROJECT-1',
      retry: 0,
    })
  })

  it('does not retry after an indeterminate transport failure', async () => {
    const http = new DocumentFixtureHttpClient()
    http.transportError = new Error('socket reset')
    await expect(new LowcodeApi({http}).blueprint.submitDocument('PROJECT-1', 'requirements-specification'))
      .rejects.toThrow('socket reset')
    expect(http.requests).toHaveLength(1)
    expect(http.requests[0]).toMatchObject({retry: 0})
  })
})
