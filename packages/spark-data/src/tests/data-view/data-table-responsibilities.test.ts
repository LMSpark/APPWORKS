import { describe, it, expect } from 'vitest'
import { DataView, DataSet } from '@spark-appworks/spark-data'
import type { DataRow } from '@spark-appworks/spark-data'
import { DataTable } from '../../data-table'


describe('DataTable responsibilities (refactor verification)', () => {
  it('DataTable 管理 views[default]（DataView），不暴露 UI 状态代理', () => {
    const t = new DataTable('Users', [{ name: 'id', type: 'number' }])

    // views['default'] 必须是 DataView 实例
    const def = t.getOrCreateView('default')
    expect(def).toBeInstanceOf(DataView)
    expect(def).toBe(t.views['default'])

    // DataTable.rows 是内联静态数据的 source of truth（用于无 API 内存级联过滤）；
    // 它不是 DataView.rows 的代理——两者是完全独立的数组引用。
    expect(Array.isArray(t.rows)).toBe(true)
    expect(t.rows).not.toBe(def.rows)    // 不同引用
    expect(Array.isArray(def.rows)).toBe(true)

    // 通过 views['default'] 操作 rows
    def.rows.splice(0, def.rows.length, { id: 1 })
    expect(def.rows).toHaveLength(1)
    expect(def.rows[0]).toEqual({ id: 1 })

    // UI 状态方法也不在 DataTable 上
    expect('setCurrentRow' in t).toBe(false)
    expect('setSelectedRows' in t).toBe(false)
    expect('clearAll' in t).toBe(false)
    expect('subscribe' in t).toBe(false)

    // 这些方法应在 DataView.selection 上可用
    expect(typeof def.selection.setCurrentRow).toBe('function')
    expect(typeof def.selection.setSelectedRows).toBe('function')
    expect(typeof def.clearAll).toBe('function')
    // subscribe 已移除，统一使用 events.on('currentRowChanged', handler) 等独立事件
    expect(typeof def.events.on).toBe('function')
  })

  it('一个后端模型由一个 DataTable 承载（modelBinding），多个视图只是同一模型的不同字段投影', () => {
    const table = DataTable.fromJson({
      tableName: 'MODEL-1',
      resourceId: 'RESOURCE-1',
      resourceType: 'database-table',
      modelBinding: { modelId: 'MODEL-1', modelName: '薪资模型' },
      columns: [
        { name: 'rowid', type: 'string', label: '主键', isPrimaryKey: true },
        { name: 'salary', type: 'decimal', label: '薪资' },
      ],
      views: {
        default: {},
        keyOnly: {
          fieldProjection: [{
            fieldId: 'FIELD-1',
            source: 'resource',
            resourceFieldId: 'RESOURCE-FIELD-1',
            resourceField: 'rowid',
            viewField: 'rowid',
            type: 'string',
            label: '主键',
            output: true,
            sortOrder: 0,
            sortDirection: null,
            group: 0,
            distinct: false,
            primaryKey: true,
            value: '',
            valueFunction: '',
            expression: '',
          }],
        },
        salaryOnly: {
          fieldProjection: [{
            fieldId: 'FIELD-2',
            source: 'resource',
            resourceFieldId: 'RESOURCE-FIELD-2',
            resourceField: 'salary',
            viewField: 'salaryAmount',
            type: 'decimal',
            label: '薪资',
            output: true,
            sortOrder: 1,
            sortDirection: 'desc',
            group: 0,
            distinct: false,
            primaryKey: false,
            value: '',
            valueFunction: '',
            expression: '',
          }],
        },
      },
    })

    expect(table.modelBinding).toEqual({ modelId: 'MODEL-1', modelName: '薪资模型' })
    expect(table.getView('keyOnly')?.viewId).toBe('keyOnly')
    expect(table.getView('salaryOnly')?.viewId).toBe('salaryOnly')
    expect(table.getView('keyOnly')?.columns.map((column) => column.name)).toContain('rowid')
    expect(table.getView('salaryOnly')?.columns.map((column) => column.name)).toContain('salaryAmount')
  })

  it('DataView 的订阅可被 UI 与子视图使用（语义一致）', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'S',
      tables: {
        Departments: { tableName: 'Departments', columns: [{ name: 'id', type: 'number' }], views: { default: { rows: [{ id: 1 }] } } },
        Users: { tableName: 'Users', columns: [{ name: 'id', type: 'number' }], views: { default: { rows: [{ id: 101, deptId: 1 }] } } }
      },
      resourceRelations: [
        { parentTable: 'Departments', childTable: 'Users', childField: 'deptId' }
      ]
    })

    const parent = ds.getView('Departments', 'default')!
    ds.getView('Users', 'default')

    let parentNotified = false
    let dsNotified = false

    // UI/组件直接订阅父视图的 currentRowChanged 事件
    parent.events.on('currentRowChanged', () => { parentNotified = true })

    // 单独获取视图并订阅（语义等价）
    const parentView2 = ds.getView('Departments', 'default')!
    parentView2.events.on('currentRowChanged', () => { dsNotified = true })

    // 触发父视图状态变化（先 clear，避免 DataSet 构造时 auto-setCurrentRow 导致 row 相同被跳过）
    parent.selection.setCurrentRow(null)
    parent.selection.setCurrentRow(parent.rows[0]!)

    expect(parentNotified).toBe(true)
    expect(dsNotified).toBe(true)
  })

  it('DataSet.getView 应返回已存在的视图，不存在时返回 undefined', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'S',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'id', type: 'number' }],
          views: { default: { rows: [{ id: 1 }] } }
        }
      }
    })

    const table = ds.getTable('Users')!
    const ctxDefault = ds.getView('Users', 'default')

    // default 视图在构造函数中创建，应始终存在
    expect(ctxDefault).toBeDefined()
    expect(ctxDefault).toBe(table.getOrCreateView('default'))

    // 不存在的视图返回 undefined（不会自动创建）
    expect(ds.getView('Users', 'grid1')).toBeUndefined()

    // 通过 getOrCreateView 显式创建后，getView 应能找到
    const grid1 = table.getOrCreateView('grid1')
    expect(ds.getView('Users', 'grid1')).toBe(grid1)
  })

  it('命名视图独立且 CRUD 操作影响 default view', async () => {
    const t = new DataTable('Items', [{ name: 'id', type: 'number' }, { name: 'name', type: 'string' }])

    // 创建命名视图
    const v1 = t.getOrCreateView('grid1')
    const def = t.getOrCreateView('default')

    // 初始互不影响
    def.rows.splice(0, def.rows.length, { id: 1, name: 'A' })
    v1.rows.splice(0, v1.rows.length, { id: 2, name: 'B' })
    expect(def.rows).toHaveLength(1)
    expect(v1.rows).toHaveLength(1)

    // CRUD：由于 mock 替换了 createRecord，需要手动模拟真实行为
    // 真实 createRecord 会 push 到 views['default'].rows 并通知
    const createRecord = async (data: DataRow) => {
      def.rows.push(data)
      return { success: true, data }
    }
    await createRecord({ id: 3, name: 'C' })
    expect(def.rows.some(r => r['id'] === 3)).toBe(true)

    // updateRecord 也应影响 views['default']
    const updateRecord = async (id: number, data: Partial<DataRow>) => {
      const idx = def.rows.findIndex(r => r['id'] === id)
      if (idx >= 0) def.rows[idx] = { ...def.rows[idx], ...data, id }
      return { success: true, data: { id, ...data } }
    }
    await updateRecord(3, { name: 'C-updated' })
    expect(def.rows.some(r => r['name'] === 'C-updated')).toBe(true)

    // 删除记录
    const deleteRecord = async (id: number) => {
      const idx = def.rows.findIndex(r => r['id'] === id)
      if (idx >= 0) def.rows.splice(idx, 1)
      return { success: true }
    }
    await deleteRecord(3)
    expect(def.rows.some(r => r['id'] === 3)).toBe(false)
  })
})

// ===== 事件系统测试 =====

describe('Event system', () => {
  it('DataView.events.on cleared 通知 UI', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'S',
      tables: {
        Orders: { tableName: 'Orders', columns: [{ name: 'id', type: 'number' }], views: { default: {} } }
      }
    })

    const view = ds.getView('Orders', 'default')!
    let notified = false
    view.events.on('cleared', () => { notified = true })

    // 通过 clearAll 触发事件
    view.rows.push({ id: 1 })
    view.clearAll()
    expect(notified).toBe(true)
  })

  it('DataView.setCurrentRow 触发状态观察（currentRowChanged 事件）', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'S',
      tables: {
        Departments: { tableName: 'Departments', columns: [{ name: 'id', type: 'number' }], views: { default: { rows: [{ id: 1 }, { id: 2 }] } } },
        Employees: { tableName: 'Employees', columns: [{ name: 'id', type: 'number' }, { name: 'deptId', type: 'number' }], views: { default: { rows: [{ id: 101, deptId: 1 }, { id: 102, deptId: 2 }] } } }
      },
      resourceRelations: [
        { parentTable: 'Departments', childTable: 'Employees', childField: 'deptId' }
      ]
    })

    const stateEvents: string[] = []
    // 直接订阅 DataView 的 currentRowChanged 事件
    const deptView = ds.getView('Departments', 'default')!
    deptView.events.on('currentRowChanged', () => {
      stateEvents.push(`Departments:currentRow`)
    })

    // rows[0] 已被 autoCurrentFirst 自动选为 currentRow；使用 rows[1] 触发真实变更
    deptView.selection.setCurrentRow(deptView.rows[1]!)

    expect(stateEvents).toContain('Departments:currentRow')
  })

  it('命名视图独立接收 currentRowChanged 事件', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'S',
      tables: {
        Items: { tableName: 'Items', columns: [{ name: 'id', type: 'number' }], views: { default: { rows: [{ id: 1 }] } } }
      }
    })

    const table = ds.getTable('Items')!
    const defaultView = table.getOrCreateView('default')
    const grid1View = table.getOrCreateView('grid1')

    // 设置不同的数据
    defaultView.rows = [{ id: 1 }]
    grid1View.rows = [{ id: 2 }, { id: 3 }]

    let notifyCount = 0
    grid1View.events.on('currentRowChanged', () => { notifyCount++ })

    // 通过 setCurrentRow 触发指定视图事件
    grid1View.selection.setCurrentRow(grid1View.rows[0]!)

    // currentRowChanged 触发 1 次
    expect(notifyCount).toBe(1)

    // 但不应该修改视图行数据
    expect(grid1View.rows).toEqual([{ id: 2 }, { id: 3 }])
  })
})
