/**
 * 低代码平台门面 API：登录/刷新/登出、企业目录与注册、应用选择与导航根解析。
 * 会话与应用上下文分别委托 {@link LowcodeSessionStore}、{@link LowcodeApplicationStore} 持久化；
 * 登录成功会清空应用上下文，避免跨企业/跨应用残留导航身份。
 */
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

/** 当前用户资料；wire 响应字段为 camelCase（如 account、realName、userInfo）。 */
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

/** 企业域登录凭据；请求体映射为 strUser、strPwd、entName（大小写固定）。 */
export type LowcodeLoginCredentials = Readonly<{
  enterpriseName: string
  account: string
  password: string
}>

/** 验证码投递渠道；wire 值必须为 EMAIL 或 MOBILE。 */
export type LowcodeVerificationChannel = 'EMAIL' | 'MOBILE'
/** 验证码业务场景；wire 值必须为 REGISTER 或 REGISTER_ENT。 */
export type LowcodeVerificationScene = 'REGISTER' | 'REGISTER_ENT'

/** 发送验证码请求；wire 字段 ent、type、account、scene。 */
export type LowcodeVerificationRequest = Readonly<{
  enterpriseName: string
  channel: LowcodeVerificationChannel
  account: string
  scene: LowcodeVerificationScene
}>

/** 用户注册输入；wire 含 loginName、username、user_types、depId、jobId 等固定键名。 */
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

/** 企业注册输入；ent 子对象 wire 键为 PascalCase（Name、CName、ShortName、ShortCName 等）。 */
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

/** 注册操作结果；id 从 rowid/ROWID/userId 等 wire 别名中择优提取。 */
export type LowcodeRegistrationResult = Readonly<{
  id: string | null
  raw: unknown
}>

/** 登录后会话身份；由 userinfo 的 ROWID/ID、LoginName、EntId 等 wire 字段归一化。 */
export type LowcodeIdentity = Readonly<{
  userId: string
  account: string
  displayName: string
  enterpriseId: string | null
  enterpriseShortName: string
  role: string | null
  raw: Readonly<Record<string, unknown>>
}>

/** 登录后会话企业快照；由 entinfo 的 rowid、Name、CName、ShortName 等 wire 字段归一化。 */
export type LowcodeEnterprise = Readonly<{
  id: string | null
  name: string | null
  code: string | null
  shortName: string
  shortCode: string | null
  raw: Readonly<Record<string, unknown>>
}>

/** 平台缓存统计；wire Result.Count 须为非负整数。 */
export type LowcodeCacheStats = Readonly<{
  dataSetModelCount: number
  developmentFileCount: number
}>

/**
 * 完整低代码会话：双 token、过期时间与身份/企业快照。
 * accessToken/refreshToken 已剥离 Bearer 前缀；刷新时 Authorization 与 X-Authorization 分别携带二者。
 */
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

/**
 * 低代码平台 HTTP 门面；并发 refreshSession 共享同一 in-flight Promise，避免重复刷新。
 */
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

  /** 企业域登录；响应须含 userinfo、entinfo、token、refreshToken、expire、refreshExpire，成功后清空应用上下文。 */
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

  /** 拉取公开企业目录；无需已登录会话。 */
  public async listEnterprises(): Promise<readonly LowcodeEnterpriseCatalogItem[]> {
    const result = await this.client.requestResult({
      path: '/api/DataOperation/GetBaseData',
      method: 'POST',
      data: enterpriseCatalogQuery(),
      authenticated: false,
    })
    return normalizeEnterpriseCatalog(result)
  }

  /** 从当前会话 entinfo.raw 归一化企业详情；无会话时 401。 */
  public getEnterpriseInfo(): Promise<LowcodeEnterpriseInfo> {
    const session = this.session.get()
    if (session === null) throw new LowcodeApiError(401, '没有可读取的 lowcode 企业会话')
    return Promise.resolve(normalizeEnterpriseInfo(session.enterprise.raw))
  }

  /** 查询 DATA_SET_MODEL 与 DEV_FILE_UPDATE_TIME 两类缓存条目数；需已认证。 */
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

  /** 发送注册/企业注册验证码；公开接口，账号与企业名会先 trim。 */
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

  /** 注册用户；必填字段缺失时本地 fail-fast，不发起无效请求。 */
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

  /** 注册企业；ent 子对象 wire 键大小写必须与平台约定一致。 */
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

  /** 刷新 token 对；并发调用合并为单次请求，无会话时 401。 */
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

  /** 登出；远端失败仍本地清空会话与应用上下文，避免残留凭据。 */
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

  /** 拉取当前用户；有会话时附带 Authorization Bearer accessToken。 */
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

  /** 列出当前企业可访问应用；请求头 x-FormKey 固定为应用目录表单键。 */
  public async listApplications(): Promise<readonly LowcodeApplication[]> {
    const result = await this.client.requestResult({
      path: '/api/DataOperation/GetData',
      method: 'POST',
      data: applicationCatalogQuery(),
      headers: { 'x-FormKey': LOWCODE_APPLICATION_CATALOG_FORM_KEY },
    })
    return normalizeApplications(result)
  }

  /** 按应用 systemId 解析唯一导航根 rowid；0 或 多个根节点时抛错。 */
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

  /** 选中应用并持久化应用上下文（含 navigationRootId）；返回解析到的导航根 id。 */
  public async selectApplication(application: LowcodeApplication): Promise<string> {
    const navigationRootId = await this.resolveNavigationRootId(application.id)
    this.application.save({ application, navigationRootId })
    return navigationRootId
  }
}
