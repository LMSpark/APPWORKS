import {describe,expect,it} from 'vitest'
import {LowcodeDataSpaceModelForkGraph} from '@/lowcode/data-space/model-source/model/lowcode-data-space-model-fork-graph'

const models=['P','M','C','U'].map(name=>({rowid:name,dataSetId:'S',Name:name,MetaName:`Physical${name}`,Filter:'',JoinFilter:''}))
const fields=models.map(model=>({rowid:`F${model.rowid}`,dataSetId:'S',dataModelId:model.rowid,Name:'id',type:'dataModel',FieldType:'varchar',ValueFun:''}))
const relation=(id:string,parent:string,child:string)=>({rowid:id,dataSetId:'S',parentModId:parent,childModId:child,parentTable:`Physical${parent}`,childTable:`Physical${child}`,filter:JSON.stringify({Type:'cond',Field:`Physical${child}.id`,Operator:'equal',ValueFun:{Type:'GetTableField',Field:`Physical${parent}.id`}}),depType:'join',cascadeDel:'1',custom:'keep'})
const relations=[relation('R1','P','M'),relation('R2','M','C')]
const bindings=['P','M','C'].map(from=>({from,to:`NEW_${from}`,name:`Copy_${from}`}))
describe('complete model relationship component fork definition',()=>{
 it('isolates incoming and outgoing relationship closure while excluding node conditions and unrelated models',()=>{
  const condition={...relation('N','N1','N2'),parentTable:'node1',childTable:'node2'}
  const result=LowcodeDataSpaceModelForkGraph.scope({dataSpaceId:'S',modelId:'M',models,relations:[...relations,condition],nodeIds:['N1','N2']})
  expect(result).toEqual({modelIds:['P','M','C'],relationIds:['R1','R2']})
 })
 it('handles self relationships and cycles once without adding paths to the original graph',()=>{
  expect(LowcodeDataSpaceModelForkGraph.scope({dataSpaceId:'S',modelId:'M',models,relations:[...relations,relation('SELF','M','M'),relation('CYCLE','C','P')],nodeIds:[]})).toEqual({modelIds:['P','M','C'],relationIds:['R1','R2','SELF','CYCLE']})
 })
 it('refuses ambiguous or orphan relation endpoints instead of silently dropping records',()=>{
  for(const row of [relation('BAD','M','missing'),relation('BAD','M','N1')])expect(()=>LowcodeDataSpaceModelForkGraph.scope({dataSpaceId:'S',modelId:'M',models,relations:[row],nodeIds:['N1']})).toThrow('端点')
  expect(()=>LowcodeDataSpaceModelForkGraph.scope({dataSpaceId:'S',modelId:'M',models,relations,nodeIds:['M']})).toThrow('重叠')
 })
 it('requires exact complete component bindings and fresh unique model registrations',()=>{
  for(const map of [bindings.slice(1),[...bindings,{from:'U',to:'NEW_U',name:'Copy_U'}],bindings.map(b=>({...b,to:'same'})),bindings.map(b=>({...b,name:b.from}))])expect(()=>LowcodeDataSpaceModelForkGraph.prepare({dataSpaceId:'S',modelId:'M',models,fields,relations,nodeIds:[],bindings:map})).toThrow()
 })
 it('includes explicit parent-model identity links and remaps them without pointing at the original component',()=>{
  const source=models.map(row=>({...row,Name:`Registered_${row.rowid}`,...row.rowid==='M'?{PId:'Registered_P'}:{}}))
  expect(LowcodeDataSpaceModelForkGraph.scope({dataSpaceId:'S',modelId:'M',models:source,relations:[],nodeIds:[]}).modelIds).toEqual(['P','M'])
  const result=LowcodeDataSpaceModelForkGraph.prepare({dataSpaceId:'S',modelId:'M',models:source,fields,relations:[],nodeIds:[],bindings:bindings.slice(0,2)})
  expect(result.models.find(row=>row.from==='M')?.value['PId']).toBe('Copy_P')
  expect(()=>LowcodeDataSpaceModelForkGraph.scope({dataSpaceId:'S',modelId:'M',models:source.map(row=>row.rowid==='M'?{...row,PId:'P'}:row),relations:[],nodeIds:[]})).toThrow('父模型')
  expect(()=>LowcodeDataSpaceModelForkGraph.scope({dataSpaceId:'S',modelId:'M',models:source.map(row=>row.rowid==='M'?{...row,PId:'missing'}:row),relations:[],nodeIds:[]})).toThrow('父模型')
 })
 it('projects all component references simultaneously, preserving physical qualifiers, constants, node inputs and originals',()=>{
  const sourceModels=models.map(row=>row.rowid==='M'?{...row,Filter:JSON.stringify({Type:'cond',Field:'P.id',Operator:'equal',ValueFun:{Type:'GetTableField',Field:'C.id'}})}:row)
  const sourceFields=[...fields,{rowid:'COMPUTED',dataSetId:'S',dataModelId:'M',Name:'computed',type:'dataModel',FieldType:'计算字段',ValueFun:JSON.stringify({Type:'GetTableField',Field:'P.id'})},
   {rowid:'INPUT',dataSetId:'S',dataModelId:'M',Name:'input',type:'inputParams',FieldType:'varchar',ValueFun:JSON.stringify({Type:'GetInputParam',ParamName:'P.id'})}]
  const before=structuredClone({sourceModels,sourceFields,relations})
  const result=LowcodeDataSpaceModelForkGraph.prepare({dataSpaceId:'S',modelId:'M',models:sourceModels,fields:sourceFields,relations,nodeIds:[],bindings})
  expect(result.models.map(row=>row.value['rowid'])).toEqual(['NEW_P','NEW_M','NEW_C'])
  expect(result.models.find(row=>row.from==='M')?.value['Filter']).toContain('Copy_P.id')
  expect(result.models.find(row=>row.from==='M')?.value['Filter']).toContain('Copy_C.id')
  expect(result.fields.find(row=>row.from==='COMPUTED')?.value).toMatchObject({dataModelId:'NEW_M',ValueFun:JSON.stringify({Type:'GetTableField',Field:'Copy_P.id'})})
  expect(result.fields.find(row=>row.from==='INPUT')?.value['ValueFun']).toContain('P.id')
  expect(result.relations[0]?.value).toMatchObject({parentModId:'NEW_P',childModId:'NEW_M',parentTable:'PhysicalP',childTable:'PhysicalM',filter:relations[0]!.filter,depType:'join',cascadeDel:'1',custom:'keep'})
  expect(result.relations.every(row=>!['P','M','C'].includes(String(row.value['parentModId']))&&!['P','M','C'].includes(String(row.value['childModId'])))).toBe(true)
  expect({sourceModels,sourceFields,relations}).toEqual(before)
 })
 it('rejects foreign and duplicate field identities before preparing copied rows',()=>{
  for(const rows of [[...fields,{...fields[0]!,rowid:'OTHER',dataSetId:'X'}],[...fields,fields[0]!]])expect(()=>LowcodeDataSpaceModelForkGraph.prepare({dataSpaceId:'S',modelId:'M',models,fields:rows,relations,nodeIds:[],bindings})).toThrow()
 })
 it('checks qualified references against every final registered name together',()=>{
  const own=[...fields,{rowid:'DOTTED',dataSetId:'S',dataModelId:'M',Name:'Detail.id',type:'dataModel',FieldType:'varchar',ValueFun:''},
   {rowid:'REF',dataSetId:'S',dataModelId:'M',Name:'computed',type:'dataModel',FieldType:'计算字段',ValueFun:JSON.stringify({Type:'GetTableField',Field:'M.Detail.id'})}]
  const names=bindings.map(b=>({...b,name:b.from==='M'?'Fork':b.from==='C'?'Fork.Detail':'Copy_P'}))
  expect(()=>LowcodeDataSpaceModelForkGraph.prepare({dataSpaceId:'S',modelId:'M',models,fields:own,relations,nodeIds:[],bindings:names})).toThrow('不唯一')
 })
 it('resolves relation right-side table fields in the parent namespace rather than the child local-field namespace',()=>{
  const own=[...fields,{rowid:'COLLISION',dataSetId:'S',dataModelId:'M',Name:'P.id',type:'dataModel',FieldType:'varchar',ValueFun:''}]
  const relationRow={...relation('R1','P','M'),parentTable:'ParentAlias',childTable:'ChildAlias',filter:JSON.stringify({Type:'cond',Field:'ChildAlias.id',Operator:'equal',ValueFun:{Type:'GetTableField',Field:'P.id'}})}
  const result=LowcodeDataSpaceModelForkGraph.prepare({dataSpaceId:'S',modelId:'M',models,fields:own,relations:[relationRow],nodeIds:[],bindings:bindings.slice(0,2)})
  expect(JSON.parse(String(result.relations[0]?.value['filter']))).toMatchObject({Field:'ChildAlias.id',ValueFun:{Type:'GetTableField',Field:'Copy_P.id'}})
 })
})
