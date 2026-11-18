import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {readRegisteredSubmissionRequest} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-request-reader'
import {createContentSubmissionScriptHost} from '@/views/features/application/smart-bid/authoring/entry/content-submission-script-host'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('reads a fixed original request and rejects payload drift despite an unchanged stored digest',async()=>{
 const payload={projectId:'P',attemptRef:'A',requestKey:'Q',channelId:'PORTAL',enterpriseId:'ENT',objectRef:'LOT',priorAttemptRef:null}
 const requestDigest=await hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.submission-request/1',payload]))
 const row={id:'A',projectId:'P',requestKey:'Q',requestDigest,requestPayload:payload}
 const scope=[['projectId','projectId'],['id','attemptRef'],['requestKey','requestKey']] as const
 const exact={projectId:'P',attemptRef:'A',lotId:'LOT',subjectId:'ENT',channelId:'PORTAL',requestDigest}
 const event={...exact,kind:'DISPATCHED',eventRef:'EVENT',actualObjectRef:'PACKAGE'}
 const originalEvents={...exact,id:'A',events:[event],combinedWithdrawalTarget:null}
 const eventScope=[['projectId','projectId'],['id','attemptRef'],['lotId','lotId'],['subjectId','subjectId'],
  ['channelId','channelId'],['requestDigest','requestDigest']] as const
 const ds=DataSet.fromJson({scenarioId:'S',tables:{SubmissionAttempt:{
  modelBinding:{modelId:'M',modelName:'SubmissionAttempt'},columns:Object.keys({...row,...originalEvents}).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalRequest:{commitMode:'staged',queryConfig:{autoQuery:false},scopeFilter:{logic:'and',
   filters:scope.map(([field,ParamName])=>({field,operator:'eq',value:{Type:'GetInputParam',ParamName}}))}},
   originalEvents:{commitMode:'staged',queryConfig:{autoQuery:false},scopeFilter:{logic:'and',
    filters:eventScope.map(([field,ParamName])=>({field,operator:'eq',value:{Type:'GetInputParam',ParamName}}))}}},
 }}})
 const view=ds.getView('SubmissionAttempt','originalRequest')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'SubmissionAttempt'})
 let rows:typeof row[]=[]
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:rows.length,Items:rows.map(item=>({...item,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}))}}}),
 })})
 const eventView=ds.getView('SubmissionAttempt','originalEvents')
 if(!eventView)throw Error('TEST_SUBMISSION_EVENT_VIEW_REQUIRED')
 const eventTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'SubmissionAttempt'})
 const executeEvents=vi.fn(async()=>new DataSpaceQueryContext({
  identity:eventTable.identity,scope:'events',readScope:()=> 'events',snapshot:eventTable.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...originalEvents,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
 }))
 eventView.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:executeEvents})
 const host={runtime:{resolveView:(key:string)=>key==='S@SubmissionAttempt@originalRequest'?view:
  key==='S@SubmissionAttempt@originalEvents'?eventView:undefined},
  scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 const original={...payload,requestDigest}
 try{
  expect((await readRegisteredSubmissionRequest(host,original)).state).toBe('UNKNOWN')
  const page=createContentSubmissionScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host)
  const signal=new AbortController().signal
  const readPage=()=>page.invoke('content.submission.readOriginal',original,signal)
  await expect(readPage()).resolves.toMatchObject({status:'UNKNOWN',registered:false})
  expect(executeEvents).not.toHaveBeenCalled()
  rows=[row]
  const result=await readRegisteredSubmissionRequest(host,original)
  expect(result).toMatchObject({state:'REGISTERED',attemptRef:'A',requestDigest})
  const projected=await readPage()
  expect(projected).toMatchObject({status:'DISPATCHED',registered:true,evidenceRef:'EVENT'})
  expect(executeEvents).toHaveBeenCalledOnce()
  expect(eventView.queryContext).toMatchObject(exact)
  event.channelId='OTHER'
  await expect(readPage()).rejects.toThrow('SUBMISSION_EVENTS_EVIDENCE')
  rows=[{...row,requestPayload:{...payload,channelId:'OTHER'}}]
  await expect(readRegisteredSubmissionRequest(host,original)).rejects.toThrow('SUBMISSION_REQUEST_READ_CONFLICT')
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  expect(()=>projected.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{ds.destroy()}
})
