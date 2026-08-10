import type { HttpClientBase } from '@spark-appworks/spark-utils'

import { LowcodeApiError } from '../../../core/lowcode-api-error.js'
import { LowcodeClient } from '../../../core/lowcode-client.js'
import {
  DataSpaceFrontendModel,
  type DataSpaceFieldReference,
  type DataSpaceRelationReference,
  type DataSpaceResourceReference,
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
  models: readonly DataSpaceFrontendModel[]
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

function modelFields(modelId: string, rows: DesignRows): readonly DataSpaceFieldReference[] {
  return rows.fields
    .filter((row) => text(row['dataModelId']) === modelId)
    .filter((row) => !text(row['type']) || text(row['type']) === 'dataModel')
    .map((row) => ({
      fieldId: requiredText(row['rowid'], 'field rowid'),
      resourceField: requiredText(row['Name'] ?? row['name'], 'field Name'),
      ...(text(row['AsName'] ?? row['alias']) ? { alias: text(row['AsName'] ?? row['alias']) } : {}),
    }))
}

function modelRelations(modelId: string, rows: DesignRows): readonly DataSpaceRelationReference[] {
  return rows.relations
    .filter((row) => text(row['childModId']) === modelId || text(row['parentModId']) === modelId)
    .map((row) => ({
      relationId: requiredText(row['rowid'], 'relation rowid'),
      sourceModelId: requiredText(row['childModId'], 'relation childModId'),
      targetModelId: requiredText(row['parentModId'], 'relation parentModId'),
      expression: text(row['filter'] ?? row['Filter']),
      dependencyType: text(row['depType'] ?? row['dependencyType']),
      cascadeDelete: binary(row['cascadeDel'] ?? row['cascadeDelete']),
    }))
}

function primaryKey(modelId: string, model: Record<string, unknown>, rows: DesignRows): string {
  const configured = text(model['PrimaryKeyFields'] ?? model['primaryKeyFields'])
  if (configured) return configured
  const keyField = rows.fields.find((row) => (
    text(row['dataModelId']) === modelId && binary(row['IsPKey'] ?? row['primaryKey'])
  ))
  return text(keyField?.['Name'] ?? keyField?.['name']) || 'rowid'
}

function resourceReference(modelId: string, row: Record<string, unknown>, rows: DesignRows): DataSpaceResourceReference {
  const type = resourceType(row['Type'] ?? row['type'])
  const sourceIdentity = text(row['DbId'] ?? row['dbId'])
  const databaseBound = type === 'table' || type === 'view'
  return {
    ...(databaseBound && sourceIdentity ? { databaseId: sourceIdentity } : {}),
    ...(!databaseBound && sourceIdentity ? { resourceId: sourceIdentity } : {}),
    resourceName: requiredText(row['MetaName'] ?? row['metaName'], 'MetaName'),
    resourceType: type,
    primaryKeyField: primaryKey(modelId, row, rows),
    ...(text(row['DbName'] ?? row['dbName']) ? { databaseName: text(row['DbName'] ?? row['dbName']) } : {}),
  }
}

function frontendModels(dataSpaceId: string, rows: DesignRows): readonly DataSpaceFrontendModel[] {
  return rows.models.map((row) => {
    const modelId = requiredText(row['rowid'], 'model rowid')
    if (requiredText(row['dataSetId'], 'model dataSetId') !== dataSpaceId) {
      throw new LowcodeApiError(0, `前端模型 ${modelId} 不属于数据空间 ${dataSpaceId}`)
    }
    return new DataSpaceFrontendModel({
      dataSpaceId,
      modelId,
      name: requiredText(row['Name'] ?? row['name'], 'model Name'),
      resource: resourceReference(modelId, row, rows),
      fields: modelFields(modelId, rows),
      relations: modelRelations(modelId, rows),
    })
  })
}

export class DataSpaceDesignApi {
  private readonly client: LowcodeClient

  public constructor(http: HttpClientBase) {
    this.client = new LowcodeClient(http)
  }

  public async read(dataSpaceId: string): Promise<DataSpaceDesignSnapshot> {
    const id = requiredText(dataSpaceId, 'dataSpaceId')
    const [dataSpaces, models, fields, relations] = await Promise.all([
      this.readTable(DATA_SPACE_TABLE, 'rowid', id),
      this.readTable(MODEL_TABLE, 'dataSetId', id),
      this.readTable(FIELD_TABLE, 'dataSetId', id),
      this.readTable(RELATION_TABLE, 'dataSetId', id),
    ])
    const dataSpace = dataSpaces.find((row) => text(row['rowid']) === id)
    if (dataSpace === undefined) throw new LowcodeApiError(0, `数据空间不存在: ${id}`)
    const rows = { dataSpaces, models, fields, relations }
    return {
      dataSpaceId: id,
      name: requiredText(dataSpace['Name'] ?? dataSpace['name'], 'data space Name'),
      description: text(dataSpace['description'] ?? dataSpace['Description']),
      inputParameters: parseInputParameters(dataSpace['inputParams'] ?? dataSpace['InputParams']),
      models: frontendModels(id, rows),
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
