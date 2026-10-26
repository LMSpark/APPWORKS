/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/query/data-space-query-options
 * 职责：捕获 DataView 正式模型绑定与查询参数。
 * 边界：拒绝未知字段或重复输出，不用视图显示名推断场景模型。
 * AI用途：把视图执行参数转为明确模型查询命令。
 */
import { DataViewFilter, DataViewQuery, type DataView, type DataViewFieldProjection, type QueryParams } from '@spark-appworks/spark-data'
import type { DataSpaceQueryIdentity, DataSpaceQueryOptions } from '../data-space-runtime-contract'
import { DataViewFilterCodec } from '@spark-appworks/spark-data'
import { parseDataSpaceValueFunction } from '../protocol/data-space-value-function'
import { requireDataSpaceQueryPage } from '../protocol/data-space-pagination'
import type { DataSpaceWireQueryOptions } from '../protocol/data-space-wire-contract'
import { encodeDataSpaceQueryTree } from './data-space-query-tree'

/** 从视图绑定和参数捕获的场景模型身份与查询选项快照。 */
type DataSpaceViewQueryCommand = Readonly<{ identity: DataSpaceQueryIdentity; options: DataSpaceQueryOptions;
  /** 已校验的前端来源入参模式，不属于GetData协议。 */
  sourceInputMode?: QueryParams['sourceInputMode'] }>
type DataSpaceViewQueryField = Exclude<NonNullable<DataSpaceQueryOptions['fields']>[number], string>
type DataSpaceViewQuerySort = NonNullable<DataSpaceQueryOptions['sort']>[number]

function requireViewText(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`SPARK DataView ${name} 必须是非空字符串`)
  return value
}

function projectionValueFunction(field: DataViewFieldProjection): DataSpaceViewQueryField['valueFun'] {
  if (!field.valueFunction.trim()) return undefined
  return parseDataSpaceValueFunction(field.valueFunction, field.resourceField, field.viewField)
}

function viewQueryFields(view: DataView, params: QueryParams): DataSpaceViewQueryField[] {
  const projection = params.projection ?? view.fieldProjection
  const candidates: Array<{ projection: DataViewFieldProjection | undefined; queryField: DataSpaceViewQueryField }> = projection.length > 0
    ? projection.filter(field => field.output).map(field => ({ projection: field, queryField: {
      name: requireViewText(field.resourceField, '模型字段 Name'),
      ...(field.viewField === field.resourceField ? {} : { alias: field.viewField }),
      group: field.group, isOutput: true, order: field.sortOrder,
      orderType: field.sortDirection === 'asc' ? 'ascending' as const
        : field.sortDirection === 'desc' ? 'descending' as const : null,
      ...(field.expression.trim() ? { expression: field.expression } : {}),
    } }))
    : view.queryColumns.map(column => ({ projection: undefined, queryField: { name: column.name, isOutput: true } }))
  const available = candidates.map(candidate => candidate.queryField)
  if (!available.length) throw new TypeError('SPARK DataView 缺少有效模型输出字段')
  const names = available.map(field => field.alias ?? field.name)
  if (new Set(names).size !== names.length) throw new TypeError('SPARK DataView 输出字段重复')
  let selected: typeof candidates
  if (params.fields === undefined) {
    selected = candidates
  } else {
    if (!Array.isArray(params.fields) || !params.fields.length || new Set(params.fields).size !== params.fields.length) {
      throw new TypeError('SPARK DataView fields 必须是非空、不重复的输出字段列表')
    }
    selected = params.fields.map(name => {
      const candidate = candidates.find(item => (item.queryField.alias ?? item.queryField.name) === name)
      if (!candidate) throw new TypeError(`SPARK DataView 未知输出字段: ${name}`)
      return candidate
    })
  }
  return selected.map(({projection: field, queryField}) => {
    const valueFun = field ? projectionValueFunction(field) : undefined
    return { ...queryField, ...(valueFun === undefined ? {} : { valueFun }) }
  })
}

function viewQuerySort(value: string | undefined, fields: readonly DataSpaceViewQueryField[]): DataSpaceViewQuerySort[] {
  if (value === undefined || value === '') return []
  const seen = new Set<string>()
  return value.split(',').map(item => {
    const [name, direction, extra] = item.split(':')
    const field = fields.find(candidate => (candidate.alias ?? candidate.name) === name)
    if (!field || extra !== undefined || (direction !== 'asc' && direction !== 'desc') || seen.has(field.name)) {
      throw new TypeError(`SPARK DataView 无效排序: ${item}`)
    }
    seen.add(field.name)
    return { field: field.name, direction }
  })
}

/** DataView 是 GetData 的查询输入；本地组织配置不推导服务器节点或业务身份。 */
export function captureDataSpaceViewQuery(view: DataView, params: QueryParams): DataSpaceViewQueryCommand {
  const allowed = ['page', 'pageSize', 'sort', 'filter', 'fields', 'viewId', 'viewConfig', 'projection', 'context',
    'treeMode', 'tree', 'outputType', 'allPages', 'maxRows', 'singleFlight', 'sourceInputMode']
  for (const key of Object.keys(params)) {
    if (params[key] !== undefined && !allowed.includes(key)) throw new TypeError(`SPARK DataView 不支持查询参数: ${key}`)
  }
  if (params['singleFlight'] !== undefined && typeof params['singleFlight'] !== 'boolean') {
    throw new TypeError('SPARK DataView singleFlight 必须是布尔值')
  }
  const {sourceInputMode, ...queryConfig} = DataViewQuery.capture(params)
  const binding = view.dataTable?.modelBinding
  requireViewText(binding?.modelId, '模型 ID')
  const identity = { scenarioId: requireViewText(view.dataSet?.scenarioId, 'scenarioId'),
    metaName: requireViewText(binding?.modelName, '模型 Name') }
  const fields = viewQueryFields(view, params)
  const context = params.context ?? view.queryContext
  const filterSource = params.filter ?? view.filterExpression
  const filter = filterSource === undefined ? undefined : DataViewFilter.parse(filterSource)
  if (filter !== undefined && !filter.ok) throw new TypeError(filter.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n'))
  const page = { index: params.page ?? view.page, size: params.pageSize ?? view.pageSize }
  requireDataSpaceQueryPage(page)
  const options: DataSpaceQueryOptions = {
    ...queryConfig, page, fields, sort: viewQuerySort(params.sort, fields),
    ...(filter?.ok ? { filter: filter.value.bindInputParams(context) } : {}),
    inputParams: Object.entries(context).map(([name, value]) => ({
      name: requireViewText(name, '输入参数名'), value,
    })),
    singleFlight: params['singleFlight'] !== false,
  }
  return { identity, options, ...(sourceInputMode === undefined ? {} : {sourceInputMode}) }
}

/** 原 SPARK 查询输入映射；权限、请求身份与缓存策略不进入 wire 表。 */
export function encodeDataSpaceQueryOptions(options: DataSpaceQueryOptions): DataSpaceWireQueryOptions {
  const outputFieldMode: unknown = options.outputFieldMode
  if (outputFieldMode !== undefined && outputFieldMode !== 'MODEL' && outputFieldMode !== 'REQUEST') {
    throw new TypeError('SPARK 查询 outputFieldMode 必须是 MODEL 或 REQUEST')
  }
  const sort = options.sort
  return {
    ...(outputFieldMode === undefined ? {} : {outputFieldMode}),
    ...(options.filter ? { filter: DataViewFilterCodec.encode(options.filter) } : {}),
    ...(sort?.length ? { sortFields: sort.map((item, order) => ({
      Field: item.field, OrderType: item.direction === 'asc' ? 'ascending' as const : 'descending' as const, Order: sort.length - order,
    })) } : {}),
    ...(options.page ? requireDataSpaceQueryPage(options.page) : {}),
    ...(options.allPages ? { allPages: true } : {}),
    ...(options.maxRows !== undefined ? { maxRows: options.maxRows } : {}),
    ...encodeDataSpaceQueryTree(options),
    ...(options.fields?.length ? { fields: options.fields.map(field => typeof field === 'string'
      ? { Name: field, IsOutput: true }
      : { Name: field.name, IsOutput: field.isOutput ?? true,
        ...(field.alias !== undefined ? { AsName: field.alias } : {}),
        ...(field.group !== undefined ? { Group: field.group } : {}),
        ...(field.expression !== undefined ? { Expression: field.expression } : {}),
        ...(field.order !== undefined ? { Order: field.order } : {}),
        ...(field.orderType !== undefined ? { OrderType: field.orderType } : {}),
        ...(field.valueFun !== undefined ? { ValueFun: structuredClone(field.valueFun) } : {}),
      }) } : {}),
    ...(options.inputParams?.length ? { inputParams: options.inputParams.map(item => ({ Name: item.name, Value: structuredClone(item.value) })) } : {}),
  }
}
