/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/protocol/data-space-request-config
 * 职责：捕获表级查询与提交端点及运行策略。
 * 边界：保留正式SPARK协议，配置不能替代运行身份和数据权限。
 * AI用途：让分页查询与保存复用同一配置校验合同。
 */
import type {DataTable, HttpEndpoint, TableMetadata} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'

type DataSpaceRequestConfigChanges = Readonly<{added?: readonly unknown[]; changed?: readonly unknown[]; deleted?: readonly unknown[]}>
type DataSpaceRequestTableConfig = Pick<TableMetadata, 'api' | 'crudConfig'>
type DataSpaceRequestConfigInput = Readonly<{tableConfig?: DataSpaceRequestTableConfig; changes: DataSpaceRequestConfigChanges}>
type DataSpaceRequestConfigEndpoints = Partial<Record<'list' | 'create' | 'update' | 'delete', HttpEndpoint>>
type DataSpaceRequestConfigTable = Readonly<{endpoints: DataSpaceRequestConfigEndpoints; timeout?: number}>

const DEFAULT_ENDPOINT: HttpEndpoint = {url: '/api/DataOperation/BatchTableOperateRequestByCRUD', method: 'POST'}

/** 表级端点与策略的捕获值；查询、保存继续使用正式 owner 的协议、身份及权限。 */
export class DataSpaceRequestConfig {
  private constructor(readonly endpoint: HttpEndpoint, readonly timeout?: number) {}

  public static validate(table: DataTable): void { this.readTable(table) }

  public static resolveQuery(table?: DataSpaceRequestTableConfig): DataSpaceRequestConfig {
    const config = this.readTable(table)
    return new DataSpaceRequestConfig(config.endpoints.list ?? {url: '/api/DataOperation/GetData', method: 'POST'}, config.timeout)
  }

  public static resolveSave(inputs: readonly DataSpaceRequestConfigInput[]): DataSpaceRequestConfig {
    let selected: DataSpaceRequestConfig | undefined
    let key: string | undefined
    for (const input of inputs) {
      const config = this.readTable(input.tableConfig)
      for (const operation of ['create', 'update', 'delete'] as const) {
        const rows = operation === 'create' ? input.changes.added : operation === 'update' ? input.changes.changed : input.changes.deleted
        if (!rows?.length) continue
        const candidate = new DataSpaceRequestConfig(config.endpoints[operation] ?? {...DEFAULT_ENDPOINT}, config.timeout)
        const candidateKey = JSON.stringify([this.copyJson(candidate.endpoint), candidate.timeout])
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

  private static readTable(table?: DataSpaceRequestTableConfig): DataSpaceRequestConfigTable {
    const endpoints: DataSpaceRequestConfigEndpoints = {}
    if (table?.api !== undefined) {
      const api = this.object(table.api, ['list', 'create', 'update', 'delete'], 'api')
      for (const operation of ['list', 'create', 'update', 'delete'] as const) {
        if (Object.hasOwn(api, operation)) endpoints[operation] = this.readEndpoint(api[operation])
      }
    }
    let timeout: number | undefined
    if (table?.crudConfig !== undefined) {
      const policy = this.object(table.crudConfig, ['timeout', 'retryCount', 'validateData'], 'crudConfig')
      if ('timeout' in policy) {
        if (typeof policy['timeout'] !== 'number' || !Number.isSafeInteger(policy['timeout']) || policy['timeout'] <= 0) {
          throw new Error('SPARK_SAVE_CONFIG: timeout 必须是正安全整数')
        }
        timeout = policy['timeout']
      }
      if ('retryCount' in policy && policy['retryCount'] !== 0) throw new Error('SPARK_SAVE_CONFIG: 正式保存不支持自动重试')
      if ('validateData' in policy && policy['validateData'] !== true) throw new Error('SPARK_SAVE_CONFIG: 正式保存不能关闭校验')
    }
    return {endpoints, ...(timeout === undefined ? {} : {timeout})}
  }

  private static readEndpoint(input: unknown): HttpEndpoint {
    const endpoint = this.object(input, ['url', 'method', 'headers', 'params'], 'endpoint')
    const url = endpoint['url']
    if (typeof url !== 'string' || url !== url.trim() || !/^\/(?!\/)[^\\#{}\s]*$/.test(url)) {
      throw new Error('SPARK_SAVE_CONFIG: 请求端点必须是无模板的站内绝对路径')
    }
    if ('method' in endpoint && endpoint['method'] !== 'POST') throw new Error('SPARK_SAVE_CONFIG: SPARK 请求端点必须使用 POST')
    const headers: Record<string, string> = {}
    if ('headers' in endpoint) {
      if (!isRecord(endpoint['headers'])) throw new Error('SPARK_SAVE_CONFIG: headers 必须是对象')
      for (const [name, value] of Object.entries(endpoint['headers']).sort(([a], [b]) => a.localeCompare(b))) {
        const key = name.toLowerCase()
        if (!name.trim() || typeof value !== 'string' || Object.hasOwn(headers, key)
          || /authorization|cookie|token|^x-(formkey|appid|tenant|enterprise|user)/i.test(key)) {
          throw new Error('SPARK_SAVE_CONFIG_HEADERS: 端点头无效或包含运行身份/凭据')
        }
        Object.defineProperty(headers, key, {value, enumerable: true, writable: true, configurable: true})
      }
    }
    const params = 'params' in endpoint ? this.copyJson(endpoint['params']) : undefined
    if (params !== undefined && !isRecord(params)) throw new Error('SPARK_SAVE_CONFIG: params 必须是对象')
    return {url, method: 'POST', ...(Object.keys(headers).length ? {headers} : {}),
      ...(isRecord(params) && Object.keys(params).length ? {params} : {})}
  }

  private static object(input: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
    if (!isRecord(input) || Object.keys(input).some(key => !allowed.includes(key))) {
      throw new Error(`SPARK_SAVE_CONFIG: ${path} 含未支持的配置`)
    }
    return input
  }

  private static copyJson(value: unknown, ancestors = new Set<object>()): unknown {
    if (value === null || typeof value === 'string' || typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value))) return value
    if (typeof value === 'object' && !ancestors.has(value)) {
      ancestors.add(value)
      try {
        if (Array.isArray(value)) return value.map(item => this.copyJson(item, ancestors))
        const prototype: unknown = Object.getPrototypeOf(value)
        if (isRecord(value) && (prototype === Object.prototype || prototype === null)) {
          return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, this.copyJson(item, ancestors)]))
        }
      } finally {ancestors.delete(value)}
    }
    throw new Error('SPARK_SAVE_CONFIG: 端点参数必须是 JSON 数据')
  }
}
