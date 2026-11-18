import {expect,it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {readRegisteredOperationDispatch} from '@/views/features/application/smart-bid/authoring/model/operation/content-operation-dispatch-reader'
import {verifyOriginalOperationRouteDispatch} from '@/services/smart-bid/operation/operation-route-dispatch-evidence'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('keeps actual input hidden behind field access while the original digest remains verifiable',async()=>{
 const scope={projectId:'P',runId:'R',attemptRef:'A',requestKey:'Q',targetDigest:'a'.repeat(64),configurationLockHash:'b'.repeat(64)}
 const original={...scope,id:'ROW',dispatchRef:'DISPATCH',actualInputDigest:'c'.repeat(64),actualInput:{private:'CONTENT'}}
 const filters=['projectId','runId','attemptRef','requestKey'].map(field=>({field,operator:'eq' as const,
  value:{Type:'GetInputParam',ParamName:field}}))
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ContextManifest:{
  modelBinding:{modelId:'M',modelName:'ContextManifest'},columns:Object.keys(original).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalDispatch:{commitMode:'staged',queryConfig:{autoQuery:false},scopeFilter:{logic:'and',filters}}},
 }}})
 const view=ds.getView('ContextManifest','originalDispatch')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'ContextManifest'})
 let rows:typeof original[]=[]
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:rows.length,Items:rows.map(row=>({...row,lingma_sys_params:{r:[],e:[],h:['actualInput'],m:[],d:false}}))}}}),
 })})
 const host={runtime:{resolveView:(key:string)=>key==='S@ContextManifest@originalDispatch'?view:undefined},
  scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 try{
  expect((await readRegisteredOperationDispatch(host,scope)).state).toBe('UNKNOWN')
  rows=[original]
  const result=await readRegisteredOperationDispatch(host,scope)
  expect(result).not.toHaveProperty('input')
  expect(await verifyOriginalOperationRouteDispatch(scope,result,{expectedInputDigest:original.actualInputDigest,assertCurrent:host.assertCurrent}))
   .toMatchObject({state:'MATCHED',inputJson:null})
  await expect(readRegisteredOperationDispatch(host,{...scope,attemptRef:'OTHER'})).rejects.toThrow('OPERATION_DISPATCH_READ_SCOPE')
  expect(()=>result.assertCurrent()).toThrow()
 }finally{ds.destroy()}
})
