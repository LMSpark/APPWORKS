import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { describe, expect, it } from 'vitest'
import { LowcodeApi } from './lowcode-api.js'

class ScopeHttpClient extends HttpClientBase {
  protected override async executeRequest(_config: RequestConfig): Promise<HttpResponse<unknown>> {
    return {data: null, status: 200, statusText: 'OK', headers: {}}
  }
}

class ScopeStorage {
  readonly #values = new Map<string, string>()
  getItem(key: string): string | null {return this.#values.get(key) ?? null}
  setItem(key: string, value: string): void {this.#values.set(key, value)}
  removeItem(key: string): void {this.#values.delete(key)}
}

function createApi(): LowcodeApi {return new LowcodeApi({http: new ScopeHttpClient(), sessionStorage: new ScopeStorage()})}

const session = (input: Readonly<{identity?: string; expiresAt?: number; accessToken?: string; refreshToken?: string}> = {}) => ({
  accessToken: input.accessToken ?? 'secret-access-token',
  refreshToken: input.refreshToken ?? 'secret-refresh-token',
  accessExpiresAt: Date.now() + 60_000,
  refreshExpiresAt: input.expiresAt ?? Date.now() + 120_000,
  identity: {userId: input.identity ?? 'user-1', account: 'user', displayName: 'User', enterpriseId: 'enterprise-1',
    enterpriseShortName: 'Enterprise', role: null, raw: {}},
  enterprise: {id: 'enterprise-1', name: 'Enterprise', code: 'E1', shortName: 'Enterprise', shortCode: 'E1', raw: {}},
})

describe('LowcodeApi request scopes', () => {
  it('provides an authenticated session scope without requiring or adding an application', () => {
    const api = createApi()
    api.session.save(session())

    const scope = api.readAuthenticatedRequestScope()

    expect(scope.headers).toEqual({})
    expect(scope.token).toContain('user-1')
    expect(scope.token).not.toContain('secret-access-token')
    expect(scope.token).not.toContain('secret-refresh-token')
    expect(scope.headers).not.toHaveProperty('Authorization')
    expect(() => api.readRequestScope()).toThrow('SPARK_EXECUTION_SCOPE_REQUIRED: 数据空间请求需要明确选中应用')
  })

  it('rejects a missing or expired authenticated session', () => {
    const missing = createApi()
    expect(() => missing.readAuthenticatedRequestScope()).toThrow('SPARK_EXECUTION_SCOPE_REQUIRED: 数据空间请求需要有效登录身份')

    const expired = createApi()
    expired.session.save(session({expiresAt: Date.now() - 1}))
    expect(() => expired.readAuthenticatedRequestScope()).toThrow('SPARK_EXECUTION_SCOPE_REQUIRED: 数据空间请求需要有效登录身份')
  })

  it('stays stable across application selection and changes with session identity or revision', () => {
    const api = createApi()
    api.session.save(session())
    const initial = api.readAuthenticatedRequestScope()

    api.application.save({application: {id: 'APP-1', code: 'APP', name: 'App', description: '',
      enterpriseId: 'enterprise-1', enterpriseShortName: 'Enterprise', isDefault: false}, navigationRootId: 'ROOT'})
    expect(api.readAuthenticatedRequestScope()).toEqual(initial)

    api.session.save(session())
    const changedRevision = api.readAuthenticatedRequestScope()
    expect(changedRevision.token).not.toBe(initial.token)

    api.session.save(session({identity: 'user-2'}))
    const changedIdentity = api.readAuthenticatedRequestScope()
    expect(changedIdentity.token).not.toBe(changedRevision.token)
    expect(changedIdentity.token).not.toContain('secret-access-token')

    api.session.clear()
    expect(() => api.readAuthenticatedRequestScope()).toThrow('SPARK_EXECUTION_SCOPE_REQUIRED: 数据空间请求需要有效登录身份')
    api.session.save(session({identity: 'user-3'}))
    expect(api.readAuthenticatedRequestScope().token).not.toBe(changedIdentity.token)
  })

  it('preserves the existing selected-application scope contract', () => {
    const api = createApi()
    api.session.save(session())
    api.application.save({application: {id: 'APP-1', code: 'APP', name: 'App', description: '',
      enterpriseId: 'enterprise-1', enterpriseShortName: 'Enterprise', isDefault: false}, navigationRootId: 'ROOT'})

    expect(api.readRequestScope()).toEqual({
      token: JSON.stringify(['Enterprise', 'enterprise-1', 'user-1', 'enterprise-1', 'APP-1', 'enterprise-1', 'Enterprise',
        api.session.revision, api.application.revision]),
      headers: {'tenant-id': 'Enterprise', 'visit-tenant-id': 'Enterprise', 'x-FirstFolder': 'Enterprise', 'X-AppId': 'APP-1'},
    })
  })
})
