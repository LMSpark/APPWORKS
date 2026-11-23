/**
 * @module @spark-appworks/spark-data:runtime-data-set-plan/compiler
 * 职责：把后端独立 Dataset Plan 编译为本仓原生 DataSet metadata，并把 dependencies 编译为 DataView cascade。
 * 边界：不读取 HTTP、文件或业务 rows；正式资源 owner 由 lowcode 装配层注入，Plan 不授予权限。
 * AI用途：PageRuntime 需要消费 `{scenarioId}.dataset.json` 时，用此模块核 Plan 到 DataTable/DataView 的映射。
 */
import { isRecord } from '@spark-appworks/spark-utils'
import type { DataViewFilterJsonValue } from '../query/filter/data-view-filter-contract'
import type {
  DataColumn, DataResourceRelation, DataSetMetadata, DataViewCascade, DataViewFieldProjection, TableMetadata,
} from '../types'
import type { DataViewFilterOperator, DataViewFilterTree } from '../query/filter/data-view-filter-contract'
import type { RuntimeDataSetPlanFile, RuntimeDataSetPlanView } from './types'

type RuntimePlanWireFilter = Record<string, unknown>

/** 正式模型资源身份；只覆盖 owner，不改变 Plan 的模型/字段合同。 */
export type RuntimeDataSetPlanModelResource = Readonly<{
  /** 运行资源类型，由正式 metadata 解析。 */
  resourceType: NonNullable<TableMetadata['resourceType']>
  /** 查询/保存 owner 的稳定资源 ID。 */
  resourceId: string
}>

/** Dataset Plan 编译所需的正式 metadata override。 */
export type CompileRuntimeDataSetPlanOptions = Readonly<{
  /** 按正式 modelId/metaName 解析资源 owner。 */
  resolveModelResource?: (input: Readonly<{modelId: string; metaName: string}>) => RuntimeDataSetPlanModelResource | undefined
  /** 以正式 metadata 主键覆盖 Plan 中可能误标的原字段。 */
  resolveFieldPrimaryKey?: (input: Readonly<{modelId: string; fieldId: string; fieldName: string}>) => boolean | undefined
}>

/** 已编译 Plan；metadata 可直接交给 DataSet，cascades 是原生运行依赖。 */
export type CompiledRuntimeDataSetPlan = Readonly<{
  /** 已通过严格 schema 校验的不可变 Plan。 */
  plan: RuntimeDataSetPlanFile
  /** 本仓 canonical DataSet metadata。 */
  metadata: DataSetMetadata
  /** 由 GetDependValue 生成的查询级联。 */
  viewCascades: readonly DataViewCascade[]
}>

function record(value: unknown, path: string): RuntimePlanWireFilter {
  if (!isRecord(value)) throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: 必须是对象`)
  return value
}

const operators: Readonly<Record<string, DataViewFilterOperator>> = Object.freeze({
  equal: 'eq', notequal: 'ne', greaterthan: 'gt', greaterthanorequal: 'gte',
  lessthan: 'lt', lessthanorequal: 'lte', isnull: 'is-null', isnotnull: 'is-not-null',
  contains: 'contains', nolike: 'not-contains', startswith: 'starts-with', nostartswith: 'not-starts-with',
  endswith: 'ends-with', notendswith: 'not-ends-with', in: 'in', notin: 'not-in',
  isempty: 'is-empty', isnotempty: 'is-not-empty',
})

function filterOperator(value: unknown, path: string): DataViewFilterOperator {
  const operator = operators[String(value).toLowerCase()]
  if (!operator) throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: 不支持的过滤操作符 ${String(value)}`)
  return operator
}

function parseWireFilter(raw: string, path: string): unknown {
  if (!raw.trim()) return undefined
  try { return JSON.parse(raw) } catch { throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: 不是有效 Filter JSON`) }
}

function jsonValue(value: unknown, path: string): DataViewFilterJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map((item, index) => jsonValue(item, `${path}[${index}]`))
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, jsonValue(item, `${path}.${key}`)]))
  throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: 过滤值不是合法 JSON`)
}

type ConvertedFilterDependency = Readonly<{path: string; node: Record<string, unknown>}>
type ConvertedFilter = Readonly<{
  filter?: DataViewFilterTree
  dependent: boolean
  dependencies: readonly ConvertedFilterDependency[]
}>
type FilterContext = Pick<RuntimeDataSetPlanView, 'dependencies'>
type ConvertFilterNodeInput = Readonly<{
  input: unknown
  view: FilterContext
  path: string
  allowOr?: boolean
}>

function convertFilterNode(options: ConvertFilterNodeInput): ConvertedFilter {
  const {input, view, path, allowOr = true} = options
  if (input === undefined || input === null || input === false) return {dependent: false, dependencies: []}
  const node = record(input, path)
  const logic = String(node['logic'] ?? node['Type'] ?? '').toLowerCase()
  if (logic === 'and' || logic === 'or') {
    if (logic === 'or' && !allowOr) throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: OR 分支不能包含 GetDependValue`)
    const children = node['filters'] ?? node['Filters']
    if (!Array.isArray(children)) throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: filters 必须是数组`)
    const converted = children.map((child, index) => convertFilterNode({
      input: child, view, path: `${path}[${index}]`, allowOr: logic !== 'or',
    }))
    const filters = converted.flatMap(item => item.filter === undefined ? [] : [item.filter])
    const dependent = converted.some(item => item.dependent)
    const dependencies = converted.flatMap(item => item.dependencies)
    if (logic === 'or' && dependent) throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: 不支持含 GetDependValue 的 OR 条件`)
    if (!filters.length) return {dependent, dependencies}
    if (filters.length === 1) {
      const only = filters[0]
      if (!only) return {dependent, dependencies}
      return {filter: only, dependent, dependencies}
    }
    return {filter: {logic, filters}, dependent, dependencies}
  }
  const field = node['field'] ?? node['Field']
  if (typeof field !== 'string' || !field.trim()) throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: 缺少 Field`)
  const valueFunction = node['ValueFun'] ?? (isRecord(node['value']) ? node['value'] : undefined)
  if (isRecord(valueFunction) && valueFunction['Type'] === 'GetDependValue') {
    const dependKey = valueFunction['DependKey']
    if (typeof dependKey !== 'string' || !view.dependencies.some(item => item.dependKey === dependKey)) {
      throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: 未声明 DependKey ${String(dependKey)}`)
    }
    return {dependent: true, dependencies: [{path, node}]}
  }
  const operator = filterOperator(node['operator'] ?? node['Operator'], `${path}.Operator`)
  const rawValue = isRecord(valueFunction)
    ? valueFunction
    : Object.hasOwn(node, 'value') ? node['value'] : node['Value']
  return {filter: {field, operator, ...(operator === 'is-null' || operator === 'is-not-null'
    || operator === 'is-empty' || operator === 'is-not-empty' ? {} : {value: jsonValue(rawValue, `${path}.value`)})},
  dependent: false, dependencies: []}
}

function planColumns(plan: RuntimeDataSetPlanFile, modelId: string, options: CompileRuntimeDataSetPlanOptions): DataColumn[] {
  return plan.modelFields.filter(field => field.dataModelId === modelId).map(field => ({
    name: field.asName || field.name,
    type: field.fieldType || 'string',
    label: field.description || field.asName || field.name,
    isPrimaryKey: options.resolveFieldPrimaryKey?.({modelId, fieldId: field.id, fieldName: field.name}) ?? field.isPKey,
    order: field.order,
  }))
}

function planProjection(plan: RuntimeDataSetPlanFile, view: RuntimeDataSetPlanView,
  options: CompileRuntimeDataSetPlanOptions): readonly DataViewFieldProjection[] {
  const fields = plan.viewFields.filter(field => field.dataViewId === view.id)
  if (!fields.length) return []
  return [...fields].sort((left, right) => left.sort - right.sort).map(field => {
    const modelField = plan.modelFields.find(candidate => candidate.dataModelId === field.dataModelId
      && (candidate.name === field.name || candidate.asName === field.name))
    if (!modelField) throw new Error(`RUNTIME_DATA_SET_PLAN.${field.id}: 正式模型字段不存在`)
    return {
      fieldId: field.id, source: 'resource' as const, resourceFieldId: modelField.id,
      resourceField: field.asName || field.name, viewField: field.asName || field.name,
      type: field.fieldType || 'string', label: field.description || field.asName || field.name,
      output: field.isOutput, sortOrder: field.sort,
      sortDirection: field.orderType === 'descending' ? 'desc' : field.orderType === 'ascending' ? 'asc' : null,
      group: field.group, distinct: false,
      primaryKey: options.resolveFieldPrimaryKey?.({
        modelId: field.dataModelId, fieldId: modelField.id, fieldName: field.name,
      }) ?? field.isPKey,
      value: '', valueFunction: '', expression: '',
    }
  })
}

function planViewId(view: RuntimeDataSetPlanView): string {
  return view.id.includes('::') ? view.code.trim() || view.name.trim() || view.id : view.id
}

function dependentFilters(
  plan: RuntimeDataSetPlanFile,
  view: RuntimeDataSetPlanView,
  dependencies: readonly ConvertedFilterDependency[],
): DataViewCascade[] {
  const byDependKey = new Map(view.dependencies.map(item => [item.dependKey, item]))
  const sourceViews = new Map(plan.views.map(item => [item.id, item]))
  const models = new Map(plan.models.map(item => [item.id, item]))
  const cascades = new Map<string, {
    parentTable: string; parentViewId: string; bindings: Array<{
      sourceField?: string; targetField: string; operator?: 'eq' | 'in'; emptyValueMode: 'emptyResult' | 'omit' | 'asNull'
    }>
  }>()
  for (const dependencyCondition of dependencies) {
    const {node, path} = dependencyCondition
    const fn = node['ValueFun'] ?? node['value']
    if (!isRecord(fn) || fn['Type'] !== 'GetDependValue') throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: dependency proof 丢失`)
    const dependKey = String(fn['DependKey'] ?? '')
    const dependency = byDependKey.get(dependKey)
    if (!dependency) throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: 未声明 DependKey ${dependKey}`)
    const sourceView = sourceViews.get(dependency.sourceDataViewId)
    const sourceModel = sourceView ? models.get(sourceView.dataModelId) : undefined
    const childModel = models.get(view.dataModelId)
    if (!sourceView || !sourceModel || !childModel || sourceModel.id !== dependency.sourceModelId) {
      throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: 依赖来源视图或模型不匹配`)
    }
    const targetField = node['Field'] ?? node['field']
    if (typeof targetField !== 'string' || !targetField.trim()) throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: 缺少目标字段`)
    const operator = filterOperator(node['Operator'] ?? node['operator'], `${path}.Operator`)
    if (operator !== 'eq' && operator !== 'in') throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: GetDependValue 仅支持 equal/in`)
    const sourceViewId = planViewId(sourceView)
    const key = JSON.stringify([sourceModel.metaName, sourceViewId])
    const group = cascades.get(key) ?? {parentTable: sourceModel.metaName, parentViewId: sourceViewId, bindings: []}
    group.bindings.push({...(dependency.sourceField ? {sourceField: dependency.sourceField} : {}), targetField, operator,
      emptyValueMode: dependency.emptyValueMode})
    cascades.set(key, group)
  }
  const childModel = models.get(view.dataModelId)
  if (!childModel) throw new Error(`RUNTIME_DATA_SET_PLAN.${view.id}: 目标模型不存在`)
  return [...cascades.values()].map(group => ({
    kind: 'query' as const, cascadeId: `plan:${planViewId(view)}:${group.parentViewId}`,
    parentTable: group.parentTable, parentViewId: group.parentViewId,
    childTable: childModel.metaName, childViewId: planViewId(view),
    filterBindings: group.bindings.map(binding => ({
      ...(binding.sourceField === undefined ? {} : {sourceField: binding.sourceField}),
      targetField: binding.targetField,
      ...(binding.operator === undefined ? {} : {operator: binding.operator}),
      emptyValueMode: binding.emptyValueMode,
    })),
  }))
}

function planRelations(plan: RuntimeDataSetPlanFile): DataResourceRelation[] {
  const models = new Map(plan.models.map(model => [model.id, model]))
  return plan.relations.map(relation => {
    const parent = models.get(relation.parentModelId), child = models.get(relation.childModelId)
    if (!parent || !child || relation.parentTable !== parent.metaName || relation.childTable !== child.metaName) {
      throw new Error(`RUNTIME_DATA_SET_PLAN.relation.${relation.id}: 模型端点不匹配`)
    }
    const converted = convertFilterNode({input: parseWireFilter(relation.filter, `${relation.id}.filter`),
      view: {dependencies: []}, path: `${relation.id}.filter`, allowOr: false})
    if (converted.dependent || !converted.filter) throw new Error(`RUNTIME_DATA_SET_PLAN.relation.${relation.id}: 关系必须是完整过滤表达式`)
    return {
      relationId: relation.id, parentTable: relation.parentTable, childTable: relation.childTable,
      relationName: relation.depType, filterExpression: converted.filter, cascadeDelete: relation.cascadeDel,
    }
  })
}

export function compileRuntimeDataSetPlan(
  plan: RuntimeDataSetPlanFile,
  options: CompileRuntimeDataSetPlanOptions = {},
): CompiledRuntimeDataSetPlan {
  const tables: Record<string, TableMetadata> = {}
  const cascades: DataViewCascade[] = []
  cascades.push(...plan.fieldCascades)
  for (const model of plan.models) {
    const modelViews = plan.views.filter(view => view.dataModelId === model.id)
    if (modelViews.filter(view => view.isDefault).length > 1) {
      throw new Error(`RUNTIME_DATA_SET_PLAN.${model.id}: 默认 DataView 不唯一`)
    }
    const views: TableMetadata['views'] = {default: {}}
    for (const view of modelViews) {
      const viewId = planViewId(view)
      const converted = convertFilterNode({
        input: parseWireFilter(view.filter, `${view.id}.filter`), view, path: `${view.id}.filter`,
      })
      const projection = planProjection(plan, view, options)
      const definition = {
        ...(projection.length ? {fieldProjection: [...projection]} : {}),
        ...(converted.filter ? {scopeFilter: converted.filter} : {}),
        autoLoad: false, commitMode: 'staged' as const,
        queryConfig: {outputType: view.outputType, pagination: view.pagination, allPages: view.allPages,
          autoQuery: view.dependencies.length > 0},
        page: view.page, pageSize: view.pageSize,
        ...(view.parentField ? {treeConfig: {
          idField: projection.find(field => field.primaryKey)?.viewField ?? plan.modelFields
            .find(field => field.dataModelId === model.id && field.isPKey)?.name ?? '',
          parentIdField: view.parentField,
          ...(view.hasChildField ? {hasChildrenField: view.hasChildField} : {}),
        }} : {}),
      }
      views[viewId] = definition
      if (view.isDefault) views['default'] = definition
      cascades.push(...dependentFilters(plan, view, converted.dependencies))
    }
    if (!Object.hasOwn(views, 'default')) views['default'] = {}
    const resource = options.resolveModelResource?.({modelId: model.id, metaName: model.metaName})
    tables[model.metaName] = {
      tableName: model.metaName, modelBinding: {modelId: model.id, modelName: model.metaName},
      ...(resource ?? {}), columns: planColumns(plan, model.id, options), views,
    }
    if (model.isBusinessMain) {
      for (const view of modelViews) {
        if (!tables[model.metaName]?.views[planViewId(view)]) throw new Error(`RUNTIME_DATA_SET_PLAN: 默认模型视图未装配 ${view.id}`)
      }
    }
  }
  const metadata: DataSetMetadata = {
    schemaVersion: 2, scenarioId: plan.scenarioId, dataSetName: plan.name || plan.scenarioId,
    tables, viewCascades: cascades, resourceRelations: planRelations(plan),
  }
  return Object.freeze({plan, metadata, viewCascades: Object.freeze(cascades)})
}
