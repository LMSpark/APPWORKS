import {afterEach,expect,it,vi} from 'vitest'
import {config,flushPromises,mount} from '@vue/test-utils'
import {defineComponent,h} from 'vue'
import {createMemoryHistory,createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {DataSet,DataSpaceQueryContext,DataSpaceQueryTable,bindDataSetCommandSubmit,ensureDataSetResourceView,type DataRow} from '@spark-appworks/spark-data'
import {PageRuntime,PageTool} from '@spark-appworks/spark-project-model'
import {Spark,SparkPageRenderer,registerAllRenderers} from '@spark-appworks/spark-component'
import {preparePublishedSmartBidPageCall} from '@/views/features/application/smart-bid/authoring/ui/entry/publication/smart-bid-page-call'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {contentSubmissionScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-scenario-views'
import type {AiAgentTurnBridgeOptions} from '@/services/ai/ai-turn-bridge'
import type {AiAgentTurnCallbacks} from '@spark-appworks/spark-ai/agent'
import * as page19Target from '@/views/features/application/smart-bid/authoring/ui/entry/content-review-target'
import * as page19ActionSource from '@/views/features/application/smart-bid/authoring/ui/entry/publication/smart-bid-action-source'
import {prepareConfigurationRelease} from '@/services/smart-bid/content/references/configuration/configuration-release-decision'

const app = 'D8490EC99436A8B9AFDE205BE3153802'
const state=vi.hoisted(()=>({script:'',sent:false,mode:'',forwarded:vi.fn()}))
vi.mock('@/platform-adapters/lowcode-runtime',()=>({lowcodeApi:{
 session:{get:()=>({identity:{userId:'FIXTURE_USER'}})},readRequestScope:()=>({
  token:'FIXTURE_SESSION',headers:{'X-AppId':'D8490EC99436A8B9AFDE205BE3153802'},
 }),
}}))
vi.mock('@/services/ai/ai-turn-bridge',()=>({
 createAiAgentTurnCallbacks:(options:AiAgentTurnBridgeOptions={})=>{
  const callbacks:AiAgentTurnCallbacks={
   prepareSession:async()=>undefined,
   executeTurn:async input=>{
    if(state.sent)return {text:'settled',toolCalls:[]}
    state.sent=true
    options.onAccepted?.({sessionId:'SSE-SESSION',turnId:'SSE-TURN',localTurnId:input.turn.turnId})
    if(state.mode==='interrupted')throw Error('LOCAL_TURN_INTERRUPTED')
    if(state.mode==='empty')return {text:'settled without action',toolCalls:[]}
    return {text:'',toolCalls:[{id:'CALL',type:'function',function:{
     name:'model_script',arguments:JSON.stringify({script:state.script}),
    }}]}
   },
   appendMessages:async input=>{state.forwarded(input.messages)},
  }
  return callbacks
 },
}))
afterEach(()=>{vi.unstubAllGlobals();state.sent=false;state.forwarded.mockReset()})

const cases=[
 {title:'制件与审定',directory:'authoring/page12',action:'提交签后件登记',success:'签后件登记已提交',operationId:'41',
  prompt:'登记制作完成的文件',inputs:{record:{selectionRef:'ORIGINAL'}},query:{signedRegistrationRef:'ORIGINAL'}},
 {title:'签署与递交',directory:'authoring/page13',action:'提交冻结',success:'交付选件冻结已提交',operationId:'48',
  prompt:'冻结交付清单',inputs:{selectionRef:'ORIGINAL'},query:{freezeSelectionRef:'ORIGINAL'}},
 {title:'任务与问题',directory:'collaboration/tasks/page15',action:'提交问题或检查覆盖登记',success:'问题登记已提交',operationId:'43',
  prompt:'登记问题',inputs:{checkRef:'CHECK'},query:{findingRegistrationKey:'ORIGINAL',findingCheckRef:'CHECK'}},
]

it.each(cases.flatMap(page=>['empty','interrupted','mismatched','confirmed'].map(mode=>({page,mode}))))(
 'publishes the real $page.title action message only with an original receipt for $mode',async({page,mode})=>{
  registerAllRenderers()
  state.mode=mode
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{
   const href=input instanceof Request?input.url:String(input)
   const pathname=new URL(href,globalThis.location.href).pathname
   if(!pathname.startsWith('/dts-class-model/'))throw Error('External fetch refused by local fixture')
   return new Response((await readFile(resolve('generated',pathname.slice(1)))).toString('utf8'),{
    headers:{'Content-Type':'application/json'},
   })
  }))
  const scenarioId='SPACE',pageId=page.directory==='authoring/page13'?'smart-bid-authoring-page13':'TOOL'
  const dataSet=DataSet.fromJson({scenarioId,tables:{}})
  const view=ensureDataSetResourceView({dataSet,tableName:'SmartBidAction',resource:{resourceType:'command',resourceId:'smart-bid:action'},
   columns:[{name:'commandId',primary:true},...['operationId','registrationId','businessInstanceId','runtimeInstanceId','requestKey','prompt','receiptRef']
    .map(name=>({name})),{name:'inputs',type:'json'}]})
  const submit=vi.fn(async row=>({...row,receiptRef:'RECEIPT',
   ...(mode==='mismatched'?{requestKey:'DIFFERENT-REQUEST'}:{})}))
  bindDataSetCommandSubmit(view,{resource:{resourceType:'command',resourceId:'smart-bid:action'},
   guard:()=>{},inputFields:['operationId','registrationId','businessInstanceId','runtimeInstanceId','requestKey','prompt','inputs'],
   createKey:()=> 'ORIGINAL-COMMAND',submit,verify:async()=>undefined})
  await view.refresh()
  const tool=new PageTool({pageId})
  for(const filename of ['rule.json','script.js','style.css'] as const){
   const content=await readFile(resolve('src/views/features/application/smart-bid',page.directory,filename),'utf8')
   tool.hydrateFileText(filename,content)
  }
  tool.markLoaded()
  const path=`/apps/${app}/fixture`
  const query={projectId:'PROJECT',scenarioId,...page.query}
  const entry=preparePublishedSmartBidPageCall({path,query,meta:{
   title:page.title,type:'config-page',nodeId:'NODE',pageId,blueprintScenarioId:scenarioId,
   tool:{projectId:app,pageId},
  }})
  if(!entry)throw Error('Missing published SmartBid action host')
  const runtime=new PageRuntime({tool,scenarioIds:[scenarioId],mainScenarioId:scenarioId,
   scenarioInputs:entry.scenarioInputs,loadScenario:async()=>dataSet})
  await runtime.load()
  const host=entry.createHost(runtime)
  state.script=`return await this.dispatchOperation(${JSON.stringify({operationId:page.operationId,
   registrationId:'SmartBidOperationModule',businessInstanceId:'PROJECT',runtimeInstanceId:runtime.call.instanceId,
   requestKey:'ORIGINAL',prompt:page.prompt,inputs:page.inputs})})`
  const router=createRouter({history:createMemoryHistory(),routes:[{path,component:defineComponent({render:()=>h('div')})}]})
  await router.push({path,query})
  await router.isReady()
  const previous={...config.global.stubs},stubs={...previous}
  for(const key of ['SparkComponentRenderer','spark-component-renderer','el-button'])delete stubs[key]
  config.global.stubs=stubs
  const messages={success:vi.fn(),error:vi.fn(),warning:vi.fn(),info:vi.fn()}
  const errors=vi.fn()
  const wrapper=mount(SparkPageRenderer,{attachTo:document.body,props:{pageRuntime:runtime,host,messageService:messages,
   routeSnapshot:{path,fullPath:router.currentRoute.value.fullPath,name:null,params:{},query,hash:''},onError:errors},
   global:{plugins:[router,ElementPlus,Spark.createPlugin()]}})
  try{
   await flushPromises()
   expect(errors).not.toHaveBeenCalled()
   await view.refresh()
   const button=wrapper.findAll('button').find(item=>item.text()===page.action)
   if(!button)throw Error('The actual published action button was not rendered')
   await button.trigger('click')
   await vi.waitFor(()=>expect(messages.success.mock.calls.length+messages.error.mock.calls.length).toBe(1))
   if(mode==='confirmed'){
    expect(submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({operationId:page.operationId,requestKey:'ORIGINAL'}),expect.anything())
    expect(messages.success).toHaveBeenCalledExactlyOnceWith(page.success)
   }else{
    expect(submit).toHaveBeenCalledTimes(mode==='mismatched'?1:0)
    expect(messages.success).not.toHaveBeenCalled()
    expect(messages.error).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(mode==='interrupted'?'回传中断':'原业务回执'))
   }
  }finally{wrapper.unmount();runtime.dispose();config.global.stubs=previous}
 })

const applicationId='D8490EC99436A8B9AFDE205BE3153802'

it.each(['empty','matched','wrong-digest','wrong-project','wrong-tool'] as const)(
 'reads the original request from the real published Page13 button for %s',async mode=>{
  registerAllRenderers()
  const scenarioId='SPACE',pageId=mode==='wrong-tool'?'other-submission-tool':'smart-bid-authoring-page13'
  const projectId='PROJECT',attemptRef='ATTEMPT',requestKey='REQUEST'
  const payload={projectId,attemptRef,requestKey,channelId:'PORTAL',enterpriseId:'ENT',objectRef:'LOT',priorAttemptRef:null}
  const requestDigest=await hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.submission-request/1',payload]))
  const exact={projectId,attemptRef,requestDigest,lotId:'LOT',subjectId:'ENT',channelId:'PORTAL'}
  const requestRows=mode==='empty'?[]:[{id:attemptRef,projectId:mode==='wrong-project'?'OTHER':projectId,
   requestKey,requestDigest,requestPayload:payload}]
  const eventRows=[{...exact,id:attemptRef,events:[{...exact,kind:'DISPATCHED',eventRef:'EVENT',actualObjectRef:'PACKAGE'}],
   combinedWithdrawalTarget:null}]
  const named=contentSubmissionScenarioViews({SubmissionAttempt:'id',ChannelReceipt:'id',SubmissionReconciliation:'id',TenderOutcome:'id'})
  const dataSet=DataSet.fromJson({scenarioId,tables:{SubmissionAttempt:{
   modelBinding:{modelId:'ATTEMPT_MODEL',modelName:'SubmissionAttempt'},
   columns:['id','projectId','requestKey','requestDigest','requestPayload','lotId','subjectId','channelId','events',
    'combinedWithdrawalTarget'].map(name=>({name,isPrimaryKey:name==='id'})),
   views:{default:{autoLoad:false},originalRequest:named.SubmissionAttempt.originalRequest,originalEvents:named.SubmissionAttempt.originalEvents},
  }}})
  const save=vi.fn(async()=>{throw Error('UNEXPECTED_SUBMISSION_WRITE')})
  const bind=(viewId:string,rows:DataRow[])=>{
   const view=dataSet.getView('SubmissionAttempt',viewId),table=new DataSpaceQueryTable({scenarioId,metaName:'SubmissionAttempt'})
   if(!view)throw Error('Missing test submission view')
   const executeQuery=vi.fn(async()=>new DataSpaceQueryContext({
    identity:table.identity,scope:'original',readScope:()=> 'original',snapshot:table.applyResult({Result:{primaryKeyField:'id',
     data:{Count:rows.length,Items:rows.map(item=>({...item,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}))}}}),
   }))
   view.bindQueryExecutor({save,executeQuery})
   return {view,executeQuery}
  }
  const original=bind('originalRequest',requestRows),events=bind('originalEvents',eventRows)
  const tool=new PageTool({pageId})
  for(const filename of ['rule.json','script.js','style.css'] as const){
   tool.hydrateFileText(filename,await readFile(resolve('src/views/features/application/smart-bid/authoring/page13',filename),'utf8'))
  }
  tool.markLoaded()
  const path=`/apps/${applicationId}/submission`
  const query={projectId,scenarioId,attemptRef,requestKey,requestDigest:mode==='wrong-digest'?'0'.repeat(64):requestDigest}
  const entry=preparePublishedSmartBidPageCall({path,query,meta:{
   title:'签署与递交',type:'config-page',nodeId:'NODE',pageId,blueprintScenarioId:scenarioId,
   tool:{projectId:applicationId,pageId},
  }})
  if(!entry)throw Error('Missing published SmartBid host')
  const runtime=new PageRuntime({tool,scenarioIds:[scenarioId],mainScenarioId:scenarioId,
   scenarioInputs:entry.scenarioInputs,loadScenario:async()=>dataSet})
  await runtime.load()
  const host=entry.createHost(runtime)
  const router=createRouter({history:createMemoryHistory(),routes:[{path,component:defineComponent({render:()=>h('div')})}]})
  await router.push({path,query})
  await router.isReady()
  const previous={...config.global.stubs},stubs={...previous}
  for(const key of ['SparkComponentRenderer','spark-component-renderer','el-button'])delete stubs[key]
  config.global.stubs=stubs
  const alert=vi.fn(async()=>undefined),error=vi.fn(),onError=vi.fn()
  const wrapper=mount(SparkPageRenderer,{attachTo:document.body,props:{pageRuntime:runtime,host,
   messageService:{success:vi.fn(),error,warning:vi.fn(),info:vi.fn()},confirmService:{alert,confirm:async()=>true},
   routeSnapshot:{path,fullPath:router.currentRoute.value.fullPath,name:null,params:{},query,hash:''},onError},
   global:{plugins:[router,ElementPlus,Spark.createPlugin()]}})
  try{
   await flushPromises()
   expect(onError).not.toHaveBeenCalled()
   const button=wrapper.findAll('button').find(item=>item.text()==='回查原递交请求')
   if(!button)throw Error('The published original-request button was not rendered')
   await button.trigger('click')
   await vi.waitFor(()=>expect(alert.mock.calls.length+error.mock.calls.length).toBe(1))
   if(mode==='empty'||mode==='matched'){
    expect(error).not.toHaveBeenCalled()
    expect(alert).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(mode==='empty'?'"UNKNOWN"':'"DISPATCHED"'),'原递交记录')
   }else{
    expect(alert).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(
     mode==='wrong-tool'?'SMART_BID_PAGE_ACTION_COMMAND_REQUIRED':'SUBMISSION_REQUEST_READ_CONFLICT'))
   }
   expect(original.executeQuery).toHaveBeenCalledTimes(mode==='wrong-tool'?0:1)
   expect(events.executeQuery).toHaveBeenCalledTimes(mode==='matched'?1:0)
   if(mode!=='wrong-tool')expect(original.view.queryContext).toMatchObject({projectId,attemptRef,requestKey})
   if(mode==='matched')expect(events.view.queryContext).toMatchObject(exact)
   expect(save).not.toHaveBeenCalled()
   expect(state.sent).toBe(false)
   expect(state.forwarded).not.toHaveBeenCalled()
  }finally{wrapper.unmount();runtime.dispose();config.global.stubs=previous}
 })

const route={
 path:`/apps/${applicationId}/ai-operation`,
 meta:{title:'AI 作业与核验',type:'config-page',nodeId:'NODE',pageId:'TOOL',blueprintScenarioId:'SPACE',
  tool:{projectId:applicationId,pageId:'TOOL'}},
 query:{projectId:'PROJECT',scenarioId:'SPACE'},
}

it('opens only the published AI operation route and leaves unrelated tools alone',()=>{
 const prepared=preparePublishedSmartBidPageCall(route)
 expect(prepared).toMatchObject({scenarioInputs:{SPACE:{projectId:'PROJECT'}}})
 expect(preparePublishedSmartBidPageCall({...route,meta:{...route.meta,title:'其他页面'}})).toBeUndefined()
 expect(()=>preparePublishedSmartBidPageCall({...route,meta:{...route.meta,pageId:undefined}}))
  .toThrow('SMART_BID_PUBLICATION_IDENTITY_REQUIRED')
})

it.each([
 {title:'制件与审定',pageId:'another-production-tool'},
 {title:'签署与递交',pageId:'another-submission-tool'},
 {title:'其他应用的工具',pageId:'smart-bid-authoring-page18'},
])('leaves unrelated applications using $pageId on the ordinary page path',({title,pageId})=>{
 expect(preparePublishedSmartBidPageCall({
  path:'/apps/OTHER/fixture',
  query:{},
  meta:{title,type:'config-page',nodeId:'OTHER-NODE',pageId,tool:{projectId:'OTHER',pageId}},
 })).toBeUndefined()
})

it.each(['知识目录与指南','ClassModel 登记','配置编审与启用','制件与审定','签署与递交','任务与问题'])
('binds page title %s through the published runtime',title=>{
 const prepared=preparePublishedSmartBidPageCall({...route,meta:{...route.meta,title}})
 expect(prepared).toMatchObject({scenarioInputs:{SPACE:{projectId:'PROJECT'}}})
})

it('derives the configuration scope from the authorized route without a project query',()=>{
 const prepared=preparePublishedSmartBidPageCall({
  ...route,
  meta:{...route.meta,title:'配置编审与启用'},
  query:{scenarioId:'SPACE'},
 })
 expect(prepared).toMatchObject({scenarioInputs:{SPACE:{projectId:applicationId}}})
})

it('binds reused page 18 navigation by page identity instead of node title',()=>{
 const prepared=preparePublishedSmartBidPageCall({
  ...route,
  meta:{...route.meta,title:'输入回读',pageId:'smart-bid-authoring-page18',
   tool:{projectId:applicationId,pageId:'smart-bid-authoring-page18'}},
 })
 expect(prepared).toMatchObject({scenarioInputs:{SPACE:{projectId:'PROJECT'}}})
})

it('preserves auxiliary scenario bindings for standard action pages',()=>{
 const prepared=preparePublishedSmartBidPageCall({...route,meta:{...route.meta,title:'制件与审定'},
  query:{...route.query,additionalScenarioIds:'AUX'}})
 if(!prepared)throw Error('Missing standard action host')
 const runtime=new PageRuntime({pageId:'TOOL',scenarioIds:['SPACE','AUX'],mainScenarioId:'SPACE',
  scenarioInputs:prepared.scenarioInputs,loadScenario:async()=>{throw Error('Host binding cannot load a scenario')}})
 try{expect(prepared.createHost(runtime)).toMatchObject({runtime})}
 finally{runtime.dispose()}
})

it.each([
 {mainScenarioId:'AUX',projectId:'PROJECT',currentUserId:'FIXTURE_USER'},
 {mainScenarioId:'SPACE',projectId:'OTHER',currentUserId:'FIXTURE_USER'},
 {mainScenarioId:'SPACE',projectId:'PROJECT',currentUserId:'OTHER'},
])('rejects a standard action runtime with mismatched $mainScenarioId $projectId $currentUserId',binding=>{
 const prepared=preparePublishedSmartBidPageCall({...route,meta:{...route.meta,title:'制件与审定'},
  query:{...route.query,additionalScenarioIds:'AUX'}})
 if(!prepared)throw Error('Missing standard action host')
 const runtime=new PageRuntime({pageId:'TOOL',scenarioIds:['SPACE','AUX'],mainScenarioId:binding.mainScenarioId,
  scenarioInputs:{SPACE:{projectId:binding.projectId,currentUserId:binding.currentUserId}},
  loadScenario:async()=>{throw Error('Host binding cannot load a scenario')}})
 try{expect(()=>prepared.createHost(runtime)).toThrow('SMART_BID_PAGE_ACTION_RUNTIME_CONFLICT')}
 finally{runtime.dispose()}
})

it('rejects blank command identities on standard action pages',async()=>{
 const prepared=preparePublishedSmartBidPageCall({...route,meta:{...route.meta,title:'制件与审定'}})
 if(!prepared)throw Error('Missing standard action host')
 const runtime=new PageRuntime({pageId:'TOOL',scenarioIds:['SPACE'],mainScenarioId:'SPACE',
  scenarioInputs:prepared.scenarioInputs,loadScenario:async()=>{throw Error('Invalid command cannot load a scenario')}})
 try{
  const host=prepared.createHost(runtime)
  if(!('invoke' in host))throw Error('Missing standard action invocation')
  await expect(host.invoke('smart-bid.dispatch',{operationId:' ',requestKey:'',prompt:'采用',inputs:{}},
   new AbortController().signal)).rejects.toThrow('SMART_BID_PAGE_ACTION_COMMAND_REQUIRED')
 }finally{runtime.dispose()}
})

it('does not give a different published tool the Page14 deadline host by title',()=>{
 const pageId='another-deadline-tool',scenarioId='DEADLINE_SPACE'
 expect(preparePublishedSmartBidPageCall({path:`/apps/${app}/fixture`,query:{projectId:'PROJECT',scenarioId,deadlineRef:'DEADLINE'},meta:{
  title:'回执与截止核对',type:'config-page',nodeId:'NODE',pageId,blueprintScenarioId:scenarioId,tool:{projectId:app,pageId},
 }})).toBeUndefined()
})

it.each(['exact','wrong-project','invalid-time','cached-view'] as const)('checks the published Page14 original deadline for %s',async outcome=>{
  const scenarioId='DEADLINE_SPACE',pageId='smart-bid-authoring-page14',projectId='PROJECT',deadlineRef='DEADLINE'
  const time='2026-11-18T10:00:00+08:00'
  const row={id:deadlineRef,projectId:outcome==='wrong-project'?'OTHER':projectId,lotId:'LOT',roundId:'ROUND',
   stageId:'STAGE',subjectId:'ENT',channelId:'PORTAL',cutoffAt:time,
   knownAt:outcome==='invalid-time'?'2026-11-18T10:00:00':time,obligationIds:['O']}
  const named=contentSubmissionScenarioViews({SubmissionAttempt:'id',ChannelReceipt:'id',SubmissionReconciliation:'id',TenderOutcome:'id'})
  const dataSet=DataSet.fromJson({scenarioId,tables:{SubmissionReconciliation:{
   modelBinding:{modelId:'DEADLINE_MODEL',modelName:'SubmissionReconciliation'},
   columns:Object.keys(row).map(name=>({name,type:name==='obligationIds'?'object':'string',isPrimaryKey:name==='id'})),
   views:{default:{autoLoad:false},...named.SubmissionReconciliation},
  }}})
  const view=dataSet.getView('SubmissionReconciliation','originalDeadline')
  if(!view)throw Error('Missing original deadline view')
  if(outcome==='cached-view')view.queryConfig={...view.queryConfig,cacheType:'page'}
  const table=new DataSpaceQueryTable({scenarioId,metaName:'SubmissionReconciliation'})
  const read=vi.fn(async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'fixture',readScope:()=> 'fixture',snapshot:table.applyResult({Result:{
    primaryKeyField:'id',data:{Count:1,Items:[{...row,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]},
   }}),
  }))
  const save=vi.fn(async()=>{throw Error('NO_DEADLINE_WRITE')})
  view.bindQueryExecutor({save,executeQuery:read})
  const tool=new PageTool({pageId})
  const text=await readFile(resolve('src/views/features/application/smart-bid/authoring/page14/rule.json'),'utf8')
  tool.hydrateFileText('rule.json',text)
  tool.markLoaded()
  const path=`/apps/${app}/fixture`,query={projectId,scenarioId,deadlineRef}
  const entry=preparePublishedSmartBidPageCall({path,query,meta:{
   title:'回执与截止核对',type:'config-page',nodeId:'NODE',pageId,blueprintScenarioId:scenarioId,tool:{projectId:app,pageId},
  }})
  if(!entry)throw Error('Missing published deadline host')
  const runtime=new PageRuntime({tool,scenarioIds:[scenarioId],mainScenarioId:scenarioId,
   scenarioInputs:entry.scenarioInputs,loadScenario:async()=>dataSet})
  try{
   await runtime.load()
   expect(text).toContain('"command":"content.submission.readDeadline"')
   registerAllRenderers()
   const router=createRouter({history:createMemoryHistory(),routes:[{path,component:defineComponent({render:()=>h('div')})}]})
   await router.push({path,query})
   await router.isReady()
   const previous={...config.global.stubs},stubs={...previous}
   for(const name of ['SparkComponentRenderer','spark-component-renderer','el-button'])delete stubs[name]
   config.global.stubs=stubs
   const alert=vi.fn(async(_text:string,_title?:string)=>undefined),error=vi.fn(),onError=vi.fn()
   const wrapper=mount(SparkPageRenderer,{attachTo:document.body,props:{pageRuntime:runtime,host:entry.createHost(runtime),
    messageService:{success:vi.fn(),error,warning:vi.fn(),info:vi.fn()},confirmService:{alert,confirm:async()=>true},
    routeSnapshot:{path,fullPath:router.currentRoute.value.fullPath,name:null,params:{},query,hash:''},onError},
    global:{plugins:[router,ElementPlus,Spark.createPlugin()]}})
   try{
    await flushPromises()
    expect(onError).not.toHaveBeenCalled()
    const button=wrapper.findAll('button').find(item=>item.text()==='核对截止有效组合')
    if(!button)throw Error('The original deadline button is missing')
    await button.trigger('click')
    await vi.waitFor(()=>expect(alert.mock.calls.length+error.mock.calls.length).toBe(1))
    if(outcome==='exact'){
     expect(error).not.toHaveBeenCalled()
     expect(alert).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('渠道回执与义务履行证据待核'),'截止有效组合')
     expect(JSON.parse(alert.mock.calls[0]?.[0]??'null')).toMatchObject({
      status:'UNKNOWN',deadlineRef,scope:{projectId,lotId:'LOT',subjectId:'ENT',channelId:'PORTAL'},roundId:'ROUND',
      stageId:'STAGE',cutoffAt:time,knownAt:time,obligationIds:['O'],
     })
    }else{
     expect(alert).not.toHaveBeenCalled()
     const code={
      'wrong-project':'SUBMISSION_DEADLINE_READ_SCOPE',
      'invalid-time':'SUBMISSION_RECONCILIATION_TIME',
      'cached-view':'SUBMISSION_DEADLINE_VIEW_REQUIRED',
     }[outcome]
     expect(error).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(code))
    }
   }finally{wrapper.unmount();config.global.stubs=previous}
   if(outcome!=='cached-view')expect(view.queryContext).toMatchObject({projectId,deadlineRef})
   expect(read).toHaveBeenCalledTimes(outcome==='cached-view'?0:1)
   expect(save).not.toHaveBeenCalled()
  }finally{runtime.dispose()}
})

it.each([{operationId:'60',action:'ENABLE'}, {operationId:'61',action:'DISABLE'}] as const)(
 'passes the original Page19 cancellation signal into operation $operationId',async ({operationId,action})=>{
  const select=vi.spyOn(page19Target,'preparePublishedConfigurationReleaseCall').mockReturnValue(undefined)
  const submit=vi.fn<page19ActionSource.SmartBidPageActionSubmit>(async()=>({}))
  const source=vi.spyOn(page19ActionSource,'createSmartBidPageActionSubmit').mockReturnValue(submit)
  const pageId='smart-bid-configuration-page19',scenarioId='SPACE',projectId='PROJECT'
  const tool=new PageTool({pageId})
  const runtime=new PageRuntime({tool,scenarioIds:[scenarioId],mainScenarioId:scenarioId,
   loadScenario:async()=>DataSet.fromJson({scenarioId,tables:{}})})
  try{
   preparePublishedSmartBidPageCall({path:`/apps/${app}/fixture`,query:{projectId,scenarioId},meta:{
    title:'配置编审与启用',type:'config-page',nodeId:'NODE',pageId,blueprintScenarioId:scenarioId,tool:{projectId:app,pageId},
   }})
   const bind=select.mock.calls[0]?.[2]
   if(!bind)throw Error('Missing the production release binding')
   const assertCurrent=()=>undefined
   const binding=bind(runtime,{projectId,scenarioId,assertCurrent})
   const scope={kind:'recipe',key:'RECIPE',scopeId:projectId}
   const common={...scope,authorityRef:'AUTHORITY',decisionRef:'DECISION',assertCurrent}
   const version={versionId:'VERSION',digest:'a'.repeat(64)}
   const decision=action==='ENABLE'
    ? {...common,action,candidate:version,typeCheckRef:'TYPE',closureCheckRef:'CLOSURE',reviewRef:'REVIEW'}
    : {...common,action,original:version,effectiveAt:'2026-11-27T10:00:00Z',stopScope:'NEW_SELECTION' as const}
   const prepared=await prepareConfigurationRelease(scope,{requestKey:'REQUEST',expectedPointerVersion:'POINTER'},decision)
   const controller=new AbortController()
   controller.abort()
   const callback=action==='ENABLE'?binding.submitEnable:binding.submitDisable
   if(!callback)throw Error('Missing the configured production operation')
   await callback(prepared,controller.signal)
   expect(submit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({operationId,requestKey:'REQUEST',inputs:prepared.record}),controller.signal)
  }finally{runtime.dispose();source.mockRestore();select.mockRestore()}
 })
