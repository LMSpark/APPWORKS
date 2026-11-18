import {expect,it,vi} from 'vitest'
import {createContentOperationScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-operation-script-host'
import {openContentOperationWorkspace} from '@/views/features/application/smart-bid/authoring/ui/entry/content-operation-workspace'
import {DataSet} from '@spark-appworks/spark-data'
import {readRegisteredOperationResult} from '@/views/features/application/smart-bid/authoring/model/operation/content-operation-result-reader'
import {freezeOperationRouteContext} from '@/services/smart-bid/operation/operation-route-context'
import {hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {contentOperationScenarioViews} from '@/views/features/application/smart-bid/authoring/model/operation/content-operation-scenario-views'
import craft from '@/services/smart-bid/craft/route-compose-v1.json'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('reads the original result only for the selected attempt and verifies the returned field permissions',async()=>{
 const scope={projectId:'P',runId:'RUN',attemptRef:'ATTEMPT',requestKey:'Q',targetDigest:'a'.repeat(64),configurationLockHash:'b'.repeat(64)}
 const original={...scope,id:'ROW',receiptRef:'RECEIPT',state:'COMPLETE',output:craft.outputExample}
 const guideText='### 原核验指南',guideDigest=await hashCanonicalSnapshotText(guideText)
 const guideRow={id:'GUIDE-ROW',projectId:'P',guideRef:'GUIDE',versionRef:'GV1',guideDigest,
  kind:'OperationRoute',actionName:'verify',source:'PUBLIC',publicationRef:'PUB'}
 const manifest=await freezeOperationRouteContext(scope,{guideVersionRef:'GV1',action:{guideRef:'GUIDE',guideDigest,assertCurrent:()=>{}},
  createdAt:'2026-11-18T10:00:00+08:00',slots:[{slotId:'target',required:true}]},[
  {slotId:'target',state:'ALLOWED',sourceRef:'SOURCE',versionRef:'V1',useRef:'USE',value:craft.inputExample.targetScope,assertCurrent:()=>{}},
 ])
 const actualInput={target:craft.inputExample.targetScope}
 const dispatch={...scope,id:'DISPATCH-ROW',dispatchRef:'DISPATCH',actualInputDigest:manifest.inputDigest,actualInput}
 const frozen={...scope,id:'FROZEN-ROW',guideVersionRef:'GV1',guideRef:'GUIDE',guideDigest,usable:true,inputDigest:manifest.inputDigest}
 const views=contentOperationScenarioViews({KnowledgeGuide:'id',ContextManifest:'id',GenerationRun:'id'})
 const ds=DataSet.fromJson({scenarioId:'S',tables:{GenerationRun:{
  modelBinding:{modelId:'M',modelName:'GenerationRun'},columns:Object.keys(original).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalResult:views.GenerationRun.originalResult},
 },ContextManifest:{
  modelBinding:{modelId:'CTX',modelName:'ContextManifest'},
  columns:Object.keys({...dispatch,...frozen}).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},...views.ContextManifest},
 },KnowledgeGuide:{
  modelBinding:{modelId:'GUIDES',modelName:'KnowledgeGuide'},columns:Object.keys(guideRow).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalVersion:views.KnowledgeGuide.originalVersion},
 }}})
 const view=ds.getView('GenerationRun','originalResult')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'GenerationRun'})
 let hidden=false
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...original,lingma_sys_params:{r:[],e:[],h:hidden?['output']:[],m:[],d:false}}]}}}),
 })})
 const dispatchView=ds.getView('ContextManifest','originalDispatch')!,dispatchTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'ContextManifest'})
 let hideDispatchInput=false
 dispatchView.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:dispatchTable.identity,scope:'dispatch',readScope:()=> 'dispatch',snapshot:dispatchTable.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...dispatch,lingma_sys_params:{r:[],e:[],h:hideDispatchInput?['actualInput']:[],m:[],d:false}}]}}}),
 })})
 const frozenView=ds.getView('ContextManifest','originalFrozen')
 if(!frozenView)throw Error('TEST_FROZEN_VIEW_REQUIRED')
 const frozenTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'ContextManifest'})
 let hideFrozen=false
 frozenView.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:frozenTable.identity,scope:'frozen',readScope:()=> 'frozen',snapshot:frozenTable.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...frozen,lingma_sys_params:{r:[],e:[],h:hideFrozen?['inputDigest']:[],m:[],d:false}}]}}}),
 })})
 const guideView=ds.getView('KnowledgeGuide','originalVersion')
 if(!guideView)throw Error('TEST_GUIDE_VIEW_REQUIRED')
 const guideTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'KnowledgeGuide'})
 guideView.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:guideTable.identity,scope:'guide',readScope:()=> 'guide',snapshot:guideTable.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...guideRow,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
 })})
 const host={runtime:{resolveView:(key:string)=>key==='S@GenerationRun@originalResult'?view:
  key==='S@ContextManifest@originalDispatch'?dispatchView:key==='S@ContextManifest@originalFrozen'?frozenView:
   key==='S@KnowledgeGuide@originalVersion'?guideView:undefined},
  scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 try{
  const scriptHost=createContentOperationScriptHost({...host.runtime,generation:1,destroyed:false,isLoaded:true},
   {executeTool:async()=>{throw Error('UNEXPECTED_CLASS_MODEL_CALL')}},{...host,rootKind:'OperationRoute'})
  const signal=new AbortController().signal
  await expect(scriptHost.invoke('content.operation.readDispatch',{...scope,targetDigest:'wrong'},signal))
   .rejects.toThrow('OPERATION_PAGE_ATTEMPT_REQUIRED')
  const projected=await scriptHost.invoke('content.operation.readDispatch',scope,signal)
  expect(projected).toMatchObject({state:'DISPATCH_RECORDED',dispatchRef:'DISPATCH',actualInputDigest:manifest.inputDigest})
  expect(projected).not.toHaveProperty('input')
  if(!('readActualInput' in projected)||!projected.readActualInput)throw Error('TEST_INPUT_PROOF_REQUIRED')
  await expect(projected.readActualInput()).resolves.toBe(manifest.inputJson)
  hideDispatchInput=true
  const restricted=await scriptHost.invoke('content.operation.readDispatch',scope,signal)
  expect(restricted).not.toHaveProperty('readActualInput')
  await expect(projected.readActualInput()).rejects.toThrow('DATA_VIEW_READ_RESULT')
  const result=await readRegisteredOperationResult(host,scope)
  expect(result).toMatchObject({state:'COMPLETE',receiptRef:'RECEIPT',output:craft.outputExample})
  const tools={executeTool:async(name:string)=>name==='model_action_guide'?{ok:true,data:guideText}:
   {ok:true,data:{rootKind:'OperationRoute',models:[{kind:'OperationRoute',methods:[{name:'verify'}]}]}}}
  const workspace=openContentOperationWorkspace(scriptHost.runtime,tools,{...host,rootKind:'OperationRoute',signal})
  const guide={configurationLockHash:scope.configurationLockHash,
   catalog:{stationRefs:craft.inputExample.stationCatalog.map(station=>station.ref),routeRefs:[]},match:()=>true,
   assertCurrent:host.assertCurrent}
  const resolveGuide=vi.fn(async()=>guide)
  const verified=await workspace.recoverOriginal(scope,resolveGuide)
  expect(resolveGuide).toHaveBeenCalledExactlyOnceWith({scope,guideRef:'GUIDE',guideVersionRef:'GV1',guideDigest},signal)
  expect(verified).toMatchObject({state:'VERIFIED_CANDIDATE',dispatch:{dispatchRef:'DISPATCH'},result:{receiptRef:'RECEIPT'}})
  await dispatchView.refresh()
  if(!verified)throw Error('TEST_OPERATION_VERIFICATION_REQUIRED')
  expect(()=>verified.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  await expect(workspace.recoverOriginal(scope,async()=>({...guide,configurationLockHash:'d'.repeat(64)})))
   .rejects.toThrow('OPERATION_ROUTE_RETURN_GUIDE_SCOPE')
  await expect(workspace.recoverOriginal(scope,async()=>{
   await frozenView.refresh()
   return guide
  })).rejects.toThrow('DATA_VIEW_READ_RESULT')
  const verificationHost=createContentOperationScriptHost(scriptHost.runtime,tools,
   {...host,rootKind:'OperationRoute',resolveOriginalGuide:resolveGuide})
  const inspected=await verificationHost.invoke('content.operation.readDispatch',scope,signal)
  expect(inspected).toMatchObject({state:'DISPATCH_RECORDED',dispatchRef:'DISPATCH',
   verification:{state:'VERIFIED_CANDIDATE',receiptRef:'RECEIPT'}})
  expect(inspected).not.toHaveProperty('verification.candidateJson')
  hideFrozen=true
  await expect(workspace.recoverOriginal(scope,resolveGuide)).rejects.toThrow('DATA_VIEW_READ_ROW')
  hidden=true
  await expect(readRegisteredOperationResult(host,scope)).rejects.toThrow('DATA_VIEW_READ_ROW')
  expect(()=>result?.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  await expect(readRegisteredOperationResult(host,{...scope,requestKey:'OTHER'})).rejects.toThrow('OPERATION_RESULT_READ_SCOPE')
 }finally{ds.destroy()}
})
