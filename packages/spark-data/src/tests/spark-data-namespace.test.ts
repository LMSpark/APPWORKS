/**
 * SparkData 命名空间 API 测试
 */

import { describe, it, expect } from 'vitest'
import { SparkData } from '@spark-appworks/spark-data'
import type { DataSetMetadata, TableMetadata, TreeConfig, ViewMetadata } from '@spark-appworks/spark-data'

describe('SparkData Namespace', () => {
  it('应该提供 createDataSet 工厂方法', () => {
    const dataSet = SparkData.createDataSet({
      dataSetName: 'TestData',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' },
            { name: 'name', type: 'string' }
          ],
          views: {
            default: {
              rows: [
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Bob' }
              ]
            }
          }
        }
      }
    })

    expect(dataSet).toBeDefined()
    expect(dataSet.dataSetName).toBe('TestData')
    expect(dataSet.getTable('Users')).toBeDefined()
    expect(dataSet.getTable('Users')?.views['default']?.rows).toHaveLength(2)
  })

  it('应该提供 createTreeManager 工厂方法', () => {
    const config: TreeConfig = {
      idField: 'id',
      parentIdField: 'parentId'
    }

    const treeManager = SparkData.createTreeManager(config, [
      { id: 1, parentId: null, name: 'Root' },
      { id: 2, parentId: 1, name: 'Child 1' },
      { id: 3, parentId: 1, name: 'Child 2' }
    ])

    expect(treeManager).toBeDefined()
    expect(treeManager.getRoots()).toHaveLength(1)
    expect(treeManager.getChildren(1)).toHaveLength(2)
  })

  it('应该提供 createDataView 工厂方法', () => {
    const meta: ViewMetadata = { viewId: 'default' }
    const view = SparkData.createDataView('Users', meta)

    expect(view).toBeDefined()
    expect(view['tableName']).toBe('Users')
    expect(view['viewId']).toBe('default')
  })

  it('应该提供 createDataTable 工厂方法', () => {
    const meta: TableMetadata = {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number' },
        { name: 'name', type: 'string' }
      ],
      views: {
        default: {
          rows: [{ id: 1, name: 'Alice' }]
        }
      }
    }

    const table = SparkData.createDataTable(meta)

    expect(table.tableName).toBe('Users')
    expect(table.views['default']!.rows).toHaveLength(1)
  })

  it('应该提供 fromJson 工厂方法', () => {
    const json = JSON.stringify({
      dataSetName: 'TestData',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'id', type: 'number' }],
          views: { default: { rows: [{ id: 1 }] } }
        }
      }
    })

    const dataSet = SparkData.fromJson(json)

    expect(dataSet).toBeDefined()
    expect(dataSet.dataSetName).toBe('TestData')
  })

  it('命名空间 API 创建的实例应该是正确的类型', () => {
    const dataSet1 = SparkData.createDataSet({
      dataSetName: 'Test1',
      tables: {}
    })

    const dataSet2 = SparkData.createDataSet({
      dataSetName: 'Test2',
      tables: {}
    })

    // 同一工厂方法创建的实例是相同类型
    expect(dataSet1.constructor).toBe(dataSet2.constructor)
  })

  it('createDataSet 应只接受 canonical DataSetMetadata', () => {
    const meta: DataSetMetadata = {
      dataSetName: 'CanonicalOnlyDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'id', type: 'number' }],
          views: {
            default: {
              rows: [{ id: 1 }]
            }
          }
        }
      }
    }

    const dataSet = SparkData.createDataSet(meta)
    expect(dataSet.dataSetName).toBe('CanonicalOnlyDS')

    if (false) {
      // @ts-expect-error createDataSet 只接受 canonical metadata；JSON 字符串应走 fromJson
      SparkData.createDataSet('{"dataSetName":"Bad","tables":{}}')

      // createDataSet 只接受 canonical metadata；legacy/pagedata 结构（rows 在错误层级）应走 fromJson
      const invalidLegacyTable = {
        columns: [{ name: 'id', type: 'number' }],
        rows: [{ id: 1 }]
      }

      SparkData.createDataSet({
        dataSetName: 'LegacyShape',
        tables: {
          // @ts-expect-error legacy table is not canonical TableMetadata
          Users: invalidLegacyTable
        }
      })
    }
  })
})
