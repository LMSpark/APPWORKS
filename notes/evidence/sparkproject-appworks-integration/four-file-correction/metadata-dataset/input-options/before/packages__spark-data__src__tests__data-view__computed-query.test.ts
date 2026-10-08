import { describe, expect, it } from 'vitest'
import { DataSet } from '../../dataset'
import type { DataRow } from '../../types'

type FixtureRow = DataRow & { lingma_sys_params?: { h?: string[]; m?: string[] } }

function makeResult(tableName: string, rows: FixtureRow[], keyless = false) {
  const identity = { scenarioId: 'SCENE', metaName: tableName }
  const access = (row: DataRow, field: string) => {
    const read = !rows.includes(row) || row.lingma_sys_params?.h?.includes(field) ? 'invisible'
      : row.lingma_sys_params?.m?.includes(field) ? 'masked'
        : 'visible'
    return { read, write: 'denied', component: read === 'invisible' ? 'hidden' : 'readonly',
      required: false, writeMode: 'readonly' } as const
  }
  return {
    rows, total: rows.length,
    assertIdentity(actual: typeof identity) {
      if (actual.scenarioId !== identity.scenarioId || actual.metaName !== identity.metaName) throw new Error('identity mismatch')
    },
    rowKey: (row: DataRow) => keyless ? undefined : row['id'],
    fieldAccess: (key: unknown, field: string) => access(rows.find(row => row['id'] === key) ?? {}, field),
    readFieldAccess: (row: DataRow, field: string) => access(row, field).read,
    addActionState: () => 'hidden' as const,
    editActionState: () => 'hidden' as const,
    deleteActionState: () => 'hidden' as const,
    createChildActionState: () => 'hidden' as const,
    viewActionState: () => 'hidden' as const,
  }
}

function makeDataSet(expression = 'price * qty', projection = false) {
  const ds = DataSet.fromJson({ dataSetName: 'ComputedQuery', scenarioId: 'SCENE', tables: {
    Orders: { tableName: 'Orders', modelBinding: { modelId: 'ORDER', modelName: 'Orders' }, columns: [
      { name: 'id', type: 'number', isPrimaryKey: true }, { name: 'price', type: 'number' },
      { name: 'qty', type: 'number' }, { name: 'secret', type: 'number' },
      { name: 'total', type: 'number', computeExpression: expression },
      { name: 'double', type: 'number', computeExpression: 'total * 2' },
    ], views: { default: projection ? { fieldProjection: [
      { fieldId: 'ID', source: 'resource', resourceFieldId: 'ID', resourceField: 'id', viewField: 'id',
        type: 'number', label: 'id', output: true, sortOrder: 0, sortDirection: null,
        group: 0, distinct: false, primaryKey: true, value: '', valueFunction: '', expression: '' },
      { fieldId: 'PRICE', source: 'resource', resourceFieldId: 'PRICE', resourceField: 'price', viewField: 'price',
        type: 'number', label: 'price', output: true, sortOrder: 1, sortDirection: null,
        group: 0, distinct: false, primaryKey: false, value: '', valueFunction: '', expression: '' },
    ] } : {} } },
  } })
  const view = ds.getView('Orders', 'default')
  if (!view) throw new Error('missing view')
  return { ds, view }
}

describe('bound computed query consumption', () => {
  it('computes visible inputs and chains without modifying source values; output is readonly', async () => {
    const { view } = makeDataSet()
    const result = makeResult('Orders', [{ id: 1, price: 3, qty: 4 }])
    view.bindQueryExecutor({ executeQuery: async () => result })
    await view.loadFromServer()
    const row = view.rows[0]
    expect(row?.['total']).toBe(12)
    expect(row?.['double']).toBe(24)
    expect(row?.['price']).toBe(3)
    expect(view.fieldAccess(row ?? null, 'total')).toMatchObject({ read: 'visible', write: 'denied', component: 'readonly', required: false })
    expect(view.stripComputedColumns(row ?? {})).not.toHaveProperty('total')
  })

  it.each(['h', 'm'] as const)('rejects %s input even when expression catches the read', async marker => {
    const { view } = makeDataSet('try { return secret } catch { return 77 }')
    const result = makeResult('Orders', [{ id: 1, price: 3, qty: 4, secret: 99,
      lingma_sys_params: { [marker]: ['secret'] } }])
    view.bindQueryExecutor({ executeQuery: async () => result })
    await view.loadFromServer()
    const row = view.rows[0]
    expect(row?.['total']).toBeUndefined()
    expect(view.fieldAccess(row ?? null, 'total').read).toBe('invisible')
    expect(view.fieldAccess(row ?? null, 'double').read).toBe('invisible')
  })

  it('rejects mutation of source and nested values', async () => {
    const { view } = makeDataSet('price = 900; return price')
    const result = makeResult('Orders', [{ id: 1, price: 3, qty: 4 }])
    view.bindQueryExecutor({ executeQuery: async () => result })
    await view.loadFromServer()
    expect(view.rows[0]?.['price']).toBe(3)
    expect(view.fieldAccess(view.rows[0] ?? null, 'total').read).toBe('invisible')
  })

  it('keeps nested query values unchanged when an expression edits its private copy', async () => {
    const { view } = makeDataSet('secret.value = 99; return secret.value')
    const result = makeResult('Orders', [{ id: 1, price: 3, qty: 4, secret: { value: 3 } }])
    view.bindQueryExecutor({ executeQuery: async () => result })
    await view.loadFromServer()
    expect(view.rows[0]?.['total']).toBe(99)
    expect(view.rows[0]?.['secret']).toEqual({ value: 3 })
    expect(result.rows[0]?.['secret']).toEqual({ value: 3 })
  })

  it('keeps projected local columns and rejects absent projected inputs', async () => {
    const { view } = makeDataSet('price + qty', true)
    expect(view.columns.map(column => column.name)).toContain('total')
    const result = makeResult('Orders', [{ id: 1, price: 3 }])
    view.bindQueryExecutor({ executeQuery: async () => result })
    await view.loadFromServer()
    expect(view.fieldAccess(view.rows[0] ?? null, 'total').read).toBe('invisible')
  })

  it('marks a caught read of a nonprojected formal field as denied', async () => {
    const { view } = makeDataSet('try { return qty } catch { return 77 }', true)
    const result = makeResult('Orders', [{ id: 1, price: 3 }])
    view.bindQueryExecutor({ executeQuery: async () => result })
    await view.loadFromServer()
    expect(view.rows[0]?.['total']).toBeUndefined()
    expect(view.fieldAccess(view.rows[0] ?? null, 'total').read).toBe('invisible')
  })

  it('rejects an extra query field even when the query owner defaults its read to visible', async () => {
    const { view } = makeDataSet('wireExtra + price')
    const result = makeResult('Orders', [{ id: 1, price: 3, qty: 4, wireExtra: 99 }])
    view.bindQueryExecutor({ executeQuery: async () => result })
    await view.loadFromServer()
    expect(view.fieldAccess(view.rows[0] ?? null, 'wireExtra').read).toBe('visible')
    expect(view.rows[0]?.['total']).toBeUndefined()
    expect(view.fieldAccess(view.rows[0] ?? null, 'total').read).toBe('invisible')
  })

  it('does not reuse old result permission after a replacement with the same key', async () => {
    const { view } = makeDataSet()
    let result = makeResult('Orders', [{ id: 1, price: 3, qty: 4 }])
    view.bindQueryExecutor({ executeQuery: async () => result })
    await view.loadFromServer()
    const old = view.rows[0]
    result = makeResult('Orders', [{ id: 1, price: 5, qty: 6, lingma_sys_params: { h: ['price'] } }])
    await view.loadFromServer()
    expect(view.fieldAccess(old ?? null, 'total').read).toBe('invisible')
    expect(view.fieldAccess(view.rows[0] ?? null, 'total').read).toBe('invisible')
  })

  it('binds keyless computed reads to the current query row object', async () => {
    const { view } = makeDataSet()
    view.primaryKey = ''
    const result = makeResult('Orders', [{ id: 1, price: 3, qty: 4 }], true)
    view.bindQueryExecutor({ executeQuery: async () => result })
    await view.loadFromServer()
    const row = view.rows[0]
    expect(row?.['total']).toBe(12)
    expect(view.fieldAccess(row ?? null, 'total').read).toBe('visible')
    expect(view.fieldAccess(row ? { ...row } : null, 'total').read).toBe('invisible')
  })

  it('recomputes a real editing patch while keeping the query row and computed output readonly', async () => {
    const { view } = makeDataSet()
    const result = makeResult('Orders', [{ id: 1, price: 3, qty: 4 }])
    view.bindQueryExecutor({ executeQuery: async () => result })
    await view.loadFromServer()
    const edit = view.updateEditingValue(1, 'price', 5)
    expect(view.getEditingPatch(1)).toEqual({ price: 5 })
    expect(edit['total']).toBe(20)
    expect(view.fieldAccess(edit, 'total').read).toBe('visible')
    expect(view.fieldAccess(edit, 'total').write).toBe('denied')
    expect(view.rows[0]?.['total']).toBe(12)
    expect(view.rows[0]?.['price']).toBe(3)
    expect(result.rows[0]?.['price']).toBe(3)
  })

  it('replaces and clears configured functions without removing framework _pk', async () => {
    const { view } = makeDataSet()
    const result = makeResult('Orders', [{ id: 1, price: 3, qty: 4 }])
    view.bindQueryExecutor({ executeQuery: async () => result })
    await view.loadFromServer()
    const table = view.dataTable
    if (!table) throw new Error('missing table')
    table.columns = table.columns.map(column => column.name === 'total'
      ? { ...column, computeExpression: 'price + qty' } : column)
    view.recomputeColumns()
    expect(view.rows[0]?.['total']).toBe(7)
    table.columns = table.columns.map(column => column.name === 'total'
      ? { ...column, computeExpression: undefined } : column)
    view.recomputeColumns()
    expect(view.computedColumnNames.has('total')).toBe(false)
    expect(view.computedColumnNames.has('_pk')).toBe(true)
    expect(view.rows[0]).not.toHaveProperty('total')
  })

  it('throws on invalid bound expressions', () => {
    expect(() => makeDataSet('??invalid!!')).toThrow(/表达式编译失败/)
  })

  it('preserves block local variables, loops and local functions', async () => {
    const { view } = makeDataSet('let subtotal = 0; for (let i = 0; i < qty; i++) subtotal += price; function bump(value) { return value + 1 }; return bump(subtotal)')
    const result = makeResult('Orders', [{ id: 1, price: 3, qty: 4 }])
    view.bindQueryExecutor({ executeQuery: async () => result })
    await view.loadFromServer()
    expect(view.rows[0]?.['total']).toBe(13)
    expect(view.fieldAccess(view.rows[0] ?? null, 'total').read).toBe('visible')
  })

  it('does not use framework _pk as an input when its source key is hidden', async () => {
    const { view } = makeDataSet('_pk')
    const result = makeResult('Orders', [{ id: 1, price: 3, qty: 4, lingma_sys_params: { h: ['id'] } }])
    view.bindQueryExecutor({ executeQuery: async () => result })
    await view.loadFromServer()
    expect(view.computedColumnNames.has('_pk')).toBe(true)
    expect(view.fieldAccess(view.rows[0] ?? null, 'total').read).toBe('invisible')
  })
})

function makeAggregateDataSet(expression: string, childExpression?: string) {
  const ds = DataSet.fromJson({ dataSetName: 'AggregateQuery', scenarioId: 'SCENE', tables: {
    Orders: { tableName: 'Orders', modelBinding: { modelId: 'ORDER', modelName: 'Orders' }, columns: [
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'secret', type: 'number' },
      { name: 'total', type: 'number', computeExpression: expression },
    ], views: { default: {} } },
    Items: { tableName: 'Items', modelBinding: { modelId: 'ITEM', modelName: 'Items' }, columns: [
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'orderId', type: 'number' }, { name: 'amount', type: 'number' },
      { name: 'secret', type: 'number' },
      ...(childExpression ? [{ name: 'childComputed', type: 'number', computeExpression: childExpression }] : []),
    ], views: { default: {} } },
  }, resourceRelations: [{ parentTable: 'Orders', childTable: 'Items', filterExpression: {
    logic: 'and', filters: [{ field: 'orderId', operator: 'eq', value: { Type: 'GetTableField', Field: 'id' } }],
  } }] })
  const orders = ds.getView('Orders', 'default')
  const items = ds.getView('Items', 'default')
  if (!orders || !items) throw new Error('missing aggregate views')
  return { orders, items }
}

describe('bound computed relation aggregation', () => {
  it('ignores unrelated hidden fields while using the full relation filter', async () => {
    const { orders, items } = makeAggregateDataSet("$sum('Items', 'amount') + $count('Items')")
    const children = makeResult('Items', [{ id: 10, orderId: 1, amount: 5, secret: 99,
      lingma_sys_params: { h: ['secret'] } }])
    items.bindQueryExecutor({ executeQuery: async () => children })
    await items.loadFromServer()
    const parents = makeResult('Orders', [{ id: 1, secret: 88, lingma_sys_params: { h: ['secret'] } }])
    orders.bindQueryExecutor({ executeQuery: async () => parents })
    await orders.loadFromServer()
    expect(orders.rows[0]?.['total']).toBe(6)
    expect(orders.fieldAccess(orders.rows[0] ?? null, 'total').read).toBe('visible')
  })

  it.each(['orderId', 'amount'] as const)('rejects child %s permission and caught partial aggregates', async field => {
    const { orders, items } = makeAggregateDataSet("try { return $sum('Items', 'amount') } catch { return 7 }")
    const children = makeResult('Items', [{ id: 10, orderId: 1, amount: 5,
      lingma_sys_params: { h: [field] } }])
    items.bindQueryExecutor({ executeQuery: async () => children })
    await items.loadFromServer()
    const parents = makeResult('Orders', [{ id: 1 }])
    orders.bindQueryExecutor({ executeQuery: async () => parents })
    await orders.loadFromServer()
    expect(orders.rows[0]?.['total']).toBeUndefined()
    expect(orders.fieldAccess(orders.rows[0] ?? null, 'total').read).toBe('invisible')
  })

  it('rejects hidden parent relation field', async () => {
    const { orders, items } = makeAggregateDataSet("$count('Items')")
    const children = makeResult('Items', [{ id: 10, orderId: 1, amount: 5 }])
    items.bindQueryExecutor({ executeQuery: async () => children })
    await items.loadFromServer()
    const parents = makeResult('Orders', [{ id: 1, lingma_sys_params: { h: ['id'] } }])
    orders.bindQueryExecutor({ executeQuery: async () => parents })
    await orders.loadFromServer()
    expect(orders.fieldAccess(orders.rows[0] ?? null, 'total').read).toBe('invisible')
  })

  it.each([false, true])('uses readable child computed values and rejects failed child values (hidden=%s)', async hidden => {
    const { orders, items } = makeAggregateDataSet("$sum('Items', 'childComputed')", 'amount * 2')
    const children = makeResult('Items', [{ id: 10, orderId: 1, amount: 5,
      ...(hidden ? { lingma_sys_params: { h: ['amount'] } } : {}) }])
    items.bindQueryExecutor({ executeQuery: async () => children })
    await items.loadFromServer()
    const parents = makeResult('Orders', [{ id: 1 }])
    orders.bindQueryExecutor({ executeQuery: async () => parents })
    await orders.loadFromServer()
    expect(orders.fieldAccess(orders.rows[0] ?? null, 'total').read).toBe(hidden ? 'invisible' : 'visible')
    expect(orders.rows[0]?.['total']).toBe(hidden ? undefined : 10)
  })
})
