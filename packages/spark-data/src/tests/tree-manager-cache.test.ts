/**
 * TreeManager 本地缓存测试
 */

import { describe, it, expect } from 'vitest'
import { SparkData, DataTreeField } from '@spark-appworks/spark-data'

describe('TreeManager 缓存操作', () => {
  it.each(['native','text'] as const)('builds %s JSON member parent links and numeric sibling order without replacing version primary keys', async format => {
    const treeConfig = {idField: 'nodeId', parentIdField: {field: 'payload', path: ['parentId'], format},
      orderField: {field: 'payload', path: ['index'], format}, textField: 'label', rootParentValue: 'PROJECT'}
    const rows = [
      {id: 'VB', nodeId: 'B', label: 'Second', payload: {parentId: 'PROJECT', index: 10}},
      {id: 'VA', nodeId: 'A', label: 'First', payload: {parentId: 'PROJECT', index: 2}},
      {id: 'VC', nodeId: 'C', label: 'Child', payload: {parentId: 'A', index: 0}},
    ]
    const input=rows.map(row=>({...row,payload:format==='native'?row.payload:JSON.stringify(row.payload)}))
    const ds = SparkData.createDataSet({scenarioId: 'MEMBER-TREE', dataSetName: 'Member tree', tables: {Nodes: {tableName: 'Nodes', resourceType: 'static-data', resourceId: 'member-tree',
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'nodeId', type: 'string'}, {name: 'label', type: 'string'}, {name: 'payload', type: 'json'}],
      views: {default: {autoLoad: false, treeConfig, rows:input}}}}})
    try {
      const view = ds.getView('Nodes')!
      await view.refresh()
      const nested = view.treeManager!.buildNestedTree()
      expect(nested.map(row => row.id)).toEqual(['A', 'B'])
      expect(nested[0]?.children.map(row => row.id)).toEqual(['C'])
      expect(view.rows.map(row => view.getPkKey(row))).toEqual(['VB', 'VA', 'VC'])
      expect(view.rows.map(row => row['payload'])).toEqual(input.map(row => row.payload))
      const reopened = SparkData.fromJson(ds.toJson())
      try {
        const restored = reopened.getView('Nodes')!
        await restored.refresh()
        expect(restored.treeManager?.buildNestedTree().map(row => row.id)).toEqual(['A', 'B'])
      }
      finally {reopened.destroy()}
      view.setTreeConfig({...treeConfig,rootParentValue:'A'})
      expect(view.treeManager?.buildNestedTree().map(row=>row.id)).toEqual(['C'])
      const before=view.treeConfig,manager=view.treeManager
      expect(()=>view.setTreeConfig({...treeConfig,orderField:'label'})).toThrow('TREE_ORDER_FIELD')
      expect(view.treeConfig).toBe(before);expect(view.treeManager).toBe(manager)
      expect(()=>view.configure({treeConfig:{...treeConfig,orderField:'label'}})).toThrow('TREE_ORDER_FIELD')
      expect(view.treeConfig).toBe(before);expect(view.treeManager).toBe(manager)
      const previousConfig=view.treeConfig,previousManager=view.treeManager
      expect(()=>view.setTreeConfig({...treeConfig,orderField:'label'})).toThrow('TREE_ORDER_FIELD')
      expect(view.treeConfig).toBe(previousConfig);expect(view.treeManager).toBe(previousManager)
      expect(()=>view.configure({treeConfig:{...treeConfig,orderField:'label'}})).toThrow('TREE_ORDER_FIELD')
      expect(view.treeConfig).toBe(previousConfig);expect(view.treeManager).toBe(previousManager)
    } finally {ds.destroy()}
  })
  it('captures an order field before canonical id replacement and keeps ties stable',()=>{
    const config={idField:'nodeId',parentIdField:'parentId',orderField:'id'}
    const rows=[{id:10,nodeId:'A',parentId:null},{id:2,nodeId:'B',parentId:null},{id:2,nodeId:'C',parentId:null}]
    const seeds=rows.map(row=>DataTreeField.project(row,config)!)
    expect(SparkData.createTreeManager(config,seeds).buildNestedTree().map(row=>row.id)).toEqual(['B','C','A'])
    expect(rows.map(row=>row.id)).toEqual([10,2,2])
    expect(DataTreeField.read({'payload.parentId':'literal',payload:{parentId:'member'}},'payload.parentId')).toBe('literal')
  })
  it.each(['10',null,undefined,NaN,Infinity])('rejects nonnumeric or nonfinite explicit sibling order %s',order=>{
    expect(()=>DataTreeField.project({id:'A',payload:{index:order}},{orderField:{field:'payload',path:['index'],format:'native'}})).toThrow('TREE_ORDER_FIELD')
  })
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
