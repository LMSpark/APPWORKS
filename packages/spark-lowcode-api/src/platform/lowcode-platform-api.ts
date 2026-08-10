import type { HttpClientBase } from '@spark-appworks/spark-utils'

import { LowcodeApiError } from '../core/lowcode-api-error.js'
import { LowcodeClient } from '../core/lowcode-client.js'
import {
  applicationCatalogQuery,
  LOWCODE_APPLICATION_CATALOG_FORM_KEY,
  navigationRootQuery,
  normalizeApplications,
  normalizeNavigationRootId,
  type LowcodeApplication,
} from './lowcode-application.js'
import type { LowcodeApplicationStore } from './lowcode-application-store.js'
import {
  enterpriseCatalogQuery,
  normalizeEnterpriseCatalog,
  normalizeEnterpriseInfo,
  type LowcodeEnterpriseCatalogItem,
  type LowcodeEnterpriseInfo,
} from './lowcode-enterprise.js'
import type { LowcodeSessionStore } from './lowcode-session-store.js'

export type LowcodeCurrentUser = Readonly<{
  account: string | null
  realName: string | null
  avatar: string | null
  address: string | null
  signature: string | null
  orgId: number | null
  orgName: string | null
  posName: string | null
  buttons: readonly string[] | null
  userInfo: Readonly<Record<string, unknown>> | null
}>

export type LowcodeLoginCredentials = Readonly<{
  enterpriseName: string
  account: string
  password: string
}>

export type LowcodeVerificationChannel = 'EMAIL' | 'MOBILE'
export type LowcodeVerificationScene = 'REGISTER' | 'REGISTER_ENT'

export type LowcodeVerificationRequest = Readonly<{
  enterpriseName: string
  channel: LowcodeVerificationChannel
  account: string
  scene: LowcodeVerificationScene
}>

export type LowcodeUserRegistration = Readonly<{
  enterpriseName: string
  account: string
  displayName: string
  password: string
  sex: 'F' | 'M'
  channel: LowcodeVerificationChannel
  phone: string
  email: string
  verificationCode: string
  userType?: string
  departmentId?: string
  jobId?: string
}>

export type LowcodeEnterpriseRegistration = Readonly<{
  englishName: string
  chineseName: string
  domainKey: string
  chineseShortName: string
  administratorAccount: string
  administratorPassword: string
  channel: LowcodeVerificationChannel
  verificationAccount: string
  verificationCode: string
  phone: string
  email: string
}>

export type LowcodeRegistrationResult = Readonly<{
  id: string | null
  raw: unknown
}>

export type LowcodeIdentity = Readonly<{
  userId: string
  account: string
  displayName: string
  enterpriseId: string | null
  enterpriseShortName: string
  role: string | null
  raw: Readonly<Record<string, unknown>>
}>

export type LowcodeEnterprise = Readonly<{
  id: string | null
  name: string | null
  code: string | null
  shortName: string
  shortCode: string | null
  raw: Readonly<Record<string, unknown>>
}>

export type LowcodeCacheStats = Readonly<{
  dataSetModelCount: number
  developmentFileCount: number
}>

export type LowcodeSession = Readonly<{
  accessToken: string
  refreshToken: string
  accessExpiresAt: number
  refreshExpiresAt: number
  identity: LowcodeIdentity
  enterprise: LowcodeEnterprise
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readNullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value
  throw new LowcodeApiError(0, `当前用户字段 ${key} 不是字符串`)
}

function readNullableNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  if (value === undefined || value === null) return null
  if (typeof value === 'number') return value
  throw new LowcodeApiError(0, `当前用户字段 ${key} 不是数字`)
}

function readNullableStrings(record: Record<string, unknown>, key: string): readonly string[] | null {
  const value = record[key]
  if (value === undefined || value === null) return null
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value
  throw new LowcodeApiError(0, `当前用户字段 ${key} 不是字符串数组`)
}

function readNullableRecord(
  record: Record<string, unknown>,
  key: string,
): Readonly<Record<string, unknown>> | null {
  const value = record[key]
  if (value === undefined || value === null) return null
  if (isRecord(value)) return value
  throw new LowcodeApiError(0, `当前用户字段 ${key} 不是对象`)
}

function readRequiredString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key]
  if (typeof value === 'string' && value.trim() !== '') return value
  throw new LowcodeApiError(0, `${context}.${key} 缺少有效字符串`)
}

function readRequiredNumber(record: Record<string, unknown>, key: string, context: string): number {
  const value = record[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  throw new LowcodeApiError(0, `${context}.${key} 缺少有效数字`)
}

function readRequiredRecord(
  record: Record<string, unknown>,
  key: string,
  context: string,
): Record<string, unknown> {
  const value = record[key]
  if (isRecord(value)) return value
  throw new LowcodeApiError(0, `${context}.${key} 缺少有效对象`)
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return null
}

function registrationResult(value: unknown): LowcodeRegistrationResult {
  const id = isRecord(value) ? firstString(value, ['rowid', 'ROWID', 'userId', 'id']) : null
  return { id, raw: value }
}

function cacheCount(value: unknown, cacheType: string): number {
  if (!isRecord(value)) throw new LowcodeApiError(0, `${cacheType} 缓存 Result 不是对象`)
  const count = value['Count']
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
    throw new LowcodeApiError(0, `${cacheType} 缓存 Count 不是非负整数`)
  }
  return count
}

function requiredInput(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) throw new LowcodeApiError(0, `${name} 不能为空`)
  return normalized
}

function stripBearer(token: string): string {
  return token.replace(/^Bearer\s+/i, '')
}

function bearer(token: string): string {
  return `Bearer ${stripBearer(token)}`
}

function parseIdentity(
  userInfo: Record<string, unknown>,
  credentials: LowcodeLoginCredentials,
): LowcodeIdentity {
  const userId = firstString(userInfo, ['ROWID', 'ID'])
  if (userId === null) throw new LowcodeApiError(0, '登录响应 userinfo 缺少 ROWID/ID')
  return {
    userId,
    account: firstString(userInfo, ['LoginName']) ?? credentials.account,
    displayName: firstString(userInfo, ['UserName', 'RealName', 'LoginName']) ?? credentials.account,
    enterpriseId: firstString(userInfo, ['EntId']),
    enterpriseShortName: firstString(userInfo, ['EntShortName']) ?? credentials.enterpriseName,
    role: firstString(userInfo, ['role']),
    raw: userInfo,
  }
}

function parseEnterprise(
  enterpriseInfo: Record<string, unknown>,
  credentials: LowcodeLoginCredentials,
): LowcodeEnterprise {
  return {
    id: firstString(enterpriseInfo, ['rowid']),
    name: firstString(enterpriseInfo, ['Name']),
    code: firstString(enterpriseInfo, ['CName']),
    shortName: firstString(enterpriseInfo, ['ShortName']) ?? credentials.enterpriseName,
    shortCode: firstString(enterpriseInfo, ['ShortCName']),
    raw: enterpriseInfo,
  }
}

export class LowcodePlatformApi {
  private readonly client: LowcodeClient
  private refreshPromise: Promise<LowcodeSession> | null = null

  public constructor(
    http: HttpClientBase,
    public readonly session: LowcodeSessionStore,
    public readonly application: LowcodeApplicationStore,
  ) {
    this.client = new LowcodeClient(http)
  }

  public async login(credentials: LowcodeLoginCredentials): Promise<LowcodeSession> {
    const result = await this.client.requestResult({
      path: '/api/LoginAuthority/UserLoginByEnt',
      method: 'POST',
      data: {
        strUser: credentials.account,
        strPwd: credentials.password,
        entName: credentials.enterpriseName,
      },
      authenticated: false,
    })
    if (!isRecord(result)) throw new LowcodeApiError(0, '登录 Result 不是对象')

    const userInfo = readRequiredRecord(result, 'userinfo', '登录响应')
    const enterpriseInfo = readRequiredRecord(result, 'entinfo', '登录响应')
    const session: LowcodeSession = {
      accessToken: stripBearer(readRequiredString(result, 'token', '登录响应')),
      refreshToken: stripBearer(readRequiredString(result, 'refreshToken', '登录响应')),
      accessExpiresAt: readRequiredNumber(result, 'expire', '登录响应'),
      refreshExpiresAt: readRequiredNumber(result, 'refreshExpire', '登录响应'),
      identity: parseIdentity(userInfo, credentials),
      enterprise: parseEnterprise(enterpriseInfo, credentials),
    }
    this.application.clear()
    this.session.save(session)
    return session
  }

  public async listEnterprises(): Promise<readonly LowcodeEnterpriseCatalogItem[]> {
    const result = await this.client.requestResult({
      path: '/api/DataOperation/GetBaseData',
      method: 'POST',
      data: enterpriseCatalogQuery(),
      authenticated: false,
    })
    return normalizeEnterpriseCatalog(result)
  }

  public getEnterpriseInfo(): Promise<LowcodeEnterpriseInfo> {
    const session = this.session.get()
    if (session === null) throw new LowcodeApiError(401, '没有可读取的 lowcode 企业会话')
    return Promise.resolve(normalizeEnterpriseInfo(session.enterprise.raw))
  }

  public async getCacheStats(): Promise<LowcodeCacheStats> {
    const readCount = async (prefix: 'DATA_SET_MODEL' | 'DEV_FILE_UPDATE_TIME'): Promise<number> => {
      const result = await this.client.requestResult({
        path: '/api/sysCache/findByPatternPageWithTotal',
        method: 'POST',
        data: { prefix, page: 1, size: 1 },
      })
      return cacheCount(result, prefix)
    }
    const [dataSetModelCount, developmentFileCount] = await Promise.all([
      readCount('DATA_SET_MODEL'),
      readCount('DEV_FILE_UPDATE_TIME'),
    ])
    return { dataSetModelCount, developmentFileCount }
  }

  public async sendVerificationCode(request: LowcodeVerificationRequest): Promise<void> {
    await this.client.requestResult({
      path: '/api/message/code/send/public',
      method: 'POST',
      data: {
        ent: request.enterpriseName.trim(),
        type: request.channel,
        account: requiredInput(request.account, '验证码账号'),
        scene: request.scene,
      },
      authenticated: false,
    })
  }

  public async registerUser(input: LowcodeUserRegistration): Promise<LowcodeRegistrationResult> {
    const result = await this.client.requestResult({
      path: '/api/LoginAuthority/register',
      method: 'POST',
      data: {
        ent: requiredInput(input.enterpriseName, '企业名称'),
        loginName: requiredInput(input.account, '登录账号'),
        username: requiredInput(input.displayName, '用户名称'),
        password: requiredInput(input.password, '密码'),
        sex: input.sex,
        phone: input.phone.trim(),
        email: input.email.trim(),
        code: requiredInput(input.verificationCode, '验证码'),
        user_types: input.userType?.trim() ?? '',
        depId: input.departmentId?.trim() ?? '',
        jobId: input.jobId?.trim() ?? '',
        type: input.channel,
      },
      authenticated: false,
    })
    return registrationResult(result)
  }

  public async registerEnterprise(input: LowcodeEnterpriseRegistration): Promise<LowcodeRegistrationResult> {
    const result = await this.client.requestResult({
      path: '/api/Ent/AddEnterprise',
      method: 'POST',
      data: {
        ent: {
          Name: requiredInput(input.englishName, '企业英文名称'),
          CName: requiredInput(input.chineseName, '企业中文名称'),
          ShortName: requiredInput(input.domainKey, '四级域名标识'),
          ShortCName: requiredInput(input.chineseShortName, '企业中文简称'),
          entadminAccount: requiredInput(input.administratorAccount, '管理员账号'),
          entadminPassword: requiredInput(input.administratorPassword, '管理员密码'),
          entInfoUserPhone: input.phone.trim(),
          entMailbox: input.email.trim(),
          storage_mode: 0,
        },
        account: requiredInput(input.verificationAccount, '验证账号'),
        type: input.channel,
        code: requiredInput(input.verificationCode, '验证码'),
      },
      authenticated: false,
    })
    return registrationResult(result)
  }

  public refreshSession(): Promise<LowcodeSession> {
    this.refreshPromise ??= this.performRefresh().finally(() => {
      this.refreshPromise = null
    })
    return this.refreshPromise
  }

  private async performRefresh(): Promise<LowcodeSession> {
    const session = this.session.get()
    if (session === null) throw new LowcodeApiError(401, '没有可刷新的 lowcode 会话')
    const result = await this.client.requestResult({
      path: '/api/LoginAuthority/refresh',
      method: 'POST',
      data: null,
      headers: {
        Authorization: bearer(session.accessToken),
        'X-Authorization': bearer(session.refreshToken),
      },
    })
    if (!isRecord(result)) throw new LowcodeApiError(0, '刷新 Result 不是对象')

    const refreshed: LowcodeSession = {
      ...session,
      accessToken: stripBearer(readRequiredString(result, 'token', '刷新响应')),
      refreshToken: stripBearer(readRequiredString(result, 'refreshToken', '刷新响应')),
      accessExpiresAt: readRequiredNumber(result, 'expire', '刷新响应'),
      refreshExpiresAt: readRequiredNumber(result, 'refreshExpire', '刷新响应'),
    }
    this.session.save(refreshed)
    return refreshed
  }

  public async logout(): Promise<void> {
    const session = this.session.get()
    try {
      if (session !== null) {
        await this.client.requestResult({
          path: '/api/LoginAuthority/UserLogoutByEnt',
          method: 'GET',
          headers: { Authorization: bearer(session.accessToken) },
        })
      }
    } finally {
      this.application.clear()
      this.session.clear()
    }
  }

  public async getCurrentUser(): Promise<LowcodeCurrentUser> {
    const session = this.session.get()
    const result = await this.client.requestResult({
      path: '/api/LoginAuthority/GetUserInfo',
      method: 'GET',
      ...(session === null ? {} : { headers: { Authorization: bearer(session.accessToken) } }),
    })
    if (!isRecord(result)) {
      throw new LowcodeApiError(0, '当前用户 Result 不是对象')
    }

    return {
      account: readNullableString(result, 'account'),
      realName: readNullableString(result, 'realName'),
      avatar: readNullableString(result, 'avatar'),
      address: readNullableString(result, 'address'),
      signature: readNullableString(result, 'signature'),
      orgId: readNullableNumber(result, 'orgId'),
      orgName: readNullableString(result, 'orgName'),
      posName: readNullableString(result, 'posName'),
      buttons: readNullableStrings(result, 'buttons'),
      userInfo: readNullableRecord(result, 'userInfo'),
    }
  }

  public async listApplications(): Promise<readonly LowcodeApplication[]> {
    const result = await this.client.requestResult({
      path: '/api/DataOperation/GetData',
      method: 'POST',
      data: applicationCatalogQuery(),
      headers: { 'x-FormKey': LOWCODE_APPLICATION_CATALOG_FORM_KEY },
    })
    return normalizeApplications(result)
  }

  public async resolveNavigationRootId(systemId: string): Promise<string> {
    const normalizedSystemId = systemId.trim()
    if (!normalizedSystemId) throw new LowcodeApiError(0, 'systemId 不能为空')
    const result = await this.client.requestResult({
      path: '/api/DataOperation/GetData',
      method: 'POST',
      data: navigationRootQuery(normalizedSystemId),
      headers: { 'x-FormKey': LOWCODE_APPLICATION_CATALOG_FORM_KEY },
    })
    return normalizeNavigationRootId(result)
  }

  public async selectApplication(application: LowcodeApplication): Promise<string> {
    const navigationRootId = await this.resolveNavigationRootId(application.id)
    this.application.save({ application, navigationRootId })
    return navigationRootId
  }
}
