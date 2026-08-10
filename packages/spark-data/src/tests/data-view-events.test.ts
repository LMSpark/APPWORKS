/**
 * DataView 事件流测试
 *
 * 覆盖：
 * - currentRowChanged / selectedRowsChanged / cleared 独立事件
 * - events.on / events.off 订阅语义
 * - 通过 DataView.selection 驱动 UI 状态变化
 */

import { describe, it, expect, vi } from 'vitest'
import { RequestState, SparkData } from '@spark-appworks/spark-data'
import { setMember } from './test-type-helpers'

function createTestDataSet() {
  return SparkData.createDataSet({
    dataSetName: 'TestDS',
    tables: {
      Departments: {
        tableName: 'Departments',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'name', type: 'string' }
        ],
        views: {
          default: {
            rows: [
              { id: 1, name: 'Engineering' },
              { id: 2, name: 'Marketing' }
            ],
            autoCurrentFirst: false,
            autoSelectFirst: false
          }
        }
      },
      Users: {
        tableName: 'Users',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'deptId', type: 'number' },
          { name: 'name', type: 'string' }
        ],
        views: {
          default: {
            rows: [
              { id: 101, deptId: 1, name: 'Alice' },
              { id: 102, deptId: 1, name: 'Bob' }
            ]
          }
        }
      }
    },
    resourceRelations: [
      {
        parentTable: 'Departments',
        childTable: 'Users',
        childField: 'deptId',
      }
    ],
    viewCascades: [
      {
        parentTable: 'Departments',
        parentViewId: 'default',
        childTable: 'Users',
        childViewId: 'default',
        filterBindings: [{ sourceField: 'id', targetField: 'deptId' }],
        dependencyType: 'currentRow',
        autoLoad: false,
      }
    ]
  })
}

describe('DataView 独立事件监听（currentRowChanged / selectedRowsChanged / cleared）', () => {
  it('setCurrentRow 触发 currentRowChanged 事件', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('currentRowChanged', handler)
    deptView.selection.setCurrentRow(deptView.rows[0]!)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(deptView.rows[0], undefined)
  })

  it('setCurrentRow(null) 触发 currentRowChanged 事件', () => {
    const ds = createTestDataSet()
    const deptView = ds.getView('Departments')!
    deptView.selection.setCurrentRow(deptView.rows[0]!)

    const handler = vi.fn()
    deptView.events.on('currentRowChanged', handler)
    deptView.selection.setCurrentRow(null)

    expect(handler).toHaveBeenCalled()
    expect(handler).toHaveBeenCalledWith(null, undefined)
  })

  it('setSelectedRows 触发 selectedRowsChanged 事件', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('selectedRowsChanged', handler)
    deptView.selection.setSelectedRows([deptView.rows[0]!, deptView.rows[1]!])

    expect(handler).toHaveBeenCalled()
    expect(handler).toHaveBeenCalledWith(
      [deptView.rows[0]!, deptView.rows[1]!],
      undefined
    )
  })

  it('clearAll 触发 cleared 事件', () => {
    const ds = createTestDataSet()
    const deptView = ds.getView('Departments')!
    deptView.selection.setCurrentRow(deptView.rows[0]!)

    const handler = vi.fn()
    deptView.events.on('cleared', handler)
    deptView.clearAll()

    expect(handler).toHaveBeenCalled()
  })

  it('setCurrentRow 同一行重复设置不触发事件（去重）', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('currentRowChanged', handler)

    const row = deptView.rows[0]!
    deptView.selection.setCurrentRow(row)
    const countAfterFirst = handler.mock.calls.length
    deptView.selection.setCurrentRow(row)

    expect(handler).toHaveBeenCalledTimes(countAfterFirst)
  })

  it('setSelectedRows 同样内容重复设置不触发事件（去重）', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('selectedRowsChanged', handler)

    const rows = [deptView.rows[0]!, deptView.rows[1]!]
    deptView.selection.setSelectedRows(rows)
    const countAfterFirst = handler.mock.calls.length
    deptView.selection.setSelectedRows(rows)

    expect(handler.mock.calls.length).toBe(countAfterFirst)
  })

  it('每次视图状态变化都触发对应的独立事件', () => {
    const ds = createTestDataSet()
    const currentRowHandler = vi.fn()
    const selectedRowsHandler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('currentRowChanged', currentRowHandler)
    deptView.events.on('selectedRowsChanged', selectedRowsHandler)

    deptView.selection.setCurrentRow(deptView.rows[0]!)
    deptView.selection.setSelectedRows([deptView.rows[1]!])

    expect(currentRowHandler).toHaveBeenCalledTimes(1)
    expect(selectedRowsHandler).toHaveBeenCalledTimes(1)
  })

  it('events.off 取消监听', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('currentRowChanged', handler)

    deptView.selection.setCurrentRow(deptView.rows[0]!)
    const countBeforeOff = handler.mock.calls.length
    expect(countBeforeOff).toBeGreaterThan(0)

    deptView.events.off('currentRowChanged', handler)
    deptView.selection.setCurrentRow(deptView.rows[1]!)
    expect(handler).toHaveBeenCalledTimes(countBeforeOff)
  })
})

describe('DataView 独立事件 events.on / events.off（事件订阅）', () => {
  it('events.off 取消监听', () => {
    const ds = createTestDataSet()
    const cb = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('currentRowChanged', cb)
    deptView.selection.setCurrentRow(deptView.rows[0]!)
    const countBeforeOff = cb.mock.calls.length
    expect(countBeforeOff).toBeGreaterThan(0)

    deptView.events.off('currentRowChanged', cb)
    deptView.selection.setCurrentRow(deptView.rows[1]!)
    expect(cb).toHaveBeenCalledTimes(countBeforeOff)
  })

  it('setCurrentRow 自动触发 currentRowChanged，不自动同步 selectedRows', () => {
    const ds = createTestDataSet()
    const currentRowCb = vi.fn()
    const selectedRowsCb = vi.fn()
    const deptView = ds.getView('Departments')!
    deptView.events.on('currentRowChanged', currentRowCb)
    deptView.events.on('selectedRowsChanged', selectedRowsCb)

    deptView.selection.setCurrentRow(deptView.rows[0]!)

    expect(currentRowCb).toHaveBeenCalledTimes(1)
    expect(selectedRowsCb).toHaveBeenCalledTimes(0)
  })
})

describe('DataView 事件流端到端', () => {
  it('setCurrentRow 触发完整能力流：级联监听器与状态事件都收到通知', () => {
    const ds = createTestDataSet()
    const events: string[] = []

    const deptView = ds.getView('Departments')!
    deptView.events.on('currentRowChanged', () => events.push('currentRowChanged'))
    deptView.events.on('selectedRowsChanged', () => events.push('selectedRowsChanged'))
    deptView.events.on('currentRowChanged', () => events.push('listener2:Departments.default'))

    deptView.selection.setCurrentRow(deptView.rows[0]!)

    expect(events).toContain('listener2:Departments.default')
    expect(events).toContain('currentRowChanged')
  })

  it('retrieveRecord 触发 crud:before / crud:after 事件', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RetrieveEventDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'name', type: 'string' },
          ],
          api: { retrieve: { url: '/api/users/{id}', method: 'GET' } },
          views: { default: { rows: [] } },
        },
      },
    })
    const view = ds.getView('Users', 'default')!
    const table = view.dataTable!
    const before = vi.fn()
    const after = vi.fn()
    const mockCrud = {
      retrieve: vi.fn(async () => ({ success: true, data: { id: 7, name: 'Loaded' } })),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      batchCreate: vi.fn(),
      batchUpdate: vi.fn(),
      batchDelete: vi.fn(),
      importData: vi.fn(),
      exportData: vi.fn(),
      getHttpClient: vi.fn(),
    }

    setMember(table, '_crudService', mockCrud)
    setMember(view, '_crudDelegate', undefined)

    view.events.on('crud:before', before)
    view.events.on('crud:after', after)

    const result = await view.retrieveRecordById(7)

    expect(result.success).toBe(true)
    expect(before).toHaveBeenCalledTimes(1)
    expect(before.mock.calls[0]?.[0].operation).toBe('retrieve')
    expect(after).toHaveBeenCalledTimes(1)
    expect(after.mock.calls[0]?.[0].operation).toBe('retrieve')
  })
})

describe('DataView 领域事件覆盖运行时状态', () => {
  const waitRowsDebounce = () => new Promise(resolve => setTimeout(resolve, 25))

  it('updateFromServer 通过 rowsChanged 通知行数据更新', async () => {
    const ds = createTestDataSet()
    const deptView = ds.getView('Departments')!
    const rowsChanged = vi.fn()

    deptView.events.on('rowsChanged', rowsChanged)
    deptView.updateFromServer([{ id: 3, name: 'Sales' }])
    await waitRowsDebounce()

    expect(deptView.rows).toHaveLength(1)
    expect(deptView.rows[0]?.['name']).toBe('Sales')
    expect(rowsChanged).toHaveBeenCalledTimes(1)
  })

  it('DataSet.onAnyViewChange 转发 configChanged 和 editingChanged', () => {
    const ds = createTestDataSet()
    const configChanged = vi.fn()
    const editingChanged = vi.fn()
    const off = ds.onAnyViewChange({ configChanged, editingChanged })

    const deptView = ds.getView('Departments')!
    deptView.applyViewConfig({ page: 2 })
    deptView.updateEditingValue(1, 'name', 'Engineering Draft')

    expect(configChanged).toHaveBeenCalledWith('Departments', 'default')
    expect(editingChanged).toHaveBeenCalledWith('Departments', 'default')

    off()
  })

  it('requestData 通过 requestStateChanged 通知请求状态', async () => {
    const ds = createTestDataSet()
    const deptView = ds.getView('Departments')!
    const states: RequestState[] = []

    deptView.events.on('requestStateChanged', state => states.push(state))
    await deptView.requestData()

    expect(states).toContain(RequestState.Loaded)
    expect(deptView.requestState).toBe(RequestState.Loaded)
  })

  it('resetState 通过领域事件清空 rows 和 selection', async () => {
    const ds = createTestDataSet()
    const deptView = ds.getView('Departments')!
    const rowsChanged = vi.fn()
    const currentRowChanged = vi.fn()
    const selectedRowsChanged = vi.fn()

    deptView.setCurrentRow(deptView.rows[0]!)
    deptView.events.on('rowsChanged', rowsChanged)
    deptView.events.on('currentRowChanged', currentRowChanged)
    deptView.events.on('selectedRowsChanged', selectedRowsChanged)

    deptView.resetState()
    await waitRowsDebounce()

    expect(deptView.rows).toHaveLength(0)
    expect(deptView.currentRow).toBeNull()
    expect(rowsChanged).toHaveBeenCalledTimes(1)
    expect(currentRowChanged).toHaveBeenCalledWith(null)
    expect(selectedRowsChanged).toHaveBeenCalledWith([])
  })

  it('recomputeColumns 通过 rowsChanged 通知计算列更新', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'ComputedEventsDS',
      tables: {
        Orders: {
          tableName: 'Orders',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'price', type: 'number' },
            { name: 'qty', type: 'number' },
            { name: 'total', type: 'number', computeExpression: 'price * qty' },
          ],
          views: {
            default: {
              rows: [{ id: 1, price: 8, qty: 5 }],
            },
          },
        },
      },
    })
    const orders = ds.getView('Orders')!
    const rowsChanged = vi.fn()

    orders.events.on('rowsChanged', rowsChanged)
    orders.rows[0]!['price'] = 10
    orders.recomputeColumns()
    await waitRowsDebounce()

    expect(orders.rows[0]?.['total']).toBe(50)
    expect(rowsChanged).toHaveBeenCalledTimes(1)
  })

  it('setComputedContext 通过 rowsChanged 通知计算列更新', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'ComputedContextEventsDS',
      tables: {
        Orders: {
          tableName: 'Orders',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'amount', type: 'number' },
            { name: 'tax', type: 'number', computeExpression: 'amount * ctx.taxRate' },
          ],
          views: {
            default: {
              rows: [{ id: 1, amount: 100 }],
            },
          },
        },
      },
    })
    const orders = ds.getView('Orders')!
    const rowsChanged = vi.fn()

    orders.events.on('rowsChanged', rowsChanged)
    orders.setComputedContext({ taxRate: 0.2 })
    await waitRowsDebounce()

    expect(orders.rows[0]?.['tax']).toBe(20)
    expect(rowsChanged).toHaveBeenCalledTimes(1)
  })

  it('deleteRowById 清理当前行时随 rowsChanged 补发 selection 事件', async () => {
    const ds = createTestDataSet()
    const deptView = ds.getView('Departments')!
    const rowsChanged = vi.fn()
    const currentRowChanged = vi.fn()

    deptView.setCurrentRow(deptView.rows[0]!)
    deptView.events.on('rowsChanged', rowsChanged)
    deptView.events.on('currentRowChanged', currentRowChanged)

    deptView.deleteRowById(1)
    await waitRowsDebounce()

    expect(deptView.currentRow).toBeNull()
    expect(rowsChanged).toHaveBeenCalledTimes(1)
    expect(currentRowChanged).toHaveBeenCalledWith(null)
  })

  it('replaceRows 裁剪选中行时随 rowsChanged 补发 selectedRowsChanged', async () => {
    const ds = createTestDataSet()
    const deptView = ds.getView('Departments')!
    const selectedRowsChanged = vi.fn()

    deptView.setSelectedRows([deptView.rows[0]!, deptView.rows[1]!])
    deptView.events.on('selectedRowsChanged', selectedRowsChanged)

    deptView.replaceRows([{ id: 2, name: 'Marketing' }])
    await waitRowsDebounce()

    expect(deptView.selectedRows).toHaveLength(1)
    expect(deptView.selectedRows[0]?.['id']).toBe(2)
    const emittedRows = selectedRowsChanged.mock.calls.at(-1)?.[0]
    expect(emittedRows).toHaveLength(1)
    expect(emittedRows?.[0]?.['id']).toBe(2)
  })

  it('editingChanged 不携带整批 editingRows，editingRows 仅显式读取时生成', () => {
    const ds = createTestDataSet()
    const deptView = ds.getView('Departments')!
    const editingFieldChanged = vi.fn()
    const editingChanged = vi.fn()

    deptView.events.on('editingFieldChanged', editingFieldChanged)
    deptView.events.on('editingChanged', editingChanged)
    deptView.updateEditingValue(1, 'name', 'Engineering Draft')

    expect(editingFieldChanged).toHaveBeenCalledTimes(1)
    expect(editingChanged).toHaveBeenCalledTimes(1)
    expect(editingChanged.mock.calls[0]).toEqual([])
    expect(deptView.rows[0]?.['name']).toBe('Engineering')
    expect(deptView.editingRows).toMatchObject([{ id: 1, name: 'Engineering Draft' }])
  })

  it('clearAll 发出 cleared 并通过领域事件刷新行与选择', async () => {
    const ds = createTestDataSet()
    const deptView = ds.getView('Departments')!
    const cleared = vi.fn()
    const rowsChanged = vi.fn()
    const currentRowChanged = vi.fn()

    deptView.setCurrentRow(deptView.rows[0]!)
    deptView.events.on('cleared', cleared)
    deptView.events.on('rowsChanged', rowsChanged)
    deptView.events.on('currentRowChanged', currentRowChanged)

    deptView.clearAll()
    await waitRowsDebounce()

    expect(cleared).toHaveBeenCalledTimes(1)
    expect(rowsChanged).toHaveBeenCalledTimes(1)
    expect(currentRowChanged).toHaveBeenCalledWith(null)
  })
})
