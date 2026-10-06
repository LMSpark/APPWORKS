import { describe, expect, it } from 'vitest'
import { HttpClientBase, type HttpResponse, type RequestConfig } from '@spark-appworks/spark-utils'

import { LowcodeDesignApi } from './lowcode-design-api.js'

function fixtureScope() {
  return { token: 'scope-A', headers: { 'X-AppId': 'APP-A', 'tenant-id': 'tenant' } }
}

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
  it('lists only canonical snapshots for the exact file with actual timestamps', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: [
      { name: 'rule.json', lastModified: 10 }, { name: '2__rule.json', lastModified: 20 },
      { name: '0__rule.json' }, { name: '01__rule.json' }, { name: '-1__rule.json' },
      { name: '3__rule.json.bak' }, { name: '4__script.js' },
    ] })
    await expect(new LowcodeDesignApi({ http, readScope: fixtureScope }).listFileVersions({
      appType: 'designfile', customPath: 'APP-A/page', fileName: 'rule.json',
    })).resolves.toEqual([
      { version: 2, fileName: '2__rule.json', lastModified: 20 },
      { version: 0, fileName: '0__rule.json', lastModified: null },
    ])
  })

  it('rejects unsafe snapshot numbers instead of rounding their identities', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: [{ name: '9007199254740992__rule.json' }] })
    await expect(new LowcodeDesignApi({ http, readScope: fixtureScope }).listFileVersions({
      appType: 'designfile', customPath: 'APP-A/page', fileName: 'rule.json',
    })).rejects.toThrow('安全范围')
  })

  it('deletes with backend request parameters and confirms absence', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: [] })
    await new LowcodeDesignApi({ http, readScope: fixtureScope }).removeFile({
      appType: 'designfile', customPath: 'APP-A/page', fileName: '2__rule.json',
    })
    expect(http.requests[0]).toMatchObject({ url: '/api/File/RemoveFile', method: 'POST', retry: 0,
      params: { customPath: 'APP-A/page', fileName: '2__rule.json', appType: 'designfile' },
      headers: fixtureScope().headers })
    expect(http.requests[1]?.url).toBe('/api/File/list')
  })

  it('does not confirm deletion while the file still exists', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: [{ name: '2__rule.json' }] })
    await expect(new LowcodeDesignApi({ http, readScope: fixtureScope }).removeFile({
      appType: 'designfile', customPath: 'APP-A/page', fileName: '2__rule.json',
    })).rejects.toThrow('删除后仍存在')
  })

  it.each([1, 2])('does not confirm deletion when request %s changes the application scope', async stage => {
    let token = 'scope-A'
    let requests = 0
    const http = new FixtureHttpClient({ Code: 200, Result: [] })
    http.interceptors.request.use({ onRequest: config => {
      if (++requests === stage) token = 'scope-B'
      return config
    } })
    await expect(new LowcodeDesignApi({ http, readScope: () => ({ ...fixtureScope(), token }) }).removeFile({
      appType: 'designfile', customPath: 'APP-A/page', fileName: '2__rule.json',
    })).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
  })

  it('preserves a publisher denial without a retry or confirmation list', async () => {
    const http = new FixtureHttpClient({ Code: 403, Message: 'publisher only' })
    await expect(new LowcodeDesignApi({ http, readScope: fixtureScope }).removeFile({
      appType: 'designfile', customPath: 'APP-A/page', fileName: '2__rule.json',
    })).rejects.toThrow('publisher only')
    expect(http.requests).toHaveLength(1)
  })
  it.each(['text', 'bytes', 'list'])('rejects a %s result after the request identity changes', async kind => {
    let token = 'scope-A'
    const response = kind === 'bytes' ? new Uint8Array([1]).buffer
      : { Code: 200, Result: kind === 'text' ? '{}' : [] }
    const http = new FixtureHttpClient(response)
    http.interceptors.request.use({ onRequest: config => {
      token = 'scope-B'
      return config
    } })
    const api = new LowcodeDesignApi({ http, readScope: () => ({ ...fixtureScope(), token }) })
    const locator = { appType: 'designfile', customPath: 'SysForm/scene', fileName: 'pagedata.json' }
    const pending = kind === 'text' ? api.readTextFile(locator)
      : kind === 'bytes' ? api.readFileBytes(locator) : api.listFiles({ appType: 'designfile', folderPath: 'SysForm/scene' })
    await expect(pending).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(http.requests[0]?.headers?.['X-AppId']).toBe('APP-A')
  })

  it.each([{ bytes: [] }, { bytes: [239, 187, 191, 13, 10, 0, 255] }])('reads original bytes $bytes without text decoding', async ({ bytes }) => {
    const source = new Uint8Array(bytes)
    const http = new FixtureHttpClient(source.buffer)
    const api = new LowcodeDesignApi({ http, readScope: fixtureScope })
    await expect(api.readFileBytes({ appType: 'designfile', customPath: 'SysForm/scene', fileName: 'pagedata.json' })).resolves.toEqual(source)
    expect(http.requests).toEqual([expect.objectContaining({
      url: '/api/File/DownFile', method: 'POST', responseType: 'arraybuffer', cache: false,
      meta: { rawEnvelope: true },
      data: { customPath: 'SysForm/scene', fileName: 'pagedata.json', appType: 'designfile', isCrossEnt: false, isReplace: true, content: null, convertType: 0 },
    })])
  })

  it('rejects a JSON envelope where download bytes are required', async () => {
    const api = new LowcodeDesignApi({ http: new FixtureHttpClient({ Code: 200, Result: '' }), readScope: fixtureScope })
    await expect(api.readFileBytes({ appType: 'designfile', customPath: 'SysForm/scene', fileName: 'pagedata.json' })).rejects.toThrow('文件下载响应不是 ArrayBuffer')
  })

  it('reads text with the source-faithful FileInfo body', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: '{"page":true}' })
    const api = new LowcodeDesignApi({ http, readScope: fixtureScope })

    await expect(api.readTextFile({
      appType: 'designfile',
      customPath: 'homepage/dashboard',
      fileName: 'pagedata.json',
    })).resolves.toBe('{"page":true}')

    expect(http.requests).toEqual([expect.objectContaining({
      url: '/api/File/content/text',
      method: 'POST',
      headers: { 'X-AppId': 'APP-A', 'tenant-id': 'tenant' },
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
    const api = new LowcodeDesignApi({ http, readScope: fixtureScope })

    await expect(api.listFiles({
      appType: 'designfile',
      folderPath: 'homepage/dashboard',
    })).resolves.toEqual([
      { name: 'pagedata.json', lastModified: 123 },
      { name: 'rule.json', lastModified: null },
    ])
  })
})
