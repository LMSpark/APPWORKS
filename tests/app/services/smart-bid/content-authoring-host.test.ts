import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {DataSet, type DataView, type QueryParams, type DataViewFilterTree} from '@spark-appworks/spark-data'
import {PageTool} from '@spark-appworks/spark-project-model'
import {ContentAuthoringHost, type ContentAuthoringTarget} from '@/views/features/application/smart-bid/authoring/model/content-authoring-host'
import ContentDraftWorkspace from '@/views/features/application/smart-bid/authoring/ui/content-draft-workspace.vue'
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
function fixture(scoped=true,hiddenProject:boolean|(()=>boolean)=false) {
 const ds=DataSet.fromJson({scenarioId:'SPACE',tables:{
  ContentProject:{modelBinding:{modelId:'PM',modelName:'ContentProject'},columns:[{name:'projectId',type:'string',isPrimaryKey:true}],
   views:{default:{},selectedProject:{...(scoped?{scopeFilter:projectScope}:{}),commitMode:'staged'}}},
  WorkingDraft:{modelBinding:{modelId:'DM',modelName:'WorkingDraft'},columns:[
   {name:'draftId',type:'string',isPrimaryKey:true},{name:'projectId',type:'string'},{name:'userId',type:'string'},{name:'draft',type:'object'}],
   views:{default:{},personalDraft:{...(scoped?{scopeFilter:draftScope}:{}),commitMode:'staged'}}},
 }})
 const queries=vi.fn(async(view:DataView,params:QueryParams)=>{
  const model=view.dataTable!.modelBinding!.modelName
  const query=new DataSpaceQueryTable({scenarioId:'SPACE',metaName:model})
  const rows=model==='ContentProject'?[{projectId:params.context!['projectId']}]:[
   {draftId:'D',projectId:params.context!['projectId'],userId:params.context!['currentUserId'],draft:{nodes:[],responseChanges:[]}}]
  return new DataSpaceQueryContext({identity:query.identity,scope:'original',readScope:()=> 'original',snapshot:query.applyResult({Result:{
   primaryKeyField:model==='ContentProject'?'projectId':'draftId',data:{Count:rows.length,Items:rows.map(row=>({...row,
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
