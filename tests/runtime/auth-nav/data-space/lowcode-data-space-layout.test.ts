import type { RequestConfig } from '@spark-appworks/spark-utils'
import { Request } from '@spark-appworks/spark-utils'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const transport = { request: vi.fn() }
const originalTransport = Object.getOwnPropertyDescriptor(Request.prototype, 'executeRequest')
let runtime: typeof import('../../../../src/lowcode/lowcode-runtime')
let layout: typeof import('../../../../src/lowcode/data-space/lowcode-data-space-layout').lowcodeDataSpaceLayout

function selectApplication(applicationId = 'APP-1'): void {
  runtime.lowcodeApi.session.save({ accessToken: 'fixture-access', refreshToken: 'fixture-refresh',
    accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
    identity: { userId: 'USER-1', account: 'fixture', displayName: 'fixture', enterpriseId: 'TENANT-1',
      enterpriseShortName: 'fixture-tenant', role: null, raw: {} },
    enterprise: { id: 'TENANT-1', name: 'fixture', code: 'fixture', shortName: 'fixture-tenant', shortCode: 'fixture', raw: {} },
  })
  runtime.lowcodeApi.application.save({ application: { id: applicationId, code: 'APP-CODE', name: 'fixture', description: '',
    enterpriseId: 'OWNER-1', enterpriseShortName: 'owner', isDefault: false }, navigationRootId: 'NAV-ROOT' })
}

function arrayBuffer(text: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(text)
  const buffer = new ArrayBuffer(encoded.length)
  new Uint8Array(buffer).set(encoded)
  return buffer
}

describe('lowcode data space layout reader', () => {
  beforeAll(async () => {
    if (!originalTransport) throw new Error('missing Request transport')
    Object.defineProperty(Request.prototype, 'executeRequest', {
      ...originalTransport,
      value: async (config: RequestConfig) => transport.request(config),
    })
    runtime = await import('../../../../src/lowcode/lowcode-runtime')
    ;({ lowcodeDataSpaceLayout: layout } = await import('../../../../src/lowcode/data-space/lowcode-data-space-layout'))
  })
  afterAll(() => { if (originalTransport) Object.defineProperty(Request.prototype, 'executeRequest', originalTransport) })
  afterEach(() => {
    transport.request.mockReset()
    runtime.lowcodeApi.application.clear()
    runtime.lowcodeApi.session.clear()
  })

  it('uses the fixed design locator and preserves the exact text', async () => {
    selectApplication()
    const reader = layout.createReader()
    const source = '{"graphVersion":1}\n'
    transport.request.mockResolvedValue({ data: { Code: 200, Result: source }, status: 200, statusText: 'OK', headers: {} })
    await expect(reader.readDataSpaceLayout('90A-ID')).resolves.toBe(source)
    expect(transport.request).toHaveBeenCalledWith(expect.objectContaining({
      url: '/api/File/content/text', method: 'POST',
      data: expect.objectContaining({ appType: 'designfile', customPath: 'SysForm', fileName: '90A-ID.json', isCrossEnt: false }),
      headers: expect.objectContaining({ 'X-AppId': 'APP-1', 'x-FormKey': layout.scenarioId }),
    }))
    transport.request.mockResolvedValue({ data: { Code: 200, Result: '' }, status: 200, statusText: 'OK', headers: {} })
    await expect(reader.readDataSpaceLayout('90A-ID')).resolves.toBe('')
  })

  it.each(['', '.', '..', 'a/b', 'a\\b', '%2e%2e', '%252e%252e', 'bad\nkey', '\nfoo', 'foo\n', 'foo%'])('rejects invalid IDs before transport: %j', async id => {
    selectApplication()
    const reader = layout.createReader()
    await expect(reader.readDataSpaceLayout(id)).rejects.toThrow()
    expect(transport.request).not.toHaveBeenCalled()
  })

  it('maps only API 404 to null and preserves other failures', async () => {
    selectApplication()
    const reader = layout.createReader()
    for (const code of [404, 403, 500]) {
      transport.request.mockResolvedValue({ data: { Code: code, Message: 'failure', Result: null }, status: 200, statusText: 'OK', headers: {} })
      if (code === 404) await expect(reader.readDataSpaceLayout('90A-ID')).resolves.toBeNull()
      else await expect(reader.readDataSpaceLayout('90A-ID')).rejects.toMatchObject({ code })
    }
    transport.request.mockRejectedValue(new Error('fixture network failure'))
    await expect(reader.readDataSpaceLayout('90A-ID')).rejects.toThrow('fixture network failure')
    transport.request.mockResolvedValue({ data: { Code: 200, Result: {} }, status: 200, statusText: 'OK', headers: {} })
    await expect(reader.readDataSpaceLayout('90A-ID')).rejects.toThrow(/不是字符串/)
  })

  it('rejects reads when the application scope changes before or during the request', async () => {
    selectApplication()
    const reader = layout.createReader()
    const session = runtime.lowcodeApi.session.get()
    if (!session) throw new Error('fixture session missing')
    runtime.lowcodeApi.session.save({ ...session, identity: { ...session.identity } })
    await expect(reader.readDataSpaceLayout('90A-ID')).rejects.toThrow(/SPARK_EXECUTION_SCOPE_STALE/)
    expect(transport.request).not.toHaveBeenCalled()

    selectApplication()
    const failingReader = layout.createReader()
    let finishFailure: ((response: unknown) => void) | undefined
    transport.request.mockImplementation(() => new Promise(resolve => { finishFailure = resolve }))
    const failedPending = failingReader.readDataSpaceLayout('90A-ID')
    await vi.waitFor(() => expect(transport.request).toHaveBeenCalledOnce())
    selectApplication('APP-2')
    finishFailure?.({ data: { Code: 404, Message: 'missing', Result: null }, status: 200, statusText: 'OK', headers: {} })
    await expect(failedPending).rejects.toThrow(/SPARK_EXECUTION_SCOPE_STALE/)

    selectApplication()
    transport.request.mockReset()
    const applicationReader = layout.createReader()
    let finish: ((response: unknown) => void) | undefined
    transport.request.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = applicationReader.readDataSpaceLayout('90A-ID')
    await vi.waitFor(() => expect(transport.request).toHaveBeenCalledOnce())
    selectApplication('APP-2')
    finish?.({ data: { Code: 200, Result: 'late' }, status: 200, statusText: 'OK', headers: {} })
    await expect(pending).rejects.toThrow(/SPARK_EXECUTION_SCOPE_STALE/)
  })

  it('rejects when the selected application is absent', () => {
    selectApplication()
    runtime.lowcodeApi.application.clear()
    expect(() => layout.createReader()).toThrow(/明确选中应用/)
    expect(transport.request).not.toHaveBeenCalled()
  })

  it('writes only the expected existing graph through the verified upload owner', async () => {
    selectApplication()
    const previous = '{"graphVersion":1,"nodes":[{"id":"N1"}],"edges":[]}'
    const next = '{"graphVersion":1,"nodes":[{"id":"N1"}],"edges":[{"id":"E1"}],"extension":{"keep":true}}'
    const previousBytes = arrayBuffer(previous)
    const nextBytes = arrayBuffer(next)
    let downloadCount = 0
    transport.request.mockImplementation(async (config: RequestConfig) => {
      if (config.url === '/api/File/UploadFile') {
        return { data: { Code: 200, Result: [{ state: 'success', filePath: 'SysForm/90A-ID.json' }] },
          status: 200, statusText: 'OK', headers: {} }
      }
      const bytes = downloadCount++ === 0 ? previousBytes : nextBytes
      return { data: bytes, status: 200, statusText: 'OK', headers: {} }
    })

    const writer = layout.createWriter()
    await expect(writer.saveDataSpaceLayout({ dataSpaceId: '90A-ID', content: next, expectedContent: previous }))
      .resolves.toBeUndefined()
    expect(transport.request.mock.calls.map(([config]) => config.url)).toEqual([
      '/api/File/DownFile', '/api/File/UploadFile', '/api/File/DownFile',
    ])
    const upload = transport.request.mock.calls[1]?.[0]
    expect(upload?.headers).toMatchObject({ 'X-AppId': 'APP-1' })
    expect(upload?.data).toBeInstanceOf(FormData)
    if (!(upload?.data instanceof FormData)) throw new Error('missing graph upload form')
    expect(upload.data.get('customPath')).toBe('SysForm')
    expect(upload.data.get('newName')).toBe('90A-ID.json')
    expect(upload.data.get('isReplace')).toBe('true')
    const uploadedFile = upload.data.get('file')
    if (!(uploadedFile instanceof Blob)) throw new Error('missing graph upload bytes')
    expect(new Uint8Array(await uploadedFile.arrayBuffer())).toEqual(new Uint8Array(nextBytes))
  })

  it('creates a missing graph with non-replacement upload and exact byte readback', async () => {
    selectApplication()
    const content = '{"graphVersion":1,"nodes":[],"edges":[]}'
    transport.request.mockImplementation(async (config: RequestConfig) => {
      if (config.url === '/api/File/content/text') return {data: {Code: 404, Message: 'missing'}, status: 200, statusText: 'OK', headers: {}}
      if (config.url === '/api/File/UploadFile') return {data: {Code: 200, Result: [
        {state: 'success', filePath: 'SysForm/90A-ID.json'}]}, status: 200, statusText: 'OK', headers: {}}
      return {data: arrayBuffer(content), status: 200, statusText: 'OK', headers: {}}
    })
    await expect(layout.createWriter().createDataSpaceLayout({dataSpaceId: '90A-ID', content})).resolves.toBeUndefined()
    expect(transport.request.mock.calls.map(([config]) => config.url)).toEqual([
      '/api/File/content/text', '/api/File/UploadFile', '/api/File/DownFile'])
    const upload = transport.request.mock.calls[1]?.[0]
    if (!(upload?.data instanceof FormData)) throw new Error('missing upload form')
    expect(upload.data.get('isReplace')).toBe('false')
    expect(upload.data.get('newName')).toBe('90A-ID.json')
  })

  it.each([200, 403, 500])('rejects creation unless the exact layout file is missing: %i', async code => {
    selectApplication()
    transport.request.mockResolvedValue({data: {Code: code, Result: code === 200 ? '{}' : null},
      status: 200, statusText: 'OK', headers: {}})
    await expect(layout.createWriter().createDataSpaceLayout({dataSpaceId: '90A-ID',
      content: '{"graphVersion":1,"nodes":[],"edges":[]}'})).rejects.toThrow()
    expect(transport.request).toHaveBeenCalledTimes(1)
  })

  it('rejects a renamed non-replacement upload without claiming the requested file was created', async () => {
    selectApplication()
    transport.request.mockImplementation(async (config: RequestConfig) => config.url === '/api/File/content/text'
      ? {data: {Code: 404, Message: 'missing'}, status: 200, statusText: 'OK', headers: {}}
      : {data: {Code: 200, Result: [{state: 'success', filePath: 'SysForm/90A-ID-other.json'}]},
        status: 200, statusText: 'OK', headers: {}})
    await expect(layout.createWriter().createDataSpaceLayout({dataSpaceId: '90A-ID',
      content: '{"graphVersion":1,"nodes":[],"edges":[]}'})).rejects.toThrow(/文件名/)
    expect(transport.request.mock.calls.map(([config]) => config.url)).toEqual([
      '/api/File/content/text', '/api/File/UploadFile'])
  })

  it('rejects changed, missing, or malformed graph preimages without uploading', async () => {
    selectApplication()
    const writer = layout.createWriter()
    for (const [current, expected, content] of [
      ['{"graphVersion":1,"nodes":[],"edges":[]}', '{"graphVersion":1,"nodes":[{"id":"N1"}],"edges":[]}', '{"graphVersion":1,"nodes":[],"edges":[]}'],
      [null, '{"graphVersion":1,"nodes":[],"edges":[]}', '{"graphVersion":1,"nodes":[],"edges":[]}'],
      ['{}', '{}', '{}'],
    ] as const) {
      transport.request.mockReset()
      if (current === null) {
        transport.request.mockRejectedValue(Object.assign(new Error('missing layout'), {
          name: 'RequestError', response: { Code: 404, Message: 'missing layout' },
        }))
      } else {
        transport.request.mockResolvedValue({ data: arrayBuffer(current),
          status: 200, statusText: 'OK', headers: {} })
      }
      await expect(writer.saveDataSpaceLayout({ dataSpaceId: '90A-ID', expectedContent: expected, content }))
        .rejects.toThrow()
      expect(transport.request).toHaveBeenCalledTimes(expected === '{}' ? 0 : 1)
      expect(transport.request).not.toHaveBeenCalledWith(expect.objectContaining({ url: '/api/File/UploadFile' }))
    }
  })

  it('does not report success when the confirmed upload receipt state is not successful', async () => {
    selectApplication()
    const previous = '{"graphVersion":1,"nodes":[],"edges":[]}'
    const next = '{"graphVersion":1,"nodes":[{"id":"N1"}],"edges":[]}'
    let downloadCount = 0
    transport.request.mockImplementation(async (config: RequestConfig) => {
      if (config.url === '/api/File/UploadFile') {
        return { data: { Code: 200, Result: [{ state: 'failed', filePath: 'SysForm/90A-ID.json' }] },
          status: 200, statusText: 'OK', headers: {} }
      }
      const bytes = arrayBuffer(downloadCount++ === 0 ? previous : next)
      return { data: bytes, status: 200, statusText: 'OK', headers: {} }
    })
    const writer = layout.createWriter()
    await expect(writer.saveDataSpaceLayout({ dataSpaceId: '90A-ID', content: next, expectedContent: previous }))
      .rejects.toThrow(/回执未确认成功/)
    expect(transport.request.mock.calls.map(([config]) => config.url)).toEqual([
      '/api/File/DownFile', '/api/File/UploadFile', '/api/File/DownFile',
    ])
  })

  it('does not upload when the preimage read is denied or its application scope changes', async () => {
    selectApplication()
    const previous = '{"graphVersion":1,"nodes":[],"edges":[]}'
    const next = '{"graphVersion":1,"nodes":[{"id":"N1"}],"edges":[]}'
    const writer = layout.createWriter()
    transport.request.mockRejectedValue(Object.assign(new Error('denied'), {
      name: 'RequestError', status: 403, response: { Code: 403, Message: 'denied' },
    }))
    await expect(writer.saveDataSpaceLayout({ dataSpaceId: '90A-ID', content: next, expectedContent: previous })).rejects.toThrow()
    expect(transport.request).toHaveBeenCalledOnce()
    expect(transport.request).not.toHaveBeenCalledWith(expect.objectContaining({ url: '/api/File/UploadFile' }))

    transport.request.mockReset()
    transport.request.mockImplementation(async () => {
      selectApplication('APP-2')
      return { data: arrayBuffer(previous), status: 200, statusText: 'OK', headers: {} }
    })
    await expect(writer.saveDataSpaceLayout({ dataSpaceId: '90A-ID', content: next, expectedContent: previous }))
      .rejects.toThrow(/SPARK_EXECUTION_SCOPE_STALE/)
    expect(transport.request).toHaveBeenCalledOnce()
    expect(transport.request).not.toHaveBeenCalledWith(expect.objectContaining({ url: '/api/File/UploadFile' }))
  })
})
