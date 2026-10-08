/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/query/data-space-query-options
 * 职责：捕获 DataView 正式模型绑定与查询参数。
 * 边界：拒绝未知字段或重复输出，不用视图显示名推断场景模型。
 * AI用途：把视图执行参数转为明确模型查询命令。
 */
import { DataViewFilter, type DataView, type DataViewFieldProjection, type QueryParams } from '@spark-appworks/spark-data'
import type { DataSpaceQueryIdentity, DataSpaceQueryOptions, DataSpaceQueryTree } from '../data-space-runtime-contract'
import { encodeDataSpaceFilter } from '../protocol/data-space-filter'
import { requireDataSpaceQueryPage } from '../protocol/data-space-pagination'
import type { DataSpaceWireQueryOptions } from '../protocol/data-space-wire-contract'
import { encodeDataSpaceQueryTree } from './data-space-query-tree'

/** 从视图绑定和参数捕获的场景模型身份与查询选项快照。 */
type DataSpaceViewQueryCommand = Readonly<{ identity: DataSpaceQueryIdentity; options: DataSpaceQueryOptions }>
type DataSpaceViewQueryField = Exclude<NonNullable<DataSpaceQueryOptions['fields']>[number], string>
type DataSpaceViewQuerySort = NonNullable<DataSpaceQueryOptions['sort']>[number]

function requireViewText(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`SPARK DataView ${name} 必须是非空字符串`)
  return value
}

function projectionValueFunction(field: DataViewFieldProjection): DataSpaceViewQueryField['valueFun'] {
  if (!field.valueFunction.trim()) return undefined
  let value: unknown
  try { value = JSON.parse(field.valueFunction) } catch { throw new TypeError(`SPARK 字段 ${field.viewField} ValueFun 不是有效 JSON`) }
  const parsed = DataViewFilter.parse({ field: field.resourceField, operator: 'eq', value })
  if (!parsed.ok) throw new TypeError(parsed.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n'))
  const tree = parsed.value.toJSON()
  const functionValue = 'field' in tree ? tree.value : undefined
  if (functionValue === null || typeof functionValue !== 'object' || Array.isArray(functionValue)
    || !('Type' in functionValue) || typeof functionValue['Type'] !== 'string') {
    throw new TypeError(`SPARK 字段 ${field.viewField} ValueFun 缺少 Type`)
  }
  return { ...functionValue, Type: functionValue['Type'] }
}

function viewQueryFields(view: DataView, params: QueryParams): DataSpaceViewQueryField[] {
  const projection = params.projection ?? view.fieldProjection
  const available: DataSpaceViewQueryField[] = projection.length > 0
    ? projection.filter(field => field.output).map(field => ({
      name: requireViewText(field.resourceField, '模型字段 Name'),
      ...(field.viewField === field.resourceField ? {} : { alias: field.viewField }),
      group: field.group, isOutput: true, order: field.sortOrder,
      orderType: field.sortDirection === 'asc' ? 'ascending' : field.sortDirection === 'desc' ? 'descending' : null,
      ...(field.expression.trim() ? { expression: field.expression } : {}),
      valueFun: projectionValueFunction(field),
    }))
    : view.columns.filter(column => !column.isComputed).map(column => ({ name: column.name, isOutput: true }))
  if (!available.length) throw new TypeError('SPARK DataView 缺少有效模型输出字段')
  const names = available.map(field => field.alias ?? field.name)
  if (new Set(names).size !== names.length) throw new TypeError('SPARK DataView 输出字段重复')
  if (params.fields === undefined) return available
  if (!Array.isArray(params.fields) || !params.fields.length || new Set(params.fields).size !== params.fields.length) {
    throw new TypeError('SPARK DataView fields 必须是非空、不重复的输出字段列表')
  }
  return params.fields.map(name => {
    const field = available.find(item => (item.alias ?? item.name) === name)
    if (!field) throw new TypeError(`SPARK DataView 未知输出字段: ${name}`)
    return field
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

function viewQueryTree(value: unknown): DataSpaceQueryTree | undefined {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('SPARK DataView tree 必须是对象')
  if (Object.keys(value).some(key => !['keyField', 'parentField', 'nodeId', 'hasChildrenField', 'mode'].includes(key))) {
    throw new TypeError('SPARK DataView tree 包含未知参数')
  }
  const mode = 'mode' in value ? value.mode : undefined
  if (mode !== undefined && mode !== 'child' && mode !== 'parent') throw new TypeError('SPARK DataView tree.mode 无效')
  return {
    keyField: requireViewText('keyField' in value ? value.keyField : undefined, 'tree.keyField'),
    parentField: requireViewText('parentField' in value ? value.parentField : undefined, 'tree.parentField'),
    nodeId: requireViewText('nodeId' in value ? value.nodeId : undefined, 'tree.nodeId'),
    ...('hasChildrenField' in value ? { hasChildrenField: requireViewText(value.hasChildrenField, 'tree.hasChildrenField') } : {}),
    ...(mode === undefined ? {} : { mode }),
  }
}

/** DataView 是 GetData 的查询输入；本地组织配置不推导服务器节点或业务身份。 */
export function captureDataSpaceViewQuery(view: DataView, params: QueryParams): DataSpaceViewQueryCommand {
  const allowed = ['page', 'pageSize', 'sort', 'filter', 'fields', 'viewId', 'viewConfig', 'projection', 'context',
    'treeMode', 'tree', 'outputType', 'allPages', 'maxRows', 'singleFlight']
  for (const key of Object.keys(params)) {
    if (params[key] !== undefined && !allowed.includes(key)) throw new TypeError(`SPARK DataView 不支持查询参数: ${key}`)
  }
  for (const key of ['allPages', 'singleFlight']) {
    if (params[key] !== undefined && typeof params[key] !== 'boolean') throw new TypeError(`SPARK DataView ${key} 必须是布尔值`)
  }
  const maxRows = params['maxRows']
  if (maxRows !== undefined && (typeof maxRows !== 'number' || !Number.isSafeInteger(maxRows) || maxRows <= 0)) {
    throw new TypeError('SPARK DataView maxRows 必须是正整数')
  }
  const outputType = params['outputType'] === undefined ? undefined : requireViewText(params['outputType'], 'outputType')
  const binding = view.dataTable?.modelBinding
  requireViewText(binding?.modelId, '模型 ID')
  const identity = { scenarioId: requireViewText(view.dataSet?.scenarioId, 'scenarioId'),
    metaName: requireViewText(binding?.modelName, '模型 Name') }
  const fields = viewQueryFields(view, params)
  const filterSource = params.filter ?? view.filterExpression
  const filter = filterSource === undefined ? undefined : DataViewFilter.parse(filterSource)
  if (filter !== undefined && !filter.ok) throw new TypeError(filter.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n'))
  const page = { index: params.page ?? view.page, size: params.pageSize ?? view.pageSize }
  requireDataSpaceQueryPage(page)
  const tree = viewQueryTree(params['tree'])
  const options: DataSpaceQueryOptions = {
    page, fields, sort: viewQuerySort(params.sort, fields),
    ...(filter?.ok ? { filter: filter.value } : {}),
    inputParams: Object.entries(params.context ?? view.queryContext).map(([name, value]) => ({
      name: requireViewText(name, '输入参数名'), value,
    })),
    ...(tree === undefined ? {} : { tree }),
    ...(outputType === undefined ? {} : { outputType }),
    allPages: params['allPages'] === true, singleFlight: params['singleFlight'] !== false,
    ...(typeof maxRows === 'number' ? { maxRows } : {}),
  }
  return { identity, options }
}

/** 原 SPARK 查询输入映射；权限、请求身份与缓存策略不进入 wire 表。 */
export function encodeDataSpaceQueryOptions(options: DataSpaceQueryOptions): DataSpaceWireQueryOptions {
  return {
    ...(options.filter ? { filter: encodeDataSpaceFilter(options.filter) } : {}),
    ...(options.sort?.length ? { sortFields: options.sort.map((item, order) => ({
      Field: item.field, OrderType: item.direction === 'asc' ? 'ascending' as const : 'descending' as const, Order: order,
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
