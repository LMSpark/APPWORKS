import {describe,expect,it} from 'vitest'
import {DataSet} from '../../../dataset'
import {DataViewArrayQuery} from '../../../query/data-view-array-query'
import {DataViewFilter} from '../../../query/filter/data-view-filter'

function fixture(){
  const dataSet=DataSet.fromJson({scenarioId:'ARRAY',tables:{Items:{
    resourceType:'static-data',modelBinding:{modelId:'ITEMS',modelName:'Items'},
    columns:[
      {name:'id',type:'string',isPrimaryKey:true},
      {name:'label',type:'string'},
      {name:'rank',type:'number'},
      {name:'active',type:'boolean'},
    ],
    views:{default:{autoLoad:false}},
  }}})
  const view=dataSet.getView('Items')!
  let current=true
  const source=[
    {id:'a',label:'A',rank:1,active:true},
    {id:'b',label:'B',rank:4,active:true},
    {id:'c',label:'C',rank:3,active:false},
    {id:'d',label:'D',rank:2,active:true},
  ]
  const query=new DataViewArrayQuery(view,source,()=>{if(!current)throw new Error('array scope changed')})
  return {dataSet,view,query,source,invalidate:()=>{current=false}}
}

describe('DataViewArrayQuery readonly result',()=>{
  it('preserves local clone, filter, sort, pagination and readonly field access',async()=>{
    const {dataSet,view,query,source}=fixture()
    try{
      source[1]!['label']='mutated'
      source.push({id:'e',label:'E',rank:5,active:true})
      const result=await query.executeQuery(view,{
        filter:DataViewFilter.condition({field:'active',operator:'eq',value:true}).toJSON(),
        sort:'rank:desc',allPages:false,page:1,pageSize:2,fields:['id','label'],
      })
      expect(result.total).toBe(3)
      expect(result.rows).toEqual([{id:'b',label:'B'},{id:'d',label:'D'}])
      const row=result.rows[0]!
      const key=result.rowKey(row)
      expect(result.fieldAccess(key,'label')).toEqual({
        read:'visible',write:'denied',component:'readonly',required:false,writeMode:'readonly',
      })
      expect(result.fieldAccess(key,'rank')).toMatchObject({read:'invisible',component:'hidden'})
      expect(result.readFieldAccess(row,'label')).toBe('visible')
      expect(result.readFieldAccess({...row},'label')).toBe('invisible')
      expect(result.addActionState()).toBe('hidden')
      expect(result.editActionState(key)).toBe('hidden')
      expect(result.deleteActionState(key)).toBe('hidden')
      expect(result.createChildActionState(key)).toBe('hidden')
      expect(result.viewActionState(key)).toBe('enabled')
    }finally{dataSet.destroy()}
  })

  it('captures the exact scenario/model identity and guards every result consumption',async()=>{
    const {dataSet,view,query,invalidate}=fixture()
    try{
      const result=await query.executeQuery(view,{allPages:true,treeMode:'flat'})
      const row=result.rows[0]!,key=result.rowKey(row)
      expect(()=>result.assertIdentity({scenarioId:'ARRAY',metaName:'Items'})).not.toThrow()
      expect(()=>result.assertIdentity({scenarioId:'OTHER',metaName:'Items'})).toThrow('数组结果身份不匹配')
      expect(()=>result.assertIdentity({scenarioId:'ARRAY',metaName:'Other'})).toThrow('数组结果身份不匹配')
      invalidate()
      const consumption=[
        ()=>result.rowKey(row),
        ()=>result.assertIdentity({scenarioId:'ARRAY',metaName:'Items'}),
        ()=>result.fieldAccess(key,'label'),
        ()=>result.readFieldAccess(row,'label'),
        ()=>result.addActionState(),
        ()=>result.editActionState(key),
        ()=>result.deleteActionState(key),
        ()=>result.createChildActionState(key),
        ()=>result.viewActionState(key),
      ]
      for(const consume of consumption)expect(consume).toThrow('array scope changed')
      expect(()=>query.executeQuery(view,{allPages:true,treeMode:'flat'})).toThrow('array scope changed')
      expect(()=>query.queryColumns(view)).toThrow('array scope changed')
    }finally{dataSet.destroy()}
  })

  it('rejects an array result after its runtime is released',async()=>{
    const {dataSet,view,query}=fixture()
    const result=await query.executeQuery(view,{allPages:true,treeMode:'flat'})
    const row=result.rows[0]!
    dataSet.destroy()
    expect(()=>result.rowKey(row)).toThrow('数组查询身份已失效')
    expect(()=>result.fieldAccess('a','label')).toThrow('数组查询身份已失效')
  })
})
