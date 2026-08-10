/**
 * lowcode 客户端根门面：组装各子域 API，并在 HTTP 拦截器层统一注入会话 Bearer。
 * 构造时会注册 request 拦截器；access 过期且 refresh 仍有效时会自动刷新，失败则按原 session 继续（不静默伪造凭证）。
 */
import type { HttpClientBase } from '@spark-appworks/spark-utils'

import { LowcodeCatalogApi } from './catalog/lowcode-catalog-api.js'
import { LowcodeDesignApi } from './design/lowcode-design-api.js'
import { LowcodeApplicationStore } from './platform/lowcode-application-store.js'
import { DataSpaceApi } from './platform/data-space/data-space-api.js'
import { ProjectBlueprintApi } from './platform/project-blueprint/project-blueprint-api.js'
import { PermissionApi } from './platform/permission/permission-api.js'
import { LowcodeRealtimeApi, type LowcodeFetch } from './realtime/lowcode-realtime-api.js'
import { LowcodePlatformApi } from './platform/lowcode-platform-api.js'
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
  fetch?: LowcodeFetch
}>

/** lowcode 平台统一入口，按子域划分只读/读写能力，共享同一 `HttpClientBase` 与 `LowcodeSessionStore`。 */
export class LowcodeApi {
  public readonly blueprint: ProjectBlueprintApi
  public readonly catalog: LowcodeCatalogApi
  public readonly dataSpace: DataSpaceApi
  public readonly design: LowcodeDesignApi
  public readonly application: LowcodeApplicationStore
  public readonly realtime: LowcodeRealtimeApi
  public readonly platform: LowcodePlatformApi
  public readonly permission: PermissionApi
  public readonly session: LowcodeSessionStore

  public constructor(options: LowcodeApiOptions) {
    this.blueprint = new ProjectBlueprintApi(options.http)
    this.session = new LowcodeSessionStore({
      ...(options.sessionStorage === undefined ? {} : { storage: options.sessionStorage }),
      ...(options.sessionKey === undefined ? {} : { sessionKey: options.sessionKey }),
    })
    this.application = new LowcodeApplicationStore({
      ...(options.sessionStorage === undefined ? {} : { storage: options.sessionStorage }),
      ...(options.applicationKey === undefined ? {} : { applicationKey: options.applicationKey }),
    })
    this.catalog = new LowcodeCatalogApi(options.http)
    this.dataSpace = new DataSpaceApi(options.http)
    this.design = new LowcodeDesignApi(options.http)
    const browserFetch = typeof fetch === 'undefined' ? undefined : fetch.bind(globalThis)
    this.realtime = new LowcodeRealtimeApi(options.http, this.session, options.fetch ?? browserFetch)
    this.platform = new LowcodePlatformApi(options.http, this.session, this.application)
    this.permission = new PermissionApi(options.http)
    options.http.interceptors.request.use({
      onRequest: async (config) => {
        const headers = config.headers ?? {}
        if (
          config.meta?.['lowcodeSkipAuth'] === true
          || (
            headers['Authorization'] !== undefined
            && headers['X-Authorization'] !== undefined
          )
        ) {
          return config
        }
        let session = this.session.get()
        if (session === null) return config
        if (session.accessExpiresAt <= Date.now() && session.refreshExpiresAt > Date.now()) {
          session = await this.platform.refreshSession()
        }
        return {
          ...config,
          headers: {
            ...headers,
            Authorization: `Bearer ${session.accessToken}`,
          },
        }
      },
    })
  }
}
