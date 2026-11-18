import {expect,it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {readRegisteredSubmissionRequest} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-request-reader'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('reads a fixed original request and rejects payload drift despite an unchanged stored digest',async()=>{
 const payload={projectId:'P',attemptRef:'A',requestKey:'Q',channelId:'PORTAL'}
 const requestDigest=await hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.submission-request/1',payload]))
 const row={id:'A',projectId:'P',requestKey:'Q',requestDigest,requestPayload:payload}
 const scope=[['projectId','projectId'],['id','attemptRef'],['requestKey','requestKey']] as const
 const ds=DataSet.fromJson({scenarioId:'S',tables:{SubmissionAttempt:{
  modelBinding:{modelId:'M',modelName:'SubmissionAttempt'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalRequest:{commitMode:'staged',queryConfig:{autoQuery:false},scopeFilter:{logic:'and',
   filters:scope.map(([field,ParamName])=>({field,operator:'eq',value:{Type:'GetInputParam',ParamName}}))}}},
 }}})
 const view=ds.getView('SubmissionAttempt','originalRequest')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'SubmissionAttempt'})
 let rows:typeof row[]=[]
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:rows.length,Items:rows.map(item=>({...item,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}))}}}),
 })})
 const host={runtime:{resolveView:(key:string)=>key==='S@SubmissionAttempt@originalRequest'?view:undefined},
  scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 const original={...payload,requestDigest}
 try{
  expect((await readRegisteredSubmissionRequest(host,original)).state).toBe('UNKNOWN')
  rows=[row]
  const result=await readRegisteredSubmissionRequest(host,original)
  expect(result).toMatchObject({state:'REGISTERED',attemptRef:'A',requestDigest})
  rows=[{...row,requestPayload:{...payload,channelId:'OTHER'}}]
  await expect(readRegisteredSubmissionRequest(host,original)).rejects.toThrow('SUBMISSION_REQUEST_READ_CONFLICT')
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{ds.destroy()}
})
