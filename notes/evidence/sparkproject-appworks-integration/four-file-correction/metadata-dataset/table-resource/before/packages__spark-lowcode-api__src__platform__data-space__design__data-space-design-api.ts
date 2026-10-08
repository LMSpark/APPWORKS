/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/design/data-space-design-api
 * 职责：读取场景正式模型与关系，并保留目录设计审计及 mutation 命令准备入口。
 * 边界：正式读取复用 runtime query 与请求 scope；不以物理目录替代运行模型，不执行设计写入。
 * AI用途：装配场景视图或创建草稿时核对真实模型 Name、输出字段和关系归属。
 */
import type { HttpClientBase } from '@spark-appworks/spark-utils'
import { DataViewFilter } from '@spark-appworks/spark-data'
import type { DataSpaceRuntimeApi } from '../runtime/data-space-runtime-api.js'
import type { DataSpaceRequestScope } from '../runtime/data-space-runtime-contract.js'
import { collectDataSpaceQueryPages } from '../runtime/protocol/data-space-pagination.js'
import { decodeDataSpaceFilter, encodeDataSpaceFilter } from '../runtime/protocol/data-space-filter.js'
import { parseDataSpaceValueFunction } from '../runtime/protocol/data-space-value-function.js'
import type { DataViewFilterValueFunction } from '@spark-appworks/spark-data'

import {
  LowcodeCatalogApi,
  type LowcodeDatabaseCatalog,
  type LowcodeDatabaseResource,
} from '../../../catalog/lowcode-catalog-api.js'
import { LowcodeApiError } from '../../../core/lowcode-api-error.js'
import { LowcodeClient } from '../../../core/lowcode-client.js'
import {
  DataSpaceFrontendModel,
  type DataSpaceFieldReference,
  type DataSpaceFrontendModelQuery,
  type LowcodeModelRelationRecord,
  type DataSpaceResourceReference,
  type DataSpaceResourceField,
  type DataSpaceResourceType,
} from '../data-space.js'
import { parseDataSpaceResourceType } from '../data-space-resource-type-wire.js'
import type { OrderType } from '../../../contracts/lowcode-wire-query.js'
import {
  prepareDataSpaceDesignMutation,
  type DataSpaceDesignMutationCommand,
  type DataSpaceDesignMutationInput,
} from './data-space-design-mutation.js'

/** 设计态 GetData 固定 FormKey；与权限/目录等设计读共用，变更须全链路回归。 */
export const DATA_SPACE_DESIGN_FORM_KEY = '8D1AB14DD8277F3E7017CD38F77B09FD'

/** 数据空间入参定义；inputParams JSON 解析失败会 fail-fast。 */
export type DataSpaceInputParameter = Readonly<{
  parameterId: string
  name: string
  description: string
  business: boolean
}>

/** 数据空间设计态完整快照；作为 mutation 写前镜像（preimage）与读回验收基准。 */
export type DataSpaceDesignSnapshot = Readonly<{
  dataSpaceId: string
  name: string
  description: string
  inputParameters: readonly DataSpaceInputParameter[]
  resources: readonly DataSpaceResourceReference[]
  models: readonly DataSpaceFrontendModel[]
  relations: readonly LowcodeModelRelationRecord[]
}>

/** 设计态读取输入；catalogFormKeys 用于解析 table/view 资源的稳定目录身份。 */
export type DataSpaceDesignReadInput = Readonly<{
  dataSpaceId: string
  catalogFormKeys: string | readonly string[]
}>

type DesignRows = Readonly<{
  dataSpaces: ReadonlyArray<Record<string, unknown>>
  models: ReadonlyArray<Record<string, unknown>>
  fields: ReadonlyArray<Record<string, unknown>>
  relations: ReadonlyArray<Record<string, unknown>>
}>

type DataSpacePrimaryKeyCommand = Readonly<{
  modelId: string
  model: Record<string, unknown>
  resource: LowcodeDatabaseResource
  rows: DesignRows
}>

type DataSpaceResourceReferenceCommand = Readonly<{
  modelId: string
  row: Record<string, unknown>
  rows: DesignRows
  catalog: LowcodeDatabaseCatalog
  catalogApi: LowcodeCatalogApi
}>

type DataSpaceFrontendModelsCommand = Readonly<{
  dataSpaceId: string
  rows: DesignRows
  catalog: LowcodeDatabaseCatalog
  catalogApi: LowcodeCatalogApi
}>

const DESIGN_DATABASE = 'QYVirtualPlat'
const DATA_SPACE_TABLE = 'Base_DataSet'
const MODEL_TABLE = 'Base_DataModel'
const FIELD_TABLE = 'Base_DataModel_Field'
const RELATION_TABLE = 'Base_DataModel_Relation'
const RELATION_DEPENDENCY_DICTIONARY = '数据关系依赖'
const DICTIONARY_PAGE_SIZE = 500

/** 正式元数据查询的消费行；保留字段原值，不包含可由调用方替换的查询凭据。 */
type DataSpaceFormalRow = Readonly<Record<string, unknown>>
/** designScenarioId 查询元数据，dataSpaceId 校验模型归属；二者不从菜单或请求应用推导。 */
type DataSpaceFormalReadInput = Readonly<{
  designScenarioId: string
  dataSpaceId: string
  metaName: string
  assertCurrent?: () => void
}>
/** name 是正式字段 Name，canonicalName 是输出别名；type 是原 FieldType，未知时保持空值。 */
type DataSpaceFormalField = Readonly<{
  id: string; modelId: string; name: string; canonicalName: string; type: string
  primaryKey: boolean; description: string; output: boolean; computed: boolean
  order: number; orderType: string; raw: DataSpaceFormalRow
}>
/** 正式模型输出合同；来源名与查询模型 Name 分离，primaryKey 空字符串表示无键只读。 */
type DataSpaceFormalModel = Readonly<{
  id: string; metaName: string; name: string; sourceName: string; sourceId: string
  sourceType: string; primaryKey: string; businessMain: boolean
  fields: readonly DataSpaceFormalField[]; raw: DataSpaceFormalRow
}>
/** 单场景模型目录或关系读取身份；调用方 guard 与请求 scope 共同拒绝迟到结果。 */
type DataSpaceFormalScenarioReadInput = Omit<DataSpaceFormalReadInput, 'metaName'>
type DataSpaceFormalSpaceDefinition = Readonly<{ dataSpaceId: string; name: string }>
/** 正式关系消费合同；过滤由唯一 codec 解码，视图和字段引用由场景装配验证。 */
type DataSpaceFormalRelation = Omit<LowcodeModelRelationRecord, 'filterExpression'> & Readonly<{
  filterExpression: DataViewFilter
}>
/** 注入既有 HTTP、共享 query/save owner 与实时应用登录 scope，不另造身份来源。 */
type DataSpaceDesignApiOptions = Readonly<{
  http: HttpClientBase
  runtime: DataSpaceRuntimeApi
  readScope: () => DataSpaceRequestScope
}>
type DataSpaceFormalQueryCommand = Readonly<{
  designScenarioId: string
  metaName: string
  filter: DataViewFilter
  assertCurrent: () => void
}>

function formalText(row: DataSpaceFormalRow, keys: readonly string[]): string {
  for (const key of keys) {
    if (typeof row[key] === 'boolean') continue
    const value = text(row[key])
    if (value) return value
  }
  return ''
}

function formalRowId(row: DataSpaceFormalRow): string {
  return formalText(row, ['rowid', 'ROWID', 'RowID', 'rowId', 'id', 'Id'])
}

function formalComputedValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false
  if (typeof value !== 'string') return true
  try { const parsed: unknown = JSON.parse(value); return parsed !== null && parsed !== '' } catch { return Boolean(value.trim()) }
}

function formalDatabaseTable(row: DataSpaceFormalRow): boolean {
  return ['数据库表', '表', 'table'].includes(formalText(row, ['Type', 'type']))
}

function formalField(row: DataSpaceFormalRow, sourcePrimaryKey: string): DataSpaceFormalField {
  const name = requiredText(formalText(row, ['Name', 'name']), '正式字段 Name')
  const order = Number(row['Order'] ?? row['order'])
  return Object.freeze({ id: requiredText(formalRowId(row), '正式字段 ID'),
    modelId: formalText(row, ['dataModelId', 'DataModelId', 'datamodelid']), name,
    canonicalName: formalText(row, ['AsName', 'asName', 'asname']) || name,
    type: formalText(row, ['FieldType', 'fieldType', 'fieldtype']),
    primaryKey: sourcePrimaryKey ? name === sourcePrimaryKey : binary(row['IsPKey'] ?? row['isPKey']),
    description: formalText(row, ['description', 'Description']),
    output: binary(row['IsOutput'] ?? row['isOutput']),
    computed: formalComputedValue(row['ValueFun'] ?? row['valueFun']) || Boolean(text(row['Expression'] ?? row['expression'])),
    order: Number.isSafeInteger(order) && order >= 0 ? order : 0,
    orderType: formalText(row, ['OrderType', 'orderType', 'ordertype']), raw: row })
}

function sameSemanticValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right || left === null || right === null || typeof left !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => sameSemanticValue(value, right[index]))
  if (!isRecord(left) || !isRecord(right)) return false
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index]
    && sameSemanticValue(left[key], right[key]))
}

function sameFormalOutput(left: DataSpaceFormalField, right: DataSpaceFormalField): boolean {
  return left.name === right.name && left.canonicalName === right.canonicalName && left.type === right.type
    && left.primaryKey === right.primaryKey && left.description === right.description && left.output === right.output
    && left.computed === right.computed && left.order === right.order && left.orderType === right.orderType
    && ['Group', 'Value', 'ValueFun', 'Expression', 'Distinct'].every(key => {
      const read = (row: DataSpaceFormalRow) => Object.keys(row).find(name => name.toLowerCase() === key.toLowerCase())
      const leftKey = read(left.raw); const rightKey = read(right.raw)
      return leftKey === undefined || rightKey === undefined
        ? leftKey === rightKey
        : sameSemanticValue(left.raw[leftKey], right.raw[rightKey])
    })
}

function projectFormalModel(row: DataSpaceFormalRow, fieldRows: readonly DataSpaceFormalRow[], sourcePrimaryKey: string): DataSpaceFormalModel {
  const id = requiredText(formalRowId(row), '正式模型 ID')
  const metaName = requiredText(formalText(row, ['Name', 'name']), '正式模型 Name')
  const fields = Object.freeze(fieldRows.map(field => formalField(field, sourcePrimaryKey)))
  const declared = formalText(row, ['PrimaryKeyFields', 'primaryKeyFields', 'primarykeyfields'])
  const candidates = sourcePrimaryKey ? fields.filter(field => field.name === sourcePrimaryKey)
    : fields.filter(field => declared !== '' && (field.name === declared || field.canonicalName === declared))
  const key = candidates[0]
  const keyless = !formalDatabaseTable(row) && sourcePrimaryKey === '' && declared === ''
    && fields.every(field => !field.primaryKey)
  const declaredMatches = fields.filter(field => field.name === declared || field.canonicalName === declared)
  if ((!key && !keyless) || (key && sourcePrimaryKey === '' && candidates.length !== 1)
    || (key && candidates.some(field => !sameFormalOutput(key, field) || !field.primaryKey || !field.output || field.computed
      || field.name.toLowerCase() === 'lingma_sys_ent'))
    || (key && fields.some(field => field.canonicalName === key.canonicalName && !candidates.includes(field)))
    || (sourcePrimaryKey && declared && (!declaredMatches.length || declaredMatches.some(field => field.name !== sourcePrimaryKey)))) {
    throw new LowcodeApiError(0, `数据空间模型 ${metaName} 的正式主键无法映射到唯一有效输出字段`)
  }
  return Object.freeze({ id, metaName, name: metaName,
    sourceName: requiredText(formalText(row, ['MetaName', 'metaName', 'metaname']), '正式模型来源名'),
    sourceId: formalText(row, ['DbId', 'dbId', 'DBID', 'dbid', 'PId', 'pid']),
    sourceType: formalText(row, ['Type', 'type']), primaryKey: key?.canonicalName ?? '',
    businessMain: binary(row['IsBusinessMain'] ?? row['isBusinessMain']), fields, raw: row })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim()
}

function requiredText(value: unknown, name: string): string {
  const normalized = text(value)
  if (!normalized) throw new LowcodeApiError(0, `${name} 不能为空`)
  return normalized
}

function binary(value: unknown): boolean {
  return value === true || Number(value) === 1
}

function binaryDefault(value: unknown, fallback: boolean): boolean {
  return value === undefined || value === null || value === '' ? fallback : binary(value)
}

function integer(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed)) throw new LowcodeApiError(0, `字段值不是整数: ${String(value)}`)
  return parsed
}

function parseFieldOrderType(value: unknown): OrderType | '' {
  const raw = text(value)
  if (!raw) return ''
  if (raw === 'ascending' || raw === 'descending') return raw
  throw new LowcodeApiError(0, `未知 OrderType: ${raw}`)
}

function serializedText(value: unknown): string {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function resourceType(value: unknown): DataSpaceResourceType {
  return parseDataSpaceResourceType(value)
}

function queryFilter(field: string, value: string): Readonly<Record<string, unknown>> {
  return {
    Type: 'and',
    Filters: [{
      Type: 'cond',
      Field: field,
      Operator: 'equal',
      ValueFun: { Type: 'GetConstValue', Value: value },
    }],
  }
}

function queryPayload(tableName: string, field: string, value: string): Readonly<Record<string, unknown>> {
  return {
    Table: [{
      Name: tableName,
      DbName: DESIGN_DATABASE,
      PrimaryKeyFields: 'rowid',
      Type: '数据库表',
      OutputType: 'Table',
      Filter: queryFilter(field, value),
      inputParams: [],
      DISTINCT: true,
      IsBusinessMain: 1,
      RelationFilterType: 'and',
    }],
  }
}

function resultRows(result: unknown): ReadonlyArray<Record<string, unknown>> {
  if (!isRecord(result)) throw new LowcodeApiError(0, '数据空间设计响应不是对象')
  const data = result['data'] ?? result['Data']
  if (!isRecord(data)) throw new LowcodeApiError(0, '数据空间设计响应缺少 data')
  const items = data['Items'] ?? data['items'] ?? data['Result'] ?? data['result']
  if (!Array.isArray(items) || !items.every(isRecord)) {
    throw new LowcodeApiError(0, '数据空间设计响应 Items 不是对象数组')
  }
  return items
}

function dictionaryPage(result: unknown): Readonly<{ rows: readonly DataSpaceFormalRow[]; total: unknown }> {
  if (!isRecord(result)) throw new LowcodeApiError(0, '数据关系依赖字典响应不是对象')
  const data = result['data'] ?? result['Data']
  if (!isRecord(data)) throw new LowcodeApiError(0, '数据关系依赖字典响应缺少 data')
  const rows = data['Items'] ?? data['items'] ?? data['List'] ?? data['list']
  if (!Array.isArray(rows) || !rows.every(isRecord)) {
    throw new LowcodeApiError(0, '数据关系依赖字典 Items 不是对象数组')
  }
  const total = data['Count'] ?? data['Total'] ?? data['TotalCount'] ?? data['count'] ?? data['total'] ?? data['totalCount']
  return { rows, total }
}

function isDictionaryScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function relationDependencyOptions(rows: readonly DataSpaceFormalRow[]): ReadonlyArray<Readonly<{ label: string; value: string }>> {
  const orders = rows.map(row => {
    const raw = row['ordIdx']
    if (raw === undefined || raw === null || raw === '') return undefined
    const order = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(order)) throw new LowcodeApiError(0, '数据关系依赖字典 ordIdx 不是有效数值')
    return order
  })
  const orderedRows = orders.some(order => order === undefined) ? rows
    : rows.map((row, index) => ({ row, order: orders[index], index }))
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.index - right.index)
      .map(item => item.row)
  return Object.freeze(orderedRows.map((row, index) => {
    const rawLabel = row['label'] ?? row['txt'] ?? row['Label'] ?? row['Text'] ?? row['name'] ?? row['Name']
    const rawValue = row['value'] ?? row['val'] ?? row['Value'] ?? row['code'] ?? row['Code']
    if (!isDictionaryScalar(rawLabel)) throw new LowcodeApiError(0, `数据关系依赖字典第 ${index + 1} 项 label 不是标量`)
    if (!isDictionaryScalar(rawValue)) throw new LowcodeApiError(0, `数据关系依赖字典第 ${index + 1} 项 value 不是标量`)
    const label = String(rawLabel).trim()
    if (!label) throw new LowcodeApiError(0, `数据关系依赖字典第 ${index + 1} 项缺少 label`)
    if (String(rawValue).trim() === '') {
      throw new LowcodeApiError(0, `数据关系依赖字典第 ${index + 1} 项缺少 value`)
    }
    return Object.freeze({ label, value: String(rawValue) })
  }))
}

function parseInputParameters(value: unknown): readonly DataSpaceInputParameter[] {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new LowcodeApiError(0, '数据空间 inputParams 不是有效 JSON')
    }
  }
  if (parsed === undefined || parsed === null || parsed === '') return []
  if (!Array.isArray(parsed)) throw new LowcodeApiError(0, '数据空间 inputParams 不是数组')
  return parsed.map((item) => {
    if (!isRecord(item)) throw new LowcodeApiError(0, '数据空间 inputParams 包含非对象项')
    return {
      parameterId: requiredText(item['rowid'] ?? item['id'], 'input parameter id'),
      name: requiredText(item['Name'] ?? item['name'], 'input parameter name'),
      description: text(item['Description'] ?? item['description']),
      business: binary(item['IsBusiness'] ?? item['IsBusParam'] ?? item['business']),
    }
  })
}

function resourceFields(resource: LowcodeDatabaseResource): readonly DataSpaceResourceField[] {
  return resource.fields.map((field) => ({
    resourceFieldId: field.id,
    name: requiredText(field.name, `资源 ${resource.id} 字段 name`),
    label: field.label,
    dataType: field.dataType,
    dataTypeName: field.dataTypeName,
    length: field.length,
    nullable: field.nullable,
    primaryKey: field.primaryKey,
    unique: field.unique,
    system: field.system,
    defaultValue: field.defaultValue,
    description: field.memo,
    order: field.order,
  }))
}

function modelFields(
  modelId: string,
  resource: DataSpaceResourceReference,
  rows: DesignRows,
): readonly DataSpaceFieldReference[] {
  return rows.fields
    .filter((row) => text(row['dataModelId']) === modelId)
    .filter((row) => !text(row['type']) || text(row['type']) === 'dataModel')
    .map((row) => {
      const resourceField = requiredText(row['Name'] ?? row['name'], 'field Name')
      const fieldType = text(row['FieldType'] ?? row['fieldType'])
      const derived = fieldType === '引用' || fieldType === '计算字段'
      const resolvedField = resource.fields.find((field) => field.name === resourceField)
      if (!derived && resolvedField === undefined) {
        throw new LowcodeApiError(0, `模型字段未解析到资源字段: ${modelId}/${resourceField}`)
      }
      return {
        fieldId: requiredText(row['rowid'], 'field rowid'),
        resourceFieldId: resolvedField?.resourceFieldId ?? null,
        resourceField,
        alias: text(row['AsName'] ?? row['alias']),
        fieldType,
        output: binaryDefault(row['IsOutput'] ?? row['isOutput'], true),
        order: integer(row['Order'] ?? row['order']),
        orderType: parseFieldOrderType(row['OrderType'] ?? row['orderType']),
        group: integer(row['Group'] ?? row['group']),
        distinct: binary(row['DISTINCT'] ?? row['distinct']),
        primaryKey: binary(row['IsPKey'] ?? row['primaryKey']),
        value: serializedText(row['Value'] ?? row['value']),
        valueFunction: serializedText(row['ValueFun'] ?? row['valueFun']),
        expression: serializedText(row['Expression'] ?? row['expression']),
      }
    })
}

function modelQuery(row: Record<string, unknown>): DataSpaceFrontendModelQuery {
  return {
    outputType: text(row['OutputType'] ?? row['outputType']),
    filter: serializedText(row['Filter'] ?? row['filter']),
    distinct: binary(row['DISTINCT'] ?? row['distinct']),
    businessMain: binary(row['IsBusinessMain'] ?? row['isBusinessMain']),
    joinType: text(row['JoinType'] ?? row['joinType']),
    joinFilter: serializedText(row['JoinFilter'] ?? row['joinFilter']),
    parentModelId: text(row['PId'] ?? row['pId']),
    requestComplete: text(row['RequestComplete'] ?? row['requestComplete']),
    hasChildField: text(row['hasChildField']),
    parentField: text(row['parentField']),
    foreignKeyFields: text(row['ForeignKeyFields'] ?? row['foreignKeyFields']),
    requestType: text(row['requestType']),
    shortName: text(row['ShortName'] ?? row['shortName']),
    cacheType: text(row['cacheType']),
    items: serializedText(row['items']),
    selfType: text(row['selfType']),
    topValue: text(row['topValue']),
  }
}

function dataSpaceRelations(
  rows: readonly DataSpaceFormalRow[],
): readonly LowcodeModelRelationRecord[] {
  return rows.map((row) => {
    return {
      sourceRelationId: requiredText(formalRowId(row), 'relation rowid'),
      dataSpaceId: requiredText(formalText(row, ['dataSetId', 'DataSetId', 'datasetid']), 'relation dataSetId'),
      parentModelId: requiredText(formalText(row, ['parentModId', 'ParentModId', 'parentmodid']), 'relation parentModId'),
      childModelId: requiredText(formalText(row, ['childModId', 'ChildModId', 'childmodid']), 'relation childModId'),
      parentResourceName: requiredText(formalText(row, ['parentTable', 'ParentTable', 'parenttable']), 'relation parentTable'),
      childResourceName: requiredText(formalText(row, ['childTable', 'ChildTable', 'childtable']), 'relation childTable'),
      filterExpression: serializedText(row['filter'] ?? row['Filter']),
      dependencyType: formalText(row, ['depType', 'DepType', 'deptype', 'dependencyType']),
      cascadeDelete: binary(row['cascadeDel'] ?? row['cascadeDelete']),
    }
  })
}

function primaryKey(command: DataSpacePrimaryKeyCommand): string {
  const { modelId, model, resource, rows } = command
  const configured = text(model['PrimaryKeyFields'] ?? model['primaryKeyFields'])
  if (configured) return configured
  const keyField = rows.fields.find((row) => (
    text(row['dataModelId']) === modelId && binary(row['IsPKey'] ?? row['primaryKey'])
  ))
  const modelPrimaryKey = text(keyField?.['Name'] ?? keyField?.['name'])
  if (modelPrimaryKey) return modelPrimaryKey
  const resourcePrimaryKey = resource.fields.find((field) => field.primaryKey === true)?.name
  if (resourcePrimaryKey) return resourcePrimaryKey
  throw new LowcodeApiError(0, `数据资源缺少主键证据: ${resource.id}`)
}

function resourceReference(command: DataSpaceResourceReferenceCommand): DataSpaceResourceReference {
  const { modelId, row, rows, catalog, catalogApi } = command
  const type = resourceType(row['Type'] ?? row['type'])
  const databaseBound = type === 'table' || type === 'view'
  if (!databaseBound) {
    throw new LowcodeApiError(0, `数据资源类型 ${type} 尚无稳定资源目录身份`)
  }
  const databaseId = requiredText(row['DbId'] ?? row['dbId'], 'DbId')
  const resourceName = requiredText(row['MetaName'] ?? row['metaName'], 'MetaName')
  const resolved = catalogApi.resolveDatabaseResource(catalog, {
    databaseId,
    resourceName,
    resourceType: type,
  })
  const database = catalog.databases.find((item) => item.id === resolved.databaseId)
  const configuredDatabaseName = text(row['DbName'] ?? row['dbName'])
  return {
    resourceId: resolved.id,
    databaseId: resolved.databaseId,
    resourceName: resolved.name,
    resourceType: type,
    primaryKeyField: primaryKey({ modelId, model: row, resource: resolved, rows }),
    databaseName: configuredDatabaseName
      ? configuredDatabaseName
      : database?.name ?? '',
    fields: resourceFields(resolved),
  }
}

function frontendModels(command: DataSpaceFrontendModelsCommand): Readonly<{
  models: readonly DataSpaceFrontendModel[]
  resources: readonly DataSpaceResourceReference[]
  relations: readonly LowcodeModelRelationRecord[]
}> {
  const { dataSpaceId, rows, catalog, catalogApi } = command
  const resourcesByModelId = new Map<string, DataSpaceResourceReference>()
  for (const row of rows.models) {
    const modelId = requiredText(row['rowid'], 'model rowid')
    if (requiredText(row['dataSetId'], 'model dataSetId') !== dataSpaceId) {
      throw new LowcodeApiError(0, `前端模型 ${modelId} 不属于数据空间 ${dataSpaceId}`)
    }
    resourcesByModelId.set(modelId, resourceReference({ modelId, row, rows, catalog, catalogApi }))
  }
  const relations = dataSpaceRelations(rows.relations)
  const models = rows.models.map((row) => {
    const modelId = requiredText(row['rowid'], 'model rowid')
    const resource = resourcesByModelId.get(modelId)
    if (resource === undefined) throw new LowcodeApiError(0, `前端模型资源未解析: ${modelId}`)
    return new DataSpaceFrontendModel({
      dataSpaceId,
      modelId,
      name: requiredText(row['Name'] ?? row['name'], 'model Name'),
      resource,
      fields: modelFields(modelId, resource, rows),
      relations: relations.filter((relation) => (
        relation.parentModelId === modelId || relation.childModelId === modelId
      )),
      query: modelQuery(row),
    })
  })
  const resourceById = new Map<string, DataSpaceResourceReference>()
  for (const resource of resourcesByModelId.values()) resourceById.set(resource.resourceId, resource)
  return { models, resources: [...resourceById.values()], relations }
}

/** 数据空间设计态门面；只读拉取与 mutation 命令 prepare，不执行线上写入。 */
export class DataSpaceDesignApi {
  private readonly client: LowcodeClient
  private readonly catalog: LowcodeCatalogApi
  private readonly runtime: DataSpaceRuntimeApi
  private readonly readScope: () => DataSpaceRequestScope

  /** 绑定宿主请求与共享运行 owner；正式读取校验 scope，设计 mutation 仅准备命令。 */
  public constructor(options: DataSpaceDesignApiOptions) {
    this.client = new LowcodeClient(options.http)
    this.catalog = new LowcodeCatalogApi(options.http)
    this.runtime = options.runtime
    this.readScope = options.readScope
  }

  /** Decodes the stored SPARK wire filter for structured model metadata editing. */
  public static parseFilter(serialized: string | null | undefined): DataViewFilter | undefined {
    if (serialized === null || serialized === undefined || serialized.trim() === '') return undefined
    return decodeDataSpaceFilter(serialized)
  }

  /** Encodes a structured model filter using the established SPARK wire contract. */
  public static serializeFilter(filter: DataViewFilter | undefined): string {
    return filter === undefined ? '' : JSON.stringify(encodeDataSpaceFilter(filter))
  }

  /** Parses one serialized model-field ValueFun object without a filter wire envelope. */
  public static parseValueFunction(serialized: string | null | undefined): DataViewFilterValueFunction | undefined {
    if (serialized === null || serialized === undefined || serialized.trim() === '') return undefined
    return parseDataSpaceValueFunction(serialized, 'ValueFun')
  }

  /** Resolves consumable output columns while preserving the complete formal field list. */
  public static resolveOutputFields(model: DataSpaceFormalModel): readonly DataSpaceFormalField[] {
    const outputs: DataSpaceFormalField[] = []
    const byCanonicalName = new Map<string, DataSpaceFormalField>()
    for (const field of model.fields) {
      if (!field.output) continue
      const existing = byCanonicalName.get(field.canonicalName)
      if (existing === undefined) {
        byCanonicalName.set(field.canonicalName, field)
        outputs.push(field)
      } else if (!sameFormalOutput(existing, field)) {
        throw new LowcodeApiError(0, `正式模型输出字段重复: ${model.metaName}`)
      }
    }
    return Object.freeze(outputs)
  }

  /** 仅读取正式空间名称，不扩展模型、目录或输入参数。 */
  public async readSpaceDefinition(input: DataSpaceFormalScenarioReadInput): Promise<DataSpaceFormalSpaceDefinition> {
    const designScenarioId = requiredText(input.designScenarioId, 'designScenarioId')
    const dataSpaceId = requiredText(input.dataSpaceId, 'dataSpaceId')
    const scope = this.readScope().token
    const assertCurrent = () => {
      input.assertCurrent?.()
      if (this.readScope().token !== scope) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 正式空间读取身份已失效')
    }
    assertCurrent()
    const result = await this.runtime.query({ scenarioId: designScenarioId, metaName: DATA_SPACE_TABLE }, {
      filter: DataViewFilter.condition({ field: 'rowid', operator: 'eq', value: dataSpaceId }),
      fields: ['rowid', 'Name'], page: { index: 1, size: 2 },
    })
    assertCurrent()
    const row = result.rows[0]
    if (!result.countReported || result.total !== 1 || result.rows.length !== 1 || row?.['rowid'] !== dataSpaceId
      || typeof row['Name'] !== 'string' || !row['Name'].trim()
      || result.readFieldAccess(row, 'rowid') !== 'visible' || result.readFieldAccess(row, 'Name') !== 'visible') {
      throw new LowcodeApiError(0, `正式数据空间名称必须唯一且可读: ${dataSpaceId}`)
    }
    assertCurrent()
    return Object.freeze({ dataSpaceId, name: row['Name'] })
  }

  /** 以真实场景模型目录发现 Name，再复用正式单模型读取；不借物理 catalog 猜测字段。 */
  public async readModels(input: DataSpaceFormalScenarioReadInput): Promise<readonly DataSpaceFormalModel[]> {
    const designScenarioId = requiredText(input.designScenarioId, 'designScenarioId')
    const dataSpaceId = requiredText(input.dataSpaceId, 'dataSpaceId')
    const scope = this.readScope().token
    const assertCurrent = () => {
      input.assertCurrent?.()
      if (this.readScope().token !== scope) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 正式模型列表读取身份已失效')
    }
    const rows = await this.readFormalRows({ designScenarioId, metaName: MODEL_TABLE, assertCurrent,
      filter: DataViewFilter.condition({ field: 'dataSetId', operator: 'eq', value: dataSpaceId }) })
    if (rows.some(row => formalText(row, ['dataSetId', 'DataSetId', 'datasetid']) !== dataSpaceId)) {
      throw new LowcodeApiError(0, `正式数据空间模型列表归属不一致: ${dataSpaceId}`)
    }
    const names = rows.map(row => requiredText(formalText(row, ['Name', 'name']), '正式模型 Name'))
    if (new Set(names).size !== names.length) throw new LowcodeApiError(0, '正式数据空间模型 Name 不能重复')
    const models: DataSpaceFormalModel[] = []
    for (let index = 0; index < names.length; index++) {
      const metaName = names[index]
      const row = rows[index]
      if (!metaName || !row) throw new LowcodeApiError(0, '正式模型列表身份缺失')
      const model = await this.readModel({ designScenarioId, dataSpaceId, metaName, assertCurrent })
      if (model.id !== formalRowId(row)) throw new LowcodeApiError(0, `正式模型列表读回身份改变: ${metaName}`)
      models.push(model)
    }
    assertCurrent()
    return Object.freeze(models)
  }

  /** 仅读取明确选择的正式模型；完整字段与来源主键验证通过后交付，不查询全物理目录。 */
  public async readModel(input: DataSpaceFormalReadInput): Promise<DataSpaceFormalModel> {
    const designScenarioId = requiredText(input.designScenarioId, 'designScenarioId')
    const dataSpaceId = requiredText(input.dataSpaceId, 'dataSpaceId')
    const metaName = requiredText(input.metaName, 'metaName')
    const scope = this.readScope().token
    const assertCurrent = () => {
      input.assertCurrent?.()
      if (this.readScope().token !== scope) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 正式模型读取身份已失效')
    }
    assertCurrent()
    const result = await this.runtime.query({ scenarioId: designScenarioId, metaName: MODEL_TABLE }, {
      filter: DataViewFilter.group({ logic: 'and', filters: [
        { field: 'dataSetId', operator: 'eq', value: dataSpaceId }, { field: 'Name', operator: 'eq', value: metaName },
      ] }), page: { index: 1, size: 2 },
    })
    assertCurrent()
    const models = result.rows
    const model = models[0]
    if (result.total !== models.length || models.length !== 1 || !model || !formalRowId(model)
      || formalText(model, ['dataSetId', 'DataSetId', 'datasetid']) !== dataSpaceId
      || formalText(model, ['Name', 'name']) !== metaName || !formalText(model, ['MetaName', 'metaName', 'metaname'])) {
      throw new LowcodeApiError(0, `正式数据空间模型必须唯一且属于当前数据空间: ${metaName}`)
    }
    const modelId = formalRowId(model)
    const fields = await this.readFormalRows({ designScenarioId, metaName: FIELD_TABLE, assertCurrent,
      filter: DataViewFilter.group({ logic: 'and', filters: [
        { field: 'dataSetId', operator: 'eq', value: dataSpaceId },
        { field: 'dataModelId', operator: 'eq', value: modelId }, { field: 'type', operator: 'eq', value: 'dataModel' },
      ] }) })
    if (fields.some(field => formalText(field, ['dataSetId', 'DataSetId', 'datasetid']) !== dataSpaceId
      || formalText(field, ['dataModelId', 'DataModelId', 'datamodelid']) !== modelId
      || (formalText(field, ['type', 'Type']) || 'dataModel') !== 'dataModel')) {
      throw new LowcodeApiError(0, `正式数据空间模型字段归属或类型不一致: ${metaName}`)
    }
    const sourceOutputKey = formalDatabaseTable(model)
      ? await this.readFormalSourceKey({ designScenarioId, metaName: 'View_TblList', assertCurrent,
        filter: DataViewFilter.group({ logic: 'and', filters: [
          { field: 'tblname', operator: 'eq', value: requiredText(formalText(model, ['MetaName', 'metaName', 'metaname']), '来源名称') },
          { field: 'dbid', operator: 'eq', value: requiredText(formalText(model, ['DbId', 'dbId', 'DBID', 'dbid']), '来源数据库 ID') },
        ] }) }) : ''
    assertCurrent()
    return projectFormalModel(model, fields, sourceOutputKey)
  }

  /** 完整读取单场景关系；过滤经唯一 codec 保留完整树，模型与视图引用由场景装配核对。 */
  public async readRelations(input: DataSpaceFormalScenarioReadInput): Promise<readonly DataSpaceFormalRelation[]> {
    const designScenarioId = requiredText(input.designScenarioId, 'designScenarioId')
    const dataSpaceId = requiredText(input.dataSpaceId, 'dataSpaceId')
    const scope = this.readScope().token
    const assertCurrent = () => {
      input.assertCurrent?.()
      if (this.readScope().token !== scope) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 正式关系读取身份已失效')
    }
    const rows = await this.readFormalRows({ designScenarioId, metaName: RELATION_TABLE, assertCurrent,
      filter: DataViewFilter.condition({ field: 'dataSetId', operator: 'eq', value: dataSpaceId }) })
    if (rows.some(row => formalText(row, ['dataSetId', 'DataSetId', 'datasetid']) !== dataSpaceId)) {
      throw new LowcodeApiError(0, `正式数据空间关系归属不一致: ${dataSpaceId}`)
    }
    const relations = dataSpaceRelations(rows).map(relation => Object.freeze({ ...relation,
      filterExpression: decodeDataSpaceFilter(relation.filterExpression) }))
    assertCurrent()
    return Object.freeze(relations)
  }

  /** 读取应用级关系依赖字典；该资源不是场景注册模型，不携带 scenarioId。 */
  public async readRelationDependencyOptions(): Promise<ReadonlyArray<Readonly<{ label: string; value: string }>>> {
    const scope = this.readScope()
    if (!scope.token.trim()) throw new Error('SPARK_EXECUTION_SCOPE_REQUIRED: 关系依赖字典读取需要有效执行域')
    if (!Object.entries(scope.headers).some(([key, value]) => key.toLowerCase() === 'x-appid'
      && typeof value === 'string' && value.trim().length > 0)) {
      throw new Error('SPARK_EXECUTION_SCOPE_REQUIRED: 关系依赖字典读取需要明确选中应用')
    }
    const assertCurrent = () => {
      if (this.readScope().token !== scope.token) {
        throw new Error('SPARK_EXECUTION_SCOPE_STALE: 关系依赖字典读取身份已失效')
      }
    }
    const headers = Object.fromEntries(Object.entries(scope.headers).filter(([key]) => key.toLowerCase() !== 'x-formkey'))
    headers['x-FormKey'] = ''
    const collection = await collectDataSpaceQueryPages(async page => {
      assertCurrent()
      const result = await this.client.requestResult({
        path: '/api/DataOperation/GetData',
        method: 'POST',
        data: { Table: [{ Name: RELATION_DEPENDENCY_DICTIONARY, Type: '字典', PrimaryKeyFields: 'rowid',
          OutputType: 'Table', Filter: null, inputParams: [], DISTINCT: false, IsBusinessMain: 1 }],
          PageParam: page },
        headers,
      })
      assertCurrent()
      return dictionaryPage(result)
    }, { pageSize: DICTIONARY_PAGE_SIZE, maxRows: 50_000, assertCurrent })
    assertCurrent()
    if (collection.rows.length === 0) throw new LowcodeApiError(0, `数据关系依赖字典 ${RELATION_DEPENDENCY_DICTIONARY} 为空`)
    return relationDependencyOptions(collection.rows)
  }

  private async readFormalRows(command: DataSpaceFormalQueryCommand): Promise<readonly DataSpaceFormalRow[]> {
    command.assertCurrent()
    const result = await this.runtime.query({ scenarioId: command.designScenarioId, metaName: command.metaName }, {
      filter: command.filter, sort: [{ field: 'rowid', direction: 'asc' }],
      allPages: true, page: { index: 1, size: 500 },
    })
    command.assertCurrent()
    const rows = result.rows
    const ids = rows.map(row => requiredText(formalRowId(row), `${command.metaName} 正式记录 ID`))
    if (new Set(ids).size !== ids.length) throw new LowcodeApiError(0, `${command.metaName} 正式记录 ID 不能重复`)
    return rows
  }

  private async readFormalSourceKey(command: DataSpaceFormalQueryCommand): Promise<string> {
    command.assertCurrent()
    const result = await this.runtime.query({ scenarioId: command.designScenarioId, metaName: command.metaName }, {
      filter: command.filter, page: { index: 1, size: 2 },
    })
    command.assertCurrent()
    const rows = result.rows
    const source = rows[0]
    const conditions = command.filter.toJSON()
    if (!('logic' in conditions)) throw new Error('正式来源查询缺少身份条件')
    const expectedName = conditions.filters.find(field => 'field' in field && field.field === 'tblname')
    const expectedId = conditions.filters.find(field => 'field' in field && field.field === 'dbid')
    if (!source || result.total !== rows.length || rows.length !== 1 || !formalRowId(source)
      || !expectedName || !('field' in expectedName) || formalText(source, ['tblname', 'TblName']) !== expectedName.value
      || !expectedId || !('field' in expectedId) || formalText(source, ['dbid', 'DbId']) !== expectedId.value) {
      throw new LowcodeApiError(0, '数据库表来源不唯一或归属不一致，无法读取正式主键')
    }
    const sourceId = formalRowId(source)
    const fields = await this.readFormalRows({ ...command, metaName: 'Base_TblField',
      filter: DataViewFilter.condition({ field: 'tblid', operator: 'eq', value: sourceId }) })
    if (fields.some(field => formalText(field, ['tblid', 'TblId', 'tblId']) !== sourceId)) {
      throw new LowcodeApiError(0, '数据库表来源字段归属不一致')
    }
    const keys = fields.filter(field => formalText(field, ['enname', 'EnName', 'ENNAME']) !== ''
      && formalText(field, ['enname', 'EnName', 'ENNAME']).toLowerCase() !== 'lingma_sys_ent' && binary(field['IsPKey']))
    const key = keys[0]
    if (!key || keys.length !== 1) throw new LowcodeApiError(0, '正式来源必须有且仅有一个非租户主键')
    return formalText(key, ['enname', 'EnName', 'ENNAME'])
  }

  public async read(input: DataSpaceDesignReadInput): Promise<DataSpaceDesignSnapshot> {
    const id = requiredText(input.dataSpaceId, 'dataSpaceId')
    const [dataSpaces, models, fields, relations, catalog] = await Promise.all([
      this.readTable(DATA_SPACE_TABLE, 'rowid', id),
      this.readTable(MODEL_TABLE, 'dataSetId', id),
      this.readTable(FIELD_TABLE, 'dataSetId', id),
      this.readTable(RELATION_TABLE, 'dataSetId', id),
      this.catalog.getDatabaseCatalog(input.catalogFormKeys),
    ])
    const dataSpace = dataSpaces.find((row) => text(row['rowid']) === id)
    if (dataSpace === undefined) throw new LowcodeApiError(0, `数据空间不存在: ${id}`)
    const rows = { dataSpaces, models, fields, relations }
    const closure = frontendModels({ dataSpaceId: id, rows, catalog, catalogApi: this.catalog })
    return {
      dataSpaceId: id,
      name: requiredText(dataSpace['Name'] ?? dataSpace['name'], 'data space Name'),
      description: text(dataSpace['description'] ?? dataSpace['Description']),
      inputParameters: parseInputParameters(dataSpace['inputParams'] ?? dataSpace['InputParams']),
      resources: closure.resources,
      models: closure.models,
      relations: closure.relations,
    }
  }

  public prepareMutation(input: DataSpaceDesignMutationInput): DataSpaceDesignMutationCommand {
    return prepareDataSpaceDesignMutation(input)
  }

  private async readTable(tableName: string, field: string, value: string): Promise<ReadonlyArray<Record<string, unknown>>> {
    const result = await this.client.requestResult({
      path: '/api/DataOperation/GetData',
      method: 'POST',
      data: queryPayload(tableName, field, value),
      headers: { 'x-FormKey': DATA_SPACE_DESIGN_FORM_KEY },
    })
    return resultRows(result)
  }
}
