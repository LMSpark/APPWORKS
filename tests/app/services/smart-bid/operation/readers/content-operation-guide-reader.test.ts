import {expect,it,vi} from 'vitest'
import {config,mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import VXETable from 'vxe-table'
import {Spark,SparkPageRenderer,registerAllRenderers} from '@spark-appworks/spark-component'
import {createMemoryHistory,createRouter} from 'vue-router'
import {DataSet} from '@spark-appworks/spark-data'
import {AiAgentRegistration,AiAgentToolResult,DefaultAiAgentSessionStore,createSimpleInputContract} from '@spark-appworks/spark-ai/agent'
import {discoverRegisteredOperationGuides} from '@/views/features/application/smart-bid/authoring/model/operation/content-operation-guide-reader'
import {openContentOperationWorkspace} from '@/views/features/application/smart-bid/authoring/entry/content-operation-workspace'
import {createContentOperationScriptHost} from '@/views/features/application/smart-bid/authoring/entry/content-operation-script-host'
import {hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import rule from '@/views/features/application/smart-bid/authoring/page18/rule.json?raw'
import script from '@/views/features/application/smart-bid/authoring/page18/script.js?raw'
import style from '@/views/features/application/smart-bid/authoring/page18/style.css?raw'
import {PageRuntimePool} from '../../../../../../packages/spark-app/src/router/page-runtime-pool'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('discovers only the complete scoped directory and retains the original publication and permission proof',async()=>{
 const guideText='### 核路线候选',guideDigest=await hashCanonicalSnapshotText(guideText)
 const row={id:'G',projectId:'P',directoryRef:'DIR',state:'EFFECTIVE',source:'PUBLIC',publicationRef:'PUB',
  guideRef:'GUIDE',versionRef:'V1',guideDigest,kind:'OperationRoute',actionName:'verify',
  pathRefs:['DIR'],materialRefs:['MATERIAL']}
 const filters=['projectId','directoryRef'].map(field=>({field,operator:'eq' as const,
  value:{Type:'GetInputParam',ParamName:field}}))
 const originalFilters=['projectId','guideRef','versionRef'].map(field=>({field,operator:'eq' as const,
  value:{Type:'GetInputParam',ParamName:field}}))
 const ds=DataSet.fromJson({scenarioId:'S',tables:{KnowledgeGuide:{
  modelBinding:{modelId:'GUIDES',modelName:'KnowledgeGuide'},columns:Object.keys(row).map(name=>({
   name,type:name==='pathRefs'||name==='materialRefs'?'object':'string',isPrimaryKey:name==='id',
  })),
  views:{default:{},originalVersion:{commitMode:'staged',queryConfig:{autoQuery:false},scopeFilter:{logic:'and',filters:originalFilters}},
   effectiveDirectory:{commitMode:'staged',queryConfig:{autoQuery:false},
   scopeFilter:{logic:'and',filters:[...filters,{field:'state',operator:'eq',value:'EFFECTIVE'}]}}},
 }}})
 const view=ds.getView('KnowledgeGuide','effectiveDirectory')!
 const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'KnowledgeGuide'})
 let publicationRef='PUB',hidden:string[]=[],count=1,projectId='P'
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:count,Items:[{...row,projectId,publicationRef,lingma_sys_params:{r:[],e:[],h:hidden,m:[],d:false}}]}}}),
 })})
 const originalView=ds.getView('KnowledgeGuide','originalVersion')
 if(!originalView)throw Error('TEST_ORIGINAL_VIEW_REQUIRED')
 let originalVersion='V1'
 const originalTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'KnowledgeGuide'})
 originalView.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:originalTable.identity,scope:'original',readScope:()=> 'original',snapshot:originalTable.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...row,versionRef:originalVersion,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
 })})
 const host={runtime:{resolveView:(key:string)=>key==='S@KnowledgeGuide@effectiveDirectory'?view:
  key==='S@KnowledgeGuide@originalVersion'?originalView:undefined},
  scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 const executeTool=vi.fn(async()=>({ok:true,data:{rootKind:'OperationRoute',models:[{kind:'OperationRoute',methods:[{name:'verify'}]}]}}))
 const discover=()=>discoverRegisteredOperationGuides(host,{executeTool},{rootKind:'OperationRoute',directoryRef:'DIR'})
 try{
  const result=await discover()
  expect(result.items).toMatchObject([{state:'REACHABLE',guideRef:'GUIDE',versionRef:'V1',materialRefs:['MATERIAL']}])
  expect(executeTool).toHaveBeenCalledExactlyOnceWith('model_query',{includeMembers:true})
  expect(view.queryContext).toMatchObject({projectId:'P',directoryRef:'DIR'})
  publicationRef=''
  await expect(discover()).rejects.toThrow('OPERATION_GUIDE_DIRECTORY_SCOPE')
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  publicationRef='PUB'
  hidden=['materialRefs']
  await expect(discover()).rejects.toThrow('DATA_VIEW_READ_ROW')
  hidden=[]
  count=2
  await expect(discover()).rejects.toThrow('OPERATION_GUIDE_DIRECTORY_INCOMPLETE')
  count=1
  projectId='OTHER'
  await expect(discover()).rejects.toThrow('OPERATION_GUIDE_DIRECTORY_SCOPE')
  expect(executeTool).toHaveBeenCalledTimes(1)
  projectId='P'
  const controller=new AbortController()
  const tools={executeTool:async(name:string)=>name==='model_action_guide'?{ok:true,data:guideText}:executeTool()}
  const scriptHost=createContentOperationScriptHost({...host.runtime,generation:1,destroyed:false,isLoaded:true},
   tools,{...host,rootKind:'OperationRoute'})
  const directory=await scriptHost.invoke('content.operation.discover',{directoryRef:'DIR'},controller.signal)
  if(!('dataViewKey' in directory)||typeof directory.readGuide!=='function')throw Error('TEST_DIRECTORY_REQUIRED')
  expect(directory).toMatchObject({dataViewKey:'S@KnowledgeGuide@effectiveDirectory',count:1,reachable:1})
  expect(scriptHost.runtime.resolveView(directory.dataViewKey)).toBe(view)
  await expect(directory.readGuide('G')).resolves.toMatchObject({versionRef:'V1',guide:guideText})
  await expect(directory.readGuide('UNKNOWN')).rejects.toThrow('OPERATION_PAGE_GUIDE_ROW_REQUIRED')
  const workspace=openContentOperationWorkspace({...host.runtime,generation:1,destroyed:false,isLoaded:true},
   tools,
   {...host,rootKind:'OperationRoute',signal:controller.signal})
  const discovery=await workspace.discover('DIR'),guide=await workspace.readGuide(discovery,row)
  expect(()=>directory.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  const attempt={projectId:'P',runId:'R',attemptRef:'A',requestKey:'Q',targetDigest:'b'.repeat(64),configurationLockHash:'c'.repeat(64)}
  const original={scope:attempt,guideRef:'GUIDE',guideVersionRef:'V1',guideDigest}
  const historical=await workspace.readOriginalGuide(original)
  expect(historical).toMatchObject({guideVersionRef:'V1',guide:guideText})
  expect(originalView.queryContext).toMatchObject({projectId:'P',guideRef:'GUIDE',versionRef:'V1'})
  originalVersion='V2'
  await expect(workspace.readOriginalGuide(original)).rejects.toThrow('OPERATION_ORIGINAL_GUIDE_SCOPE')
  expect(()=>historical?.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  const definition={versionRef:'V1',guideDigest,configurationLockHash:attempt.configurationLockHash,
   createdAt:'2026-11-18T10:00:00+08:00',slots:[{slotId:'target',required:true}],assertCurrent:host.assertCurrent}
  await expect(workspace.freeze(attempt,{...guide},{definition,sources:[]})).rejects.toThrow('OPERATION_WORKSPACE_GUIDE_SCOPE')
  await expect(workspace.freeze(attempt,guide,{definition:{...definition,versionRef:'OTHER'},sources:[]})).rejects.toThrow('OPERATION_WORKSPACE_GUIDE_SCOPE')
  const incomplete=await workspace.freeze(attempt,guide,{definition,sources:[]})
  expect(incomplete).toMatchObject({usable:false,inputDigest:null})
  const frozen=await workspace.freeze(attempt,guide,{definition,sources:[{slotId:'target',state:'ALLOWED',
   sourceRef:'REF',versionRef:'V',useRef:'USE',value:'TARGET',assertCurrent:host.assertCurrent}]})
  expect(frozen).toMatchObject({usable:true,inputJson:'{"target":"TARGET"}',guideDigest})
  const get=vi.fn(()=>undefined),claimOriginalTurn=vi.fn(()=>{throw Error('UNEXPECTED_CLAIM')})
  const options={registry:{get},turnCallbacks:{executeTurn:async()=>({text:'',toolCalls:[]}),appendMessages:async()=>{}}}
  const time=definition.createdAt
  const dispatch={registrationId:'REG',businessInstanceId:'B',runtimeInstanceId:'R',publishedVersionRef:'V1',
   turn:{turnId:'TURN',seq:1,baseRevision:0,queuedAt:time,startedAt:time,maxParallelTurns:1},
   claimOriginalTurn,assertCurrent:host.assertCurrent}
  await expect(workspace.dispatch(options,{...dispatch,manifest:{...frozen}})).rejects.toThrow('OPERATION_WORKSPACE_MANIFEST_SCOPE')
  await expect(workspace.dispatch(options,{...dispatch,manifest:incomplete})).rejects.toThrow('OPERATION_ROUTE_AGENT_INPUT_REQUIRED')
  expect(get).not.toHaveBeenCalled()
  expect(claimOriginalTurn).not.toHaveBeenCalled()
  const registration=new AiAgentRegistration({
   moduleId:'REG',name:'路线编排',description:'生成路线候选',
   runtime:{getTools:()=>[],executeTool:async()=>AiAgentToolResult.ok({}),
    projectKnowledge:()=>({promptSnapshot:'路线工艺'}),
    inspect:()=>({status:'ok',rootKinds:['OperationRoute'],moduleCount:1,findings:[]})},
   inputContract:createSimpleInputContract({businessId:'REG',identityField:'target',messageField:'target',
    paramsSchema:{type:'object',properties:{target:{type:'string'}},required:['target'],additionalProperties:false},
    systemPrompt:'只返回路线候选 JSON'}),
   sessionStore:new DefaultAiAgentSessionStore(),
  })
  const executeTurn=vi.fn(async()=>({text:'{"nodes":[]}',toolCalls:[]}))
  const registered={registry:{get:(key:string)=>key==='REG'?registration:undefined},
   turnCallbacks:{...options.turnCallbacks,executeTurn}}
  const claim=vi.fn<Parameters<typeof workspace.dispatch>[1]['claimOriginalTurn']>()
   .mockImplementationOnce(async input=>({...input,state:'CLAIMED',assertCurrent:host.assertCurrent}))
   .mockImplementation(async input=>({...input,state:'EXISTING',assertCurrent:host.assertCurrent}))
  const ready={...dispatch,businessInstanceId:'TARGET',runtimeInstanceId:'TARGET',manifest:frozen,claimOriginalTurn:claim}
  await expect(workspace.dispatch(registered,ready)).resolves.toMatchObject({state:'CHECK_ORIGINAL',observation:'SEND_RETURNED'})
  await expect(workspace.dispatch(registered,ready)).resolves.toMatchObject({state:'CHECK_ORIGINAL',observation:'CLAIM_UNAVAILABLE'})
  expect(claim).toHaveBeenCalledWith(expect.objectContaining({...attempt,manifestDigest:frozen.manifestDigest,
   inputDigest:frozen.inputDigest,publishedVersionRef:'V1',guideRef:'GUIDE',guideDigest}))
  expect(executeTurn).toHaveBeenCalledOnce()
  controller.abort()
  await expect(workspace.dispatch(options,{...dispatch,manifest:frozen})).rejects.toThrow('OPERATION_WORKSPACE_STALE')
  expect(()=>frozen.assertCurrent()).toThrow('OPERATION_WORKSPACE_STALE')
  registerAllRenderers()
  const path='/apps/APP/page18',tool={projectId:'APP',pageId:'PAGE18'}
  const router=createRouter({history:createMemoryHistory(),routes:[{path,component:SparkPageRenderer,
   meta:{type:'config-page',nodeId:'NODE18',pageId:'PAGE18',tool}}]})
  const readPageFiles=vi.fn(async(commands:ReadonlyArray<{fileName:string}>)=>
   commands.map(({fileName})=>fileName==='rule.json'?rule:fileName==='script.js'?script:style))
  const executePageTool=vi.fn(tools.executeTool)
  const pool=new PageRuntimePool({pageComponent:SparkPageRenderer,readPageFile:undefined,readPageFiles,
   preparePageCall:()=>({scenarioInputs:{},assertCurrent:host.assertCurrent,
    createHost:runtime=>createContentOperationScriptHost(runtime,{executeTool:executePageTool},{...host,rootKind:'OperationRoute'})}),
   loadScenario:async()=>ds,readNavTree:()=>({title:'Fixture',childPlacement:'header',
    items:[{id:'NODE18',title:'工艺',itemKind:'page',tool}]}),refreshRoutes:async()=>{}})
  const originalStubs={...config.global.stubs},stubs={...originalStubs}
  for(const key of ['SparkComponentRenderer','spark-component-renderer','el-table','el-table-column'])delete stubs[key]
  config.global.stubs=stubs
  try{
   await router.push({path,query:{scenarioId:'S',directoryRef:'DIR'}})
   const component=pool.getPageRuntimeView(router.currentRoute.value)
   if(!component)throw Error('TEST_OPERATION_PAGE_REQUIRED')
   const rendered=mount(component,{global:{plugins:[router,ElementPlus,VXETable,Spark.createPlugin()]}})
   try{
    await vi.waitFor(()=>expect(rendered.text()).toContain('目录指南 1 项，当前可达动作 1 项'),{timeout:3000})
    const guideRow=rendered.findAll('tr').find(item=>item.text().includes('GUIDE'))
    expect(guideRow).toBeDefined()
    await guideRow?.trigger('click')
    await vi.waitFor(()=>expect(executePageTool).toHaveBeenCalledWith('model_action_guide',{kind:'OperationRoute',actionName:'verify'}))
   }finally{rendered.unmount()}
  }finally{config.global.stubs=originalStubs;pool.disposePageRuntimes()}
 }finally{if(!ds.destroyed)ds.destroy()}
})
