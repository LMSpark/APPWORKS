import { describe, expect, it, vi } from 'vitest'
import { DataSet } from '../../dataset'
import { DataView } from '../../data-view'
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
  it('queries option rows without changing the source view or table registration', async () => {
    const { ds, view } = makeDataSet()
    const table = view.dataTable
    if (!table) throw new Error('missing table')
    const columns = table.columns
    const columnObjects = [...columns]
    const views = table.views
    const sourceRows = view.rows
    let sourceEvents = 0
    view.events.on('rowsChanged', () => { sourceEvents++ })
    view.bindQueryExecutor({ executeQuery: async () => makeResult('Orders', [{ id: 1, price: 3, qty: 4 }]) })

    expect(await view.queryOptionRows({ fields: ['id', 'total'], context: { parent: 1 } })).toEqual([{ id: 1, total: 12 }])
    expect(view.rows).toBe(sourceRows)
    expect(view.queryContext).toEqual({})
    expect(sourceEvents).toBe(0)
    expect(table.columns).toBe(columns)
    table.columns.forEach((column, index) => expect(column).toBe(columnObjects[index]))
    expect(table.views).toBe(views)
    expect(ds.getView('Orders', 'default')).toBe(view)
  })

  it('retains a selected visible __proto__ output as an own scalar property', async () => {
    const ds = DataSet.fromJson({ dataSetName: 'OptionProto', scenarioId: 'SCENE', tables: {
      Orders: { tableName: 'Orders', modelBinding: { modelId: 'ORDER', modelName: 'Orders' },
        columns: [{ name: 'id', type: 'number', isPrimaryKey: true }, { name: '__proto__', type: 'string' }],
        views: { default: {} } },
    } })
    const view = ds.getView('Orders', 'default')
    if (!view) throw new Error('missing view')
    const row = Object.fromEntries([['id', 1], ['__proto__', 'CHOICE']])
    view.bindQueryExecutor({ executeQuery: async () => makeResult('Orders', [row]) })
    const options = await view.queryOptionRows({ fields: ['__proto__'] })
    expect(Object.hasOwn(options[0], '__proto__')).toBe(true)
    expect(options[0]?.['__proto__']).toBe('CHOICE')
    ds.destroy()
  })

  it('requests flat options from a nested source view without changing its configuration', async () => {
    const { view } = makeDataSet()
    const table = view.dataTable
    if (!table) throw new Error('missing table')
    const columns = table.columns
    const views = table.views
    view.treeConfig = { treeMode: 'nested', idField: 'id', parentIdField: 'parentId', textField: 'price' }
    const treeConfig = view.treeConfig
    const modes: unknown[] = []
    view.bindQueryExecutor({ executeQuery: async (_source, params) => {
      modes.push(params.treeMode)
      return makeResult('Orders', [{ id: 1, price: 3, qty: 4 }])
    } })
    expect(await view.queryOptionRows({ fields: ['id'] })).toEqual([{ id: 1 }])
    expect(modes).toEqual(['flat'])
    expect(view.treeMode).toBe('nested')
    expect(view.treeConfig).toBe(treeConfig)
    expect(table.columns).toBe(columns)
    expect(table.views).toBe(views)
  })

  it.each(['h', 'm'] as const)('rejects %s-protected option inputs and dependent calculations', async marker => {
    const { view } = makeDataSet()
    view.bindQueryExecutor({ executeQuery: async () => makeResult('Orders', [
      { id: 1, price: 3, qty: 4, lingma_sys_params: { [marker]: ['price'] } },
    ]) })
    await expect(view.queryOptionRows({ fields: ['price'] })).rejects.toThrow('DATA_VIEW_OPTIONS_FIELD')
    await expect(view.queryOptionRows({ fields: ['total'] })).rejects.toThrow('DATA_VIEW_OPTIONS_FIELD')
    expect(view.rows).toEqual([])
  })

  it('rejects incomplete, missing, undeclared and non-scalar option fields', async () => {
    const { view } = makeDataSet()
    let rows: FixtureRow[] = [{ id: 1, price: 3, qty: 4 }]
    let total = 2
    let requests = 0
    view.bindQueryExecutor({ executeQuery: async () => {
      requests++
      return { ...makeResult('Orders', rows), total }
    } })
    await expect(view.queryOptionRows({ fields: ['id'] })).rejects.toThrow('DATA_VIEW_OPTIONS_INCOMPLETE')
    total = 1
    await expect(view.queryOptionRows({ fields: ['secret'] })).rejects.toThrow('DATA_VIEW_OPTIONS_FIELD')
    await expect(view.queryOptionRows({ fields: ['unknown'] })).rejects.toThrow('DATA_VIEW_OPTIONS_FIELD')
    await expect(view.queryOptionRows({ fields: ['_pk'] })).rejects.toThrow('DATA_VIEW_OPTIONS_FIELDS')
    await expect(view.queryOptionRows({ fields: ['lingma_sys_key'] })).rejects.toThrow('DATA_VIEW_OPTIONS_FIELDS')
    expect(requests).toBe(2)
    rows = [{ id: 1, price: 3, qty: 4, secret: { nested: true } }]
    await expect(view.queryOptionRows({ fields: ['secret'] })).rejects.toThrow('DATA_VIEW_OPTIONS_VALUE')
    await expect(view.queryOptionRows({ fields: ['id', 'id'] })).rejects.toThrow('DATA_VIEW_OPTIONS_FIELDS')
    expect(view.rows).toEqual([])
  })

  it('rejects a nonprojected option field before dispatch', async () => {
    const { view } = makeDataSet('price + qty', true)
    let requests = 0
    view.bindQueryExecutor({ executeQuery: async () => {
      requests++
      return makeResult('Orders', [])
    } })
    await expect(view.queryOptionRows({ fields: ['qty'] })).rejects.toThrow('DATA_VIEW_OPTIONS_FIELD')
    expect(requests).toBe(0)
  })

  it('captures caller parameters and source computed context independently', async () => {
    const { view } = makeDataSet('price + ctx.increment')
    view.setComputedContext({ increment: 2 })
    const contexts: unknown[] = []
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    view.bindQueryExecutor({ executeQuery: async (_source, params) => {
      contexts.push(params.context)
      await gate
      return makeResult('Orders', [{ id: 1, price: 3, qty: 4 }])
    } })
    const fields = ['total']
    const context = { parent: { id: 1 } }
    const pending = view.queryOptionRows({ fields, context })
    fields[0] = 'price'
    context.parent.id = 9
    release?.()
    expect(await pending).toEqual([{ total: 5 }])
    expect(contexts).toEqual([{ parent: { id: 1 } }])
    expect(view.rows).toEqual([])
  })

  it('rejects late results after source requery while independent requests can complete out of order', async () => {
    const { view } = makeDataSet()
    const releases: Array<(value: ReturnType<typeof makeResult>) => void> = []
    view.bindQueryExecutor({ executeQuery: async () => new Promise(resolve => { releases.push(resolve) }) })
    const first = view.queryOptionRows({ fields: ['id'] })
    const second = view.queryOptionRows({ fields: ['id'] })
    releases[1]?.(makeResult('Orders', [{ id: 2, price: 1, qty: 1 }]))
    expect(await second).toEqual([{ id: 2 }])
    releases[0]?.(makeResult('Orders', [{ id: 1, price: 1, qty: 1 }]))
    expect(await first).toEqual([{ id: 1 }])

    const stale = view.queryOptionRows({ fields: ['id'] })
    const sourceQuery = view.loadFromServer()
    releases[3]?.(makeResult('Orders', [{ id: 4, price: 1, qty: 1 }]))
    await sourceQuery
    releases[2]?.(makeResult('Orders', [{ id: 3, price: 1, qty: 1 }]))
    await expect(stale).rejects.toThrow('DATA_VIEW_OPTIONS_STALE')
    expect(view.rows[0]?.['id']).toBe(4)
  })

  it('rejects a late option result after computed context changes', async () => {
    const { view } = makeDataSet('price + ctx.increment')
    const context = { increment: 2 }
    view.setComputedContext(context)
    let release: ((value: ReturnType<typeof makeResult>) => void) | undefined
    view.bindQueryExecutor({ executeQuery: async () => new Promise(resolve => { release = resolve }) })
    const pending = view.queryOptionRows({ fields: ['total'] })
    context.increment = 3
    release?.(makeResult('Orders', [{ id: 1, price: 3, qty: 4 }]))
    await expect(pending).rejects.toThrow('DATA_VIEW_OPTIONS_STALE')
  })

  it('releases its temporary view when the source is destroyed before a response', async () => {
    const { view } = makeDataSet()
    const destroyed: DataView[] = []
    const originalDestroy = DataView.prototype.destroy
    const spy = vi.spyOn(DataView.prototype, 'destroy').mockImplementation(function (this: DataView) {
      destroyed.push(this)
      originalDestroy.call(this)
    })
    try {
      let release: ((value: ReturnType<typeof makeResult>) => void) | undefined
      view.bindQueryExecutor({ executeQuery: async () => new Promise(resolve => { release = resolve }) })
      const pending = view.queryOptionRows({ fields: ['id'] })
      view.destroy()
      release?.(makeResult('Orders', [{ id: 1, price: 3, qty: 4 }]))
      await expect(pending).rejects.toThrow('DATA_VIEW_OPTIONS_STALE')
      expect(destroyed).toContain(view)
      expect(destroyed.filter(instance => instance !== view)).toHaveLength(1)
      expect(destroyed.find(instance => instance !== view)?.destroyed).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })

  it('rejects a late result after table metadata changes', async () => {
    const { view } = makeDataSet()
    const table = view.dataTable
    if (!table) throw new Error('missing table')
    let release: ((value: ReturnType<typeof makeResult>) => void) | undefined
    view.bindQueryExecutor({ executeQuery: async () => new Promise(resolve => { release = resolve }) })
    const pending = view.queryOptionRows({ fields: ['id'] })
    table.columns = table.columns.map(column => column.name === 'price' ? { ...column, type: 'string' } : column)
    release?.(makeResult('Orders', [{ id: 1, price: 3, qty: 4 }]))
    await expect(pending).rejects.toThrow('DATA_VIEW_OPTIONS_STALE')
  })

  it('rejects non-JSON computed context before dispatch', async () => {
    const { view } = makeDataSet('price')
    view.setComputedContext({ table: new Map([['key', 1]]) })
    let requests = 0
    view.bindQueryExecutor({ executeQuery: async () => {
      requests++
      return makeResult('Orders', [])
    } })
    await expect(view.queryOptionRows({ fields: ['total'] })).rejects.toThrow('DATA_VIEW_OPTIONS_CONTEXT')
    expect(requests).toBe(0)
  })

  it('keeps keyless option permission and rejects unbound views', async () => {
    const { view } = makeDataSet()
    view.primaryKey = ''
    await expect(view.queryOptionRows({ fields: ['id'] })).rejects.toThrow('DATA_VIEW_OPTIONS_UNBOUND')
    view.bindQueryExecutor({ executeQuery: async () => makeResult('Orders', [{ id: 1, price: 3, qty: 4 }], true) })
    expect(await view.queryOptionRows({ fields: ['total'] })).toEqual([{ total: 12 }])
  })

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
