import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { describe, expect, it } from 'vitest'

import { LowcodeApi } from '../lowcode-api.js'
import { LowcodeApiError } from '../core/lowcode-api-error.js'

class FixtureHttpClient extends HttpClientBase {
  public requestConfig: RequestConfig | null = null
  public readonly requestConfigs: RequestConfig[] = []
  private fixtureIndex = 0

  public constructor(private readonly fixture: unknown) {
    super()
  }

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requestConfig = config
    this.requestConfigs.push(config)
    return {
      data: Array.isArray(this.fixture) ? this.fixture[this.fixtureIndex++] : this.fixture,
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
}

class FixtureStorage {
  private readonly values = new Map<string, string>()

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  public removeItem(key: string): void {
    this.values.delete(key)
  }
}

describe('LowcodePlatformApi', () => {
  it('reads and normalizes the source-faithful current user response', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Message: '操作成功',
      Result: {
        account: 'admin',
        realName: '管理员',
        avatar: null,
        address: null,
        signature: null,
        orgId: 0,
        buttons: null,
        userInfo: { ROWID: 'U1' },
      },
      Type: 'success',
    })

    const currentUser = await new LowcodeApi({ http }).platform.getCurrentUser()

    expect(http.requestConfig?.url).toBe('/api/LoginAuthority/GetUserInfo')
    expect(http.requestConfig?.method).toBe('GET')
    expect(currentUser).toEqual({
      account: 'admin',
      realName: '管理员',
      avatar: null,
      address: null,
      signature: null,
      orgId: 0,
      orgName: null,
      posName: null,
      buttons: null,
      userInfo: { ROWID: 'U1' },
    })
  })

  it('maps semantic login credentials and normalizes the login session', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: {
        token: 'access-token',
        refreshToken: 'refresh-token',
        expire: 1_800_000,
        refreshExpire: 3_600_000,
        userinfo: {
          ROWID: 'U1',
          LoginName: 'admin',
          UserName: '管理员',
          EntId: 'E1',
          EntShortName: 'Lingma',
          role: 'ADMIN',
        },
        entinfo: {
          rowid: 'E1',
          Name: 'Lingma Enterprise',
          CName: '领码科技',
          ShortName: 'Lingma',
          ShortCName: '领码',
        },
      },
    })

    const storage = new FixtureStorage()
    const api = new LowcodeApi({ http, sessionStorage: storage })
    const session = await api.platform.login({
      enterpriseName: 'Lingma',
      account: 'admin',
      password: 'secret',
    })

    expect(http.requestConfig).toMatchObject({
      url: '/api/LoginAuthority/UserLoginByEnt',
      method: 'POST',
      data: { strUser: 'admin', strPwd: 'secret', entName: 'Lingma' },
    })
    expect(session).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessExpiresAt: 1_800_000,
      refreshExpiresAt: 3_600_000,
      identity: {
        userId: 'U1',
        account: 'admin',
        displayName: '管理员',
        enterpriseId: 'E1',
        enterpriseShortName: 'Lingma',
        role: 'ADMIN',
      },
      enterprise: {
        id: 'E1',
        name: 'Lingma Enterprise',
        code: '领码科技',
        shortName: 'Lingma',
        shortCode: '领码',
      },
    })
    expect(api.session.get()).toEqual(session)
    expect(storage.getItem('spark_lowcode_session')).not.toBeNull()
  })

  it('lists public enterprises by display name while preserving the login ShortName', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: {
        data: {
          Items: [
            { rowid: 'E1', ShortCName: '领码科技', ShortName: 'NewApp' },
          ],
        },
      },
    })

    const enterprises = await new LowcodeApi({ http }).platform.listEnterprises()

    expect(http.requestConfig).toMatchObject({
      url: '/api/DataOperation/GetBaseData',
      method: 'POST',
      meta: { lowcodeSkipAuth: true },
    })
    expect(http.requestConfig?.data).toMatchObject({
      Table: [expect.objectContaining({ Name: 'Base_Enterprise_Info', DbName: 'QYVirtualPlat' })],
    })
    expect(enterprises).toEqual([{
      id: 'E1',
      name: '领码科技',
      shortName: 'NewApp',
      shortCode: '领码科技',
    }])
  })

  it('reads a password-free projection from the authenticated enterprise snapshot', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: null })
    const api = new LowcodeApi({ http })
    const enterpriseSnapshot = {
        rowid: 'E1',
        Name: 'Lingma Technology',
        CName: '领码科技有限公司',
        ShortCName: '领码科技',
        ShortName: 'NewApp',
        domain_name: 'newapp.example.com',
        entadminAccount: 'admin',
        entadminPassword: 'must-not-leak',
        CheckState: 1,
        storage_mode: 0,
        loginPolicy: 'single_device',
        ent_config: JSON.stringify({
          user_audit: true,
          pwd_min_length: 8,
          pwd_max_length: 32,
          pwd_require_letter: true,
          pwd_require_digit: true,
          pwd_require_special: false,
          pwd_special_chars: '!@#',
          mini_program_default_pwd: 'must-not-leak',
          verification_code_length: 6,
        }),
    }
    api.session.save({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessExpiresAt: 1,
      refreshExpiresAt: 2,
      identity: {
        userId: 'U1',
        account: 'admin',
        displayName: '管理员',
        enterpriseId: 'E1',
        enterpriseShortName: 'NewApp',
        role: 'ADMIN',
        raw: {},
      },
      enterprise: {
        id: 'E1',
        name: 'Lingma Technology',
        code: '领码科技有限公司',
        shortName: 'NewApp',
        shortCode: '领码科技',
        raw: enterpriseSnapshot,
      },
    })

    const enterprise = await api.platform.getEnterpriseInfo()

    expect(http.requestConfig).toBeNull()
    expect(enterprise).toEqual({
      id: 'E1',
      englishName: 'Lingma Technology',
      chineseName: '领码科技有限公司',
      chineseShortName: '领码科技',
      domainKey: 'NewApp',
      domainName: 'newapp.example.com',
      iconUrl: null,
      portalUrl: null,
      administratorAccount: 'admin',
      checkState: 1,
      createdAt: null,
      loginPolicy: 'single_device',
      storageMode: 0,
      policy: {
        userAudit: true,
        passwordMinLength: 8,
        passwordMaxLength: 32,
        passwordRequiresLetter: true,
        passwordRequiresDigit: true,
        passwordRequiresSpecial: false,
        passwordSpecialCharacters: '!@#',
        verificationCodeLength: 6,
      },
    })
    expect(JSON.stringify(enterprise)).not.toContain('must-not-leak')
  })

  it('refreshes access credentials with both source-defined token headers', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: {
        token: 'new-access',
        refreshToken: 'refresh-token',
        expire: 7_200_000,
        refreshExpire: 9_000_000,
      },
    })
    const api = new LowcodeApi({ http })
    const session = {
      accessToken: 'old-access',
      refreshToken: 'refresh-token',
      accessExpiresAt: 1,
      refreshExpiresAt: 2,
      identity: {
        userId: 'U1',
        account: 'admin',
        displayName: '管理员',
        enterpriseId: 'E1',
        enterpriseShortName: 'Lingma',
        role: 'ADMIN',
        raw: { ROWID: 'U1' },
      },
      enterprise: {
        id: 'E1',
        name: 'Lingma Enterprise',
        code: '领码科技',
        shortName: 'Lingma',
        shortCode: '领码',
        raw: { rowid: 'E1' },
      },
    }

    api.session.save(session)
    const refreshed = await api.platform.refreshSession()

    expect(http.requestConfig).toMatchObject({
      url: '/api/LoginAuthority/refresh',
      method: 'POST',
      data: null,
      headers: {
        Authorization: 'Bearer old-access',
        'X-Authorization': 'Bearer refresh-token',
      },
    })
    expect(refreshed.accessToken).toBe('new-access')
    expect(refreshed.refreshToken).toBe('refresh-token')
    expect(refreshed.identity).toBe(session.identity)
  })

  it('logs out through the real GET endpoint with the access token', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: null })
    const api = new LowcodeApi({ http })
    api.session.save({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessExpiresAt: 1,
      refreshExpiresAt: 2,
      identity: {
        userId: 'U1',
        account: 'admin',
        displayName: '管理员',
        enterpriseId: null,
        enterpriseShortName: 'Lingma',
        role: null,
        raw: {},
      },
      enterprise: {
        id: null,
        name: null,
        code: null,
        shortName: 'Lingma',
        shortCode: null,
        raw: {},
      },
    })

    await api.platform.logout()

    expect(http.requestConfig).toMatchObject({
      url: '/api/LoginAuthority/UserLogoutByEnt',
      method: 'GET',
      headers: { Authorization: 'Bearer access-token' },
    })
    expect(api.session.get()).toBeNull()
  })

  it('injects the stored access token into authenticated platform requests', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: { account: 'admin', realName: '管理员', userInfo: {} },
    })
    const api = new LowcodeApi({ http })
    api.session.save({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessExpiresAt: Date.now() + 60_000,
      refreshExpiresAt: Date.now() + 120_000,
      identity: {
        userId: 'U1',
        account: 'admin',
        displayName: '管理员',
        enterpriseId: null,
        enterpriseShortName: 'Lingma',
        role: null,
        raw: {},
      },
      enterprise: {
        id: null,
        name: null,
        code: null,
        shortName: 'Lingma',
        shortCode: null,
        raw: {},
      },
    })

    await api.platform.getCurrentUser()

    expect(http.requestConfig?.headers).toMatchObject({ Authorization: 'Bearer access-token' })
  })

  it('refreshes an expired access token before an authenticated request', async () => {
    const http = new FixtureHttpClient([
      {
        Code: 200,
        Result: {
          token: 'new-access',
          refreshToken: 'new-refresh',
          expire: Date.now() + 60_000,
          refreshExpire: Date.now() + 120_000,
        },
      },
      {
        Code: 200,
        Result: { account: 'admin', realName: '管理员', userInfo: {} },
      },
    ])
    const api = new LowcodeApi({ http })
    api.session.save({
      accessToken: 'expired-access',
      refreshToken: 'valid-refresh',
      accessExpiresAt: Date.now() - 1,
      refreshExpiresAt: Date.now() + 60_000,
      identity: {
        userId: 'U1',
        account: 'admin',
        displayName: '管理员',
        enterpriseId: null,
        enterpriseShortName: 'NewApp',
        role: null,
        raw: {},
      },
      enterprise: {
        id: null,
        name: null,
        code: null,
        shortName: 'NewApp',
        shortCode: '领码科技',
        raw: { ShortName: 'NewApp', ShortCName: '领码科技' },
      },
    })

    await api.platform.getCurrentUser()

    expect(http.requestConfigs).toHaveLength(2)
    expect(http.requestConfigs[0]).toMatchObject({
      url: '/api/LoginAuthority/refresh',
      headers: {
        Authorization: 'Bearer expired-access',
        'X-Authorization': 'Bearer valid-refresh',
      },
    })
    expect(http.requestConfigs[1]).toMatchObject({
      url: '/api/LoginAuthority/GetUserInfo',
      headers: { Authorization: 'Bearer new-access' },
    })
  })

  it('reads tenant-scoped cache counts without enumerating keys or values', async () => {
    const http = new FixtureHttpClient([
      { Code: 200, Result: { Count: 7, Items: [] } },
      { Code: 200, Result: { Count: 12, Items: [] } },
    ])

    const stats = await new LowcodeApi({ http }).platform.getCacheStats()

    expect(stats).toEqual({ dataSetModelCount: 7, developmentFileCount: 12 })
    expect(http.requestConfigs).toEqual([
      expect.objectContaining({
        url: '/api/sysCache/findByPatternPageWithTotal',
        method: 'POST',
        data: { prefix: 'DATA_SET_MODEL', page: 1, size: 1 },
      }),
      expect.objectContaining({
        url: '/api/sysCache/findByPatternPageWithTotal',
        method: 'POST',
        data: { prefix: 'DEV_FILE_UPDATE_TIME', page: 1, size: 1 },
      }),
    ])
  })

  it('fails closed when lowcode reports an application error', async () => {
    const http = new FixtureHttpClient({
      Code: 401,
      Message: '令牌不能为空',
      Type: 'error',
    })

    const action = new LowcodeApi({ http }).platform.getCurrentUser()

    await expect(action).rejects.toEqual(new LowcodeApiError(401, '令牌不能为空'))
  })

  it('fails closed when the response is not an AjaxResult', async () => {
    const http = new FixtureHttpClient({ result: { account: 'admin' } })

    const action = new LowcodeApi({ http }).platform.getCurrentUser()

    await expect(action).rejects.toEqual(new LowcodeApiError(0, 'lowcode 响应缺少数字 Code'))
  })

  it('maps user registration to the source DTO without inventing a session', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: { userId: 'U2' } })
    const api = new LowcodeApi({ http })

    const result = await api.platform.registerUser({
      enterpriseName: 'Lingma',
      account: 'alice',
      displayName: 'Alice',
      password: 'secret-123',
      sex: 'F',
      channel: 'EMAIL',
      phone: '',
      email: 'alice@example.com',
      verificationCode: '123456',
    })

    expect(http.requestConfig).toMatchObject({
      url: '/api/LoginAuthority/register',
      method: 'POST',
      data: {
        ent: 'Lingma',
        loginName: 'alice',
        username: 'Alice',
        type: 'EMAIL',
        email: 'alice@example.com',
        code: '123456',
      },
      meta: { lowcodeSkipAuth: true },
    })
    expect(result.id).toBe('U2')
    expect(api.session.get()).toBeNull()
  })

  it('maps enterprise registration to AddEntRequest and BaseEnterpriseInfo', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: { rowid: 'E2' } })
    const api = new LowcodeApi({ http })

    const result = await api.platform.registerEnterprise({
      englishName: 'Example Technology',
      chineseName: '示例科技',
      domainKey: 'EXAMPLE',
      chineseShortName: '示例',
      administratorAccount: 'admin',
      administratorPassword: 'secret-123',
      channel: 'MOBILE',
      verificationAccount: '13800138000',
      verificationCode: '123456',
      phone: '13800138000',
      email: '',
    })

    expect(http.requestConfig).toMatchObject({
      url: '/api/Ent/AddEnterprise',
      method: 'POST',
      data: {
        ent: {
          Name: 'Example Technology',
          CName: '示例科技',
          ShortName: 'EXAMPLE',
          ShortCName: '示例',
          entadminAccount: 'admin',
          entInfoUserPhone: '13800138000',
          storage_mode: 0,
        },
        account: '13800138000',
        type: 'MOBILE',
        code: '123456',
      },
      meta: { lowcodeSkipAuth: true },
    })
    expect(result.id).toBe('E2')
  })
})
