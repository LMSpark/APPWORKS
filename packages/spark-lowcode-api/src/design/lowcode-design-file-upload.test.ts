import { describe, expect, it } from 'vitest'
import { HttpClientBase, type HttpResponse, type RequestConfig } from '@spark-appworks/spark-utils'

import { LowcodeDesignFileUpload } from './lowcode-design-file-upload.js'

class FixtureHttpClient extends HttpClientBase {
  public requestConfig: RequestConfig | null = null

  public constructor(private readonly fixture: unknown) {
    super()
  }

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requestConfig = config
    return { data: this.fixture, status: 200, statusText: 'OK', headers: {} }
  }
}

describe('LowcodeDesignFileUpload', () => {
  it('uploads one immutable designfile version with the source-faithful endpoint', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: { name: '2__script.js' } })
    const upload = new LowcodeDesignFileUpload(http)

    await expect(upload.uploadTextVersion({
      customPath: 'homepage/orders',
      fileName: '2__script.js',
      text: '你好',
    })).resolves.toEqual({ name: '2__script.js' })

    expect(http.requestConfig).toEqual({
      url: '/api/File/uploadFileByStr',
      method: 'POST',
      data: {
        customPath: 'homepage/orders',
        appType: 'designfile',
        isReplace: false,
        fileName: '2__script.js',
        content: '你好',
        convertType: 0,
      },
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('fails closed when upload Result is not an object', async () => {
    const upload = new LowcodeDesignFileUpload(new FixtureHttpClient({ Code: 200, Result: 'ok' }))

    await expect(upload.uploadTextVersion({
      customPath: 'homepage/orders',
      fileName: '1__rule.json',
      text: '[]',
    })).rejects.toThrow('文件上传 Result 不是对象')
  })
})
