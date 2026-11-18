import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PageRuntimePool} from '../../../../../../packages/spark-app/src/router/page-runtime-pool'
import {createMemoryHistory,createRouter} from 'vue-router'
import {defineComponent,h} from 'vue'
import {ContentAuthoringCommands} from '@/views/features/application/smart-bid/authoring/ui/entry/content-authoring-commands'
import {createContentAuthoringScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-authoring-script-host'
import {prepareDraftCandidateRequest} from '@/services/smart-bid/content/draft/content-draft-candidate-request'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import {isRecord} from '@spark-appworks/spark-utils'

async function fixture(writable=true,other=false,createRuntime?:(ds:DataSet)=>Promise<PageRuntime>,primaryKey='id',
 firstProject?:{headRevisionId:string|null}){
 const ds=DataSet.fromJson({scenarioId:'S',tables:{...(firstProject?{
  ContentProject:{modelBinding:{modelId:'P_MODEL',modelName:'ContentProject'},
   columns:['projectId','headRevisionId','activeBaselineId'].map(name=>({name,isPrimaryKey:name==='projectId'})),
   views:{default:{},selectedProject:{scopeFilter:{field:'projectId',operator:'eq',value:{Type:'GetInputParam',ParamName:'projectId'}}}}},
 }:{}),WorkingDraft:{modelBinding:{modelId:'M',modelName:'WorkingDraft'},
  columns:[{name:primaryKey,type:'string',isPrimaryKey:true},{name:'projectId',type:'string'},{name:'userId',type:'string'},
   {name:'draftVersion',type:'string'},{name:'baseRevisionId',type:'string'},{name:'draft',type:'object'}],views:{default:{commitMode:'staged'}}}}})
 const view=ds.getView('WorkingDraft')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'WorkingDraft'})
 const row={[primaryKey]:'D',projectId:'P',userId:'U',draftVersion:'V1',baseRevisionId:firstProject?null:'BASE',draft:{nodes:[],responseChanges:[]}}
 const records=[row,...(other?[{...row,[primaryKey]:'OTHER'}]:[])]
 const query=vi.fn(async()=>new DataSpaceQueryContext({identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:primaryKey,data:{Count:records.length,
  Items:records.map(item=>({...item,lingma_sys_params:{r:[],e:writable?['draft']:[],h:[],m:[],d:false}}))}}})}))
 const save=vi.fn(async()=>{throw Error('NO_SAVE')});view.bindQueryExecutor({executeQuery:query,save});await view.refresh()
 if(firstProject){
  const project=ds.getView('ContentProject','selectedProject')!
  const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'ContentProject'})
  project.queryContext={projectId:'P'}
  project.bindQueryExecutor({save,executeQuery:async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'project',readScope:()=> 'project',snapshot:table.applyResult({Result:{
    primaryKeyField:'projectId',data:{Count:1,Items:[{projectId:'P',headRevisionId:firstProject.headRevisionId,
     activeBaselineId:'B',lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]},
   }}),
  })})
  await project.refresh()
 }
 let current=true
 const runtime=createRuntime?await createRuntime(ds):new PageRuntime({pageId:'PAGE11',scenarioIds:['S'],loadScenario:async()=>ds});await runtime.load()
 const pending=vi.fn(),binding={runtime,dataViewKey:'S@WorkingDraft@default',projectId:'P',draftId:'D',actorUserId:'U',
  assertCurrent:()=>{if(!current)throw Error('HOST_STALE')},setPending:pending}
 const commands=new ContentAuthoringCommands(binding)
 return {ds,runtime,view,commands,binding,query,save,pending,expire:()=>{current=false}}
}
it('refreshes an empty cached project head before preparing a first candidate',async()=>{
 const project:{headRevisionId:string|null}={headRevisionId:null}
 const f=await fixture(true,false,undefined,'id',project)
 try{
  const view=f.ds.getView('ContentProject','selectedProject')
  expect(view?.rows[0]?.['headRevisionId']).toBeNull()
  project.headRevisionId='ADOPTED'
  const session=createContentAuthoringScriptHost(f.binding,f.commands)
   .invoke('content.authoring.connect',undefined,new AbortController().signal)
  await expect(session.prepareDraftCandidate({requestKey:'Q',firstBatchId:'BATCH',targetScopeIndex:0}))
   .rejects.toThrow('CONTENT_DRAFT_FIRST_HEAD_CHANGED')
  expect(view?.rows[0]?.['headRevisionId']).toBe('ADOPTED')
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.runtime.dispose()}
})
const add={action:'addDocument' as const,args:[{documentId:'B',chapterId:'C',headingId:'H',title:'实施方案'}] as [{documentId:string;chapterId:string;headingId:string;title:string}]}
it('seals only confirmed changes and binds them to the original draft version',async()=>{
 const f=await fixture()
 try{
  expect(()=>f.commands.prepareSave('Q',f.commands.epoch)).toThrow('CONTENT_DRAFT_SAVE_UNCHANGED')
  f.commands.run(add,f.commands.epoch)
  const prepared=await f.commands.prepareSave('Q',f.commands.epoch)
  expect(prepared).toMatchObject({expectedDraftVersion:'V1',baseRevisionId:'BASE'})
  expect(prepared.requestJson).toContain('实施方案')
  f.commands.cancel(f.commands.epoch)
  expect(()=>prepared.assertCurrent()).toThrow()
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.runtime.dispose()}
})
it('uses the formal draft primary key for editing and cancellation',async()=>{
 const f=await fixture(true,false,undefined,'draftId')
 try{
  f.commands.run(add,f.commands.epoch)
  expect(f.view.hasEditingChanges()).toBe(true)
  f.commands.cancel(f.commands.epoch)
  expect(f.commands.canLeave).toBe(true)
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.runtime.dispose()}
})
it('captures the saved draft for candidacy and withdraws it when edits start',async()=>{
 const f=await fixture()
 try{
  const captured=await f.commands.captureCandidateDraft(f.commands.epoch)
  const original=f.view.rows[0]!
  f.view.dirtyTracking.markDirty('D',original)
  expect(f.view.hasEditingChanges()).toBe(false)
  expect(()=>captured.assertCurrent()).toThrow('CONTENT_CANDIDATE_DRAFT_UNSAVED')
  await expect(f.commands.captureCandidateDraft(f.commands.epoch)).rejects.toThrow('CONTENT_CANDIDATE_DRAFT_UNSAVED')
  f.view.dirtyTracking.clearDirty('D')
  expect(captured).toMatchObject({projectId:'P',draftId:'D',actorUserId:'U',draftVersion:'V1',baseRevisionId:'BASE',
   draftJson:'{"nodes":[],"responseChanges":[]}',contentDigest:expect.stringMatching(/^[a-f0-9]{64}$/u)})
  const basis={projectId:'P',revisionId:'BASE',baselineId:'B',stageRef:'ST',basisNodes:[],nodePayloads:[],responses:[],
   factVersions:[],assertCurrent:()=>{}}
  const input={requestKey:'CANDIDATE',targetScope:{schemaVersion:2,projectId:'P',targets:[{kind:'PROJECT'}]}}
  const candidate=await prepareDraftCandidateRequest(captured,basis,input)
  expect(candidate).toMatchObject({draftVersion:'V1',baseRevisionId:'BASE',baselineId:'B',
   contentDigest:captured.contentDigest,requestDigest:expect.stringMatching(/^[a-f0-9]{64}$/u)})
  expect(candidate.requestJson).toContain('"targetScope":{"projectId":"P","schemaVersion":2,"targets":[{"kind":"PROJECT"}]}')
  await expect(prepareDraftCandidateRequest(captured,{...basis,revisionId:'OTHER'},input)).rejects.toThrow('CONTENT_DRAFT_CANDIDATE_SCOPE')
  await expect(prepareDraftCandidateRequest({...captured,contentDigest:'0'.repeat(64)},basis,input))
   .rejects.toThrow('CONTENT_DRAFT_CANDIDATE_DIGEST')
  const responseDraft=canonicalSnapshotValue({nodes:[],responseChanges:[{assignmentId:'A',basisResponseId:'R1',responseId:'R2'}]})
  const withResponse={...captured,draftJson:responseDraft,contentDigest:await hashCanonicalSnapshotText(responseDraft)}
  const responseBasis={...basis,responses:[{projectId:'P',assignmentId:'A',responseId:'R1'}]}
  const responseInput={...input,targetScope:{...input.targetScope,targets:[{kind:'RESPONSE',assignmentId:'A',responseId:'R1'}]}}
  expect((await prepareDraftCandidateRequest(withResponse,responseBasis,responseInput)).requestJson)
   .toContain('"responseChanges":[{"assignmentId":"A","basisResponseId":"R1","responseId":"R2"}]')
  await expect(prepareDraftCandidateRequest(withResponse,responseBasis,input)).rejects.toThrow('CONTENT_DRAFT_CANDIDATE_TARGET_MISMATCH')
  const headline={nodeId:'H',parentId:'C',index:0,type:'heading',class:[],value:'正文',data:{}}
  const nodePayloads=[
   {nodeId:'B',parentId:'P',index:0,type:'document',class:[],value:'',data:{}},
   {nodeId:'C',parentId:'B',index:0,type:'chapter',class:[],value:'',data:{}},
   headline,
  ]
  const editedDraft=canonicalSnapshotValue({nodes:nodePayloads,responseChanges:[]})
  const edited={...captured,draftJson:editedDraft,contentDigest:await hashCanonicalSnapshotText(editedDraft)}
  await expect(prepareDraftCandidateRequest(edited,basis,input)).rejects.toThrow('CONTENT_DRAFT_CANDIDATE_TARGET_MISMATCH')
  expect((await prepareDraftCandidateRequest(edited,basis,{...input,declaredAddedNodeIds:['H','B','C']})).requestJson)
   .toContain('"declaredAddedNodeIds":["B","C","H"]')
  const previousNodes=[nodePayloads[0]!,nodePayloads[1]!,{...headline,value:'原文'}]
  const previous={...basis,basisNodes:previousNodes,nodePayloads:previousNodes}
  await expect(prepareDraftCandidateRequest(edited,previous,{...input,targetScope:{...input.targetScope,targets:[
   {kind:'NODE',nodeId:'C',extent:'NODE'},
  ]}})).rejects.toThrow('CONTENT_DRAFT_CANDIDATE_TARGET_MISMATCH')
  const unresolved=canonicalSnapshotValue({nodes:[...nodePayloads.slice(0,2),{...headline,
   value:'见{{后文}}',data:{后文:{type:'xref',nodeId:'MISSING',show:'title'}}}],responseChanges:[]})
  await expect(prepareDraftCandidateRequest({...edited,draftJson:unresolved,contentDigest:await hashCanonicalSnapshotText(unresolved)},
   previous,input)).rejects.toThrow('CONTENT_DRAFT_CANDIDATE_UNRESOLVED_LINK')
  const factDraft=canonicalSnapshotValue({nodes:[...nodePayloads.slice(0,2),{...headline,
   value:'报价{{金额}}',data:{金额:{type:'fact',factId:'PRICE'}}}],responseChanges:[]})
  const withFact={...edited,draftJson:factDraft,contentDigest:await hashCanonicalSnapshotText(factDraft)}
  await expect(prepareDraftCandidateRequest(withFact,previous,input)).rejects.toThrow('CONTENT_DRAFT_CANDIDATE_FACT_NOT_FROZEN')
  expect((await prepareDraftCandidateRequest(withFact,{...previous,factVersions:[{factId:'PRICE',version:2}]},input)).requestJson)
   .toContain('"factVersions":[{"factId":"PRICE","version":2}]')
  const changedType=canonicalSnapshotValue({nodes:[...nodePayloads.slice(0,2),{...headline,nodeId:'NEW-HEADING'},
   {...headline,index:1,type:'paragraph'}],responseChanges:[]})
  await expect(prepareDraftCandidateRequest({...edited,draftJson:changedType,contentDigest:await hashCanonicalSnapshotText(changedType)},
   previous,{...input,declaredAddedNodeIds:['NEW-HEADING']})).rejects.toThrow('CONTENT_DRAFT_CANDIDATE_NODE_TYPE_CHANGED')
  f.commands.run(add,f.commands.epoch)
  expect(()=>captured.assertCurrent()).toThrow()
  expect(()=>candidate.assertCurrent()).toThrow()
  await expect(f.commands.captureCandidateDraft(f.commands.epoch)).rejects.toThrow('CONTENT_CANDIDATE_DRAFT_UNSAVED')
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.runtime.dispose()}
})
it('still reports the original dirty state for departure when the editing binding is stale',async()=>{
 const clean=await fixture(),dirty=await fixture()
 const controller=new AbortController()
 try{
  const cleanSession=createContentAuthoringScriptHost(clean.binding,clean.commands).invoke('content.authoring.connect',undefined,controller.signal)
  const dirtySession=createContentAuthoringScriptHost(dirty.binding,dirty.commands).invoke('content.authoring.connect',undefined,controller.signal)
  dirtySession.setInputPending(true)
  clean.expire()
  dirty.expire()
  expect(cleanSession.canLeave).toBe(true)
  expect(dirtySession.canLeave).toBe(false)
  dirtySession.cancel()
  expect(dirtySession.canLeave).toBe(true)
  expect(dirty.view.hasEditingChanges()).toBe(false)
  expect(dirty.save).not.toHaveBeenCalled()
 }finally{clean.runtime.dispose();dirty.runtime.dispose()}
})
it('protects staged rows when a stale command tries to cancel',async()=>{
 const f=await fixture()
 try{
  f.commands.run(add,f.commands.epoch)
  f.commands.setInputPending('detail',true,f.commands.epoch)
  f.expire()
  expect(()=>f.commands.cancel(f.commands.epoch)).toThrow('HOST_STALE')
  expect(f.view.hasEditingChanges()).toBe(true)
  expect(f.commands.canLeave).toBe(false)
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.runtime.dispose()}
})
it('prevents generic CRUD save from bypassing the unavailable authoritative draft command',async()=>{
 const f=await fixture()
 try{
  f.commands.run(add,f.commands.epoch)
  await expect(f.ds.saveChanges()).rejects.toThrow('CONTENT_DRAFT_REMOTE_SAVE_UNAVAILABLE')
  expect(f.save).not.toHaveBeenCalled();expect(f.runtime.isDirty).toBe(true)
 }finally{f.runtime.dispose()}
})
it('connects the script only to original actions and rejects expired render callbacks',async()=>{
 const f=await fixture(),controller=new AbortController()
 try{
  const host=createContentAuthoringScriptHost(f.binding,f.commands)
  const session=host.invoke('content.authoring.connect',undefined,controller.signal)
  const addDocument=session.actionProps('新增逻辑册',null)
  expect(addDocument.disabled).toBe(false);addDocument.onClick()
  const draft=f.view.getEditingRow('D')?.['draft']
  if(!isRecord(draft))throw Error('DRAFT_REQUIRED')
  expect(draft['nodes']).toHaveLength(3)
  expect(f.runtime.isDirty).toBe(true);expect(()=>addDocument.onClick()).toThrow('CONTENT_COMMAND_STALE')
  session.cancel();expect(f.runtime.isDirty).toBe(false)
  const next=session.actionProps('新增逻辑册',null)
  controller.abort();expect(()=>next.onClick()).toThrow('CONTENT_PAGE_RENDER_STALE')
  expect(f.view.hasEditingChanges()).toBe(false);expect(f.save).not.toHaveBeenCalled()
 }finally{f.runtime.dispose()}
})
it('keeps the original pending input dirty and rejects selection until explicit cancellation',async()=>{
 const f=await fixture(),controller=new AbortController()
 try{
  const session=createContentAuthoringScriptHost(f.binding,f.commands).invoke('content.authoring.connect',undefined,controller.signal)
  session.setInputPending(true)
  expect(f.runtime.isDirty).toBe(true);expect(()=>session.select()).toThrow('CONTENT_COMMAND_PENDING_INPUT')
  expect(session.actionProps('新增逻辑册',null).disabled).toBe(true)
  session.cancel();expect(f.runtime.isDirty).toBe(false)
  f.expire();expect(()=>session.actionProps('新增逻辑册',null)).toThrow('HOST_STALE')
 }finally{f.runtime.dispose()}
})
it('rejects old editor writes and never lets its cleanup clear a newer editor input',async()=>{
 const f=await fixture(),controller=new AbortController()
 try{
  f.commands.run(add,f.commands.epoch)
  const session=createContentAuthoringScriptHost(f.binding,f.commands).invoke('content.authoring.connect',undefined,controller.signal)
  const old=session.editorProps([2]),oldChange=old['onChange'],oldPending=old['onEditingChange']
  if(typeof oldChange!=='function'||typeof oldPending!=='function')throw Error('EDITOR_CALLBACK_REQUIRED')
  session.select()
  const next=session.editorProps([2]),nextPending=next['onEditingChange']
  if(typeof nextPending!=='function')throw Error('EDITOR_CALLBACK_REQUIRED')
  expect(()=>Reflect.apply(oldChange,undefined,[])).toThrow('CONTENT_COMMAND_STALE')
  Reflect.apply(nextPending,undefined,[true]);Reflect.apply(oldPending,undefined,[false])
  expect(f.commands.hasPendingInput).toBe(true)
  expect(()=>Reflect.apply(oldPending,undefined,[null])).toThrow('CONTENT_COMMAND_INPUT_STATE_REQUIRED')
  session.cancel();expect(f.runtime.isDirty).toBe(false)
 }finally{f.runtime.dispose()}
})
it('edits only the original draft and cancels locally while guarding departure',async()=>{
 const f=await fixture()
 try{
  expect(f.commands.canLeave).toBe(true);const old=f.commands.epoch
  f.commands.run(add,old);expect(f.commands.canLeave).toBe(false)
  expect(f.view.hasEditingChanges('D')).toBe(true);expect(f.view.rows[0]?.['draft']).toEqual({nodes:[],responseChanges:[]})
  expect(()=>f.commands.run(add,old)).toThrow()
  f.commands.cancel(f.commands.epoch);expect(f.commands.canLeave).toBe(true)
  expect(f.view.hasEditingChanges()).toBe(false);expect(f.query).toHaveBeenCalledTimes(1);expect(f.save).not.toHaveBeenCalled()
 }finally{f.runtime.dispose()}
})
it('aggregates pending editor identities and rejects old callbacks after cancel',async()=>{
 const f=await fixture()
 try{
  const epoch=f.commands.epoch
  f.commands.setInputPending('text',true,epoch);f.commands.setInputPending('table',true,epoch)
  f.commands.setInputPending('text',false,epoch);expect(f.commands.canLeave).toBe(false)
  expect(()=>f.commands.run(add,epoch)).toThrow()
  f.commands.cancel(epoch);expect(f.commands.canLeave).toBe(true)
  expect(()=>f.commands.setInputPending('table',false,epoch)).toThrow()
 }finally{f.runtime.dispose()}
})
it.each(['host','query','dispose','permission'])('rejects a stale or unwritable command: %s',async mode=>{
 const f=await fixture(mode!=='permission')
 try{
  if(mode==='host')f.expire()
  if(mode==='query')await f.view.refresh()
  if(mode==='dispose')f.commands.dispose()
  expect(()=>f.commands.run(add,f.commands.epoch)).toThrow()
  expect(f.view.hasEditingChanges()).toBe(false);expect(f.save).not.toHaveBeenCalled()
 }finally{f.runtime.dispose()}
})
it('invalidates old structure callbacks when only the selected node changes',async()=>{
 const f=await fixture()
 try{
  const old=f.commands.epoch
  f.commands.selectionChanged(old)
  expect(()=>f.commands.run(add,old)).toThrow('CONTENT_COMMAND_STALE')
  const epoch=f.commands.epoch
  f.commands.setInputPending('detail',true,epoch)
  expect(()=>f.commands.selectionChanged(epoch)).toThrow('CONTENT_COMMAND_PENDING_INPUT')
  expect(f.commands.epoch).toBe(epoch)
 }finally{f.runtime.dispose()}
})
it('cancels only the current draft and keeps another draft dirty for departure protection',async()=>{
 const f=await fixture(true,true)
 try{
  f.commands.run(add,f.commands.epoch)
  f.view.updateEditingValue('OTHER','draft',{nodes:[],responseChanges:[{id:'other-answer'}]})
  f.commands.cancel(f.commands.epoch)
  expect(f.view.hasEditingChanges('D')).toBe(false)
  expect(f.view.hasEditingChanges('OTHER')).toBe(true)
  expect(f.commands.canLeave).toBe(false)
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.runtime.dispose()}
})
it('publishes unconfirmed input into the original runtime dirty contract used by tool close and reload',async()=>{
 const f=await fixture()
 try{
  const epoch=f.commands.epoch
  expect(f.runtime.isDirty).toBe(false)
  f.commands.setInputPending('table-input',true,epoch)
  expect(f.view.hasEditingChanges()).toBe(false)
  expect(f.runtime.isDirty).toBe(true)
  await expect(f.runtime.reload()).rejects.toThrow()
  f.commands.setInputPending('table-input',false,epoch)
  expect(f.runtime.isDirty).toBe(false)
 }finally{f.runtime.dispose()}
})
it('prevents the real tool instance pool from closing while input is unconfirmed and releases after explicit cancellation',async()=>{
 let pool!:PageRuntimePool
 const f=await fixture(true,false,async ds=>{
  const page=defineComponent({render:()=>h('div')})
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/page',component:page,meta:{type:'config-page',tool:{pageId:'PAGE11',projectId:'APP'},nodeId:'NAV'}}]})
  await router.push('/page?scenarioId=S')
  pool=new PageRuntimePool({pageComponent:page,readPageFile:async input=>input.fileName==='rule.json'?'[]':'',loadScenario:async()=>ds,readNavTree:()=>null,refreshRoutes:async()=>{}})
  return pool.getPageRuntime(router.currentRoute.value)!
 })
 try{
  f.commands.setInputPending('paragraph',true,f.commands.epoch)
  expect(()=>pool.closePageRuntime(f.runtime.instanceId)).toThrow('未保存修改')
  expect(f.runtime.destroyed).toBe(false)
  f.commands.cancel(f.commands.epoch)
  pool.closePageRuntime(f.runtime.instanceId)
  expect(f.runtime.destroyed).toBe(true)
 }finally{f.runtime.dispose()}
})
it.each([undefined,null,'false',0])('rejects a non-boolean pending event %j without clearing the original input protection',async value=>{
 const f=await fixture()
 try{
  const epoch=f.commands.epoch
  f.commands.setInputPending('detail',true,epoch)
  expect(()=>Reflect.apply(f.commands.setInputPending,f.commands,['detail',value,epoch])).toThrow('CONTENT_COMMAND_INPUT_STATE_REQUIRED')
  expect(f.runtime.isDirty).toBe(true);expect(f.commands.canLeave).toBe(false)
  f.commands.cancel(epoch)
 }finally{f.runtime.dispose()}
})
