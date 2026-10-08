import type { RequestConfig } from '@spark-appworks/spark-utils'
import { Request } from '@spark-appworks/spark-utils'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const transport = { request: vi.fn() }
const originalTransport = Object.getOwnPropertyDescriptor(Request.prototype, 'executeRequest')
let runtime: typeof import('../../../../src/lowcode/lowcode-runtime')
let design: typeof import('../../../../src/lowcode/data-space/lowcode-data-space-design').lowcodeDataSpaceDesign

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

describe('lowcode data space design dictionary reader', () => {
  beforeAll(async () => {
    if (!originalTransport) throw new Error('missing Request transport')
    Object.defineProperty(Request.prototype, 'executeRequest', {
      ...originalTransport,
      value: async (config: RequestConfig) => transport.request(config),
    })
    runtime = await import('../../../../src/lowcode/lowcode-runtime')
    ;({ lowcodeDataSpaceDesign: design } = await import('../../../../src/lowcode/data-space/lowcode-data-space-design'))
  })
  afterAll(() => { if (originalTransport) Object.defineProperty(Request.prototype, 'executeRequest', originalTransport) })
  afterEach(() => {
    transport.request.mockReset()
    runtime.lowcodeApi.application.clear()
    runtime.lowcodeApi.session.clear()
  })

  it('reads options through the formal dictionary API under the captured application scope', async () => {
    selectApplication()
    transport.request.mockResolvedValue({ data: { Code: 200, Result: { data: { Items: [{ txt: 'Foreign key', rowid: 'FK', ordIdx: 1, val: 'FK' }], Count: 1 } } },
      status: 200, statusText: 'OK', headers: {} })
    const reader = design.createReader()
    await expect(reader.readRelationDependencyOptions()).resolves.toEqual([{ label: 'Foreign key', value: 'FK' }])
    expect(transport.request).toHaveBeenCalledOnce()
    expect(transport.request).toHaveBeenCalledWith(expect.objectContaining({
      url: '/api/DataOperation/GetData',
      data: expect.objectContaining({ Table: [expect.objectContaining({ Name: '数据关系依赖', Type: '字典' })] }),
      headers: expect.objectContaining({ 'X-AppId': 'APP-1' }),
    }))
  })

  it('rejects a reader when application scope changes before or during the request', async () => {
    selectApplication()
    const staleReader = design.createReader()
    selectApplication('APP-2')
    await expect(staleReader.readRelationDependencyOptions()).rejects.toThrow(/SPARK_EXECUTION_SCOPE_STALE/)
    expect(transport.request).not.toHaveBeenCalled()

    selectApplication()
    const pendingReader = design.createReader()
    let finish: ((response: unknown) => void) | undefined
    transport.request.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = pendingReader.readRelationDependencyOptions()
    await vi.waitFor(() => expect(transport.request).toHaveBeenCalledOnce())
    selectApplication('APP-2')
    finish?.({ data: { Code: 200, Result: { data: { Items: [{ txt: 'Foreign key', rowid: 'FK', ordIdx: 1, val: 'FK' }], Count: 1 } } },
      status: 200, statusText: 'OK', headers: {} })
    await expect(pending).rejects.toThrow(/SPARK_EXECUTION_SCOPE_STALE/)
  })

  it('requires an explicitly selected application before creating a reader', () => {
    selectApplication()
    runtime.lowcodeApi.application.clear()
    expect(() => design.createReader()).toThrow(/明确选中应用/)
    expect(transport.request).not.toHaveBeenCalled()
  })
})
