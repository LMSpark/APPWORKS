/**
 * @module @spark-appworks/spark-data:runtime-data-set-plan/builder
 * 职责：将已正式回读的元数据行与不可变场景定义聚合为参考仓 spark.runtimeDataSetPlan 合约。
 * 边界：只生成结构 Plan，不执行查询、文件上传、权限判断或业务行读写。
 * AI用途：数据空间设计保存确认后，用正式行和 pagedata 定义导出唯一运行文件。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import {DEFAULT_DATA_VIEW_MAX_ROWS} from '../query/data-view-query'
import type {DataViewFilterJsonValue} from '../query/filter/data-view-filter-contract'
import type {DataViewFieldCascade} from '../types'
import {parseRuntimeDataSetPlanFile} from './parser'
import {DataViewFieldCascadeDefinition} from '../strategies/cascade/field-cascade-definition'
import {
  RUNTIME_DATA_SET_PLAN_KIND,
  RUNTIME_DATA_SET_PLAN_SCHEMA_VERSION,
  type RuntimeDataSetPlanDependency,
  type RuntimeDataSetPlanFile,
  type RuntimeDataSetPlanInputParam,
  type RuntimeDataSetPlanModel,
  type RuntimeDataSetPlanModelField,
  type RuntimeDataSetPlanRelation,
  type RuntimeDataSetPlanView,
  type RuntimeDataSetPlanViewField,
} from './types'

type RuntimePlanRecord = Readonly<Record<string, unknown>>
type RuntimePlanFilter = Readonly<Record<string, unknown>>

/** 构建独立 Plan 所需的正式元数据与已保存文件配置。 */
export type BuildRuntimeDataSetPlanInput = Readonly<{
  scenarioId: string
  space: RuntimePlanRecord
  models: readonly RuntimePlanRecord[]
  fields: readonly RuntimePlanRecord[]
  relations: readonly RuntimePlanRecord[]
  scenarioConfig: RuntimePlanRecord
  savedAt?: string
}>

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function identity(value: unknown, path: string): string {
  const result = text(value)
  if (!result.trim() || result !== result.trim()) throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.${path}: 身份无效`)
  return result
}

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

function number(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

function serialized(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function inputParams(value: unknown): RuntimeDataSetPlanInputParam[] {
  let raw = value
  if (typeof raw === 'string' && raw.trim()) {
    try {raw = JSON.parse(raw)} catch {throw new Error('RUNTIME_DATA_SET_PLAN_BUILD.inputParams: 不是有效 JSON')}
  }
  if (raw === undefined || raw === null || raw === '') return []
  if (!Array.isArray(raw) || !raw.every(isRecord)) throw new Error('RUNTIME_DATA_SET_PLAN_BUILD.inputParams: 必须是数组')
  return raw.map((item, index) => ({
    rowid: identity(item['rowid'], `inputParams[${index}].rowid`),
    name: identity(item['Name'] ?? item['name'], `inputParams[${index}].name`),
    description: text(item['Description'] ?? item['description']),
    isBusParam: flag(item['IsBusParam'] ?? item['isBusParam']),
  }))
}

function planModel(row: RuntimePlanRecord, index: number): RuntimeDataSetPlanModel {
  return {
    id: identity(row['rowid'], `models[${index}].id`),
    metaName: identity(row['Name'], `models[${index}].metaName`),
    name: text(row['Name']),
    description: text(row['description']),
    sourceType: text(row['Type']),
    isBusinessMain: flag(row['IsBusinessMain']),
    isBusiness: flag(row['IsBusiness']),
    outputType: text(row['OutputType']) || 'Table',
    filter: serialized(row['Filter']),
    parentField: text(row['parentField']),
    hasChildField: text(row['hasChildField']),
    selfType: text(row['selfType']),
    topValue: text(row['topValue']),
    cacheType: text(row['cacheType']),
    join: {
      joinType: text(row['JoinType']),
      foreignKeyFields: text(row['ForeignKeyFields']),
      joinFilter: serialized(row['JoinFilter']),
      pId: text(row['PId']),
    },
    crud: {addApi: text(row['addApi']), updateApi: text(row['updateApi']), deleteApi: text(row['deleteApi'])},
  }
}

function planModelField(row: RuntimePlanRecord, index: number): RuntimeDataSetPlanModelField | null {
  if (text(row['type']) && text(row['type']) !== 'dataModel') return null
  return {
    id: identity(row['rowid'], `modelFields[${index}].id`),
    dataModelId: identity(row['dataModelId'], `modelFields[${index}].dataModelId`),
    type: 'dataModel',
    name: identity(row['Name'], `modelFields[${index}].name`),
    description: text(row['description']),
    fieldType: text(row['FieldType']) || 'string',
    isOutput: flag(row['IsOutput']),
    asName: text(row['AsName']),
    orderType: text(row['OrderType']),
    order: number(row['Order']),
    group: number(row['Group']),
    isPKey: flag(row['IsPKey']),
  }
}

const wireOperators: Readonly<Record<string, string>> = Object.freeze({
  eq: 'Equal', ne: 'NotEqual', gt: 'GreaterThan', gte: 'GreaterThanOrEqual',
  lt: 'LessThan', lte: 'LessThanOrEqual', 'is-null': 'IsNull', 'is-not-null': 'IsNotNull',
  contains: 'Contains', 'not-contains': 'NoLike', 'starts-with': 'StartsWith', 'not-starts-with': 'NoStartsWith',
  'ends-with': 'EndsWith', 'not-ends-with': 'NoEndsWith', in: 'In', 'not-in': 'NotIn',
  'is-empty': 'IsEmpty', 'is-not-empty': 'IsNotEmpty',
})

function wireFilter(value: unknown, path: string): RuntimePlanFilter | undefined {
  if (value === undefined || value === null || value === false) return undefined
  if (!isRecord(value)) throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.${path}: 过滤器无效`)
  if (value['logic'] === 'and' || value['logic'] === 'or') {
    const filters = value['filters']
    if (!Array.isArray(filters)) throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.${path}.filters: 必须是数组`)
    return {
      Type: value['logic'] === 'and' ? 'And' : 'Or',
      Filters: filters.map((item, index) => wireFilter(item, `${path}[${index}]`)).filter(Boolean),
    }
  }
  const field = identity(value['field'], `${path}.field`)
  const operator = typeof value['operator'] === 'string' ? wireOperators[value['operator']] : undefined
  if (!operator) throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.${path}.operator: 不支持 ${String(value['operator'])}`)
  return {Field: field, Operator: operator, ...(Object.hasOwn(value, 'value')
    ? {Value: filterJsonValue(value['value'], `${path}.value`)} : {})}
}

function filterJsonValue(value: unknown, path: string): DataViewFilterJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map((item, index) => filterJsonValue(item, `${path}[${index}]`))
  if (isRecord(value)) return Object.fromEntries(Object.entries(value)
    .map(([key, item]) => [key, filterJsonValue(item, `${path}.${key}`)]))
  throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.${path}: 过滤值不是合法 JSON`)
}

function relationFromConfig(input: RuntimePlanRecord, index: number, modelsByTable: ReadonlyMap<string, RuntimeDataSetPlanModel>): RuntimeDataSetPlanRelation {
  const parentTable = identity(input['parentTable'], `resourceRelations[${index}].parentTable`)
  const childTable = identity(input['childTable'], `resourceRelations[${index}].childTable`)
  const parent = modelsByTable.get(parentTable), child = modelsByTable.get(childTable)
  if (!parent || !child) throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.resourceRelations[${index}]: 模型端点不存在`)
  return {
    id: identity(input['relationId'], `resourceRelations[${index}].relationId`),
    parentModelId: parent.id,
    childModelId: child.id,
    depType: text(input['relationName']),
    filter: JSON.stringify(wireFilter(input['filterExpression'], `resourceRelations[${index}].filterExpression`) ?? {}),
    cascadeDel: flag(input['cascadeDelete']),
    childTable,
    parentTable,
  }
}

function formalRelation(input: RuntimePlanRecord, index: number, modelsById: ReadonlyMap<string, RuntimeDataSetPlanModel>): RuntimeDataSetPlanRelation {
  const childId = identity(input['childModId'], `relations[${index}].childModId`)
  const parentId = identity(input['parentModId'], `relations[${index}].parentModId`)
  const child = modelsById.get(childId), parent = modelsById.get(parentId)
  if (!child || !parent) throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.relations[${index}]: 模型端点不存在`)
  return {
    id: identity(input['rowid'], `relations[${index}].rowid`), parentModelId: parentId, childModelId: childId,
    depType: text(input['depType']), filter: serialized(input['filter']),
    cascadeDel: flag(input['cascadeDel']), childTable: text(input['childTable']) || child.metaName,
    parentTable: text(input['parentTable']) || parent.metaName,
  }
}

function stableViewRecordId(tableName: string, viewId: string): string {
  return `${tableName}::${viewId}`
}

function stableViewFieldRecordId(input: Readonly<{
  tableName: string
  viewId: string
  field: RuntimeDataSetPlanModelField
  index: number
}>): string {
  const {tableName, viewId, field, index} = input
  return `${tableName}::${viewId}::${index}::${field.name}`
}

function planViewsAndFields(input: BuildRuntimeDataSetPlanInput, modelsById: ReadonlyMap<string, RuntimeDataSetPlanModel>,
  modelFields: readonly RuntimeDataSetPlanModelField[]): Readonly<{
    views: RuntimeDataSetPlanView[]
    viewFields: RuntimeDataSetPlanViewField[]
  }> {
  const configTables = input.scenarioConfig['tables']
  if (!isRecord(configTables)) throw new Error('RUNTIME_DATA_SET_PLAN_BUILD.tables: 必须是对象')
  const cascadesRaw = input.scenarioConfig['viewCascades']
  const cascades = cascadesRaw === undefined ? [] : Array.isArray(cascadesRaw) ? cascadesRaw : []
  if (!Array.isArray(cascades) || !cascades.every(isRecord)) throw new Error('RUNTIME_DATA_SET_PLAN_BUILD.viewCascades: 必须是数组')
  const views: RuntimeDataSetPlanView[] = [], viewFields: RuntimeDataSetPlanViewField[] = []
  const viewIdentity = new Map<string, string>()
  for (const [tableName, rawTable] of Object.entries(configTables)) {
    if (!isRecord(rawTable)) throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.${tableName}: 表配置无效`)
    const binding = rawTable['modelBinding']
    const tableViews = rawTable['views']
    if (binding === undefined) continue
    if (!isRecord(binding) || !isRecord(tableViews)) throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.${tableName}: 模型绑定或视图无效`)
    const modelId = identity(binding['modelId'], `${tableName}.modelBinding.modelId`)
    if (!modelsById.has(modelId)) throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.${tableName}: 正式模型不存在`)
    for (const viewId of Object.keys(tableViews)) viewIdentity.set(JSON.stringify([tableName, viewId]), stableViewRecordId(tableName, viewId))
  }
  for (const [tableName, rawTable] of Object.entries(configTables)) {
    if (!isRecord(rawTable) || rawTable['resourceType'] === 'file' || rawTable['resourceType'] === 'command') continue
    const binding = rawTable['modelBinding'], tableViews = rawTable['views']
    if (!isRecord(binding) || !isRecord(tableViews)) continue
    const modelId = identity(binding['modelId'], `${tableName}.modelBinding.modelId`)
    const fields = modelFields.filter(field => field.dataModelId === modelId)
    for (const [viewId, rawView] of Object.entries(tableViews)) {
      if (!isRecord(rawView)) throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.${tableName}.${viewId}: 视图配置无效`)
      assertPlanViewDefaults(rawView, `${input.scenarioId} ${tableName}@${viewId}`)
      const recordId = stableViewRecordId(tableName, viewId)
      const cascadeDependencies: RuntimeDataSetPlanDependency[] = []
      const dependentFilters: RuntimePlanFilter[] = []
      for (const [cascadeIndex, rawCascade] of cascades.entries()) {
        if (!isPlanQueryCascadeForView(rawCascade, tableName, viewId)) continue
        const bindings = requirePlanQueryCascadeBindings(rawCascade, cascadeIndex, input.scenarioId)
        const parentViewRecordId = viewIdentity.get(JSON.stringify([rawCascade['parentTable'], rawCascade['parentViewId']]))
        if (!parentViewRecordId) throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.viewCascades[${cascadeIndex}]: 源视图不存在`)
        const parentTable = text(rawCascade['parentTable']), parentView = tableViewsByName(configTables, parentTable)
        const parentBinding = parentView?.['modelBinding']
        if (!isRecord(parentBinding)) throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.viewCascades[${cascadeIndex}]: 源模型无效`)
        for (const [bindingIndex, dependencyBinding] of bindings.entries()) {
          const dependKey = `${text(rawCascade['cascadeId']) || `cascade-${cascadeIndex}`}-${bindingIndex}`
          const sourceField = text(dependencyBinding['sourceField'])
          const targetField = text(dependencyBinding['targetField'])
          const configuredOperator = dependencyBinding['operator']
          const source = configuredOperator === 'in' || (configuredOperator === undefined && sourceField === '') ? 'In' : 'Equal'
          cascadeDependencies.push({
            dependKey, sourceDataViewId: parentViewRecordId,
            sourceModelId: identity(parentBinding['modelId'], `viewCascades[${cascadeIndex}].sourceModelId`),
            sourceField, label: sourceField || dependKey,
            emptyValueMode: dependencyBinding['emptyValueMode'] === 'omit' || dependencyBinding['emptyValueMode'] === 'asNull'
              ? dependencyBinding['emptyValueMode'] : 'emptyResult',
          })
          dependentFilters.push({Field: targetField, Operator: source, ValueFun: {Type: 'GetDependValue', DependKey: dependKey}})
        }
      }
      const scopeFilter = wireFilter(rawView['scopeFilter'], `${tableName}.${viewId}.scopeFilter`)
      const allFilters = [...scopeFilter ? [scopeFilter] : [], ...dependentFilters]
      const filter = allFilters.length === 0 ? '' : JSON.stringify(allFilters.length === 1 ? allFilters[0] : {Type: 'And', Filters: allFilters})
      const queryConfig = isRecord(rawView['queryConfig']) ? rawView['queryConfig'] : {}
      const projection = Array.isArray(rawView['fieldProjection']) ? rawView['fieldProjection'].filter(isRecord) : []
      views.push({
        id: recordId, code: viewId, name: viewId, description: '',
        dataModelId: modelId, isDefault: viewId === 'default', outputType: text(queryConfig['outputType']) || 'Table',
        filter, dependencies: cascadeDependencies,
        parentField: text(isRecord(rawView['treeConfig']) ? rawView['treeConfig']['parentIdField'] : ''),
        hasChildField: text(isRecord(rawView['treeConfig']) ? rawView['treeConfig']['hasChildrenField'] : ''),
        selfType: '', topValue: '', cacheType: '',
        pagination: queryConfig['pagination'] === 'none' ? 'none' : 'paged',
        allPages: queryConfig['allPages'] === true,
        page: typeof rawView['page'] === 'number' ? rawView['page'] : 1,
        pageSize: typeof rawView['pageSize'] === 'number' ? rawView['pageSize'] : 20,
      })
      const projections: Array<{item: RuntimePlanRecord; matched: RuntimeDataSetPlanModelField; index: number}> =
        projection.length ? projection.map((item, projectionIndex) => {
        const resourceFieldId = text(item['resourceFieldId'])
        const matched = fields.find(field => field.id === resourceFieldId || field.name === text(item['resourceField']) || field.asName === text(item['resourceField']))
        if (!matched) throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.${tableName}.${viewId}.fieldProjection[${projectionIndex}]: 字段不存在`)
        return {item, matched, index: projectionIndex}
      }) : fields.map((matched, index) => ({item: {}, matched, index}))
      for (const {item, matched, index} of projections) {
        viewFields.push({
          id: text(item['fieldId']) && item['fieldId'] !== matched.id
            ? text(item['fieldId']) : stableViewFieldRecordId({tableName, viewId, field: matched, index}),
          dataViewId: recordId, dataModelId: modelId,
          name: matched.name, description: text(item['label']) || matched.description,
          fieldType: text(item['type']) || matched.fieldType, isOutput: Object.hasOwn(item, 'output') ? flag(item['output']) : matched.isOutput,
          asName: text(item['viewField']) || matched.asName,
          orderType: item['sortDirection'] === 'desc' ? 'descending' : item['sortDirection'] === 'asc' ? 'ascending' : matched.orderType,
          order: matched.order, group: number(item['group'] ?? matched.group), sort: number(item['sortOrder'] ?? index),
          isPKey: Object.hasOwn(item, 'primaryKey') ? flag(item['primaryKey']) : matched.isPKey,
          display: {kind: 'text', fromDataViewId: '', valueField: '', labelField: ''},
          valueSource: 'model', sourceDataViewId: '', sourceModelId: '', sourceField: '',
        })
      }
    }
  }
  return {views, viewFields}
}

function tableViewsByName(tables: RuntimePlanRecord, tableName: string): RuntimePlanRecord | undefined {
  const table = tables[tableName]
  return isRecord(table) ? table : undefined
}

function assertPlanViewDefaults(view: RuntimePlanRecord, viewIdentity: string): void {
  const queryContext = view['queryContext']
  if (isRecord(queryContext) && Object.keys(queryContext).length > 0) {
    throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.queryContext: ${viewIdentity} 不支持保存非空 queryContext`)
  }
  const sort = view['sortExpression']
  if (Array.isArray(sort) && sort.length > 0) {
    throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.sortExpression: ${viewIdentity} 不支持保存独立 sortExpression`)
  }
  if (wireFilter(view['filterExpression'], `${viewIdentity}.filterExpression`)) {
    const scope = wireFilter(view['scopeFilter'], `${viewIdentity}.scopeFilter`)
    const detail = scope ? '不支持同时保存常驻范围和初始过滤' : '不支持保存可替换的初始过滤'
    throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.filterExpression: ${viewIdentity} ${detail}`)
  }
  const rawQueryConfig = view['queryConfig']
  const queryConfig = isRecord(rawQueryConfig) ? rawQueryConfig : {}
  const fields = queryConfig['fields']
  if (Array.isArray(fields) && fields.length > 0) {
    throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.queryConfig.fields: ${viewIdentity} 不支持保存显式 queryConfig.fields`)
  }
  const maxRows = queryConfig['maxRows']
  if (maxRows !== undefined && maxRows !== DEFAULT_DATA_VIEW_MAX_ROWS) {
    throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.queryConfig.maxRows: ${viewIdentity} 不支持保存非默认 queryConfig.maxRows`)
  }
  const completion = view['onRequestComplete']
  if (completion !== undefined && completion !== '') {
    throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.onRequestComplete: ${viewIdentity} 不支持保存 onRequestComplete`)
  }
  if (view['newRowFields'] !== undefined) {
    // An empty list restricts ordinary create inputs. Omission leaves field selection to the owner.
    throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.newRowFields: ${viewIdentity} 不支持保存 newRowFields`)
  }
  const lookups = queryConfig['filterLookups']
  if (lookups !== undefined && (!Array.isArray(lookups) || lookups.length > 0)) {
    throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.queryConfig.filterLookups: ${viewIdentity} 不支持保存 queryConfig.filterLookups`)
  }
}

function isPlanQueryCascadeForView(cascade: unknown, tableName: string, viewId: string): cascade is RuntimePlanRecord {
  return isRecord(cascade) && cascade['kind'] !== 'field'
    && cascade['childTable'] === tableName && cascade['childViewId'] === viewId
}

/** 生成与发布共用同一套 Plan v1 查询级联表达检查。 */
function requirePlanQueryCascadeBindings(cascade: RuntimePlanRecord, index: number, scenarioId: string): RuntimePlanRecord[] {
  const path = `viewCascades[${index}]`
  const view = `${text(cascade['childTable'])}@${text(cascade['childViewId'])}`
  const inputs = cascade['inputBindings']
  if (inputs !== undefined && (!Array.isArray(inputs) || inputs.length > 0)) {
    throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.${path}.inputBindings: ${view} 不支持查询输入级联（场景 ${scenarioId}）`)
  }
  if (cascade['autoLoad'] === false) {
    throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.${path}.autoLoad: ${view} 不支持手动查询级联（场景 ${scenarioId}）`)
  }
  const when = cascade['when']
  if (when !== undefined && (!Array.isArray(when) || when.length > 0)) {
    throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.${path}.when: ${view} 不支持条件查询级联（场景 ${scenarioId}）`)
  }
  const bindings = cascade['filterBindings']
  if (!Array.isArray(bindings)) throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.${path}: filterBindings 无效`)
  return bindings.map((binding: unknown, bindingIndex) => {
    if (!isRecord(binding)) throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.${path}: 绑定无效`)
    const bindingPath = `${path}.filterBindings[${bindingIndex}]`
    const targetField = identity(binding['targetField'], `${bindingPath}.targetField`)
    const operator = binding['operator']
    if (operator !== undefined && operator !== 'eq' && operator !== 'in') {
      throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.${bindingPath}.operator: ${view}.${targetField} 不支持 ${String(operator)}（场景 ${scenarioId}）`)
    }
    return binding
  })
}

/** 核工作场景的视图默认查询配置和查询级联可由 Plan v1 表达，用于已有 Plan 的新发布。 */
export function assertRuntimeDataSetPlanViewDefaults(input: Pick<BuildRuntimeDataSetPlanInput, 'scenarioId' | 'scenarioConfig'>): void {
  const tables = input.scenarioConfig['tables']
  if (!isRecord(tables)) return
  const rawCascades = input.scenarioConfig['viewCascades']
  const cascades: readonly unknown[] = Array.isArray(rawCascades) ? rawCascades : []
  for (const [tableName, table] of Object.entries(tables)) {
    if (!isRecord(table) || table['resourceType'] === 'file' || table['resourceType'] === 'command'
      || !isRecord(table['modelBinding']) || !isRecord(table['views'])) continue
    for (const [viewId, view] of Object.entries(table['views'])) {
      if (!isRecord(view)) continue
      assertPlanViewDefaults(view, `${input.scenarioId} ${tableName}@${viewId}`)
      for (const [index, cascade] of cascades.entries()) {
        if (isPlanQueryCascadeForView(cascade, tableName, viewId)) requirePlanQueryCascadeBindings(cascade, index, input.scenarioId)
      }
    }
  }
}

/** 正式行与文件配置都已校验时，生成稳定结构哈希并返回冻结 Plan。 */
export function buildRuntimeDataSetPlan(input: BuildRuntimeDataSetPlanInput): RuntimeDataSetPlanFile {
  const scenarioId = identity(input.scenarioId, 'scenarioId')
  if (input.space['rowid'] !== scenarioId) throw new Error('RUNTIME_DATA_SET_PLAN_BUILD.space: 目标空间身份不匹配')
  const models = input.models.map(planModel)
  const modelsById = new Map(models.map(model => [model.id, model]))
  const modelsByTable = new Map<string, RuntimeDataSetPlanModel>()
  const configTables = input.scenarioConfig['tables']
  if (isRecord(configTables)) {
    for (const [tableName, table] of Object.entries(configTables)) {
      if (!isRecord(table) || !isRecord(table['modelBinding'])) continue
      const model = modelsById.get(text(table['modelBinding']['modelId']))
      if (model) modelsByTable.set(tableName, model)
    }
  }
  const modelFields = input.fields.map(planModelField).filter((item): item is RuntimeDataSetPlanModelField => item !== null)
  const configRelations = input.scenarioConfig['resourceRelations']
  const relations = Array.isArray(configRelations)
    ? configRelations.map((item, index) => {
      if (!isRecord(item)) throw new Error(`RUNTIME_DATA_SET_PLAN_BUILD.resourceRelations[${index}]: 无效`)
      return relationFromConfig(item, index, modelsByTable)
    })
    : input.relations.map((item, index) => formalRelation(item, index, modelsById))
  const {views, viewFields} = planViewsAndFields(input, modelsById, modelFields)
  const fieldCascades: DataViewFieldCascade[] = []
  const rawCascades = input.scenarioConfig['viewCascades']
  if (rawCascades !== undefined) {
    if (!Array.isArray(rawCascades)) throw new Error('RUNTIME_DATA_SET_PLAN_BUILD.viewCascades: 必须是数组')
    for (const cascade of rawCascades) {
      if (isRecord(cascade) && cascade['kind'] === 'field') fieldCascades.push(DataViewFieldCascadeDefinition.parse(cascade))
    }
  }
  const body = {
    schemaVersion: RUNTIME_DATA_SET_PLAN_SCHEMA_VERSION, kind: RUNTIME_DATA_SET_PLAN_KIND, scenarioId,
    name: text(input.space['Name']), description: text(input.space['description']), type: text(input.space['Type']),
    source: {dataSetId: scenarioId, exportedFrom: 'data-space-design' as const, graphFile: `${scenarioId}.json`},
    inputParams: inputParams(input.space['inputParams']),
    models, modelFields, views, viewFields, fieldCascades, relations,
    linkage: {edges: relations.map(relation => ({
      parentModelId: relation.parentModelId, childModelId: relation.childModelId,
      depType: relation.depType, filter: relation.filter, trigger: 'current' as const,
    }))},
  }
  const contentHash = hashRuntimeDataSetPlanContent(JSON.stringify(body))
  return Object.freeze({...body, savedAt: input.savedAt ?? new Date().toISOString(), contentHash})
}

/** Plan 结构稳定哈希；保存时间不参与。 */
export function hashRuntimeDataSetPlanContent(canonicalJson: string): string {
  let hash = 2166136261
  for (let index = 0; index < canonicalJson.length; index += 1) {
    hash ^= canonicalJson.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

/** 构建并序列化供独立文件 owner 保存的 Plan 文本。 */
export function buildRuntimeDataSetPlanText(input: BuildRuntimeDataSetPlanInput): string {
  return JSON.stringify(buildRuntimeDataSetPlan(input))
}

/** 摘要和解析后的结构均一致时保留原字节，避免仅因保存时间变化改变发布 SHA。 */
export function stableRuntimeDataSetPlanText(existing: string, generated: string, scenarioId: string): string {
  const previous = parseRuntimeDataSetPlanFile(existing, scenarioId)
  const next = parseRuntimeDataSetPlanFile(generated, scenarioId)
  if (previous.contentHash !== next.contentHash) return generated
  return JSON.stringify({...previous, savedAt: next.savedAt}) === JSON.stringify(next) ? existing : generated
}
