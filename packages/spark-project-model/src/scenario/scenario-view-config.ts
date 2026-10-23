/**
 * @module @spark-appworks/spark-project-model:scenario/scenario-view-config
 * 职责：单场景视图配置的校验和不可变值。
 * 边界：后端模型真源与运行数据不属于此文件，显式文件资源须由已有owner承接。
 * AI用途：校验模型绑定或文件资源、命名视图与显式级联。
 */
import * as SparkData from '@spark-appworks/spark-data'
import { isRecord } from '@spark-appworks/spark-utils'

/** 只读JSON配置对象，构造时校验并递归冻结。 */
type ScenarioConfigObject = Readonly<Record<string, unknown>>
/** 旧来源扩展仅供导入；原生结构保留完整关系，来源标识只用于追踪。 */
type ScenarioResourceRelation = Readonly<Pick<SparkData.DataResourceRelation, 'parentTable' | 'childTable' | 'relationName' | 'cascadeUpdate'> & {sourceRelationId: string}>
  | Readonly<SparkData.DataResourceRelation & {relationId: string}>
/** 目录依赖只消费关系身份与端点；不代表完整运行关系或过滤表达式已转换。 */
type ScenarioRelationEndpoint = Pick<SparkData.DataResourceRelation, 'relationId' | 'sourceRelationId' | 'parentTable' | 'childTable' | 'relationName' | 'cascadeUpdate'>
/** 已读正式关系的依赖投影；仅用于选取运行范围，不是可保存的关系配置。 */
type ScenarioRelationDependency = Readonly<ScenarioRelationEndpoint & {
  /** 关系值函数明确引用的配置表键；未解析的原引用保留以便范围校验报错，不作模型字段或保存数据。 */
  referencedTables: readonly string[]
}>

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} 必须是对象`)
  return value
}

function name(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} 必须是非空字符串`)
  return value.trim()
}

function keys(value: ScenarioConfigObject, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${path}.${key} 不属于场景视图配置`)
}

function optionalBoolean(value: ScenarioConfigObject, key: string, path: string): void {
  if (key in value && typeof value[key] !== 'boolean') throw new Error(`${path}.${key} 必须是布尔值`)
}

function freezeJson(value: unknown): void {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('场景配置不能包含非有限数值')
  if (value === null || typeof value !== 'object') return
  Object.values(value).forEach(freezeJson)
  Object.freeze(value)
}

function configObjects(value: unknown): ScenarioConfigObject[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is ScenarioConfigObject => isRecord(item))
}

/** reverseLookups省略时随viewValidation；inheritedGroups省略时使用本配置的模型关系。 */
type SelectTablesInput = Readonly<{
  tableNames: readonly string[]
  viewValidation: boolean
  reverseLookups?: boolean
  inheritedGroups?: ReadonlyArray<readonly string[]>
}>

/** 场景配置：后端模型仅保存绑定和字段约束；显式文件资源保存列定义，由资源owner提供查询与保存，配置不授予权限或包含运行数据。 */
export class ScenarioViewConfig {
  static readonly #viewProperties = Object.freeze<Record<keyof Omit<SparkData.ViewMetadata, 'tableName' | 'viewId' | 'rows'>, true>>({
    onRequestComplete: true,
    fieldProjection: true, queryContext: true, queryConfig: true, filterExpression: true, sortExpression: true,
    autoCurrentFirst: true, autoSelectFirst: true, page: true, pageSize: true, treeConfig: true,
    valueField: true, labelField: true, selectionDelimiter: true, autoLoad: true, commitMode: true, aggregates: true,
    allowDelete: true, lockCurrentWhilePending: true,
  })
  readonly #scenarioId: string
  readonly #config: ScenarioConfigObject
  readonly #resourceRelations: readonly ScenarioResourceRelation[]
  readonly #usesNativeResourceRelations: boolean

  /** 只判定正式视图定义的顶层属性；属性内容及正式字段引用仍须继续验证。 */
  public static isViewProperty(key: string): boolean {
    return typeof key === 'string' && Object.hasOwn(ScenarioViewConfig.#viewProperties, key)
  }

  /** 校验明确场景的合法配置JSON，冻结配置且拒绝复制后端模型定义或存入运行数据。 */

  public constructor(scenarioId: string, text: string) {
    this.#scenarioId = name(scenarioId, 'scenarioId')
    const input: unknown = JSON.parse(text)
    const config = record(input, 'pagedata')
    this.#usesNativeResourceRelations = typeof config['schemaVersion'] === 'number' && config['schemaVersion'] >= 2
      && Object.hasOwn(config, 'resourceRelations')
    keys(config, ['scenarioId', 'tables', 'resourceRelations', 'viewCascades', 'schemaVersion', 'version', 'saveChanges', 'layout'], 'pagedata')
    if (name(config['scenarioId'], 'pagedata.scenarioId') !== this.#scenarioId) throw new Error('pagedata 不属于当前场景')
    const tables = record(config['tables'], 'tables')
    if ('schemaVersion' in config && (typeof config['schemaVersion'] !== 'number'
      || !Number.isSafeInteger(config['schemaVersion']) || config['schemaVersion'] <= 0)) {
      throw new Error('pagedata.schemaVersion 必须是正安全整数')
    }
    if ('version' in config && (typeof config['version'] !== 'number'
      || !Number.isSafeInteger(config['version']) || config['version'] < 0)) {
      throw new Error('pagedata.version 必须是非负安全整数')
    }
    if ('saveChanges' in config) {
      const save = record(config['saveChanges'], 'pagedata.saveChanges')
      keys(save, ['mode'], 'pagedata.saveChanges')
      if ('mode' in save && save['mode'] !== 'perView') throw new Error('pagedata.saveChanges.mode 仅支持 perView')
    }
    if ('layout' in config) {
      const layout = record(config['layout'], 'pagedata.layout')
      keys(layout, ['tablePositions', 'modelPositions', 'unboundNodes', 'unboundEdges'], 'pagedata.layout')
      if ('unboundEdges' in layout) for (const [id, value] of Object.entries(record(layout['unboundEdges'], 'pagedata.layout.unboundEdges'))) {
        if (name(id, 'pagedata.layout.unboundEdges') !== id) throw new Error('待配置连线身份不能含首尾空白')
        if (Array.isArray(config['resourceRelations']) && config['resourceRelations'].some(relation => isRecord(relation) && relation['relationId'] === id)) {
          throw new Error('待配置连线与正式关系身份冲突')
        }
        const edge = record(value, `pagedata.layout.unboundEdges.${id}`)
        keys(edge, ['source', 'target'], `pagedata.layout.unboundEdges.${id}`)
        for (const key of ['source', 'target']) if (name(edge[key], `pagedata.layout.unboundEdges.${id}.${key}`) !== edge[key]) {
          throw new Error('待配置连线端点不能含首尾空白')
        }
      }
      for (const key of ['tablePositions', 'modelPositions', 'unboundNodes']) {
        if (!(key in layout)) continue
        const positions = record(layout[key], `pagedata.layout.${key}`)
        for (const [id, value] of Object.entries(positions)) {
          if (key === 'tablePositions' && !Object.hasOwn(tables, id)) throw new Error(`pagedata.layout 未知表: ${id}`)
          if (name(id, `pagedata.layout.${key}`) !== id) throw new Error(`pagedata.layout.${key} 身份不能含首尾空白`)
          const position = record(value, `pagedata.layout.${key}.${id}`)
          keys(position, key === 'unboundNodes' ? ['label', 'x', 'y'] : ['x', 'y'], `pagedata.layout.${key}.${id}`)
          if (key === 'unboundNodes') name(position['label'], `pagedata.layout.${key}.${id}.label`)
          for (const axis of ['x', 'y']) {
            if (typeof position[axis] !== 'number' || !Number.isFinite(position[axis])) {
              throw new Error(`pagedata.layout.${key}.${id}.${axis} 必须是有限数值`)
            }
          }
        }
      }
    }
    for (const [tableName, inputTable] of Object.entries(tables)) {
      name(tableName, 'tableName')
      const table = record(inputTable, `tables.${tableName}`)
      const file = table['resourceType'] === 'file'
      keys(table, ['businessCategory', 'columns', 'views', ...(file ? ['resourceType', 'resourceId'] : ['modelBinding', 'api', 'crudConfig'])], `tables.${tableName}`)
      this.validateRequests(table, `tables.${tableName}`)
      if ('businessCategory' in table && (typeof table['businessCategory'] !== 'string'
        || !table['businessCategory'].trim())) {
        throw new Error(`tables.${tableName}.businessCategory 必须是非空字符串`)
      }
      if (file) {
        if (name(table['resourceId'], `${tableName}.resourceId`) !== table['resourceId']) throw new Error(`${tableName}.resourceId 不能含首尾空白`)
        this.validateColumns(table['columns'], `tables.${tableName}.columns`, true)
      } else {
        const binding = record(table['modelBinding'], `${tableName}.modelBinding`)
        keys(binding, ['modelId', 'modelName'], `${tableName}.modelBinding`)
        name(binding['modelId'], `${tableName}.modelId`)
        name(binding['modelName'], `${tableName}.modelName`)
        if ('columns' in table) this.validateColumns(table['columns'], `tables.${tableName}.columns`)
      }
      const views = record(table['views'], `${tableName}.views`)
      if (!Object.hasOwn(views, 'default')) throw new Error(`${tableName} 缺少 views.default`)
      for (const [viewId, view] of Object.entries(views)) {
        name(viewId, 'viewId')
        this.validateView(record(view, `${tableName}@${viewId}`), `${tableName}@${viewId}`)
      }
    }
    if ('viewCascades' in config) {
      if (!Array.isArray(config['viewCascades'])) throw new Error('viewCascades 必须是数组')
      for (const item of config['viewCascades']) {
        const cascade = record(item, 'viewCascades')
        if (cascade['kind'] !== 'field') this.validateCascade(cascade, tables)
      }
      const fields = SparkData.DataViewFieldCascadeDefinition.validateAll(config['viewCascades'])
      SparkData.DataViewQueryCascadeInputs.validateAll(config['viewCascades'])
      SparkData.DataViewFieldCascadeDefinition.validateViews(fields, (tableName, viewId) => {
        const table = tables[tableName]
        return isRecord(table) && isRecord(table['views']) && Object.hasOwn(table['views'], viewId)
      })
    }
    this.#resourceRelations = this.parseResourceRelations(config['resourceRelations'], tables)
    freezeJson(this.#resourceRelations)
    freezeJson(config)
    this.#config = config
    Object.freeze(this)
  }

  public get scenarioId(): string { return this.#scenarioId }
  public toJSON(): ScenarioConfigObject { return this.#config }

  /**
   * 列出当前场景内仍引用指定模型绑定的配置路径，供删除预览和存储适配共同校验。
   * 所属视图与局部配置随模型删除；外部页面不在此文件内，不能据此声明没有外部消费者。
   * 不读取业务行或数据库字段，不把常量文本解释为模型引用。
   */
  public getTableRemovalReferences(tableName: string): readonly string[] {
    const tables = record(this.#config['tables'], 'tables'), target = record(tables[tableName], tableName)
    const modelName = target['resourceType'] === 'file' ? tableName : record(target['modelBinding'], 'modelBinding')['modelName']
    const references = new Set<string>()
    const filter = (value: unknown, path: string): void => {
      if (value === undefined) return
      const parsed = SparkData.DataViewFilter.parse(value)
      if (!parsed.ok) throw new Error(`${path} 无法检查引用`)
      if (parsed.value.referencedTableNames().includes(String(modelName))) references.add(path)
    }
    this.#resourceRelations.forEach((relation, index) => {
      if (this.relationTables(relation).includes(tableName)) references.add(`resourceRelations[${index}]`)
    })
    for (const [index, value] of configObjects(this.#config['viewCascades']).entries()) {
      const endpoints = value['kind'] === 'field'
        ? [value['tableName'], record(value['optionsView'], 'optionsView')['tableName'],
          ...configObjects(value['parents']).map(parent => parent['tableName'])]
        : [value['parentTable'], value['childTable']]
      if (endpoints.includes(tableName)) references.add(`viewCascades[${index}]`)
    }
    for (const [owner, input] of Object.entries(tables)) {
      if (owner === tableName) continue
      for (const [id, inputView] of Object.entries(record(record(input, owner)['views'], `${owner}.views`))) {
        const view = record(inputView, `${owner}@${id}`), path = `tables.${owner}.views.${id}`
        filter(view['filterExpression'], `${path}.filterExpression`)
        for (const lookup of view['queryConfig'] === undefined ? [] : SparkData.DataViewQuery.parse(view['queryConfig']).filterLookups ?? []) {
          const binding = SparkData.parseDataViewKey(lookup.sourceViewKey)
          if (binding?.scope === this.scenarioId && binding.tableName === modelName) references.add(`${path}.queryConfig.filterLookups`)
        }
        for (const field of configObjects(view['fieldProjection'])) {
          if (typeof field['valueFunction'] === 'string' && field['valueFunction'].trim()) {
            const value: unknown = JSON.parse(field['valueFunction'])
            filter({field: '_', operator: 'eq', value}, `${path}.fieldProjection.${String(field['viewField'])}.valueFunction`)
          }
        }
      }
    }
    const layout = this.#config['layout']
    if (isRecord(layout) && isRecord(layout['unboundEdges'])) for (const [id, edge] of Object.entries(layout['unboundEdges'])) {
      if (isRecord(edge) && [edge['source'], edge['target']].includes(this.getLayoutNodeKey(tableName))) references.add(`layout.unboundEdges.${id}`)
    }
    return Object.freeze([...references])
  }

  /**
   * 提取模型及原生关系、显式级联、辅助过滤引用的模型，供独立运行消费；保留这些模型的全部视图与请求配置。
   * 旧格式须先读取正式关系并提供依赖投影；未提供时保留完整配置。原文件不变；投影不能用作整份文件的保存载荷。
   * @param tableName 配置中的模型表键；不接受正式注册名替代或首表回退。
   * @param inherited 旧关系的完整端点及值函数模型引用；空集合表示已确认无旧关系，省略表示尚未确认。原生配置忽略此参数。
   * @returns 不可变运行配置；不会读取模型、查询业务数据或写入文件。
   */
  public selectModelScope(tableName: string, inherited?: readonly ScenarioRelationDependency[]): ScenarioViewConfig {
    const tables = record(this.#config['tables'], 'tables')
    if (!Object.hasOwn(tables, tableName)) throw new Error(`场景模型表不存在: ${tableName}`)
    if (!this.#usesNativeResourceRelations && inherited === undefined) return this
    const dependencies = this.#usesNativeResourceRelations ? undefined : this.resolveRelations(inherited ?? [],
      relation => ({...relation, referencedTables: this.relationTables(relation)}))
    const inheritedGroups = dependencies?.map(relation => [relation.parentTable, relation.childTable, ...relation.referencedTables])
    return this.selectTables(inheritedGroups === undefined
      ? {tableNames: [tableName], viewValidation: false}
      : {tableNames: [tableName], viewValidation: false, inheritedGroups})
  }

  /**
   * 为视图变更或新增模型绑定提取字段校验范围，包含级联与辅助查找的双向依赖，不读取未改动的模型关系。
   * @param previous 同空间原文件配置；已有模型不得删除或改绑，已有字段、关系和布局等结构必须保持不变。
   * @returns 无变更返回null；否则返回只用于校验并释放的配置，不得保存或作为整个空间的运行定义。
   * @throws 场景或非视图结构变化、相关查找引用无法定位时拒绝使用此入口。
   */
  public selectViewValidationScope(previous: ScenarioViewConfig): ScenarioViewConfig | null {
    const tables = record(this.#config['tables'], 'tables')
    const before = record(previous.toJSON()['tables'], 'tables')
    const without = (value: ScenarioConfigObject, key: string) => Object.fromEntries(Object.entries(value).filter(([entryKey]) => entryKey !== key))
    if (this.scenarioId !== previous.scenarioId
      || JSON.stringify(without(this.#config, 'tables')) !== JSON.stringify(without(previous.toJSON(), 'tables'))
      || Object.entries(before).some(([key, table]) => !Object.hasOwn(tables, key)
        || JSON.stringify(without(record(tables[key], key), 'views')) !== JSON.stringify(without(record(table, key), 'views')))) {
      throw new Error('视图校验不能提交模型、关系或其他结构变更')
    }
    const changed = Object.keys(tables).filter(key => !Object.hasOwn(before, key) || JSON.stringify(record(tables[key], key)['views'])
      !== JSON.stringify(record(before[key], key)['views']))
    return changed.length ? this.selectTables({tableNames: changed, viewValidation: true}) : null
  }

  /**
   * 级联定义增改只校验其模型/视图字段与相连级联、辅助查找；未改模型关系不触发旧格式转换。
   * @param previous 同空间原配置；只允许viewCascades变化，其他配置必须保持一致。
   * @returns 无变化或纯删除返回null；其余返回仅供校验的依赖投影，不能作为保存载荷或完整运行定义。
   * @throws 跨空间或混入模型、视图、关系等其他结构变化时拒绝。
   */
  public selectCascadeValidationScope(previous: ScenarioViewConfig): ScenarioViewConfig | null {
    const without = (config: ScenarioConfigObject) => Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'viewCascades'))
    if (this.scenarioId !== previous.scenarioId || JSON.stringify(without(this.#config)) !== JSON.stringify(without(previous.#config))) {
      throw new Error('级联校验不能提交模型、视图、关系或其他结构变更')
    }
    const changed = this.addedOrChanged(configObjects(this.#config['viewCascades']),
      configObjects(previous.#config['viewCascades']))
    return changed.length ? this.selectTables({tableNames: changed.flatMap(cascade => this.cascadeTables(cascade)), viewValidation: true}) : null
  }

  /**
   * 布局节点的正式身份：数据库模型用modelId，文件模型用绑定定义视图的空间/表复合主键。
   * @param tableName pagedata中的原生DataTable键。
   * @returns 可与DataView.getPkKey核对的节点键，不为文件资源生成后端模型ID。
   */
  public getLayoutNodeKey(tableName: string): string {
    const table = record(record(this.#config['tables'], 'tables')[tableName], tableName)
    return table['resourceType'] === 'file' ? [this.scenarioId, tableName].join('+')
      : name(record(table['modelBinding'], `${tableName}.modelBinding`)['modelId'], `${tableName}.modelId`)
  }

  /**
   * 为原生关系增改提取父子及值函数明确引用的模型；已完整解析来源的首次转换校验全部转换结果。
   * @param previous 同空间的原文件；只允许关系变化、首次schemaVersion升级及对应待配置连线的消耗。
   * @returns 仅删除或无变化返回null；局部配置只保留模型字段和临时默认视图，不得保存或作为整个空间的运行定义。
   * @throws 非关系结构变化、待配置连线端点不匹配或显式引用模型缺失时拒绝。
   */
  public selectRelationValidationScope(previous: ScenarioViewConfig): ScenarioViewConfig | null {
    if (this.scenarioId !== previous.scenarioId) throw new Error('关系校验不能跨空间提交结构变更')
    if (!this.#usesNativeResourceRelations) return this
    const tables = record(this.#config['tables'], 'tables')
    const expected: Record<string, unknown> = structuredClone(previous.#config)
    if (!previous.#usesNativeResourceRelations) expected['schemaVersion'] = 2
    expected['resourceRelations'] = this.#config['resourceRelations']
    const layout = expected['layout'], currentLayout = this.#config['layout']
    if (isRecord(layout) && isRecord(layout['unboundEdges'])) {
      const currentEdges = isRecord(currentLayout) && isRecord(currentLayout['unboundEdges']) ? currentLayout['unboundEdges'] : {}
      for (const [id, edge] of Object.entries(layout['unboundEdges'])) {
        if (Object.hasOwn(currentEdges, id)) continue
        const relation = this.#resourceRelations.find(item => 'relationId' in item && item.relationId === id)
        const parent = relation && this.getLayoutNodeKey(relation.parentTable)
        const child = relation && this.getLayoutNodeKey(relation.childTable)
        if (!relation || relation.sourceRelationId !== undefined || !isRecord(edge)
          || parent !== edge['source'] || child !== edge['target']) {
          throw new Error('关系校验不能提交无关的待配置连线结构变更')
        }
        Reflect.deleteProperty(layout['unboundEdges'], id)
      }
    }
    const properties = Object.keys(expected)
    if (properties.length !== Object.keys(this.#config).length || properties.some(key => JSON.stringify(expected[key]) !== JSON.stringify(this.#config[key]))) {
      throw new Error('关系校验不能提交模型、视图或其他结构变更')
    }
    const before = new Map((previous.#usesNativeResourceRelations ? previous.#resourceRelations : [])
      .map(relation => ['relationId' in relation ? relation.relationId : undefined, relation]))
    const changed = this.#resourceRelations.filter(relation => 'relationId' in relation
      && JSON.stringify(before.get(relation.relationId)) !== JSON.stringify(relation))
    if (!changed.length) return null
    const included = new Set(changed.flatMap(relation => this.relationTables(relation)))
    for (const table of included) if (!Object.hasOwn(tables, table)) throw new Error(`关系引用模型不存在: ${table}`)
    return new ScenarioViewConfig(this.#scenarioId, JSON.stringify({scenarioId: this.#scenarioId, schemaVersion: 2,
      tables: Object.fromEntries(Object.entries(tables).filter(([table]) => included.has(table))
        .map(([tableName, table]) => [tableName, {...record(table, tableName), views: {default: {}}}])),
      resourceRelations: changed, viewCascades: [],
    }))
  }

  /**
   * 原生绑定新增及稳定模型字段修改按模型全部视图、关系、级联、辅助过滤依赖校验；纯解除绑定核定配置引用。
   * @param previous 同空间原配置；原生绑定或文件模型的纯删除只核配置引用。同ID注册名及视图变更不强制转换未改旧关系。正式身份/资源换绑、旧格式结构变化及混合删除仍按各自边界校验。
   * @returns 仅供校验的配置；无变更返回null，不作为持久化内容。
   */
  public selectTableValidationScope(previous: ScenarioViewConfig): ScenarioViewConfig | null {
    if (this.scenarioId !== previous.scenarioId) throw new Error('模型校验不能跨空间提交结构变更')
    const native = this.#usesNativeResourceRelations && previous.#usesNativeResourceRelations
    const removed = Object.keys(record(previous.#config['tables'], 'tables')).filter(key => !Object.hasOwn(record(this.#config['tables'], 'tables'), key))
    if (removed.length && removed.every(key => native || record(record(previous.#config['tables'], 'tables')[key], key)['resourceType'] === 'file')) {
      const expected = structuredClone(previous.toJSON()), expectedTables = record(expected['tables'], 'tables')
      for (const key of removed) {
        const references = previous.getTableRemovalReferences(key)
        if (references.length) throw new Error(`模型仍有配置引用：${references.join('；')}`)
        Reflect.deleteProperty(expectedTables, key)
        const layout = expected['layout']
        if (isRecord(layout) && isRecord(layout['tablePositions'])) Reflect.deleteProperty(layout['tablePositions'], key)
      }
      // 仅解除已确认无引用的绑定及其坐标，不删除正式模型或读取未修改模型。
      if (JSON.stringify(expected) === JSON.stringify(this.#config)) return null
    }
    const tables = record(this.#config['tables'], 'tables'), before = record(previous.#config['tables'], 'tables')
    const withoutTables = (config: ScenarioConfigObject) => Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'tables'))
    if (JSON.stringify(withoutTables(this.#config)) !== JSON.stringify(withoutTables(previous.#config))) return this
    const changed = [...new Set([...Object.keys(tables), ...Object.keys(before)])].filter(key => JSON.stringify(tables[key]) !== JSON.stringify(before[key]))
    // 接口和调用策略已由构造边界的SparkData.FormalTableRequestConfig校验，不依赖模型字段或关系。
    if (!removed.length && Object.keys(tables).length === Object.keys(before).length && changed.every(key => {
      const next = tables[key], prior = before[key]
      if (!isRecord(next) || !isRecord(prior)) return false
      const definition = (table: ScenarioConfigObject) => Object.fromEntries(Object.entries(table).filter(([property]) => property !== 'api' && property !== 'crudConfig'))
      return JSON.stringify(definition(next)) === JSON.stringify(definition(prior))
    })) return null
    const sameModels = !removed.length && Object.keys(tables).length === Object.keys(before).length
      && changed.every(key => {
        const next = tables[key], prior = before[key]
        if (!isRecord(next) || !isRecord(prior)) return false
        const current = structuredClone(next), original = structuredClone(prior)
        Reflect.deleteProperty(current, 'views'); Reflect.deleteProperty(original, 'views')
        for (const property of ['api', 'crudConfig']) {Reflect.deleteProperty(current, property); Reflect.deleteProperty(original, property)}
        if (isRecord(current['modelBinding']) && isRecord(original['modelBinding'])
          && current['modelBinding']['modelId'] === original['modelBinding']['modelId']) {
          original['modelBinding']['modelName'] = current['modelBinding']['modelName']
        }
        return JSON.stringify(current) === JSON.stringify(original)
      })
    if (sameModels && changed.length) return this.selectTables({tableNames: changed, viewValidation: true})
    if (!native) return this
    if (!changed.length) return null
    if (changed.some(key => {
      const next = tables[key], prior = before[key]
      if (isRecord(next) && !Object.hasOwn(before, key)) return false
      if (!isRecord(next) || !isRecord(prior)) return true
      if (next['resourceType'] === 'file' && prior['resourceType'] === 'file' && next['resourceId'] === prior['resourceId']
        && next['modelBinding'] === undefined && prior['modelBinding'] === undefined) return false
      const identity = (table: ScenarioConfigObject) => Object.fromEntries(Object.entries(table)
        .filter(([property]) => !['columns', 'views', 'api', 'crudConfig'].includes(property)))
      return JSON.stringify(identity(next)) !== JSON.stringify(identity(prior))
    })) return this
    return this.selectTables({tableNames: changed, viewValidation: false, reverseLookups: true})
  }

  /**
   * 为多个定义资源的联合提交选取实际模型依赖，保留相关模型的全部视图、关系、级联和双向辅助查找。
   * @param previous 同空间原文件；原生v2可联合新增模型、解除无引用绑定及修改稳定模型的字段、请求、视图、关系、级联和布局。正式身份/资源换绑、旧格式与根级策略变更仍校验完整配置。
   * @returns 仅供校验的配置；只有布局/请求变化、无引用绑定解除或纯删除关系和级联时返回null。不得用投影覆盖完整文件。
   * @throws 空间身份变化、实际依赖或辅助查找无法定位时拒绝。
   */
  public selectDefinitionValidationScope(previous: ScenarioViewConfig): ScenarioViewConfig | null {
    if (this.scenarioId !== previous.scenarioId) throw new Error('定义校验不能跨空间提交结构变更')
    if (!this.#usesNativeResourceRelations || !previous.#usesNativeResourceRelations) return this
    const omit = (value: ScenarioConfigObject, excluded: readonly string[]) =>
      Object.fromEntries(Object.entries(value).filter(([key]) => !excluded.includes(key)))
    const domains = ['tables', 'resourceRelations', 'viewCascades', 'layout']
    if (JSON.stringify(omit(this.#config, domains)) !== JSON.stringify(omit(previous.#config, domains))) return this
    const tables = record(this.#config['tables'], 'tables'), before = record(previous.#config['tables'], 'tables')
    for (const key of Object.keys(before)) if (!Object.hasOwn(tables, key)) {
      const references = previous.getTableRemovalReferences(key)
      if (references.length) throw new Error(`模型仍有配置引用：${references.join('；')}`)
    }
    const changed = new Set<string>()
    for (const [key, value] of Object.entries(tables)) {
      if (!Object.hasOwn(before, key)) {changed.add(key); continue}
      const next = record(value, key), prior = record(before[key], key)
      const mutable = ['columns', 'views', 'api', 'crudConfig']
      if (JSON.stringify(omit(next, mutable)) !== JSON.stringify(omit(prior, mutable))) return this
      // 请求配置由构造合同校验；仅请求变化不要求重新读取模型字段。
      if (JSON.stringify(omit(next, ['api', 'crudConfig'])) !== JSON.stringify(omit(prior, ['api', 'crudConfig']))) changed.add(key)
    }
    for (const relation of this.addedOrChanged(this.#resourceRelations, previous.#resourceRelations)) {
      for (const table of this.relationTables(relation)) changed.add(table)
    }
    for (const cascade of this.addedOrChanged(configObjects(this.#config['viewCascades']),
      configObjects(previous.#config['viewCascades']))) {
      for (const table of this.cascadeTables(cascade)) changed.add(table)
    }
    return changed.size ? this.selectTables({tableNames: [...changed], viewValidation: false, reverseLookups: true}) : null
  }

  private addedOrChanged<T>(current: readonly T[], prior: readonly T[]): T[] {
    const remaining = new Map<string, number>()
    for (const item of prior) {const key = JSON.stringify(item); remaining.set(key, (remaining.get(key) ?? 0) + 1)}
    return current.filter(item => {
      const key = JSON.stringify(item), count = remaining.get(key) ?? 0
      if (!count) return true
      remaining.set(key, count - 1); return false
    })
  }

  private selectTables(input: SelectTablesInput): ScenarioViewConfig {
    const {tableNames, viewValidation, inheritedGroups} = input
    const reverseLookups = input.reverseLookups ?? viewValidation
    const tables = record(this.#config['tables'], 'tables')
    const relationGroups = viewValidation ? [] : inheritedGroups ?? this.#resourceRelations.map(relation => this.relationTables(relation))
    const cascades = configObjects(this.#config['viewCascades'])
    const cascadeGroups = cascades.map(cascade => this.cascadeTables(cascade))
    const included = new Set(tableNames)
    let previousSize = 0
    while (previousSize !== included.size) {
      previousSize = included.size
      for (const group of [...relationGroups, ...cascadeGroups]) {
        if (!group.some(table => included.has(table))) continue
        for (const table of group) {
          if (!Object.hasOwn(tables, table)) throw new Error(`场景模型依赖表不存在: ${table}`)
          included.add(table)
        }
      }
      for (const includedTable of reverseLookups ? Object.keys(tables) : included) {
        const views = record(record(tables[includedTable], includedTable)['views'], `${includedTable}.views`)
        for (const view of Object.values(views)) {
          const config = record(view, 'view')['queryConfig']
          for (const lookup of config === undefined ? [] : SparkData.DataViewQuery.parse(config).filterLookups ?? []) {
            const binding = SparkData.parseDataViewKey(lookup.sourceViewKey)
            const matches = Object.entries(tables).filter(([key, value]) => {
              const table = record(value, 'table')
              return (table['resourceType'] === 'file' ? key : record(table['modelBinding'], 'modelBinding')['modelName']) === binding?.tableName
            })
            const source = matches[0]
            // A changed lookup source also affects consumers; unrelated malformed references stay outside this operation.
            if (reverseLookups && !included.has(includedTable) && !matches.some(([table]) => included.has(table))) continue
            if (binding?.scope !== this.scenarioId || matches.length !== 1 || !source
              || !Object.hasOwn(record(record(source[1], 'table')['views'], 'views'), binding.viewId)) {
              throw new Error(`辅助过滤查找视图无法唯一定位: ${lookup.sourceViewKey}`)
            }
            included.add(source[0])
            if (reverseLookups) included.add(includedTable)
          }
        }
      }
    }
    const selected = (group: readonly string[] | undefined) => group?.some(table => included.has(table)) ?? false
    return new ScenarioViewConfig(this.#scenarioId, JSON.stringify({
      ...Object.fromEntries(Object.entries(this.#config).filter(([key]) => key !== 'layout')),
      ...(viewValidation ? {schemaVersion: 2} : {}),
      tables: Object.fromEntries(Object.entries(tables).filter(([table]) => included.has(table))),
      ...(viewValidation || Object.hasOwn(this.#config, 'resourceRelations') ? {
        resourceRelations: viewValidation ? [] : this.#resourceRelations.filter(relation => selected(this.relationTables(relation))),
      } : {}),
      viewCascades: cascades.filter((_, index) => selected(cascadeGroups[index])),
    }))
  }

  private cascadeTables(cascade: ScenarioConfigObject): string[] {
    return cascade['kind'] === 'field'
      ? [name(cascade['tableName'], 'viewCascades.tableName'),
        name(record(cascade['optionsView'], 'optionsView')['tableName'], 'optionsView.tableName'),
        ...configObjects(cascade['parents']).map(parent => name(parent['tableName'], 'parents.tableName'))]
      : [name(cascade['parentTable'], 'parentTable'), name(cascade['childTable'], 'childTable')]
  }

  private relationTables(relation: Pick<SparkData.DataResourceRelation, 'parentTable' | 'childTable'> & Partial<Pick<SparkData.DataResourceRelation, 'filterExpression'>>): string[] {
    const tables = [relation.parentTable, relation.childTable]
    const walk = (node: SparkData.DataViewFilterTree): void => {
      if ('logic' in node) {node.filters.forEach(walk); return}
      const value = node.value
      if (!isRecord(value)) return
      const key = value['Type'] === 'GetRefData' ? 'RefTableName'
        : value['Type'] === 'GetGroupData' ? 'GroupTableName'
          : value['Type'] === 'GetExpData' ? 'refTableName' : undefined
      if (key) tables.push(name(value[key], `resourceRelations.${key}`))
    }
    if (relation.filterExpression !== undefined) walk(relation.filterExpression)
    return tables
  }

  /** 仓内DataSet v2的完整关系配置；显式空数组保持为空，不再从旧数据库关系恢复。 */
  public get usesNativeResourceRelations(): boolean { return this.#usesNativeResourceRelations }

  /** 原生配置直接提供完整关系（包括空集合）；旧格式才合并当次来源，来源引用须唯一匹配ID及端点。不修改输入或旧库记录。 */
  public resolveResourceRelations(inherited: readonly SparkData.DataResourceRelation[]): SparkData.DataResourceRelation[] {
    return this.resolveRelations(inherited, relation => structuredClone(relation))
  }

  /**
   * 解析目录所需的关系端点，复用完整关系的来源扩展和冲突规则；不读取或改写字段、旧记录。
   * @param inherited 已核定正式身份并映射为绑定表名的旧关系端点；原生v2忽略此输入。
   * @returns 独立的端点投影；不包含过滤表达式，不可作为运行关系或保存定义使用。
   */
  public resolveResourceRelationEndpoints(inherited: readonly ScenarioRelationEndpoint[]): ScenarioRelationEndpoint[] {
    return this.resolveRelations(inherited, relation => ({parentTable: relation.parentTable, childTable: relation.childTable,
      ...(relation.relationId === undefined ? {} : {relationId: relation.relationId}),
      ...(relation.sourceRelationId === undefined ? {} : {sourceRelationId: relation.sourceRelationId}),
      ...(relation.relationName === undefined ? {} : {relationName: relation.relationName}),
      ...(relation.cascadeUpdate === undefined ? {} : {cascadeUpdate: relation.cascadeUpdate})}))
  }

  private resolveRelations<T extends ScenarioRelationEndpoint>(inherited: readonly T[], project: (relation: SparkData.DataResourceRelation) => T): T[] {
    if (this.#usesNativeResourceRelations) return this.#resourceRelations.map(relation => {
      if (!('filterExpression' in relation)) throw new Error('resourceRelations 原生关系必须包含完整过滤表达式')
      return project(relation)
    })
    const result = structuredClone([...inherited])
    for (const relation of this.#resourceRelations) {
      if ('filterExpression' in relation) {
        if (result.some(item => item.relationId === relation.relationId)) {
          throw new Error(`resourceRelations 关系ID冲突: ${relation.relationId}`)
        }
        result.push(project(relation))
      } else {
        const matches = result.filter(item => item.sourceRelationId === relation.sourceRelationId
          && item.parentTable === relation.parentTable && item.childTable === relation.childTable)
        const source = matches[0]
        if (!source || matches.length !== 1) {
          throw new Error(`resourceRelations 来源引用未唯一解析: ${relation.sourceRelationId}:${relation.parentTable}:${relation.childTable}`)
        }
        if (relation.relationName !== undefined) source.relationName = relation.relationName
        if (relation.cascadeUpdate !== undefined) source.cascadeUpdate = relation.cascadeUpdate
      }
    }
    return result
  }

  private parseResourceRelations(input: unknown, tables: ScenarioConfigObject): ScenarioResourceRelation[] {
    if (input === undefined) return []
    if (!Array.isArray(input)) throw new Error('resourceRelations 必须是数组')
    const identities = new Set<string>()
    return input.map((value, index) => {
      const path = `resourceRelations[${index}]`
      const item = record(value, path)
      const fromSource = !this.#usesNativeResourceRelations && 'sourceRelationId' in item
      keys(item, ['parentTable', 'childTable', 'relationName', 'cascadeUpdate', ...(fromSource
        ? ['sourceRelationId'] : ['relationId', 'filterExpression', 'cascadeDelete', ...(this.#usesNativeResourceRelations ? ['sourceRelationId'] : [])])], path)
      const identifier = (key: string): string => {
        const parsed = name(item[key], `${path}.${key}`)
        if (parsed !== item[key]) throw new Error(`${path}.${key} 必须是原始身份，不能含首尾空白`)
        return parsed
      }
      const parentTable = identifier('parentTable')
      const childTable = identifier('childTable')
      if (!Object.hasOwn(tables, parentTable) || !Object.hasOwn(tables, childTable)) throw new Error(`${path} 关系端点不存在`)
      const id = identifier(fromSource ? 'sourceRelationId' : 'relationId')
      const identity = JSON.stringify(fromSource ? ['source', id, parentTable, childTable] : ['native', id])
      if (identities.has(identity)) throw new Error(`${path} 重复关系或来源引用: ${id}`)
      identities.add(identity)
      if ('relationName' in item && typeof item['relationName'] !== 'string') throw new Error(`${path}.relationName 必须是字符串`)
      optionalBoolean(item, 'cascadeUpdate', path)
      const extensions = {
        ...(typeof item['relationName'] === 'string' ? {relationName: item['relationName']} : {}),
        ...(typeof item['cascadeUpdate'] === 'boolean' ? {cascadeUpdate: item['cascadeUpdate']} : {}),
      }
      if (fromSource) return {sourceRelationId: id, parentTable, childTable, ...extensions}
      optionalBoolean(item, 'cascadeDelete', path)
      if (!Object.hasOwn(item, 'filterExpression')) throw new Error(`${path}.filterExpression 必须存在`)
      const filter = SparkData.DataViewFilter.parse(item['filterExpression'])
      if (!filter.ok) throw new Error(`${path}.filterExpression: ${filter.issues.map(issue => issue.message).join('; ')}`)
      return {relationId: id, parentTable, childTable, filterExpression: filter.value.toJSON(), ...extensions,
        ...('sourceRelationId' in item ? {sourceRelationId: identifier('sourceRelationId')} : {}),
        ...(typeof item['cascadeDelete'] === 'boolean' ? {cascadeDelete: item['cascadeDelete']} : {})}
    })
  }

  private validateRequests(table: ScenarioConfigObject, path: string): void {
    SparkData.FormalTableRequestConfig.parse({api: table['api'], crudConfig: table['crudConfig']}, path)
  }

  private validateColumns(input: unknown, path: string, file = false): void {
    if (!Array.isArray(input)) throw new Error(`${path} 必须是数组`)
    const seen = new Set<string>()
    input.forEach((item, index) => {
      const columnPath = `${path}[${index}]`
      const column = record(item, columnPath)
      const local = Object.hasOwn(column, 'computeExpression')
      keys(column, ['name', 'required', 'minLength', 'maxLength', 'min', 'max', 'pattern', 'patternMessage',
        'trim', 'unique', 'immutable', 'optionsView', 'valueFunction',
        ...(local || file ? ['type', 'label', 'computeExpression'] : []),
        ...(file ? ['allowDBNull', 'defaultValue', 'isPrimaryKey', 'autoIncrement'] : [])], columnPath)
      const columnName = name(column['name'], `${columnPath}.name`)
      if (columnName !== column['name'] || seen.has(columnName)) throw new Error(`${columnPath}.name 必须是唯一的原始输出名`)
      if (local || file) {
        if (columnName === '_pk' || columnName.startsWith('lingma_sys_')) throw new Error(`${columnPath}.name 是框架控制字段`)
        name(column['type'], `${columnPath}.type`)
        if (local) name(column['computeExpression'], `${columnPath}.computeExpression`)
        if ('label' in column && typeof column['label'] !== 'string') throw new Error(`${columnPath}.label 必须是字符串`)
      }
      seen.add(columnName)
      optionalBoolean(column, 'required', columnPath)
      if (file) for (const key of ['allowDBNull', 'isPrimaryKey', 'autoIncrement']) optionalBoolean(column, key, columnPath)
      for (const key of ['minLength', 'maxLength']) {
        const value = column[key]
        if (key in column && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)) {
          throw new Error(`${columnPath}.${key} 必须是非负安全整数`)
        }
      }
      for (const key of ['min', 'max']) {
        const value = column[key]
        if (key in column && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error(`${columnPath}.${key} 必须是有限数值`)
      }
      if (typeof column['minLength'] === 'number' && typeof column['maxLength'] === 'number'
        && column['minLength'] > column['maxLength']) throw new Error(`${columnPath} 长度下界大于上界`)
      if (typeof column['min'] === 'number' && typeof column['max'] === 'number'
        && column['min'] > column['max']) throw new Error(`${columnPath} 数值下界大于上界`)
      for (const key of ['pattern', 'patternMessage']) {
        if (key in column && typeof column[key] !== 'string') throw new Error(`${columnPath}.${key} 必须是字符串`)
      }
      if (typeof column['pattern'] === 'string') {
        try { new RegExp(column['pattern']) } catch { throw new Error(`${columnPath}.pattern 正则表达式无效`) }
      }
      for (const key of ['unique', 'immutable']) optionalBoolean(column, key, columnPath)
      if ('trim' in column && column['trim'] !== 'reject' && column['trim'] !== 'normalize') throw new Error(`${columnPath}.trim 无效`)
      if ('optionsView' in column) {
        const options = this.validateOptionSource(column['optionsView'], `${columnPath}.optionsView`, ['context', 'fill'])
        for (const key of ['context', 'fill']) {
          if (!(key in options)) continue
          for (const [target, source] of Object.entries(record(options[key], `${columnPath}.optionsView.${key}`))) {
            name(target, `${columnPath}.optionsView.${key}`)
            name(source, `${columnPath}.optionsView.${key}.${target}`)
          }
        }
      }
      if ('valueFunction' in column) {
        const definitionPath = `${columnPath}.valueFunction`
        const definition = record(column['valueFunction'], definitionPath)
        keys(definition, ['format', 'capabilities', 'sources'], definitionPath)
        if (!['text', 'json', 'json-object'].includes(String(definition['format']))) throw new Error(`${definitionPath}.format 无效`)
        if ('capabilities' in definition && !(Array.isArray(definition['capabilities'])
          && definition['capabilities'].every(capability => ['huoshan', 'api-account', 'coze-auth'].includes(String(capability))))) {
          throw new Error(`${definitionPath}.capabilities 无效`)
        }
        if ('sources' in definition) {
          const sources = record(definition['sources'], `${definitionPath}.sources`)
          keys(sources, ['inputParams', 'apiPublicParams'], `${definitionPath}.sources`)
          for (const [key, source] of Object.entries(sources)) this.validateOptionSource(source, `${definitionPath}.sources.${key}`, [])
        }
      }
    })
  }

  private validateOptionSource(input: unknown, path: string, extra: readonly string[]): ScenarioConfigObject {
    const source = record(input, path)
    keys(source, ['tableName', 'viewId', 'valueField', 'labelField', ...extra], path)
    name(source['tableName'], `${path}.tableName`)
    name(source['valueField'], `${path}.valueField`)
    for (const key of ['viewId', 'labelField']) if (key in source) name(source[key], `${path}.${key}`)
    return source
  }

  private validateView(view: ScenarioConfigObject, path: string): void {
    keys(view, Object.keys(ScenarioViewConfig.#viewProperties), path)
    if ('onRequestComplete' in view) SparkData.DataViewQuery.parseCompletionHandler(view['onRequestComplete'], `${path}.onRequestComplete`)
    for (const key of ['autoCurrentFirst', 'autoSelectFirst', 'autoLoad', 'allowDelete', 'lockCurrentWhilePending']) optionalBoolean(view, key, path)
    for (const key of ['labelField', 'selectionDelimiter']) {
      if (key in view && typeof view[key] !== 'string') throw new Error(`${path}.${key} 必须是字符串`)
    }
    for (const key of ['page', 'pageSize']) {
      const value = view[key]
      if (key in view && (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)) throw new Error(`${path}.${key} 必须是正整数`)
    }
    if ('commitMode' in view && view['commitMode'] !== 'staged' && view['commitMode'] !== 'immediate') throw new Error(`${path}.commitMode 无效`)
    if ('valueField' in view && typeof view['valueField'] !== 'string'
      && !(Array.isArray(view['valueField']) && view['valueField'].every(item => typeof item === 'string'))) throw new Error(`${path}.valueField 无效`)
    if ('queryContext' in view) record(view['queryContext'], `${path}.queryContext`)
    if ('queryConfig' in view) SparkData.DataViewQuery.parse(view['queryConfig'], `${path}.queryConfig`)
    if ('filterExpression' in view) {
      const parsed = SparkData.DataViewFilter.parse(view['filterExpression'])
      if (!parsed.ok) throw new Error(`${path}.filterExpression: ${parsed.issues.map(issue => issue.message).join('; ')}`)
    }
    if ('sortExpression' in view) {
      if (!Array.isArray(view['sortExpression'])) throw new Error(`${path}.sortExpression 必须是数组`)
      for (const input of view['sortExpression']) {
        const sort = record(input, `${path}.sortExpression`)
        keys(sort, ['field', 'direction'], `${path}.sortExpression`)
        name(sort['field'], `${path}.sortExpression.field`)
        if ('direction' in sort && sort['direction'] !== 'asc' && sort['direction'] !== 'desc') throw new Error(`${path}.sortExpression.direction 无效`)
      }
    }
    if ('treeConfig' in view) {
      const tree = record(view['treeConfig'], `${path}.treeConfig`)
      keys(tree, ['idField', 'parentIdField', 'rootParentValue', 'textField', 'depthLimit', 'lazy', 'treeMode', 'serverPaginationMode', 'filterMode'], `${path}.treeConfig`)
      for (const key of ['idField', 'parentIdField', 'textField']) if (key in tree) name(tree[key], `${path}.treeConfig.${key}`)
      const rootParent = tree['rootParentValue']
      if ('rootParentValue' in tree && typeof rootParent !== 'string'
        && !(typeof rootParent === 'number' && Number.isFinite(rootParent))) throw new Error(`${path}.treeConfig.rootParentValue 必须是字符串或有限数值`)
      optionalBoolean(tree, 'lazy', `${path}.treeConfig`)
      const depth = tree['depthLimit']
      if ('depthLimit' in tree && (typeof depth !== 'number' || !Number.isSafeInteger(depth) || depth < 0)) throw new Error(`${path}.treeConfig.depthLimit 无效`)
      for (const [key, allowed] of Object.entries({ treeMode: ['flat', 'nested'], serverPaginationMode: ['root', 'flat'], filterMode: ['include-ancestors', 'node-only'] })) {
        if (key in tree && !allowed.some(value => value === tree[key])) throw new Error(`${path}.treeConfig.${key} 无效`)
      }
    }
    if ('fieldProjection' in view) {
      if (!Array.isArray(view['fieldProjection'])) throw new Error(`${path}.fieldProjection 必须是数组`)
      for (const input of view['fieldProjection']) {
        const field = record(input, `${path}.fieldProjection`)
        keys(field, ['fieldId', 'source', 'resourceFieldId', 'resourceField', 'viewField', 'type', 'label',
          'output', 'sortOrder', 'sortDirection', 'group', 'distinct', 'primaryKey', 'value', 'valueFunction',
          'expression'], `${path}.fieldProjection`)
        const fieldPath = `${path}.fieldProjection`
        for (const key of ['fieldId', 'resourceField', 'viewField']) name(field[key], `${fieldPath}.${key}`)
        if (field['source'] !== 'resource' && field['source'] !== 'derived') throw new Error(`${fieldPath}.source 无效`)
        if (field['source'] === 'resource') name(field['resourceFieldId'], `${fieldPath}.resourceFieldId`)
        else if (field['resourceFieldId'] !== null) throw new Error(`${fieldPath}.resourceFieldId 必须为 null`)
        for (const key of ['type', 'label', 'value', 'valueFunction', 'expression']) {
          if (typeof field[key] !== 'string') throw new Error(`${fieldPath}.${key} 必须是字符串`)
        }
        for (const key of ['output', 'distinct', 'primaryKey']) {
          if (typeof field[key] !== 'boolean') throw new Error(`${fieldPath}.${key} 必须是布尔值`)
        }
        for (const key of ['sortOrder', 'group']) {
          const value = field[key]
          if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`${fieldPath}.${key} 必须是非负整数`)
        }
        if (field['sortDirection'] !== null && field['sortDirection'] !== 'asc' && field['sortDirection'] !== 'desc') {
          throw new Error(`${fieldPath}.sortDirection 无效`)
        }
      }
    }
    if ('aggregates' in view) {
      const aggregates = record(view['aggregates'], `${path}.aggregates`)
      for (const [output, input] of Object.entries(aggregates)) {
        const aggregate = record(input, `${path}.aggregates.${output}`)
        keys(aggregate, ['type', 'field', 'separator'], `${path}.aggregates.${output}`)
        if (!['sum', 'count', 'avg', 'min', 'max', 'join'].some(type => type === aggregate['type'])) throw new Error(`${path}.aggregates.${output}.type 无效`)
        for (const key of ['field', 'separator']) if (key in aggregate && typeof aggregate[key] !== 'string') throw new Error(`${path}.aggregates.${output}.${key} 无效`)
      }
    }
  }

  private validateCascade(cascade: ScenarioConfigObject, tables: ScenarioConfigObject): void {
    keys(cascade, ['kind', 'cascadeId', 'sourceRelationId', 'parentTable', 'parentViewId', 'childTable', 'childViewId',
      'filterBindings', 'inputBindings', 'when', 'autoLoad'], 'viewCascades')
    if ('kind' in cascade && cascade['kind'] !== 'query') throw new Error('viewCascades.kind 无效')
    for (const prefix of ['parent', 'child']) {
      const tableName = name(cascade[`${prefix}Table`], `viewCascades.${prefix}Table`)
      const viewId = name(cascade[`${prefix}ViewId`], `viewCascades.${prefix}ViewId`)
      const table = record(tables[tableName], `viewCascades.${tableName}`)
      const views = record(table['views'], `${tableName}.views`)
      if (!Object.hasOwn(views, viewId)) throw new Error(`viewCascades 视图不存在: ${tableName}@${viewId}`)
    }
    for (const key of ['cascadeId', 'sourceRelationId']) if (key in cascade) name(cascade[key], `viewCascades.${key}`)
    optionalBoolean(cascade, 'autoLoad', 'viewCascades')
    if (!Array.isArray(cascade['filterBindings'])) throw new Error('viewCascades.filterBindings 必须是数组')
    const inputs = SparkData.DataViewQueryCascadeInputs.parse(cascade['inputBindings'])
    SparkData.DataViewQueryCascadeInputs.parseWhen(cascade['when'])
    SparkData.DataViewQueryCascadeInputs.parseFilters(cascade['filterBindings'])
    if (!cascade['filterBindings'].length && !inputs.length) throw new Error('viewCascades必须声明过滤或查询输入')
    for (const input of cascade['filterBindings']) {
      const binding = record(input, 'viewCascades.filterBindings')
      keys(binding, ['sourceField', 'targetField', 'operator', 'omitEmpty'], 'viewCascades.filterBindings')
      if ('sourceField' in binding) name(binding['sourceField'], 'viewCascades.sourceField')
      name(binding['targetField'], 'viewCascades.targetField')
    }
  }
}
