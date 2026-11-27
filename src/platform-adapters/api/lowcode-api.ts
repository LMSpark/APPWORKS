/**
 * lowcode 客户端根门面：组装各子域 API，并在 HTTP 拦截器层统一注入会话 Bearer。
 * 构造时注册 request 拦截器。access 过期且 refresh 仍有效时，等待当前会话刷新成功后再发送原请求。
 */
import type { HttpClientBase, RequestConfig } from '@spark-appworks/spark-utils'

import { LowcodeCatalogApi } from './catalog/lowcode-catalog-api.js'
import { LowcodeApiError } from './core/lowcode-api-error.js'
import { LowcodeDesignApi } from './design/lowcode-design-api.js'
import { LowcodeApplicationStore } from './platform/lowcode-application-store.js'
import { DataSpaceApi } from './platform/data-space/data-space-api.js'
import type { DataSpaceRequestScope } from '@spark-appworks/spark-data'
import { PermissionApi } from './platform/permission/permission-api.js'
import { LowcodePlatformApi } from './platform/lowcode-platform-api.js'
import type { LowcodePlatformApiOptions } from './platform/lowcode-platform-api.js'
import {
  LowcodeSessionStore,
  type LowcodeSessionStorage,
} from './platform/lowcode-session-store.js'

/** 根门面构造选项；`http` 为唯一必填项，会话与应用存储键可覆盖默认值以支持多租户隔离。 */
export type LowcodeApiOptions = Readonly<{
  http: HttpClientBase
  sessionStorage?: LowcodeSessionStorage
  sessionKey?: string
  applicationKey?: string
  /**
   * Host-owned formal DataView directory reader used by activateApplication. It receives the active selection-fence
   * assertion and must call it before/after asynchronous metadata and query work. Missing configuration fails closed;
   * activation does not fall back to the legacy list API.
   */
  readApplicationById?: LowcodePlatformApiOptions['readApplicationById']
  /** Host-owned formal Base_NavigationInfo DataView reader; application selection never falls back to HTTP. */
  readNavigationRootId?: LowcodePlatformApiOptions['readNavigationRootId']
}>

/** 派发守卫与清理会话的归属来自同次请求。显式续期只需要认证仍当前才可派发。 */
type LowcodeRequestOwnership = Readonly<{
  canDispatch(): boolean
  canExpireSession(): boolean
}>

/** lowcode 平台统一入口，按子域划分只读/读写能力，共享同一 `HttpClientBase` 与 `LowcodeSessionStore`。 */
export class LowcodeApi {
  public readonly catalog: LowcodeCatalogApi
  public readonly dataSpace: DataSpaceApi
  public readonly design: LowcodeDesignApi
  public readonly application: LowcodeApplicationStore
  public readonly platform: LowcodePlatformApi
  public readonly permission: PermissionApi
  public readonly session: LowcodeSessionStore
  private readonly requestOwners = new WeakMap<RequestConfig, LowcodeRequestOwnership>()

  public constructor(options: LowcodeApiOptions) {
    this.session = new LowcodeSessionStore({
      onScopeChange: () => this.dataSpace.runtime.invalidateQueryCache(),
      ...(options.sessionStorage === undefined ? {} : { storage: options.sessionStorage }),
      ...(options.sessionKey === undefined ? {} : { sessionKey: options.sessionKey }),
    })
    this.application = new LowcodeApplicationStore({
      onScopeChange: () => this.dataSpace.runtime.invalidateQueryCache(),
      ...(options.sessionStorage === undefined ? {} : { storage: options.sessionStorage }),
      ...(options.applicationKey === undefined ? {} : { applicationKey: options.applicationKey }),
    })
    this.catalog = new LowcodeCatalogApi(options.http)
    this.dataSpace = new DataSpaceApi({ http: options.http, readScope: () => this.readRequestScope() })
    this.design = new LowcodeDesignApi({ http: options.http, readScope: () => this.readRequestScope() })
    this.platform = new LowcodePlatformApi({
      http: options.http,
      session: this.session,
      application: this.application,
      ...(options.readApplicationById === undefined ? {} : {readApplicationById: options.readApplicationById}),
      ...(options.readNavigationRootId === undefined ? {} : {readNavigationRootId: options.readNavigationRootId}),
    })
    this.permission = new PermissionApi(options.http)
    options.http.interceptors.request.use({
      onRequest: async (config) => {
        if (config.meta?.['lowcodeSkipAuth'] === true) return config

        const headers = config.headers ?? {}
        let session = this.session.get()
        if (session === null) return config
        const authenticationIsCurrent = this.platform.captureAuthenticationScope()
        const applicationRevision = this.application.revision
        const ownsAuthentication = () => authenticationIsCurrent() && this.session.get() === session
        const ownsApplicationRequest = () => ownsAuthentication() && this.application.revision === applicationRevision

        const authorization = headers['Authorization']
        const refreshAuthorization = headers['X-Authorization']
        if (authorization !== undefined && refreshAuthorization !== undefined) {
          if (authorization === `Bearer ${session.accessToken}`
            && refreshAuthorization === `Bearer ${session.refreshToken}`) {
            this.requestOwners.set(config, { canDispatch: ownsAuthentication, canExpireSession: ownsApplicationRequest })
          }
          return config
        }
        if (session.accessExpiresAt <= Date.now() && session.refreshExpiresAt > Date.now()) {
          session = await this.platform.refreshSession()
          if (!ownsApplicationRequest()) {
            throw new LowcodeApiError(409, '刷新期间认证会话或应用已切换，原请求已失效')
          }
        }
        const authenticated = {
          ...config,
          headers: {
            ...headers,
            Authorization: `Bearer ${session.accessToken}`,
          },
        }
        this.requestOwners.set(authenticated, { canDispatch: ownsApplicationRequest, canExpireSession: ownsApplicationRequest })
        return authenticated
      },
      beforeDispatch: (config) => {
        if (this.requestOwners.get(config)?.canDispatch() === false) {
          throw new LowcodeApiError(409, '认证会话或应用已切换，原请求已失效')
        }
      },
    })
  }

  /** 仅当返回 401 的派发请求仍归当前认证和应用时，使该会话失效。 */
  public expireUnauthorizedRequest(dispatchedConfig?: RequestConfig): boolean {
    if (dispatchedConfig === undefined || this.requestOwners.get(dispatchedConfig)?.canExpireSession() !== true) return false
    this.application.clear()
    this.session.clear()
    return true
  }

  /** 已认证登录身份的请求范围；Bearer 由共享 HTTP 拦截器注入，不包含应用头或凭据。 */
  public readAuthenticatedRequestScope(): DataSpaceRequestScope {
    const session = this.authenticatedSession()
    return {
      token: JSON.stringify([session.identity.userId, session.identity.enterpriseId, session.enterprise.id, this.session.revision]),
      headers: {},
    }
  }

  /** 请求层统一提供选中应用 appId、租户头与身份代次；不写入数据实体或场景 JSON。 */
  public readRequestScope(): DataSpaceRequestScope {
    const session = this.authenticatedSession()
    const context = this.application.get()
    if (context === null) throw new Error('SPARK_EXECUTION_SCOPE_REQUIRED: 数据空间请求需要明确选中应用')
    const tenant = session.enterprise.shortName.trim()
    if (!tenant) throw new Error('SPARK_EXECUTION_SCOPE_REQUIRED: 数据空间请求缺少租户身份')
    return {
      token: JSON.stringify([tenant, session.enterprise.id, session.identity.userId,
        session.identity.enterpriseId, context.application.id, context.application.enterpriseId,
        context.application.enterpriseShortName, this.session.revision, this.application.revision]),
      headers: { 'tenant-id': tenant, 'visit-tenant-id': tenant, 'x-FirstFolder': tenant,
        'X-AppId': context.application.id },
    }
  }

  private authenticatedSession() {
    const session = this.session.get()
    if (session === null || session.refreshExpiresAt <= Date.now()) {
      throw new Error('SPARK_EXECUTION_SCOPE_REQUIRED: 数据空间请求需要有效登录身份')
    }
    return session
  }
}
