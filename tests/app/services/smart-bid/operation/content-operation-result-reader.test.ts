import {expect,it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {readRegisteredOperationResult,recoverRegisteredOperationRouteAttempt} from '@/views/features/application/smart-bid/authoring/model/operation/content-operation-result-reader'
import {freezeOperationRouteContext} from '@/services/smart-bid/operation/operation-route-context'
import craft from '@/services/smart-bid/craft/route-compose-v1.json'
import {DataSpaceQueryTable} from '../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('reads the original result only for the selected attempt and verifies the returned field permissions',async()=>{
 const scope={projectId:'P',runId:'RUN',attemptRef:'ATTEMPT',requestKey:'Q',targetDigest:'a'.repeat(64),configurationLockHash:'b'.repeat(64)}
 const original={...scope,id:'ROW',receiptRef:'RECEIPT',state:'COMPLETE',output:craft.outputExample}
 const guideDigest='c'.repeat(64)
 const manifest=await freezeOperationRouteContext(scope,{action:{guideRef:'GUIDE',guideDigest,assertCurrent:()=>{}},
  createdAt:'2026-11-18T10:00:00+08:00',slots:[{slotId:'target',required:true}]},[
  {slotId:'target',state:'ALLOWED',sourceRef:'SOURCE',versionRef:'V1',useRef:'USE',value:craft.inputExample.targetScope,assertCurrent:()=>{}},
 ])
 const dispatch={...scope,id:'DISPATCH-ROW',dispatchRef:'DISPATCH',actualInputDigest:manifest.inputDigest}
 const filters=['projectId','runId','attemptRef','requestKey'].map(field=>({field,operator:'eq' as const,
  value:{Type:'GetInputParam',ParamName:field}}))
 const ds=DataSet.fromJson({scenarioId:'S',tables:{GenerationRun:{
  modelBinding:{modelId:'M',modelName:'GenerationRun'},columns:Object.keys(original).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalResult:{commitMode:'staged',queryConfig:{autoQuery:false},scopeFilter:{logic:'and',filters}}},
 },ContextManifest:{
  modelBinding:{modelId:'CTX',modelName:'ContextManifest'},columns:Object.keys(dispatch).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalDispatch:{commitMode:'staged',queryConfig:{autoQuery:false},scopeFilter:{logic:'and',filters}}},
 }}})
 const view=ds.getView('GenerationRun','originalResult')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'GenerationRun'})
 let hidden=false
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...original,lingma_sys_params:{r:[],e:[],h:hidden?['output']:[],m:[],d:false}}]}}}),
 })})
 const dispatchView=ds.getView('ContextManifest','originalDispatch')!,dispatchTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'ContextManifest'})
 dispatchView.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:dispatchTable.identity,scope:'dispatch',readScope:()=> 'dispatch',snapshot:dispatchTable.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...dispatch,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
 })})
 const host={runtime:{resolveView:(key:string)=>key==='S@GenerationRun@originalResult'?view:
  key==='S@ContextManifest@originalDispatch'?dispatchView:undefined},
  scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 try{
  const result=await readRegisteredOperationResult(host,scope)
  expect(result).toMatchObject({state:'COMPLETE',receiptRef:'RECEIPT',output:craft.outputExample})
  const verified=await recoverRegisteredOperationRouteAttempt(host,manifest,{guideRef:'GUIDE',guideDigest,configurationLockHash:scope.configurationLockHash,
   catalog:{stationRefs:craft.inputExample.stationCatalog.map(station=>station.ref),routeRefs:[]},match:()=>true,
   assertCurrent:host.assertCurrent,assertGuideCurrent:host.assertCurrent})
  expect(verified).toMatchObject({state:'VERIFIED_CANDIDATE',dispatch:{dispatchRef:'DISPATCH'},result:{receiptRef:'RECEIPT'}})
  await dispatchView.refresh()
  expect(()=>verified.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  hidden=true
  await expect(readRegisteredOperationResult(host,scope)).rejects.toThrow('DATA_VIEW_READ_ROW')
  expect(()=>result?.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  await expect(readRegisteredOperationResult(host,{...scope,requestKey:'OTHER'})).rejects.toThrow('OPERATION_RESULT_READ_SCOPE')
 }finally{ds.destroy()}
})
