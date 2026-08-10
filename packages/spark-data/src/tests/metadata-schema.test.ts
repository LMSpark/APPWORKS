/**
 * Metadata schema 测试 — v2 canonical 结构
 */
import { describe, it, expect } from 'vitest'
import { DataSet } from '../dataset'
import { DataTable } from '../data-table'
import type { DataViewFieldProjection, TableMetadata, ViewMetadata, DataSetMetadata } from '../types'

const salaryProjection: DataViewFieldProjection = {
  fieldId: 'MODEL-FIELD-1',
  source: 'resource',
  resourceFieldId: 'RESOURCE-FIELD-1',
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
}

// ============================================================
// Table/View metadata 对齐
// ============================================================
describe('TableMetadata canonical structure', () => {
  it('TableMetadata should contain table fields and views only', () => {
    const tableMeta: TableMetadata = {
      tableName: 'Users',
      columns: [{ name: 'id', type: 'number', label: 'ID' }],
      views: {
        default: {
          rows: [{ id: 1 }],
          page: 1,
          pageSize: 20,
        },
      },
    }
    const viewMeta: ViewMetadata = tableMeta.views.default
    expect(viewMeta.rows).toEqual([{ id: 1 }])
    expect(viewMeta.page).toBe(1)
    expect(tableMeta).not.toHaveProperty('rows')
  })

  it('DataTable.toJson() should return valid TableMetadata with default view under views', () => {
    const t = new DataTable('Products', [{ name: 'id', type: 'number', label: 'ID' }])
    const dv = t.getOrCreateView('default')
    dv.rows = [{ id: 1 }, { id: 2 }]

    const data = t.toJson()
    expect(data.tableName).toBe('Products')
    expect(data.columns).toHaveLength(1)
    expect(data.views.default.rows).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('DataTable semantic metadata should roundtrip through TableMetadata', () => {
    const data: TableMetadata = {
      tableName: 'OrderSummary',
      columns: [{ name: 'id', type: 'number', label: 'ID' }],
      resourceType: 'database-view',
      resourceId: 'vw_order_summary',
      businessCategory: 'reference',
      views: {
        default: {
          rows: [{ id: 1 }],
        },
      },
    }

    const table = DataTable.fromJson(data)
    expect(table.resourceType).toBe('database-view')
    expect(table.resourceId).toBe('vw_order_summary')
    expect(table.businessCategory).toBe('reference')

    const roundtrip = table.toJson()
    expect(roundtrip.resourceType).toBe('database-view')
    expect(roundtrip.resourceId).toBe('vw_order_summary')
    expect(roundtrip.businessCategory).toBe('reference')
  })

  it('DataView field projection and query context roundtrip and reject missing resource fields', () => {
    const table = DataTable.fromJson({
      tableName: 'RESOURCE-1',
      resourceId: 'RESOURCE-1',
      columns: [{ name: 'salary', type: 'decimal', label: '薪资' }],
      views: {
        default: {},
        'MODEL-1': {
          fieldProjection: [salaryProjection],
          queryContext: { dataSpaceId: 'SPACE-1', modelId: 'MODEL-1' },
        },
      },
    })

    expect(table.toJson().views['MODEL-1']).toMatchObject({
      fieldProjection: [{
        fieldId: 'MODEL-FIELD-1',
        resourceFieldId: 'RESOURCE-FIELD-1',
        viewField: 'salaryAmount',
      }],
      queryContext: { dataSpaceId: 'SPACE-1', modelId: 'MODEL-1' },
    })
    expect(() => DataTable.fromJson({
      tableName: 'RESOURCE-1',
      columns: [{ name: 'salary', type: 'decimal' }],
      views: {
        default: {},
        'MODEL-1': {
          fieldProjection: [{ ...salaryProjection, resourceField: 'missing' }],
        },
      },
    })).toThrow('引用了不存在的资源字段')
  })

  it('DataTable.fromJson() should read default view from views.default', () => {
    const data: TableMetadata = {
      tableName: 'Orders',
      columns: [{ name: 'oid', type: 'string', label: 'OID' }],
      views: {
        default: {
          rows: [{ oid: 'A' }],
          autoCurrentFirst: true,
          page: 2,
          pageSize: 10,
        },
      },
    }
    const table = DataTable.fromJson(data)
    const dv = table.getOrCreateView('default')
    expect(dv.rows).toEqual([{ oid: 'A' }])
    expect(dv.page).toBe(2)
    expect(dv.pageSize).toBe(10)
    expect(dv.autoCurrentFirst).toBe(true)
  })

  it('DataTable.fromJson() should keep named views independent from default view', () => {
    const data: TableMetadata = {
      tableName: 'T',
      columns: [],
      views: {
        default: { rows: [{ x: 1 }], page: 5, pageSize: 50, autoCurrentFirst: false },
        grid: { rows: [{ x: 2 }], page: 2, pageSize: 10 },
      },
    }
    const table = DataTable.fromJson(data)
    const defaultView = table.getOrCreateView('default')
    const gridView = table.getOrCreateView('grid')
    expect(defaultView.rows).toEqual([{ x: 1 }])
    expect(defaultView.page).toBe(5)
    expect(gridView.rows).toEqual([{ x: 2 }])
    expect(gridView.page).toBe(2)
  })

  it('DataSet.fromJson() should accept direct root canonical dataset documents', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'RootDS',
      tables: {
        Users: {
          columns: [{ name: 'id', type: 'number', label: 'ID' }],
          views: {
            default: {
              rows: [{ id: 1 }],
            },
          },
        },
      },
    })

    expect(ds.dataSetName).toBe('RootDS')
    expect(ds.getTable('Users')?.getView('default')?.rows).toEqual([{ id: 1, _pk: 1 }])
    expect(ds.toJson().tables['Users']?.views.default.rows).toEqual([{ id: 1 }])
  })

  it('DataSet.fromJson()/toJson() should preserve dataset layout metadata', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'LayoutDS',
      tables: {
        Users: {
          columns: [{ name: 'id', type: 'number', label: 'ID' }],
          views: {
            default: { rows: [{ id: 1 }] },
          },
        },
      },
      layout: {
        tablePositions: {
          Users: { x: 120, y: 240 },
        },
      },
    })

    const json = ds.toJson()
    expect(json.layout?.tablePositions?.['Users']).toEqual({ x: 120, y: 240 })

    const ds2 = DataSet.fromJson(json)
    expect(ds2.toJson().layout?.tablePositions?.['Users']).toEqual({ x: 120, y: 240 })
  })

  it('DataSet.fromJson() should reject legacy dataset wrapper shape', () => {
    expect(() => DataSet.fromJson({
      dataset: {
        dataSetName: 'LegacyDS',
        tables: {
          Users: {
            columns: [{ name: 'id', type: 'number', label: 'ID' }],
            views: { default: { rows: [{ id: 1 }] } },
          },
        },
      },
    })).toThrow('不再支持 dataset 包裹结构')
  })
})

// ============================================================
// L4: schemaVersion
// ============================================================
describe('L4: schemaVersion in DataSetMetadata', () => {
  it('DataSet should default schemaVersion to 2', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'Test',
      tables: { T: { tableName: 'T', columns: [], views: { default: { rows: [] } } } },
    })
    expect(ds.schemaVersion).toBe(2)
  })

  it('DataSet constructor should accept explicit schemaVersion', () => {
    const ds = new DataSet({
      dataSetName: 'Versioned',
      tables: {
        T: {
          tableName: 'T',
          columns: [],
          views: { default: {} },
        },
      },
      schemaVersion: 2,
    })
    expect(ds.schemaVersion).toBe(2)
  })

  it('toJson() should include schemaVersion', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'S',
      tables: {},
    })
    const data = ds.toJson()
    expect(data.schemaVersion).toBe(2)
  })

  it('fromJson() roundtrip should preserve schemaVersion', () => {
    const ds1 = new DataSet({
      dataSetName: 'RT',
      tables: { T: { tableName: 'T', columns: [], views: { default: {} } } },
      schemaVersion: 3,
      version: 42,
    })
    const json = JSON.stringify(ds1.toJson())
    const ds2 = DataSet.fromJson(json)
    expect(ds2.schemaVersion).toBe(3)
    expect(ds2.version).toBe(42)
  })

  it('fromJson() should default schemaVersion to 2 when missing', () => {
    const raw = {
      dataSetName: 'Old',
      tables: {},
      // version/pageId 未指定 — schemaVersion 默认按 canonical v2 处理
    } satisfies Partial<DataSetMetadata>
    const ds = DataSet.fromJson(raw)
    expect(ds.schemaVersion).toBe(2)
  })

  it('schemaVersion should be distinct from business version', () => {
    const ds = new DataSet({
      dataSetName: 'Dual',
      tables: {},
      schemaVersion: 2,
      version: 99,
    })
    expect(ds.schemaVersion).toBe(2)  // schema 格式版本
    expect(ds.version).toBe(99)        // 业务乐观锁版本
    const data = ds.toJson()
    expect(data.schemaVersion).toBe(2)
    expect(data.version).toBe(99)
  })
})
