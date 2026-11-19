import {expect,it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {prepareRegisteredOperationStepRework} from '@/views/features/application/smart-bid/authoring/model/operation/content-operation-rework-reader'
import {openContentOperationWorkspace} from '@/views/features/application/smart-bid/authoring/ui/entry/content-operation-workspace'
import {contentOperationScenarioViews} from '@/views/features/application/smart-bid/authoring/model/operation/content-operation-scenario-views'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('prepares rework only from a visible, complete original attempt projection',async()=>{
 const identity={projectId:'P',runId:'RUN',attemptRef:'A',requestKey:'Q'}
 const scope={...identity,targetDigest:'a'.repeat(64),configurationLockHash:'b'.repeat(64)}
 const original={...scope,id:'ROW',inputRef:'INPUT',returnRef:null,
  calls:[{callRef:'CALL',ownerRef:'REP',effect:'WITHDRAW',state:'UNKNOWN',inputRef:'WITHDRAW-INPUT',returnRef:null}],
  findings:[{callRef:'CALL',cause:'RECOMPUTE',evidenceRef:'F',affectedRefs:[]}],priorResults:[]}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{GenerationRun:{
  modelBinding:{modelId:'RUN-MODEL',modelName:'GenerationRun'},
  columns:Object.keys(original).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalReworkEvidence:contentOperationScenarioViews({KnowledgeGuide:'id',ContextManifest:'id',GenerationRun:'id'}).GenerationRun.originalReworkEvidence},
 }}})
 const view=ds.getView('GenerationRun','originalReworkEvidence')
 if(!view)throw Error('TEST_VIEW_REQUIRED')
 const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'GenerationRun'})
 let returnedKey='Q',hidden:string[]=[]
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...original,requestKey:returnedKey,lingma_sys_params:{r:[],e:[],h:hidden,m:[],d:false}}]}}}),
 })})
 const host={runtime:{resolveView:(key:string)=>key==='S@GenerationRun@originalReworkEvidence'?view:undefined},
  scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 const prepare=()=>prepareRegisteredOperationStepRework(host,{...scope,reason:'撤回结果未知'})
 await expect(prepareRegisteredOperationStepRework(host,{...scope,configurationLockHash:'c'.repeat(64),reason:'原锁不符'}))
  .rejects.toThrow('OPERATION_REWORK_READ_SCOPE')
 try{
  const controller=new AbortController()
  const workspace=openContentOperationWorkspace({...host.runtime,generation:1,destroyed:false,isLoaded:true},
   {executeTool:async()=>{throw Error('UNEXPECTED_CLASS_MODEL_CALL')}},
   {...host,rootKind:'OperationRoute',signal:controller.signal})
  const prepared=await workspace.prepareRework({...scope,reason:'撤回结果未知'})
  expect(prepared).toMatchObject({...scope,firstCallRef:'CALL',handoffs:[{destination:'ORIGINAL_CALL'}],
   originalOperations:[{destination:'52',ownerRef:'REP'}]})
  controller.abort()
  expect(()=>prepared.assertCurrent()).toThrow('OPERATION_WORKSPACE_STALE')
  await expect(workspace.prepareRework({...scope,reason:'撤回结果未知'})).rejects.toThrow('OPERATION_WORKSPACE_STALE')
  const originalPrepared=await prepare()
  hidden=['findings']
  await expect(prepare()).rejects.toThrow('DATA_VIEW_READ_ROW')
  expect(()=>originalPrepared.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  hidden=['targetDigest']
  await expect(prepare()).rejects.toThrow('DATA_VIEW_READ_ROW')
  hidden=['configurationLockHash']
  await expect(prepare()).rejects.toThrow('DATA_VIEW_READ_ROW')
  hidden=[]
  await expect(prepareRegisteredOperationStepRework(host,{...scope,targetDigest:'d'.repeat(64),reason:'原目标不符'}))
   .rejects.toThrow('OPERATION_REWORK_READ_SCOPE')
  returnedKey='OTHER'
  await expect(prepare()).rejects.toThrow('OPERATION_REWORK_READ_SCOPE')
 }finally{ds.destroy()}
})
