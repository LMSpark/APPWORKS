import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {Spark, SparkPageRenderer, registerAllRenderers} from '@spark-appworks/spark-component'
import {createMemoryHistory,createRouter} from 'vue-router'
import VXETable from 'vxe-table'
import {DataSet, type DataView, type QueryParams, type DataViewFilterTree} from '@spark-appworks/spark-data'
import {PageRuntime,PageTool} from '@spark-appworks/spark-project-model'
import {captureContentAuthoringSession,ContentAuthoringHost, type ContentAuthoringTarget} from '@/views/features/application/smart-bid/authoring/model/content-authoring-host'
import ContentDraftWorkspace from '@/views/features/application/smart-bid/authoring/ui/content-draft-workspace.vue'
import {createPublishedContentAuthoringHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-authoring-script-host'
import {preparePublishedContentAuthoringCall} from '@/views/features/application/smart-bid/authoring/ui/entry/content-authoring-target'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import rule from '@/views/features/application/smart-bid/authoring/page11/rule.json?raw'
import script from '@/views/features/application/smart-bid/authoring/page11/script.js?raw'
import style from '@/views/features/application/smart-bid/authoring/page11/style.css?raw'
import {PageRuntimePool} from '../../../../packages/spark-app/src/router/page-runtime-pool'
import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

const auth = vi.hoisted(() => ({token:'session-1', userId:'U', appId:'APP'}))
const load = vi.hoisted(() => vi.fn())
vi.mock('@/lowcode/lowcode-runtime', () => ({lowcodeApi:{
 session:{get:()=>auth.userId ? {identity:{userId:auth.userId}} : null},
 readRequestScope:()=>({token:auth.token,headers:{'X-AppId':auth.appId}}),
}}))
vi.mock('@/lowcode/data-space/lowcode-data-space-runtime', () => ({loadLowcodeRuntimeScenario:load}))

const target = {applicationId:'APP',pageId:'PAGE',scenarioId:'SPACE',projectId:'P',draftId:'D'}
const param = (name:string) => ({Type:'GetInputParam',ParamName:name})
const projectScope:DataViewFilterTree = {field:'projectId',operator:'eq',value:param('projectId')}
const draftScope:DataViewFilterTree = {logic:'and',filters:[projectScope,{field:'userId',operator:'eq',value:param('currentUserId')}]}
const originalStubs={...config.global.stubs}
let wrapper:VueWrapper|undefined
beforeEach(()=>{auth.token='session-1';auth.userId='U';auth.appId='APP';load.mockReset()})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;config.global.stubs=originalStubs})
function fixture(scoped=true,hiddenProject:boolean|(()=>boolean)=false,draftKey='draftId',scenarioId='SPACE',projectCount=1,
 readDraftAuthor?:(actor:unknown)=>unknown,receipt?:Readonly<Record<string,string>>) {
 const ds=DataSet.fromJson({scenarioId,tables:{
  ContentProject:{modelBinding:{modelId:'PM',modelName:'ContentProject'},columns:[{name:'projectId',type:'string',isPrimaryKey:true}],
   views:{default:{},selectedProject:{...(scoped?{scopeFilter:projectScope}:{}),commitMode:'staged'}}},
  WorkingDraft:{modelBinding:{modelId:'DM',modelName:'WorkingDraft'},columns:[
   {name:draftKey,type:'string',isPrimaryKey:true},{name:'projectId',type:'string'},{name:'userId',type:'string'},{name:'draft',type:'object'}],
   views:{default:{},personalDraft:{...(scoped?{scopeFilter:draftScope}:{}),commitMode:'staged'}}},
  ContentAdoption:{modelBinding:{modelId:'AM',modelName:'ContentAdoption'},
   columns:['id','projectId','candidateRevisionId','requestKey','requestDigest','previewRef','mergeRevisionId','commitCheckRef']
    .map(name=>({name,type:'string',isPrimaryKey:name==='id'})),
   views:{default:{},selectedAdoption:{commitMode:'staged',scopeFilter:{logic:'and',
    filters:['projectId','candidateRevisionId','requestKey'].map(field=>({field,operator:'eq',value:param(field)}))}}}},
  ...(receipt?{SaveReceipt:{modelBinding:{modelId:'RM',modelName:'SaveReceipt'},
   columns:Object.keys(receipt).map(name=>({name,type:'string',isPrimaryKey:name==='id'})),
   views:{default:{},originalSave:{commitMode:'staged' as const,queryConfig:{autoQuery:false},scopeFilter:{logic:'and' as const,
    filters:['projectId','draftId','authorId','requestKey','requestDigest'].map(field=>({field,operator:'eq' as const,value:param(field)}))}}}}}:{}),
 }})
 const queries=vi.fn(async(view:DataView,params:QueryParams)=>{
  const model=view.dataTable!.modelBinding!.modelName
  const query=new DataSpaceQueryTable({scenarioId,metaName:model})
  const rows=model==='SaveReceipt'&&receipt?[receipt]:model==='ContentProject'?[{projectId:params.context!['projectId']}]:
   model==='ContentAdoption'?[{id:'A',projectId:params.context!['projectId'],candidateRevisionId:'C',requestKey:'K',
    requestDigest:'DIGEST',previewRef:'PV',mergeRevisionId:'R',commitCheckRef:null}]:[
   {[draftKey]:'D',projectId:params.context!['projectId'],userId:readDraftAuthor?readDraftAuthor(params.context!['currentUserId']):
    params.context!['currentUserId'],draft:{nodes:[],responseChanges:[]}}]
  return new DataSpaceQueryContext({identity:query.identity,scope:'original',readScope:()=> 'original',snapshot:query.applyResult({Result:{
   primaryKeyField:model==='ContentProject'?'projectId':model==='ContentAdoption'||model==='SaveReceipt'?'id':draftKey,data:{Count:model==='ContentProject'?projectCount:rows.length,Items:rows.map(row=>({...row,
    lingma_sys_params:{r:[],e:['draft'],h:model==='ContentProject'&&(typeof hiddenProject==='function'?hiddenProject():hiddenProject)?['projectId']:[],m:[],d:false}}))}}})})
 })
 const save=vi.fn(async()=>{throw Error('UNEXPECTED_REMOTE_WRITE')})
 for(const table of Object.values(ds.tables))for(const view of Object.values(table.views))view.bindQueryExecutor({executeQuery:queries,save})
 load.mockResolvedValueOnce(ds)
 return {ds,queries,save}
}
it('loads the original views with fixed project and trusted session-author inputs',async()=>{
 const f=fixture(),host=new ContentAuthoringHost(),binding=await host.open(target)
 expect(binding.runtime.getDataSet('SPACE')).toBe(f.ds)
 expect(binding.dataViewKey).toBe('SPACE@WorkingDraft@personalDraft')
 expect(binding.actorUserId).toBe('U')
 expect(f.queries).toHaveBeenCalledTimes(2)
 for(const [,params] of f.queries.mock.calls)expect(params.context).toMatchObject({projectId:'P',currentUserId:'U'})
 const filters=f.queries.mock.calls.map(([,params])=>JSON.stringify(params.filter))
 expect(filters.join(' ')).toContain('projectId')
 expect(filters.join(' ')).toContain('userId')
 binding.assertCurrent();host.close()
})
it('rejects a partial project result even when the only loaded row matches the requested project',async()=>{
 const f=fixture(true,false,'draftId','SPACE',2),host=new ContentAuthoringHost()
 try{
  await expect(host.open(target)).rejects.toThrow('CONTENT_AUTHORING_TARGET_UNAVAILABLE')
  expect(host.binding).toBeUndefined()
  expect(f.save).not.toHaveBeenCalled()
 }finally{host.close()}
})
it('reads adoption with its original project binding and revokes evidence on session change',async()=>{
 const f=fixture(),host=new ContentAuthoringHost(),binding=await host.open(target)
 const request={candidateRevisionId:'C',requestKey:'K',requestDigest:'DIGEST',previewRef:'PV'}
 try{
  const result=await binding.readOriginalAdoption(request)
  expect(result).toMatchObject({recordFound:true,adoptionRef:'A',mergeRevisionId:'R',commitCheckRef:null,requiresOriginalResultEvidence:true})
  expect(f.queries.mock.calls.at(-1)?.[1].context).toMatchObject({projectId:'P',candidateRevisionId:'C',requestKey:'K'})
  auth.token='session-2'
  expect(()=>result.assertCurrent()).toThrow()
  await expect(binding.readOriginalAdoption(request)).rejects.toThrow()
  expect(f.queries).toHaveBeenCalledTimes(3)
  expect(f.save).not.toHaveBeenCalled()
 }finally{host.close()}
})
it('binds the supplied runtime without taking ownership of it',async()=>{
 const {ds}=fixture()
 const runtime=new PageRuntime({pageId:target.pageId,scenarioIds:[target.scenarioId],
  scenarioInputs:captureContentAuthoringSession(target).scenarioInputs,loadScenario:async()=>ds})
 await runtime.load()
 const host=new ContentAuthoringHost(runtime)
 try{
  const binding=await host.open(target)
  expect(binding.runtime).toBe(runtime)
  expect(load).not.toHaveBeenCalled()
  host.close()
  expect(runtime.isLoaded).toBe(true)
  expect(()=>binding.assertCurrent()).toThrow('CONTENT_AUTHORING_STALE')
 }finally{runtime.dispose()}
})
it('connects the published script to the original runtime only once per load',async()=>{
 const {ds,queries}=fixture(true,false,'id')
 const session=captureContentAuthoringSession(target)
 expect(Object.isFrozen(session.scenarioInputs)).toBe(true)
 expect(Object.isFrozen(session.scenarioInputs[target.scenarioId])).toBe(true)
 const runtime=new PageRuntime({pageId:target.pageId,scenarioIds:[target.scenarioId],
  scenarioInputs:session.scenarioInputs,loadScenario:async()=>ds})
 try{
  const host=createPublishedContentAuthoringHost(runtime,target,{assertSession:session.assertCurrent})
  expect(host.runtime).toBe(runtime)
  await runtime.load()
  const controller=new AbortController()
  await expect(host.invoke('content.authoring.connect',undefined,AbortSignal.abort())).rejects.toThrow('CONTENT_PAGE_RENDER_STALE')
  expect(queries).not.toHaveBeenCalled()
  const connect=()=>host.invoke('content.authoring.connect',undefined,controller.signal)
  const [first,second]=await Promise.all([connect(),connect()])
  first.assertCurrent();second.assertCurrent()
  expect(queries).toHaveBeenCalledTimes(2)
  const originalSave={requestKey:'REQ',requestDigest:'a'.repeat(64),contentDigest:'b'.repeat(64),expectedDraftVersion:'V1'}
  await expect(first.readOriginalSave(originalSave)).rejects.toThrow('CONTENT_DRAFT_SAVE_RECEIPT_VIEW_REQUIRED')
  const draft=runtime.resolveView('SPACE@WorkingDraft@personalDraft')!
  const pendingSave=vi.spyOn(draft,'hasUnconfirmedSave','get').mockReturnValue(true)
  try{
   expect(()=>first.assertCurrent()).toThrow('CONTENT_COMMAND_MUTATING')
   const recovery=await connect()
   await expect(recovery.readOriginalSave(originalSave)).rejects.toThrow('CONTENT_DRAFT_SAVE_RECEIPT_VIEW_REQUIRED')
  }finally{pendingSave.mockRestore()}
  expect(queries).toHaveBeenCalledTimes(2)
  controller.abort()
  expect(()=>first.assertCurrent()).toThrow('CONTENT_PAGE_RENDER_STALE')
  await expect(first.readOriginalSave(originalSave)).rejects.toThrow('CONTENT_PAGE_RENDER_STALE')
 }finally{runtime.dispose()}
})
it.each([false,true])('loads the actual authoring page and original receipt (pending save: %s)',async(savePending)=>{
 registerAllRenderers()
 const stubs={...originalStubs}
 for(const key of ['SparkComponentRenderer','spark-component-renderer','el-table','el-table-column'])delete stubs[key]
 config.global.stubs=stubs
 const applicationId='D8490EC99436A8B9AFDE205BE3153802',scenarioId='D3BBA1F0780056C837AC35E9825CAD5A'
 auth.appId=applicationId
 const requestDigest='a'.repeat(64),contentDigest=await hashCanonicalSnapshotText(canonicalSnapshotValue({nodes:[],responseChanges:[]}))
 const receipt={id:'RECEIPT',projectId:'P',draftId:'D',authorId:'U',requestKey:'Q',requestDigest,contentDigest,
  expectedDraftVersion:'V1',state:savePending?'UNKNOWN':'SAVED',draftVersion:'V2',receiptRef:'RC'}
 const {ds,queries,save}=fixture(true,false,'id',scenarioId,1,undefined,receipt)
 const entry={nodeId:'fixture-navigation',pageId:'fixture-tool',receiptDataViewKey:`${scenarioId}@SaveReceipt@originalSave`}
 const tool={pageId:entry.pageId,projectId:applicationId}
 const path=`/apps/${applicationId}/__page/${entry.nodeId}`
 const call=preparePublishedContentAuthoringCall({path,
  meta:{type:'config-page',nodeId:entry.nodeId,pageId:entry.pageId,blueprintScenarioId:scenarioId,tool},
  query:{scenarioId,projectId:'P',draftId:'D'}},entry)
 if(!call)throw Error('TEST_PUBLISHED_AUTHORING_CALL_REQUIRED')
 const wrongRuntime=new PageRuntime({pageId:'OTHER',scenarioIds:[scenarioId],loadScenario:async()=>ds})
 try{expect(()=>call.createHost(wrongRuntime)).toThrow('CONTENT_AUTHORING_PUBLICATION_RUNTIME_CONFLICT')}
 finally{wrongRuntime.dispose()}
 const wrongAuthor=new PageRuntime({pageId:entry.pageId,scenarioIds:[scenarioId],loadScenario:async()=>ds,
  scenarioInputs:{[scenarioId]:{projectId:'P',currentUserId:'OTHER'}}})
 try{expect(()=>call.createHost(wrongAuthor)).toThrow('CONTENT_AUTHORING_PUBLICATION_RUNTIME_CONFLICT')}
 finally{wrongAuthor.dispose()}
 const router=createRouter({history:createMemoryHistory(),routes:[{path,component:SparkPageRenderer,
  meta:{type:'config-page',nodeId:entry.nodeId,pageId:entry.pageId,blueprintScenarioId:scenarioId,tool}}]})
 const readPageFiles=vi.fn(async(commands:ReadonlyArray<{fileName:string}>)=>
  commands.map(({fileName})=>fileName==='rule.json'?rule:fileName==='script.js'?script:style))
 const pool=new PageRuntimePool({pageComponent:SparkPageRenderer,readPageFile:undefined,readPageFiles,
  preparePageCall:route=>preparePublishedContentAuthoringCall(route,entry),
  loadScenario:async(input)=>{
   expect(input).toEqual({projectId:applicationId,scenarioId})
   return ds
  },
  readNavTree:()=>({title:'Fixture',childPlacement:'header',items:[{
   id:entry.nodeId,title:'Fixture tool',itemKind:'page',tool,blueprintScenarioId:scenarioId,
  }]}),
  refreshRoutes:async()=>{},
 })
 try{
  await router.push({path,query:{scenarioId,projectId:'P',draftId:'D',saveRequestKey:'Q',saveRequestDigest:requestDigest,
   saveContentDigest:contentDigest,saveExpectedDraftVersion:'V1'}})
  const route=router.currentRoute.value, runtime=pool.getPageRuntime(route), component=pool.getPageRuntimeView(route)
  if(!runtime||!component)throw Error('Missing pooled authoring page')
  const drafts=ds.getView('WorkingDraft','personalDraft')!
  const saveState=vi.spyOn(drafts,'hasUnconfirmedSave','get').mockImplementation(()=>savePending&&drafts.rows.length>0)
  wrapper=mount(component,{global:{plugins:[router,ElementPlus,VXETable,Spark.createPlugin()]}})
  try{
   if(savePending){
    await vi.waitFor(()=>expect(wrapper?.text()).toContain('原保存结果未知'),{timeout:4000})
    receipt.state='SAVED'
    const refresh=wrapper.findAll('button').find(item=>item.text()==='重查原保存结果')
    if(!refresh)throw Error('TEST_REFRESH_RECEIPT_BUTTON_REQUIRED')
    await refresh.trigger('click')
   }
   await vi.waitFor(()=>expect(wrapper?.text()).toContain('原请求已保存草稿版 V2，回执 RC'),{timeout:4000})
   if(savePending)expect(wrapper.text()).not.toContain('当前草稿与原保存内容一致')
   else expect(wrapper.text()).toContain('当前草稿与原保存内容一致')
  }finally{saveState.mockRestore()}
  if(savePending){
   expect(queries).toHaveBeenCalledTimes(4)
   expect(queries.mock.calls.at(-1)?.[1].context).toMatchObject({projectId:'P',draftId:'D',authorId:'U',requestKey:'Q',requestDigest})
   expect(save).not.toHaveBeenCalled()
   return
  }
  expect(wrapper.text()).toContain('标书正文编制')
  expect(wrapper.text()).toContain('新增逻辑册')
  expect(runtime.getDataSet(scenarioId)).toBe(ds)
  expect(pool.getPageRuntime(route)).toBe(runtime)
  expect(readPageFiles).toHaveBeenCalledOnce()
  expect(queries).toHaveBeenCalledTimes(3)
  expect(queries.mock.calls.at(-1)?.[1].context).toMatchObject({projectId:'P',draftId:'D',authorId:'U',requestKey:'Q',requestDigest})
  expect(load).not.toHaveBeenCalled()
  const button=(label:string)=>wrapper?.findAll('button').find(item=>item.text()===label)
  const refreshReceipt=button('重查原保存结果')
  if(!refreshReceipt)throw Error('TEST_REFRESH_RECEIPT_BUTTON_REQUIRED')
  await refreshReceipt.trigger('click')
  await vi.waitFor(()=>{
   expect(queries).toHaveBeenCalledTimes(4)
   expect(wrapper?.text()).toContain('原请求已保存草稿版 V2，回执 RC。当前草稿与原保存内容一致。')
  })
  expect(queries.mock.calls.at(-1)?.[1].context).toMatchObject({projectId:'P',draftId:'D',authorId:'U',requestKey:'Q',requestDigest})
  expect(save).not.toHaveBeenCalled()
  await button('新增逻辑册')!.trigger('click');await flushPromises()
  await vi.waitFor(()=>expect(drafts.getEditingRow('D')?.['draft']).not.toEqual(drafts.rows[0]?.['draft']))
  expect(wrapper.text()).toContain('原请求已保存草稿版 V2，回执 RC')
  expect(wrapper.text()).not.toContain('当前草稿与原保存内容一致')
  expect(()=>pool.closePageRuntime(runtime.instanceId)).toThrow('未保存')
  await vi.waitFor(()=>{
   const cancel=button('取消本次草稿编辑')
   expect(cancel).toBeDefined()
   expect(cancel?.attributes('disabled')).toBeUndefined()
  })
  await button('取消本次草稿编辑')!.trigger('click');await flushPromises()
  await vi.waitFor(()=>expect(drafts.getEditingRow('D')?.['draft']).toEqual(drafts.rows[0]?.['draft']))
  expect(save).not.toHaveBeenCalled()
  pool.closePageRuntime(runtime.instanceId)
  expect(runtime.destroyed).toBe(true)
 }finally{
  wrapper?.unmount();wrapper=undefined
  if(!ds.destroyed)ds.getView('WorkingDraft','personalDraft')?.discardEditingRows()
  pool.disposePageRuntimes()
 }
})
it('invalidates the binding when the runtime no longer resolves the original draft view',async()=>{
 fixture()
 const host=new ContentAuthoringHost(),binding=await host.open(target)
 const resolve=binding.runtime.resolveView.bind(binding.runtime)
 const lookup=vi.spyOn(binding.runtime,'resolveView').mockImplementation(key=>
  key===binding.dataViewKey?undefined:resolve(key))
 try{expect(()=>binding.assertCurrent()).toThrow('CONTENT_AUTHORING_STALE')}
 finally{lookup.mockRestore();host.close()}
})
it('materializes the explicit three-file tool in the same authenticated runtime and rejects a mismatched tool identity',async()=>{
 const f=fixture(),host=new ContentAuthoringHost(),tool=new PageTool({pageId:target.pageId})
 tool.hydrateFileText('rule.json',JSON.stringify([{type:'r-form',props:{dataViewKey:'SPACE@WorkingDraft@personalDraft'}}]))
 tool.hydrateFileText('script.js','function __init__() {}');tool.hydrateFileText('style.css','');tool.markLoaded()
 const binding=await host.open(target,tool)
 expect(binding.runtime.tool).toBe(tool)
 expect(binding.runtime.materialize().rule[0]?.props?.['dataViewKey']).toBe('SPACE@WorkingDraft@personalDraft')
 expect(binding.runtime.getDataSet('SPACE')).toBe(f.ds);expect(f.queries).toHaveBeenCalledTimes(2)
 host.close()
 const wrong=new PageTool({pageId:'OTHER'});wrong.markLoaded()
 await expect(host.open(target,wrong)).rejects.toThrow('CONTENT_AUTHORING_TOOL_IDENTITY_REQUIRED')
})
it('keeps the same tool instance stable and blocks replacing it while editor input is pending',async()=>{
 fixture();const host=new ContentAuthoringHost(),tool=new PageTool({pageId:target.pageId});tool.markLoaded()
 const first=await host.open(target,tool)
 expect(await host.open(target,tool)).toBe(first)
 const replacement=new PageTool({pageId:target.pageId});replacement.markLoaded()
 first.setPending(true)
 await expect(host.open(target,replacement)).rejects.toThrow('CONTENT_AUTHORING_PENDING')
 first.assertCurrent();expect(first.runtime.tool).toBe(tool)
 first.setPending(false);host.close()
 await expect(host.open(target,new PageTool({pageId:target.pageId}))).rejects.toThrow('CONTENT_AUTHORING_TOOL_IDENTITY_REQUIRED')
})
it('rejects missing identity and unscoped definitions before any business query',async()=>{
 const f=fixture(false),host=new ContentAuthoringHost()
 await expect(host.open(target)).rejects.toThrow('CONTENT_AUTHORING_SCOPE_REQUIRED')
 expect(f.queries).not.toHaveBeenCalled()
 auth.userId=''
 await expect(host.open(target)).rejects.toThrow('CONTENT_AUTHORING_IDENTITY_REQUIRED')
 expect(load).toHaveBeenCalledTimes(1)
})
it('connects revision reads to the same host guard and refuses incomplete selections before queries',async()=>{
 const f=fixture(),host=new ContentAuthoringHost(),binding=await host.open(target)
 await expect(binding.readRevisions({candidateRevisionId:'',expectedHead:null})).rejects.toThrow('CONTENT_REVISION_IDENTITY_REQUIRED')
 await expect(binding.readNodeVersion({nodeId:'N',nodeHash:''})).rejects.toThrow('CONTENT_NODE_VERSION_IDENTITY_REQUIRED')
 expect(f.queries).toHaveBeenCalledTimes(2)
 host.close()
 await expect(binding.readRevisions({candidateRevisionId:'C',expectedHead:null})).rejects.toThrow('CONTENT_AUTHORING_STALE')
 await expect(binding.readNodeVersion({nodeId:'N',nodeHash:'a'.repeat(64)})).rejects.toThrow('CONTENT_AUTHORING_STALE')
 expect(f.queries).toHaveBeenCalledTimes(2)
})
it('refuses a project whose identity is hidden even when its raw value matches the selected project',async()=>{
 const f=fixture(true,true),host=new ContentAuthoringHost()
 await expect(host.open(target)).rejects.toThrow('CONTENT_AUTHORING_TARGET_UNAVAILABLE')
 expect(host.binding).toBeUndefined()
 expect(f.save).not.toHaveBeenCalled()
})
it('invalidates the binding when a refreshed project identity is no longer readable',async()=>{
 let hidden=false
 const f=fixture(true,()=>hidden),host=new ContentAuthoringHost(),binding=await host.open(target)
 hidden=true
 await f.ds.getView('ContentProject','selectedProject')!.refresh()
 expect(()=>binding.assertCurrent()).toThrow('CONTENT_AUTHORING_STALE')
 expect(f.save).not.toHaveBeenCalled()
 host.close()
})
it('revokes the opened draft binding when the returned author changes under the same draft key',async()=>{
 let draftAuthor='U'
 const f=fixture(true,false,'draftId','SPACE',1,()=>draftAuthor)
 const host=new ContentAuthoringHost(),binding=await host.open(target)
 try{
  draftAuthor='OTHER'
  await f.ds.getView('WorkingDraft','personalDraft')!.refresh()
  expect(()=>binding.assertCurrent()).toThrow('CONTENT_AUTHORING_STALE')
  expect(f.save).not.toHaveBeenCalled()
 }finally{host.close()}
})
it('revokes the editing binding after a formal refresh fails',async()=>{
 const f=fixture(),host=new ContentAuthoringHost(),binding=await host.open(target)
 try{
  const view=f.ds.getView('WorkingDraft','personalDraft')!
  f.queries.mockRejectedValueOnce(Error('DRAFT_QUERY_FAILED'))
  await view.refresh()
  expect(view.loadingError).toBeTruthy()
  expect(()=>binding.assertCurrent()).toThrow('CONTENT_AUTHORING_STALE')
  expect(f.save).not.toHaveBeenCalled()
 }finally{host.close()}
})
it('rejects OR scope and a route-supplied author cannot replace the authenticated author',async()=>{
 const f=fixture(),view=f.ds.getView('WorkingDraft','personalDraft')!
 view.configure({scopeFilter:{logic:'or',filters:[projectScope,{field:'userId',operator:'eq',value:param('currentUserId')}]}})
 const supplied={...target,actorUserId:'OTHER'}
 await expect(new ContentAuthoringHost().open(supplied)).rejects.toThrow('CONTENT_AUTHORING_SCOPE_REQUIRED')
 expect(f.queries).not.toHaveBeenCalled()
})
it('keeps unsaved input and original row edits when a target switch is refused',async()=>{
 const f=fixture(),host=new ContentAuthoringHost(),binding=await host.open(target)
 binding.setPending(true)
 await expect(host.open({...target,projectId:'OTHER'})).rejects.toThrow('CONTENT_AUTHORING_PENDING')
 expect(binding.runtime.destroyed).toBe(false)
 expect(load).toHaveBeenCalledTimes(1)
 binding.setPending(false)
 const view=f.ds.getView('WorkingDraft','personalDraft')!
 view.updateEditingValue('D','draft',{nodes:[],responseChanges:[{note:'local'}]})
 expect(()=>host.close()).toThrow('CONTENT_AUTHORING_PENDING')
 expect(view.hasEditingChanges('D')).toBe(true)
 view.discardEditingRows(['D'])
 fixture()
 const next=await host.open({...target,projectId:'OTHER'})
 expect(next.runtime).not.toBe(binding.runtime)
 expect(binding.runtime.destroyed).toBe(true)
 expect(()=>binding.assertCurrent()).toThrow('CONTENT_AUTHORING_STALE')
 binding.setPending(true)
 expect(host.hasPending).toBe(false)
 host.close()
})
it('invalidates old callbacks on session or query-context changes while retaining local edits',async()=>{
 const f=fixture(),host=new ContentAuthoringHost(),binding=await host.open(target)
 const view=f.ds.getView('WorkingDraft','personalDraft')!
 view.updateEditingValue('D','draft',{nodes:[],responseChanges:[{note:'retained'}]})
 auth.token='session-2'
 expect(()=>binding.assertCurrent()).toThrow('CONTENT_AUTHORING_STALE')
 await expect(host.open(target)).rejects.toThrow('CONTENT_AUTHORING_PENDING')
 expect(view.hasEditingChanges('D')).toBe(true)
 auth.token='session-1';view.queryContext={...view.queryContext,projectId:'OTHER'}
 expect(()=>binding.assertCurrent()).toThrow('CONTENT_AUTHORING_STALE')
})
it('cannot publish a late loading runtime after a new target becomes current',async()=>{
 const first=fixture(),second=fixture()
 let resolve!: (ds:DataSet)=>void
 load.mockReset().mockImplementationOnce(()=>new Promise<DataSet>(done=>{resolve=done})).mockResolvedValueOnce(second.ds)
 const host=new ContentAuthoringHost(),late=host.open(target)
 const rejected=expect(late).rejects.toThrow()
 const current=await host.open({...target,projectId:'NEXT'})
 resolve(first.ds);await rejected
 expect(host.binding).toBe(current)
 expect(current.runtime.destroyed).toBe(false)
 expect(first.queries).not.toHaveBeenCalled()
 host.close()
})
it('captures target values instead of retaining a caller-owned mutable object',async()=>{
 fixture()
 const host=new ContentAuthoringHost(),mutable={...target},binding=await host.open(mutable)
 mutable.projectId='REPLACED'
 expect(binding.projectId).toBe('P')
 expect(()=>binding.assertCurrent()).not.toThrow()
 host.close()
})
it('refuses immediate draft persistence and detects a weakened scope after load',async()=>{
 const f=fixture(),view=f.ds.getView('WorkingDraft','personalDraft')!
 view.configure({commitMode:'immediate'})
 await expect(new ContentAuthoringHost().open(target)).rejects.toThrow('CONTENT_AUTHORING_SCOPE_REQUIRED')
 expect(f.queries).not.toHaveBeenCalled()
 const next=fixture(),host=new ContentAuthoringHost(),binding=await host.open(target)
 next.ds.getView('WorkingDraft','personalDraft')!.configure({scopeFilter:{field:'projectId',operator:'eq',value:param('projectId')}})
 expect(()=>binding.assertCurrent()).toThrow('CONTENT_AUTHORING_STALE')
 host.close()
})
it('takes the author from authentication and rejects an application mismatch before loading',async()=>{
 fixture()
 const host=new ContentAuthoringHost(),supplied={...target,actorUserId:'ROUTE_USER'}
 const binding=await host.open(supplied)
 expect(binding.actorUserId).toBe('U')
 host.close();load.mockClear();auth.appId='OTHER_APP'
 await expect(host.open(target)).rejects.toThrow('CONTENT_AUTHORING_IDENTITY_REQUIRED')
 expect(load).not.toHaveBeenCalled()
})
it('does not let an invalidated input callback clear pending and destroy unsaved input',async()=>{
 fixture()
 const host=new ContentAuthoringHost(),binding=await host.open(target)
 binding.setPending(true);auth.token='replaced'
 binding.setPending(false)
 expect(host.hasPending).toBe(true)
 expect(()=>host.close()).toThrow('CONTENT_AUTHORING_PENDING')
 expect(binding.runtime.destroyed).toBe(false)
})
it('rejects missing required target keys without withdrawing the current clean binding',async()=>{
 fixture()
 const host=new ContentAuthoringHost(),binding=await host.open(target)
 const missing=Object.fromEntries(Object.entries(target).filter(([key])=>key!=='pageId')) as ContentAuthoringTarget
 await expect(host.open(missing)).rejects.toThrow('CONTENT_AUTHORING_IDENTITY_REQUIRED')
 expect(host.binding).toBe(binding)
 binding.assertCurrent();host.close()
})
it('hands its original binding to the standard draft workspace, whose cancel keeps the host safe to close',async()=>{
 registerAllRenderers()
 const f=fixture(),host=new ContentAuthoringHost(),binding=await host.open(target)
 const stubs={...originalStubs}
 for(const key of ['SparkComponentRenderer','spark-component-renderer','el-table','el-table-column'])delete stubs[key]
 config.global.stubs=stubs
 wrapper=mount(ContentDraftWorkspace,{attachTo:document.body,props:{runtime:binding.runtime,dataViewKey:binding.dataViewKey,
  projectId:binding.projectId,draftId:binding.draftId,actorUserId:binding.actorUserId,assertCurrent:binding.assertCurrent,onPending:binding.setPending},
  global:{plugins:[ElementPlus,Spark.createPlugin()]}})
 await flushPromises()
 const view=f.ds.getView('WorkingDraft','personalDraft')!
 view.updateEditingValue('D','draft',{nodes:[],responseChanges:[{note:'local'}]});await flushPromises()
 expect(host.hasPending).toBe(true)
 await expect(f.ds.saveChanges()).rejects.toThrow('CONTENT_DRAFT_REMOTE_SAVE_UNAVAILABLE')
 expect(f.save).not.toHaveBeenCalled()
 await wrapper.get('button[data-action="cancel-content-draft"]').trigger('click');await flushPromises()
 expect(view.hasEditingChanges('D')).toBe(false)
 expect(host.hasPending).toBe(false)
 wrapper.unmount();wrapper=undefined;host.close()
 expect(binding.runtime.destroyed).toBe(true)
})
