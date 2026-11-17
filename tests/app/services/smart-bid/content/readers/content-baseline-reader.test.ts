import {expect,it,vi} from 'vitest'
import {DataSet,parseDataViewKey} from '@spark-appworks/spark-data'
import {readContentBaselineFact,readContentBaselineRequirementPins} from '@/views/features/application/smart-bid/authoring/model/content-baseline-reader'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

function fixture(options:{baseline?:Record<string,unknown>;fact?:Record<string,unknown>;count?:number;hidden?:string}={}){
 const baseline={id:'B',projectId:'P',stageRef:{decisionId:'STAGE'},factVersions:[{factId:'PRICE',version:2}],requirementVersions:[{lineageId:'L',version:'R2'}],...options.baseline}
 const fact={id:'FV2',projectId:'P',key:'PRICE',version:2,kind:'PRICE',value:'0.00',unit:'元',sourceIds:[],claimId:null,
  scopeRef:null,decisionRefs:[],dependencyRefs:[],promiseTerms:null,sourceRecord:null,status:'ADOPTED',...options.fact}
 const definitions=[{name:'Baseline',view:'selectedBaseline',record:baseline,params:{projectId:'projectId',id:'baselineId'}},
  {name:'FactVersion',view:'selectedFactVersion',record:fact,params:{projectId:'projectId',key:'key',version:'version'}}]
 const ds=DataSet.fromJson({scenarioId:'S',tables:Object.fromEntries(definitions.map(d=>[d.name,{
  modelBinding:{modelId:d.name,modelName:d.name},columns:Object.keys(d.record).map(name=>({name,isPrimaryKey:name==='id',...(name==='version'?{type:'number' as const}:{})})),
  views:{default:{},[d.view]:{commitMode:'staged',scopeFilter:{logic:'and',filters:Object.entries(d.params).map(([field,ParamName])=>({field,operator:'eq',value:{Type:'GetInputParam',ParamName}}))}}}}]))})
 const save=vi.fn(async()=>{throw Error('NO_WRITE')}),queries=definitions.map(d=>{
  const table=new DataSpaceQueryTable({scenarioId:'S',metaName:d.name})
  const query=vi.fn(async()=>new DataSpaceQueryContext({identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',data:{
   Count:d.name==='Baseline'?options.count??1:1,Items:[{...d.record,lingma_sys_params:{r:[],e:[],h:options.hidden?[options.hidden]:[],m:[],d:false}}]}}})}))
  ds.getView(d.name,d.view)!.bindQueryExecutor({executeQuery:query,save});return query
 })
 let active=true
 const host={scenarioId:'S',projectId:'P',runtime:{resolveView:(key:string)=>{const k=parseDataViewKey(key);return k?ds.getView(k.tableName,k.viewId):undefined}},assertCurrent:()=>{if(!active)throw Error('HOST_STALE')}}
 return {ds,host,queries,save,expire:()=>{active=false}}
}
const input={baselineId:'B',stageRef:{decisionId:'STAGE'},factId:'PRICE',version:2}
const requirementInput={baselineId:'B',stageRef:{decisionId:'STAGE'},nodes:[{nodeId:'CH',type:'chapter'}],
 pins:[{chapterId:'CH',lineageId:'L',version:'R1'},{chapterId:'CH',lineageId:'ABSENT',version:'R0'}]}
it('reads fixed requirement members from the original baseline and keeps version issues as diagnostics',async()=>{
 const f=fixture()
 try{
  const result=await readContentBaselineRequirementPins(f.host,requirementInput)
  expect(result.issues).toEqual([{chapterId:'CH',lineageId:'L',version:'R1',reason:'VERSION_CHANGED',selectedVersion:'R2'},
   {chapterId:'CH',lineageId:'ABSENT',version:'R0',reason:'NOT_IN_BASELINE'}])
  expect(result.requiresRevisionMatchCheck).toBe(true);expect(result.requiresUseCheck).toBe(true)
  expect(result.baselineDataViewKey).toBe('S@Baseline@selectedBaseline');result.assertCurrent()
  expect(f.queries[0]).toHaveBeenCalledTimes(1);expect(f.queries[1]).not.toHaveBeenCalled();expect(f.save).not.toHaveBeenCalled()
  await f.ds.getView('Baseline','selectedBaseline')!.refresh()
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{f.ds.destroy()}
})
it.each([{hidden:'requirementVersions'},{baseline:{stageRef:{decisionId:'WRONG'}}},
 {baseline:{requirementVersions:[{lineageId:'L',version:'R2'},{lineageId:'L',version:'R3'}]}}])('refuses unreadable, wrong-stage or ambiguous original requirement selection %j',async options=>{
 const f=fixture(options)
 try{await expect(readContentBaselineRequirementPins(f.host,requirementInput)).rejects.toThrow();expect(f.save).not.toHaveBeenCalled()}finally{f.ds.destroy()}
})
it('reads the original baseline and exact fact without creating a data copy or use permission',async()=>{
 const f=fixture()
 try{const result=await readContentBaselineFact(f.host,input)
  expect(result.baselineMembershipVerified).toBe(true);expect(result.requiresUseCheck).toBe(true)
  expect(result.requiresRevisionMatchCheck).toBe(true)
  expect(result.baselineDataViewKey).toBe('S@Baseline@selectedBaseline');result.assertCurrent()
  expect(f.ds.getView('FactVersion','selectedFactVersion')!.queryContext).toMatchObject({projectId:'P',key:'PRICE',version:2})
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
it.each([{baseline:{projectId:'OTHER'}},{baseline:{id:'OTHER'}},{baseline:{stageRef:{decisionId:'OTHER'}}},
 {baseline:{factVersions:[]}},{baseline:{factVersions:[{factId:'PRICE',version:3}]}},
 {baseline:{factVersions:[{factId:'PRICE',version:2},{factId:'PRICE',version:3}]}},
 {count:2},{hidden:'factVersions'}])('rejects invalid baseline before querying the fact %j',async options=>{
 const f=fixture(options)
 try{await expect(readContentBaselineFact(f.host,input)).rejects.toThrow();expect(f.queries[1]).not.toHaveBeenCalled();expect(f.save).not.toHaveBeenCalled()}finally{f.ds.destroy()}
})
it('rejects a same-valued amount in the wrong original version',async()=>{
 const f=fixture({fact:{version:3}})
 try{await expect(readContentBaselineFact(f.host,input)).rejects.toThrow()}finally{f.ds.destroy()}
})
it('invalidates original proofs on baseline refresh, including equal results',async()=>{
 const f=fixture()
 try{const result=await readContentBaselineFact(f.host,input);await f.ds.getView('Baseline','selectedBaseline')!.refresh()
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT');f.expire();expect(()=>result.assertCurrent()).toThrow('HOST_STALE')
 }finally{f.ds.destroy()}
})
it('rejects baseline replacement during the fact query',async()=>{
 const f=fixture(),query=f.queries[1]!,execute=query.getMockImplementation()!
 try{
  query.mockImplementationOnce(async()=>{const result=await execute();await f.ds.getView('Baseline','selectedBaseline')!.refresh();return result})
  await expect(readContentBaselineFact(f.host,input)).rejects.toThrow('DATA_VIEW_READ_RESULT')
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
it('rejects weakened baseline scope without dispatch',async()=>{
 const f=fixture()
 try{
  f.ds.getView('Baseline','selectedBaseline')!.configure({scopeFilter:{field:'projectId',operator:'eq',value:{Type:'GetInputParam',ParamName:'projectId'}}})
  await expect(readContentBaselineFact(f.host,input)).rejects.toThrow('CONTENT_BASELINE_SCOPE_REQUIRED')
  expect(f.queries[0]).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
