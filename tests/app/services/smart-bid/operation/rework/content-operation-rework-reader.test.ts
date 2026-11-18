import {expect,it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {prepareRegisteredOperationStepRework} from '@/views/features/application/smart-bid/authoring/model/operation/content-operation-rework-reader'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('prepares rework only from a visible, complete original attempt projection',async()=>{
 const scope={projectId:'P',runId:'RUN',attemptRef:'A',requestKey:'Q'}
 const original={...scope,id:'ROW',inputRef:'INPUT',returnRef:null,
  calls:[{callRef:'CALL',ownerRef:'REP',effect:'WITHDRAW',state:'UNKNOWN'}],
  findings:[{callRef:'CALL',cause:'RECOMPUTE',evidenceRef:'F',affectedRefs:[]}],priorResults:[]}
 const filters=Object.keys(scope).map(field=>({field,operator:'eq' as const,value:{Type:'GetInputParam',ParamName:field}}))
 const ds=DataSet.fromJson({scenarioId:'S',tables:{GenerationRun:{
  modelBinding:{modelId:'RUN-MODEL',modelName:'GenerationRun'},
  columns:Object.keys(original).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalReworkEvidence:{commitMode:'staged',queryConfig:{autoQuery:false},scopeFilter:{logic:'and',filters}}},
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
 try{
  const prepared=await prepare()
  expect(prepared).toMatchObject({...scope,firstCallRef:'CALL',handoffs:[{destination:'ORIGINAL_CALL'}],
   originalOperations:[{destination:'52',ownerRef:'REP'}]})
  hidden=['findings']
  await expect(prepare()).rejects.toThrow('DATA_VIEW_READ_ROW')
  expect(()=>prepared.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  hidden=[]
  returnedKey='OTHER'
  await expect(prepare()).rejects.toThrow('OPERATION_REWORK_READ_SCOPE')
 }finally{ds.destroy()}
})
