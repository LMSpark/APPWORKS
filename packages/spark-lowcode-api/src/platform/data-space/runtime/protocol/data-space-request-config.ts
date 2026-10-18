/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/protocol/data-space-request-config
 * 职责：捕获表级查询与提交端点及运行策略。
 * 边界：配置解析复用 FormalTableRequestConfig；平台默认端点、批次与 scope 仍归本 owner。
 * AI用途：确认正式查询保存使用相同配置，且配置不能替代身份和数据权限。
 */
import {FormalTableRequestConfig} from '@spark-appworks/spark-data'
import type {DataTable, HttpEndpoint, TableMetadata} from '@spark-appworks/spark-data'

type DataSpaceRequestConfigChanges = Readonly<{added?: readonly unknown[]; changed?: readonly unknown[]; deleted?: readonly unknown[]}>
type DataSpaceRequestTableConfig = Pick<TableMetadata, 'api' | 'crudConfig'>
type DataSpaceRequestConfigInput = Readonly<{tableConfig?: DataSpaceRequestTableConfig; changes: DataSpaceRequestConfigChanges}>

const DEFAULT_ENDPOINT: HttpEndpoint = {url: '/api/DataOperation/BatchTableOperateRequestByCRUD', method: 'POST'}

/** 表级端点与策略的捕获值；查询、保存继续使用正式 owner 的协议、身份及权限。 */
export class DataSpaceRequestConfig {
  private constructor(readonly endpoint: HttpEndpoint, readonly timeout?: number) {}

  public static validate(table: DataTable): void { FormalTableRequestConfig.parse(table) }

  public static resolveQuery(table?: DataSpaceRequestTableConfig): DataSpaceRequestConfig {
    const config = FormalTableRequestConfig.parse(table)
    return new DataSpaceRequestConfig(config.endpoints.list ?? {url: '/api/DataOperation/GetData', method: 'POST'}, config.timeout)
  }

  public static resolveSave(inputs: readonly DataSpaceRequestConfigInput[]): DataSpaceRequestConfig {
    let selected: DataSpaceRequestConfig | undefined
    let key: string | undefined
    for (const input of inputs) {
      const config = FormalTableRequestConfig.parse(input.tableConfig)
      for (const operation of ['create', 'update', 'delete'] as const) {
        const rows = operation === 'create' ? input.changes.added : operation === 'update' ? input.changes.changed : input.changes.deleted
        if (!rows?.length) continue
        const candidate = new DataSpaceRequestConfig(config.endpoints[operation] ?? {...DEFAULT_ENDPOINT}, config.timeout)
        const candidateKey = JSON.stringify([candidate.endpoint, candidate.timeout])
        if (key !== undefined && key !== candidateKey) {
          throw new Error('SPARK_SAVE_CONFIG_CONFLICT: 同次保存的活动操作端点或超时不同，尚不支持跨端点部分提交')
        }
        selected = candidate
        key = candidateKey
      }
    }
    return selected ?? new DataSpaceRequestConfig({...DEFAULT_ENDPOINT})
  }

  public mergeHeaders(scope: Record<string, string>): Record<string, string> {
    const keys = new Set(Object.keys(scope).map(key => key.toLowerCase()))
    for (const key of Object.keys(this.endpoint.headers ?? {})) {
      if (keys.has(key.toLowerCase())) throw new Error('SPARK_SAVE_CONFIG_HEADERS: 表配置不能覆盖运行请求头')
    }
    return {...this.endpoint.headers, ...scope}
  }
}
