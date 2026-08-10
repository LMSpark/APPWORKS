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

export type DataSpaceRuntimeQuery = Readonly<{
  formKey: string
  model: DataSpaceFrontendModel
  filter?: DataSpaceRuntimeFilter | null
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
    Name: resource.resourceName,
    PrimaryKeyFields: resource.primaryKeyField,
    Type: RESOURCE_TYPE_WIRE[resource.resourceType],
    OutputType: 'Table',
    Filter: query.filter ?? null,
    inputParams: [],
    DISTINCT: true,
    IsBusinessMain: resource.resourceType === 'table' ? 1 : 0,
    RelationFilterType: 'and',
    Fields: query.model.fields.map((field) => ({
      Name: field.resourceField,
      AsName: optionalText(field.alias) ?? field.resourceField,
      IsOutput: true,
      Order: 0,
      OrderType: null,
      Group: 0,
    })),
  }
  const databaseName = resource.databaseName?.trim()
  if (databaseName) table['DbName'] = databaseName
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
    const formKey = requiredText(query.formKey, 'formKey')
    const result = await this.client.requestResult({
      path: '/api/DataOperation/GetData',
      method: 'POST',
      data: queryPayload(query),
      headers: { 'x-FormKey': formKey },
    })
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
