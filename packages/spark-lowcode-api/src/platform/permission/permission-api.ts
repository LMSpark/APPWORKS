/**
 * 权限根门面：按 design / runtime 分离入口，禁止跨态混用。
 * design 读功能标签/数据对象策略/对象授权并 prepare 设计变更命令；runtime 读当前用户功能权限。
 */
import type { HttpClientBase } from '@spark-appworks/spark-utils'

import { PermissionDesignApi } from './design/permission-design-api.js'
import { PermissionRuntimeApi } from './runtime/permission-runtime-api.js'

/** 权限 API 聚合根；{@link design} 与 {@link runtime} 各自持有独立 HTTP 客户端实例。 */
export class PermissionApi {
  public readonly design: PermissionDesignApi
  public readonly runtime: PermissionRuntimeApi

  public constructor(http: HttpClientBase) {
    this.design = new PermissionDesignApi(http)
    this.runtime = new PermissionRuntimeApi(http)
  }
}
