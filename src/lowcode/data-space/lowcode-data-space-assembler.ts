import type {
  DataSpaceDesignSnapshot,
  DataSpaceFrontendModel,
  DataSpaceRuntimeApi,
  DataSpaceRuntimeFilter,
  DataSpaceRuntimeQuery,
  OrderType,
  PermissionRuntimeSnapshot,
  WireFilterOperator,
} from '@spark-appworks/spark-lowcode-api'
import {
  DataSet,
  type DataSetMetadata,
  type DataPermissionSnapshotInput,
  type FilterExpression,
  type FilterOperator,
  type QueryParams,
  type TableMetadata,
} from '@spark-appworks/spark-data'
import type { HttpClientBase } from '@spark-appworks/spark-utils'

import {
  LowcodeFrontendModelAdapter,
  type LowcodeAdaptedFrontendModel,
  type LowcodeDataSpaceAdapterDiagnostic,
} from './lowcode-frontend-model-adapter'
import { LowcodeModelRelationAdapter } from './lowcode-model-relation-adapter'
import { toDataPermissionSnapshotInput } from '../permission/lowcode-permission-to-data-permission'

export type LowcodeDataSpaceAssemblerInput = Readonly<{
  design: DataSpaceDesignSnapshot
  formKey: string
  permission: PermissionRuntimeSnapshot
}>

export type LowcodeDataSpaceAssembly = Readonly<{
  dataSet: DataSet
  diagnostics: readonly LowcodeDataSpaceAdapterDiagnostic[]
}>

type ModelRuntimeBinding = Readonly<{
  adapted: LowcodeAdaptedFrontendModel
  model: DataSpaceFrontendModel
}>

type AdaptedDataResource = ReturnType<LowcodeFrontendModelAdapter['adapt']>['resources'][number]

type ModelTableCommand = Readonly<{
  resourceId: string
  resource: AdaptedDataResource
  bindings: readonly ModelRuntimeBinding[]
  runtime: DataSpaceRuntimeApi
  formKey: string
  permission: PermissionRuntimeSnapshot
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${name} 必须是对象`)
  return value
}

function requireQueryParams(value: unknown): QueryParams {
  return requireRecord(value, 'DataView query params')
}

function unwrapLowcodeResult(value: unknown): unknown {
  const envelope = requireRecord(value, 'lowcode 响应')
  if (envelope['Code'] !== 200) {
    throw new Error(typeof envelope['Message'] === 'string' ? envelope['Message'] : 'lowcode 请求失败')
  }
  return envelope['Result']
}

function queryContext(params: QueryParams): Readonly<{ dataSpaceId: string; modelId: string }> {
  const context = requireRecord(params.context, 'DataView.queryContext')
  if (context['kind'] !== 'lowcode-frontend-model') throw new Error('DataView.queryContext.kind 无效')
  const dataSpaceId = typeof context['dataSpaceId'] === 'string' ? context['dataSpaceId'].trim() : ''
  const modelId = typeof context['modelId'] === 'string' ? context['modelId'].trim() : ''
  if (!dataSpaceId || !modelId) throw new Error('DataView.queryContext 缺少 dataSpaceId/modelId')
  return { dataSpaceId, modelId }
}

const DATAVIEW_TO_WIRE_FILTER_OPERATOR_ENTRIES = [
  ['==', 'equal'],
  ['!=', 'notequal'],
  ['>', 'greaterthan'],
  ['>=', 'greaterthanorequal'],
  ['<', 'lessthan'],
  ['<=', 'lessthanorequal'],
  ['in', 'in'],
  ['not in', 'notin'],
  ['contains', 'contains'],
  ['startsWith', 'startswith'],
  ['endsWith', 'endswith'],
  ['is null', 'isnull'],
  ['is not null', 'isnotnull'],
  ['not like', 'nolike'],
] as const satisfies ReadonlyArray<readonly [FilterOperator, WireFilterOperator]>

const DATAVIEW_TO_WIRE_FILTER_OPERATOR: ReadonlyMap<string, WireFilterOperator> =
  new Map(DATAVIEW_TO_WIRE_FILTER_OPERATOR_ENTRIES)

function backendOperator(operator: string): WireFilterOperator {
  const resolved = DATAVIEW_TO_WIRE_FILTER_OPERATOR.get(operator)
  if (resolved === undefined) {
    throw new Error(`不支持的 DataView 过滤操作符: ${operator}`)
  }
  return resolved
}

function resourceField(binding: ModelRuntimeBinding, viewField: string): string {
  const field = binding.adapted.fieldProjection.find(candidate => candidate.viewField === viewField)
  if (field?.source !== 'resource') {
    throw new Error(`DataView 过滤字段未解析到资源字段: ${binding.adapted.modelId}/${viewField}`)
  }
  return field.resourceField
}

function filterValue(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) return { Type: 'GetConstValue', Value: value }
  if (value['kind'] === 'field' && typeof value['field'] === 'string') {
    return { Type: 'GetTableField', Field: value['field'] }
  }
  return { Type: 'GetConstValue', Value: value }
}

function runtimeFilter(
  expression: FilterExpression | Record<string, unknown> | undefined,
  binding: ModelRuntimeBinding,
): DataSpaceRuntimeFilter | null {
  if (expression === undefined) return null
  const record = requireRecord(expression, 'DataView filter')
  if (record['type'] === 'and' || record['type'] === 'or') {
    const children = record['children']
    if (!Array.isArray(children)) throw new Error('DataView 组合过滤缺少 children')
    return {
      Type: record['type'],
      Filters: children.map(child => runtimeFilter(requireRecord(child, 'DataView filter child'), binding)),
    }
  }
  const field = record['field']
  const operator = record['op']
  if (typeof field !== 'string' || typeof operator !== 'string') {
    throw new Error('DataView 过滤条件缺少 field/op')
  }
  return {
    Type: 'cond',
    Field: resourceField(binding, field),
    Operator: backendOperator(operator),
    ValueFun: filterValue(record['value']),
  }
}

function runtimeSort(params: QueryParams, binding: ModelRuntimeBinding): DataSpaceRuntimeQuery['sort'] {
  if (typeof params.sort !== 'string' || !params.sort.trim()) return undefined
  return params.sort.split(',').map((item) => {
    const [fieldName, directionName] = item.split(':')
    const field = binding.adapted.fieldProjection.find(candidate => candidate.viewField === fieldName)
    if (field === undefined) throw new Error(`DataView 排序字段不存在: ${binding.adapted.modelId}/${fieldName ?? ''}`)
    const direction: OrderType = directionName === 'desc' ? 'descending' : 'ascending'
    return {
      fieldId: field.fieldId,
      direction,
    }
  })
}

function runtimeQuery(
  params: QueryParams,
  binding: ModelRuntimeBinding,
  formKey: string,
): DataSpaceRuntimeQuery {
  const sort = runtimeSort(params, binding)
  return {
    formKey,
    model: binding.model,
    filter: runtimeFilter(params.filter, binding),
    ...(sort === undefined ? {} : { sort }),
    ...(typeof params.page === 'number' ? { pageIndex: params.page } : {}),
    ...(typeof params.pageSize === 'number' ? { pageSize: params.pageSize } : {}),
  }
}

function toQueryResult(
  snapshot: ReturnType<DataSpaceRuntimeApi['parseQueryResult']>,
  permission: PermissionRuntimeSnapshot,
  resourceId: string,
): DataPermissionSnapshotInput {
  return toDataPermissionSnapshotInput(permission, {
    formKey: snapshot.formKey,
    dataSpaceId: snapshot.dataSpaceId,
    modelId: snapshot.modelId,
    resourceId,
    rows: snapshot.rows.map(row => ({ ...row })),
    originalRows: snapshot.originalRows.map(row => ({ ...row })),
    total: snapshot.total,
    systemKey: snapshot.systemKey,
    queryAllowAdd: snapshot.allowAdd,
  })
}

function modelTable(command: ModelTableCommand): TableMetadata {
  const { resourceId, resource, bindings, runtime, formKey, permission } = command
  const byModelId = new Map(bindings.map(binding => [binding.adapted.modelId, binding]))
  const resolveBinding = (request: unknown): ModelRuntimeBinding => {
    const params = requireQueryParams(request)
    const context = queryContext(params)
    const binding = byModelId.get(context.modelId)
    if (binding === undefined) {
      throw new Error(`DataView 模型上下文未解析: ${context.dataSpaceId}/${context.modelId}`)
    }
    if (context.dataSpaceId !== binding.adapted.dataSpaceId) {
      throw new Error(`DataView 模型上下文未解析: ${context.dataSpaceId}/${context.modelId}`)
    }
    return binding
  }
  const views: TableMetadata['views'] = { default: {} }
  for (const binding of bindings) {
    views[binding.adapted.viewId] = {
      fieldProjection: binding.adapted.fieldProjection,
      queryContext: binding.adapted.queryContext,
      page: 0,
      pageSize: 20,
    }
  }
  return {
    tableName: resourceId,
    resourceId,
    resourceType: resource.resourceType,
    columns: resource.columns.map(column => ({ ...column })),
    api: {
      list: {
        url: '/api/DataOperation/GetData',
        method: 'POST',
        headers: { 'x-FormKey': formKey },
      },
    },
    crudConfig: {
      transformRequest: (request) => {
        const params = requireQueryParams(request)
        return runtime.prepareQuery(runtimeQuery(params, resolveBinding(params), formKey)).data
      },
      transformResponse: (response, request) => {
        const params = requireQueryParams(request)
        const query = runtimeQuery(params, resolveBinding(params), formKey)
        const snapshot = runtime.parseQueryResult(query, unwrapLowcodeResult(response))
        return toQueryResult(snapshot, permission, resourceId)
      },
    },
    views,
  }
}

export class LowcodeDataSpaceAssembler {
  private readonly modelAdapter = new LowcodeFrontendModelAdapter()
  private readonly relationAdapter = new LowcodeModelRelationAdapter()

  public constructor(
    private readonly runtime: DataSpaceRuntimeApi,
    private readonly http: HttpClientBase,
  ) {}

  public assemble(input: LowcodeDataSpaceAssemblerInput): LowcodeDataSpaceAssembly {
    const formKey = input.formKey.trim()
    if (!formKey) throw new Error('formKey 不能为空')
    if (input.permission.formKey !== formKey) {
      throw new Error(`Assembler formKey 与权限 formKey 不一致: ${formKey} / ${input.permission.formKey}`)
    }
    const adaptedModels = this.modelAdapter.adapt(input.design.models)
    const adaptedRelations = this.relationAdapter.adapt(input.design.relations, adaptedModels)
    const rawModels = new Map(input.design.models.map(model => [model.modelId, model]))
    const tables: Record<string, TableMetadata> = {}
    for (const resource of adaptedModels.resources) {
      const bindings = adaptedModels.models
        .filter(model => model.resourceId === resource.resourceId)
        .map((adapted): ModelRuntimeBinding | null => {
          const model = rawModels.get(adapted.modelId)
          return model === undefined ? null : { adapted, model }
        })
        .filter((binding): binding is ModelRuntimeBinding => binding !== null)
      tables[resource.resourceId] = modelTable({
        resourceId: resource.resourceId,
        resource,
        bindings,
        runtime: this.runtime,
        formKey,
        permission: input.permission,
      })
    }
    const metadata: DataSetMetadata = {
      schemaVersion: 2,
      dataSetName: input.design.dataSpaceId,
      tables,
      resourceRelations: [...adaptedRelations.resourceRelations],
      viewCascades: [...adaptedRelations.viewCascades],
    }
    const dataSet = DataSet.fromJson(metadata)
    dataSet.setSharedHttpClient(this.http)
    return {
      dataSet,
      diagnostics: [...adaptedModels.diagnostics, ...adaptedRelations.diagnostics],
    }
  }
}
