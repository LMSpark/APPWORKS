import {expect,it,vi} from 'vitest'
import {comparePlatformFieldObservation,readPlatformFieldObservation,readPlatformFieldReviewVersion,readSubmittedPlatformField,readSubmittedPlatformFields} from '@/views/features/application/smart-bid/authoring/model/review/content-platform-field-review'
import script from '@/views/features/application/smart-bid/authoring/page12/script.js?raw'
import {contentProductionReviewScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/production/production-scenario-views'
import {contentSubmissionScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-scenario-views'
import {DataSet} from '@spark-appworks/spark-data'
import {createContentReviewScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-review-script-host'
import {DataSpaceQueryTable} from '@spark-appworks/spark-data'
import {DataSpaceQueryContext} from '@spark-appworks/spark-data'

it('pins approved proposed value to the exact adopted response and platform field',async()=>{
 const selection={projectId:'P',revisionId:'R',assignmentId:'A',fieldId:'F'}
 let current=true
 const original={...selection,responseId:'RESP',fieldRuleRef:'RULE',approvalRef:'APPROVAL',value:false,unit:null,
  assertCurrent:()=>{if(!current)throw Error('FIELD_SOURCE_STALE')}}
 const read=()=>readPlatformFieldReviewVersion(selection,async input=>{expect(input).toEqual(selection);return original})
 const version=await read()
 expect(version.versionHash).toMatch(/^[a-f0-9]{64}$/)
 expect((await read()).versionHash).toBe(version.versionHash)
 const changed=await readPlatformFieldReviewVersion(selection,async()=>({...original,approvalRef:'OTHER'}))
 expect(changed.versionHash).not.toBe(version.versionHash)
 await expect(readPlatformFieldReviewVersion(selection,async()=>({...original,revisionId:'OTHER'})))
  .rejects.toThrow('CONTENT_PLATFORM_FIELD_SCOPE')
 const observation={...selection,stage:'SAVED' as const,attemptRef:'SEND',observationRef:'OBS',value:false,unit:null,assertCurrent:()=>{}}
 expect((await comparePlatformFieldObservation(version,{stage:'SUBMITTED',attemptRef:'SEND'},observation))).toMatchObject({state:'STAGE_REQUIRED',observedStage:'SAVED',observedValueJson:'false'})
 const saved=await comparePlatformFieldObservation(version,{stage:'SAVED',attemptRef:'SEND'},observation)
 expect(saved.state).toBe('MATCHED')
 const submitted={...observation,stage:'SUBMITTED' as const}
 const expected={stage:'SUBMITTED' as const,attemptRef:'SEND'}
 expect((await comparePlatformFieldObservation(version,expected,submitted)).state).toBe('RECEIPT_REQUIRED')
 let receiptCurrent=true
 const submission={projectId:'P',revisionId:'R',attemptRef:'SEND',receiptRef:'RECEIPT',observationRefs:['OBS'],
  assertCurrent:()=>{if(!receiptCurrent)throw Error('RECEIPT_STALE')}}
 await expect(comparePlatformFieldObservation(version,{...expected,submission:{...submission,observationRefs:['OTHER']}},submitted))
  .rejects.toThrow('CONTENT_PLATFORM_FIELD_RECEIPT_SCOPE')
 const compared=await comparePlatformFieldObservation(version,{...expected,submission},submitted)
 expect(compared).toMatchObject({state:'MATCHED',receiptRef:'RECEIPT'})
 receiptCurrent=false
 expect(()=>compared.assertCurrent()).toThrow('RECEIPT_STALE')
 expect((await comparePlatformFieldObservation(version,{stage:'SAVED',attemptRef:'SEND'},{...observation,value:'false'})).state).toBe('MISMATCHED')
 await expect(comparePlatformFieldObservation(version,{stage:'SAVED',attemptRef:'OTHER'},observation))
  .rejects.toThrow('CONTENT_PLATFORM_FIELD_OBSERVATION_SCOPE')
 current=false
 expect(()=>version.assertCurrent()).toThrow('FIELD_SOURCE_STALE')
 expect(()=>saved.assertCurrent()).toThrow('FIELD_SOURCE_STALE')
})

it('reads the original AnswerLocation through the scoped DataView and retains its proof',async()=>{
 const selection={projectId:'P',revisionId:'R',assignmentId:'A',fieldId:'F'}
 const approved=await readPlatformFieldReviewVersion(selection,async()=>({...selection,responseId:'RESP',fieldRuleRef:'RULE',
  approvalRef:'APP',value:false,unit:null,assertCurrent:()=>{}}))
 const row={id:'OBS',...selection,attemptRef:'SEND',stage:'SAVED',value:false,unit:null}
 const receiptRow={id:'REC',projectId:'P',revisionId:'R',attemptRef:'SEND',eventKind:'RECEIVED',observationRefs:['OBS']}
 const {AnswerLocation}=contentProductionReviewScenarioViews()
 const {ChannelReceipt}=contentSubmissionScenarioViews({
  SubmissionAttempt:'id',ChannelReceipt:'id',SubmissionReconciliation:'id',TenderOutcome:'id',
 })
 const ds=DataSet.fromJson({scenarioId:'S',tables:{AnswerLocation:{
  modelBinding:{modelId:'M',modelName:'AnswerLocation'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},selectedPlatformObservation:AnswerLocation.selectedPlatformObservation,
   submittedPlatformObservations:AnswerLocation.submittedPlatformObservations},
 },ChannelReceipt:{
  modelBinding:{modelId:'REC_MODEL',modelName:'ChannelReceipt'},columns:Object.keys(receiptRow).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},selectedPlatformReceipt:ChannelReceipt.selectedPlatformReceipt},
 }}})
 const view=ds.getView('AnswerLocation','selectedPlatformObservation')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'AnswerLocation'})
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...row,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
 })})
 const receipt=ds.getView('ChannelReceipt','selectedPlatformReceipt')!,receipts=new DataSpaceQueryTable({scenarioId:'S',metaName:'ChannelReceipt'})
 const batch=ds.getView('AnswerLocation','submittedPlatformObservations')!
 batch.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:2,Items:[{...row,id:'OBS2',fieldId:'F2',value:true},row].map(item=>({...item,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}))}}}),
 })})
 receipt.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:receipts.identity,scope:'q',readScope:()=> 'q',snapshot:receipts.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...receiptRow,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
 })})
 const views=new Map([['S@ChannelReceipt@selectedPlatformReceipt',receipt],['S@AnswerLocation@selectedPlatformObservation',view],
  ['S@AnswerLocation@submittedPlatformObservations',batch]])
 const host={runtime:{resolveView:(key:string)=>views.get(key)},
  scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 try{
  const input={observationId:'OBS',attemptRef:'SEND',stage:'SAVED' as const}
  const unused=async()=>{throw Error('UNEXPECTED_REVIEW_CALL')}
  const observationInput:Parameters<typeof readPlatformFieldObservation>[2]=input
  const page=createContentReviewScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host,{
   readSelection:unused,openFile:unused,readField:unused,readDecision:unused,readCompleted:unused,
   readObservationSelection:async()=>({approved,input:observationInput,assertCurrent:host.assertCurrent}),
  })
  const signal=new AbortController().signal
  await expect(page.invoke('content.review.readPlatformObservation',{selectionRef:'OTHER'},signal))
   .rejects.toThrow('CONTENT_REVIEW_PAGE_SELECTION_SCOPE')
  const result=await page.invoke('content.review.readPlatformObservation',{selectionRef:'OBS'},signal)
  expect(result).toMatchObject({state:'MATCHED',observedValueJson:'false',unit:null})
  expect((await readPlatformFieldObservation(host,approved,{...input,stage:'SUBMITTED'})).state).toBe('STAGE_REQUIRED')
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  row.stage='SUBMITTED'
  const request={observationId:'OBS',receiptRef:'REC',attemptRef:'SEND'}
  expect(request.observationId).toBe('OBS')
 }finally{ds.destroy()}
})
