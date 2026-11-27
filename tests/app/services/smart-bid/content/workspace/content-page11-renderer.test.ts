import {expect,it,vi} from 'vitest'
import {config,flushPromises,mount} from '@vue/test-utils'
import {defineComponent,h} from 'vue'
import {createMemoryHistory,createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import VXETable from 'vxe-table'
import {DataSet} from '@spark-appworks/spark-data'
import {PageRuntime,PageTool} from '@spark-appworks/spark-project-model'
import {Spark,SparkPageRenderer,registerAllRenderers} from '@spark-appworks/spark-component'
import rule from '@/views/features/application/smart-bid/authoring/page11/rule.json'
import script from '@/views/features/application/smart-bid/authoring/page11/script.js?raw'
import css from '@/views/features/application/smart-bid/authoring/page11/style.css?raw'
import {ContentAuthoringCommands} from '@/views/features/application/smart-bid/authoring/ui/entry/content-authoring-commands'
import {createContentAuthoringScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-authoring-script-host'
import {submissionObligationScenarioView} from '@/views/features/application/smart-bid/followup/submission-obligation-reader'
import {DataSpaceQueryTable} from '@spark-appworks/spark-data'
import {DataSpaceQueryContext} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
registerAllRenderers()
function draftNodes(draft:unknown):unknown[]{
 const value=typeof draft==='string'?JSON.parse(draft):draft
 if(!isRecord(value)||!Array.isArray(value['nodes']))throw Error('DRAFT_NODES_REQUIRED')
 return value['nodes']
}

it.each([[false,false,'id'],[false,true,'draftId'],[true,true,'draftId']] as const)(
 'renders the three-file tool with edit permission %s, authenticated host %s and primary key %s',async (editable,hasHost,primaryKey)=>{
 const scenarioId='D3BBA1F0780056C837AC35E9825CAD5A'
 const nodes=[{nodeId:'B',parentId:'P',index:0,type:'document',class:[],value:'',data:{}},
  {nodeId:'C',parentId:'B',index:0,type:'chapter',class:[],value:'',data:{}},
  {nodeId:'H',parentId:'C',index:0,type:'heading',class:[],value:'实施方案',data:{}}]
 const planningRows={
  ContentProject:{id:'P',projectId:'P',activeBaselineId:'ACTIVE',headRevisionId:'CURRENT'},
  SubmissionObligation:{id:'O',projectId:'P',baselineId:'ACTIVE',obligationRef:'O',kind:'DOCUMENT',required:true,
   sourceRef:'SOURCE',allowedDisclosureRefs:['PUBLIC']},
 }
 const planningViews={ContentProject:{selectedProject:{commitMode:'staged' as const,
  scopeFilter:{field:'projectId',operator:'eq' as const,value:{Type:'GetInputParam',ParamName:'projectId'}}}},
  SubmissionObligation:{originalBaselineObligations:submissionObligationScenarioView('id')}}
 const planningTables=Object.fromEntries(Object.entries(planningRows).map(([model,row])=>[model,{
  modelBinding:{modelId:model,modelName:model},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},...planningViews[model as keyof typeof planningViews]},
 }]))
 const ds=DataSet.fromJson({scenarioId,tables:{...planningTables,WorkingDraft:{modelBinding:{modelId:'M',modelName:'WorkingDraft'},
  columns:[{name:primaryKey,type:'string',isPrimaryKey:true},{name:'projectId',type:'string'},{name:'userId',type:'string'},{name:'draft',type:'json'}],
  views:{default:{},personalDraft:{commitMode:'staged'}}}}})
 const view=ds.getView('WorkingDraft','personalDraft')!,table=new DataSpaceQueryTable({scenarioId,metaName:'WorkingDraft'})
 const row={[primaryKey]:'D',projectId:'P',userId:'U',draft:JSON.stringify({nodes,responseChanges:[]})}
 const neighbor={...row,[primaryKey]:'NEIGHBOR',draft:JSON.stringify({nodes:[],responseChanges:[]})}
 const query=vi.fn(async()=>new DataSpaceQueryContext({identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:primaryKey,data:{Count:2,
  Items:[neighbor,row].map(item=>({...item,lingma_sys_params:{r:[],e:editable?['draft']:[],h:[],m:[],d:false}}))}}})}))
 const save=vi.fn(async()=>{throw Error('NO_WRITE')})
 view.queryContext={projectId:'P',currentUserId:'U'};view.bindQueryExecutor({executeQuery:query,save});await view.refresh()
 for(const [model,viewName] of [['ContentProject','selectedProject'],['SubmissionObligation','originalBaselineObligations']] as const){
  const source=ds.getView(model,viewName)
  if(!source)throw Error('TEST_PLANNING_VIEW_REQUIRED')
  if(model==='ContentProject')source.queryContext={projectId:'P'}
  const queryTable=new DataSpaceQueryTable({scenarioId,metaName:model})
  source.bindQueryExecutor({save,executeQuery:async()=>new DataSpaceQueryContext({identity:queryTable.identity,scope:'planning',
   readScope:()=> 'planning',snapshot:queryTable.applyResult({Result:{primaryKeyField:'id',data:{Count:1,Items:[
    {...planningRows[model],lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}},
   ]}}})})})
  if(model==='ContentProject')await source.refresh()
 }
 const tool=new PageTool({pageId:'PAGE11'})
 tool.hydrateFileText('rule.json',JSON.stringify(rule));tool.hydrateFileText('script.js',script);tool.hydrateFileText('style.css',css);tool.markLoaded()
 const runtime=new PageRuntime({tool,scenarioIds:[scenarioId],loadScenario:async()=>ds})
 await runtime.load()
 const binding={runtime,dataViewKey:`${scenarioId}@WorkingDraft@personalDraft`,projectId:'P',draftId:'D',actorUserId:'U',assertCurrent:()=>{},setPending:vi.fn()}
 const commands=hasHost?new ContentAuthoringCommands(binding):undefined
 const host=commands?createContentAuthoringScriptHost(binding,commands):undefined
 if(host){
  const session=host.invoke('content.authoring.connect',undefined,new AbortController().signal)
  expect(session.canEditDraft).toBe(editable)
  const obligations=await session.readVolumePlanningObligations()
  expect(obligations).toMatchObject({baselineId:'ACTIVE',obligations:[{obligationRef:'O',sourceRef:'SOURCE',kind:'DOCUMENT'}]})
  const obligationView=ds.getView('SubmissionObligation','originalBaselineObligations')!
  const obligationConfig=obligationView.queryConfig
  obligationView.queryConfig={...obligationConfig,cacheType:'page'}
  expect(()=>obligations.assertCurrent()).toThrow('BID_SUBMISSION_OBLIGATION_SCOPE')
  await expect(session.readVolumePlanningObligations()).rejects.toThrow('BID_SUBMISSION_OBLIGATION_SCOPE')
  obligationView.queryConfig=obligationConfig
  const head=await session.readCurrentHead()
  expect(head).toMatchObject({headRevisionId:'CURRENT'})
  expect(()=>obligations.assertCurrent()).toThrow()
  await ds.getView('ContentProject','selectedProject')?.refresh()
  expect(()=>head.assertCurrent()).toThrow()
  const project=ds.getView('ContentProject','selectedProject')!
  project.queryContext={projectId:'OTHER'}
  await expect(session.readCurrentHead()).rejects.toThrow('CONTENT_AUTHORING_HEAD_SCOPE')
  await expect(session.readVolumePlanningObligations()).rejects.toThrow('CONTENT_VOLUME_PLAN_SCOPE')
  project.queryContext={projectId:'P'}
  const latestHead=await session.readCurrentHead()
  const queryConfig=project.queryConfig
  project.queryConfig={...queryConfig,cacheType:'page'}
  expect(()=>latestHead.assertCurrent()).toThrow('CONTENT_AUTHORING_HEAD_SCOPE')
  await expect(session.readCurrentHead()).rejects.toThrow('CONTENT_AUTHORING_HEAD_SCOPE')
  await expect(session.readVolumePlanningObligations()).rejects.toThrow('CONTENT_VOLUME_PLAN_SCOPE')
  project.queryConfig=queryConfig
 }
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:defineComponent({render:()=>h('div')})}]})
 const path=hasHost?'/?projectId=P&draftId=D':'/'
 await router.push(path);await router.isReady()
 const previous={...config.global.stubs},stubs={...previous}
 for(const key of ['SparkComponentRenderer','spark-component-renderer','el-table','el-table-column'])delete stubs[key]
 config.global.stubs=stubs
 const errors=vi.fn()
 let unblock:()=>void=()=>{}
 const pending=new Promise<void>(resolve=>{unblock=resolve})
 const delayedHost=host?{...host,async invoke(...args:Parameters<typeof host.invoke>){
  await pending
  return host.invoke(...args)
 }}:undefined
 const wrapper=mount(SparkPageRenderer,{attachTo:document.body,props:{pageRuntime:runtime,...(delayedHost?{host:delayedHost}:{}),
  routeSnapshot:{path:'/',fullPath:path,name:null,params:{},query:hasHost?{projectId:'P',draftId:'D'}:{},hash:''},onError:errors,onRuntimeError:errors},
  global:{plugins:[router,ElementPlus,VXETable,Spark.createPlugin()]}})
 try{
  await flushPromises()
  expect(errors).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('标书正文编制')
  expect(wrapper.text()).not.toContain('正文内容')
  expect(wrapper.text()).not.toContain('取消本次草稿编辑')
  unblock()
  if(!hasHost)return
  await vi.waitFor(()=>expect(wrapper.text()).toContain('实施方案'))
  expect(view.currentRow?.[primaryKey]).toBe('NEIGHBOR')
  expect(wrapper.text()).toContain('逻辑册');expect(wrapper.text()).toContain('章节');expect(wrapper.text()).toContain('标题')
  if(hasHost&&!editable)expect(wrapper.text()).not.toContain('保存全部')
  const identityField=wrapper.findAll('.el-form-item').find(item=>item.text().includes('工作草稿'))
  if(!identityField)throw Error('工作草稿标识未渲染')
  const identityInput=identityField.get('input')
  expect((identityInput.element as HTMLInputElement).value).toBe('当前个人草稿')
  expect(wrapper.findAll('.el-table__body-wrapper tbody tr')).toHaveLength(3)
  await wrapper.findAll('.el-table__body-wrapper tbody tr')[2]!.trigger('click');await flushPromises()
  expect(wrapper.text()).toContain('所选内容')
  const detail=wrapper.findAllComponents({name:'JsonTreeEditor'}).map(editor=>JSON.parse(String(editor.props('modelValue'))))
  expect(detail.some(value=>Array.isArray(value?.nodes)&&value.nodes.some((node:Record<string,unknown>)=>node['nodeId']==='H'))).toBe(true)
  expect(query).toHaveBeenCalledTimes(1);expect(save).not.toHaveBeenCalled();expect(runtime.isDirty).toBe(false)
  expect(runtime.getDataSet(scenarioId)).toBe(ds)
  if(editable){
   const changed=JSON.stringify({nodes:[],responseChanges:[{}]})
   view.updateEditingValue('D','draft',changed)
   view.updateEditingValue('NEIGHBOR','draft',changed)
   await flushPromises()
   const cancel=wrapper.findAll('button').find(item=>item.text()==='取消本次草稿编辑')
   if(!cancel)throw Error('原草稿确认后缺少取消按钮')
   expect(cancel.attributes('disabled')).toBeUndefined()
   await cancel.trigger('click');await flushPromises()
   expect(view.hasEditingChanges('D')).toBe(false)
   expect(view.hasEditingChanges('NEIGHBOR')).toBe(true)
   expect(save).not.toHaveBeenCalled()
   view.discardPendingChanges(['NEIGHBOR'])
  }
  await view.refresh();await flushPromises()
  expect(wrapper.text()).not.toContain('正文内容')
  expect(wrapper.text()).not.toContain('取消本次草稿编辑')
  expect(errors).not.toHaveBeenCalled()
 }finally{unblock();wrapper.unmount();commands?.dispose();runtime.dispose();config.global.stubs=previous}
})
