import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataSet, diagnoseDataViewMember, resolveDataViewMember, getDataViewFilterFunctionDefinitions, type DataViewFieldProjection} from '@spark-appworks/spark-data'
import {DataSpaceQueryAggregation} from '../query/data-space-query-aggregation'
import {HttpClientBase, isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {DataSpaceDesignApi} from '../../design/data-space-design-api'
import {DataSpaceRuntimeApi} from '../data-space-runtime-api'

const sets: DataSet[] = []
afterEach(() => sets.splice(0).forEach(set => set.destroy()))
function projection(field: 'dept' | 'amount', group = 0, valueFunction = ''): DataViewFieldProjection {
  return {fieldId: field.toUpperCase(), source: 'resource', resourceFieldId: field.toUpperCase(),
    resourceField: field === 'dept' ? 'department' : 'revenue', viewField: field === 'dept' ? 'department' : 'revenue',
    type: field === 'dept' ? 'string' : 'number', label: field, output: true, sortOrder: 0,
    sortDirection: null, group, distinct: false, primaryKey: false, value: '', valueFunction, expression: ''}
}
type FixtureOptions = {grouped?: boolean; sourceType?: string; fieldTypes?: Record<string, string>;
  modelGroups?: Record<string, number>; modelValueFunctions?: Record<string, string>}
function setup(valueFunction: string, options: FixtureOptions = {}) {
  const {grouped = false, sourceType = '数据库表'} = options
  const formal = DataSpaceDesignApi.projectModel({rowid: 'MODEL', Name: 'Orders', Type: sourceType, MetaName: 'OrderSource'}, [
    {rowid: 'KEY', dataModelId: 'MODEL', Name: 'rowid', FieldType: 'string', IsOutput: 1, IsPKey: 1},
    {rowid: 'DEPT', dataModelId: 'MODEL', Name: 'dept', AsName: 'department', FieldType: 'string', IsOutput: 1},
    {rowid: 'AMOUNT', dataModelId: 'MODEL', Name: 'amount', AsName: 'revenue', FieldType: 'number', IsOutput: 1},
  ].map(field => ({...field, FieldType: options.fieldTypes?.[field.Name] ?? field.FieldType,
    Group: options.modelGroups?.[field.Name] ?? 0, ValueFun: options.modelValueFunctions?.[field.Name] ?? ''})), 'rowid')
  let scope = 'CURRENT'
  class QueryHttp extends HttpClientBase {
    readonly requests: RequestConfig[] = []
    gate: Promise<void> | undefined
    empty = false
    aggregateValue: number | null = 912
    protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
      this.requests.push(config)
      await this.gate
      const body = config.data
      if (!isRecord(body) || !Array.isArray(body['Table']) || !isRecord(body['Table'][0])) throw new Error('Expected GetData request')
      const fields = body['Table'][0]['Fields']
      const aggregated = Array.isArray(fields) && fields.some(field => isRecord(field) && isRecord(field['ValueFun']))
      return {status: 200, statusText: 'OK', headers: {}, data: {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd: true,
        data: {Items: this.empty ? [] : [aggregated ? {...(grouped ? {department: 'North'} : {}), revenue: this.aggregateValue, lingma_sys_params: {e: ['revenue'], d: true}}
          : {rowid: 'ROW', department: 'North', revenue: 3, lingma_sys_params: {e: ['revenue']}}], Count: this.empty ? 0 : aggregated ? grouped ? 3 : 1 : 300}}}}
    }
  }
  const http = new QueryHttp(), runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: scope, headers: {}})})
  const dataSet = DataSet.fromJson({scenarioId: 'SCENE', tables: {Orders: {tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
    columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}, {name: 'department', type: 'string'}, {name: 'revenue', type: 'number'}],
    views: {default: {}, statistics: {fieldProjection: [...(grouped ? [projection('dept', 1)] : []), projection('amount', 0, valueFunction)],
      queryConfig: {outputType: 'Table'}, pageSize: 1}}}}})
  sets.push(dataSet)
  const statistics = dataSet.getView('Orders', 'statistics')!, list = dataSet.getView('Orders')!
  runtime.bindModelView(statistics, formal); runtime.bindModelView(list, formal)
  return {dataSet, statistics, list, runtime, formal, http, invalidate: () => {scope = 'CHANGED'}}
}

describe('DataView server query aggregation', () => {
  it('rejects legacy page and selection summary reads without blocking the formal list or server statistics', async () => {
    const {list, statistics, http} = setup('{"Type":"Sum"}')
    const original = {totalRevenue: {type: 'sum' as const, field: 'revenue'}}
    list.configure({aggregates: original, pageSize: 1})
    expect(list.aggregateError?.message).toContain('DATA_VIEW_REMOTE_AGGREGATE')
    expect(() => list.aggregateResult).toThrow('DATA_VIEW_REMOTE_AGGREGATE')
    const binding = {dataViewKey: 'SCENE@Orders@default', dataMember: 'aggregateResult' as const, dataField: 'totalRevenue'}
    expect(() => resolveDataViewMember(binding, list.dataSet)).toThrow('DATA_VIEW_REMOTE_AGGREGATE')
    expect(diagnoseDataViewMember(binding, list.dataSet)).toMatchObject({ok: false, status: 'value-unavailable'})
    expect((await list.loadFromServer()).success).toBe(true)
    expect(list.total).toBe(300)
    expect(list.rows[0]?.['revenue']).toBe(3)
    expect(JSON.stringify(http.requests[0]?.data)).not.toContain('GetGroupData')
    list.setSelectedRows([list.rows[0]!])
    expect(() => list.selectionAggregateResult).toThrow('DATA_VIEW_REMOTE_AGGREGATE')
    list.updateEditingValue('ROW', 'revenue', 4)
    expect(list.getEditingRow('ROW')?.['revenue']).toBe(4)
    list.discardEditingRows()
    expect(list.getEditingRow('ROW')?.['revenue']).toBe(3)
    expect(list.toJson().aggregates).toEqual(original)
    expect((await statistics.loadFromServer()).success).toBe(true)
    expect(statistics.rows[0]?.['revenue']).toBe(912)
    expect(statistics.aggregateError).toBeNull()
  })

  it('preserves the unsupported configuration across reconstruction and recovers only on explicit configuration change', async () => {
    const {list, dataSet, runtime, formal} = setup('{"Type":"Sum"}')
    await list.loadFromServer()
    const original = {totalRevenue: {type: 'sum' as const, field: 'revenue'}}
    list.configure({aggregates: original})
    const saved = dataSet.toJson(), reopened = DataSet.fromJson(saved); sets.push(reopened)
    const next = reopened.getView('Orders')!
    runtime.bindModelView(next, formal)
    await next.loadFromServer()
    expect(next.aggregates).toEqual(original)
    expect(() => next.aggregateResult).toThrow('DATA_VIEW_REMOTE_AGGREGATE')
    next.configure({aggregates: {}})
    expect(next.aggregateError).toBeNull()
    expect(next.aggregateResult).toEqual({})
    next.configure({aggregates: original})
    expect(() => next.aggregateResult).toThrow('DATA_VIEW_REMOTE_AGGREGATE')
    expect(next.toJson().aggregates).toEqual(original)
  })

  it('does not expose a cached local summary after binding the same view to the formal remote owner', () => {
    const {runtime, formal, dataSet} = setup('{"Type":"Sum"}')
    const local = DataSet.fromJson(dataSet.toJson()); sets.push(local)
    const view = local.getView('Orders')!
    view.configure({aggregates: {totalRevenue: {type: 'sum', field: 'revenue'}}})
    view.updateFromServer([{rowid: 'LOCAL', revenue: 7}])
    expect(view.aggregateResult).toEqual({totalRevenue: 7})
    runtime.bindModelView(view, formal)
    expect(() => view.aggregateResult).toThrow('DATA_VIEW_REMOTE_AGGREGATE')
    view.configure({aggregates: {}})
    expect(view.aggregateResult).toEqual({})
  })

  it('retains local summaries for the explicit static-array query owner', async () => {
    const {runtime} = setup('{"Type":"Sum"}')
    const formal = DataSpaceDesignApi.projectModel({rowid: 'ARRAY', Name: 'Items', Type: '数组', MetaName: 'Items'}, [
      {rowid: 'KEY', dataModelId: 'ARRAY', Name: 'id', FieldType: 'string', IsOutput: 1, IsPKey: 1},
      {rowid: 'VALUE', dataModelId: 'ARRAY', Name: 'amount', FieldType: 'number', IsOutput: 1},
    ], 'id')
    const dataSet = DataSet.fromJson({scenarioId: 'SCENE', tables: {Items: {tableName: 'Items', resourceType: 'static-data',
      modelBinding: {modelId: 'ARRAY', modelName: 'Items'},
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'amount', type: 'number'}],
      views: {default: {aggregates: {totalAmount: {type: 'sum', field: 'amount'}}}},
    }}})
    sets.push(dataSet)
    const view = dataSet.getView('Items')!
    runtime.bindModelView(view, formal, [{id: 'ONE', amount: 3}, {id: 'TWO', amount: 4}])
    expect((await view.loadFromServer()).success).toBe(true)
    expect(view.aggregateError).toBeNull()
    expect(view.aggregateResult).toEqual({totalAmount: 7})
    view.setSelectedRows([view.rows[0]!])
    expect(view.selectionAggregateResult).toEqual({totalAmount: 3})
  })

  it('offers the shared editor only the value functions accepted by this query position', () => {
    const context = DataSpaceQueryAggregation.editorContext()
    expect(getDataViewFilterFunctionDefinitions(context).map(item => item.type).sort()).toEqual(['Avg', 'Count', 'GetGroupData', 'Max', 'Min', 'Sum'])
    for (const Type of ['Sum', 'Count', 'Avg', 'Min', 'Max']) {
      expect(DataSpaceQueryAggregation.normalize({Type}, {name: 'amount', canonicalName: 'amount', type: 'number'})).toMatchObject({Type: 'GetGroupData'})
    }
  })
  it.each(['数据库表', '数据库视图', '接口', '视图', '字典', 'JSON'])('uses the same resource predicate for design preflight and runtime: %s', sourceType => {
    const model = {sourceType, sourceName: 'Source'}
    expect(() => DataSpaceRuntimeApi.validateResourceQuery(model, {})).not.toThrow()
    const direct = () => DataSpaceRuntimeApi.validateResourceQuery(model, {sourceInputMode: 'direct'})
    if (['接口', '视图'].includes(sourceType)) expect(direct).not.toThrow()
    else expect(direct).toThrow('SPARK_SOURCE_INPUT')
    for (const outputType of ['Table', 'Join', 'SelfRefData', 'HierarchyData', 'Navigation']) {
      const aggregate = () => DataSpaceRuntimeApi.validateResourceQuery(model, {aggregate: true, outputType})
      if (['数据库表', '数据库视图'].includes(sourceType) && ['Table', 'Join'].includes(outputType)) expect(aggregate).not.toThrow()
      else expect(aggregate).toThrow('SPARK_QUERY_AGGREGATE')
      expect(() => DataSpaceRuntimeApi.validateResourceQuery(model, {aggregate: true, outputType, tree: true})).toThrow('SPARK_QUERY_AGGREGATE')
    }
  })

  it.each(['SUM', 'COUNT', 'AVERAGE', 'MIN', 'MAX'])('sends %s through the formal GetData query and uses its readonly result', async functionName => {
    const {statistics, list, dataSet, formal, http, runtime} = setup(JSON.stringify({Type: 'GetGroupData', ValType: functionName}))
    const modelBefore = JSON.stringify(formal), definition = dataSet.toJson()
    await list.loadFromServer({pageSize: 1})
    expect(list.rows[0]?.['revenue']).toBe(3)
    expect(list.total).toBe(300)
    expect((await statistics.loadFromServer()).success).toBe(true)
    expect(statistics.rows).toHaveLength(1)
    expect(statistics.rows[0]?.['revenue']).toBe(912)
    expect(statistics.primaryKey).toBe('')
    expect(statistics.fieldAccess(statistics.rows[0]!, 'revenue').write).toBe('denied')
    expect(http.requests.at(-1)?.data).toMatchObject({OutputFieldMode: 'REQUEST', Table: [{Name: 'Orders',
      Fields: [{Name: 'amount', Group: 0, ValueFun: {Type: 'GetGroupData', ValType: functionName}}]}]})
    expect(list.primaryKey).toBe('rowid')
    expect(list.rows[0]?.['revenue']).toBe(3)
    expect(JSON.stringify(formal)).toBe(modelBefore)
    const reopened = DataSet.fromJson(definition); sets.push(reopened)
    const next = reopened.getView('Orders', 'statistics')!
    runtime.bindModelView(next, formal)
    expect((await next.loadFromServer()).success).toBe(true)
    expect(next.rows[0]?.['revenue']).toBe(912)
    await expect(next.saveChanges()).rejects.toThrow()
  })

  it.each(['Sum', 'Count', 'Avg', 'Min', 'Max'])('accepts backend shorthand %s and keeps grouping, filtering and paging in the same view', async Type => {
    const {statistics, http} = setup(JSON.stringify({Type}), {grouped: true})
    expect((await statistics.loadFromServer({filter: {field: 'department', operator: 'eq', value: 'North'}})).success).toBe(true)
    expect((await statistics.loadFromServer({page: 2, sort: 'department:asc', filter: {field: 'department', operator: 'eq', value: 'South'}})).success).toBe(true)
    expect(http.requests).toHaveLength(2)
    expect(http.requests[1]?.data).toMatchObject({PageParam: {index: 2, size: 1}, Table: [{
      Filter: {Field: 'dept', ValueFun: {Type: 'GetConstValue', Value: 'South'}},
      Fields: [{Name: 'dept', Group: 1}, {Name: 'amount', ValueFun: {Type: 'GetGroupData'}}],
    }]})
    expect(statistics.rows[0]).toMatchObject({department: 'North', revenue: 912})
    expect(statistics.total).toBe(3)
  })

  it.each([
    '{"Type":"GetConstValue","Value":3}', '{"Type":"GetGroupData","ValType":"JOIN"}',
    '{"Type":"GetGroupData","ValType":"SUM","Field":"another"}',
    '{"Type":"Sum","GroupTableName":"Unrelated"}',
  ])('rejects non-equivalent aggregate config before transport: %s', async expression => {
    const {statistics, http} = setup(expression)
    await expect(statistics.loadFromServer()).rejects.toThrow()
    expect(http.requests).toHaveLength(0)
  })

  it.each(['接口', '字典'])('rejects aggregation for an unimplemented resource: %s', async sourceType => {
    const {statistics, http} = setup('{"Type":"Sum"}', {sourceType})
    await expect(statistics.loadFromServer()).rejects.toThrow()
    expect(http.requests).toHaveLength(0)
  })

  it('rejects a mixed aggregate and ungrouped output instead of adding a primary key', async () => {
    const {statistics, http} = setup('{"Type":"Sum"}')
    statistics.fieldProjection = [projection('dept'), ...statistics.fieldProjection]
    await expect(statistics.loadFromServer()).rejects.toThrow()
    expect(http.requests).toHaveLength(0)
  })

  it('allows an explicit grouped view without an aggregate and treats the result as readonly', async () => {
    const {statistics, http} = setup('')
    statistics.fieldProjection = [projection('dept', 1)]
    expect((await statistics.loadFromServer()).success).toBe(true)
    expect(http.requests[0]?.data).toMatchObject({OutputFieldMode: 'REQUEST', Table: [{Fields: [{Name: 'dept', Group: 1}]}]})
    expect(statistics.primaryKey).toBe('')
    expect(statistics.fieldAccess(statistics.rows[0]!, 'department').write).toBe('denied')
  })

  it('preserves server null and zero instead of inventing a local aggregate default', async () => {
    const {statistics, http} = setup('{"Type":"Count"}')
    http.aggregateValue = 0
    await statistics.loadFromServer()
    expect(statistics.rows[0]?.['revenue']).toBe(0)
    http.aggregateValue = null
    await statistics.loadFromServer()
    expect(statistics.rows[0]?.['revenue']).toBeNull()
  })

  it('replaces inherited groups explicitly in Join without reintroducing the source record key', async () => {
    const {statistics, http} = setup('{"Type":"Sum"}', {grouped: true, modelGroups: {rowid: 1}})
    await statistics.loadFromServer({outputType: 'Join'})
    expect(http.requests[0]?.data).toMatchObject({Table: [{Fields: [{Name: 'dept', Group: 1}, {Name: 'amount', Group: 0}]}]})
    expect(statistics.primaryKey).toBe('')
  })

  it.each(['引用', '计算字段'])('rejects unsupported aggregation of a derived backend field: %s', async type => {
    const {statistics, http} = setup('{"Type":"Sum"}', {fieldTypes: {amount: type}})
    await expect(statistics.loadFromServer()).rejects.toThrow('SPARK_QUERY_AGGREGATE')
    expect(http.requests).toHaveLength(0)
  })

  it('does not mistake an inherited ordinary value function for a grouped aggregate', async () => {
    const {statistics, http} = setup('{"Type":"Sum"}', {modelValueFunctions: {dept: '{"Type":"GetConstValue","Value":"literal"}'}})
    statistics.fieldProjection = [projection('dept'), ...statistics.fieldProjection]
    await expect(statistics.loadFromServer()).rejects.toThrow('SPARK_QUERY_AGGREGATE')
    expect(http.requests).toHaveLength(0)
  })

  it('clears a previous aggregate when the server returns no groups without recomputing from list rows', async () => {
    const {statistics, list, http} = setup('{"Type":"Sum"}', {grouped: true})
    await list.loadFromServer(); await statistics.loadFromServer()
    http.empty = true
    expect((await statistics.loadFromServer()).success).toBe(true)
    expect(statistics.rows).toEqual([])
    expect(statistics.total).toBe(0)
    expect(list.rows[0]?.['revenue']).toBe(3)
  })

  it('rejects server tree mode and a stale aggregation response', async () => {
    const {statistics, http, invalidate} = setup('{"Type":"Sum"}')
    await expect(statistics.loadFromServer({outputType: 'SelfRefData'})).rejects.toThrow()
    expect(http.requests).toHaveLength(0)
    let release: () => void = () => {throw new Error('Gate not initialized')}
    http.gate = new Promise<void>(resolve => {release = resolve})
    const pending = statistics.loadFromServer()
    await vi.waitFor(() => expect(http.requests).toHaveLength(1))
    invalidate(); release()
    await expect(pending).rejects.toThrow()
    expect(statistics.rows).toHaveLength(0)
  })
})
