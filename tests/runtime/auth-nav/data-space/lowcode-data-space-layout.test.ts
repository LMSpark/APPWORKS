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

describe('lowcode data space layout reader', () => {
  beforeAll(async () => {
    if (!originalTransport) throw new Error('missing Request transport')
    Object.defineProperty(Request.prototype, 'executeRequest', {
      ...originalTransport,
      value: async (config: RequestConfig) => transport.request(config),
    })
    runtime = await import('../../../../src/lowcode/lowcode-runtime')
    ;({ lowcodeDataSpaceLayout: layout } = await import('../../../../src/lowcode/data-space/lowcode-data-space-layout'))
  }, 60000)
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
})
