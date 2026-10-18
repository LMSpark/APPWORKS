/**
 * @module app:lowcode/data-space/model-source/field-value/lowcode-data-space-field-value
 * 职责：从正式元数据视图提供字段值函数引用目录并校验显式修改。
 * 边界：不执行值函数、不持有草稿、不保存；字段取正式Name，GetRefData输出引用取数据库来源名。
 * AI用途：字段编辑复用原查询权限和函数合同，未知函数不被误当成后端不支持。
 */
import {DataViewFilter, RequestState, getDataViewFilterFunctionDefinitions, type DataRow, type DataSet, type DataViewFilterFunctionContext} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import type {JsonSchemaObject} from '@spark-appworks/spark-json-document'
import {LowcodeModelRelationAdapter} from '../../lowcode-model-relation-adapter'

/** 按当前可读定义构建目录，不缓存查询结果或权限。 */
export class LowcodeDataSpaceFieldValue {
  /** 元数据实例、目标空间及正式模型ID；modelFields消费本模型工作区。字段输出引用数据库资源，operation-input保留操作映射的模型引用合同。 */
  constructor(private readonly dataSet: DataSet, private readonly targetId: string, private readonly modelId: string,
    private readonly viewId: 'default' | 'modelFields' = 'default',
    private readonly usage: 'field-output' | 'operation-input' = 'field-output') {}

  private rows(table: string, keys: readonly string[], select: (row: DataRow) => boolean = () => true, complete = true) {
    const view = this.dataSet.getView(table, 'default')
    if (!view || view.destroyed || view.requestState !== RequestState.Loaded || complete && view.total !== view.rows.length || view.mutating
      || view.dataTable?.modelBinding?.modelName !== table || view.queryContext['dataSpaceId'] !== this.targetId) throw new Error(`${table}未完整读取`)
    const rows = view.rows.filter(select)
    if (table !== 'Base_DataModel_Field') {
      const valid = rows.every(row => {
          const id = view.getPkKey(row)
          if (id === undefined) return false
          const changed = [...Object.keys(view.getEditingPatch(id) ?? {}), ...Object.keys(view.dirtyTracking.getDiff(id, row))]
          return !view.dirtyTracking.isPendingCreate(id) && !view.dirtyTracking.pendingDeleteIds.has(id)
            && (!changed.length || table === 'Base_DataModel' && changed.every(key => !['rowid', 'dataSetId', 'Name', 'MetaName', 'Type'].includes(key)))
        })
      if (!valid) throw new Error(`${table}引用对象有未保存修改`)
    }
    for (const row of rows) {
      const identity = table === 'Base_DataSet' ? 'rowid' : 'dataSetId'
      if (view.fieldAccess(row, identity).read !== 'visible' || row[identity] !== this.targetId
        || keys.some(key => view.fieldAccess(row, key).read !== 'visible')) throw new Error(`${table}引用身份不可读或范围不符`)
    }
    return rows
  }

  /**
   * 从目标配置或已装配关系取得上游正式模型ID；旧配置读取元数据视图中的关系端点，不装配无关字段。
   * @param definition 已校验的场景配置或已装配定义，身份必须是本次被设计空间；不查询，不执行过滤或推导级联。
   * @returns 去重、排序且不包含当前模型的正式ID；尚未绑定进目标配置的模型没有上游。
   */
  readAncestorModelIds(definition: DataSet | ScenarioViewConfig): string[] {
    if (definition.scenarioId !== this.targetId || !(definition instanceof ScenarioViewConfig) && definition.destroyed) throw new Error('上游模型定义所属空间已变化')
    // 只读取绑定身份，不构造运行DataTable或读取无关字段。
    const tables = definition instanceof ScenarioViewConfig ? definition.toJSON()['tables'] : definition.tables
    if (!isRecord(tables)) throw new Error('上游模型缺少表配置')
    const entries = Object.entries(tables).map(([name, table]) => {
      const binding = isRecord(table) ? table['modelBinding'] : undefined
      return [name, isRecord(binding) && typeof binding['modelId'] === 'string' && typeof binding['modelName'] === 'string'
        ? {modelId: binding['modelId'], modelName: binding['modelName']} : undefined] as const
    })
    const bindings = new Map(entries.flatMap(([name, binding]) => binding ? [[name, {id: binding.modelId}] as const] : []))
    const adapter = new LowcodeModelRelationAdapter()
    const relations = definition instanceof ScenarioViewConfig ? definition.resolveResourceRelationEndpoints(definition.usesNativeResourceRelations
      ? [] : adapter.endpoints(adapter.readMetadataEndpoints(this.dataSet, this.targetId), bindings)) : definition.resourceRelations ?? []
    const current = entries.filter(([, binding]) => binding?.modelId === this.modelId)
    if (current.length > 1) throw new Error('上游模型的当前绑定不唯一')
    const verify = (name: string): string => {
      const binding = entries.find(([table]) => table === name)?.[1]
      if (!binding || entries.filter(([, candidate]) => candidate?.modelId === binding.modelId).length !== 1) throw new Error('上游关系端点无法唯一解析')
      const models = this.rows('Base_DataModel', ['rowid', 'Name'], row => row['rowid'] === binding.modelId, false)
      if (models.length !== 1 || models[0]?.['Name'] !== binding.modelName) throw new Error('上游模型身份不可确认')
      return binding.modelId
    }
    const visited = new Set(current.map(([name]) => name)), queue = [...visited], ids = new Set<string>()
    for (const name of visited) verify(name)
    for (const child of queue) for (const relation of relations) {
      if (relation.childTable !== child || visited.has(relation.parentTable)) continue
      const id = verify(relation.parentTable)
      visited.add(relation.parentTable); queue.push(relation.parentTable)
      if (id !== this.modelId) ids.add(id)
    }
    return [...ids].sort()
  }

  private fields(modelId = this.modelId, names?: readonly unknown[], extraKeys: readonly string[] = []) {
    const keys = ['rowid', 'dataSetId', 'dataModelId', 'type', 'Name', ...extraKeys]
    const upstream = this.dataSet.getView('Base_DataModel_Field', 'modelInputFields')
    if (modelId !== this.modelId && (this.viewId === 'modelFields' || upstream?.queryContext['modelId'] !== undefined)) {
      const ids = upstream?.queryContext['modelIds']
      if (!upstream || upstream.destroyed || upstream.requestState !== RequestState.Loaded || upstream.loadingError || upstream.mutating
        || upstream.dataTable?.modelBinding?.modelName !== 'Base_DataModel_Field'
        || upstream.queryContext['dataSpaceId'] !== this.targetId || upstream.queryContext['modelId'] !== this.modelId
        || !Array.isArray(ids) || ids.some(id => typeof id !== 'string') || !ids.includes(modelId)
        || upstream.total !== upstream.rows.length || upstream.hasEditingChanges() || upstream.dirtyTracking.hasPendingChanges()) throw new Error('上游字段视图未完整读取或所属模型已变化')
      for (const row of upstream.rows) if (['rowid', 'dataSetId', 'dataModelId', 'type'].some(key => upstream.fieldAccess(row, key).read !== 'visible')
        || row['dataSetId'] !== this.targetId || !ids.includes(row['dataModelId'])) throw new Error('上游字段引用身份不可读或范围不符')
      const rows = upstream.rows.filter(row => row['dataModelId'] === modelId && row['type'] === 'dataModel'
        && (names === undefined || names.includes(row['Name'])))
      if (rows.some(row => keys.some(key => upstream.fieldAccess(row, key).read !== 'visible'))) throw new Error('上游字段引用不可读')
      return rows
    }
    if (modelId !== this.modelId || this.viewId === 'default') return this.rows('Base_DataModel_Field', keys,
      row => row['dataModelId'] === modelId && row['type'] === 'dataModel' && (names === undefined || names.includes(row['Name'])))
    const view = this.dataSet.getView('Base_DataModel_Field', this.viewId)
    if (!view || view.destroyed || view.requestState !== RequestState.Loaded || view.loadingError || view.mutating
      || view.commitMode !== 'staged' || view.dataTable?.modelBinding?.modelName !== 'Base_DataModel_Field'
      || view.queryContext['dataSpaceId'] !== this.targetId || view.queryContext['modelId'] !== this.modelId
      || view.rows.filter(row => !view.dirtyTracking.isPendingCreate(view.getPkKey(row) ?? '')).length + view.dirtyTracking.pendingDeleteIds.size !== view.total) throw new Error('模型字段工作区未完整读取或范围已变化')
    if (view.dirtyTracking.pendingCreateIds.size && view.addActionState() !== 'enabled') throw new Error('当前查询不允许引用待新增字段')
    const rows = view.rows.filter(row => names === undefined || names.includes((view.getEditingRow(view.getPkKey(row) ?? '') ?? row)['Name'])).map(row => {
      const id = view.getPkKey(row)
      if (typeof id !== 'string' || row['rowid'] !== id || keys.some(key => view.fieldAccess(row, key).read !== 'visible')
        || row['dataSetId'] !== this.targetId || row['dataModelId'] !== this.modelId || row['type'] !== 'dataModel') throw new Error('模型字段引用身份不可读或范围不符')
      const current = view.getEditingRow(id) ?? row
      if (keys.slice(0, 4).some(key => current[key] !== row[key])) throw new Error('模型字段引用身份已变化')
      return current
    })
    if (new Set(rows.map(row => row['rowid'])).size !== rows.length) throw new Error('模型字段引用身份不唯一')
    return rows
  }

  private table(modelId: string, names?: readonly unknown[]) {
    const models = this.rows('Base_DataModel', ['rowid', 'Name'], row => row['rowid'] === modelId, false), model = models[0]
    if (!model || models.length !== 1 || typeof model['Name'] !== 'string' || !model['Name'].trim()) throw new Error('模型引用身份不唯一')
    const fields = names?.length === 0 ? [] : this.fields(modelId, names).map(row => row['Name'])
    if (fields.some(name => typeof name !== 'string' || !name.trim()) || new Set(fields).size !== fields.length) throw new Error('字段引用身份不唯一')
    return {name: model['Name'], fields: fields.map(name => ({name: String(name)}))}
  }

  private referenceTable(modelId: string, names?: readonly unknown[]) {
    const keys = ['rowid', 'Name', 'MetaName', 'Type', 'DbId', 'DbName']
    const own = this.rows('Base_DataModel', keys, row => row['rowid'] === this.modelId, false)[0]
    const models = this.rows('Base_DataModel', keys, row => row['rowid'] === modelId, false), model = models[0]
    if (!own || !model || models.length !== 1) throw new Error('引用资源所属模型不唯一')
    const resource = (row: DataRow) => {
      if (typeof row['Type'] !== 'string' || typeof row['MetaName'] !== 'string') throw new Error('数据库来源身份不可确认')
      const value = DataSpaceDesignApi.resolveTableResource({sourceType: row['Type'], sourceName: row['MetaName']})
      if (!['database-table', 'database-view'].includes(value.resourceType)) throw new Error('引用数据需要数据库表或数据库视图来源')
      return value
    }
    resource(own)
    const source = resource(model)
    const connection = (row: DataRow) => {
      for (const key of ['DbId', 'DbName']) if (row[key] !== undefined && row[key] !== null && typeof row[key] !== 'string') throw new Error('数据库连接身份无效')
      return typeof row['DbName'] === 'string' && row['DbName'] !== '' ? ['name', row['DbName']] : ['id', row['DbId'] ?? '']
    }
    if (JSON.stringify(connection(own)) !== JSON.stringify(connection(model))) throw new Error('引用数据不能跨数据库或使用未确认的连接身份')
    const fields = names?.length === 0 ? [] : this.fields(modelId, names, ['FieldType']).filter(row => row['FieldType'] !== '计算字段').map(row => row['Name'])
    if (fields.some(name => typeof name !== 'string' || !name.trim()) || new Set(fields).size !== fields.length) throw new Error('资源字段身份不唯一')
    return {name: source.resourceId, label: model['Name'] === source.resourceId ? source.resourceId : `${String(model['Name'])}（${source.resourceId}）`,
      fields: fields.map(name => ({name: String(name)}))}
  }

  private referenceContext(tables: NonNullable<DataViewFilterFunctionContext['tables']>): DataViewFilterFunctionContext {
    const resources = new Map<string, NonNullable<DataViewFilterFunctionContext['tables']>[number]>()
    for (const table of tables) {
      const existing = resources.get(table.name)
      const fields = new Map([...(existing?.fields ?? []), ...(table.fields ?? [])].map(field => [field.name, field]))
      resources.set(table.name, {...existing ?? table, fields: [...fields.values()]})
    }
    const resourceContext = {tables: [...resources.values()]}
    return {definitions: getDataViewFilterFunctionDefinitions(resourceContext).filter(item => item.type === 'GetRefData').map(item => ({...item,
      fields: item.fields.map(field => {
        const options = field.options
        return typeof options === 'function' ? {...field, options: (value: Parameters<typeof options>[0]) => options(value, resourceContext)} : field
      }),
    }))}
  }

  /** 只读已保存的空间参数目录；不受同一模型的过滤草稿影响，失权或非法声明返回诊断及空目录。 */
  readInputParameters(): {options: NonNullable<DataViewFilterFunctionContext['inputParams']>; warning: string} {
    let inputParams: NonNullable<DataViewFilterFunctionContext['inputParams']> = []
    try {
      const spaces = this.rows('Base_DataSet', ['rowid', 'inputParams'])
      const space = spaces[0]
      if (!space || spaces.length !== 1) throw new Error('空间参数定义不唯一')
      inputParams = DataSpaceDesignApi.readInputParameters({value: space['inputParams'], editable: true}).map(item => {
        const name = item['Name'] ?? item['name'], description = item['Description'] ?? item['description']
        if (typeof name !== 'string' || !name.trim() || typeof item['Name'] === 'string' && typeof item['name'] === 'string' && item['Name'] !== item['name']) throw new Error('空间参数名称无效或别名冲突')
        return {value: name, label: typeof description === 'string' && description ? description : name}
      })
      if (new Set(inputParams.map(item => item.value)).size !== inputParams.length) throw new Error('空间参数名称不唯一')
    } catch (cause) {return {options: [], warning: cause instanceof Error ? cause.message : String(cause)}}
    return {options: inputParams, warning: ''}
  }

  /**
   * 读取调用值编辑所用参数目录；mapped使用空间声明，direct使用已读取的当前模型来源参数。
   * @param mode 视图的来源参数模式；不是上游模型字段目录，也不修改来源取值映射。
   * @returns 固定对象成员Schema与不可用诊断；Schema只提供名称、描述和类型提示，不填默认值或强制转换。
   */
  readQueryParameters(mode: 'mapped' | 'direct' = 'mapped'): {schema: JsonSchemaObject; warning: string} {
    if (mode === 'mapped') {
      const parameters = this.readInputParameters()
      return {schema: {type: 'object', properties: Object.fromEntries(parameters.options.map((item): [string, JsonSchemaObject] => [String(item.value), {description: item.label}]))}, warning: parameters.warning}
    }
    try {
      const view = this.dataSet.getView('Base_DataModel_Field', 'sourceInputFields')
      if (!view || view.destroyed || view.requestState !== RequestState.Loaded || view.loadingError || view.mutating
        || view.total !== view.rows.length || view.dataTable?.modelBinding?.modelName !== 'Base_DataModel_Field'
        || view.queryContext['dataSpaceId'] !== this.targetId || view.queryContext['modelId'] !== this.modelId) throw new Error('来源参数未完整读取或范围已变化')
      const models = this.rows('Base_DataModel', ['rowid', 'Type'], row => row['rowid'] === this.modelId, false)
      if (models.length !== 1 || !['接口', '视图'].includes(String(models[0]?.['Type']))) throw new Error('来源参数所属模型不可确认')
      const properties: Array<[string, JsonSchemaObject]> = []
      for (const row of view.rows) {
        if (['rowid', 'dataSetId', 'dataModelId', 'type'].some(field => view.fieldAccess(row, field).read !== 'visible')
          || row['dataSetId'] !== this.targetId || row['dataModelId'] !== this.modelId || row['type'] !== 'inputParams') throw new Error('来源参数身份不可读或范围不符')
        const name = row['Name']
        if (view.fieldAccess(row, 'Name').read !== 'visible' || typeof name !== 'string' || !name.trim()
          || properties.some(([key]) => key === name)) throw new Error('来源测试参数名称不可读、为空或重复')
        properties.push([name, {
          description: view.fieldAccess(row, 'description').read === 'visible' ? String(row['description'] ?? '') : '',
          'x-typeLabel': view.fieldAccess(row, 'FieldType').read === 'visible' ? String(row['FieldType'] ?? '') : '',
        }])
      }
      return {schema: {type: 'object', properties: Object.fromEntries(properties)}, warning: ''}
    } catch (cause) {return {schema: {type: 'object', properties: {}}, warning: cause instanceof Error ? cause.message : String(cause)}}
  }

  /**
   * 不可确认的目录返回诊断，独立常量和原文仍可维护；不查询或保存数据。
   * @param readDefinition 会话提供目标文件配置或有效运行定义；旧配置的上游通过已加载且可读的元关系端点投影解析，不装配完整目标。
   * @returns 本模型、可确认上游及空间参数目录，和不可用部分的诊断。可读模型/资源先提供名称，字段未就绪或不可读时留空；确认引用仍须核正式字段，候选不是后端函数执行保证。
   */
  read(readDefinition?: () => DataSet | ScenarioViewConfig | null): {context: DataViewFilterFunctionContext; warning: string} {
    let tables: NonNullable<DataViewFilterFunctionContext['tables']> = []
    let referenceTables: NonNullable<DataViewFilterFunctionContext['tables']> = []
    let relatedFields: NonNullable<DataViewFilterFunctionContext['relatedFields']> = []
    const parameters = this.readInputParameters(), inputParams = parameters.options
    const warnings: string[] = parameters.warning ? [parameters.warning] : []
    const availableTable = (readTable: (names?: readonly unknown[]) => NonNullable<DataViewFilterFunctionContext['tables']>[number]) => {
      const header = readTable([])
      try {return readTable()}
      catch (cause) {warnings.push(cause instanceof Error ? cause.message : String(cause)); return header}
    }
    try {
      const own = this.table(this.modelId)
      tables = [own]
      relatedFields = own.fields.map(field => ({label: field.name, value: field.name}))
      const addReference = (id: string) => {
        if (this.usage !== 'field-output') return
        try {referenceTables = [...referenceTables, availableTable(names => this.referenceTable(id, names))]}
        catch (cause) {warnings.push(cause instanceof Error ? cause.message : String(cause))}
      }
      addReference(this.modelId)
      let ancestors: string[] = []
      try {
        const definition = readDefinition?.()
        if (definition) ancestors = this.readAncestorModelIds(definition)
      } catch (cause) {warnings.push(cause instanceof Error ? cause.message : String(cause))}
      for (const id of ancestors) {
        try {tables = [...tables, availableTable(names => this.table(id, names))]}
        catch (cause) {warnings.push(cause instanceof Error ? cause.message : String(cause))}
        addReference(id)
      }
    } catch (cause) {tables = []; relatedFields = []; warnings.push(cause instanceof Error ? cause.message : String(cause))}
    const context = {tables, relatedFields, inputParams, ...this.usage === 'field-output' ? this.referenceContext(referenceTables) : {}}
    const definitions = getDataViewFilterFunctionDefinitions(context).map(item => item.type === 'GetTableField'
      ? {...item, label: '本模型字段'} : item.type === 'GetInputParam' ? {...item, label: '空间参数'} : item)
    return {context: {...context, definitions}, warning: warnings.join('；')}
  }

  /** 校验结构及已有函数目录内的引用；不将编辑目录作为服务端函数白名单。 */
  validate(value: unknown): void {
    if (typeof value !== 'string') throw new Error('ValueFun必须是值函数字符串')
    if (value === '') return
    const expression = DataSpaceDesignApi.parseValueFunction(value)
    if (!expression) throw new Error('值函数不能为空白；清除配置请显式清空')
    if (expression.Type === 'GetConstValue' && !Object.hasOwn(expression, 'Value')) throw new Error('常量值缺失')
    if (expression.Type === 'GetUserMasterId' && expression['refType'] !== 'dep') throw new Error('前端不维护角色分类值函数')
    let context: DataViewFilterFunctionContext = {}, warning = ''
    if (expression.Type === 'GetTableField') {
      context = {relatedFields: this.table(this.modelId, [expression['Field']]).fields.map(field => ({label: field.name, value: field.name}))}
    } else if (expression.Type === 'GetInputParam' || expression.Type === 'GetObjectArray') {
      const parameters = this.readInputParameters()
      context = {inputParams: parameters.options}; warning = parameters.warning
    } else if (expression.Type === 'GetRefData' && this.usage === 'field-output') {
      const models = this.rows('Base_DataModel', ['rowid', 'MetaName'], row => row['MetaName'] === expression['RefTableName'])
      const tables: Array<NonNullable<DataViewFilterFunctionContext['tables']>[number]> = [], diagnostics: string[] = []
      for (const model of models) {
        try {
          if (typeof model['rowid'] !== 'string') throw new Error('引用资源所属模型身份无效')
          tables.push(this.referenceTable(model['rowid'], [expression['RefFieldName'], expression['FkFieldName']]))
        } catch (cause) {diagnostics.push(cause instanceof Error ? cause.message : String(cause))}
      }
      if (!tables.length) throw new Error(diagnostics.join('；') || '引用资源不存在或不可读取')
      context = this.referenceContext(tables)
    } else if (['GetRefData', 'GetExpData'].includes(expression.Type)) {
      const name = expression.Type === 'GetRefData' ? expression['RefTableName']
        : expression['refTableName']
      const models = this.rows('Base_DataModel', ['rowid', 'Name'], row => row['Name'] === name), model = models[0]
      if (!model || models.length !== 1 || typeof model['rowid'] !== 'string') throw new Error('引用模型不存在或身份不唯一')
      context = {tables: [this.table(model['rowid'], expression.Type === 'GetExpData' ? []
        : [expression['RefFieldName'], expression['FkFieldName']])]}
    }
    // 引用目录缺失时，这三类函数仍需拒绝失效引用，不能退化为未知扩展函数。
    const reference = ['GetTableField', 'GetInputParam', 'GetObjectArray'].includes(expression.Type)
    if (!reference && !getDataViewFilterFunctionDefinitions(context).some(item => item.type === expression.Type)) return
    const filter = DataViewFilter.parse({field: 'ValueFun', operator: 'eq', value: expression})
    if (!filter.ok) throw new Error(filter.issues.map(issue => issue.message).join('；'))
    const issues = filter.value.validate({fields: [{name: 'ValueFun', type: 'text'}], valueFunctions: context})
    if (issues.length) throw new Error([warning, ...issues.map(issue => issue.message)].filter(Boolean).join('；'))
  }
}
