import type { HttpClientBase } from '@spark-appworks/spark-utils'

import { LowcodeApiError } from '../../../core/lowcode-api-error.js'
import { LowcodeClient } from '../../../core/lowcode-client.js'
import type { DataSpaceFrontendModel } from '../data-space.js'
import {
  prepareDataSpaceRuntimeMutation,
  type DataSpaceRuntimeMutationCommand,
  type DataSpaceRuntimeMutationInput,
} from './data-space-runtime-mutation.js'

export type DataSpaceRuntimeFilter = Readonly<Record<string, unknown>>

export type DataSpaceRuntimeInputParameter = Readonly<Record<string, unknown>>

export type DataSpaceRuntimeSort = Readonly<{
  fieldId: string
  direction: 'ascending' | 'descending'
}>

export type DataSpaceRuntimeQuery = Readonly<{
  formKey: string
  model: DataSpaceFrontendModel
  filter?: DataSpaceRuntimeFilter | null
  inputParameters?: readonly DataSpaceRuntimeInputParameter[]
  sort?: readonly DataSpaceRuntimeSort[]
  pageIndex?: number
  pageSize?: number
}>

export type DataSpaceSparsePermission = Readonly<{
  r: readonly string[]
  e: readonly string[]
  h: readonly string[]
  m: readonly string[]
  d: boolean
}>

export type DataSpaceRuntimeRow = Readonly<Record<string, unknown>> & Readonly<{
  lingma_sys_params: DataSpaceSparsePermission
  lingma_sys_key: string
}>

export type DataSpaceRuntimeSnapshot = Readonly<{
  formKey: string
  dataSpaceId: string
  modelId: string
  rows: readonly DataSpaceRuntimeRow[]
  originalRows: ReadonlyArray<Readonly<Record<string, unknown>>>
  total: number
  allowAdd: boolean
  systemKey: string
}>

export type DataSpaceRuntimePreparedQuery = Readonly<{
  path: '/api/DataOperation/GetData'
  method: 'POST'
  headers: Readonly<Record<string, string>>
  data: Readonly<Record<string, unknown>>
}>

type LowcodeResourceType = '数据库表' | '视图' | '字典' | '接口' | 'JSON' | '文件'

const RESOURCE_TYPE_WIRE: Readonly<Record<string, LowcodeResourceType>> = {
  table: '数据库表',
  view: '视图',
  dictionary: '字典',
  interface: '接口',
  json: 'JSON',
  file: '文件',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) throw new LowcodeApiError(0, `${name} 不能为空`)
  return normalized
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized === '' ? undefined : normalized
}

function structuredText(value: string, name: string): unknown {
  const normalized = value.trim()
  if (!normalized) return null
  try {
    return JSON.parse(normalized)
  } catch {
    throw new LowcodeApiError(0, `${name} 不是有效 JSON`)
  }
}

function queryFilter(query: DataSpaceRuntimeQuery): unknown {
  const modelFilter = structuredText(query.model.query.filter, '前端模型 Filter')
  const runtimeFilter = query.filter ?? null
  if (modelFilter === null) return runtimeFilter
  if (runtimeFilter === null) return modelFilter
  return { Type: 'and', Filters: [modelFilter, runtimeFilter] }
}

function fieldSort(query: DataSpaceRuntimeQuery, fieldId: string): Readonly<{
  order: number
  orderType: string | null
}> | null {
  if (query.sort === undefined) return null
  const index = query.sort.findIndex((item) => item.fieldId === fieldId)
  if (index < 0) return { order: 0, orderType: null }
  const item = query.sort[index]
  if (item === undefined) return null
  return { order: query.sort.length - index, orderType: item.direction }
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function resultData(result: unknown): Record<string, unknown> {
  if (!isRecord(result)) throw new LowcodeApiError(0, '数据空间运行响应不是对象')
  const data = result['data'] ?? result['Data']
  if (!isRecord(data)) throw new LowcodeApiError(0, '数据空间运行响应缺少 data')
  return data
}

function resultRows(data: Record<string, unknown>): ReadonlyArray<Record<string, unknown>> {
  const items = data['Items'] ?? data['items'] ?? data['Result'] ?? data['result']
  if (!Array.isArray(items)) throw new LowcodeApiError(0, '数据空间运行响应 Items 不是数组')
  if (!items.every(isRecord)) throw new LowcodeApiError(0, '数据空间运行响应包含非对象行')
  return items
}

function rowPermission(row: Record<string, unknown>): DataSpaceSparsePermission {
  const raw = row['lingma_sys_params']
  if (!isRecord(raw)) throw new LowcodeApiError(0, '运行数据行缺少后端权限 lingma_sys_params')
  return {
    r: stringArray(raw['r']),
    e: stringArray(raw['e']),
    h: stringArray(raw['h']),
    m: stringArray(raw['m']),
    d: raw['d'] === true,
  }
}

function rowSystemKey(row: Record<string, unknown>): string {
  const value = row['lingma_sys_key']
  return typeof value === 'string' ? value : ''
}

function queryPayload(query: DataSpaceRuntimeQuery): Readonly<Record<string, unknown>> {
  const resource = query.model.resource
  const table: Record<string, unknown> = {
    Name: query.model.name,
    MetaName: resource.resourceName,
    PrimaryKeyFields: resource.primaryKeyField,
    Type: RESOURCE_TYPE_WIRE[resource.resourceType],
    OutputType: query.model.query.outputType || 'Table',
    Filter: queryFilter(query),
    inputParams: query.inputParameters ?? [],
    DISTINCT: query.model.query.distinct,
    IsBusinessMain: query.model.query.businessMain ? 1 : 0,
    RelationFilterType: 'and',
    Fields: query.model.fields.map((field) => {
      const sort = fieldSort(query, field.fieldId)
      const valueFunction = structuredText(field.valueFunction, `模型字段 ${field.fieldId} ValueFun`)
      return {
        Name: field.resourceField,
        AsName: optionalText(field.alias) ?? field.resourceField,
        FieldType: optionalText(field.fieldType),
        IsOutput: field.output,
        Order: sort?.order ?? field.order,
        OrderType: sort?.orderType ?? optionalText(field.orderType) ?? null,
        Group: field.group,
        DISTINCT: field.distinct,
        IsPKey: field.primaryKey,
        Value: field.value,
        ValueFun: valueFunction,
        Expression: field.expression,
      }
    }),
  }
  const databaseName = resource.databaseName.trim()
  if (databaseName) table['DbName'] = databaseName
  if (query.model.query.shortName) table['ShortName'] = query.model.query.shortName
  if (query.model.query.foreignKeyFields) table['ForeignKeyFields'] = query.model.query.foreignKeyFields
  const payload: Record<string, unknown> = { Table: [table] }
  if ((query.pageSize ?? 0) > 0) {
    payload['PageParam'] = { index: query.pageIndex ?? 0, size: query.pageSize }
  }
  return payload
}

export class DataSpaceRuntimeApi {
  private readonly client: LowcodeClient

  public constructor(http: HttpClientBase) {
    this.client = new LowcodeClient(http)
  }

  public async query(query: DataSpaceRuntimeQuery): Promise<DataSpaceRuntimeSnapshot> {
    const prepared = this.prepareQuery(query)
    const result = await this.client.requestResult({
      path: prepared.path,
      method: prepared.method,
      data: prepared.data,
      headers: prepared.headers,
    })
    return this.parseQueryResult(query, result)
  }

  public prepareQuery(query: DataSpaceRuntimeQuery): DataSpaceRuntimePreparedQuery {
    const formKey = requiredText(query.formKey, 'formKey')
    return {
      path: '/api/DataOperation/GetData',
      method: 'POST',
      data: queryPayload(query),
      headers: { 'x-FormKey': formKey },
    }
  }

  public parseQueryResult(query: DataSpaceRuntimeQuery, result: unknown): DataSpaceRuntimeSnapshot {
    const formKey = requiredText(query.formKey, 'formKey')
    if (!isRecord(result)) throw new LowcodeApiError(0, '数据空间运行响应不是对象')
    if (typeof result['allowAdd'] !== 'boolean') {
      throw new LowcodeApiError(0, '数据空间运行响应缺少后端 allowAdd')
    }
    const data = resultData(result)
    const rawRows = resultRows(data)
    const rawTotal = data['Count'] ?? data['count']
    const total = typeof rawTotal === 'number' && Number.isFinite(rawTotal) ? rawTotal : rawRows.length
    const systemKey = result['lingma_sys_key']
    return {
      formKey,
      dataSpaceId: query.model.dataSpaceId,
      modelId: query.model.modelId,
      rows: rawRows.map((row) => ({
        ...row,
        lingma_sys_params: rowPermission(row),
        lingma_sys_key: rowSystemKey(row),
      })),
      originalRows: rawRows.map((row) => ({ ...row })),
      total,
      allowAdd: result['allowAdd'],
      systemKey: typeof systemKey === 'string' ? systemKey : '',
    }
  }

  public prepareMutation(input: DataSpaceRuntimeMutationInput): DataSpaceRuntimeMutationCommand {
    return prepareDataSpaceRuntimeMutation(input)
  }
}
