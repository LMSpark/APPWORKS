import { describe, expect, it, vi } from 'vitest'
import { DataSet } from '../../dataset'

function createStructureDataSet(): DataSet {
  return DataSet.fromJson({
    dataSetName: 'StructureDS',
    tables: {
      Orders: {
        tableName: 'Orders',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'code', type: 'string' },
        ],
        views: {
          default: {
            rows: [{ id: 1, code: 'ORD-1' }],
            autoCurrentFirst: false,
            autoSelectFirst: false,
          },
        },
      },
      Items: {
        tableName: 'Items',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'orderId', type: 'number' },
          { name: 'orderCode', type: 'string' },
        ],
        views: { default: { rows: [] } },
      },
      Drafts: {
        tableName: 'Drafts',
        columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
        views: { default: { rows: [] } },
      },
    },
    resourceRelations: [
      {
        parentTable: 'Orders',
        childTable: 'Items',
        parentField: 'id',
        childField: 'orderId',
      },
    ],
    viewCascades: [
      {
        parentTable: 'Orders',
        parentViewId: 'default',
        childTable: 'Items',
        childViewId: 'default',
        filterBindings: [{ sourceField: 'id', targetField: 'orderId' }],
        autoLoad: true,
      },
    ],
  })
}

describe('DataSet structure CRUD', () => {
  it('does not create a cascade collection when a missing identity cannot be updated or deleted', () => {
    const ds = DataSet.fromJson({dataSetName: 'Empty', tables: {}})
    try {
      expect(ds.viewCascades).toBeUndefined()
      expect(ds.getCascade({cascadeId: 'missing'})).toBeUndefined()
      expect(() => ds.getCascade({cascadeId: ''})).toThrow()
      expect(() => ds.updateCascade({cascadeId: 'missing'}, {})).toThrow(/not found/)
      expect(() => ds.removeCascade({cascadeId: 'missing'})).toThrow(/not found/)
      expect(() => ds.addCascade({parentTable: 'missing', parentViewId: 'default', childTable: 'other',
        childViewId: 'default', filterBindings: []})).toThrow()
      expect(ds.viewCascades).toBeUndefined()
    } finally { ds.destroy() }
  })

  it('keeps an absent resourceRelations collection absent when relation mutations fail', () => {
    const ds = DataSet.fromJson({dataSetName: 'EmptyRelations', tables: {
      Orders: {tableName: 'Orders', columns: [{name: 'id', type: 'number'}], views: {default: {}}},
      Items: {tableName: 'Items', columns: [{name: 'orderId', type: 'number'}], views: {default: {}}},
    }})
    expect(ds.resourceRelations).toBeUndefined()
    expect(() => ds.addResourceRelation({parentTable: 'Missing', childTable: 'Items', filterExpression: {field: 'orderId', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}})).toThrow()
    expect(ds.resourceRelations).toBeUndefined()
    expect(() => ds.updateResourceRelation({parentTable: 'Orders', childTable: 'Items'}, {relationName: 'absent'})).toThrow()
    expect(ds.resourceRelations).toBeUndefined()
    expect(() => ds.removeResourceRelation({parentTable: 'Orders', childTable: 'Items'})).toThrow()
    expect(ds.resourceRelations).toBeUndefined()
  })

  it('addTable should attach default view to existing onAnyViewChange subscriptions', () => {
    const ds = createStructureDataSet()
    const handler = vi.fn()

    ds.onAnyViewChange({ currentRowChanged: handler })
    ds.addTable('TempUsers', [
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'name', type: 'string' },
    ])

    const view = ds.getView('TempUsers', 'default')!
    view.appendRow({ id: 1, name: 'Alice' })
    view.setCurrentRow(view.rows[0]!)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]?.[0]).toBe('TempUsers')
  })

  it('removeTable should fail-fast when table is still referenced by a resource relation or DataView cascade', () => {
    const ds = createStructureDataSet()

    expect(() => ds.removeTable('Orders')).toThrow(/resourceRelations|viewCascades/)
    expect(() => ds.removeTable('Items')).toThrow(/resourceRelations|viewCascades/)
  })

  it('removeTable should delete unreferenced table', () => {
    const ds = createStructureDataSet()

    ds.removeTable('Drafts')

    expect(ds.getTable('Drafts')).toBeUndefined()
    expect(ds.getView('Drafts', 'default')).toBeUndefined()
  })

  it('updateResourceRelation should replace the canonical filter without rewriting DataView cascade', () => {
    const ds = createStructureDataSet()

    const updated = ds.updateResourceRelation(
      { parentTable: 'Orders', childTable: 'Items', parentField: 'id', childField: 'orderId' },
      { filterExpression: {logic: 'and', filters: [{field: 'orderCode', operator: 'eq', value: {Type: 'GetTableField', Field: 'code'}}]}, relationName: 'order-by-code' },
    )

    expect(updated.filterExpression).toEqual({logic: 'and', filters: [{field: 'orderCode', operator: 'eq', value: {Type: 'GetTableField', Field: 'code'}}]})
    expect(updated.relationName).toBe('order-by-code')

    expect(ds.getResourceChildRelations('Orders')[0]?.filterExpression).toEqual(updated.filterExpression)

    const parentRelations = ds.getParentCascades('Items', 'default')
    expect(parentRelations).toHaveLength(1)
    expect(parentRelations[0]?.filterBindings).toEqual([{ sourceField: 'id', targetField: 'orderId' }])
  })

  it('updateCascade should rebuild DataView cascade metadata', () => {
    const ds = createStructureDataSet()

    const updated = ds.updateCascade({
      parentTable: 'Orders',
      parentViewId: 'default',
      childTable: 'Items',
      childViewId: 'default',
    }, {
      filterBindings: [{targetField: 'orderId'}],
      autoLoad: false,
    })

    expect(updated).toMatchObject({filterBindings: [{targetField: 'orderId'}], autoLoad: false})

    const parentRelations = ds.getParentCascades('Items', 'default')
    expect(parentRelations).toHaveLength(1)
    expect(parentRelations[0]?.filterBindings).toEqual([{targetField: 'orderId'}])
    expect(parentRelations[0]?.autoLoad).toBe(false)
    expect(parentRelations[0]).not.toHaveProperty('filterExpression')
  })
})
