/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/query/data-space-query-cache
 * 职责：复用当前请求域内的场景执行器与在途查询。
 * 边界：完成结果不缓存；身份变化销毁旧资源并阻止旧上下文使用。
 * AI用途：避免相同执行输入重复在途请求而不复用过期结果。
 */
import type { DataSpaceQueryIdentity, DataSpaceQueryOptions } from '../data-space-runtime-contract'
import type { DataSpaceQueryContext } from './data-space-query-context'
import { DataSpaceQueryResource } from './data-space-query-resource'
import { DataSpaceQueryTable } from '../protocol/data-space-query-table'

/** 查询资源的 HTTP 与 scope 配置，所有资源共享同一请求身份读取器。 */
type DataSpaceQueryCacheOptions = ConstructorParameters<typeof DataSpaceQueryResource>[0]

/** 请求 owner 内的场景执行器和模型在途查询缓存；不以完成结果替代新查询。 */
export class DataSpaceQueryCache {
  readonly #options: DataSpaceQueryCacheOptions
  readonly #resources = new Map<string, DataSpaceQueryResource>()
  readonly #flights = new Map<string, Promise<DataSpaceQueryContext>>()
  readonly #objectIds = new WeakMap<object, number>()
  readonly #symbolIds = new Map<symbol, number>()
  #valueId = 0
  #scope: string | undefined
  #disposed = false

  /** 保存资源配置，后续按场景建立执行器并检查当前 scope。 */
  public constructor(options: DataSpaceQueryCacheOptions) { this.#options = options }

  public invalidate(): void {
    this.#resources.forEach(resource => resource.dispose())
    this.#resources.clear()
    this.#flights.clear()
  }

  public dispose(): void {
    this.#disposed = true
    this.invalidate()
  }

  public async query(identity: DataSpaceQueryIdentity, options: DataSpaceQueryOptions = {}): Promise<DataSpaceQueryContext> {
    const scope = this.currentScope()
    const normalized = new DataSpaceQueryTable(identity).identity
    const { singleFlight: _singleFlight, ...executionOptions } = options
    const key = this.cacheKey([scope, normalized, { ...executionOptions,
      ...(executionOptions.filter === undefined ? {} : { filter: executionOptions.filter?.toJSON() ?? null }) }])
    const existing = this.#flights.get(key)
    if (existing) return existing
    let resource = this.#resources.get(normalized.scenarioId)
    if (resource === undefined) {
      resource = new DataSpaceQueryResource(this.#options)
      this.#resources.set(normalized.scenarioId, resource)
    }
    const flight = resource.query(normalized, executionOptions).finally(() => {
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
