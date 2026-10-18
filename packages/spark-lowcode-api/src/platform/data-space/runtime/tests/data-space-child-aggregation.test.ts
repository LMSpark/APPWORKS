import {afterEach, describe, expect, it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {HttpClientBase, isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {DataSpaceDesignApi} from '../../design/data-space-design-api'
import {DataSpaceRuntimeApi} from '../data-space-runtime-api'

const sets: DataSet[] = []
afterEach(() => sets.splice(0).forEach(set => set.destroy()))

function setup(expression: string, local = false, remoteChild = false, unboundParent = false) {
  const dataSet = DataSet.fromJson({scenarioId: 'SCENE', tables: {
    Orders: {tableName: 'Orders', resourceType: local ? 'static-data' : 'database',
      ...(unboundParent ? {} : {modelBinding: {modelId: 'ORDER', modelName: 'Orders'}}), columns: [
      {name: 'id', type: 'number', isPrimaryKey: true}, {name: 'price', type: 'number'},
      {name: 'doublePrice', type: 'number', computeExpression: 'price * 2'},
      {name: 'total', type: 'number', computeExpression: expression},
    ], views: {default: {pageSize: 1}}},
    Items: {tableName: 'Items', resourceType: local && !remoteChild ? 'static-data' : 'database', modelBinding: {modelId: 'ITEM', modelName: 'Items'}, columns: [
      {name: 'id', type: 'number', isPrimaryKey: true}, {name: 'orderId', type: 'number'}, {name: 'amount', type: 'number'},
    ], views: {default: {pageSize: 1}}},
  }, resourceRelations: [{parentTable: 'Orders', childTable: 'Items', filterExpression: {
    logic: 'and', filters: [{field: 'orderId', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}],
  }}]})
  sets.push(dataSet)
  class QueryHttp extends HttpClientBase {
    requests: RequestConfig[] = []
    protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
      this.requests.push(config)
      const body = config.data
      if (!isRecord(body) || !Array.isArray(body['Table']) || !isRecord(body['Table'][0])) throw new Error('Expected query')
      const child = body['Table'][0]['Name'] === 'Items'
      return {status: 200, statusText: 'OK', headers: {}, data: {Code: 200, Result: {primaryKeyField: 'id',
        data: {Items: [child ? {id: 10, orderId: 1, amount: 5} : {id: 1, price: 3, lingma_sys_params: {e: ['price']}}], Count: child ? 300 : 1}}}}
    }
  }
  const http = new QueryHttp(), runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'CURRENT', headers: {}})})
  function bind(set: DataSet, local = false, remoteChild = false, only?: 'Orders' | 'Items') {
    for (const [tableName, modelId, fields] of [['Orders', 'ORDER', ['id', 'price']], ['Items', 'ITEM', ['id', 'orderId', 'amount']]] as const) {
      if (only && tableName !== only) continue
      const isLocal = local && !(remoteChild && tableName === 'Items')
      const formal = DataSpaceDesignApi.projectModel({rowid: modelId, Name: tableName, MetaName: tableName, Type: isLocal ? '数组' : '数据库表'},
        fields.map(name => ({rowid: `${modelId}-${name}`, dataModelId: modelId, Name: name, FieldType: 'number', IsOutput: 1, IsPKey: name === 'id' ? 1 : 0})), 'id')
      runtime.bindModelView(set.getView(tableName)!, formal, isLocal
        ? tableName === 'Orders' ? [{id: 1, price: 3}] : [{id: 10, orderId: 1, amount: 5}, {id: 11, orderId: 1, amount: 7}]
        : undefined)
    }
  }
  return {dataSet, orders: dataSet.getView('Orders')!, items: dataSet.getView('Items')!, bind, http}
}

describe('formal remote child aggregate boundary', () => {
  it.each(["$sum('Items', 'amount')", "$count('Items')", "$avg('Items', 'amount')", "$min('Items', 'amount')",
    "$max('Items', 'amount')", "$list('Items', 'amount')", "$join('Items', 'amount')",
    "$sum /* comment */ ('Items', 'amount')", "const sum = $sum; try { return sum('Items', 'amount') } catch { return 0 }",
    "try { return $sum('Items', 'amount') + price } catch { return 0 }"])(
    'does not publish empty or partial local business statistics: %s', async expression => {
      const {dataSet, orders, items, bind, http} = setup(expression)
      bind(dataSet)
      expect((await orders.loadFromServer()).success).toBe(true)
      expect(orders.rows[0]?.['total']).toBeUndefined()
      expect(orders.computedAggregateError?.message).toContain('DATA_VIEW_REMOTE_COMPUTED_AGGREGATE')
      expect((await items.loadFromServer()).success).toBe(true)
      expect(items.rows).toHaveLength(1); expect(items.total).toBe(300)
      expect(orders.rows[0]?.['total']).toBeUndefined()
      expect(orders.rows[0]?.['doublePrice']).toBe(6)
      expect(orders.fieldAccess(orders.rows[0]!, 'total').read).toBe('invisible')
      orders.updateEditingValue(1, 'price', 4)
      orders.discardEditingRows()
      expect(orders.getEditingRow(1)?.['price']).toBe(3)
      expect(JSON.stringify(http.requests)).not.toContain('GetGroupData')
      const reopened = DataSet.fromJson(dataSet.toJson()); sets.push(reopened); bind(reopened)
      expect(reopened.getTable('Orders')!.columns.find(column => column.name === 'total')?.computeExpression).toBe(expression)
      await reopened.getView('Orders')!.loadFromServer()
      expect(reopened.getView('Orders')!.computedAggregateError?.message).toContain('DATA_VIEW_REMOTE_COMPUTED_AGGREGATE')
      dataSet.getTable('Orders')!.updateColumn('total', {computeExpression: 'price * 3'})
      expect(orders.computedAggregateError).toBeNull()
      expect(orders.rows[0]?.['total']).toBe(9)
      expect(orders.fieldAccess(orders.rows[0]!, 'total').read).toBe('visible')
    })

  it('keeps explicitly local array relations and single-row computations working', async () => {
    const {dataSet, orders, items, bind} = setup("$sum('Items', 'amount') + $count('Items')", true)
    bind(dataSet, true)
    await items.loadFromServer({pageSize: 20}); await orders.loadFromServer()
    expect(orders.rows[0]?.['total']).toBe(14)
    expect(orders.rows[0]?.['doublePrice']).toBe(6)
    expect(orders.computedAggregateError).toBeNull()
  })

  it('does not treat an already loaded child page as the complete relation', async () => {
    const {dataSet, orders, items, bind} = setup("$sum('Items', 'amount')")
    bind(dataSet)
    await items.loadFromServer(); await orders.loadFromServer()
    expect(items.total).toBe(300)
    expect(orders.rows[0]?.['total']).toBeUndefined()
  })

  it('does not let a local parent swallow a remote child error and publish a fallback', async () => {
    const {dataSet, orders, items, bind} = setup("try { return $sum('Items', 'amount') } catch { return 0 }", true, true)
    bind(dataSet, true, true)
    await orders.loadFromServer(); await items.loadFromServer()
    expect(orders.supportsLocalAggregates).toBe(true)
    expect(items.supportsLocalAggregates).toBe(false)
    expect(orders.rows[0]?.['total']).toBeUndefined()
    expect(orders.computedColumnError('total')?.message).toContain('DATA_VIEW_REMOTE_COMPUTED_AGGREGATE')
  })

  it('does not confuse an ordinary string containing a function name with aggregate execution', async () => {
    const {dataSet, orders, bind} = setup("'$sum(' + price")
    bind(dataSet)
    await orders.loadFromServer()
    expect(orders.rows[0]?.['total']).toBe('$sum(3')
    expect(orders.computedAggregateError).toBeNull()
  })

  it('does not republish a failed remote child total through a local formula or a local view summary', async () => {
    const {dataSet, orders, items, bind} = setup("$sum('Items', 'amount')", true, true, true)
    orders.dataTable!.addColumns([{name: 'derived', type: 'number', computeExpression: 'total ?? 0'}])
    bind(dataSet, false, false, 'Items')
    await items.loadFromServer()
    orders.updateFromServer([{id: 1, price: 3}])
    expect(orders.rows[0]?.['total']).toBeUndefined()
    expect(orders.rows[0]?.['derived']).toBeUndefined()
    expect(orders.computedColumnError('derived')?.message).toContain('DATA_VIEW_REMOTE_COMPUTED_AGGREGATE')
    orders.configure({aggregates: {grandTotal: {type: 'sum', field: 'derived'}}})
    expect(() => orders.aggregateResult).toThrow('DATA_VIEW_REMOTE_COMPUTED_AGGREGATE')
    expect(orders.rows[0]?.['doublePrice']).toBe(6)
  })
})
