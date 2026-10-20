import type { RequestConfig } from '@spark-appworks/spark-utils'
import { Request } from '@spark-appworks/spark-utils'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const transport = { request: vi.fn() }
const originalTransport = Object.getOwnPropertyDescriptor(Request.prototype, 'executeRequest')
let runtime: typeof import('../../../../src/lowcode/lowcode-runtime')
let design: typeof import('../../../../src/lowcode/data-space/lowcode-data-space-design').openLowcodeDataSpaceDesignSession

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

describe('native data space design session factory', () => {
  beforeAll(async () => {
    if (!originalTransport) throw new Error('missing Request transport')
    Object.defineProperty(Request.prototype, 'executeRequest', {
      ...originalTransport,
      value: async (config: RequestConfig) => transport.request(config),
    })
    runtime = await import('../../../../src/lowcode/lowcode-runtime')
    ;({ openLowcodeDataSpaceDesignSession: design } = await import('../../../../src/lowcode/data-space/lowcode-data-space-design'))
  }, 60000)
  afterAll(() => { if (originalTransport) Object.defineProperty(Request.prototype, 'executeRequest', originalTransport) })
  afterEach(() => {
    transport.request.mockReset()
    runtime.lowcodeApi.application.clear()
    runtime.lowcodeApi.session.clear()
  })

  it('requires an explicitly selected application before opening a design session', () => {
    selectApplication()
    runtime.lowcodeApi.application.clear()
    expect(() => design('T')).toThrow(/明确选中应用/)
    expect(transport.request).not.toHaveBeenCalled()
  })
})
