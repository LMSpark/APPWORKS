import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

import * as runtime from '../../../../src/lowcode/lowcode-runtime'

const { hasLowcodeSession, lowcodeApi, readLowcodePrincipal } = runtime

describe('lowcode session guard', () => {
  beforeEach(() => {
    lowcodeApi.application.clear()
    lowcodeApi.session.clear()
  })

  it('returns false when the persisted session is absent', () => {
    expect(hasLowcodeSession()).toBe(false)
  })

  it('returns false when the persisted session is malformed', () => {
    localStorage.setItem('spark_lowcode_session', '{malformed')
    expect(hasLowcodeSession()).toBe(false)
  })

  it('returns true only for a complete lowcode token and identity session', () => {
    lowcodeApi.session.save({
      accessToken: 'access',
      refreshToken: 'refresh',
      accessExpiresAt: Date.now() + 60_000,
      refreshExpiresAt: Date.now() + 120_000,
      identity: {
        userId: 'U1', account: 'demo', displayName: 'Demo', enterpriseId: 'E1',
        enterpriseShortName: 'ENT', role: 'USER', raw: {},
      },
      enterprise: {
        id: 'E1', name: 'Enterprise', code: '企业', shortName: 'ENT', shortCode: '企', raw: {},
      },
    })
    expect(hasLowcodeSession()).toBe(true)
  })

  it('exposes the login identity without a frontend role model', () => {
    lowcodeApi.session.save({
      accessToken: 'access',
      refreshToken: 'refresh',
      accessExpiresAt: Date.now() + 60_000,
      refreshExpiresAt: Date.now() + 120_000,
      identity: {
        userId: 'U1', account: 'demo', displayName: 'Demo', enterpriseId: 'E1',
        enterpriseShortName: 'ENT', role: 'SUPER_ADMIN', raw: {},
      },
      enterprise: {
        id: 'E1', name: 'Enterprise', code: '企业', shortName: 'ENT', shortCode: '企', raw: {},
      },
    })
    const principal = readLowcodePrincipal()
    expect(principal).toEqual({
      userId: 'U1', username: 'demo', displayName: 'Demo', enterpriseName: 'ENT', applicationId: null,
    })
    expect(Object.keys(runtime)).not.toContain('isLowcodePlatformAdministrator')
  })

  it('keeps role fields out of app and shell user contracts', () => {
    const root = resolve(__dirname, '../../../..')
    for (const file of ['src/lowcode/lowcode-runtime.ts', 'src/main.ts', 'packages/spark-app/src/types.ts',
      'packages/spark-app/src/app/bootstrap.ts', 'src/views/app/demo/CapabilityDemo.vue']) {
      const source = readFileSync(resolve(root, file), 'utf8')
      expect(source, file).not.toMatch(/\broles\b|SUPER_ADMIN/)
    }
  })
})
