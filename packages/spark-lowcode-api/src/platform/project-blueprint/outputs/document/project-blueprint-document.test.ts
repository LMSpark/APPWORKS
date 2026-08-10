import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { describe, expect, it } from 'vitest'

import { LowcodeApi } from '../../../../lowcode-api.js'

class DocumentFixtureHttpClient extends HttpClientBase {
  public readonly requests: RequestConfig[] = []

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    return {
      data: { Code: 200, Result: '文档生成任务提交成功' },
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
    })
  })
})
