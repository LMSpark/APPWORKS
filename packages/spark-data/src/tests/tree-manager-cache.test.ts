/**
 * TreeManager 本地缓存测试
 */

import { describe, it, expect } from 'vitest'
import { SparkData } from '@spark-appworks/spark-data'

describe('TreeManager 缓存操作', () => {
  it('builds roots from a typed parent-value set and retains orphan rows outside the root set', () => {
    const config = {
      idField: 'id',
      parentIdField: 'parentId',
      rootParentValues: [null, '', 0, '0', '000000'],
    }
    const tree = SparkData.createTreeManager(config, [
      {id: 'null-root', parentId: null, name: 'Null root'},
      {id: 'undefined-root', name: 'Undefined root'},
      {id: 'empty-root', parentId: '', name: 'Empty root'},
      {id: 'number-root', parentId: 0, name: 'Number root'},
      {id: 'string-root', parentId: '0', name: 'String root'},
      {id: 'padded-root', parentId: '000000', name: 'Padded root'},
      {id: 'orphan', parentId: 'missing', name: 'Orphan'},
      {id: 'child', parentId: 'padded-root', name: 'Child'},
    ])

    expect(tree.getRoots().map(node => node.id)).toEqual([
      'null-root', 'undefined-root', 'empty-root', 'number-root', 'string-root', 'padded-root',
    ])
    const built = tree.buildNestedTree()
    expect(built.map(node => node.id)).toEqual([
      'null-root', 'undefined-root', 'empty-root', 'number-root', 'string-root', 'padded-root',
    ])
    expect(built.find(node => node.id === 'padded-root')?.children.map(node => node.id)).toEqual(['child'])
    expect(tree.getNode('orphan')?.parentId).toBe('missing')
  })

  it('preserves the typed root-parent set through DataSet serialization and rejects dual root settings', () => {
    const treeConfig = {
      idField: 'id',
      parentIdField: 'parentId',
      rootParentValues: [null, '', 0, '0', '000000'],
    }
    const dataSet = SparkData.createDataSet({scenarioId: 'ROOT-SET', dataSetName: 'Roots', tables: {Nodes: {
      tableName: 'Nodes',
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'parentId', type: 'string'}],
      views: {default: {treeConfig, rows: [{id: 'root', parentId: '000000'}]}},
    }}})
    const reopened = SparkData.fromJson(dataSet.toJson())
    const reopenedEncoded = reopened.toJson() as unknown as {tables: Record<string, {views: Record<string, {treeConfig?: Record<string, unknown>}>}>}
    expect(reopenedEncoded.tables['Nodes']?.views['default']?.treeConfig?.['rootParentValues']).toEqual([null, '', 0, '0', '000000'])

    const conflictingConfig = {
      idField: 'id',
      parentIdField: 'parentId',
      rootParentValue: 'root',
      rootParentValues: [null, 'root'],
    }
    expect(() => SparkData.createTreeManager(conflictingConfig)).toThrow(/rootParentValue.*rootParentValues/)
    expect(() => SparkData.createTreeManager({rootParentValues: [Number.POSITIVE_INFINITY]})).toThrow(/rootParentValues/)
    reopened.destroy()
    dataSet.destroy()
  })

  it('addNodesToCache 正确写入缓存', () => {
    const tree = SparkData.createTreeManager({
      idField: 'id',
      parentIdField: 'parentId'
    })

    tree.addNodesToCache([
      { id: 1, parentId: null, name: 'Root' }
    ])

    expect(tree.getNode(1)).toBeDefined()
    expect(tree.getNode(1)!['name']).toBe('Root')
  })

  it('clear 清空缓存', () => {
    const tree = SparkData.createTreeManager({
      idField: 'id',
      parentIdField: 'parentId'
    })

    tree.addNodesToCache([
      { id: 1, parentId: null, name: 'Root' }
    ])
    tree.clear()

    expect(tree.getNode(1)).toBeUndefined()
    expect(tree.getRoots()).toHaveLength(0)
  })
})
