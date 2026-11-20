/**
 * @module @spark-appworks/spark-data:core/formal-table-request-config
 * 职责：正式模型表请求配置的唯一解析与快照合同，供文件校验和运行请求共同使用。
 * 边界：纯数据校验，不持 HTTP、平台默认端点、作用域或权限；不限制通用 CRUD 配置。
 * AI用途：确认正式 api/crudConfig 的允许项及凭据覆盖限制。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import type {HttpEndpoint} from '../types'

type FormalTableRequestInput = Readonly<{api?: unknown; crudConfig?: unknown}>
type FormalTableRequestEndpoints = Partial<Record<'list' | 'create' | 'update' | 'delete', HttpEndpoint>>

/** 捕获并规范化正式表的端点与策略；不修改调用者的配置。 */
export class FormalTableRequestConfig {
  private constructor(readonly endpoints: Readonly<FormalTableRequestEndpoints>, readonly timeout?: number) {}

  /** 文件和运行边界共用校验；path 仅补充诊断，不改变允许的配置。 */
  public static parse(table?: FormalTableRequestInput, path = 'table'): FormalTableRequestConfig {
    const endpoints: FormalTableRequestEndpoints = {}
    if (table?.api !== undefined) {
      const api = this.object(table.api, ['list', 'create', 'update', 'delete'], `${path}.api`)
      for (const operation of ['list', 'create', 'update', 'delete'] as const) {
        if (Object.hasOwn(api, operation)) endpoints[operation] = this.endpoint(api[operation], `${path}.api.${operation}`)
      }
    }
    let timeout: number | undefined
    if (table?.crudConfig !== undefined) {
      const policy = this.object(table.crudConfig, ['timeout', 'retryCount', 'validateData'], `${path}.crudConfig`)
      if ('timeout' in policy) {
        if (typeof policy['timeout'] !== 'number' || !Number.isSafeInteger(policy['timeout']) || policy['timeout'] <= 0) {
          throw new Error(`SPARK_SAVE_CONFIG: ${path}.crudConfig.timeout 必须是正安全整数`)
        }
        timeout = policy['timeout']
      }
      if ('retryCount' in policy && policy['retryCount'] !== 0) throw new Error(`SPARK_SAVE_CONFIG: ${path}.crudConfig 正式保存不支持自动重试`)
      if ('validateData' in policy && policy['validateData'] !== true) throw new Error(`SPARK_SAVE_CONFIG: ${path}.crudConfig 正式保存不能关闭校验`)
    }
    return new FormalTableRequestConfig(endpoints, timeout)
  }

  private static endpoint(input: unknown, path: string): HttpEndpoint {
    const endpoint = this.object(input, ['url', 'method', 'headers', 'params'], path)
    const url = endpoint['url']
    if (typeof url !== 'string' || url !== url.trim() || !/^\/(?!\/)[^\\#{}\s]*$/.test(url)) {
      throw new Error(`SPARK_SAVE_CONFIG: ${path} 请求端点必须是无模板的站内绝对路径`)
    }
    if ('method' in endpoint && endpoint['method'] !== 'POST') throw new Error(`SPARK_SAVE_CONFIG: ${path} SPARK 请求端点必须使用 POST`)
    const headers: Record<string, string> = {}
    if ('headers' in endpoint) {
      if (!isRecord(endpoint['headers'])) throw new Error(`SPARK_SAVE_CONFIG: ${path}.headers 必须是对象`)
      for (const [name, value] of Object.entries(endpoint['headers']).sort(([a], [b]) => a.localeCompare(b))) {
        const key = name.toLowerCase()
        if (!name.trim() || typeof value !== 'string' || Object.hasOwn(headers, key)
          || /authorization|cookie|token|^x-(formkey|appid|tenant|enterprise|user)/i.test(key)) {
          throw new Error(`SPARK_SAVE_CONFIG_HEADERS: ${path} 端点头无效或包含运行身份/凭据`)
        }
        Object.defineProperty(headers, key, {value, enumerable: true, writable: true, configurable: true})
      }
    }
    const params = 'params' in endpoint ? this.copyJson(endpoint['params'], path) : undefined
    if (params !== undefined && !isRecord(params)) throw new Error(`SPARK_SAVE_CONFIG: ${path}.params 必须是对象`)
    return {url, method: 'POST', ...(Object.keys(headers).length ? {headers} : {}),
      ...(isRecord(params) && Object.keys(params).length ? {params} : {})}
  }

  private static object(input: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
    if (!isRecord(input) || Object.keys(input).some(key => !allowed.includes(key))) {
      throw new Error(`SPARK_SAVE_CONFIG: ${path} 含未支持的配置`)
    }
    return input
  }

  private static copyJson(value: unknown, path: string, ancestors = new Set<object>()): unknown {
    if (value === null || typeof value === 'string' || typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value))) return value
    if (typeof value === 'object' && !ancestors.has(value)) {
      ancestors.add(value)
      try {
        if (Array.isArray(value)) return value.map(item => this.copyJson(item, path, ancestors))
        const prototype: unknown = Object.getPrototypeOf(value)
        if (isRecord(value) && (prototype === Object.prototype || prototype === null)) {
          return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, this.copyJson(item, path, ancestors)]))
        }
      } finally {ancestors.delete(value)}
    }
    throw new Error(`SPARK_SAVE_CONFIG: ${path}.params 端点参数必须是 JSON 数据`)
  }
}
