import {expect,it,vi} from 'vitest'
import {DataSet,parseDataViewKey} from '@spark-appworks/spark-data'
import {readContentFactVersion} from '@/views/features/application/smart-bid/authoring/model/content-fact-version-reader'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

async function fixture(options:{value?:unknown;status?:string;count?:number|null;wrong?:string;hidden?:string}={}){
 const record={id:'FV_ORIGINAL',projectId:'P',key:'PRICE',version:2,kind:'PRICE',value:Object.hasOwn(options,'value')?options.value:'0.00',
  unit:'元',sourceIds:[{id:'SOURCE',version:'original'}],claimId:'CLAIM_ORIGINAL',scopeRef:{projectId:'P',stage:'BID'},
  decisionRefs:[{id:'APPROVAL',version:'A1'}],dependencyRefs:[],promiseTerms:null,sourceRecord:null,status:options.status??'ADOPTED'}
 const scope={logic:'and' as const,filters:['projectId','key','version'].map(field=>({field,operator:'eq' as const,value:{Type:'GetInputParam',ParamName:field}}))}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{FactVersion:{modelBinding:{modelId:'M',modelName:'FactVersion'},
  columns:Object.keys(record).map(name=>({name,isPrimaryKey:name==='id',...(name==='version'?{type:'number' as const}:{})})),
  views:{default:{},selectedFactVersion:{commitMode:'staged',scopeFilter:scope}}}}})
 const view=ds.getView('FactVersion','selectedFactVersion')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'FactVersion'})
 const save=vi.fn(async()=>{throw Error('UNEXPECTED_WRITE')})
 const query=vi.fn(async()=>new DataSpaceQueryContext({identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',data:{
  ...(options.count===null?{}:{Count:options.count??1}),Items:[{...record,...(options.wrong?{[options.wrong]:'OTHER'}:{}),lingma_sys_params:{r:[],e:[],h:options.hidden?[options.hidden]:[],m:[],d:false}}],
 }}})}))
 view.bindQueryExecutor({executeQuery:query,save})
 let current=true
 const host={scenarioId:'S',projectId:'P',runtime:{resolveView:(key:string)=>{const k=parseDataViewKey(key);return k?ds.getView(k.tableName,k.viewId):undefined}},assertCurrent:()=>{if(!current)throw Error('HOST_STALE')}}
 return {ds,host,view,save,query,expire:()=>{current=false}}
}

it.each(['0.00',0,false,null,''])('preserves the exact original value %j without granting baseline membership or current use',async value=>{
 const f=await fixture({value})
 try{
  const binding=await readContentFactVersion(f.host,{factId:'PRICE',version:2})
  expect(binding.dataViewKey).toBe('S@FactVersion@selectedFactVersion')
  expect(f.view.queryContext).toMatchObject({projectId:'P',key:'PRICE',version:2})
  expect(f.view.rows[0]?.['value']).toBe(value)
  expect(f.view.rows[0]?.['decisionRefs']).toEqual([{id:'APPROVAL',version:'A1'}])
  expect(binding.requiresBaselineMembershipCheck).toBe(true)
  expect(binding.requiresUseCheck).toBe(true)
  binding.assertCurrent();expect(f.save).not.toHaveBeenCalled();expect(f.view.hasEditingChanges()).toBe(false)
 }finally{f.ds.destroy()}
})
it.each(['CANDIDATE','REJECTED'])('reads original status %s without converting it into use permission',async status=>{
 const f=await fixture({status})
 try{const binding=await readContentFactVersion(f.host,{factId:'PRICE',version:2});expect(binding.requiresUseCheck).toBe(true);expect(f.view.rows[0]?.['status']).toBe(status)}finally{f.ds.destroy()}
})
it.each([{count:2},{count:null},{wrong:'projectId'},{wrong:'key'},{wrong:'version'},{hidden:'decisionRefs'},{hidden:'value'}])('rejects ambiguous, wrong or unreadable records %j',async options=>{
 const f=await fixture(options)
 try{await expect(readContentFactVersion(f.host,{factId:'PRICE',version:2})).rejects.toThrow();expect(f.save).not.toHaveBeenCalled()}finally{f.ds.destroy()}
})
it('invalidates the binding on a same-valued refresh and on host replacement',async()=>{
 const f=await fixture()
 try{const binding=await readContentFactVersion(f.host,{factId:'PRICE',version:2});await f.view.refresh();expect(()=>binding.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT');f.expire();expect(()=>binding.assertCurrent()).toThrow('HOST_STALE')}finally{f.ds.destroy()}
})
it('rejects a weakened formal scope and invalid version before dispatch',async()=>{
 const f=await fixture()
 try{
  await expect(readContentFactVersion(f.host,{factId:'PRICE',version:NaN})).rejects.toThrow('CONTENT_FACT_VERSION_IDENTITY_REQUIRED')
  f.view.configure({scopeFilter:{field:'projectId',operator:'eq',value:{Type:'GetInputParam',ParamName:'projectId'}}})
  await expect(readContentFactVersion(f.host,{factId:'PRICE',version:2})).rejects.toThrow('CONTENT_FACT_VERSION_SCOPE_REQUIRED')
  expect(f.query).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
it('rejects source-decision replacement after the original fact was read',async()=>{
 const f=await fixture()
 try{
  const binding=await readContentFactVersion(f.host,{factId:'PRICE',version:2})
  const row=f.view.rows[0]!
  Object.defineProperty(row,'decisionRefs',{value:[{id:'OTHER_APPROVAL',version:'A2'}],enumerable:true})
  expect(()=>binding.assertCurrent()).toThrow('DATA_VIEW_READ_ROW')
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
it('does not publish a binding when the host expires during its formal query',async()=>{
 const f=await fixture(),execute=f.query.getMockImplementation()!
 try{
  f.query.mockImplementationOnce(async()=>{const result=await execute();f.expire();return result})
  await expect(readContentFactVersion(f.host,{factId:'PRICE',version:2})).rejects.toThrow('HOST_STALE')
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
