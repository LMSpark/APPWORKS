import { describe, expect, it } from 'vitest'
import { DataSet } from '../../../../../../packages/spark-data/src/dataset'

function result(tableName: string, rows: Array<Record<string, unknown>>) {
  return {
    rows, total: rows.length,
    assertIdentity(identity: { scenarioId: string; metaName: string }) {
      if (identity.scenarioId !== 'SCENE' || identity.metaName !== tableName) throw new Error('identity mismatch')
    },
    rowKey: (row: Record<string, unknown>) => row['id'],
    fieldAccess: () => ({ read: 'visible', write: 'denied', component: 'readonly', required: false, writeMode: 'readonly' }),
    readFieldAccess: () => 'visible',
    addActionState: () => 'hidden', editActionState: () => 'hidden',
    deleteActionState: () => 'hidden', createChildActionState: () => 'hidden', viewActionState: () => 'hidden',
  }
}

function orderView(expression: string, projection = false) {
  const fieldProjection = projection ? [
    { fieldId: 'ID', source: 'resource', resourceFieldId: 'ID', resourceField: 'id', viewField: 'id',
      type: 'number', label: 'id', output: true, sortOrder: 0, sortDirection: null,
      group: 0, distinct: false, primaryKey: true, value: '', valueFunction: '', expression: '' },
    { fieldId: 'PRICE', source: 'resource', resourceFieldId: 'PRICE', resourceField: 'price', viewField: 'price',
      type: 'number', label: 'price', output: true, sortOrder: 1, sortDirection: null,
      group: 0, distinct: false, primaryKey: false, value: '', valueFunction: '', expression: '' },
  ] : undefined
  const ds = DataSet.fromJson({ dataSetName: 'Probe', scenarioId: 'SCENE', tables: {
    Orders: { tableName: 'Orders', modelBinding: { modelId: 'ORDER', modelName: 'Orders' }, columns: [
      { name: 'id', type: 'number', isPrimaryKey: true }, { name: 'price', type: 'number' },
      { name: 'qty', type: 'number' }, { name: 'total', type: 'number', computeExpression: expression },
    ], views: { default: fieldProjection ? { fieldProjection } : {} } },
  } })
  const view = ds.getView('Orders', 'default')
  if (!view) throw new Error('missing view')
  return view
}

describe('review-only current behavior probes', () => {
  it('caught missing projected input becomes visible computed output', async () => {
    const view = orderView('try { return qty } catch { return 77 }', true)
    view.bindQueryExecutor({ executeQuery: async () => result('Orders', [{ id: 1, price: 3 }]) })
    await view.loadFromServer()
    expect(view.rows[0]?.['total']).toBe(77)
    expect(view.fieldAccess(view.rows[0] ?? null, 'total').read).toBe('visible')
  })

  it('failed replacement leaves old computed read visible', async () => {
    const view = orderView('price * qty')
    let fail = false
    view.bindQueryExecutor({ executeQuery: async () => {
      if (fail) throw new Error('query failed')
      return result('Orders', [{ id: 1, price: 3, qty: 4 }])
    } })
    await view.loadFromServer()
    const old = view.rows[0]
    fail = true
    await expect(view.loadFromServer()).rejects.toThrow('query failed')
    expect(view.fieldAccess(old ?? null, 'total').read).toBe('visible')
  })

  it('deleted row object retains computed read access', async () => {
    const view = orderView('price * qty')
    view.bindQueryExecutor({ executeQuery: async () => result('Orders', [{ id: 1, price: 3, qty: 4 }]) })
    await view.loadFromServer()
    const old = view.rows[0]
    expect(view.deleteRowById(1)).toBe(true)
    expect(view.fieldAccess(old ?? null, 'total').read).toBe('visible')
  })

  it('unqueried child aggregate is accepted as a visible zero', async () => {
    const ds = DataSet.fromJson({ dataSetName: 'AggregateProbe', scenarioId: 'SCENE', tables: {
      Orders: { tableName: 'Orders', modelBinding: { modelId: 'ORDER', modelName: 'Orders' }, columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'total', type: 'number', computeExpression: "$count('Items')" },
      ], views: { default: {} } },
      Items: { tableName: 'Items', modelBinding: { modelId: 'ITEM', modelName: 'Items' }, columns: [
        { name: 'id', type: 'number', isPrimaryKey: true }, { name: 'orderId', type: 'number' },
      ], views: { default: {} } },
    }, resourceRelations: [{ parentTable: 'Orders', childTable: 'Items', filterExpression: {
      logic: 'and', filters: [{ field: 'orderId', operator: 'eq', value: { Type: 'GetTableField', Field: 'id' } }],
    } }] })
    const view = ds.getView('Orders', 'default')
    if (!view) throw new Error('missing parent view')
    view.bindQueryExecutor({ executeQuery: async () => result('Orders', [{ id: 1 }]) })
    await view.loadFromServer()
    expect(view.rows[0]?.['total']).toBe(0)
    expect(view.fieldAccess(view.rows[0] ?? null, 'total').read).toBe('visible')
  })
})
