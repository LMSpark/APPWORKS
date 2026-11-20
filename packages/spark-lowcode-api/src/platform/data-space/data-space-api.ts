/**
 * 数据空间根门面：按 design / runtime 分离入口，禁止跨态混用。
 * design 读设计态元数据并 prepare 设计变更命令；runtime 读业务数据并 prepare 运行变更命令。
 */
import { DataSpaceDesignApi } from './design/data-space-design-api.js'
import { DataSpaceRuntimeApi } from './runtime/data-space-runtime-api.js'

/** 数据空间根门面共享的运行 owner 配置；design 复用其中的请求 scope 与查询保存能力。 */
type DataSpaceApiOptions = ConstructorParameters<typeof DataSpaceRuntimeApi>[0]

/** 数据空间 API 聚合根；设计合同读取与业务查询共享 HTTP、请求范围和实际查询 owner。 */
export class DataSpaceApi {
  public readonly design: DataSpaceDesignApi
  public readonly runtime: DataSpaceRuntimeApi

  public constructor(options: DataSpaceApiOptions) {
    this.runtime = new DataSpaceRuntimeApi(options)
    this.design = new DataSpaceDesignApi({ ...options, runtime: this.runtime })
  }
}
