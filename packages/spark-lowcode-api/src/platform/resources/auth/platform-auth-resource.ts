/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/auth/platform-auth-resource
 * 职责：登录前的企业目录只读投影，以及登录、注册账号、注册租户、发送验证码四个服务命令；供公开场景同一DataSet的命令视图提交。
 * 边界：会话仍由平台门面保存；回执不含密码与令牌；注册结果未知时只经同账号登录核验，不重发注册，也不提供放弃重提。
 */
import type {BindCommandSubmitOptions, BindReadonlyCommandQueryOptions, DataRow, DataView} from '@spark-appworks/spark-data'
import {LowcodeApiError} from '../../../core/lowcode-api-error'
import type {LowcodeEnterpriseCatalogItem} from '../../lowcode-enterprise'
import type {LowcodeEnterpriseRegistration, LowcodeLoginCredentials, LowcodeUserRegistration, LowcodeVerificationRequest} from '../../lowcode-platform-api'

/** 公开平台门面中本资源使用的方法；返回值除企业目录外不进入回执。 */
type PlatformAuthApi = Readonly<{
  login: (credentials: LowcodeLoginCredentials) => Promise<unknown>
  listEnterprises: () => Promise<readonly LowcodeEnterpriseCatalogItem[]>
  registerUser: (input: LowcodeUserRegistration) => Promise<unknown>
  registerEnterprise: (input: LowcodeEnterpriseRegistration) => Promise<unknown>
  sendVerificationCode: (request: LowcodeVerificationRequest) => Promise<void>
}>

/** platform为公开平台门面；assertCurrent在页面实例释放后抛错，阻止迟到命令写回。 */
type PlatformAuthResourceInput = Readonly<{platform: PlatformAuthApi; assertCurrent: () => void}>

/** 一个命令视图的资源身份、可录入字段与提交/核验适配。 */
type PlatformAuthCommand = Readonly<{
  resourceId: string
  inputFields: readonly string[]
  submit: (row: DataRow) => Promise<DataRow>
  verify?: (row: DataRow) => Promise<DataRow>
}>

/** 注册请求已发出但结果无法判定；保留原捕获，下一次保存只做登录核验。 */
class PlatformAuthUnknown extends Error {}

const channels = ['EMAIL', 'MOBILE'] as const
const sexes = ['F', 'M'] as const
const scenes = ['REGISTER', 'REGISTER_ENT'] as const

function text(row: DataRow, field: string): string {
  const value = row[field]
  return typeof value === 'string' ? value : ''
}

function required(row: DataRow, field: string, label: string): string {
  const value = text(row, field).trim()
  if (!value) throw new Error(`${label}不能为空`)
  return value
}

function oneOf<T extends string>(row: DataRow, field: string, allowed: readonly T[]): T {
  const value = text(row, field)
  const matched = allowed.find(candidate => candidate === value)
  if (matched === undefined) throw new Error(`${field} 取值无效`)
  return matched
}

function password(row: DataRow, field: string): string {
  const value = text(row, field)
  if (!value) throw new Error('密码不能为空')
  if (value.length < 6) throw new Error('密码至少 6 位')
  return value
}

/** 服务端已应答的业务拒绝是明确失败；无应答、超时或应答不可解析时结果未知。 */
function classifyRegistration(error: unknown, label: string): Error {
  if (error instanceof LowcodeApiError && error.code !== 0) return error
  const reason = error instanceof Error ? error.message : String(error)
  return new PlatformAuthUnknown(`${label}结果未知（${reason}）；不会重复提交，可核验结果`)
}

export class PlatformAuthResource {
  static readonly resources = Object.freeze({
    enterpriseCatalog: 'platform:enterprise-catalog',
    login: 'platform:login',
    userRegistration: 'platform:user-registration',
    enterpriseRegistration: 'platform:enterprise-registration',
    verificationCode: 'platform:verification-code',
  } as const)

  constructor(private readonly input: PlatformAuthResourceInput) {}

  /** 公开企业目录；行只含身份、名称与英文简称。 */
  enterpriseCatalog(view: DataView): BindReadonlyCommandQueryOptions {
    const resource = {resourceType: 'logical-view', resourceId: PlatformAuthResource.resources.enterpriseCatalog}
    const guard = () => this.#guard(view, resource)
    return {resource, guard, loadRows: async () => {
      const items = await this.input.platform.listEnterprises()
      guard()
      return items.map(item => ({id: item.id, name: item.name, shortName: item.shortName}))
    }}
  }

  /** 登录命令：会话由平台门面保存，回执只含命令键、企业与账号。 */
  login(view: DataView): BindCommandSubmitOptions {
    return this.#command(view, {resourceId: PlatformAuthResource.resources.login, inputFields: ['enterpriseName', 'account', 'password'],
      submit: async row => {
        const credentials = {enterpriseName: required(row, 'enterpriseName', '企业'), account: required(row, 'account', '登录账号'), password: text(row, 'password')}
        if (!credentials.password) throw new Error('密码不能为空')
        await this.input.platform.login(credentials)
        return {commandId: row['commandId'], enterpriseName: credentials.enterpriseName, account: credentials.account, outcome: 'signed-in'}
      }})
  }

  /** 注册账号后以同账号登录；登录失败时回执为已注册并说明原因。 */
  userRegistration(view: DataView): BindCommandSubmitOptions {
    const credentials = (row: DataRow): LowcodeLoginCredentials => ({enterpriseName: required(row, 'enterpriseName', '企业英文简称'),
      account: required(row, 'account', '登录账号'), password: password(row, 'password')})
    const identity = (login: LowcodeLoginCredentials): DataRow => ({enterpriseName: login.enterpriseName, account: login.account})
    return this.#command(view, {resourceId: PlatformAuthResource.resources.userRegistration,
      inputFields: ['enterpriseName', 'account', 'displayName', 'sex', 'channel', 'contact', 'verificationCode', 'password', 'confirmPassword'],
      submit: async row => {
        const login = credentials(row), channel = oneOf(row, 'channel', channels), contact = required(row, 'contact', '验证账号')
        if (text(row, 'confirmPassword') !== login.password) throw new Error('两次密码不一致')
        const registration = {enterpriseName: login.enterpriseName, account: login.account, password: login.password,
          displayName: required(row, 'displayName', '显示名称'), sex: oneOf(row, 'sex', sexes), channel,
          phone: channel === 'MOBILE' ? contact : '', email: channel === 'EMAIL' ? contact : '',
          verificationCode: required(row, 'verificationCode', '验证码')}
        try {await this.input.platform.registerUser(registration)} catch (error) {throw classifyRegistration(error, '注册')}
        return this.#signInAfterRegistration(row, login, identity(login))
      },
      verify: row => {const login = credentials(row); return this.#verifyRegistration(row, login, identity(login))}})
  }

  /** 注册租户后以管理员登录；新企业待审核时登录失败，回执为已注册并说明原因。 */
  enterpriseRegistration(view: DataView): BindCommandSubmitOptions {
    const credentials = (row: DataRow): LowcodeLoginCredentials => ({enterpriseName: required(row, 'domainKey', '四级域名标识'),
      account: required(row, 'administratorAccount', '管理员账号'), password: password(row, 'administratorPassword')})
    const identity = (login: LowcodeLoginCredentials): DataRow => ({domainKey: login.enterpriseName, administratorAccount: login.account})
    return this.#command(view, {resourceId: PlatformAuthResource.resources.enterpriseRegistration,
      inputFields: ['domainKey', 'englishName', 'chineseName', 'chineseShortName', 'administratorAccount', 'administratorPassword', 'channel', 'verificationAccount', 'verificationCode'],
      submit: async row => {
        const login = credentials(row), channel = oneOf(row, 'channel', channels), account = required(row, 'verificationAccount', '验证账号')
        const registration = {domainKey: login.enterpriseName, administratorAccount: login.account, administratorPassword: login.password,
          englishName: required(row, 'englishName', '企业英文名称'), chineseName: required(row, 'chineseName', '企业中文名称'),
          chineseShortName: required(row, 'chineseShortName', '企业中文简称'), channel, verificationAccount: account,
          verificationCode: required(row, 'verificationCode', '验证码'),
          phone: channel === 'MOBILE' ? account : '', email: channel === 'EMAIL' ? account : ''}
        try {await this.input.platform.registerEnterprise(registration)} catch (error) {throw classifyRegistration(error, '注册租户')}
        return this.#signInAfterRegistration(row, login, identity(login))
      },
      verify: row => {const login = credentials(row); return this.#verifyRegistration(row, login, identity(login))}})
  }

  /** 发送验证码；可重复发送，失败一律视为明确失败。 */
  verificationCode(view: DataView): BindCommandSubmitOptions {
    return this.#command(view, {resourceId: PlatformAuthResource.resources.verificationCode, inputFields: ['enterpriseName', 'channel', 'account', 'scene'],
      submit: async row => {
        await this.input.platform.sendVerificationCode({enterpriseName: text(row, 'enterpriseName'), channel: oneOf(row, 'channel', channels),
          account: required(row, 'account', '验证账号'), scene: oneOf(row, 'scene', scenes)})
        return {commandId: row['commandId'], outcome: 'sent'}
      }})
  }

  #guard(view: DataView, resource: Readonly<{resourceType: string; resourceId: string}>): void {
    this.input.assertCurrent()
    const table = view.dataTable
    if (view.destroyed || table?.resourceType !== resource.resourceType || table.resourceId !== resource.resourceId || table.modelBinding) {
      throw new Error(`PLATFORM_AUTH_SCOPE: ${resource.resourceId} 资源视图已失效`)
    }
  }

  #command(view: DataView, command: PlatformAuthCommand): BindCommandSubmitOptions {
    const resource = {resourceType: 'command', resourceId: command.resourceId} as const
    const guard = () => {
      this.#guard(view, resource)
      if (view.primaryKey !== 'commandId') throw new Error(`PLATFORM_AUTH_SCOPE: ${command.resourceId} 命令键须为 commandId`)
    }
    const verify = command.verify
    guard()
    return {resource, guard, inputFields: command.inputFields, createKey: () => crypto.randomUUID(), submit: command.submit,
      ...(verify === undefined
        ? {verify: () => Promise.resolve(undefined)}
        : {verify, isUnconfirmed: (error: unknown) => error instanceof PlatformAuthUnknown, allowAbandonUnconfirmed: false})}
  }

  /** identity 为本命令表自己的企业与账号列；回执只回这些列与结果，不含密码。 */
  async #signInAfterRegistration(row: DataRow, credentials: LowcodeLoginCredentials, identity: DataRow): Promise<DataRow> {
    const receipt = {commandId: row['commandId'], ...identity}
    try {
      await this.input.platform.login(credentials)
      return {...receipt, outcome: 'signed-in', message: ''}
    } catch (error) {
      return {...receipt, outcome: 'registered', message: error instanceof Error ? error.message : String(error)}
    }
  }

  async #verifyRegistration(row: DataRow, credentials: LowcodeLoginCredentials, identity: DataRow): Promise<DataRow> {
    try {
      await this.input.platform.login(credentials)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new PlatformAuthUnknown(`注册结果仍未确认：同账号登录未成功（${reason}）；不会重复提交，可稍后直接登录`)
    }
    return {commandId: row['commandId'], ...identity, outcome: 'signed-in', message: ''}
  }
}
