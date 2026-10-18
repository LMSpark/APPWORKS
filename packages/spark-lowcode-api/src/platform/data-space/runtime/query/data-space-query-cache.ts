/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/query/data-space-query-cache
 * 职责：复用当前请求域的执行器及在途查询，按DataView显式配置消费spark-data结果缓存。
 * 边界：默认不缓存完成结果；身份变化销毁旧资源，缓存不落Web Storage。
 * AI用途：页面和浏览器会话复用同一正式查询上下文，保存和刷新清除缓存。
 */
import type { DataSpaceQueryIdentity, DataSpaceQueryOptions } from '../data-space-runtime-contract'
import type { DataSpaceQueryContext } from './data-space-query-context'
import { DataSpaceQueryResource } from './data-space-query-resource'
import { DataSpaceQueryTable } from '../protocol/data-space-query-table'
import { DataSpaceRequestConfig } from '../protocol/data-space-request-config'
import {DataViewQueryCache} from '@spark-appworks/spark-data'

/** 已核定的结果缓存请求，独立于后端GetData线协议。 */
type ResultCacheRequest = Readonly<{
  /** 页面DataSet身份；省略表示当前owner的浏览器会话范围。 */
  page?: object
  /** 正式模型定义和视图身份，作为查询键的一部分。 */
  definition: unknown
  /** 请求完成时核对页面实例仍可使用，失效后不回填。 */
  isCurrent(): boolean
  /** 缓存前完成正式输出绑定与必要字段检查，失败不缓存。 */
  accept?(context: DataSpaceQueryContext): void
}>

/** 查询资源的 HTTP 与 scope 配置，所有资源共享同一请求身份读取器。 */
type DataSpaceQueryCacheOptions = ConstructorParameters<typeof DataSpaceQueryResource>[0]

/** 请求owner内的执行器、在途请求及显式配置的结果复用；保留原权限上下文。 */
export class DataSpaceQueryCache {
  readonly #options: DataSpaceQueryCacheOptions
  readonly #resources = new Map<string, DataSpaceQueryResource>()
  readonly #flights = new Map<string, Promise<DataSpaceQueryContext>>()
  readonly #results = new DataViewQueryCache<DataSpaceQueryContext>()
  readonly #objectIds = new WeakMap<object, number>()
  readonly #symbolIds = new Map<symbol, number>()
  #valueId = 0
  #scope: string | undefined
  #disposed = false

  /** 保存资源配置，后续按场景建立执行器并检查当前 scope。 */
  public constructor(options: DataSpaceQueryCacheOptions) { this.#options = options }

  public invalidate(): void {
    this.invalidateResults()
    this.#resources.forEach(resource => resource.dispose())
    this.#resources.clear()
    this.#flights.clear()
  }

  /** 保留已接纳上下文的有效性，只清除可复用结果及旧在途复用入口。 */
  public invalidateResults(): void {this.#results.clear(); this.#flights.clear()}
  /** 页面释放时删除对应DataSet的缓存引用。 */
  public releaseResults(page: object): void {this.#results.release(page)}

  public dispose(): void {
    this.#disposed = true
    this.invalidate()
  }

  public async query(identity: DataSpaceQueryIdentity, options: DataSpaceQueryOptions = {},
    config: DataSpaceRequestConfig = DataSpaceRequestConfig.resolveQuery(), cache?: ResultCacheRequest): Promise<DataSpaceQueryContext> {
    const scope = this.currentScope()
    const normalized = new DataSpaceQueryTable(identity).identity
    const { singleFlight: _singleFlight, ...executionOptions } = options
    const key = this.cacheKey([scope, normalized, config.endpoint, config.timeout, cache?.definition, { ...executionOptions,
      ...(executionOptions.filter === undefined ? {} : { filter: executionOptions.filter?.toJSON() ?? null }) }])
    const load = () => this.load(key, normalized, executionOptions, config, cache?.accept)
    const context = cache === undefined ? await load() : await this.#results.query(key, cache.page, load,
      () => this.currentScope() === scope && cache.isCurrent())
    context.assertIdentity(normalized)
    return context
  }

  private async load(key: string, normalized: DataSpaceQueryIdentity, executionOptions: DataSpaceQueryOptions,
    config: DataSpaceRequestConfig, accept?: ResultCacheRequest['accept']): Promise<DataSpaceQueryContext> {
    const existing = this.#flights.get(key)
    if (existing) return existing
    let resource = this.#resources.get(normalized.scenarioId)
    if (resource === undefined) {
      resource = new DataSpaceQueryResource(this.#options)
      this.#resources.set(normalized.scenarioId, resource)
    }
    const flight = resource.query(normalized, executionOptions, config).then(context => {
      accept?.(context)
      return context
    }).finally(() => {
      if (this.#flights.get(key) === flight) this.#flights.delete(key)
    })
    this.#flights.set(key, flight)
    return flight
  }

  private currentScope(): string {
    if (this.#disposed) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 查询缓存已销毁')
    const token = this.#options.readScope().token
    if (!token.trim()) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 请求层未提供有效 scope token')
    if (this.#scope !== undefined && this.#scope !== token) this.invalidate()
    this.#scope = token
    return token
  }

  private cacheKey(value: unknown): string {
    const ancestors = new Set<object>()
    const objectIdentity = (input: object) => {
      let id = this.#objectIds.get(input)
      if (id === undefined) { id = ++this.#valueId; this.#objectIds.set(input, id) }
      return `opaque:${id}`
    }
    const encode = (input: unknown): string => {
      if (input === null) return 'null'
      if (input === undefined) return 'undefined'
      if (typeof input === 'string') return JSON.stringify(input)
      if (typeof input === 'number') return Number.isNaN(input) ? 'number:NaN' : `number:${input}`
      if (typeof input === 'boolean') return input ? 'boolean:true' : 'boolean:false'
      if (typeof input === 'bigint') return `bigint:${input}`
      if (typeof input === 'symbol') {
        let id = this.#symbolIds.get(input)
        if (id === undefined) { id = ++this.#valueId; this.#symbolIds.set(input, id) }
        return `symbol:${id}`
      }
      if (typeof input === 'function') return objectIdentity(input)
      if (input instanceof Date) return `date:${input.toISOString()}`
      if (typeof input !== 'object') return `${typeof input}:${String(input)}`
      const prototype: unknown = Object.getPrototypeOf(input)
      if (!Array.isArray(input) && prototype !== Object.prototype && prototype !== null) return objectIdentity(input)
      if (ancestors.has(input)) throw new TypeError('SPARK cache key cannot contain circular values')
      ancestors.add(input)
      try {
        if (Array.isArray(input)) return `[${input.map(encode).join(',')}]`
        return `{${Object.entries(input).sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => `${JSON.stringify(key)}:${encode(entry)}`).join(',')}}`
      } finally { ancestors.delete(input) }
    }
    return encode(value)
  }
}
