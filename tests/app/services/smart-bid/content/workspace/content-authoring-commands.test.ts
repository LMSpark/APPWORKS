import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PageRuntimePool} from '../../../../../../packages/spark-app/src/router/page-runtime-pool'
import {createMemoryHistory,createRouter} from 'vue-router'
import {defineComponent,h} from 'vue'
import {ContentAuthoringCommands} from '@/views/features/application/smart-bid/authoring/entry/content-authoring-commands'
import {createContentAuthoringScriptHost} from '@/views/features/application/smart-bid/authoring/entry/content-authoring-script-host'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import {isRecord} from '@spark-appworks/spark-utils'

async function fixture(writable=true,other=false,createRuntime?:(ds:DataSet)=>Promise<PageRuntime>,primaryKey='id'){
 const ds=DataSet.fromJson({scenarioId:'S',tables:{WorkingDraft:{modelBinding:{modelId:'M',modelName:'WorkingDraft'},
  columns:[{name:primaryKey,type:'string',isPrimaryKey:true},{name:'projectId',type:'string'},{name:'userId',type:'string'},{name:'draft',type:'object'}],views:{default:{commitMode:'staged'}}}}})
 const view=ds.getView('WorkingDraft')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'WorkingDraft'})
 const row={[primaryKey]:'D',projectId:'P',userId:'U',draft:{nodes:[],responseChanges:[]}}
 const records=[row,...(other?[{...row,[primaryKey]:'OTHER'}]:[])]
 const query=vi.fn(async()=>new DataSpaceQueryContext({identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:primaryKey,data:{Count:records.length,
  Items:records.map(item=>({...item,lingma_sys_params:{r:[],e:writable?['draft']:[],h:[],m:[],d:false}}))}}})}))
 const save=vi.fn(async()=>{throw Error('NO_SAVE')});view.bindQueryExecutor({executeQuery:query,save});await view.refresh()
 let current=true
 const runtime=createRuntime?await createRuntime(ds):new PageRuntime({pageId:'PAGE11',scenarioIds:['S'],loadScenario:async()=>ds});await runtime.load()
 const pending=vi.fn(),binding={runtime,dataViewKey:'S@WorkingDraft@default',projectId:'P',draftId:'D',actorUserId:'U',
  assertCurrent:()=>{if(!current)throw Error('HOST_STALE')},setPending:pending}
 const commands=new ContentAuthoringCommands(binding)
 return {ds,runtime,view,commands,binding,query,save,pending,expire:()=>{current=false}}
}
const add={action:'addDocument' as const,args:[{documentId:'B',chapterId:'C',headingId:'H',title:'实施方案'}] as [{documentId:string;chapterId:string;headingId:string;title:string}]}
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
