import { describe, expect, it } from 'vitest'

import { DataSet } from '../../dataset'
import { DataView } from '../../data-view'

const PERMISSION_WIRE_ROW = {
  id: '1',
  lingma_sys_key: 'ROW-KEY',
  lingma_sys_params: { r: [], e: ['id'], h: [], m: [], d: false },
}

function dataSetWithOneTable(resourceType: string | undefined) {
  return DataSet.fromJson({
    dataSetName: 'd',
    tables: {
      t: {
        tableName: 't',
        columns: [{ name: 'id', type: 'string', label: 'id' }],
        ...(resourceType === undefined ? {} : { resourceType }),
        views: {
          default: { tableName: 't', viewId: 'default', page: 1, pageSize: 10, rows: [PERMISSION_WIRE_ROW] },
        },
      },
    },
  })
}

describe('DataView 配置序列化往返', () => {
  it('显式 false 的自动选择配置在 toJson → fromJson 后保持 false', () => {
    const view = DataView.fromJson({ tableName: 't', viewId: 'default', page: 1, pageSize: 10, rows: [] }, 't', 'default')
    view.autoCurrentFirst = false
    view.autoSelectFirst = false

    const saved = view.toJson()
    const reloaded = DataView.fromJson(saved, 't', 'default')

    expect(saved.autoCurrentFirst).toBe(false)
    expect(saved.autoSelectFirst).toBe(false)
    expect(reloaded.autoCurrentFirst).toBe(false)
    expect(reloaded.autoSelectFirst).toBe(false)
  })

  it('远端资源表不序列化查询结果行', () => {
    const rows = dataSetWithOneTable('database-table').toJson().tables['t']?.views.default.rows

    expect(rows).toEqual([])
  })

  it('静态数据表保留行，但剔除行权限线协议字段', () => {
    const rows = dataSetWithOneTable('static-data').toJson().tables['t']?.views.default.rows

    expect(rows).toEqual([{ id: '1' }])
  })

  it('未声明资源类型且无 list 接口的本地表同样剔除行权限线协议字段', () => {
    const rows = dataSetWithOneTable(undefined).toJson().tables['t']?.views.default.rows

    expect(rows).toEqual([{ id: '1' }])
  })

  it('带 list 接口的表按远端处理，不序列化行', () => {
    const dataSet = DataSet.fromJson({
      dataSetName: 'd',
      tables: {
        t: {
          tableName: 't',
          columns: [{ name: 'id', type: 'string', label: 'id' }],
          api: { list: { url: '/api/list', method: 'GET' } },
          views: { default: { tableName: 't', viewId: 'default', page: 1, pageSize: 10, rows: [PERMISSION_WIRE_ROW] } },
        },
      },
    })

    expect(dataSet.toJson().tables['t']?.views.default.rows).toEqual([])
  })
})
