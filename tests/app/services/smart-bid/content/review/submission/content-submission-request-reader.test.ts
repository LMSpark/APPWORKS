import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {contentSubmissionScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-scenario-views'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {readRegisteredSubmissionRequest} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-request-reader'
import {createContentSubmissionScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-submission-script-host'
import page13 from '@/views/features/application/smart-bid/authoring/page13/script.js?raw'
import page14 from '@/views/features/application/smart-bid/authoring/page14/script.js?raw'
import {DataSpaceQueryTable} from '@spark-appworks/spark-data'
import {DataSpaceQueryContext} from '@spark-appworks/spark-data'

it('reads a fixed original request and rejects payload drift despite an unchanged stored digest',async()=>{
 const payload={projectId:'P',attemptRef:'A',requestKey:'Q',channelId:'PORTAL',enterpriseId:'ENT',objectRef:'LOT',priorAttemptRef:'OLD'}
 const requestDigest=await hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.submission-request/1',payload]))
 const row={id:'A',projectId:'P',requestKey:'Q',requestDigest,requestPayload:payload}
 const exact={projectId:'P',attemptRef:'A',lotId:'LOT',subjectId:'ENT',channelId:'PORTAL',requestDigest}
 const event={...exact,kind:'DISPATCHED',eventRef:'EVENT',actualObjectRef:'PACKAGE'}
 const originalEvents={...exact,id:'A',events:[event],combinedWithdrawalTarget:null as string|null}
 const pageViews=contentSubmissionScenarioViews({SubmissionAttempt:'id',ChannelReceipt:'id',SubmissionReconciliation:'id',TenderOutcome:'id'})
 const ds=DataSet.fromJson({scenarioId:'S',tables:{SubmissionAttempt:{
  modelBinding:{modelId:'M',modelName:'SubmissionAttempt'},columns:Object.keys({...row,...originalEvents}).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalRequest:pageViews.SubmissionAttempt.originalRequest,originalEvents:pageViews.SubmissionAttempt.originalEvents},
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
  originalEvents.combinedWithdrawalTarget='OLD'
  await expect(readPage()).rejects.toThrow('SUBMISSION_PAGE_WITHDRAWAL_SCOPE')
  originalEvents.combinedWithdrawalTarget=null
  event.channelId='OTHER'
  await expect(readPage()).rejects.toThrow('SUBMISSION_EVENTS_EVIDENCE')
  rows=[{...row,requestPayload:{...payload,channelId:'OTHER'}}]
  await expect(readRegisteredSubmissionRequest(host,original)).rejects.toThrow('SUBMISSION_REQUEST_READ_CONFLICT')
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  expect(()=>projected.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  const combinedPayload={...payload,combinedWithdrawalTarget:'WITHDRAW_TARGET'}
  const combinedDigest=await hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.submission-request/1',combinedPayload]))
  rows=[{...row,requestDigest:combinedDigest,requestPayload:combinedPayload}]
  originalEvents.requestDigest=combinedDigest
  Object.assign(event,{channelId:'PORTAL',requestDigest:combinedDigest})
  originalEvents.combinedWithdrawalTarget=combinedPayload.combinedWithdrawalTarget
  const readCombined=()=>page.invoke('content.submission.readOriginal',{...original,requestDigest:combinedDigest},signal)
  await expect(readCombined()).resolves.toMatchObject({status:'PARTIAL',newDelivery:{evidenceRef:'EVENT'},oldWithdrawal:null})
  for(const script of [page13,page14])expect(script.trim()).toBe('')
 }finally{ds.destroy()}
})


it.each(['request','events'] as const)('Page13 rejects a superseded same-key %s query',async kind=>{
 const payload={projectId:'P',attemptRef:'A',requestKey:'Q',channelId:'PORTAL',enterpriseId:'ENT',objectRef:'LOT',priorAttemptRef:null}
 const requestDigest=await hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.submission-request/1',payload]))
 const wanted={projectId:'P',attemptRef:'A',lotId:'LOT',subjectId:'ENT',channelId:'PORTAL',requestDigest}
 const event={...wanted,eventRef:'EVENT',kind:'DISPATCHED',actualObjectRef:'PACKAGE'}
 const row={...wanted,id:'A',requestKey:'Q',requestPayload:payload,events:[event],combinedWithdrawalTarget:null}
 const views=contentSubmissionScenarioViews({SubmissionAttempt:'id',ChannelReceipt:'id',SubmissionReconciliation:'id',TenderOutcome:'id'})
 const dataSet=DataSet.fromJson({scenarioId:'S',tables:{SubmissionAttempt:{
  modelBinding:{modelName:'SubmissionAttempt',modelId:'M'},
  columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalRequest:views.SubmissionAttempt.originalRequest,originalEvents:views.SubmissionAttempt.originalEvents},
 }}})
 const save=vi.fn(async()=>{throw Error('UNEXPECTED_SUBMISSION_WRITE')})
 let release=()=>{}
 const first=new Promise<void>(resolve=>{release=resolve})
 const mount=(name:'originalRequest'|'originalEvents',hold:boolean)=>{
  const view=dataSet.getView('SubmissionAttempt',name)
  if(!view)throw Error('TEST_SUBMISSION_VIEW_REQUIRED')
  const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'SubmissionAttempt'})
  let queries=0
  const execute=vi.fn(async()=>{
   const initial=++queries===1
   if(initial&&hold)await first
   const rows=initial&&hold?[]:[{...row,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]
   return new DataSpaceQueryContext({identity:table.identity,scope:name,readScope:()=>name,
    snapshot:table.applyResult({Result:{primaryKeyField:'id',data:{Count:rows.length,Items:rows}}}),
   })
  })
  view.bindQueryExecutor({executeQuery:execute,save})
  return {view,execute}
 }
 const request=mount('originalRequest',kind==='request'),events=mount('originalEvents',kind==='events')
 const runtime={resolveView:(key:string)=>key==='S@SubmissionAttempt@originalRequest'?request.view:
  key==='S@SubmissionAttempt@originalEvents'?events.view:undefined,generation:1,isLoaded:true,destroyed:false}
 const host=createContentSubmissionScriptHost(runtime,{scenarioId:'S',projectId:'P',assertCurrent:()=>{}})
 const signal=new AbortController().signal
 const read=()=>host.invoke('content.submission.readOriginal',{...payload,requestDigest},signal)
 const selected=kind==='request'?request:events
 const outcome=read().then(value=>({value}),error=>({error}))
 try{
  await vi.waitFor(()=>expect(selected.execute).toHaveBeenCalledTimes(1))
  await selected.view.refresh()
  expect(selected.view.rows).toHaveLength(1)
  release()
  expect(await outcome).toMatchObject({error:expect.objectContaining({
   message:kind==='request'?'SUBMISSION_REQUEST_READ_STALE':'SUBMISSION_EVENTS_STALE',
  })})
  expect(events.execute).toHaveBeenCalledTimes(kind==='request'?0:2)
  await expect(read()).resolves.toMatchObject({status:'DISPATCHED',registered:true,evidenceRef:'EVENT'})
  expect(save).not.toHaveBeenCalled()
 }finally{release();await outcome;dataSet.destroy()}
})
