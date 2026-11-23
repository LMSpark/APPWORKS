/**
 * @module @spark-appworks/spark-data:runtime-data-set-plan/parser
 * 职责：严格解析后端独立 `spark.runtimeDataSetPlan` 文件并冻结跨层结构。
 * 边界：只校验 Plan JSON、身份与引用完整性，不读取模型 rows、权限或文件。
 * AI用途：装配独立 Dataset 前，先用同一解析器确认 schemaVersion、scenarioId、views 与 dependencies。
 */
import { isRecord } from '@spark-appworks/spark-utils'
import { DataViewFieldCascadeDefinition } from '../strategies/cascade/field-cascade-definition'
import {
  RUNTIME_DATA_SET_PLAN_KIND,
  RUNTIME_DATA_SET_PLAN_SCHEMA_VERSION,
  type RuntimeDataSetPlanDependency,
  type RuntimeDataSetPlanFile,
} from './types'

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const unknown = Object.keys(value).find(key => !allowed.includes(key))
  if (unknown) throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: 未知字段 ${unknown}`)
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: 必须是字符串`)
  return value
}

function identity(value: unknown, path: string): string {
  const result = text(value, path)
  if (!result.trim() || result !== result.trim()) throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: 必须是非空且无首尾空白字符串`)
  return result
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: 必须是布尔值`)
  return value
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: 必须是数组`)
  return value
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: 必须是对象`)
  return value
}

function number(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: 必须是有限数值`)
  return value
}

function dependency(input: unknown, path: string): RuntimeDataSetPlanDependency {
  const value = object(input, path)
  exactKeys(value, ['dependKey', 'sourceDataViewId', 'sourceModelId', 'sourceField', 'label', 'emptyValueMode'], path)
  const emptyValueMode = text(value['emptyValueMode'], `${path}.emptyValueMode`)
  if (emptyValueMode !== 'emptyResult' && emptyValueMode !== 'omit' && emptyValueMode !== 'asNull') {
    throw new Error(`RUNTIME_DATA_SET_PLAN.${path}.emptyValueMode: 不支持的空值策略`)
  }
  return Object.freeze({
    dependKey: identity(value['dependKey'], `${path}.dependKey`),
    sourceDataViewId: identity(value['sourceDataViewId'], `${path}.sourceDataViewId`),
    sourceModelId: identity(value['sourceModelId'], `${path}.sourceModelId`),
    sourceField: text(value['sourceField'], `${path}.sourceField`),
    label: text(value['label'], `${path}.label`),
    emptyValueMode,
  })
}

function parsePlanModel(input: unknown, path: string): RuntimeDataSetPlanFile['models'][number] {
  const value = object(input, path)
  exactKeys(value, ['id', 'metaName', 'name', 'description', 'sourceType', 'isBusinessMain', 'isBusiness',
    'outputType', 'filter', 'parentField', 'hasChildField', 'selfType', 'topValue', 'cacheType', 'join', 'crud'], path)
  const join = object(value['join'], `${path}.join`)
  exactKeys(join, ['joinType', 'foreignKeyFields', 'joinFilter', 'pId'], `${path}.join`)
  const crud = object(value['crud'], `${path}.crud`)
  exactKeys(crud, ['addApi', 'updateApi', 'deleteApi'], `${path}.crud`)
  return Object.freeze({
    id: identity(value['id'], `${path}.id`), metaName: identity(value['metaName'], `${path}.metaName`),
    name: text(value['name'], `${path}.name`), description: text(value['description'], `${path}.description`),
    sourceType: text(value['sourceType'], `${path}.sourceType`),
    isBusinessMain: boolean(value['isBusinessMain'], `${path}.isBusinessMain`),
    isBusiness: boolean(value['isBusiness'], `${path}.isBusiness`),
    outputType: text(value['outputType'], `${path}.outputType`), filter: text(value['filter'], `${path}.filter`),
    parentField: text(value['parentField'], `${path}.parentField`),
    hasChildField: text(value['hasChildField'], `${path}.hasChildField`), selfType: text(value['selfType'], `${path}.selfType`),
    topValue: text(value['topValue'], `${path}.topValue`), cacheType: text(value['cacheType'], `${path}.cacheType`),
    join: Object.freeze({
      joinType: text(join['joinType'], `${path}.join.joinType`),
      foreignKeyFields: text(join['foreignKeyFields'], `${path}.join.foreignKeyFields`),
      joinFilter: text(join['joinFilter'], `${path}.join.joinFilter`), pId: text(join['pId'], `${path}.join.pId`),
    }),
    crud: Object.freeze({
      addApi: text(crud['addApi'], `${path}.crud.addApi`), updateApi: text(crud['updateApi'], `${path}.crud.updateApi`),
      deleteApi: text(crud['deleteApi'], `${path}.crud.deleteApi`),
    }),
  })
}

function parsePlanModelField(input: unknown, path: string): RuntimeDataSetPlanFile['modelFields'][number] {
  const value = object(input, path)
  exactKeys(value, ['id', 'dataModelId', 'type', 'name', 'description', 'fieldType', 'isOutput', 'asName',
    'orderType', 'order', 'group', 'isPKey'], path)
  if (value['type'] !== 'dataModel') throw new Error(`RUNTIME_DATA_SET_PLAN.${path}.type: 仅支持 dataModel`)
  return Object.freeze({
    id: identity(value['id'], `${path}.id`), dataModelId: identity(value['dataModelId'], `${path}.dataModelId`),
    type: 'dataModel' as const, name: identity(value['name'], `${path}.name`),
    description: text(value['description'], `${path}.description`), fieldType: text(value['fieldType'], `${path}.fieldType`),
    isOutput: boolean(value['isOutput'], `${path}.isOutput`), asName: text(value['asName'], `${path}.asName`),
    orderType: text(value['orderType'], `${path}.orderType`), order: number(value['order'], `${path}.order`),
    group: number(value['group'], `${path}.group`), isPKey: boolean(value['isPKey'], `${path}.isPKey`),
  })
}

function parsePlanView(input: unknown, path: string): RuntimeDataSetPlanFile['views'][number] {
  const value = object(input, path)
  exactKeys(value, ['id', 'code', 'name', 'description', 'dataModelId', 'isDefault', 'outputType', 'filter',
    'dependencies', 'parentField', 'hasChildField', 'selfType', 'topValue', 'cacheType',
    'pagination', 'allPages', 'page', 'pageSize'], path)
  const dependencies = array(value['dependencies'], `${path}.dependencies`).map((item, index) =>
    dependency(item, `${path}.dependencies[${index}]`))
  const pagination = value['pagination']
  if (pagination !== undefined && pagination !== 'paged' && pagination !== 'none') {
    throw new Error(`RUNTIME_DATA_SET_PLAN.${path}.pagination: 仅支持 paged 或 none`)
  }
  const dependKeys = new Set<string>()
  for (const item of dependencies) {
    if (dependKeys.has(item.dependKey)) throw new Error(`RUNTIME_DATA_SET_PLAN.${path}: DependKey 重复 ${item.dependKey}`)
    dependKeys.add(item.dependKey)
  }
  return Object.freeze({
    id: identity(value['id'], `${path}.id`), code: text(value['code'], `${path}.code`),
    name: text(value['name'], `${path}.name`), description: text(value['description'], `${path}.description`),
    dataModelId: identity(value['dataModelId'], `${path}.dataModelId`),
    isDefault: boolean(value['isDefault'], `${path}.isDefault`), outputType: text(value['outputType'], `${path}.outputType`),
    filter: text(value['filter'], `${path}.filter`), dependencies: Object.freeze(dependencies),
    parentField: text(value['parentField'], `${path}.parentField`),
    hasChildField: text(value['hasChildField'], `${path}.hasChildField`), selfType: text(value['selfType'], `${path}.selfType`),
    topValue: text(value['topValue'], `${path}.topValue`), cacheType: text(value['cacheType'], `${path}.cacheType`),
    pagination: pagination ?? 'paged',
    allPages: value['allPages'] === undefined ? false : boolean(value['allPages'], `${path}.allPages`),
    page: value['page'] === undefined ? 1 : number(value['page'], `${path}.page`),
    pageSize: value['pageSize'] === undefined ? 20 : number(value['pageSize'], `${path}.pageSize`),
  })
}

function parsePlanViewField(input: unknown, path: string): RuntimeDataSetPlanFile['viewFields'][number] {
  const value = object(input, path)
  exactKeys(value, ['id', 'dataViewId', 'dataModelId', 'name', 'description', 'fieldType', 'isOutput', 'asName',
    'orderType', 'order', 'group', 'sort', 'isPKey', 'display', 'valueSource', 'sourceDataViewId', 'sourceModelId', 'sourceField'], path)
  const display = object(value['display'], `${path}.display`)
  exactKeys(display, ['kind', 'fromDataViewId', 'valueField', 'labelField'], `${path}.display`)
  const kind = text(display['kind'], `${path}.display.kind`)
  if (kind !== 'text' && kind !== 'map') throw new Error(`RUNTIME_DATA_SET_PLAN.${path}.display.kind: 不支持的展示类型`)
  const valueSource = text(value['valueSource'], `${path}.valueSource`)
  if (valueSource !== 'model' && valueSource !== 'dependency') throw new Error(`RUNTIME_DATA_SET_PLAN.${path}.valueSource: 不支持的字段来源`)
  return Object.freeze({
    id: identity(value['id'], `${path}.id`), dataViewId: identity(value['dataViewId'], `${path}.dataViewId`),
    dataModelId: identity(value['dataModelId'], `${path}.dataModelId`), name: identity(value['name'], `${path}.name`),
    description: text(value['description'], `${path}.description`), fieldType: text(value['fieldType'], `${path}.fieldType`),
    isOutput: boolean(value['isOutput'], `${path}.isOutput`), asName: text(value['asName'], `${path}.asName`),
    orderType: text(value['orderType'], `${path}.orderType`), order: number(value['order'], `${path}.order`),
    group: number(value['group'], `${path}.group`), sort: number(value['sort'], `${path}.sort`),
    isPKey: boolean(value['isPKey'], `${path}.isPKey`),
    display: Object.freeze({
      kind, fromDataViewId: text(display['fromDataViewId'], `${path}.display.fromDataViewId`),
      valueField: text(display['valueField'], `${path}.display.valueField`),
      labelField: text(display['labelField'], `${path}.display.labelField`),
    }),
    valueSource, sourceDataViewId: text(value['sourceDataViewId'], `${path}.sourceDataViewId`),
    sourceModelId: text(value['sourceModelId'], `${path}.sourceModelId`),
    sourceField: text(value['sourceField'], `${path}.sourceField`),
  })
}

function parsePlanRelation(input: unknown, path: string): RuntimeDataSetPlanFile['relations'][number] {
  const value = object(input, path)
  exactKeys(value, ['id', 'parentModelId', 'childModelId', 'depType', 'filter', 'cascadeDel', 'childTable', 'parentTable'], path)
  return Object.freeze({
    id: identity(value['id'], `${path}.id`), parentModelId: identity(value['parentModelId'], `${path}.parentModelId`),
    childModelId: identity(value['childModelId'], `${path}.childModelId`), depType: text(value['depType'], `${path}.depType`),
    filter: text(value['filter'], `${path}.filter`), cascadeDel: boolean(value['cascadeDel'], `${path}.cascadeDel`),
    childTable: identity(value['childTable'], `${path}.childTable`), parentTable: identity(value['parentTable'], `${path}.parentTable`),
  })
}

/** 解析并冻结独立 Dataset Plan；expectedScenarioId 用于运行调用身份校验。 */
export function parseRuntimeDataSetPlanFile(raw: string, expectedScenarioId?: string): RuntimeDataSetPlanFile {
  if (!raw.trim()) throw new Error('RUNTIME_DATA_SET_PLAN: 文件内容为空')
  let input: unknown
  try { input = JSON.parse(raw) } catch { throw new Error('RUNTIME_DATA_SET_PLAN: 文件不是合法 JSON') }
  const root = object(input, 'root')
  exactKeys(root, ['schemaVersion', 'kind', 'scenarioId', 'name', 'description', 'type', 'savedAt', 'contentHash',
    'source', 'inputParams', 'models', 'modelFields', 'views', 'viewFields', 'fieldCascades', 'relations', 'linkage'], 'root')
  if (root['schemaVersion'] !== RUNTIME_DATA_SET_PLAN_SCHEMA_VERSION) {
    throw new Error(`RUNTIME_DATA_SET_PLAN.schemaVersion: 不支持 ${String(root['schemaVersion'])}`)
  }
  if (root['kind'] !== RUNTIME_DATA_SET_PLAN_KIND) throw new Error('RUNTIME_DATA_SET_PLAN.kind: 文件类型不匹配')
  const scenarioId = identity(root['scenarioId'], 'scenarioId')
  if (expectedScenarioId && scenarioId !== expectedScenarioId) {
    throw new Error(`RUNTIME_DATA_SET_PLAN.scenarioId: 期望 ${expectedScenarioId}，实际 ${scenarioId}`)
  }
  const source = object(root['source'], 'source')
  exactKeys(source, ['dataSetId', 'exportedFrom', 'graphFile'], 'source')
  if (source['dataSetId'] !== scenarioId || source['exportedFrom'] !== 'data-space-design') {
    throw new Error('RUNTIME_DATA_SET_PLAN.source: 数据空间来源不匹配')
  }
  const contentHash = identity(root['contentHash'], 'contentHash')
  if (!/^fnv1a:[0-9a-f]{8}$/u.test(contentHash)) {
    throw new Error('RUNTIME_DATA_SET_PLAN.contentHash: 必须是 fnv1a:xxxxxxxx')
  }
  const models = array(root['models'], 'models').map((item, index) => parsePlanModel(item, `models[${index}]`))
  const modelFields = array(root['modelFields'], 'modelFields').map((item, index) => parsePlanModelField(item, `modelFields[${index}]`))
  const views = array(root['views'], 'views').map((item, index) => parsePlanView(item, `views[${index}]`))
  const viewFields = array(root['viewFields'], 'viewFields').map((item, index) => parsePlanViewField(item, `viewFields[${index}]`))
  const fieldCascades = root['fieldCascades'] === undefined ? [] : array(root['fieldCascades'], 'fieldCascades')
    .map(item => DataViewFieldCascadeDefinition.parse(item))
  const relations = array(root['relations'], 'relations').map((item, index) => parsePlanRelation(item, `relations[${index}]`))
  const inputParams = array(root['inputParams'], 'inputParams').map((rawInput, index) => {
    const path = `inputParams[${index}]`, value = object(rawInput, path)
    exactKeys(value, ['rowid', 'name', 'description', 'isBusParam'], path)
    return Object.freeze({rowid: identity(value['rowid'], `${path}.rowid`), name: identity(value['name'], `${path}.name`),
      description: text(value['description'], `${path}.description`), isBusParam: boolean(value['isBusParam'], `${path}.isBusParam`)})
  })
  const linkage = object(root['linkage'], 'linkage')
  exactKeys(linkage, ['edges'], 'linkage')
  const edges = array(linkage['edges'], 'linkage.edges').map((rawInput, index) => {
    const path = `linkage.edges[${index}]`, value = object(rawInput, path)
    exactKeys(value, ['parentModelId', 'childModelId', 'depType', 'filter', 'trigger'], path)
    if (value['trigger'] !== 'current') throw new Error(`RUNTIME_DATA_SET_PLAN.${path}.trigger: 仅支持 current`)
    return Object.freeze({parentModelId: identity(value['parentModelId'], `${path}.parentModelId`),
      childModelId: identity(value['childModelId'], `${path}.childModelId`), depType: text(value['depType'], `${path}.depType`),
      filter: text(value['filter'], `${path}.filter`), trigger: 'current' as const})
  })
  const modelIds = new Set(models.map(model => model.id)), modelNames = new Set(models.map(model => model.metaName))
  if (modelIds.size !== models.length || modelNames.size !== models.length) throw new Error('RUNTIME_DATA_SET_PLAN: 模型身份或注册名重复')
  if (new Set(views.map(view => view.id)).size !== views.length) throw new Error('RUNTIME_DATA_SET_PLAN: DataView ID 重复')
  if (new Set(viewFields.map(field => field.id)).size !== viewFields.length) throw new Error('RUNTIME_DATA_SET_PLAN: 视图字段 ID 重复')
  for (const field of modelFields) if (!modelIds.has(field.dataModelId)) throw new Error(`RUNTIME_DATA_SET_PLAN: 字段 ${field.id} 模型不存在`)
  const viewMap = new Map(views.map(view => [view.id, view]))
  for (const view of views) if (!modelIds.has(view.dataModelId)) throw new Error(`RUNTIME_DATA_SET_PLAN: 视图 ${view.id} 模型不存在`)
  for (const field of viewFields) {
    const view = viewMap.get(field.dataViewId)
    if (view?.dataModelId !== field.dataModelId) throw new Error(`RUNTIME_DATA_SET_PLAN: 视图字段 ${field.id} 归属不匹配`)
  }
  return Object.freeze({
    schemaVersion: RUNTIME_DATA_SET_PLAN_SCHEMA_VERSION, kind: RUNTIME_DATA_SET_PLAN_KIND, scenarioId,
    name: text(root['name'], 'name'), description: text(root['description'], 'description'), type: text(root['type'], 'type'),
    savedAt: text(root['savedAt'], 'savedAt'), contentHash,
    source: Object.freeze({dataSetId: scenarioId, exportedFrom: 'data-space-design' as const,
      graphFile: text(source['graphFile'], 'source.graphFile')}),
    inputParams: Object.freeze(inputParams), models: Object.freeze(models), modelFields: Object.freeze(modelFields),
    views: Object.freeze(views), viewFields: Object.freeze(viewFields), fieldCascades: Object.freeze(fieldCascades),
    relations: Object.freeze(relations),
    linkage: Object.freeze({edges: Object.freeze(edges)}),
  })
}
