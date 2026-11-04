/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/data-space-runtime-api
 * 职责：拥有模型查询与统一保存的运行入口。
 * 边界：只接受当前 scope 中本 owner 登记的原查询基线。
 * AI用途：把 SparkData.DataView 查询与同场景模型保存接入实际运行 owner。
 */
/** 数据空间运行态 API；按场景与模型 Name 拥有原查询、权限基线和统一保存。 */
import * as SparkData from '@spark-appworks/spark-data'
import { isRecord, type HttpClientBase } from '@spark-appworks/spark-utils'
import type { DataSpaceQueryIdentity, DataSpaceQueryOptions, DataSpaceRequestScope, DataSpaceQueryProjection } from './data-space-runtime-contract.js'
import { DataSpaceQueryCache } from './query/data-space-query-cache.js'
import { DataSpaceRequest, DataSpaceSaveUnconfirmedError } from './protocol/data-space-request.js'
import { DataSpaceQueryTable } from './protocol/data-space-query-table.js'
import { captureDataSpaceViewQuery } from './query/data-space-query-options.js'
import { DataSpaceDesignApi } from '../design/data-space-design-api.js'
import { DataSpaceQueryContext } from './query/data-space-query-context.js'
import { DataSpaceRequestConfig } from './protocol/data-space-request-config.js'
import { DataSpaceSourceInput } from './query/data-space-source-input.js'
import { DataSpaceQueryAggregation } from './query/data-space-query-aggregation.js'
import {DataSpaceQueryGraph} from './query/data-space-query-graph'

/** 运行 owner 的 HTTP 通道和请求身份读取器；scope 变更使旧基线失效。 */
type DataSpaceRuntimeApiOptions = Readonly<{
  http: HttpClientBase
  readScope: () => DataSpaceRequestScope
}>
/** 统一保存命令；每个目标携带本 owner 的原查询上下文与候选变更。 */
type DataSpaceRuntimeSaveChange = Parameters<DataSpaceRequest['save']>[0]['changes'][number]
  & Readonly<{tableConfig?: Pick<SparkData.TableMetadata, 'api' | 'crudConfig'>}>
type DataSpaceRuntimeSaveCommand = Readonly<{
  changes: readonly DataSpaceRuntimeSaveChange[]
  signal?: AbortSignal
}>
/** 实际保存回执和推进后的独立上下文；失败不产生确认结果。 */
type DataSpaceRuntimeSaveResult = Awaited<ReturnType<DataSpaceRequest['save']>>
type DataSpaceRuntimeUnconfirmed = Readonly<{signature: string; contexts: ReadonlySet<DataSpaceQueryContext>}>
type DataSpaceQueryWithConfigInput = Readonly<{
  /** 正式子查询解析产生的本次只读投影与模型图守卫。 */
  projection?: DataSpaceQueryProjection
  identity: DataSpaceQueryIdentity
  options: DataSpaceQueryOptions
  config: DataSpaceRequestConfig
  view?: SparkData.DataView
  accept?: (context: DataSpaceQueryContext) => void
  definition?: Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
}>
/** 未确认批次的核验输入：当前 scope、本次再提交的批次及其签名。 */
type DataSpaceRuntimeVerifyCommand = Readonly<{scope: string; changes: readonly DataSpaceRuntimeSaveChange[]
  pending: DataSpaceRuntimeUnconfirmed; signature: string}>
/** 单模型核验结论；applied 时 receipt 为回读行，可交原上下文接纳。 */
type DataSpaceRuntimeVerifyOutcome = Readonly<{state: 'applied' | 'absent' | 'unknown'
  requested: ReturnType<DataSpaceQueryContext['prepareSaveChanges']>
  receipt: Parameters<DataSpaceQueryContext['acceptSaveReceipt']>[0]['receipt']; queried?: DataSpaceQueryContext}>
type DataSpaceRuntimeQueryFlight = Promise<DataSpaceQueryContext>
type DataSpaceRuntimeQueryFlights = Set<DataSpaceRuntimeQueryFlight>
/** 来源类型改变时须仍成立的查询特征；由运行请求或持久视图配置提供。 */
type DataSpaceResourceQuery = Readonly<{
  /** mapped按模型取值定义解析；direct仅接口和逻辑视图接收来源实参。 */
  sourceInputMode?: SparkData.QueryParams['sourceInputMode']
  /** 本次输出包含显式聚合或分组。 */
  aggregate?: boolean
  /** 查询树参数或结果树组织实际参与查询。 */
  tree?: boolean
  /** 省略时沿用单表查询。 */
  outputType?: SparkData.QueryParams['outputType']
}>
/** 仅定位原生资源，不加载模型字段或查询业务数据。 */
type DataSpaceRuntimeQuerySource = Pick<Awaited<ReturnType<DataSpaceDesignApi['readModel']>>, 'sourceType' | 'sourceName'>

/** 拥有原查询缓存、保存基线归属和同模型读写串行化；SparkData.DataView 与 DataSet 消费同一实际保存 owner。 */
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
  readonly #models = new WeakMap<SparkData.DataTable, Readonly<{model: Awaited<ReturnType<DataSpaceDesignApi['readModel']>>; scope: string}>>()
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
    const resource = DataSpaceDesignApi.resolveTableResource(model).resourceType
    if (query.sourceInputMode === 'direct' && !['third-party-api', 'logical-view'].includes(resource)) {
      throw new Error('SPARK_SOURCE_INPUT: 直接来源入参仅适用于接口或逻辑视图模型')
    }
    if (query.aggregate && (!['database-table', 'database-view'].includes(resource)
      || query.tree || !['Table', 'Join'].includes(query.outputType ?? 'Table'))) {
      throw new Error('SPARK_QUERY_AGGREGATE: 当前资源或树查询尚不支持后端聚合分组')
    }
  }

  /** 查询后端注册模型；原结果上下文只供 SparkData.DataView 的执行边界持有。 */
  public query(identity: DataSpaceQueryIdentity, options: DataSpaceQueryOptions = {}): Promise<DataSpaceQueryContext> {
    return this.queryWithConfig({identity, options, config: DataSpaceRequestConfig.resolveQuery()})
  }

  /** 清除当前请求owner的查询结果；登录/应用切换、刷新及写入共用，不撤销已接纳的查询基线。 */
  public invalidateQueryCache(): void {this.queryCache.invalidateResults()}
  /** 页面释放沿SparkData.DataView生命周期清理页面级结果。 */
  public releaseQueryCache(page: object): void {this.queryCache.releaseResults(page)}

  private async queryWithConfig(input: DataSpaceQueryWithConfigInput, heldMutationKeys?: ReadonlySet<string>): Promise<DataSpaceQueryContext> {
    const {identity, options, config, view, accept, definition} = input
    const scope = this.currentScope()
    const normalized = new DataSpaceQueryTable(identity).identity
    const key = this.resourceKey(scope, normalized)
    const mutation = this.#mutationFlights.get(key)
    if (mutation !== undefined && !heldMutationKeys?.has(key)) await mutation
    this.assertScope(scope)
    const cacheType = view?.queryConfig.cacheType
    const cache = view && cacheType && cacheType !== 'none' ? {
      ...(cacheType === 'page' ? {page: view.dataSet ?? view} : {}),
      definition: [view.viewId, view.dataTable?.modelBinding, view.treeConfig, definition],
      isCurrent: () => !view.isDestroyed() && !view.dataSet?.destroyed,
      ...(accept === undefined ? {} : {accept}),
    } : undefined
    const flight = this.queryCache.query({
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
      if (cache === undefined) accept?.(context)
      this.assertScope(scope)
      this.#contexts.set(context, key)
      this.#queryOrigins.set(context, {identity: normalized, options, config, ...(accept === undefined ? {} : {accept}), ...(definition === undefined ? {} : {definition})})
      return context
    } finally {
      flights.delete(flight)
      if (flights.size === 0 && this.#queryFlights.get(key) === flights) this.#queryFlights.delete(key)
      this.assertScope(scope)
    }
  }

  /**
   * 将正式模型及当前请求scope绑定到SparkData.DataTable，所属派生视图复用同一身份；scope失效须重新装配。
   * 正式数组可提供已解析且投影的items；仅本地读取，元数据保存仍走正式模型查询。
   */
  public bindModelView(view: SparkData.DataView, model: Awaited<ReturnType<DataSpaceDesignApi['readModel']>>, arrayRows?: readonly SparkData.DataRow[]): void {
    const table = view.dataTable
    if (table?.modelBinding?.modelId !== model.id || table.modelBinding.modelName !== model.metaName) {
      throw new Error('SPARK_VIEW_MODEL_IDENTITY: 视图与正式模型身份不一致')
    }
    const formal = new Set(DataSpaceDesignApi.resolveFields(model).map(field => field.canonicalName))
    DataSpaceRequestConfig.validate(table)
    for (const column of table.columns) {
      if (column.computeExpression && formal.has(column.name)) {
        throw new Error(`SPARK_MODEL_COMPUTED_COLLISION: 本地计算列与正式字段重名: ${column.name}`)
      }
    }
    const previous = this.#models.get(table)
    if (previous) this.assertScope(previous.scope)
    if (previous && previous.model !== model && JSON.stringify(previous.model) !== JSON.stringify(model)) {
      throw new Error('SPARK_VIEW_MODEL_IDENTITY: 同一SparkData.DataTable不能绑定不同正式定义，请重新装配')
    }
    const scope = this.currentScope()
    if (view.fieldProjection.length === 0) {
      view.configure({fieldProjection: DataSpaceDesignApi.createFieldProjection(model)
        .filter(field => table.columns.some(column => column.name === field.resourceField))})
    }
    this.#models.set(table, {model, scope})
    if (model.sourceType === '数组') {
      if (arrayRows === undefined) throw new Error('正式数组缺少已读取的items')
      view.bindQueryExecutor(new SparkData.DataViewArrayQuery(view, arrayRows, () => this.assertScope(scope)))
      return
    }
    if (arrayRows !== undefined) throw new Error('只有数组模型可以绑定本地items')
    view.bindQueryExecutor(this)
  }

  /**
   * 正式查询自动补齐的树结构字段；合并渲染配置与显式查询依赖，不表示已获得读取权限。
   * @param view 所属视图；设计候选缺省读取其当前查询配置。
   * @param formalFields 正式输出字段，用于判断省略的父键和文本字段是否存在。
   * @param queryTree 本次查询捕获的树参数；省略时使用视图queryConfig.tree。
   * @returns 需要查询并核验可读性的模型输出字段名集合。
   */
  public static resolveTreeFields(view: SparkData.DataView, formalFields: ReadonlySet<string>,
    queryTree: SparkData.QueryParams['tree'] = view.queryConfig.tree): ReadonlySet<string> {
    const fields = new Set<string>()
    if (queryTree) {
      fields.add(queryTree.keyField)
      fields.add(queryTree.parentField)
    }
    const tree = view.treeConfig
    if (tree) {
      fields.add(tree.idField ?? 'id')
      if (tree.parentIdField !== undefined || formalFields.has('parentId')) {
        fields.add(tree.parentIdField ?? 'parentId')
      }
      const textField = tree.textField ?? 'name'
      if ((tree.textField !== undefined || formalFields.has(textField))
        && !view.dataTable?.columns.some(column => column.name === textField && Boolean(column.computeExpression))) {
        fields.add(textField)
      }
    }
    return fields
  }

  /**
   * 从本运行owner绑定的正式模型解析查询字段，供SparkData.DataView.queryColumns统一消费。
   * 字段名为规范输出名；不受命名视图显示投影限制，不包含非输出或本地计算列，也不授予数据权限。
   * 未绑定正式模型的既有原生查询仍使用其SparkData.DataTable字段，生命周期由SparkData.DataView保护。
   */
  public queryColumns(view: SparkData.DataView): readonly SparkData.DataColumn[] {
    const table = view.dataTable, binding = table ? this.#models.get(table) : undefined
    if (view.destroyed || !table) throw new Error('SPARK_VIEW_MODEL_IDENTITY: 查询字段视图已失效')
    if (!binding) return table.columns
    this.assertScope(binding.scope)
    if (table.modelBinding?.modelId !== binding.model.id || table.modelBinding.modelName !== binding.model.metaName) {
      throw new Error('SPARK_VIEW_MODEL_IDENTITY: 查询字段模型身份已变化')
    }
    const outputs = new Set(DataSpaceDesignApi.resolveOutputFields(binding.model).map(field => field.canonicalName))
    return table.columns.filter(column => outputs.has(column.name))
  }

  /** 命名视图选择正式输出，安全聚合及显式分组由GetData执行；不改模型永久定义。 */
  public async executeQuery(view: SparkData.DataView, params: SparkData.QueryParams): Promise<DataSpaceQueryContext> {
    if (params.parentResult) {
      const binding = this.prepareParentQuery(view, params)
      await SparkData.DataViewParentResult.request(view)
      this.assertScope(binding.scope)
      const source = SparkData.DataViewParentResult.resolve(view)
      if (!source) throw new Error('SPARK_PARENT_MODEL: 父来源不存在')
      const result = source.readChildResult(params.parentResult.childModelName)
      if (!(result instanceof DataSpaceQueryContext)) throw new Error('SPARK_PARENT_OWNER: 父结果不属于正式查询owner')
      result.assertIdentity({scenarioId: view.dataSet?.scenarioId ?? '', metaName: binding.model.metaName})
      result.bindFormalModel(binding.model)
      return result
    }
    return this.queryWithConfig(this.prepareQuery(view, params))
  }

  private prepareParentQuery(view: SparkData.DataView, params: SparkData.QueryParams) {
      SparkData.DataViewParentResult.validateRequest(view, params)
      const binding = view.dataTable ? this.#models.get(view.dataTable) : undefined
      if (!binding) throw new Error('SPARK_PARENT_MODEL: 父来源需要正式目标模型绑定')
      this.assertScope(binding.scope)
      const expected = DataSpaceDesignApi.createFieldProjection(binding.model)
        .filter(field => view.dataTable?.columns.some(column => column.name === field.resourceField))
      SparkData.DataViewParentResult.validateProjection(view, expected)
      return binding
  }

  private prepareQuery(view: SparkData.DataView, params: SparkData.QueryParams,
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
    const outputFields = DataSpaceDesignApi.resolveOutputFields(model)
    const requestField = (output: string): string => {
      const field = outputFields.find(candidate => candidate.canonicalName === output)
      if (!field) throw new Error(`SPARK_MODEL_FIELD_UNRESOLVED: ${output}`)
      return field.name
    }
    // 服务端过滤可引用不输出的模型字段；输出投影仍只解析输出字段。
    const modelFields = DataSpaceDesignApi.resolveFields(model)
    const filterField = (name: string): string => {
      const field = modelFields.find(candidate => candidate.canonicalName === name)
      if (!field) throw new Error(`SPARK_MODEL_FIELD_UNRESOLVED: ${name}`)
      return field.name
    }
    const filterTree = (tree: SparkData.DataViewFilterTree): SparkData.DataViewFilterTree => 'logic' in tree
      ? {...tree, filters: tree.filters.map(filterTree)} : {...tree, field: filterField(tree.field)}
    const toFilter = (tree: SparkData.DataViewFilterTree): SparkData.DataViewFilter => 'logic' in tree ? SparkData.DataViewFilter.group(tree) : SparkData.DataViewFilter.condition(tree)
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
    const sqlResource = ['database-table', 'database-view'].includes(DataSpaceDesignApi.resolveTableResource(model).resourceType)
    DataSpaceRuntimeApi.validateResourceQuery(model, {aggregate: requestedAggregate || requestedGroups.length > 0,
      tree: options.tree !== undefined || treeFields.size > 0, outputType: options.outputType})
    const aggregateResult = sqlResource && options.tree === undefined && ['Table', 'Join'].includes(options.outputType ?? 'Table')
      && (requestedAggregate || groups.size > 0 || outputFields.some(field => {
        if (!fields?.some(selected => selected.name === field.name)) return false
        const raw = field.raw['ValueFun'] ?? field.raw['valueFun']
        const value = typeof raw === 'string' ? DataSpaceDesignApi.parseValueFunction(raw) : raw
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
    return {
      ...(join === undefined ? {} : {projection: join.projection}),
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
  public validateQueryDefinitions(dataSet: SparkData.DataSet): void {
    const plans = new Map<SparkData.DataView, DataSpaceQueryProjection['nested']>()
    const resolve = (view: SparkData.DataView): DataSpaceQueryProjection['nested'] => {
      if (plans.has(view)) return plans.get(view)
      const params = SparkData.DataViewQuery.capture(view.queryConfig)
      let plan: DataSpaceQueryProjection['nested']
      if (params.parentResult) {
        const binding = this.prepareParentQuery(view, params)
        const parent = SparkData.DataViewParentResult.resolve(view)
        const upstream = parent && resolve(parent)
        const children = upstream?.root.children.filter(node => node.model.metaName === params.parentResult?.childModelName) ?? []
        if (!upstream || children.length !== 1 || children[0]?.model.id !== binding.model.id) {
          throw new Error('SPARK_PARENT_PLAN: 指定父视图没有对应的直接子结果计划')
        }
        plan = {mode: upstream.mode, root: children[0]}
      } else {
        const prepared = this.prepareQuery(view, {...params,
          ...(view.filterExpression === undefined ? {} : {filter: view.filterExpression}),
          ...(view.sortExpression === undefined ? {} : {sort: SparkData.DataViewQuery.serializeSort(view.sortExpression)})},
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

  /** 原保存请求已发出但结果未确认；SparkData.DataView 据此只允许经原保存入口核验。 */
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
    const changes = command.changes.map(change => ({ ...change,
      identity: new DataSpaceQueryTable(change.identity).identity, changes: structuredClone(change.changes) }))
    const signature = JSON.stringify(changes.map(change => ({identity: change.identity, changes: change.changes})))
    const pending = changes.map(change => this.#unconfirmed.get(change.context)).find(item => item !== undefined)
    if (pending) return this.verifyUnconfirmed({scope, changes, pending, signature})
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
      try {receipts = await this.#saveRequest.save({ changes, config, ...(signal === undefined ? {} : { signal }) })}
      catch (error) {
        if (error instanceof DataSpaceSaveUnconfirmedError) {
          const record = Object.freeze({signature, contexts: new Set(changes.map(change => change.context))})
          for (const change of changes) this.#unconfirmed.set(change.context, record)
        }
        throw error
      }
      finally {this.invalidateQueryCache()}
      this.assertScope(scope)
      for (const [index, receipt] of receipts.entries()) {
        const change = changes[index]
        if (change === undefined) throw new Error('SPARK 保存缺少基线目标')
        this.#contexts.delete(change.context)
        this.#contexts.set(receipt.context, this.resourceKey(scope, change.identity))
        const origin = this.#queryOrigins.get(change.context)
        if (origin) this.#queryOrigins.set(receipt.context, origin)
        if (receipt.added.length && receipt.context.hasPendingSavedRowPermissions) {
          try {
            const context = await this.refreshSavedPermissions(receipt.context, change.identity, scope, new Set(keys), receipt.added.map(row => receipt.context.rowKey(row)))
            receipts[index] = {...receipt, context, added: receipt.added.map(row => context.rows.find(queried =>
              Object.is(context.rowKey(queried), receipt.context.rowKey(row))) ?? row)}
          }
          catch {this.assertScope(scope)} // 写回执已确认；行权限读取失败保留只读待恢复状态，不重新提交。
        }
      }
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

  /**
   * 核验未确认的原批次：按正式主键回读，新增须存在、修改字段须一致、删除须不存在。
   * 全部生效以回读行形成回执；全部未生效则解除待核验并保留草稿；部分生效或无法按主键核验时保持待核验。
   */
  private async verifyUnconfirmed(command: DataSpaceRuntimeVerifyCommand): Promise<DataSpaceRuntimeSaveResult> {
    const {scope, changes, pending, signature} = command
    if (signature !== pending.signature || changes.length !== pending.contexts.size || changes.some(change => !pending.contexts.has(change.context))) {
      throw new Error('SPARK_SAVE_UNCONFIRMED: 请先核验原提交，不能夹带另一批修改')
    }
    changes.forEach(change => this.assertContextOwner(scope, change))
    const outcomes = await Promise.all(changes.map(change => this.verifyChange(change)))
    this.assertScope(scope)
    if (outcomes.every(outcome => outcome.state === 'applied')) {
      for (const context of pending.contexts) this.#unconfirmed.delete(context)
      this.invalidateQueryCache()
      return changes.map((change, index) => {
        const outcome = outcomes[index]
        if (!outcome) throw new Error('save outcome missing for change')
        let receipt = change.context.acceptSaveReceipt({requested: outcome.requested, receipt: outcome.receipt})
        this.#contexts.delete(change.context)
        this.#contexts.set(receipt.context, this.resourceKey(scope, change.identity))
        const origin = this.#queryOrigins.get(change.context)
        if (origin) this.#queryOrigins.set(receipt.context, origin)
        if (outcome.queried && receipt.added.length) {
          try {
            const context = receipt.context.withSavedRowPermissions(outcome.queried, receipt.added.map(row => receipt.context.rowKey(row)))
            this.#contexts.delete(receipt.context); this.#contexts.set(context, this.resourceKey(scope, change.identity))
            if (origin) this.#queryOrigins.set(context, origin)
            receipt = {...receipt, context}
          } catch {this.assertScope(scope)}
        }
        return receipt
      })
    }
    if (outcomes.every(outcome => outcome.state === 'absent')) {
      for (const context of pending.contexts) this.#unconfirmed.delete(context)
      throw new Error('SPARK_SAVE_NOT_APPLIED: 原提交未生效，草稿已保留；可显式重新保存')
    }
    throw new Error('SPARK_SAVE_UNVERIFIABLE: 原提交部分生效或无法按主键核验，不能重新提交；请重新打开页面后查询实际结果')
  }

  private async verifyChange(change: DataSpaceRuntimeSaveChange): Promise<DataSpaceRuntimeVerifyOutcome> {
    const requested = change.context.prepareSaveChanges(structuredClone(change.changes))
    const keyField = change.context.resultPrimaryKey
    const key = (row: Readonly<Record<string, unknown>>): string => {
      const value = row[keyField]
      return value === undefined || value === null ? '' : String(value).trim()
    }
    const added = (requested.added ?? []).map(key), changed = requested.changed ?? [], deleted = (requested.deleted ?? []).map(key)
    const unknown = {state: 'unknown' as const, requested, receipt: {metaName: change.identity.metaName, added: [], changed: [], deleted: []}}
    if (!keyField || keyField === '_pk' || added.some(item => !item) || deleted.some(item => !item)) return unknown
    const keys = [...new Set([...added, ...changed.map(key), ...deleted])]
    if (keys.some(item => !item)) return unknown
    const origin = this.#queryOrigins.get(change.context)
    const {sort, tree, ...base}: DataSpaceQueryOptions = origin?.options ?? {}
    const requestKey = origin?.definition?.fields.find(field => field.canonicalName === keyField)?.name ?? keyField
    const fields = base.fields === undefined || base.fields.some(field => (typeof field === 'string' ? field : field.name) === requestKey)
      ? base.fields : [...base.fields, requestKey]
    void sort; void tree
    const context = await this.queryWithConfig({
      identity: change.identity,
      options: {...base, ...(fields === undefined ? {} : {fields}), filter: SparkData.DataViewFilter.condition({field: requestKey, operator: 'in', value: keys}),
        pagination: 'paged', page: {index: 1, size: Math.max(keys.length, 1)}, allPages: true, maxRows: keys.length + 1, singleFlight: false},
      config: origin?.config ?? DataSpaceRequestConfig.resolveQuery(),
      ...(origin?.accept === undefined ? {} : {accept: origin.accept}),
      ...(origin?.definition === undefined ? {} : {definition: origin.definition}),
    })
    if (context.rows.some(row => !keys.includes(key(row)))) return unknown
    const found = new Map(context.rows.map(row => [String(context.rowKey(row) ?? '').trim(), row]))
    if (found.size !== context.rows.length || context.total !== context.rows.length) return unknown
    const same = (left: unknown, right: unknown) => Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right)
    const states = [
      ...added.map(item => found.has(item) ? 'applied' : 'absent'),
      ...changed.map(row => {
        const actual = found.get(key(row))
        const changedFields = Object.keys(row).filter(field => field !== keyField)
        if (!actual || changedFields.some(field => !Object.hasOwn(actual, field))) return 'unknown'
        const equal = changedFields.filter(field => same(actual[field], row[field])).length
        return equal === changedFields.length ? 'applied' : equal === 0 ? 'absent' : 'unknown'
      }),
      ...deleted.map(item => found.has(item) ? 'absent' : 'applied'),
    ]
    const state = states.every(item => item === 'applied') ? 'applied' : states.every(item => item === 'absent') ? 'absent' : 'unknown'
    return {state, requested, queried: context, receipt: {metaName: change.identity.metaName,
      added: added.map(item => found.get(item) ?? {}), changed: changed.map(row => found.get(key(row)) ?? {}),
      deleted: [...(requested.deleted ?? [])]}}
  }

  private async refreshSavedPermissions(context: DataSpaceQueryContext, identity: DataSpaceQueryIdentity, scope: string,
    heldMutationKeys?: ReadonlySet<string>, targetIds?: readonly unknown[]): Promise<DataSpaceQueryContext> {
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
      options: {...base, ...(fields === undefined ? {} : {fields}), filter: SparkData.DataViewFilter.condition({field: requestKey, operator: 'in', value: ids}),
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
    return this.refreshSavedPermissions(context, origin.identity, this.currentScope())
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
