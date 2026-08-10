import { describe, expect, it } from 'vitest'
import { HttpClientBase, type HttpResponse, type RequestConfig } from '@spark-appworks/spark-utils'

import { LowcodeDesignApi } from './lowcode-design-api.js'

class FixtureHttpClient extends HttpClientBase {
  public readonly requests: RequestConfig[] = []

  public constructor(private readonly response: unknown) {
    super()
  }

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    return {
      data: this.response,
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
}

describe('LowcodeDesignApi', () => {
  it('reads text with the source-faithful FileInfo body', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: '{"page":true}' })
    const api = new LowcodeDesignApi(http)

    await expect(api.readTextFile({
      appType: 'designfile',
      customPath: 'homepage/dashboard',
      fileName: 'pagedata.json',
    })).resolves.toBe('{"page":true}')

    expect(http.requests).toEqual([expect.objectContaining({
      url: '/api/File/content/text',
      method: 'POST',
      data: {
        customPath: 'homepage/dashboard',
        fileName: 'pagedata.json',
        appType: 'designfile',
        isCrossEnt: false,
        isReplace: true,
        content: null,
        convertType: 0,
      },
    })])
  })

  it('lists normalized file entries from the actual list endpoint', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: [
        { name: 'pagedata.json', lastModified: 123 },
        { name: 'rule.json', lastModified: 'unknown' },
        { lastModified: 456 },
      ],
    })
    const api = new LowcodeDesignApi(http)

    await expect(api.listFiles({
      appType: 'designfile',
      folderPath: 'homepage/dashboard',
    })).resolves.toEqual([
      { name: 'pagedata.json', lastModified: 123 },
      { name: 'rule.json', lastModified: null },
    ])
  })
})
