/**
 * DataView 主键推导与覆盖行为测试
 */

import { describe, it, expect } from 'vitest'
import { SparkData } from '@spark-appworks/spark-data'
import { DataTable } from '../../data-table'

describe('DataView.primaryKey 从 DataTable 列定义自动推导', () => {
  it.each([false, true].flatMap(autoCurrentFirst => [false, true].map(autoSelectFirst => ({autoCurrentFirst, autoSelectFirst}))))(
    'applies independent first-row pointers to keyless queries without a value field ($autoCurrentFirst/$autoSelectFirst)', async config => {
    const ds = SparkData.createDataSet({scenarioId: 'SPACE', dataSetName: 'Keyless', tables: {Items: {
      tableName: 'Items', resourceType: 'database-table', modelBinding: {modelId: 'MODEL', modelName: 'Items'},
      columns: [{name: 'caption', type: 'string'}], views: {default: config},
    }}})
    const view = ds.getView('Items')!
    let empty = false
    view.bindQueryExecutor({executeQuery: async () => ({resultPrimaryKey: '',
      rows: empty ? [] : [{caption: 'same'}, {caption: 'same'}], total: empty ? 0 : 2,
      assertIdentity: () => undefined, rowKey: () => undefined,
      fieldAccess: () => ({read: 'visible' as const, write: 'allowed' as const, component: 'editable' as const, required: false, writeMode: 'editable' as const}),
      readFieldAccess: () => 'visible' as const,
      addActionState: () => 'hidden' as const, editActionState: () => 'hidden' as const,
      deleteActionState: () => 'hidden' as const, createChildActionState: () => 'hidden' as const,
      viewActionState: () => 'enabled' as const,
    })})
    try {
      await view.loadFromServer()
      expect(view.primaryKey).toBe('')
      expect(view.valueField).toBeUndefined()
      expect(view.currentRow).toBe(config.autoCurrentFirst ? view.rows[0] : null)
      expect(view.selectedRows.length).toBe(config.autoSelectFirst ? 1 : 0)
      if (config.autoSelectFirst) expect(view.selectedRows[0]).toBe(view.rows[0])
      const oldRow = view.rows[1]!
      view.setSelectedRows([oldRow]); view.setCurrentRow(oldRow)
      await view.refresh()
      expect(view.selectedRows).not.toContain(oldRow)
      expect(view.currentRow).toBe(config.autoCurrentFirst ? view.rows[0] : null)
      expect(view.selectedRows.length).toBe(config.autoSelectFirst ? 1 : 0)
      if (config.autoSelectFirst) expect(view.selectedRows[0]).toBe(view.rows[0])
      expect(view.getPkKey(view.rows[0]!)).toBeUndefined()
      expect(view.buildServerPk(view.rows[0]!)).toEqual({})
      expect(view.fieldAccess(view.rows[0]!, 'caption').write).toBe('denied')
      await expect(view.removeRow('invented')).rejects.toThrow('DATA_VIEW_KEYLESS_READONLY')
      empty = true; await view.refresh()
      expect(view.currentRow).toBeNull()
      expect(view.selectedRows).toEqual([])
    } finally {ds.destroy()}
  })

  it('uses query result identity without persisting it and restores ordinary identity after aggregate results', async () => {
    const ds = SparkData.createDataSet({scenarioId: 'SPACE', dataSetName: 'Results', tables: {Items: {
      tableName: 'Items', resourceType: 'database-table', modelBinding: {modelId: 'MODEL', modelName: 'Items'},
      columns: [{name: 'recordId', type: 'string', isPrimaryKey: true}, {name: 'amount', type: 'number'}],
      views: {default: {autoCurrentFirst: false, autoSelectFirst: false}},
    }}})
    const view = ds.getView('Items')!
    let aggregate = false, fail = false
    const definition = JSON.stringify(ds.toJson())
    view.bindQueryExecutor({executeQuery: async () => {
      if (fail) throw new Error('Expected query failure')
      return {resultPrimaryKey: aggregate ? '' : 'recordId',
        rows: [{recordId: 'A', amount: aggregate ? 50 : 10}], total: 1,
        assertIdentity: () => undefined, rowKey: (row: Readonly<Record<string, unknown>>) => aggregate ? undefined : row['recordId'],
        fieldAccess: () => ({read: 'visible' as const, write: 'allowed' as const, component: 'editable' as const, required: false, writeMode: 'editable' as const}),
        readFieldAccess: () => 'visible' as const,
        addActionState: () => 'hidden' as const, editActionState: () => 'hidden' as const,
        deleteActionState: () => 'hidden' as const, createChildActionState: () => 'hidden' as const,
        viewActionState: () => 'enabled' as const,
      }
    }})
    try {
      await view.loadFromServer()
      expect(view.getPkKey(view.rows[0]!)).toBe('A')
      aggregate = true
      await view.loadFromServer()
      expect(view.primaryKey).toBe('')
      expect(view.pk.primaryKeyOverride).toBeUndefined()
      expect(view.getPkKey(view.rows[0]!)).toBeUndefined()
      expect(view.rows[0]!['_pk']).toBeUndefined()
      expect(view.buildServerPk(view.rows[0]!)).toEqual({})
      view.setCurrentRow(view.rows[0]!)
      expect(view.currentRow).toBe(view.rows[0])
      expect(view.fieldAccess(view.rows[0]!, 'amount')).toMatchObject({read: 'visible', write: 'denied'})
      await expect(view.removeRow('A')).rejects.toThrow('DATA_VIEW_KEYLESS_READONLY')
      fail = true; aggregate = false
      await expect(view.loadFromServer()).rejects.toThrow('Expected query failure')
      expect(view.primaryKey).toBe('')
      expect(view.rows[0]?.['amount']).toBe(50)
      fail = false
      await view.loadFromServer()
      expect(view.primaryKey).toBe('recordId')
      expect(view.getPkKey(view.rows[0]!)).toBe('A')
      expect(view.fieldAccess(view.rows[0]!, 'amount').write).toBe('allowed')
      expect(JSON.stringify(ds.toJson())).toBe(definition)
    } finally {ds.destroy()}
  })

  it('单主键：列定义 isPrimaryKey=true 时 primaryKey 自动使用该列名', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'PKTest',
      tables: {
        Items: {
          tableName: 'Items',
          columns: [
            { name: 'itemId', type: 'number', isPrimaryKey: true },
            { name: 'title', type: 'string' },
          ],
          views: {
            default: {
              rows: [
                { itemId: 100, title: 'A' },
                { itemId: 200, title: 'B' },
              ],
            },
          },
        },
      },
    })
    const view = ds.getView('Items')!
    expect(view.primaryKey).toBe('itemId')
    expect(view.getPkKey(view.rows[0]!)).toBe(100)
    expect(view.getPkKey(view.rows[1]!)).toBe(200)
  })

  it('复合主键：多列 isPrimaryKey=true 时自动合成 _pk 计算列', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'CompositePK',
      tables: {
        OrderItems: {
          tableName: 'OrderItems',
          columns: [
            { name: 'orderId', type: 'number', isPrimaryKey: true },
            { name: 'productId', type: 'number', isPrimaryKey: true },
            { name: 'quantity', type: 'number' },
          ],
          views: {
            default: {
              rows: [
                { orderId: 1, productId: 10, quantity: 2 },
                { orderId: 1, productId: 20, quantity: 5 },
              ],
            },
          },
        },
      },
    })
    const view = ds.getView('OrderItems')!
    expect(view.primaryKey).toBe('_pk')
    expect(view.rows[0]?.['_pk']).toBe('1+10')
    expect(view.rows[1]?.['_pk']).toBe('1+20')
    expect(view.getPkKey(view.rows[0]!)).toBe('1+10')
    expect(view.getPkKey(view.rows[1]!)).toBe('1+20')
    expect(view.buildServerPk(view.rows[0]!)).toEqual({ orderId: 1, productId: 10 })
    expect(view.buildServerPk(view.rows[1]!)).toEqual({ orderId: 1, productId: 20 })
  })

  it('无 isPrimaryKey 标记时降级为默认 id', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'NoPK',
      tables: {
        Logs: {
          tableName: 'Logs',
          columns: [
            { name: 'message', type: 'string' },
            { name: 'level', type: 'string' },
          ],
          views: { default: { rows: [{ id: 1, message: 'hello', level: 'info' }] } },
        },
      },
    })
    const view = ds.getView('Logs')!
    expect(view.primaryKey).toBe('id')
  })

  it('显式覆盖 primaryKey 优先于列定义', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'OverridePK',
      tables: {
        Items: {
          tableName: 'Items',
          columns: [
            { name: 'itemId', type: 'number', isPrimaryKey: true },
            { name: 'uuid', type: 'string' },
          ],
          views: { default: { rows: [{ itemId: 1, uuid: 'abc-123' }] } },
        },
      },
    })
    const view = ds.getView('Items')!
    expect(view.primaryKey).toBe('itemId')

    view.primaryKey = 'uuid'
    expect(view.primaryKey).toBe('uuid')
    expect(view.getPkKey(view.rows[0]!)).toBe('abc-123')
  })

  it('动态创建视图也继承列定义的主键', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'DynView',
      tables: {
        Items: {
          tableName: 'Items',
          columns: [
            { name: 'code', type: 'string', isPrimaryKey: true },
            { name: 'name', type: 'string' },
          ],
          views: { default: { rows: [] } },
        },
      },
    })
    const gridView = ds.getTable('Items')!.getOrCreateView('grid')
    expect(gridView.primaryKey).toBe('code')
  })

  it('setCurrentRow 使用列定义推导的主键正确匹配', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'SelectPK',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'userId', type: 'number', isPrimaryKey: true },
            { name: 'name', type: 'string' },
          ],
          views: {
            default: {
              rows: [
                { userId: 10, name: 'Alice' },
                { userId: 20, name: 'Bob' },
              ],
              autoCurrentFirst: false,
              autoSelectFirst: false,
            },
          },
        },
      },
    })
    const view = ds.getView('Users')!
    expect(view.primaryKey).toBe('userId')
    expect(view.currentRow).toBeNull()

    view.selection.setCurrentRow(view.rows[1]!)
    expect(view._currentRowId).toBe(20)
    expect(view.currentRow).toEqual({ userId: 20, name: 'Bob', _pk: 20 })
  })
})

describe('DataView.primaryKey 边缘用例', () => {
  it('DataView.fromJson()（无 DataTable）primaryKey 回退为 id', () => {
    const v = SparkData.createDataView('Standalone', { viewId: 'default' })
    expect(v.primaryKey).toBe('id')
  })

  it('fromJson 命名视图正确继承列定义主键', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'FromTableDS',
      tables: {
        Orders: {
          tableName: 'Orders',
          columns: [
            { name: 'orderId', type: 'number', isPrimaryKey: true },
            { name: 'amount', type: 'number' },
          ],
          views: { default: { rows: [] } },
        },
      },
    })
    const table = ds.getTable('Orders')!
    const reportView = table.getOrCreateView('report')
    expect(reportView.primaryKey).toBe('orderId')
  })

  it('resetPrimaryKey() 清除覆盖后恢复列推导', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'ResetDS',
      tables: {
        Items: {
          tableName: 'Items',
          columns: [{ name: 'itemId', type: 'number', isPrimaryKey: true }],
          views: { default: { rows: [{ itemId: 100 }, { itemId: 200 }] } },
        },
      },
    })
    const view = ds.getView('Items')!

    expect(view.primaryKey).toBe('itemId')
    view.primaryKey = 'customField'
    expect(view.primaryKey).toBe('customField')
    view.resetPrimaryKey()
    expect(view.primaryKey).toBe('itemId')
  })

  it('无 isPrimaryKey 列时回退 id、显式覆盖优先于回退', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'NoPKDS',
      tables: {
        Logs: {
          tableName: 'Logs',
          columns: [
            { name: 'message', type: 'string' },
          ],
          views: { default: { rows: [{ id: 1, message: 'test' }] } },
        },
      },
    })
    const view = ds.getView('Logs')!

    expect(view.primaryKey).toBe('id')
    view.primaryKey = 'message'
    expect(view.primaryKey).toBe('message')
  })

  it('DataTable.fromJson 命名视图有正确 primaryKey', () => {
    const table = DataTable.fromJson({
      tableName: 'Products',
      columns: [{ name: 'sku', type: 'string', isPrimaryKey: true }],
      api: undefined,
      views: {
        default: { rows: [] },
        grid: { tableName: 'Products', viewId: 'grid', rows: [], page: 1, pageSize: 20 },
      },
    })
    const gridView = table.getView('grid')!
    expect(gridView.primaryKey).toBe('sku')
  })
})
