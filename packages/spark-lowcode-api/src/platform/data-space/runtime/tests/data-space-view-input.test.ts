import { describe, expect, it } from 'vitest'
import { DataSet } from '@spark-appworks/spark-data'
import { HttpClientBase, type HttpResponse, type RequestConfig } from '@spark-appworks/spark-utils'
import { DataSpaceRuntimeApi } from '../data-space-runtime-api'

class InputHttp extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    return {data: {Code: 200, Result: {primaryKeyField: 'id', allowAdd: false,
      data: {Items: [], Count: 0}}}, status: 200, statusText: 'OK', headers: {}}
  }
}

function fixture(filterExpression: unknown, context: Record<string, unknown>) {
  const http = new InputHttp()
  const dataSet = DataSet.fromJson({scenarioId: 'FORM', dataSetName: 'FORM', tables: {Orders: {
    tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'},
    columns: [{name: 'id', type: 'string', isPrimaryKey: true}],
    views: {default: {filterExpression}},
  }}})
  const view = dataSet.getView('Orders', 'default')
  if (!view) throw new Error('missing view')
  view.queryContext = context
  const model = {id: 'MODEL', name: 'OrdersModel', metaName: 'OrdersModel', sourceName: 'Orders',
    sourceId: '', sourceType: 'table', primaryKey: 'id', businessMain: false, raw: {},
    fields: [{id: 'FIELD-ID', modelId: 'MODEL', name: 'id', canonicalName: 'id', type: 'string',
      primaryKey: true, description: '', output: true, computed: false, order: 0, orderType: '', raw: {}}]}
  const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})})
  runtime.bindModelView(view, model)
  return {dataSet, view, http}
}

function wire(http: InputHttp) {
  const request = http.requests[0]?.data
  if (!request || typeof request !== 'object' || !('Table' in request) || !Array.isArray(request.Table)) {
    throw new Error('missing formal wire request')
  }
  return request.Table[0]
}

describe('DataView input filter binding', () => {
  it.each([
    ['zero', 0], ['false', false], ['empty', ''], ['null', null],
  ])('binds explicit %s through the real DataView query owner', async (_label, value) => {
    const original = {field: 'id', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'formid'}}
    const {dataSet, view, http} = fixture(original, {formid: value})
    await view.loadFromServer()
    expect(wire(http)).toMatchObject({Filter: {Type: 'cond', ValueFun: {Type: 'GetConstValue', Value: value}},
      inputParams: [{Name: 'formid', Value: value}]})
    expect(view.filterExpression).toEqual(original)
    dataSet.destroy()
  })

  it('binds nested AND/OR and uses this call context while retaining other value functions', async () => {
    const original = {logic: 'and', filters: [
      {field: 'id', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'formid'}},
      {logic: 'or', filters: [
        {field: 'id', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'other'}},
        {field: 'id', operator: 'eq', value: {Type: 'GetApiPublicParam', ParamName: 'external'}},
      ]},
    ]}
    const {dataSet, view, http} = fixture(original, {formid: 'old', other: 0})
    await view.loadFromServer({context: {formid: 'new', other: false}})
    expect(wire(http)).toMatchObject({Filter: {Type: 'and', Filters: [
      {ValueFun: {Type: 'GetConstValue', Value: 'new'}},
      {Type: 'or', Filters: [
        {ValueFun: {Type: 'GetConstValue', Value: false}},
        {ValueFun: {Type: 'GetApiPublicParam', ParamName: 'external'}},
      ]},
    ]}, inputParams: [{Name: 'formid', Value: 'new'}, {Name: 'other', Value: false}]})
    expect(view.queryContext).toEqual({formid: 'old', other: 0})
    expect(view.filterExpression).toEqual(original)
    dataSet.destroy()
  })

  it.each([
    ['missing', {}], ['undefined', {formid: undefined}], ['non-JSON', {formid: Number.NaN}],
  ])('rejects %s input before dispatch', async (_label, context) => {
    const {dataSet, view, http} = fixture(
      {field: 'id', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'formid'}}, context)
    await expect(view.loadFromServer()).rejects.toThrow('GetInputParam')
    expect(http.requests).toHaveLength(0)
    dataSet.destroy()
  })
})
