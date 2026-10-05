import { describe, expect, it } from 'vitest'

import { DataSet } from '../../dataset'
import { DataTable } from '../../data-table'

const COLUMNS = [{ name: 'id', type: 'string' as const, label: 'id' }]

function tableJson(modelBinding?: unknown) {
  return {
    tableName: 'Orders',
    columns: COLUMNS,
    ...(modelBinding === undefined ? {} : { modelBinding }),
    views: { default: { tableName: 'Orders', viewId: 'default', page: 1, pageSize: 10, rows: [] } },
  }
}

describe('DataSet 场景身份与 DataTable 模型绑定', () => {
  it('scenarioId 与 modelBinding 往返保持，且不改变页面内 tableName', () => {
    const dataSet = DataSet.fromJson({
      dataSetName: 'd',
      scenarioId: 'FORM-1',
      tables: { Orders: tableJson({ modelId: 'MODEL-1', modelName: '订单' }) },
    })

    expect(dataSet.scenarioId).toBe('FORM-1')
    expect(dataSet.getTable('Orders')?.modelBinding).toEqual({ modelId: 'MODEL-1', modelName: '订单' })

    const reloaded = DataSet.fromJson(JSON.parse(JSON.stringify(dataSet.toJson())))
    expect(reloaded.scenarioId).toBe('FORM-1')
    expect(reloaded.getTable('Orders')?.modelBinding).toEqual({ modelId: 'MODEL-1', modelName: '订单' })
    expect(Object.keys(reloaded.toJson().tables)).toEqual(['Orders'])
  })

  it('未声明身份的本地 DataSet 不出现这两个字段', () => {
    const json = DataSet.fromJson({ dataSetName: 'd', tables: { Orders: tableJson() } }).toJson()

    expect(json).not.toHaveProperty('scenarioId')
    expect(json.tables['Orders']).not.toHaveProperty('modelBinding')
  })

  it('modelBinding 的 modelId 与 modelName 必须同时有效', () => {
    expect(() => DataTable.fromJson(tableJson({ modelId: 'MODEL-1' }))).toThrow(/modelBinding/)
    expect(() => DataTable.fromJson(tableJson({ modelId: ' ', modelName: '订单' }))).toThrow(/modelBinding/)
    expect(() => DataTable.fromJson(tableJson({ modelId: 'MODEL-1', modelName: '' }))).toThrow(/modelBinding/)
  })

  it('scenarioId 存在时必须是非空字符串', () => {
    expect(() => DataSet.fromJson({ dataSetName: 'd', scenarioId: ' ', tables: {} })).toThrow(/scenarioId/)
    expect(() => DataSet.fromJson({ dataSetName: 'd', scenarioId: 7, tables: {} })).toThrow(/scenarioId/)
  })

  it('replaceFromJson 会替换场景身份', () => {
    const dataSet = DataSet.fromJson({ dataSetName: 'd', scenarioId: 'FORM-1', tables: {} })

    dataSet.replaceFromJson({ dataSetName: 'd', tables: {} })

    expect(dataSet.scenarioId).toBeUndefined()
  })
})
