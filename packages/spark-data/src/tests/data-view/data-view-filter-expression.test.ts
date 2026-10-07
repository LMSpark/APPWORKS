import { describe, expect, it } from 'vitest'
import { DataView, SparkData } from '@spark-appworks/spark-data'

function staticView() {
  return SparkData.createDataSet({
    dataSetName: 'StaticFilterExpr',
    tables: {
      Orders: {
        tableName: 'Orders', resourceType: 'static-data',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'price', type: 'number' }, { name: 'qty', type: 'number' },
          { name: 'minTotal', type: 'number' },
          { name: 'total', type: 'number', computeExpression: 'price * qty' },
          { name: 'tag', type: 'string' },
        ],
        views: { default: { rows: [
          { id: 1, price: 10, qty: 2, minTotal: 25, tag: '' },
          { id: 2, price: 20, qty: 2, minTotal: 30, tag: null },
          { id: 3, price: 5, qty: 3, minTotal: 20, tag: '$[draft]' },
        ] } },
      },
    },
  }).getView('Orders')!
}

describe('DataView SPARK public filter', () => {
  it('filters computed fields with a current-row SPARK value function and restores source rows on clear', async () => {
    const view = staticView()
    await view.setFilter({ field: 'total', operator: 'gte', value: { Type: 'GetTableField', Field: 'minTotal' } })
    expect(view.rows.map(row => row['id'])).toEqual([2])
    expect(view.rows[0]?.['total']).toBe(40)
    await view.setFilter(undefined)
    expect(view.rows.map(row => row['id'])).toEqual([1, 2, 3])
    expect(view.rows.map(row => row['total'])).toEqual([20, 40, 15])
  })

  it('applies nested public groups and preserves separate null and empty operators', async () => {
    const view = staticView()
    await view.executeFilter({ logic: 'and', filters: [
      { field: 'total', operator: 'gte', value: 15 },
      { logic: 'or', filters: [{ field: 'tag', operator: 'is-empty' }, { field: 'tag', operator: 'is-null' }] },
    ] })
    expect(view.rows.map(row => row['id'])).toEqual([1, 2])
    await view.setFilter({ field: 'tag', operator: 'is-null' })
    expect(view.rows.map(row => row['id'])).toEqual([2])
  })

  it('owns an immutable snapshot across scripts, configuration and serialization', async () => {
    const view = staticView()
    const input = { field: 'total', operator: 'gte' as const, value: 30 }
    view.filterExpression = input
    input.value = 0
    expect(view.filterExpression).toEqual({ field: 'total', operator: 'gte', value: 30 })
    expect(Object.isFrozen(view.filterExpression)).toBe(true)
    expect(view.rows.map(row => row['id'])).toEqual([2])
    view.configure({ filterExpression: { field: 'total', operator: 'lt', value: 30 } })
    expect(view.rows.map(row => row['id'])).toEqual([1, 3])
    expect(view.toJson().filterExpression).toEqual(view.filterExpression)
  })

  it('rejects unknown current-row fields without replacing the applied result', async () => {
    const view = staticView()
    await view.setFilter({ field: 'total', operator: 'gte', value: 30 })
    await expect(view.setFilter({ field: 'total', operator: 'gte', value: { Type: 'GetTableField', Field: 'missing' } })).rejects.toThrow('不存在的字段')
    expect(view.rows.map(row => row['id'])).toEqual([2])
    expect(view.filterExpression).toEqual({ field: 'total', operator: 'gte', value: 30 })
  })

  it('rejects service functions before a local short-circuit can hide them', async () => {
    const view = staticView()
    await expect(view.setFilter({ logic: 'or', filters: [
      { logic: 'and', filters: [] },
      { field: 'tag', operator: 'eq', value: { Type: 'GetSysParam', Param: 'CURRENT_USER' } },
    ] })).rejects.toThrow('DATA_VIEW_FILTER_LOCAL_FUNCTION')
    expect(view.filterExpression).toBeUndefined()
    expect(view.rows).toHaveLength(3)
  })

  it('protects pending edits from direct script assignment and explicit clear', async () => {
    const view = staticView()
    view.updateEditingValue(1, 'price', 99)
    expect(() => { view.filterExpression = { field: 'total', operator: 'gte', value: 30 } }).toThrow()
    await expect(view.setFilter({ field: 'total', operator: 'gte', value: 30 })).rejects.toThrow()
    expect(view.filterExpression).toBeUndefined()
    expect(view.hasEditingChanges()).toBe(true)
  })

  it('preserves public string constants without interpreting former placeholders', async () => {
    const view = staticView()
    await view.setFilter({ field: 'tag', operator: 'eq', value: '$[draft]' })
    expect(view.rows.map(row => row['id'])).toEqual([3])
  })

  it.each([
    { field: 'id', op: '==', value: 1 },
    { type: 'and', children: [{ field: 'id', op: '==', value: 1 }] },
    { type: '!condition', field: 'id', op: '==', value: 1 },
    { field: 'id', operator: 'eq' },
    { logic: 'and', filters: [{ field: 'id', operator: 'eq', value: 1 }, { field: '', operator: 'eq', value: 2 }] },
  ])('rejects obsolete or incomplete configuration without accepting a partial tree: %j', filterExpression => {
    expect(() => DataView.fromJson({ filterExpression }, 'Orders', 'default')).toThrow()
  })
})
