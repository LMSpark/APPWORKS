import {expect,it,vi} from 'vitest'
import {createContentSubmissionScriptHost} from '@/views/features/application/smart-bid/authoring/entry/content-submission-script-host'
import {pairOriginalChannelReceipt} from '@/services/smart-bid/content/review/submission/channel-receipt-pairing'
import script from '@/views/features/application/smart-bid/authoring/page14/script.js?raw'
import {compileFunctions} from '../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../packages/spark-component/src/page/context/types'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
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
 const result={assignmentId:'A',fieldId:'F',observationRef:'OBS',state:'MISMATCHED' as const,observedValueHash:'a'.repeat(64),
  observedValueJson:'"实际值"',unit:null,
  assertCurrent:()=>{}}
 const batch={projectId:'P',revisionId:'R',attemptRef:'SEND',receiptRef:'REC',results:[result],allSelectedFieldsMatched:false,
  assertCurrent:()=>{if(!current)throw Error('BATCH_STALE')}}
 const unrelated=reconcileDeadlineFieldValues(source,[{...batch,attemptRef:'OTHER'}])
 expect(unrelated.items[0]).toMatchObject({state:'EFFECTIVE_ATTEMPT',fields:[{state:'PENDING'}]})
 const linked=reconcileDeadlineFieldValues(source,[batch])
 expect(linked.items[0]).toMatchObject({state:'EFFECTIVE_ATTEMPT',fields:[{state:'MISMATCHED',observationRef:'OBS',receiptRef:'REC'}]})
 expect(linked.items[1]).toMatchObject({state:'PENDING_DELIVERY',fields:[{state:'PENDING'}]})
 current=false
 expect(()=>linked.assertCurrent()).toThrow('BATCH_STALE')
})

it('shows the deadline batch separately from pending content and retains receipt proof',async()=>{
 const time='2026-11-18T10:00:00+08:00',scope={projectId:'P',lotId:'LOT',subjectId:'ENT',channelId:'PORTAL'}
 let receiptCurrent=true
 const current=()=>{}
 const receipt={...pairOriginalChannelReceipt(scope,[{...scope,eventRef:'EVENT',sourceRef:'SOURCE',kind:'RECEIVED',
  eventAt:time,knownAt:time,operationRef:'OP',objectRef:null}],[{...scope,attemptRef:'A',operationRef:'OP',objectRef:null}]),
 assertCurrent:()=>{if(!receiptCurrent)throw Error('RECEIPT_STALE')}}
 const row={...scope,id:'DL',roundId:'R',stageId:'STAGE',cutoffAt:time,knownAt:time,obligationIds:['O']}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{SubmissionReconciliation:{
  modelBinding:{modelId:'M',modelName:'SubmissionReconciliation'},
  columns:Object.keys(row).map(name=>({name,type:name==='obligationIds'?'object':'string',isPrimaryKey:name==='id'})),
  views:{default:{},originalDeadline:{commitMode:'staged',queryConfig:{autoQuery:false},scopeFilter:{logic:'and',
   filters:([['projectId','projectId'],['id','deadlineRef']] as const)
    .map(([field,ParamName])=>({field,operator:'eq',value:{Type:'GetInputParam',ParamName}}))}}},
 }}})
 const view=ds.getView('SubmissionReconciliation','originalDeadline')
 if(!view)throw Error('TEST_DEADLINE_VIEW_REQUIRED')
 const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'SubmissionReconciliation'})
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...row,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
 })})
 const page=createContentSubmissionScriptHost({resolveView:(key:string)=>key==='S@SubmissionReconciliation@originalDeadline'?view:undefined,
  generation:1,isLoaded:true,destroyed:false},{scenarioId:'S',projectId:'P',assertCurrent:current},async record=>{
  expect(record).toMatchObject({scope,roundId:'R',stageId:'STAGE',input:{cutoffAt:time,knownAt:time,obligationIds:['O']}})
  return {
   receipts:{scope,receipts:[receipt],decisions:[{kind:'RECEIVED',eventRef:'EVENT',obligationId:'O',attemptRef:'A',
    knownAt:time,effectiveAt:time,ruleRef:'RULE',assertCurrent:current}],assertCurrent:current},
   options:{contents:{projectId:'P',requiredMembers:[],links:[],requiredFields:[],assertCurrent:current},proofs:{packages:[],batches:[]}},
  }
 })
 const signal=new AbortController().signal,showAlert=vi.fn(async()=>{}),showMessage=vi.fn()
 try{
 await expect(page.invoke('content.submission.readDeadline',{deadlineRef:'OTHER'},signal)).rejects.toThrow('SUBMISSION_DEADLINE_READ_SCOPE')
 const {openDeadline}=compileFunctions(script,{$route:{query:{deadlineRef:'DL'}},$page:{
  invokeHostCommand:(name:string,params:unknown)=>page.invoke(name,params,signal),showAlert,showMessage,
 }} as unknown as PageContext)
 if(!openDeadline)throw Error('TEST_DEADLINE_HANDLER_REQUIRED')
 await openDeadline()
 expect(showAlert).toHaveBeenCalledExactlyOnceWith(`截止 ${time} · 证据截至 ${time}\nO · 有有效批次 A · 内容待核`,'截止有效组合')
 receiptCurrent=false
 await openDeadline()
 expect(showMessage).toHaveBeenCalledExactlyOnceWith('截止有效组合无法核验','warning')
 }finally{ds.destroy()}
})
