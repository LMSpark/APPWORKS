import {expect,it,vi} from 'vitest'
import {DataSet,parseDataViewKey} from '@spark-appworks/spark-data'
import {readContentBaselineTenderRecord} from '@/views/features/application/smart-bid/authoring/model/content-baseline-reader'
import {compareRegisteredOriginalForms,originalFormMappingScenarioView,previousFormMappingScenarioViews,readBaselineOriginalForm,readRegisteredOriginalForm} from '@/views/features/application/smart-bid/response/model/original-form-reader'
import {readContentBaselineFact,readContentBaselineFactUse,readContentBaselineRequirementPins,readContentBaselineRequirement} from '@/views/features/application/smart-bid/authoring/model/content-baseline-reader'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import {createBidResponseScriptHost} from '@/views/features/application/smart-bid/response/ui/entry/response-script-host'
import script from '@/views/features/application/smart-bid/response/page10/script.js?raw'

const requirementSource={runId:'RUN',type:'FORMAT',ordinal:0,recordVersion:'002',recordHash:'a'.repeat(64)}
function fixture(options:{baseline?:Record<string,unknown>;fact?:Record<string,unknown>;requirementSource?:unknown;tender?:Record<string,unknown>;count?:number;hidden?:string}={}){
 const baseline={id:'B',projectId:'P',stageRef:{decisionId:'STAGE'},factVersions:[{factId:'PRICE',version:2}],requirementVersions:[{lineageId:'L',version:'R2'}],...options.baseline}
 const fact={id:'FV2',projectId:'P',key:'PRICE',version:2,kind:'PRICE',value:'0.00',unit:'元',sourceIds:[],claimId:null,
  scopeRef:null,decisionRefs:[],dependencyRefs:[],promiseTerms:null,sourceRecord:null,status:'ADOPTED',...options.fact}
 const definitions=[{name:'Baseline',view:'selectedBaseline',record:baseline,params:{projectId:'projectId',id:'baselineId'}},
  {name:'FactVersion',view:'selectedFactVersion',record:fact,params:{projectId:'projectId',key:'key',version:'version'}},
  {name:'Requirement',view:'selectedRequirement',params:{projectId:'projectId',lineageId:'lineageId',version:'version'},
   record:{id:'REQ',projectId:'P',lineageId:'L',version:'R2',kind:'FORMAT',text:'原文',score:null,sourceSpan:null,
    supportingSpans:[],sourceRecord:options.requirementSource??null,parseQuality:'TEXT_ONLY',checks:[],constraint:null,applicability:{},status:'ADOPTED'}},
  {name:'TenderRecord',view:'selectedTenderRecord',params:{projectId:'projectId',runId:'runId',type:'type',ordinal:'ordinal',recordVersion:'recordVersion',recordHash:'recordHash'},
   record:{id:'TR',projectId:'P',...requirementSource,payload:{text:'原文'},sourceSpan:{page:1},parseQuality:'LOCATED',confirmStatus:'CONFIRMED',...options.tender}},
  {name:'DocumentTemplate',view:'originalFormMapping',params:{projectId:'projectId',templateRef:'templateRef',templateVersion:'templateVersion'},
   record:{id:'TM',projectId:'P',templateRef:'T',templateVersion:'V1',baselineId:baseline.id,stageRef:baseline.stageRef,
    tenderRecordRef:requirementSource,formRef:'FORM',fillerRef:'P',mappings:[{fieldRef:'F',cellRef:'CELL',meaningRef:'PRICE'}]}}]
 const priorViews=previousFormMappingScenarioViews({DocumentTemplate:'id',Baseline:'id',TenderRecord:'id'})
 const ds=DataSet.fromJson({scenarioId:'S',tables:Object.fromEntries(definitions.map(d=>[d.name,{
  modelBinding:{modelId:d.name,modelName:d.name},columns:Object.keys(d.record).map(name=>({name,isPrimaryKey:name==='id',...(d.name==='FactVersion'&&name==='version'?{type:'number' as const}:{})})),
  views:{default:{},...priorViews[d.name as keyof typeof priorViews],[d.view]:d.name==='DocumentTemplate'?originalFormMappingScenarioView('id'):
   {commitMode:'staged',scopeFilter:{logic:'and',filters:Object.entries(d.params).map(([field,ParamName])=>({field,operator:'eq',value:{Type:'GetInputParam',ParamName}}))}}}}]))})
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
it('reads the original template mapping and checks exact form cells against the frozen baseline',async()=>{
 const scoped=fixture({baseline:{tenderRecords:[requirementSource]},tender:{payload:{formRef:'FORM',cells:[
  {cellRef:'CELL',rowRef:'1',columnRef:'COL',meaningRef:'PRICE',fillerRef:'P',unit:'元',displayRef:'DECIMAL'},
 ]}}})
 try{
  const result=await readRegisteredOriginalForm(scoped.host,{templateRef:'T',templateVersion:'V1'})
  expect(result).toMatchObject({state:'MATCHED',formVersion:'002',baselineId:'B',
   mappings:[{fieldRef:'F',cell:{rowRef:'1',meaningRef:'PRICE',unit:'元'}}]})
  const previous=previousFormMappingScenarioViews({DocumentTemplate:'id',Baseline:'id',TenderRecord:'id'})
  const previousTenderRef={...requirementSource,recordVersion:'001'}
  const previousRows={
   DocumentTemplate:{id:'TM-OLD',projectId:'P',templateRef:'T',templateVersion:'V0',baselineId:'B-OLD',stageRef:input.stageRef,
    tenderRecordRef:previousTenderRef,formRef:'FORM',fillerRef:'P',mappings:[{fieldRef:'F',cellRef:'CELL',meaningRef:'OLD-MEANING'}]},
   Baseline:{id:'B-OLD',projectId:'P',stageRef:input.stageRef,tenderRecords:[previousTenderRef]},
   TenderRecord:{id:'TR-OLD',projectId:'P',...previousTenderRef,sourceSpan:{page:1},parseQuality:'LOCATED',confirmStatus:'CONFIRMED',
    payload:{formRef:'FORM',cells:[
     {cellRef:'CELL',rowRef:'1',columnRef:'COL',meaningRef:'OLD-MEANING',fillerRef:'P',unit:'元',displayRef:'DECIMAL'},
    ]}},
  }
  for(const model of Object.keys(previous) as Array<keyof typeof previous>){
   const name=Object.keys(previous[model])[0]!
   const view=scoped.ds.getView(model,name)
   if(!view)throw Error('TEST_PREVIOUS_FORM_VIEW_REQUIRED')
   const table=new DataSpaceQueryTable({scenarioId:'S',metaName:model})
   view.bindQueryExecutor({save:scoped.save,executeQuery:async()=>new DataSpaceQueryContext({identity:table.identity,scope:'previous',
    readScope:()=> 'previous',snapshot:table.applyResult({Result:{primaryKeyField:'id',data:{Count:1,Items:[
     {...previousRows[model],lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}},
    ]}}})})})
  }
  const comparison=await compareRegisteredOriginalForms(scoped.host,{templateRef:'T',previousVersion:'V0',currentVersion:'V1'})
  expect(comparison).toMatchObject({state:'COMPARED',previousFormVersion:'001',currentFormVersion:'002',changedFields:['F'],addedFields:[]})
  comparison.assertCurrent()
  await scoped.ds.getView('DocumentTemplate','originalFormMapping')?.refresh()
  expect(()=>comparison.assertCurrent()).toThrow()
  expect(()=>result.assertCurrent()).toThrow()
 }finally{scoped.ds.destroy()}
})
it('maps a located original form only from the reference fixed by the baseline',async()=>{
 const scoped=fixture({baseline:{tenderRecords:[requirementSource]}})
 try{
  const readCells=vi.fn(()=>({formRef:'FORM',cells:[
   {cellRef:'CELL',rowRef:'1',columnRef:'COL',meaningRef:'PRICE',fillerRef:'P',unit:'元',displayRef:'DECIMAL'},
  ]}))
  const request={basis:input,reference:requirementSource,mapping:{formRef:'FORM',fillerRef:'P',
   mappings:[{fieldRef:'F',cellRef:'CELL',meaningRef:'PRICE'}]}}
  const form=await readBaselineOriginalForm(scoped.host,request,{readCells})
  expect(form).toMatchObject({formVersion:'002',mappings:[{fieldRef:'F',cell:{unit:'元'}}]})
  expect(readCells).toHaveBeenCalledExactlyOnceWith({text:'原文'},{page:1})
  await expect(readBaselineOriginalForm(scoped.host,{...request,reference:{...requirementSource,recordVersion:'003'}},{readCells}))
   .rejects.toThrow('BASELINE_TENDER_RECORD_MISSING')
  expect(readCells).toHaveBeenCalledTimes(1)
  expect(()=>form.assertCurrent()).toThrow()
 }finally{scoped.ds.destroy()}
})
it('checks current use against the fixed fact row and its original decision references',async()=>{
 const scoped=fixture({fact:{scopeRef:{lot:'LOT',phase:'BID'},decisionRefs:[{id:'APPROVAL',version:'V1'}]}})
 try{
  const request={...input,scopeRef:{phase:'BID',lot:'LOT'},purposeRef:'SUBMIT',useAt:10}
  type ReadUse=Parameters<typeof readContentBaselineFactUse>[2]
  const readUse=vi.fn<ReadUse>(async(target,fact)=>({...target,state:'RESTRICTED',useCheckRef:'USE',
   decisionRefs:fact.decisionRefs,assertCurrent:()=>{}}))
  const result=await readContentBaselineFactUse(scoped.host,request,readUse)
  expect(result.use).toMatchObject({factId:'PRICE',version:2,state:'RESTRICTED',useCheckRef:'USE'})
  await expect(readContentBaselineFactUse(scoped.host,{...request,scopeRef:{lot:'OTHER'}},readUse)).rejects.toThrow('BID_FACT_USE_SCOPE')
  expect(readUse).toHaveBeenCalledTimes(1)
  expect(()=>result.assertCurrent()).toThrow()
  const page=createBidResponseScriptHost({...scoped.host.runtime,generation:1,isLoaded:true,destroyed:false},
   {scenarioId:'S',scopeRef:'LOT',purposeRef:'SUBMIT',asOf:10,rateOnly:false,assertCurrent:scoped.host.assertCurrent},{
    readPriceEvidence:async()=>{throw Error('NO_PRICE')},readSecurityReceipts:async()=>{throw Error('NO_SECURITY')},
    fixedFacts:{projectId:'P',basis:{baselineId:input.baselineId,stageRef:input.stageRef,scopeRef:request.scopeRef},
     assertCurrent:scoped.host.assertCurrent,readUse},
   })
  const signal=new AbortController().signal,showAlert=vi.fn()
  expect(()=>page.invoke('bid.response.readFixedFact',{factId:'PRICE',version:1},signal)).toThrow('BID_RESPONSE_FACT_REQUEST')
 }finally{scoped.ds.destroy()}
})
it('requires a fixed fact source to belong to its baseline and keeps the original record proof',async()=>{
 const missing=fixture({fact:{sourceRecord:requirementSource},baseline:{tenderRecords:[]}})
 const exact=fixture({fact:{sourceRecord:requirementSource},baseline:{tenderRecords:[requirementSource]}})
 try{
  await expect(readContentBaselineFact(missing.host,input)).rejects.toThrow('BASELINE_TENDER_RECORD_MISSING')
  expect(missing.queries[3]).not.toHaveBeenCalled()
  const result=await readContentBaselineFact(exact.host,input)
  result.assertCurrent()
  expect(exact.queries[3]).toHaveBeenCalledTimes(1)
  await exact.ds.getView('TenderRecord','selectedTenderRecord')!.refresh()
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{missing.ds.destroy();exact.ds.destroy()}
})
it('requires the requirement source to match the same original baseline and keeps its field proof',async()=>{
 const ref={runId:'RUN',type:'FORMAT',ordinal:0,recordVersion:'002',recordHash:'a'.repeat(64)}
 const selection={baselineId:'B',stageRef:input.stageRef,lineageId:'L',version:'R2'}
 const wrong=fixture({requirementSource:ref,baseline:{tenderRecords:[{...ref,recordHash:'b'.repeat(64)}]}})
 const exact=fixture({requirementSource:ref,baseline:{tenderRecords:[ref]}})
 try{
  await expect(readContentBaselineRequirement(wrong.host,selection)).rejects.toThrow('BASELINE_TENDER_RECORD_MISSING')
  const result=await readContentBaselineRequirement(exact.host,selection)
  result.assertCurrent()
  expect(wrong.queries[3]).not.toHaveBeenCalled()
  expect(exact.queries[3]).toHaveBeenCalledTimes(1)
  const view=exact.ds.getView('Baseline','selectedBaseline')!
  Object.defineProperty(view.rows[0]!,'tenderRecords',{value:[],enumerable:true})
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_ROW')
  expect(exact.queries[0]).toHaveBeenCalledTimes(1)
 }finally{wrong.ds.destroy();exact.ds.destroy()}
})
it('rejects requirement source when the original record is no longer confirmed',async()=>{
 const f=fixture({requirementSource,baseline:{tenderRecords:[requirementSource]},tender:{confirmStatus:'REJECTED'}})
 try{
  await expect(readContentBaselineRequirement(f.host,{baselineId:'B',stageRef:input.stageRef,lineageId:'L',version:'R2'}))
   .rejects.toThrow('CONTENT_TENDER_RECORD_UNAVAILABLE')
 }finally{f.ds.destroy()}
})
it('proves only the complete original tender record reference and withdraws it on baseline refresh',async()=>{
 const ref={runId:'RUN',type:'FORMAT',ordinal:0,recordVersion:'002',recordHash:'a'.repeat(64)}
 const f=fixture({baseline:{tenderRecords:[ref]}})
 try{
  await expect(readContentBaselineTenderRecord(f.host,input,{...ref,recordVersion:'2'})).rejects.toThrow('BASELINE_TENDER_RECORD_MISSING')
  const result=await readContentBaselineTenderRecord(f.host,input,ref)
  expect(result.baselineDataViewKey).toBe('S@Baseline@selectedBaseline')
  result.assertCurrent()
  await f.ds.getView('Baseline','selectedBaseline')!.refresh()
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  expect(f.queries[1]).not.toHaveBeenCalled()
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
it('opens only the confirmed baseline requirement and revokes its proof when baseline changes',async()=>{
 const f=fixture()
 const selected={baselineId:'B',stageRef:input.stageRef,lineageId:'L',version:'R2'}
 try{
  await expect(readContentBaselineRequirement(f.host,{...selected,version:'R1'})).rejects.toThrow('BASELINE_REQUIREMENT_MEMBER_MISSING')
  expect(f.queries[2]).not.toHaveBeenCalled()
  const result=await readContentBaselineRequirement(f.host,selected)
  expect(result.requirementDataViewKey).toBe('S@Requirement@selectedRequirement')
  expect(result.requiresUseCheck).toBe(true)
  expect(result.baselineMembershipVerified).toBe(true)
  result.assertCurrent()
  await f.ds.getView('Baseline','selectedBaseline')!.refresh()
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
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
