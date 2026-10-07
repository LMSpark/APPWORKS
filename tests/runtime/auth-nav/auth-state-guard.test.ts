import { beforeEach, describe, expect, it } from 'vitest'

import { hasLowcodeSession, lowcodeApi } from '../../../src/lowcode/lowcode-runtime'

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
})
