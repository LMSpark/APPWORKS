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
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import {isRecord} from '@spark-appworks/spark-utils'
registerAllRenderers()
function draftNodes(draft:unknown):unknown[]{
 if(!isRecord(draft)||!Array.isArray(draft['nodes']))throw Error('DRAFT_NODES_REQUIRED')
 return draft['nodes']
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
  columns:[{name:primaryKey,type:'string',isPrimaryKey:true},{name:'projectId',type:'string'},{name:'userId',type:'string'},{name:'draft',type:'object'}],
  views:{default:{},personalDraft:{commitMode:'staged'}}}}})
 const view=ds.getView('WorkingDraft','personalDraft')!,table=new DataSpaceQueryTable({scenarioId,metaName:'WorkingDraft'})
 const row={[primaryKey]:'D',projectId:'P',userId:'U',draft:{nodes,responseChanges:[]}}
 const query=vi.fn(async()=>new DataSpaceQueryContext({identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:primaryKey,data:{Count:1,
  Items:[{...row,lingma_sys_params:{r:[],e:editable?['draft']:[],h:[],m:[],d:false}}]}}})}))
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
 await router.push('/?projectId=P&draftId=D');await router.isReady()
 const previous={...config.global.stubs},stubs={...previous}
 for(const key of ['SparkComponentRenderer','spark-component-renderer','el-table','el-table-column'])delete stubs[key]
 config.global.stubs=stubs
 const errors=vi.fn()
 const wrapper=mount(SparkPageRenderer,{attachTo:document.body,props:{pageRuntime:runtime,...(host?{host}:{}),
  routeSnapshot:{path:'/',fullPath:'/?projectId=P&draftId=D',name:null,params:{},query:{projectId:'P',draftId:'D'},hash:''},onError:errors,onRuntimeError:errors},
  global:{plugins:[router,ElementPlus,VXETable,Spark.createPlugin()]}})
 try{
  await flushPromises()
  expect(errors).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('标书正文编制');expect(wrapper.text()).toContain('实施方案')
  if(hasHost&&!editable)expect(wrapper.text()).toContain('当前草稿仅可查看')
  const identityField=wrapper.findAll('.el-form-item').find(item=>item.text().includes('工作草稿'))
  if(!identityField)throw Error('工作草稿标识未渲染')
  expect(identityField.text().includes('D')||identityField.findAll('input').some(input=>input.element.value==='D')).toBe(true)
  expect(wrapper.findAll('.el-table__body-wrapper tbody tr')).toHaveLength(3)
  await wrapper.findAll('.el-table__body-wrapper tbody tr')[2]!.trigger('click');await flushPromises()
  expect(wrapper.text()).toContain('所选内容')
  const detail=wrapper.findAllComponents({name:'JsonTreeEditor'}).map(editor=>JSON.parse(String(editor.props('modelValue'))))
  if(!editable)expect(detail).toContainEqual({value:nodes[2]})
  expect(query).toHaveBeenCalledTimes(1);expect(save).not.toHaveBeenCalled();expect(runtime.isDirty).toBe(false)
  expect(runtime.getDataSet(scenarioId)).toBe(ds)
  if(editable){
   const button=(label:string)=>wrapper.findAll('button').find(item=>item.text()===label)!
   expect(button('新增逻辑册')).toBeDefined()
   await button('新增逻辑册').trigger('click');await flushPromises()
   expect(draftNodes(view.getEditingRow('D')?.['draft'])).toHaveLength(6)
   expect(draftNodes(view.rows[0]?.['draft'])).toHaveLength(3);expect(runtime.isDirty).toBe(true)
   await expect(runtime.reload()).rejects.toThrow()
   await button('取消本次草稿编辑').trigger('click');await flushPromises()
   expect(draftNodes(view.getEditingRow('D')?.['draft'])).toHaveLength(3);expect(runtime.isDirty).toBe(false)
   await wrapper.findAll('.el-table__body-wrapper tbody tr')[2]!.trigger('click');await flushPromises()
   const text=wrapper.find('input[aria-label="正文"]')
   expect(text.exists()).toBe(true)
   await text.setValue('修改后的正文');await flushPromises()
   expect(draftNodes(view.getEditingRow('D')?.['draft'])[2]).toMatchObject({value:'修改后的正文'})
   expect(draftNodes(view.rows[0]?.['draft'])[2]).toMatchObject({value:'实施方案'})
   await button('取消本次草稿编辑').trigger('click');await flushPromises()
   await wrapper.findAll('.el-table__body-wrapper tbody tr')[2]!.trigger('click');await flushPromises()
   const pendingText=wrapper.find('input[aria-label="正文"]')
   if(!(pendingText.element instanceof HTMLInputElement))throw Error('正文输入不存在')
   pendingText.element.value='尚未确认的文字';await pendingText.trigger('input');await flushPromises()
   expect(view.hasEditingChanges()).toBe(false);expect(runtime.isDirty).toBe(true)
   await expect(runtime.reload()).rejects.toThrow()
   await wrapper.findAll('.el-table__body-wrapper tbody tr')[1]!.trigger('click');await flushPromises()
   expect(wrapper.get('input[aria-label="正文"]').element).toBe(pendingText.element)
   expect(pendingText.element.value).toBe('尚未确认的文字')
   expect(errors).not.toHaveBeenCalled()
   expect(button('新增逻辑册').attributes('disabled')).toBeDefined()
   await button('取消本次草稿编辑').trigger('click');await flushPromises()
   expect(runtime.isDirty).toBe(false)
   await wrapper.findAll('.el-table__body-wrapper tbody tr')[1]!.trigger('click');await flushPromises()
   await button('新增普通表').trigger('click');await flushPromises()
   expect(draftNodes(view.getEditingRow('D')?.['draft'])).toHaveLength(4)
   await wrapper.findAll('.el-table__body-wrapper tbody tr')[3]!.trigger('click');await flushPromises()
   const header=wrapper.find('textarea[aria-label="表头"]')
   expect(header.exists()).toBe(true)
   await header.setValue('["指标","说明"]');await flushPromises()
   expect(draftNodes(view.getEditingRow('D')?.['draft'])[3]).toMatchObject({data:{header:['指标','说明']}})
   await expect(ds.saveChanges()).rejects.toThrow('CONTENT_DRAFT_REMOTE_SAVE_UNAVAILABLE')
   await button('取消本次草稿编辑').trigger('click');await flushPromises()
   expect(draftNodes(view.getEditingRow('D')?.['draft'])).toHaveLength(3)
   expect(save).not.toHaveBeenCalled()
  }
  await view.refresh();await flushPromises()
  expect(wrapper.text()).not.toContain('实施方案')
  expect(errors).not.toHaveBeenCalled()
 }finally{wrapper.unmount();commands?.dispose();runtime.dispose();config.global.stubs=previous}
})
