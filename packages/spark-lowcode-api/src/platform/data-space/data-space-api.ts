/**
 * 数据空间根门面：按 design / runtime 分离入口，禁止跨态混用。
 * design 读设计态元数据并 prepare 设计变更命令；runtime 读业务数据并 prepare 运行变更命令。
 */
import type { HttpClientBase } from '@spark-appworks/spark-utils'

import { DataSpaceDesignApi } from './design/data-space-design-api.js'
import { DataSpaceRuntimeApi } from './runtime/data-space-runtime-api.js'

/** 数据空间 API 聚合根；{@link design} 与 {@link runtime} 各自持有独立 HTTP 客户端实例。 */
export class DataSpaceApi {
  public readonly design: DataSpaceDesignApi
  public readonly runtime: DataSpaceRuntimeApi

  public constructor(http: HttpClientBase) {
    this.design = new DataSpaceDesignApi(http)
    this.runtime = new DataSpaceRuntimeApi(http)
  }
}
