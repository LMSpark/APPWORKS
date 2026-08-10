import type { HttpClientBase } from '@spark-appworks/spark-utils'

import { PermissionDesignApi } from './design/permission-design-api.js'
import { PermissionRuntimeApi } from './runtime/permission-runtime-api.js'

export class PermissionApi {
  public readonly design: PermissionDesignApi
  public readonly runtime: PermissionRuntimeApi

  public constructor(http: HttpClientBase) {
    this.design = new PermissionDesignApi(http)
    this.runtime = new PermissionRuntimeApi(http)
  }
}
