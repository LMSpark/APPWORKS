import { describe, expect, it } from 'vitest'
import { HttpClientBase, type HttpResponse, type RequestConfig } from '@spark-appworks/spark-utils'

import { LowcodeDesignFileUpload } from './lowcode-design-file-upload.js'

function fixtureScope() {
  return { token: 'scope-A', headers: { 'X-AppId': 'APP-A', 'tenant-id': 'tenant' } }
}

class FixtureHttpClient extends HttpClientBase {
  public requestConfig: RequestConfig | null = null
  public readonly requests: RequestConfig[] = []

  public constructor(private readonly fixture: unknown, private readonly readback?: string | ArrayBuffer) {
    super({ retry: 2 })
  }

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requestConfig = config
    this.requests.push(config)
    if (this.fixture instanceof Error) throw this.fixture
    const data = config.url === '/api/File/DownFile'
      ? (typeof this.readback === 'string' ? new TextEncoder().encode(this.readback).buffer : this.readback)
      : this.fixture
    return { data, status: 200, statusText: 'OK', headers: {} }
  }
}

describe('LowcodeDesignFileUpload', () => {
  it.each(['', '\uFEFF你好\r\n'])('uploads and confirms exact version bytes %j without replacing snapshots', async text => {
    const receipt = { fileName: '2__script.js', filePath: '/DesignFilePaths_publisher/APP-A/orders/2__script.js', state: 'success' }
    const http = new FixtureHttpClient({ Code: 200, Result: [receipt] }, text)
    const upload = new LowcodeDesignFileUpload({ http, readScope: fixtureScope })

    await expect(upload.uploadTextVersion({
      customPath: 'APP-A/orders',
      fileName: '2__script.js',
      text,
    })).resolves.toEqual(receipt)

    expect(http.requests[0]).toMatchObject({
      url: '/api/File/UploadFile',
      method: 'POST',
      headers: { 'X-AppId': 'APP-A', 'tenant-id': 'tenant' },
      retry: 0,
      cache: false,
      meta: { rawEnvelope: true },
    })
    const form = http.requests[0]?.data
    if (!(form instanceof FormData)) throw new Error('expected multipart')
    expect(form.get('isReplace')).toBe('false')
    expect(form.get('customPath')).toBe('APP-A/orders')
    expect(form.get('newName')).toBe('2__script.js')
    const file = form.get('file')
    if (!(file instanceof Blob)) throw new Error('expected snapshot file')
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new TextEncoder().encode(text))
    expect(http.requests[1]?.url).toBe('/api/File/DownFile')
    expect(http.requests).toHaveLength(2)
  })

  it('uploads JSON resource text in its real root namespace and reads bytes from the same area', async () => {
    const text='{"flag":false,"items":[]}',http=new FixtureHttpClient({Code:200,Result:[{fileName:'data.json',state:'success',filePath:'/tenant/data.json'}]},text)
    const upload=new LowcodeDesignFileUpload({http,readScope:fixtureScope})
    await upload.uploadWorkingText({appType:'jsondatapath',customPath:'',fileName:'data.json',text})
    const form=http.requests[0]?.data
    if(!(form instanceof FormData))throw new Error('expected multipart')
    expect(form.get('appType')).toBe('jsondatapath');expect(form.get('customPath')).toBe('')
    expect(http.requests[1]?.data).toMatchObject({appType:'jsondatapath',customPath:'',fileName:'data.json'})
  })

  it('rejects a renamed version using the actual filePath, even when fileName is unchanged', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: [{ fileName: '2__script.js',
      filePath: '/DesignFilePaths_publisher/APP-A/orders/2__script_renamed.js', state: 'success' }] }, 'A')
    await expect(new LowcodeDesignFileUpload({ http, readScope: fixtureScope }).uploadTextVersion({
      customPath: 'APP-A/orders', fileName: '2__script.js', text: 'A',
    })).rejects.toThrow('文件名')
    expect(http.requests).toHaveLength(1)
  })

  it('rejects a changed snapshot readback before confirming its version', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: [{ fileName: '2__script.js',
      filePath: '/DesignFilePaths_publisher/APP-A/orders/2__script.js', state: 'success' }] }, 'changed')
    await expect(new LowcodeDesignFileUpload({ http, readScope: fixtureScope }).uploadTextVersion({
      customPath: 'APP-A/orders', fileName: '2__script.js', text: 'A',
    })).rejects.toThrow('写入后回读不一致')
    expect(http.requests).toHaveLength(2)
  })

  it.each(['', '\uFEFF你好\r\n第二行\n'])('uploads and reads back exact working text %j', async text => {
    const result = { fileName: 'script.js', state: 'success', filePath: '/DesignFilePaths_publisher/homepage/orders/script.js', fileSize: new TextEncoder().encode(text).length }
    const http = new FixtureHttpClient({ Code: 200, Result: [result] }, text)
    const upload = new LowcodeDesignFileUpload({ http, readScope: fixtureScope })
    await expect(upload.uploadWorkingText({ customPath: 'homepage/orders', fileName: 'script.js', text })).resolves.toEqual(result)
    const config = http.requests[0]
    expect(config?.url).toBe('/api/File/UploadFile')
    expect(config?.retry).toBe(0)
    expect(config?.headers?.['Content-Type']).toBeUndefined()
    const form = config?.data
    if (!(form instanceof FormData)) throw new Error('Expected multipart FormData')
    expect(form.get('appType')).toBe('designfile')
    expect(form.get('customPath')).toBe('homepage/orders')
    expect(form.get('isReplace')).toBe('true')
    expect(form.get('newName')).toBe('script.js')
    expect(form.get('isCrossEnt')).toBe('false')
    const file = form.get('file')
    if (!(file instanceof Blob)) throw new Error('Expected uploaded Blob')
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new TextEncoder().encode(text))
    expect(http.requests[1]?.url).toBe('/api/File/DownFile')
    expect(http.requests[0]?.headers?.['X-AppId']).toBe('APP-A')
    expect(http.requests[1]?.headers?.['X-AppId']).toBe('APP-A')
    expect(form.has('applicationId')).toBe(false)
    expect(form.has('tenantId')).toBe(false)
  })

  it('rejects a changed readback without uploading again', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: [{ fileName: 'script.js', state: 'success', filePath: '/DesignFilePaths_publisher/homepage/orders/script.js' }] }, 'other')
    const upload = new LowcodeDesignFileUpload({ http, readScope: fixtureScope })
    await expect(upload.uploadWorkingText({ customPath: 'homepage/orders', fileName: 'script.js', text: 'source' })).rejects.toThrow('写入后回读不一致')
    expect(http.requests.filter(config => config.url === '/api/File/UploadFile')).toHaveLength(1)
  })

  it('rejects changed bytes even when the download length is unchanged', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: [{ state: 'success', filePath: '/DesignFilePaths_publisher/homepage/orders/script.js' }] }, new Uint8Array([97, 98, 255]).buffer)
    await expect(new LowcodeDesignFileUpload({ http, readScope: fixtureScope }).uploadWorkingText({ customPath: 'homepage/orders', fileName: 'script.js', text: 'abc' })).rejects.toThrow('写入后回读不一致')
    expect(http.requests).toHaveLength(2)
  })

  it.each([{ result: [] }, { result: {} }, { result: [{ state: 'success' }, { state: 'success' }] }])('rejects malformed single-file receipts $result', async ({ result }) => {
    const http = new FixtureHttpClient({ Code: 200, Result: result }, '')
    await expect(new LowcodeDesignFileUpload({ http, readScope: fixtureScope }).uploadWorkingText({ customPath: 'homepage/orders', fileName: 'script.js', text: '' })).rejects.toThrow('文件上传 Result')
    expect(http.requests).toHaveLength(1)
  })

  it.each(['working', 'version'])('does not retry a failed %s write with retrying HTTP defaults', async kind => {
    const http = new FixtureHttpClient(new Error('transport failed'))
    const upload = new LowcodeDesignFileUpload({ http, readScope: fixtureScope })
    const command = { customPath: 'homepage/orders', fileName: 'script.js', text: '' }
    const pending = kind === 'working' ? upload.uploadWorkingText(command) : upload.uploadTextVersion(command)
    await expect(pending).rejects.toThrow('transport failed')
    expect(http.requests).toHaveLength(1)
  })

  it('uses the shared request interceptors and captures text before writing', async () => {
    const command = { customPath: 'homepage/orders', fileName: 'script.js', text: 'source' }
    const http = new FixtureHttpClient({ Code: 200, Result: [{ state: 'success', filePath: '/DesignFilePaths_publisher/homepage/orders/script.js' }] }, 'source')
    http.interceptors.request.use({ onRequest: config => {
      command.text = 'later edit'
      return { ...config, headers: { ...config.headers, Authorization: 'Bearer fixture' } }
    } })
    await expect(new LowcodeDesignFileUpload({ http, readScope: fixtureScope }).uploadWorkingText(command)).resolves.toEqual({ state: 'success', filePath: '/DesignFilePaths_publisher/homepage/orders/script.js' })
    expect(http.requests[0]?.headers?.['Authorization']).toBe('Bearer fixture')
    expect(http.requests[1]?.headers?.['X-AppId']).toBe('APP-A')
  })

  it.each([
    { kind: 'working', stage: 'write' }, { kind: 'working', stage: 'readback' },
    { kind: 'version', stage: 'write' }, { kind: 'version', stage: 'readback' },
  ])('does not confirm or retry a $kind when identity changes during $stage', async ({ kind, stage }) => {
    let token = 'scope-A'
    const http = new FixtureHttpClient({ Code: 200, Result: [{ state: 'success', filePath: '/DesignFilePaths_publisher/APP-A/SysForm/scene/1__pagedata.json' }] }, 'source')
    http.interceptors.request.use({ onRequest: config => {
      if (config.url === (stage === 'write' ? '/api/File/UploadFile' : '/api/File/DownFile')) token = 'scope-B'
      return config
    } })
    const upload = new LowcodeDesignFileUpload({ http, readScope: () => ({ ...fixtureScope(), token }) })
    const command = { customPath: 'APP-A/SysForm/scene', fileName: '1__pagedata.json', text: 'source' }
    const pending = kind === 'working' ? upload.uploadWorkingText(command) : upload.uploadTextVersion(command)
    await expect(pending).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(http.requests).toHaveLength(stage === 'write' ? 1 : 2)
    expect(http.requests.filter(config => config.url === '/api/File/UploadFile')).toHaveLength(1)
  })

  it('rejects a backend failure without reading back', async () => {
    const http = new FixtureHttpClient({ Code: 500, Message: 'backend rejected', Result: [] }, '')
    await expect(new LowcodeDesignFileUpload({ http, readScope: fixtureScope }).uploadWorkingText({ customPath: 'homepage/orders', fileName: 'script.js', text: '' })).rejects.toThrow('backend rejected')
    expect(http.requests).toHaveLength(1)
  })

  it('fails closed when a version upload Result is not a single-file receipt', async () => {
    const upload = new LowcodeDesignFileUpload({ http: new FixtureHttpClient({ Code: 200, Result: 'ok' }), readScope: fixtureScope })

    await expect(upload.uploadTextVersion({
      customPath: 'homepage/orders',
      fileName: '1__rule.json',
      text: '[]',
    })).rejects.toThrow('文件上传 Result 不是单文件信息数组')
  })
  it('rejects ambiguous content paths before upload instead of discovering the mismatch after writing', async () => {
    const http = new FixtureHttpClient({Code: 200, Result: []})
    await expect(new LowcodeDesignFileUpload({http, readScope: fixtureScope}).uploadWorkingText({appType: 'jsondatapath', customPath: 'owned.v1', fileName: 'payload.json', text: ''})).rejects.toThrow('customPath')
    expect(http.requests).toEqual([])
  })

  it('uses the same exact path and basename for upload and byte confirmation', async () => {
    const http = new FixtureHttpClient({Code: 200, Result: [{state: 'success', filePath: '/tenant/ owned / payload.json'}]}, 'body')
    await new LowcodeDesignFileUpload({http, readScope: fixtureScope}).uploadWorkingText({appType: 'jsondatapath', customPath: ' owned ', fileName: ' payload.json', text: 'body'})
    const data = http.requests[0]?.data as FormData
    expect(data.get('customPath')).toBe(' owned ')
    expect(data.get('newName')).toBe(' payload.json')
    expect(http.requests[1]?.data).toMatchObject({customPath: ' owned ', fileName: ' payload.json'})
  })

  it.each([
    {customPath: 'owned', fileName: '.payload.json'},
    {customPath: 'owned', fileName: 'a\u0001.json'},
    {customPath: 'owned', fileName: `${'x'.repeat(256)}.json`},
    {customPath: 'owned/unknown', fileName: 'payload.json'},
    {customPath: 'owned/ ', fileName: 'payload.json'},
    {customPath: 'owned/xx\u007f', fileName: 'payload.json'},
    {customPath: 'owned', fileName: 'payload.json '},
  ])('rejects service-rewritten upload identities before IO: $customPath $fileName', async locator => {
    const http = new FixtureHttpClient({Code: 200, Result: [{state: 'success'}]}, 'body')
    await expect(new LowcodeDesignFileUpload({http, readScope: fixtureScope}).uploadWorkingText({...locator, appType: 'jsondatapath', text: 'body'})).rejects.toThrow()
    expect(http.requests).toEqual([])
  })

  it.each([{state: 'failed', filePath: '/owned/payload.json'}, {state: 'success', filePath: '/owned/other.json'}])('rejects working-file ACK mismatch even when the old target bytes match', async receipt => {
    const http = new FixtureHttpClient({Code: 200, Result: [receipt]}, 'body')
    await expect(new LowcodeDesignFileUpload({http, readScope: fixtureScope}).uploadWorkingText({appType: 'jsondatapath', customPath: 'owned', fileName: 'payload.json', text: 'body'})).rejects.toThrow('文件名')
    expect(http.requests).toHaveLength(1)
  })

  it.each(['/tenant/other/payload.json', '/tenant/notowned/payload.json', '/tenant/owned/../payload.json', 'payload.json'])('rejects a same-name ACK from another directory: %s', async filePath => {
    const http = new FixtureHttpClient({Code: 200, Result: [{state: 'success', filePath}]}, 'body')
    await expect(new LowcodeDesignFileUpload({http, readScope: fixtureScope}).uploadWorkingText({appType: 'jsondatapath', customPath: 'owned', fileName: 'payload.json', text: 'body'})).rejects.toThrow('文件名')
    expect(http.requests).toHaveLength(1)
  })

  it('preserves Unicode-only directory and basename accepted by the formal Java sanitizer', async () => {
    const http = new FixtureHttpClient({Code: 200, Result: [{state: 'success', filePath: '/DesignFilePaths_publisher/　/　'}]}, 'body')
    await new LowcodeDesignFileUpload({http, readScope: fixtureScope}).uploadWorkingText({customPath: '　', fileName: '　', text: 'body'})
    expect(http.requests[1]?.data).toMatchObject({customPath: '　', fileName: '　'})
  })

  it.each([
    {customPath: '', filePath: '/tenant/other/payload.json'},
    {customPath: '', filePath: '/payload.json'},
    {customPath: 'owned', filePath: '/tenant/other/owned/payload.json'},
  ])('rejects extra/missing namespace segments: $customPath $filePath', async ({customPath, filePath}) => {
    const http = new FixtureHttpClient({Code: 200, Result: [{state: 'success', filePath}]}, 'body')
    await expect(new LowcodeDesignFileUpload({http, readScope: fixtureScope}).uploadWorkingText({appType: 'jsondatapath', customPath, fileName: 'payload.json', text: 'body'})).rejects.toThrow('文件名')
    expect(http.requests).toHaveLength(1)
  })

  it('accepts the already explicit design owner prefix without adding a second prefix', async () => {
    const http = new FixtureHttpClient({Code: 200, Result: [{state: 'success', filePath: '/DesignFilePaths_publisher/owned/script.js'}]}, 'body')
    await new LowcodeDesignFileUpload({http, readScope: fixtureScope}).uploadWorkingText({customPath: 'DesignFilePaths_publisher/owned', fileName: 'script.js', text: 'body'})
    expect(http.requests).toHaveLength(2)
  })

  it.each(['/DesignFilePaths_/owned/script.js', '/DesignFilePaths_publisher/DesignFilePaths_publisher/owned/script.js'])('rejects an empty or duplicated owner: %s', async filePath => {
    const http = new FixtureHttpClient({Code: 200, Result: [{state: 'success', filePath}]}, 'body')
    const customPath = filePath.includes('/DesignFilePaths_/') ? 'owned' : 'DesignFilePaths_publisher/owned'
    await expect(new LowcodeDesignFileUpload({http, readScope: fixtureScope}).uploadWorkingText({customPath, fileName: 'script.js', text: 'body'})).rejects.toThrow('文件名')
  })

  it('preserves an explicitly supplied design owner prefix in its original case', async () => {
    const http = new FixtureHttpClient({Code: 200, Result: [{state: 'success', filePath: '/designfilepaths_publisher/owned/script.js'}]}, 'body')
    await new LowcodeDesignFileUpload({http, readScope: fixtureScope}).uploadWorkingText({customPath: 'designfilepaths_publisher/owned', fileName: 'script.js', text: 'body'})
    expect(http.requests).toHaveLength(2)
  })

})
