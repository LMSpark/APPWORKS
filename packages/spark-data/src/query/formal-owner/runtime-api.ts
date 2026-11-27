/**
 * @module @/platform-adapters/api:platform/data-space/runtime/data-space-runtime-api
 * 职责：拥有模型查询与统一保存的运行入口。
 * 边界：只接受当前 scope 中本 owner 登记的原查询基线。
 * AI用途：把 DataView 查询与同场景模型保存接入实际运行 owner。
 */
/** 数据空间运行态 API；按场景与模型 Name 拥有原查询、权限基线和统一保存。 */
import { isRecord, type HttpClientBase } from '@spark-appworks/spark-utils'
import type { DataSet } from '../../dataset'
import type { DataTable } from '../../data-table'
import type { DataView } from '../../data-view'
import { DataTreeField } from '../../core/tree-field'
import type { DataColumn, QueryParams, TableMetadata } from '../../types'
import { DataViewArrayQuery } from '../data-view-array-query'
import { DataViewParentResult } from '../data-view-parent-result'
import { DataViewQuery } from '../data-view-query'
import { DataViewFilter } from '../filter/data-view-filter'
import type { DataViewFilterTree } from '../filter/data-view-filter-contract'
import type {
  DataSpaceQueryIdentity,
  DataSpaceQueryOptions,
  DataSpaceQueryProjection,
  DataSpaceRequestScope,
} from '../formal-table-contract'
import { createFormalFieldProjection, resolveFormalFields, resolveFormalOutputFields, resolveFormalTableResource,
  type FormalModelDescriptor } from './formal-model'
import type {DataSpaceModelBindingOptions} from './model-binding'
import {DataSpaceModelCommandNotDispatchedError} from './model-command-error'
import { DataSpaceQueryAggregation } from './query-aggregation'
import { DataSpaceQueryCache } from './query-cache'
import { DataSpaceQueryContext } from './query-context'
import {DataSpaceQueryGraph} from './query-graph'
import { captureDataSpaceViewQuery } from './query-options'
import { DataSpaceQueryTable } from './query-table'
import { DataSpaceRequest, DataSpaceSaveUnconfirmedError } from './request'
import { DataSpaceRequestConfig } from './request-config'
import { DataSpaceSourceInput } from './source-input'
import { parseOptionalDataSpaceValueFunction } from './value-function'

/** 运行 owner 的 HTTP 通道和请求身份读取器；scope 变更使旧基线失效。 */
type DataSpaceRuntimeApiOptions = Readonly<{
  http: HttpClientBase
  readScope: () => DataSpaceRequestScope
}>
/** 统一保存命令；每个目标携带本 owner 的原查询上下文与候选变更。 */
type DataSpaceRuntimeSaveChange = Parameters<DataSpaceRequest['save']>[0]['changes'][number]
  & Readonly<{tableConfig?: Pick<TableMetadata, 'api' | 'crudConfig'>}>
type DataSpaceRuntimePreparedSaveChange = DataSpaceRuntimeSaveChange & Readonly<{
  recovery: NonNullable<DataSpaceRuntimeSaveChange['recovery']>
}>
type DataSpaceRuntimeSaveCommand = Readonly<{
  changes: readonly DataSpaceRuntimeSaveChange[]
  signal?: AbortSignal
}>
/** 实际保存回执和推进后的独立上下文；失败不产生确认结果。 */
type DataSpaceRuntimeSaveResult = Awaited<ReturnType<DataSpaceRequest['save']>>
type DataSpaceRuntimeUnconfirmed = Readonly<{
  signature: string
  contexts: ReadonlySet<DataSpaceQueryContext>
  captures: readonly DataSpaceRuntimePreparedSaveChange[]
}>
type DataSpaceQueryWithConfigInput = Readonly<{
  assertQueryCurrent?: () => void
  /** 正式子查询解析产生的本次只读投影与模型图守卫。 */
  projection?: DataSpaceQueryProjection
  identity: DataSpaceQueryIdentity
  options: DataSpaceQueryOptions
  config: DataSpaceRequestConfig
  view?: DataView
  accept?: (context: DataSpaceQueryContext) => void
  definition?: FormalModelDescriptor
}>
type DataSpaceRuntimeQueryFlight = Promise<DataSpaceQueryContext>
type DataSpaceRuntimeQueryFlights = Set<DataSpaceRuntimeQueryFlight>
/** 来源类型改变时须仍成立的查询特征；由运行请求或持久视图配置提供。 */
type DataSpaceResourceQuery = Readonly<{
  /** mapped按模型取值定义解析；direct仅接口和逻辑视图接收来源实参。 */
  sourceInputMode?: QueryParams['sourceInputMode']
  /** 本次输出包含显式聚合或分组。 */
  aggregate?: boolean
  /** 查询树参数或结果树组织实际参与查询。 */
  tree?: boolean
  /** 省略时沿用单表查询。 */
  outputType?: QueryParams['outputType']
}>
/** 仅定位原生资源，不加载模型字段或查询业务数据。 */
type DataSpaceRuntimeQuerySource = Pick<FormalModelDescriptor, 'sourceType' | 'sourceName'>

/** 拥有原查询缓存、保存基线归属和同模型读写串行化；DataView 与 DataSet 消费同一实际保存 owner。 */
export class DataSpaceRuntimeApi {
  /** 父结果来源由同一运行owner校验正式模型并消费，不另发HTTP。 */
  readonly parentResults = true
  /** 正式服务汇总必须消费后端结果；旧view.aggregates不能按分页行或选择缓存计算。静态数组绑定其本地owner。 */
  readonly localAggregates = false
  private readonly queryCache: DataSpaceQueryCache
  readonly #saveRequest: DataSpaceRequest
  readonly #readScope: DataSpaceRuntimeApiOptions['readScope']
  readonly #contexts = new WeakMap<DataSpaceQueryContext, string>()
  readonly #mutationFlights = new Map<string, Promise<void>>()
  readonly #models = new WeakMap<DataTable, Readonly<{model: FormalModelDescriptor; scope: string;adapter?:DataSpaceModelBindingOptions['adapter']}>>()
  readonly #queryFlights = new Map<string, DataSpaceRuntimeQueryFlights>()
  /** 结果未确认的保存批次：同批原查询上下文共享一条记录，再次保存只核验、不重放。 */
  readonly #unconfirmed = new Map<DataSpaceQueryContext, DataSpaceRuntimeUnconfirmed>()
  /** 每个查询基线的原查询选项与请求配置；核验回读沿用其调用参数，仅替换为主键过滤。 */
  readonly #queryOrigins = new WeakMap<DataSpaceQueryContext, Readonly<Pick<DataSpaceQueryWithConfigInput, 'identity' | 'options' | 'config' | 'accept' | 'definition'>>>()

  /** 建立共享查询缓存与保存请求 owner，使用同一个请求 scope 读取器。 */
  public constructor(options: DataSpaceRuntimeApiOptions) {
    this.queryCache = new DataSpaceQueryCache(options)
    this.#saveRequest = new DataSpaceRequest(options)
    this.#readScope = options.readScope
  }

  /**
   * 校验已有资源查询能力，设计时来源替换与实际执行复用同一判定。
   * @param model 正式来源类型和资源名，不替代模型查询身份。
   * @param query 待保留的视图查询特征；不推导数据权限或资源可写性。
   * @throws SPARK_SOURCE_INPUT或SPARK_QUERY_AGGREGATE表示当前适配链不支持该组合。
   */
  public static validateResourceQuery(model: DataSpaceRuntimeQuerySource, query: DataSpaceResourceQuery): void {
    const resource = resolveFormalTableResource(model).resourceType
    if (query.sourceInputMode === 'direct' && !['third-party-api', 'logical-view'].includes(resource)) {
      throw new Error('SPARK_SOURCE_INPUT: 直接来源入参仅适用于接口或逻辑视图模型')
    }
    if (query.aggregate && (!['database-table', 'database-view'].includes(resource)
      || query.tree || !['Table', 'Join'].includes(query.outputType ?? 'Table'))) {
      throw new Error('SPARK_QUERY_AGGREGATE: 当前资源或树查询尚不支持后端聚合分组')
    }
  }

  /** 查询后端注册模型；原结果上下文只供 DataView 的执行边界持有。 */
  public query(identity: DataSpaceQueryIdentity, options: DataSpaceQueryOptions = {}): Promise<DataSpaceQueryContext> {
    return this.queryWithConfig({identity, options, config: DataSpaceRequestConfig.resolveQuery()})
  }

  /** 清除当前请求owner的查询结果；登录/应用切换、刷新及写入共用，不撤销已接纳的查询基线。 */
  public invalidateQueryCache(): void {this.queryCache.invalidateResults()}
  /** 页面释放沿DataView生命周期清理页面级结果。 */
  public releaseQueryCache(page: object): void {this.queryCache.releaseResults(page)}

  private async queryWithConfig(input: DataSpaceQueryWithConfigInput, heldMutationKeys?: ReadonlySet<string>): Promise<DataSpaceQueryContext> {
    const {identity, options, config, view, accept, definition, assertQueryCurrent} = input
    const scope = this.currentScope()
    const normalized = new DataSpaceQueryTable(identity).identity
    const key = this.resourceKey(scope, normalized)
    const mutation = this.#mutationFlights.get(key)
    if (mutation !== undefined && !heldMutationKeys?.has(key)) await mutation
    this.assertScope(scope)
    assertQueryCurrent?.()
    const cacheType = view?.queryConfig.cacheType
    const cache = view && cacheType && cacheType !== 'none' ? {
      ...(cacheType === 'page' ? {page: view.dataSet ?? view} : {}),
      definition: [view.viewId, view.dataTable?.modelBinding, view.treeConfig, definition],
      isCurrent: () => !view.isDestroyed() && !view.dataSet?.destroyed,
      ...(accept === undefined ? {} : {accept}),
    } : undefined
    const flight = this.queryCache.query({
      ...(assertQueryCurrent ? {assertQueryCurrent} : {}),
      ...(input.projection === undefined ? {} : {projection: input.projection}),
      identity: normalized,
      options,
      config,
      ...(cache !== undefined ? { cache } : {}),
    })
    let flights = this.#queryFlights.get(key)
    if (flights === undefined) {
      flights = new Set()
      this.#queryFlights.set(key, flights)
    }
    flights.add(flight)
    try {
      const context = await flight
      assertQueryCurrent?.()
      if (cache === undefined) accept?.(context)
      this.assertScope(scope)
      if (options.allPages && context.resultKind === 'entity' && context.resultPrimaryKey) {
        const keys = new Set<string>()
        for (const row of context.rows) {
          const rowKey = String(context.rowKey(row) ?? '').trim()
          if (!rowKey) throw new Error('SPARK 批量查询记录主键无效')
          if (keys.has(rowKey)) throw new Error('SPARK 批量查询记录主键重复')
          keys.add(rowKey)
        }
      }
      this.#contexts.set(context, key)
      this.#queryOrigins.set(context, {identity: normalized, options, config, ...(accept === undefined ? {} : {accept}), ...(definition === undefined ? {} : {definition})})
      return context
    } finally {
      flights.delete(flight)
      if (flights.size === 0 && this.#queryFlights.get(key) === flights) this.#queryFlights.delete(key)
      this.assertScope(scope)
    }
  }

  private prepareModelTableBinding(
    table: DataTable,
    model: FormalModelDescriptor,
    options: DataSpaceModelBindingOptions,
  ): Readonly<{scope: ReturnType<DataSpaceRuntimeApi['currentScope']>; arrayRows: typeof options.arrayRows}> {
    if (Array.isArray(options)) throw new Error('SPARK_MODEL_BINDING_OPTIONS: 绑定必须使用具名选项')
    const {arrayRows,adapter}=options
    if(adapter&&(arrayRows!==undefined||resolveFormalTableResource(model).resourceType!=='third-party-api'
      ||!['command','paged-read'].includes(adapter.kind)||adapter.kind!=='command'&&typeof adapter.execute!=='function'))throw new Error('SPARK_MODEL_BINDING_OPTIONS: 来源适配只支持正式接口模型且不能同时绑定数组')
    if (table.modelBinding?.modelId !== model.id || table.modelBinding.modelName !== model.metaName) {
      throw new Error('SPARK_VIEW_MODEL_IDENTITY: 视图与正式模型身份不一致')
    }
    const formal = new Set(resolveFormalFields(model).map(field => field.canonicalName))
    DataSpaceRequestConfig.validate(table)
    for (const column of table.columns) {
      if (column.computeExpression && formal.has(column.name)) {
        throw new Error(`SPARK_MODEL_COMPUTED_COLLISION: 本地计算列与正式字段重名: ${column.name}`)
      }
    }
    const previous = this.#models.get(table)
    if (previous) this.assertScope(previous.scope)
    if (previous && previous.model !== model && JSON.stringify(previous.model) !== JSON.stringify(model)) {
      throw new Error('SPARK_VIEW_MODEL_IDENTITY: 同一DataTable不能绑定不同正式定义，请重新装配')
    }
    if(previous&&(previous.adapter?.kind!==adapter?.kind||adapter?.kind==='paged-read'&&previous.adapter!==adapter))throw new Error('SPARK_MODEL_BINDING_OPTIONS: 同一正式模型不能改变执行模式')
    const scope = this.currentScope()
    this.#models.set(table, {model, scope,...(adapter===undefined?{}:{adapter})})
    if (model.sourceType === '数组') {
      if (arrayRows === undefined) throw new Error('正式数组缺少已读取的items')
    } else if (arrayRows !== undefined) {
      throw new Error('只有数组模型可以绑定本地items')
    }
    return {scope, arrayRows}
  }

  private configureModelView(table: DataTable, view: DataView, model: FormalModelDescriptor): void {
    if (view.fieldProjection.length === 0) {
      view.configure({fieldProjection: createFormalFieldProjection(model)
        .filter(field => table.columns.some(column => column.name === field.resourceField))})
    }
  }

  /**
   * 将正式模型及当前请求scope绑定到DataTable；同表各派生视图复用同一owner adapter，结果和权限仍逐视图隔离。
   * 正式数组使用 DataTable 级 adapter factory，为后续新增视图生成各自的数组查询实例。
   */
  public bindModelTable(table: DataTable, model: FormalModelDescriptor, options: DataSpaceModelBindingOptions = {}): void {
    const prepared = this.prepareModelTableBinding(table, model, options)
    for (const view of table.viewList) this.configureModelView(table, view, model)
    if (model.sourceType === '数组') {
      const rows = prepared.arrayRows
      if (rows === undefined) throw new Error('正式数组缺少已读取的items')
      table.bindQueryExecutor(view => new DataViewArrayQuery(view, rows, () => this.assertScope(prepared.scope)))
      return
    }
    table.bindQueryExecutor(this)
  }

  /** 单视图兼容入口；新装配与宿主应优先使用 bindModelTable，避免后续视图遗漏 owner adapter。 */
  public bindModelView(view: DataView, model: FormalModelDescriptor, options: DataSpaceModelBindingOptions = {}): void {
    const table = view.dataTable
    if (!table) throw new Error('SPARK_VIEW_MODEL_IDENTITY: 视图未关联 DataTable')
    const prepared = this.prepareModelTableBinding(table, model, options)
    this.configureModelView(table, view, model)
    if (model.sourceType === '数组') {
      const rows = prepared.arrayRows
      if (rows === undefined) throw new Error('正式数组缺少已读取的items')
      view.bindQueryExecutor(new DataViewArrayQuery(view, rows, () => this.assertScope(prepared.scope)))
      return
    }
    view.bindQueryExecutor(this)
  }

  /**
   * 正式查询自动补齐的树结构字段；合并渲染配置与显式查询依赖，不表示已获得读取权限。
   * @param view 所属视图；设计候选缺省读取其当前查询配置。
   * @param formalFields 正式输出字段，用于判断省略的父键和文本字段是否存在。
   * @param queryTree 本次查询捕获的树参数；省略时使用视图queryConfig.tree。
   * @returns 需要查询并核验可读性的模型输出字段名集合。
   */
  public static resolveTreeFields(view: DataView, formalFields: ReadonlySet<string>,
    queryTree: QueryParams['tree'] = view.queryConfig.tree): ReadonlySet<string> {
    const fields = new Set<string>()
    if (queryTree) {
      fields.add(queryTree.keyField)
      fields.add(queryTree.parentField)
    }
    const tree = view.treeConfig
    if (tree) {
      fields.add(tree.idField ?? 'id')
      if (tree.parentIdField !== undefined || formalFields.has('parentId')) {
        fields.add(DataTreeField.source(tree.parentIdField ?? 'parentId'))
      }
      if (tree.orderField !== undefined) fields.add(DataTreeField.source(tree.orderField))
      const textField = tree.textField ?? 'name'
      if ((tree.textField !== undefined || formalFields.has(textField))
        && !view.dataTable?.columns.some(column => column.name === textField && Boolean(column.computeExpression))) {
        fields.add(textField)
      }
    }
    return fields
  }

  /**
   * 从本运行owner绑定的正式模型解析查询字段，供DataView.queryColumns统一消费。
   * 字段名为规范输出名；不受命名视图显示投影限制，不包含非输出或本地计算列，也不授予数据权限。
   * 未绑定正式模型的既有原生查询仍使用其DataTable字段，生命周期由DataView保护。
   */
  public queryColumns(view: DataView): readonly DataColumn[] {
    const table = view.dataTable, binding = table ? this.#models.get(table) : undefined
    if (view.destroyed || !table) throw new Error('SPARK_VIEW_MODEL_IDENTITY: 查询字段视图已失效')
    if (!binding) return table.columns
    this.assertScope(binding.scope)
    if (table.modelBinding?.modelId !== binding.model.id || table.modelBinding.modelName !== binding.model.metaName) {
      throw new Error('SPARK_VIEW_MODEL_IDENTITY: 查询字段模型身份已变化')
    }
    const outputs = new Set(resolveFormalOutputFields(binding.model).map(field => field.canonicalName))
    return table.columns.filter(column => outputs.has(column.name))
  }

  /** 命名视图选择正式输出，安全聚合及显式分组由GetData执行；不改模型永久定义。 */
  public async executeQuery(view: DataView, params: QueryParams): Promise<DataSpaceQueryContext> {
    const assertQueryCurrent = view.dataSet?.formalQueryGuard
    assertQueryCurrent?.()
    const read = (captured: QueryParams) => this.queryWithConfig({...this.prepareQuery(view, captured),
      ...(assertQueryCurrent ? {assertQueryCurrent} : {})})
    const binding=view.dataTable?this.#models.get(view.dataTable):undefined
    if(binding?.adapter){
      this.assertScope(binding.scope)
      if(binding.adapter.kind==='command')throw new Error('SPARK_MODEL_COMMAND: 服务命令不能通过普通查询执行')
      if(params.parentResult)throw new Error('SPARK_MODEL_BINDING_OPTIONS: 来源分页适配不支持父结果读取')
      const originals=new Set<DataSpaceQueryContext>()
      const guard=()=>{this.assertScope(binding.scope);if(view.destroyed||view.dataSet?.destroyed||!view.dataTable||this.#models.get(view.dataTable)!==binding)throw new Error('SPARK_EXECUTION_SCOPE_STALE: 来源分页绑定已失效')}
      const result=await binding.adapter.execute({view,params,read:async captured=>{
        guard();const context=await read(captured);guard();originals.add(context);return context
      }})
      guard()
      assertQueryCurrent?.()
      if(!originals.has(result.result))throw new Error('SPARK_MODEL_ADAPTER_RESULT: 分页结果不是本次正式读取结果')
      return result.nextPageAvailable===undefined?result.result:result.result.withNextPageAvailable(result.nextPageAvailable)
    }
    if (params.parentResult) {
      const parentBinding = this.prepareParentQuery(view, params)
      await DataViewParentResult.request(view)
      assertQueryCurrent?.()
      this.assertScope(parentBinding.scope)
      const source = DataViewParentResult.resolve(view)
      if (!source) throw new Error('SPARK_PARENT_MODEL: 父来源不存在')
      const result = source.readChildResult(params.parentResult.childModelName)
      if (!(result instanceof DataSpaceQueryContext)) throw new Error('SPARK_PARENT_OWNER: 父结果不属于正式查询owner')
      result.assertIdentity({scenarioId: view.dataSet?.scenarioId ?? '', metaName: parentBinding.model.metaName})
      result.bindFormalModel(parentBinding.model)
      return result
    }
    return read(params)
  }

  /** 正式接口命令的一次执行能力；供命令提交适配消费，不经读缓存/合并，不登记CRUD核验基线。 */
  public async executeModelCommand(view: DataView, sourceInputs: Readonly<Record<string, unknown>>): Promise<DataSpaceQueryContext> {
    const {input,guard}=this.prepareModelCommand(view,sourceInputs)
    const result=await this.queryCache.executeOnce({identity:input.identity,options:input.options,config:input.config,
      ...(input.projection===undefined?{}:{projection:input.projection})})
    guard();input.accept?.(result);return result
  }

  /** 这里只做同步准备；抛错可证明尚未进入一次执行能力。 */
  private prepareModelCommand(view:DataView,sourceInputs:Readonly<Record<string,unknown>>){
    try{
    const binding=view.dataTable?this.#models.get(view.dataTable):undefined
    if(binding?.adapter?.kind!=='command')throw new Error('SPARK_MODEL_COMMAND: 未登记正式命令执行模式')
    this.assertScope(binding.scope)
    const guard=()=>{this.assertScope(binding.scope);if(view.destroyed||view.dataSet?.destroyed||!view.dataTable||this.#models.get(view.dataTable)!==binding)throw new Error('SPARK_EXECUTION_SCOPE_STALE: 命令模型绑定已失效')}
    guard()
    const config=view.queryConfig
    if(config.parentResult||config.tree||config.children||config.allPages||view.treeConfig)throw new Error('SPARK_MODEL_COMMAND: 命令不支持分页集合、树或子查询')
    const input=this.prepareQuery(view,{...DataViewQuery.capture(config),pagination:'none',sourceInputMode:'direct',context:structuredClone(sourceInputs)})
      return {input,guard}
    }catch(cause){throw new DataSpaceModelCommandNotDispatchedError(cause)}
  }

  private prepareParentQuery(view: DataView, params: QueryParams) {
      DataViewParentResult.validateRequest(view, params)
      const binding = view.dataTable ? this.#models.get(view.dataTable) : undefined
      if (!binding) throw new Error('SPARK_PARENT_MODEL: 父来源需要正式目标模型绑定')
      this.assertScope(binding.scope)
      const expected = createFormalFieldProjection(binding.model)
        .filter(field => view.dataTable?.columns.some(column => column.name === field.resourceField))
      DataViewParentResult.validateProjection(view, expected)
      return binding
  }

  private prepareQuery(view: DataView, params: QueryParams,
    capture: Readonly<{bindInputParams?: boolean}> = {}): DataSpaceQueryWithConfigInput {
    const command = captureDataSpaceViewQuery(view, params, capture)
    const config = DataSpaceRequestConfig.resolveQuery(view.dataTable ?? undefined)
    const binding = view.dataTable ? this.#models.get(view.dataTable) : undefined
    if (binding) this.assertScope(binding.scope)
    const model = binding?.model
    if (model === undefined) {
      if (command.options.children?.length) throw new Error('SPARK_JOIN_MODEL: 子查询需要正式模型绑定')
      if (command.sourceInputMode === 'direct') throw new Error('SPARK_SOURCE_INPUT: 直接来源入参需要正式模型绑定')
      return {identity: command.identity, options: command.options, config, view}
    }
    DataSpaceRuntimeApi.validateResourceQuery(model, {sourceInputMode: command.sourceInputMode})
    if (capture.bindInputParams === false && model.sourceInputBindings?.length) DataSpaceSourceInput.validateBindings(model.sourceInputBindings, command.sourceInputMode)
    const outputFields = resolveFormalOutputFields(model)
    const requestField = (output: string): string => {
      const field = outputFields.find(candidate => candidate.canonicalName === output)
      if (!field) throw new Error(`SPARK_MODEL_FIELD_UNRESOLVED: ${output}`)
      return field.name
    }
    // 服务端过滤可引用不输出的模型字段；输出投影仍只解析输出字段。
    const modelFields = resolveFormalFields(model)
    const filterField = (name: string): string => {
      const field = modelFields.find(candidate => candidate.canonicalName === name)
      if (!field) throw new Error(`SPARK_MODEL_FIELD_UNRESOLVED: ${name}`)
      return field.name
    }
    const filterTree = (tree: DataViewFilterTree): DataViewFilterTree => 'logic' in tree
      ? {...tree, filters: tree.filters.map(filterTree)} : {...tree, field: filterField(tree.field)}
    const toFilter = (tree: DataViewFilterTree): DataViewFilter => 'logic' in tree ? DataViewFilter.group(tree) : DataViewFilter.condition(tree)
    const options = command.options
    for (const field of options.fields ?? []) {
      if (typeof field !== 'string' && (field.expression
        || (field.alias !== undefined && field.alias !== field.name))) {
        throw new Error('SPARK_MODEL_PROJECTION: 查询视图不能重定义正式模型输出')
      }
    }
    const fields = options.fields?.map(field => {
      if (typeof field === 'string') return {name: requestField(field)}
      const {alias, valueFun, ...projection} = field
      const formal = outputFields.find(item => item.canonicalName === (alias ?? field.name))
      if (!formal) throw new Error(`SPARK_MODEL_FIELD_UNRESOLVED: ${field.name}`)
      const name = formal.name
      const aggregate = DataSpaceQueryAggregation.normalize(valueFun, formal)
      return {...projection, name, group: DataSpaceQueryAggregation.group(field.group), ...(aggregate ? {valueFun: aggregate} : {})}
    })
    const treeFields = DataSpaceRuntimeApi.resolveTreeFields(view, new Set(outputFields.map(field => field.canonicalName)), options.tree)
    // 显式视图分组整组覆盖；没有显式分组时保持既有模型分组依赖。
    const groups = new Map<string, number>()
    for (const field of model.fields) {
      const raw = field.raw['Group'] ?? field.raw['group'] ?? 0
      const group = Number(raw)
      if ((typeof raw !== 'number' && typeof raw !== 'string') || !Number.isSafeInteger(group)) {
        throw new Error(`SPARK_MODEL_GROUP: 模型字段分组必须是整数: ${field.name}`)
      }
      if (group > 0) groups.set(field.name, group)
    }
    const requestedGroups = fields?.filter(field => 'group' in field && typeof field.group === 'number' && field.group > 0) ?? []
    if (requestedGroups.length) {
      groups.clear()
      for (const field of requestedGroups) if ('group' in field && typeof field.group === 'number') groups.set(field.name, field.group)
    }
    const requestedAggregate = fields?.some(field => 'valueFun' in field) === true
    const sqlResource = ['database-table', 'database-view'].includes(resolveFormalTableResource(model).resourceType)
    DataSpaceRuntimeApi.validateResourceQuery(model, {aggregate: requestedAggregate || requestedGroups.length > 0,
      tree: options.tree !== undefined || treeFields.size > 0, outputType: options.outputType})
    const aggregateResult = sqlResource && options.tree === undefined && ['Table', 'Join'].includes(options.outputType ?? 'Table')
      && (requestedAggregate || groups.size > 0 || outputFields.some(field => {
        if (!fields?.some(selected => selected.name === field.name)) return false
        const raw = field.raw['ValueFun'] ?? field.raw['valueFun']
        const value = typeof raw === 'string' ? parseOptionalDataSpaceValueFunction(raw) : raw
        return isRecord(value) && value['Type'] === 'GetGroupData'
      }))
    if (requestedAggregate || requestedGroups.length) {
      for (const field of fields ?? []) {
        const original = outputFields.find(item => item.name === field.name)
        const inherited = original?.raw['ValueFun'] ?? original?.raw['valueFun']
        if (!groups.has(field.name) && !('valueFun' in field)
          && !(original && DataSpaceQueryAggregation.normalize(inherited, original))) {
          throw new Error(`SPARK_QUERY_AGGREGATE: ${field.name}须参与分组或配置聚合，不能混入普通输出`)
        }
      }
    }
    for (const dependency of [...(aggregateResult || options.outputType === 'Join' ? [] : [model.primaryKey]), ...treeFields]) {
      if (!fields || !dependency) continue
      const name = requestField(dependency)
      if (!fields.some(field => field.name === name)) fields.push({name})
    }
    const queryFields = fields?.map(field => {
      const group = groups.get(field.name)
      return {...field, ...(group === undefined ? {} : {group})}
    })
    for (const [name, group] of groups) {
      if (queryFields && !queryFields.some(field => field.name === name)) queryFields.push({name, group})
    }
    if (options.children?.length && aggregateResult) throw new Error('SPARK_JOIN_AGGREGATE: 显式子Join的全图聚合尚未承接')
    const join = DataSpaceQueryGraph.resolve({view, model, options: {...options, ...(queryFields === undefined ? {} : {fields: queryFields})},
      readModel: table => {const entry = this.#models.get(table); if (entry) this.assertScope(entry.scope); return entry?.model}})
    let projection = join?.projection
    if (view.newRowFields !== undefined) {
      const table = view.dataTable
      if (!table || !binding || join || aggregateResult || ['Join', 'Navigation', 'HierarchyData'].includes(options.outputType ?? '')) {
        throw new Error('SPARK_NEW_ROW_INPUT: 显式新行输入只适用于正式实体查询')
      }
      const originalBinding = binding
      const signature = () => JSON.stringify([table.modelBinding, table.columns, view.fieldProjection, view.newRowFields])
      const captured = signature(), inputFields = Object.freeze([...view.newRowFields])
      const outputs = new Set(outputFields.map(field => field.canonicalName))
      projection = {
        owner: view, signature: captured, newRowFields: inputFields,
        columns: Object.freeze(view.columns.filter(column => outputs.has(column.name)).map(column => structuredClone(column))),
        assertCurrent: () => {
          this.assertScope(originalBinding.scope)
          if (view.isDestroyed() || view.dataSet?.destroyed || view.dataTable !== table
            || this.#models.get(table) !== originalBinding || signature() !== captured) {
            throw new Error('SPARK_NEW_ROW_INPUT_STALE: 原视图的新行输入或正式绑定已变化')
          }
        },
      }
    }
    return {
      ...(projection === undefined ? {} : {projection}),
      identity: command.identity,
      options: {...options, outputFieldMode: 'REQUEST',
        ...(join?.options.children === undefined ? {} : {children: join.options.children}),
        ...(model.sourceInputBindings?.length && capture.bindInputParams !== false ? {inputParams: DataSpaceSourceInput.resolve(model.sourceInputBindings, options.inputParams, command.sourceInputMode)} : {}),
        ...(queryFields === undefined ? {} : {fields: queryFields}),
        ...(options.sort === undefined ? {} : {sort: options.sort.map(sort => ({...sort, field: requestField(sort.field)}))}),
        ...(options.filter ? {filter: toFilter(filterTree(options.filter.toJSON()))} : {}),
        ...(options.tree === undefined ? {} : {tree: {...options.tree, keyField: requestField(options.tree.keyField),
          parentField: requestField(options.tree.parentField),
          ...(options.tree.hasChildrenField === undefined ? {} : {hasChildrenField: requestField(options.tree.hasChildrenField)})}}),
      },
      config,
      view,
      accept: result => {
        result.bindFormalModel(model, {aggregateResult})
        for (const row of result.rows) for (const field of treeFields) {
          if (!Object.hasOwn(row, field) || result.readFieldAccess(row, field) !== 'visible') {
            throw new Error(`SPARK_TREE_FIELD_UNAVAILABLE: 树字段未返回或不可读: ${field}`)
          }
        }
      },
      definition: model,
    }
  }

  /** 校验显式查询图及父结果的实际直接子路径；不查询业务行、不创建查询上下文。 */
  public validateQueryDefinitions(dataSet: DataSet): void {
    const plans = new Map<DataView, DataSpaceQueryProjection['nested']>()
    const resolve = (view: DataView): DataSpaceQueryProjection['nested'] => {
      if (plans.has(view)) return plans.get(view)
      const params = DataViewQuery.capture(view.queryConfig)
      let plan: DataSpaceQueryProjection['nested']
      if (params.parentResult) {
        const binding = this.prepareParentQuery(view, params)
        const parent = DataViewParentResult.resolve(view)
        const upstream = parent && resolve(parent)
        const children = upstream?.root.children.filter(node => node.model.metaName === params.parentResult?.childModelName) ?? []
        if (!upstream || children.length !== 1 || children[0]?.model.id !== binding.model.id) {
          throw new Error('SPARK_PARENT_PLAN: 指定父视图没有对应的直接子结果计划')
        }
        plan = {mode: upstream.mode, root: children[0]}
      } else {
        const filters = [view.scopeFilter, view.filterExpression].filter(filter => filter !== undefined)
        const filter: DataViewFilterTree | undefined = filters.length > 1 ? {logic: 'and', filters} : filters[0]
        const prepared = this.prepareQuery(view, {...params,
          ...(filter === undefined ? {} : {filter}),
          ...(view.sortExpression === undefined ? {} : {sort: DataViewQuery.serializeSort(view.sortExpression)})},
          {bindInputParams: false})
        prepared.projection?.assertCurrent()
        plan = prepared.projection?.nested
      }
      plans.set(view, plan)
      return plan
    }
    for (const table of Object.values(dataSet.tables)) table.forEachView(view => {
      if (view.queryConfig.parentResult || view.queryConfig.children?.length) resolve(view)
    })
  }

  /** 原保存请求已发出但结果未确认；DataView 据此只允许经原保存入口核验。 */
  public hasUnconfirmedSave(context: DataSpaceQueryContext): boolean {return this.#unconfirmed.has(context)}
  /** 调用方明确放弃核验：解除整批待核验记录，不撤销服务端可能已生效的写入。 */
  public abandonUnconfirmedSave(context: DataSpaceQueryContext): void {
    const record = this.#unconfirmed.get(context)
    if (record) for (const item of record.contexts) this.#unconfirmed.delete(item)
  }

  public async save(command: DataSpaceRuntimeSaveCommand): Promise<DataSpaceRuntimeSaveResult> {
    const scope = this.currentScope()
    const signal = command.signal
    signal?.throwIfAborted()
    const targets = command.changes.map(change => ({...change,
      identity: new DataSpaceQueryTable(change.identity).identity, changes: structuredClone(change.changes)}))
    targets.forEach(change => this.assertContextOwner(scope, change))
    const changes = targets.map(target => {
      const prepared = target.context.prepareSaveChanges(target.changes)
      return {...target, changes: prepared, recovery: target.context.captureSaveRecovery(prepared, target.recovery)}
    })
    const signature = JSON.stringify(changes.map(change => ({identity: change.identity, changes: change.changes, recovery: change.recovery})))
    const pendingFor = (): DataSpaceRuntimeUnconfirmed | undefined => {
      const pending = changes.map(change => this.#unconfirmed.get(change.context)).find(item => item !== undefined)
      if (!pending) return undefined
      if (signature !== pending.signature || changes.length !== pending.contexts.size
        || changes.some(change => !pending.contexts.has(change.context))) {
        throw new Error('SPARK_SAVE_UNCONFIRMED: 请先核验原提交，不能夹带另一批修改')
      }
      changes.forEach(change => this.assertContextOwner(scope, change))
      return pending
    }
    pendingFor()
    const keys = [...new Set(changes.map(change => this.resourceKey(scope, change.identity)))].sort()
    changes.forEach(change => this.assertContextOwner(scope, change))
    const config = DataSpaceRequestConfig.resolveSave(changes)
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
      this.invalidateQueryCache()
      let receipts: DataSpaceRuntimeSaveResult
      let responseAccepted = false
      try {
        const pending = pendingFor()
        if (pending !== undefined) {
          try { receipts = await this.verifyUnconfirmedSave({changes: pending.captures, scope, keys}) }
          catch (cause) {
            throw new Error(`SPARK_SAVE_UNVERIFIABLE: 原提交精确回读未能确认: ${
              cause instanceof Error ? cause.message : String(cause)}`, {cause})
          }
          for (const [index, receipt] of receipts.entries()) {
            const change = changes[index]
            if (change === undefined) throw new Error('SPARK_SAVE_RECOVERY: 缺少原保存目标')
            this.#contexts.set(receipt.context, this.resourceKey(scope, change.identity))
            const origin = this.#queryOrigins.get(change.context)
            if (origin) this.#queryOrigins.set(receipt.context, origin)
          }
          this.assertScope(scope)
          for (const change of changes) {
            this.#unconfirmed.delete(change.context)
            this.#contexts.delete(change.context)
          }
          return receipts
        }
        receipts = await this.#saveRequest.save({ changes, config, ...(signal === undefined ? {} : { signal }) })
        responseAccepted = true
        this.assertScope(scope)
        for (const [index, receipt] of receipts.entries()) {
          const change = changes[index]
          if (change === undefined) throw new Error('SPARK 保存缺少基线目标')
          this.#contexts.set(receipt.context, this.resourceKey(scope, change.identity))
          const origin = this.#queryOrigins.get(change.context)
          if (origin) this.#queryOrigins.set(receipt.context, origin)
          if (receipt.added.length && receipt.context.hasPendingSavedRowPermissions) {
            try {
              const context = await this.refreshSavedPermissions({context:receipt.context,identity:change.identity,scope,heldMutationKeys:new Set(keys),targetIds:receipt.added.map(row => receipt.context.rowKey(row))})
              receipts[index] = {...receipt, context, added: receipt.added.map(row => context.rows.find(queried =>
                Object.is(context.rowKey(queried), receipt.context.rowKey(row))) ?? row)}
            }
            catch {this.assertScope(scope)} // 写回执已确认；行权限读取失败保留只读待恢复状态，不重新提交。
          }
        }
        this.assertScope(scope)
        signal?.throwIfAborted()
        changes.forEach(change => this.assertContextOwner(scope, change))
        changes.forEach(change => this.#contexts.delete(change.context))
        return receipts
      } catch (cause) {
        const error = responseAccepted && !(cause instanceof DataSpaceSaveUnconfirmedError)
          ? new DataSpaceSaveUnconfirmedError('保存回执返回后原执行域失效', cause) : cause
        if (error instanceof DataSpaceSaveUnconfirmedError) {
          const record = Object.freeze({signature, contexts: new Set(changes.map(change => change.context)),
            captures: Object.freeze(changes)})
          for (const change of changes) this.#unconfirmed.set(change.context, record)
        }
        throw error
      } finally {this.invalidateQueryCache()}
    })
    const tail = run.then(() => undefined, () => undefined)
    keys.forEach(key => this.#mutationFlights.set(key, tail))
    return run.finally(() => {
      keys.forEach(key => {
        if (this.#mutationFlights.get(key) === tail) this.#mutationFlights.delete(key)
      })
    })
  }

  /** Read each original model once by captured formal keys; no mutation endpoint is involved. */
  private async verifyUnconfirmedSave(parameters: Readonly<{
    changes: readonly DataSpaceRuntimePreparedSaveChange[]
    scope: string
    keys: readonly string[]
  }>): Promise<DataSpaceRuntimeSaveResult> {
    const receipts: DataSpaceRuntimeSaveResult = []
    const {changes, scope, keys} = parameters
    for (const change of changes) {
      this.assertContextOwner(scope, change)
      const origin = this.#queryOrigins.get(change.context)
      if (!origin) throw new Error('SPARK_SAVE_RECOVERY_UNKNOWN: 原保存缺少正式查询来源')
      const recovery = change.recovery
      const identities: Array<string | number> = []
      for (const entry of recovery.entries) {
        const value = entry.identity[recovery.primaryKey]
        if (typeof value !== 'string' && typeof value !== 'number') {
          throw new Error('SPARK_SAVE_RECOVERY_UNKNOWN: 原保存主键类型无效')
        }
        identities.push(value)
      }
      const requestKey = origin.definition?.fields.find(field => field.canonicalName === recovery.primaryKey)?.name
        ?? recovery.primaryKey
      const fieldNames = new Set<string>([requestKey])
      for (const entry of recovery.entries) {
        for (const field of entry.changedFields) {
          fieldNames.add(origin.definition?.fields.find(item => item.canonicalName === field)?.name ?? field)
        }
      }
      const {sort, tree, page, filter, fields, ...base} = origin.options
      void sort; void tree; void page; void filter; void fields
      const queried = await this.queryWithConfig({
        identity: origin.identity,
        config: origin.config,
        options: {...base, fields: [...fieldNames],
          filter: DataViewFilter.condition({field: requestKey, operator: 'in', value: identities}),
          pagination: 'paged', page: {index: 1, size: identities.length},
          allPages: true, maxRows: identities.length + 1, singleFlight: false},
        ...(origin.accept === undefined ? {} : {accept: origin.accept}),
        ...(origin.definition === undefined ? {} : {definition: origin.definition}),
      }, new Set(keys))
      this.assertScope(scope)
      this.assertContextOwner(scope, change)
      receipts.push(change.context.acceptVerifiedSaveRecovery({
        requested: change.changes, recovery, queried,
      }))
    }
    return receipts
  }

    private async refreshSavedPermissions(parameters:Readonly<{context:DataSpaceQueryContext;identity:DataSpaceQueryIdentity;scope:string;heldMutationKeys?:ReadonlySet<string>|undefined;targetIds?:readonly unknown[]|undefined}>): Promise<DataSpaceQueryContext> {
 const {context,identity,scope,heldMutationKeys,targetIds}=parameters

    this.assertContextOwner(scope, {identity, context, changes: {}})
    if (!context.hasPendingSavedRowPermissions) return context
    const ids = (targetIds ?? context.pendingSavedRowIds).map(id => {
      if (typeof id !== 'string' && typeof id !== 'number') throw new Error('SPARK_SAVED_ROW_IDENTITY: 新增行缺少精确回读身份')
      return id
    }), origin = this.#queryOrigins.get(context), key = context.resultPrimaryKey
    if (!origin || !key || key === '_pk') throw new Error('SPARK_SAVED_ROW_IDENTITY: 新增行缺少精确回读身份')
    const requestKey = origin.definition?.fields.find(field => field.canonicalName === key)?.name ?? key
    const {sort, tree, page, ...base} = origin.options
    const fields = base.fields === undefined || base.fields.some(field => (typeof field === 'string' ? field : field.name) === requestKey)
      ? base.fields : [...base.fields, requestKey]
    void sort; void tree; void page
    const queried = await this.queryWithConfig({identity, config: origin.config,
      options: {...base, ...(fields === undefined ? {} : {fields}), filter: DataViewFilter.condition({field: requestKey, operator: 'in', value: ids}),
        pagination: 'paged', page: {index: 1, size: ids.length}, allPages: true, maxRows: ids.length + 1, singleFlight: false},
      ...(origin.accept === undefined ? {} : {accept: origin.accept}),
      ...(origin.definition === undefined ? {} : {definition: origin.definition}),
    }, heldMutationKeys)
    this.assertScope(scope); this.assertContextOwner(scope, {identity, context, changes: {}})
    if (queried.rows.some(row => !ids.some(id => Object.is(id, queried.rowKey(row))))) throw new Error('SPARK_SAVED_ROW_IDENTITY: 回读超出新增目标')
    const next = context.withSavedRowPermissions(queried, targetIds)
    // 只读恢复不消费原基线；DataView仍须核对读取期间的参数及生命周期后才接纳新结果。
    // 若调用方因参数改变拒收，原基线仍可用于保留草稿和重试读取；只有成功写入消费基线。
    this.#contexts.set(next, this.resourceKey(scope, identity)); this.#queryOrigins.set(next, origin)
    return next
  }

  /** 已确认新增行的权限精确回读；不提交数据、不重放保存，也不重查整页。 */
  public async refreshSavedRowPermissions(context: DataSpaceQueryContext): Promise<DataSpaceQueryContext> {
    const origin = this.#queryOrigins.get(context)
    if (!origin) throw new Error('SPARK_SAVED_ROW_OWNER: 新增行基线不属于当前运行owner')
    return this.refreshSavedPermissions({context,identity:origin.identity,scope:this.currentScope()})
  }

  /**
   * 将同owner的完整增量查询并入原查询基线，供DataView按父节点等选择器增量装载；不提交数据、不消费原基线。
   * 两个上下文都须是当前scope已登记且无未确认保存的结果；合并结果沿用原基线的查询来源用于后续保存核验。
   */
  public appendQueryResult(base: DataSpaceQueryContext, addition: DataSpaceQueryContext): DataSpaceQueryContext {
    const scope = this.currentScope(), origin = this.#queryOrigins.get(base)
    const owner = this.#contexts.get(base)
    if (!origin || owner === undefined || owner !== this.#contexts.get(addition)
      || owner !== this.resourceKey(scope, origin.identity)) throw new Error('SPARK_APPEND_OWNER: 增量结果或原基线不属于当前运行owner')
    if (this.#unconfirmed.has(base) || this.#unconfirmed.has(addition)) throw new Error('SPARK_APPEND_UNCONFIRMED: 原基线存在未确认保存，须先核验')
    base.assertIdentity(origin.identity)
    const next = base.withAppendedRows(addition)
    this.assertScope(scope)
    this.#contexts.set(next, owner); this.#queryOrigins.set(next, origin)
    return next
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
