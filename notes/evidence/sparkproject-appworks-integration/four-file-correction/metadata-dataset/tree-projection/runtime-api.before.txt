/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/data-space-runtime-api
 * 职责：拥有模型查询与统一保存的运行入口。
 * 边界：只接受当前 scope 中本 owner 登记的原查询基线。
 * AI用途：把 DataView 查询与同场景模型保存接入实际运行 owner。
 */
/** 数据空间运行态 API；按场景与模型 Name 拥有原查询、权限基线和统一保存。 */
import { DataViewFilter, type DataViewFilterTree, type DataView, type TableMetadata, type QueryParams } from '@spark-appworks/spark-data'
import type { HttpClientBase } from '@spark-appworks/spark-utils'
import type { DataSpaceQueryIdentity, DataSpaceQueryOptions, DataSpaceRequestScope } from './data-space-runtime-contract.js'
import { DataSpaceQueryCache } from './query/data-space-query-cache.js'
import { DataSpaceRequest } from './protocol/data-space-request.js'
import { DataSpaceQueryTable } from './protocol/data-space-query-table.js'
import { captureDataSpaceViewQuery } from './query/data-space-query-options.js'
import { DataSpaceDesignApi } from '../design/data-space-design-api.js'
import type { DataSpaceQueryContext } from './query/data-space-query-context.js'
import { DataSpaceSaveConfig } from './save/data-space-save-config.js'

/** 运行 owner 的 HTTP 通道和请求身份读取器；scope 变更使旧基线失效。 */
type DataSpaceRuntimeApiOptions = Readonly<{
  http: HttpClientBase
  readScope: () => DataSpaceRequestScope
}>
/** 统一保存命令；每个目标携带本 owner 的原查询上下文与候选变更。 */
type DataSpaceRuntimeSaveChange = Parameters<DataSpaceRequest['save']>[0]['changes'][number]
  & Readonly<{tableConfig?: Pick<TableMetadata, 'api' | 'crudConfig'>}>
type DataSpaceRuntimeSaveCommand = Readonly<{
  changes: readonly DataSpaceRuntimeSaveChange[]
  signal?: AbortSignal
}>
/** 实际保存回执和推进后的独立上下文；失败不产生确认结果。 */
type DataSpaceRuntimeSaveResult = Awaited<ReturnType<DataSpaceRequest['save']>>
type DataSpaceRuntimeQueryFlight = Promise<DataSpaceQueryContext>
type DataSpaceRuntimeQueryFlights = Set<DataSpaceRuntimeQueryFlight>

/** 拥有原查询缓存、保存基线归属和同模型读写串行化；DataView 与 DataSet 消费同一实际保存 owner。 */
export class DataSpaceRuntimeApi {
  private readonly queryCache: DataSpaceQueryCache
  readonly #saveRequest: DataSpaceRequest
  readonly #readScope: DataSpaceRuntimeApiOptions['readScope']
  readonly #contexts = new WeakMap<DataSpaceQueryContext, string>()
  readonly #mutationFlights = new Map<string, Promise<void>>()
  readonly #modelViews = new WeakMap<DataView, Awaited<ReturnType<DataSpaceDesignApi['readModel']>>>()
  readonly #queryFlights = new Map<string, DataSpaceRuntimeQueryFlights>()

  /** 建立共享查询缓存与保存请求 owner，使用同一个请求 scope 读取器。 */
  public constructor(options: DataSpaceRuntimeApiOptions) {
    this.queryCache = new DataSpaceQueryCache(options)
    this.#saveRequest = new DataSpaceRequest(options)
    this.#readScope = options.readScope
  }

  /** 查询后端注册模型；原结果上下文只供 DataView 的执行边界持有。 */
  public async query(identity: DataSpaceQueryIdentity, options: DataSpaceQueryOptions = {}): Promise<DataSpaceQueryContext> {
    const scope = this.currentScope()
    const normalized = new DataSpaceQueryTable(identity).identity
    const key = this.resourceKey(scope, normalized)
    const mutation = this.#mutationFlights.get(key)
    if (mutation !== undefined) await mutation
    this.assertScope(scope)
    const flight = this.queryCache.query(normalized, options)
    let flights = this.#queryFlights.get(key)
    if (flights === undefined) {
      flights = new Set()
      this.#queryFlights.set(key, flights)
    }
    flights.add(flight)
    try {
      const context = await flight
      this.assertScope(scope)
      this.#contexts.set(context, key)
      return context
    } finally {
      flights.delete(flight)
      if (flights.size === 0 && this.#queryFlights.get(key) === flights) this.#queryFlights.delete(key)
      this.assertScope(scope)
    }
  }

  public bindModelView(view: DataView, model: Awaited<ReturnType<DataSpaceDesignApi['readModel']>>): void {
    const table = view.dataTable
    if (table?.modelBinding?.modelId !== model.id || table.modelBinding.modelName !== model.metaName) {
      throw new Error('SPARK_VIEW_MODEL_IDENTITY: 视图与正式模型身份不一致')
    }
    const formal = new Set(DataSpaceDesignApi.resolveOutputFields(model).map(field => field.canonicalName))
    DataSpaceSaveConfig.validate(table)
    for (const column of table.columns) {
      if (column.computeExpression && formal.has(column.name)) {
        throw new Error(`SPARK_MODEL_COMPUTED_COLLISION: 本地计算列与正式输出字段重名: ${column.name}`)
      }
    }
    this.#modelViews.set(view, model)
    view.bindQueryExecutor(this)
  }

  public async executeQuery(view: DataView, params: QueryParams): Promise<DataSpaceQueryContext> {
    const command = captureDataSpaceViewQuery(view, params)
    const model = this.#modelViews.get(view)
    if (model === undefined) return this.query(command.identity, command.options)
    const outputFields = DataSpaceDesignApi.resolveOutputFields(model)
    const requestField = (output: string): string => {
      const field = outputFields.find(candidate => candidate.canonicalName === output)
      if (!field) throw new Error(`SPARK_MODEL_FIELD_UNRESOLVED: ${output}`)
      return field.name
    }
    const filterTree = (tree: DataViewFilterTree): DataViewFilterTree => 'logic' in tree
      ? {...tree, filters: tree.filters.map(filterTree)} : {...tree, field: requestField(tree.field)}
    const toFilter = (tree: DataViewFilterTree): DataViewFilter => 'logic' in tree ? DataViewFilter.group(tree) : DataViewFilter.condition(tree)
    const options = command.options
    for (const field of options.fields ?? []) {
      if (typeof field !== 'string' && (field.expression || field.valueFun || (field.group ?? 0) !== 0
        || (field.alias !== undefined && field.alias !== field.name))) {
        throw new Error('SPARK_MODEL_PROJECTION: 查询视图不能重定义正式模型输出')
      }
    }
    const fields = options.fields?.map(field => {
      if (typeof field === 'string') return {name: requestField(field)}
      const {alias, ...projection} = field
      return {...projection, name: requestField(alias ?? field.name)}
    })
    if (fields && model.primaryKey) {
      const primaryKey = requestField(model.primaryKey)
      if (!fields.some(field => field.name === primaryKey)) fields.push({name: primaryKey})
    }
    const context = await this.query(command.identity, {...options, outputFieldMode: 'REQUEST',
      ...(fields === undefined ? {} : {fields}),
      ...(options.sort === undefined ? {} : {sort: options.sort.map(sort => ({...sort, field: requestField(sort.field)}))}),
      ...(options.filter ? {filter: toFilter(filterTree(options.filter.toJSON()))} : {}),
      ...(options.tree === undefined ? {} : {tree: {...options.tree, keyField: requestField(options.tree.keyField),
        parentField: requestField(options.tree.parentField),
        ...(options.tree.hasChildrenField === undefined ? {} : {hasChildrenField: requestField(options.tree.hasChildrenField)})}}),
    })
    context.bindFormalModel(model)
    return context
  }

  public async save(command: DataSpaceRuntimeSaveCommand): Promise<DataSpaceRuntimeSaveResult> {
    const scope = this.currentScope()
    const signal = command.signal
    signal?.throwIfAborted()
    const changes = command.changes.map(change => ({ ...change,
      identity: new DataSpaceQueryTable(change.identity).identity, changes: structuredClone(change.changes) }))
    const keys = [...new Set(changes.map(change => this.resourceKey(scope, change.identity)))].sort()
    changes.forEach(change => this.assertContextOwner(scope, change))
    const config = DataSpaceSaveConfig.resolve(changes)
    const previous = keys.map(key => this.#mutationFlights.get(key) ?? Promise.resolve())
    const run = Promise.all(previous.map(flight => flight.catch(() => undefined))).then(async () => {
      this.assertScope(scope)
      signal?.throwIfAborted()
      await Promise.all(keys.map(async key => {
        const flights = this.#queryFlights.get(key)
        if (flights !== undefined) await Promise.allSettled([...flights])
      }))
      this.assertScope(scope)
      changes.forEach(change => this.assertContextOwner(scope, change))
      const receipts = await this.#saveRequest.save({ changes, config, ...(signal === undefined ? {} : { signal }) })
      this.assertScope(scope)
      receipts.forEach((receipt, index) => {
        const change = changes[index]
        if (change === undefined) throw new Error('SPARK 保存缺少基线目标')
        this.#contexts.delete(change.context)
        this.#contexts.set(receipt.context, this.resourceKey(scope, change.identity))
      })
      return receipts
    }).finally(() => this.assertScope(scope))
    const tail = run.then(() => undefined, () => undefined)
    keys.forEach(key => this.#mutationFlights.set(key, tail))
    return run.finally(() => {
      keys.forEach(key => {
        if (this.#mutationFlights.get(key) === tail) this.#mutationFlights.delete(key)
      })
    })
  }

  private assertContextOwner(scope: string, change: DataSpaceRuntimeSaveCommand['changes'][number]): void {
    if (this.#contexts.get(change.context) !== this.resourceKey(scope, change.identity)) {
      throw new Error('SPARK_SAVE_CONTEXT_OWNER: 保存基线不属于当前运行 owner 或已被成功提交')
    }
    change.context.assertIdentity(change.identity)
  }

  private resourceKey(scope: string, identity: DataSpaceQueryIdentity): string {
    return JSON.stringify([scope, identity.scenarioId, identity.metaName])
  }

  private currentScope(): string {
    const token = this.#readScope().token
    if (!token.trim()) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 请求层未提供有效 scope token')
    return token
  }

  private assertScope(scope: string): void {
    if (this.currentScope() !== scope) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 运行 owner 所属请求范围已失效')
  }

}
