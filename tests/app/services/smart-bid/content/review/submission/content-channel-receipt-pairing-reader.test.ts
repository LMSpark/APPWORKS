import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {contentSubmissionScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-scenario-views'
import {readRegisteredChannelReceiptPairing} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-channel-receipt-pairing-reader'
import {createContentSubmissionScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-submission-script-host'
import {DataSpaceQueryTable} from '@spark-appworks/spark-data'
import {DataSpaceQueryContext} from '@spark-appworks/spark-data'

it.each(['exact','receipt','candidate'] as const)('pairs only readable receipt evidence with one exact original operation: %s',async mode=>{
 const scope={projectId:'P',lotId:'LOT',subjectId:'ENT',channelId:'PORTAL'}
 const time='2026-11-18T12:00:00+08:00'
 const row={...scope,id:'REC',eventRef:'EVENT',eventKind:'RECEIVED',eventAt:time,operationRef:'OP',objectRef:'PACKAGE',
  sources:[{sourceRef:'SOURCE',knownAt:time}]}
 const candidateRow={...scope,id:'A',operationRef:'OP',actualObjectRef:'PACKAGE',withdrawalTargetRef:null as string|null}
 const pageViews=contentSubmissionScenarioViews({SubmissionAttempt:'id',ChannelReceipt:'id',SubmissionReconciliation:'id',TenderOutcome:'id'})
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ChannelReceipt:{
  modelBinding:{modelId:'M',modelName:'ChannelReceipt'},
  columns:Object.keys(row).map(name=>({name,type:name==='sources'?'object':'string',isPrimaryKey:name==='id'})),
  views:{default:{},...pageViews.ChannelReceipt},
 },SubmissionAttempt:{
  modelBinding:{modelId:'ATTEMPT',modelName:'SubmissionAttempt'},
  columns:Object.keys(candidateRow).map(name=>({name,type:'string',isPrimaryKey:name==='id'})),
  views:{default:{},receiptCandidates:pageViews.SubmissionAttempt.receiptCandidates},
 }}})
 const view=ds.getView('ChannelReceipt','originalPairing')
 if(!view)throw Error('TEST_RECEIPT_VIEW_REQUIRED')
 const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'ChannelReceipt'})
 let paused=false,successor=false
 let release:()=>void=()=>{}
 const gate=new Promise<void>(resolve=>{release=resolve})
 async function pause(branch:'receipt'|'candidate'):Promise<void>{
  if(mode!==branch||paused)return
  paused=true
  await gate
 }
 const save=vi.fn(async()=>{throw Error('NO_WRITE')})
 view.bindQueryExecutor({save,executeQuery:async()=>{
  const sourceRef=successor?'SUCCESSOR':'SOURCE'
  await pause('receipt')
  return new DataSpaceQueryContext({
   identity:table.identity,scope:'r',readScope:()=> 'r',snapshot:table.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...row,sources:[{sourceRef,knownAt:time}],lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
  })
 }})
 const candidateView=ds.getView('SubmissionAttempt','receiptCandidates')
 if(!candidateView)throw Error('TEST_RECEIPT_CANDIDATES_VIEW_REQUIRED')
 const attemptTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'SubmissionAttempt'})
 candidateView.bindQueryExecutor({save,executeQuery:async()=>{
  const id=successor?'SUCCESSOR':candidateRow.id
  await pause('candidate')
  return new DataSpaceQueryContext({
   identity:attemptTable.identity,scope:'attempts',readScope:()=> 'attempts',snapshot:attemptTable.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...candidateRow,id,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
  })
 }})
 const host={runtime:{resolveView:(key:string)=>key==='S@ChannelReceipt@originalPairing'?view:
  key==='S@SubmissionAttempt@receiptCandidates'?candidateView:undefined},
  scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 const original={...scope,attemptRef:'A',operationRef:'OP',objectRef:'PACKAGE'}
 try{
  const page=createContentSubmissionScriptHost({...host.runtime,generation:1,destroyed:false,isLoaded:true},host)
  const signal=new AbortController().signal
  if(mode!=='exact'){
   const result=page.invoke('content.submission.readReceipt',{receiptRef:'REC'},signal).then(value=>({value}),error=>({error}))
   await vi.waitFor(()=>expect(paused).toBe(true))
   successor=true
   const replaced=mode==='receipt'?view:candidateView
   await replaced.refresh()
   release()
   expect(await result).toEqual({error:expect.objectContaining({message:mode==='receipt'
    ?'CHANNEL_RECEIPT_READ_STALE':'CHANNEL_RECEIPT_CANDIDATE_STALE'})})
   const row=mode==='receipt'?{sources:[{sourceRef:'SUCCESSOR'}]}:{id:'SUCCESSOR'}
   expect(replaced.rows[0]).toMatchObject(row)
   expect(save).not.toHaveBeenCalled()
   return
  }
  const paired=await readRegisteredChannelReceiptPairing(host,'REC',async(input,receipt)=>{
   expect(input).toEqual(scope)
   expect(receipt).toEqual({eventRef:'EVENT',operationRef:'OP',objectRef:'PACKAGE'})
   return {attempts:[original],assertCurrent:()=>{}}
  })
  expect(paired).toMatchObject({state:'PAIRED',attemptRef:'A',sources:[{sourceRef:'SOURCE',knownAt:time}]})
  await expect(readRegisteredChannelReceiptPairing(host,'REC',async()=>({
   attempts:[{...original,withdrawalTargetRef:'OLD'}],assertCurrent:()=>{},
  }))).resolves.toMatchObject({state:'PENDING_PAIR',attemptRef:null})
  await expect(page.invoke('content.submission.readReceipt',{receiptRef:'REC'},signal)).resolves.toMatchObject({state:'PAIRED',attemptRef:'A'})
  expect(save).not.toHaveBeenCalled()
 }finally{release();ds.destroy()}
})
