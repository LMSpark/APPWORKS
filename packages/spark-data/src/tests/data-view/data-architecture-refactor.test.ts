/**
 * 测试 DataTable 与 DataView 的职责分离
 * DataTable: 纯结构定义 + 配置提供者
 * DataView: 数据拥有者 + CRUD 操作执行者
 */

import { describe, it, expect } from 'vitest'
import { DataSet } from '@spark-appworks/spark-data'
import { getMember } from '../test-type-helpers'

describe('Data Architecture Refactor', () => {
  it('固化 DataSpace/DataResource/FrontendModel 到 DataSet/DataTable/DataView 的三层身份', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'SPACE-1',
      tables: {
        'RESOURCE-1': {
          tableName: 'RESOURCE-1',
          resourceId: 'RESOURCE-1',
          resourceType: 'database-table',
          columns: [{ name: 'rowid', type: 'string', isPrimaryKey: true }],
          views: { default: {}, 'MODEL-1': {} },
        },
      },
    })

    expect(ds.dataSetName).toBe('SPACE-1')
    expect(ds.getTable('RESOURCE-1')?.resourceId).toBe('RESOURCE-1')
    expect(ds.getView('RESOURCE-1', 'MODEL-1')?.viewId).toBe('MODEL-1')
  })

  it('DataTable 只提供配置，DataView 拥有数据', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'TestDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'id', type: 'number' }, { name: 'name', type: 'string' }],
          views: { default: { rows: [{ id: 1, name: 'Alice' }] } },
          api: {
            list: { url: '/api/users', method: 'GET' },
            create: { url: '/api/users', method: 'POST' }
          }
        }
      }
    })

    const table = ds.getTable('Users')!
    const view = ds.getView('Users', 'default')!

    // DataTable 只有配置，没有 CRUD 方法
    expect(table.api).toBeDefined()
    expect(table.columns).toBeDefined()
    expect(getMember(table, 'loadFromServer')).toBeUndefined()
    expect(getMember(table, 'createRecord')).toBeUndefined()

    // DataView 拥有数据和 CRUD 方法
    expect(view.rows).toBeDefined()
    expect(view.rows.length).toBe(1)
    expect(typeof view.loadFromServer).toBe('function')
    expect(typeof view.crud.createRecord).toBe('function')
    expect(typeof view.crud.updateRecord).toBe('function')
    expect(typeof view.crud.deleteRecord).toBe('function')
  })

  it('DataTable 管理视图容器，不操作数据', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'TestDS',
      tables: {
        Products: {
          tableName: 'Products',
          columns: [{ name: 'id', type: 'number' }],
          views: { default: { rows: [] } }
        }
      }
    })

    const table = ds.getTable('Products')!

    // DataTable 可以创建和管理视图
    const view1 = table.getOrCreateView('grid1')
    const view2 = table.getOrCreateView('grid2')

    expect(view1.viewId).toBe('grid1')
    expect(view2.viewId).toBe('grid2')
    expect(table.views['grid1']).toBe(view1)
    expect(table.views['grid2']).toBe(view2)

    // DataTable.rows 是内联静态数据的 source of truth（用于无 API 内存级联过滤），
    // 不是 DataView.rows 的代理，两者是不同的数组引用。
    expect(Array.isArray(table.rows)).toBe(true)
    expect(table.rows).not.toBe(view1.rows)   // 不是同一引用
  })

  it('DataView 从 DataTable 获取配置', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'TestDS',
      tables: {
        Orders: {
          tableName: 'Orders',
          columns: [],
          views: { default: {} },
          api: { list: { url: '/api/orders', method: 'GET' } }
        }
      }
    })

    const table = ds.getTable('Orders')!
    table.setCrudConfig({ timeout: 5000, retryCount: 3 })
    const view = ds.getView('Orders', 'default')!

    // DataTable 提供配置
    expect(table.api?.list?.url).toBe('/api/orders')
    expect(table.crudConfig?.timeout).toBe(5000)

    // DataView 访问 DataTable 的配置（通过 getCrudConfig 内部实现）
    expect(view.dataTable!).toBeDefined()
    expect(view.dataTable!.tableName).toBe(table.tableName)
  })
})
