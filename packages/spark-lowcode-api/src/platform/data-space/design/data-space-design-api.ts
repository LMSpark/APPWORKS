import type { HttpClientBase } from '@spark-appworks/spark-utils'

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
import {
  prepareDataSpaceDesignMutation,
  type DataSpaceDesignMutationCommand,
  type DataSpaceDesignMutationInput,
} from './data-space-design-mutation.js'

export const DATA_SPACE_DESIGN_FORM_KEY = '8D1AB14DD8277F3E7017CD38F77B09FD'

export type DataSpaceInputParameter = Readonly<{
  parameterId: string
  name: string
  description: string
  business: boolean
}>

export type DataSpaceDesignSnapshot = Readonly<{
  dataSpaceId: string
  name: string
  description: string
  inputParameters: readonly DataSpaceInputParameter[]
  resources: readonly DataSpaceResourceReference[]
  models: readonly DataSpaceFrontendModel[]
  relations: readonly LowcodeModelRelationRecord[]
}>

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

const DESIGN_DATABASE = 'QYVirtualPlat'
const DATA_SPACE_TABLE = 'Base_DataSet'
const MODEL_TABLE = 'Base_DataModel'
const FIELD_TABLE = 'Base_DataModel_Field'
const RELATION_TABLE = 'Base_DataModel_Relation'

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

function serializedText(value: unknown): string {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function resourceType(value: unknown): DataSpaceResourceType {
  const types: Readonly<Record<string, DataSpaceResourceType>> = {
    数据库表: 'table',
    数据库视图: 'view',
    视图: 'view',
    字典: 'dictionary',
    接口: 'interface',
    JSON: 'json',
    文件: 'file',
  }
  const raw = requiredText(value, '前端模型 Type')
  const normalized = types[raw]
  if (normalized === undefined) throw new LowcodeApiError(0, `未知数据资源类型: ${raw}`)
  return normalized
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
        orderType: text(row['OrderType'] ?? row['orderType']),
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
  rows: DesignRows,
): readonly LowcodeModelRelationRecord[] {
  return rows.relations.map((row) => {
    return {
      sourceRelationId: requiredText(row['rowid'], 'relation rowid'),
      dataSpaceId: requiredText(row['dataSetId'], 'relation dataSetId'),
      parentModelId: requiredText(row['parentModId'], 'relation parentModId'),
      childModelId: requiredText(row['childModId'], 'relation childModId'),
      parentResourceName: requiredText(row['parentTable'], 'relation parentTable'),
      childResourceName: requiredText(row['childTable'], 'relation childTable'),
      filterExpression: serializedText(row['filter'] ?? row['Filter']),
      dependencyType: text(row['depType'] ?? row['dependencyType']),
      cascadeDelete: binary(row['cascadeDel'] ?? row['cascadeDelete']),
    }
  })
}

function primaryKey(
  modelId: string,
  model: Record<string, unknown>,
  resource: LowcodeDatabaseResource,
  rows: DesignRows,
): string {
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

function resourceReference(
  modelId: string,
  row: Record<string, unknown>,
  rows: DesignRows,
  catalog: LowcodeDatabaseCatalog,
  catalogApi: LowcodeCatalogApi,
): DataSpaceResourceReference {
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
    primaryKeyField: primaryKey(modelId, row, resolved, rows),
    databaseName: configuredDatabaseName
      ? configuredDatabaseName
      : database?.name ?? '',
    fields: resourceFields(resolved),
  }
}

function frontendModels(
  dataSpaceId: string,
  rows: DesignRows,
  catalog: LowcodeDatabaseCatalog,
  catalogApi: LowcodeCatalogApi,
): Readonly<{
  models: readonly DataSpaceFrontendModel[]
  resources: readonly DataSpaceResourceReference[]
  relations: readonly LowcodeModelRelationRecord[]
}> {
  const resourcesByModelId = new Map<string, DataSpaceResourceReference>()
  for (const row of rows.models) {
    const modelId = requiredText(row['rowid'], 'model rowid')
    if (requiredText(row['dataSetId'], 'model dataSetId') !== dataSpaceId) {
      throw new LowcodeApiError(0, `前端模型 ${modelId} 不属于数据空间 ${dataSpaceId}`)
    }
    resourcesByModelId.set(modelId, resourceReference(modelId, row, rows, catalog, catalogApi))
  }
  const relations = dataSpaceRelations(rows)
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

export class DataSpaceDesignApi {
  private readonly client: LowcodeClient
  private readonly catalog: LowcodeCatalogApi

  public constructor(http: HttpClientBase) {
    this.client = new LowcodeClient(http)
    this.catalog = new LowcodeCatalogApi(http)
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
    const closure = frontendModels(id, rows, catalog, this.catalog)
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
