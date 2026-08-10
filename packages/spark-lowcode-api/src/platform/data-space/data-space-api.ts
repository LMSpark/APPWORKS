import type { HttpClientBase } from '@spark-appworks/spark-utils'

import { DataSpaceDesignApi } from './design/data-space-design-api.js'
import { DataSpaceRuntimeApi } from './runtime/data-space-runtime-api.js'

export class DataSpaceApi {
  public readonly design: DataSpaceDesignApi
  public readonly runtime: DataSpaceRuntimeApi

  public constructor(http: HttpClientBase) {
    this.design = new DataSpaceDesignApi(http)
    this.runtime = new DataSpaceRuntimeApi(http)
  }
}
