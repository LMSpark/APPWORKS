import {expect,it,vi} from 'vitest'
import {createContentSubmissionScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-submission-script-host'
import {pairOriginalChannelReceipt} from '@/services/smart-bid/content/review/submission/channel-receipt-pairing'
import script from '@/views/features/application/smart-bid/authoring/page14/script.js?raw'
import {DataSet} from '@spark-appworks/spark-data'
import {contentSubmissionScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-scenario-views'
import {DataSpaceQueryTable} from '@spark-appworks/spark-data'
import {DataSpaceQueryContext} from '@spark-appworks/spark-data'
import {reconcileSubmissionDeadline} from '@/services/smart-bid/content/review/submission-reconciliation'
import {reconcileDeadlineFieldValues} from '@/views/features/application/smart-bid/authoring/model/review/deadline/content-deadline-field-reconciliation'

it('retains deadline reception while leaving nonmatching attempts and missing field observations pending',()=>{
 const time='2026-11-18T10:00:00+08:00'
 const deadline=reconcileSubmissionDeadline({cutoffAt:time,knownAt:time,obligationIds:['O1','O2'],effects:[
  {kind:'RECEIVED',eventRef:'E',obligationId:'O1',attemptRef:'SEND',effectiveAt:time,knownAt:time},
 ]})
 const source={projectId:'P',deadline,requiredFields:[{obligationId:'O1',assignmentId:'A',fieldId:'F'},
  {obligationId:'O2',assignmentId:'A',fieldId:'F'}],assertCurrent:()=>{}}
 let current=true
 const result={receiptRef:'REC',approvalRef:'APP',attemptRef:'SEND',observedStage:'SUBMITTED' as const,expectedStage:'SUBMITTED' as const,assignmentId:'A',fieldId:'F',observationRef:'OBS',state:'MISMATCHED' as const,observedValueHash:'a'.repeat(64),
  observedValueJson:'"实际值"',unit:null,
  assertCurrent:()=>{}}
 const batch={projectId:'P',revisionId:'R',attemptRef:'SEND',receiptRef:'REC',results:[result],allSelectedFieldsMatched:false,
  assertCurrent:()=>{if(!current)throw Error('BATCH_STALE')}}
 const unrelated=reconcileDeadlineFieldValues(source,[{...batch,attemptRef:'OTHER',results:[{...result,attemptRef:'OTHER'}]}])
 expect(unrelated.items[0]).toMatchObject({state:'EFFECTIVE_ATTEMPT',fields:[{state:'PENDING'}]})
 const linked=reconcileDeadlineFieldValues(source,[batch])
 expect(linked.items[0]).toMatchObject({state:'EFFECTIVE_ATTEMPT',fields:[{state:'MISMATCHED',observationRef:'OBS',receiptRef:'REC'}]})
 expect(linked.items[1]).toMatchObject({state:'PENDING_DELIVERY',fields:[{state:'PENDING'}]})
 expect(()=>reconcileDeadlineFieldValues(source,[{...batch,attemptRef:'OTHER'}]))
  .toThrow('SUBMISSION_FIELD_RECONCILIATION_SCOPE')
 expect(()=>reconcileDeadlineFieldValues(source,[{...batch,results:[{...result,receiptRef:'OTHER'}]}]))
  .toThrow('SUBMISSION_FIELD_RECONCILIATION_SCOPE')
 const pending=reconcileDeadlineFieldValues(source,[{...batch,results:[{...result,state:'STAGE_REQUIRED',observedStage:'SAVED'}]}])
 expect(pending.items[0]).toMatchObject({state:'EFFECTIVE_ATTEMPT',
  fields:[{state:'PENDING',observationRef:'OBS',receiptRef:null}]})
 current=false
 expect(()=>linked.assertCurrent()).toThrow('BATCH_STALE')
})

it('shows the deadline batch separately from pending content and retains receipt proof',async()=>{
 const time='2026-11-18T10:00:00+08:00',scope={projectId:'P',lotId:'LOT',subjectId:'ENT',channelId:'PORTAL'}
 const receiptCurrent=true
 const includeDisposition=false
 const current=()=>{}
 const receipt={...pairOriginalChannelReceipt(scope,[{...scope,eventRef:'EVENT',sourceRef:'SOURCE',kind:'RECEIVED',
  eventAt:time,knownAt:time,operationRef:'OP',objectRef:null}],[{...scope,attemptRef:'A',operationRef:'OP',objectRef:null}]),
 assertCurrent:()=>{if(!receiptCurrent)throw Error('RECEIPT_STALE')}}
 const row={...scope,id:'DL',roundId:'R',stageId:'STAGE',cutoffAt:time,knownAt:time,obligationIds:['O']}
 const packageHash='a'.repeat(64),later='2026-11-18T11:00:00+08:00'
 const binding={...scope,roundId:'R',attemptRef:'A',objectRef:'PKG',packageHash,assertCurrent:current}
 const disposition={binding,source:{knownAt:later,assertCurrent:current,records:[{...binding,eventRef:'OPEN',
  issuerRef:'ISSUER',eventAt:later,knownAt:later,stage:'OPENING' as const,state:'OPEN_FAILED' as const}]}}
 const pageViews=contentSubmissionScenarioViews({SubmissionAttempt:'id',ChannelReceipt:'id',SubmissionReconciliation:'id',TenderOutcome:'id'})
 const ds=DataSet.fromJson({scenarioId:'S',tables:{SubmissionReconciliation:{
  modelBinding:{modelId:'M',modelName:'SubmissionReconciliation'},
  columns:Object.keys(row).map(name=>({name,type:name==='obligationIds'?'object':'string',isPrimaryKey:name==='id'})),
  views:{default:{},...pageViews.SubmissionReconciliation},
 }}})
 const view=ds.getView('SubmissionReconciliation','originalDeadline')
 if(!view)throw Error('TEST_DEADLINE_VIEW_REQUIRED')
 const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'SubmissionReconciliation'})
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...row,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
 })})
 const page=createContentSubmissionScriptHost({resolveView:(key:string)=>key==='S@SubmissionReconciliation@originalDeadline'?view:undefined,
  generation:1,isLoaded:true,destroyed:false},{scenarioId:'S',projectId:'P',assertCurrent:current},{readDeadline:async record=>{
  expect(record).toMatchObject({scope,roundId:'R',stageId:'STAGE',input:{cutoffAt:time,knownAt:time,obligationIds:['O']}})
  return {
   ...(includeDisposition?{dispositions:[disposition]}:{}),
   receipts:{scope,receipts:[receipt],decisions:[{kind:'RECEIVED',eventRef:'EVENT',obligationId:'O',attemptRef:'A',
    knownAt:time,effectiveAt:time,ruleRef:'RULE',assertCurrent:current}],assertCurrent:current},
   options:{contents:{projectId:'P',requiredMembers:[{obligationId:'O',position:'商务册'}],
    links:includeDisposition?[{obligationId:'O',position:'商务册',attemptRef:'A',packageId:'PKG',packageHash,assertCurrent:current}]:[],
    requiredFields:[{obligationId:'O',assignmentId:'ASSIGN',fieldId:'PRICE'}],assertCurrent:current},
   proofs:{packages:includeDisposition?[{projectId:'P',packageId:'PKG',packageHash,membershipMatches:false,members:[],assertCurrent:current}]:[],batches:[]}},
  }
 }})
 const signal=new AbortController().signal,showAlert=vi.fn(async()=>{}),showMessage=vi.fn()
 await expect(page.invoke('content.submission.readDeadline',{deadlineRef:'OTHER'},signal)).rejects.toThrow('SUBMISSION_DEADLINE_READ_SCOPE')
 await expect(page.invoke('content.submission.readDeadline',{deadlineRef:'DL'},signal)).resolves.toMatchObject({
  scope,roundId:'R',cutoffAt:time,knownAt:time,
  items:[{obligationId:'O',state:'EFFECTIVE_ATTEMPT',attemptRef:'A',contentState:'PENDING'}],
 })
})
