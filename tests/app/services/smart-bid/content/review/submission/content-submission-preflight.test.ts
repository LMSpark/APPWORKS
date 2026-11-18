import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {createContentSubmissionScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-submission-script-host'
import script from '@/views/features/application/smart-bid/authoring/page13/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'
import {checkRepresentedSubmission,checkSubmissionContents,checkSubmissionStart,prepareSubmissionRequest} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-preflight'
import {prepareAuthorityGrantDecision} from '@/services/smart-bid/content/review/submission/authority-grant-decision'
import {recoverSubmissionAttempt} from '@/services/smart-bid/content/review/submission-attempt-recovery'
import {readPlatformFieldReviewVersion} from '@/views/features/application/smart-bid/authoring/model/review/content-platform-field-review'
import {readRegisteredSubmissionRequest} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-request-reader'
import {contentSubmissionScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-scenario-views'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

async function verifyPreparedRequestReadback(prepared:Awaited<ReturnType<typeof prepareSubmissionRequest>>){
 const {projectId,attemptRef,requestKey}=prepared.record
 const {requestDigest}=prepared
 const requestPayload:unknown=JSON.parse(JSON.stringify(prepared.record))
 const row={id:attemptRef,projectId,requestKey,requestDigest,requestPayload}
 const scenarioId='S'
 const {SubmissionAttempt}=contentSubmissionScenarioViews({SubmissionAttempt:'id',ChannelReceipt:'id',
  SubmissionReconciliation:'id',TenderOutcome:'id'})
 const ds=DataSet.fromJson({scenarioId,tables:{SubmissionAttempt:{
  modelBinding:{modelId:'M',modelName:'SubmissionAttempt'},
  columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalRequest:SubmissionAttempt.originalRequest},
 }}})
 try{
  const view=ds.getView('SubmissionAttempt','originalRequest')
  if(!view)throw Error('TEST_SUBMISSION_REQUEST_VIEW_REQUIRED')
  const table=new DataSpaceQueryTable({scenarioId,metaName:'SubmissionAttempt'})
  view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'request',readScope:()=> 'request',snapshot:table.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...row,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
  })})
  const host={runtime:{resolveView:(key:string)=>key==='S@SubmissionAttempt@originalRequest'?view:undefined},
   scenarioId,projectId,assertCurrent:()=>{}}
  const original={projectId,attemptRef,requestKey,requestDigest}
  const recovered=await readRegisteredSubmissionRequest(host,original)
  expect(recovered).toMatchObject({...original,state:'REGISTERED',lotId:prepared.record.objectRef,
   subjectId:prepared.record.enterpriseId,channelId:prepared.record.channelId,priorAttemptRef:prepared.record.priorAttemptRef})
  row.requestPayload={...prepared.record,fields:prepared.record.fields.map(field=>({...field,savedReadbackRequired:false}))}
  await expect(readRegisteredSubmissionRequest(host,original)).rejects.toThrow('SUBMISSION_REQUEST_READ_CONFLICT')
  expect(()=>recovered.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{ds.destroy()}
}

it('holds a mixed submission until the original package and same-attempt saved field both pass',async()=>{
 const assertCurrent=()=>{},projectId='P',revisionId='R',attemptRef='SEND'
 const scope={projectId,revisionId,assignmentId:'A',fieldId:'F'}
 const version=await readPlatformFieldReviewVersion(scope,async input=>({...input,responseId:'ADOPTED',fieldRuleRef:'RULE',
  approvalRef:'APPROVED',value:16,unit:null,assertCurrent}))
 const second=await readPlatformFieldReviewVersion({...scope,fieldId:'F2'},async input=>({...input,responseId:'ADOPTED2',
  fieldRuleRef:'RULE2',approvalRef:'APPROVED',value:26,unit:null,assertCurrent}))
 const pack={projectId,packageId:'PKG',packageHash:'a'.repeat(64),selectionHash:'b'.repeat(64),deliverable:true,decisions:[],assertCurrent}
 const request={projectId,revisionId,attemptRef,package:pack,assertCurrent,fields:[
  {assignmentId:'A',fieldId:'F',versionHash:version.versionHash,savedReadbackRequired:true},
  {assignmentId:'A',fieldId:'F2',versionHash:second.versionHash,savedReadbackRequired:false},
 ]}
 const observed={...scope,attemptRef,stage:'SAVED' as const,observationRef:'REC',value:16,unit:null,assertCurrent}
 const sources={release:pack,fields:[version,second],observations:[observed]}
 expect(await checkSubmissionContents(request,{...sources,release:null})).toMatchObject({contentsReady:false,packageReady:false})
 expect(await checkSubmissionContents(request,{...sources,observations:[{...observed,value:35}]}))
  .toMatchObject({contentsReady:false,fields:[{state:'MISMATCHED'},{state:'POST_SUBMISSION_REQUIRED'}]})
 await expect(checkSubmissionContents(request,{...sources,observations:[{...observed,attemptRef:'OLD'}]}))
  .rejects.toThrow('SUBMISSION_PREFLIGHT_SCOPE')
 await expect(checkSubmissionContents({...request,fields:request.fields.map(field=>
  ({...field,savedReadbackRequired:undefined as unknown as boolean}))},{...sources,observations:[]}))
  .rejects.toThrow('SUBMISSION_PREFLIGHT_SCOPE')
 expect(await checkSubmissionContents(request,sources)).toMatchObject({contentsReady:true,packageReady:true,
  fields:[{state:'MATCHED'},{state:'POST_SUBMISSION_REQUIRED'}]})
 const at='2026-11-18T10:00:00+08:00'
 const operation={enterpriseId:'ORG',grantId:'G',representativeId:'REP',objectRef:'LOT',actionAt:at,knownAt:at,assertCurrent}
 const grant={enterpriseId:'ORG',grantId:'G',requestKey:'GRANT-Q',expectedVersion:null,intent:'REGISTER' as const,decisionRef:'DEC'}
 const original={...grant,representativeId:'REP',projectId,decisionMakerId:'ISSUER',decisionAuthorityRef:'AUTH',
  objectRefs:['LOT'],effectiveAt:at,knownAt:at,expiresAt:'2026-11-18T11:00:00+08:00',assertCurrent}
 const represented=async(actions:string[])=>{
  const record=await prepareAuthorityGrantDecision(grant,{...original,actions})
  return checkRepresentedSubmission(request,{contents:sources,operation,authority:{versions:[{...record,versionId:'V1'}],assertCurrent}})
 }
 expect(await represented(['WITHDRAW'])).toMatchObject({contents:{contentsReady:true},authorizedContentsReady:false})
 const checked=await represented(['SUBMIT'])
 expect(checked).toMatchObject({authority:{state:'COVERED'},authorizedContentsReady:true})
 const channel={projectId,objectRef:'LOT',channelId:'PORTAL',attemptRef,openedAt:'2026-11-18T09:00:00+08:00',
  closesAt:at,includesClose:false,windowEvidenceRef:'WINDOW',prior:null,assertCurrent}
 expect(checkSubmissionStart(checked,channel).state).toBe('OUTSIDE_WINDOW')
 expect(()=>checkSubmissionStart(checked,{...channel,includesClose:'false' as unknown as boolean}))
  .toThrow('SUBMISSION_START_WINDOW')
 expect(checkSubmissionStart(checked,{...channel,includesClose:true}).state).toBe('READY')
 const originalScope={projectId,lotId:'LOT',subjectId:'ORG',channelId:'PORTAL',attemptRef:'OLD',requestDigest:'a'.repeat(64)}
 const unknown=recoverSubmissionAttempt(originalScope,{events:[],assertCurrent})
 expect(checkSubmissionStart(checked,{...channel,includesClose:true,prior:unknown}).state)
  .toBe('ORIGINAL_PENDING')
 const terminated=recoverSubmissionAttempt(originalScope,{events:[{...originalScope,
  eventRef:'TERM',kind:'NOT_EXECUTED',assertCurrent}],assertCurrent})
 expect(checkSubmissionStart(checked,{...channel,includesClose:true,prior:terminated}).state).toBe('READY')
 expect(()=>checkSubmissionStart(checked,{...channel,channelId:'OTHER',prior:terminated})).toThrow('SUBMISSION_START_SCOPE')
 const start=checkSubmissionStart(checked,{...channel,includesClose:true,prior:terminated})
 const prepared=await prepareSubmissionRequest(start,'REQUEST')
 expect(prepared.record).toMatchObject({attemptRef,priorAttemptRef:'OLD',authorityVersionId:'V1',
  package:{packageId:'PKG',packageHash:pack.packageHash},fields:[{versionHash:version.versionHash},{versionHash:second.versionHash}]})
 expect((await prepareSubmissionRequest(start,'REQUEST')).requestDigest).toBe(prepared.requestDigest)
 expect((await prepareSubmissionRequest(start,'OTHER')).requestDigest).not.toBe(prepared.requestDigest)
 await expect(prepareSubmissionRequest(checkSubmissionStart(checked,{...channel,prior:unknown}),'REQUEST'))
  .rejects.toThrow('SUBMISSION_REQUEST_NOT_READY')
 const decision=await prepareAuthorityGrantDecision(grant,{...original,actions:['SUBMIT']})
 const representation={contents:sources,operation,authority:{versions:[{...decision,versionId:'V1'}],assertCurrent}}
 const targetScope={...originalScope,attemptRef:'WITHDRAW_TARGET'}
 const target=recoverSubmissionAttempt(targetScope,{events:[{...targetScope,kind:'DISPATCHED',actualObjectRef:'OLD_PACKAGE',
  eventRef:'OLD_DISPATCH',assertCurrent}],assertCurrent})
 const withdrawalGrant=await prepareAuthorityGrantDecision(grant,{...original,actions:['WITHDRAW']})
 const combinedWithdrawal={target,ruleRef:'COMBINED_RULE',allowed:true,grantId:'G',knownAt:at,
  authority:{versions:[{...withdrawalGrant,versionId:'W1'}],assertCurrent},assertCurrent}
 const combinedChannel={...channel,includesClose:true,prior:terminated,combinedWithdrawal}
 const combined=await prepareSubmissionRequest(checkSubmissionStart(checked,combinedChannel),'REQUEST')
 expect(combined.record).toMatchObject({combinedWithdrawalTarget:'WITHDRAW_TARGET',priorAttemptRef:'OLD',
  withdrawalEvidenceRef:'OLD_DISPATCH',withdrawalAuthorityVersionId:'W1',withdrawalRuleRef:'COMBINED_RULE'})
 expect(combined.requestDigest).not.toBe(prepared.requestDigest)
 await verifyPreparedRequestReadback(combined)
 expect(checkSubmissionStart(checked,{...combinedChannel,combinedWithdrawal:{...combinedWithdrawal,authority:representation.authority}})
  .state).toBe('NOT_READY')
 expect(()=>checkSubmissionStart(checked,{...combinedChannel,combinedWithdrawal:{...combinedWithdrawal,target:terminated}}))
  .toThrow('SUBMISSION_COMBINED_WITHDRAWAL_SCOPE')
 let prior=terminated, selectedProject=projectId
 let hasWithdrawalEvidence=false
 const readSubmissionPreparation=vi.fn(async()=>({contents:{...request,projectId:selectedProject},representation,
  channel:{...channel,includesClose:true,prior,...(hasWithdrawalEvidence?{combinedWithdrawal}:{})}}))
 const runtime={resolveView:()=>undefined,generation:1,isLoaded:true,destroyed:false}
 const page=createContentSubmissionScriptHost(runtime,{projectId,scenarioId:'S',assertCurrent},{readSubmissionPreparation})
 const signal=new AbortController().signal,showAlert=vi.fn(async()=>{}),showMessage=vi.fn()
 const query={plannedAttemptRef:attemptRef,plannedRequestKey:'REQUEST',plannedWithdrawalTarget:undefined as string|undefined}
 const {openSubmissionPreparation}=compileFunctions(script,{$route:{query},
  $page:{invokeHostCommand:(name:string,input:unknown)=>page.invoke(name,input,signal),showAlert,showMessage}} as unknown as PageContext)
 if(!openSubmissionPreparation)throw Error('TEST_PREPARATION_HANDLER_REQUIRED')
 await openSubmissionPreparation()
 expect(readSubmissionPreparation).toHaveBeenCalledWith({projectId,attemptRef,requestKey:'REQUEST',combinedWithdrawalTarget:null},signal)
 expect(showAlert).toHaveBeenLastCalledWith(`待发请求已生成，待登记 · REQUEST · 摘要 ${prepared.requestDigest}`,'递交前核验')
 await verifyPreparedRequestReadback(prepared)
 prior=unknown
 await openSubmissionPreparation()
 expect(showAlert).toHaveBeenLastCalledWith('原办理结果待查','递交前核验')
 prior=terminated
 query.plannedWithdrawalTarget='WITHDRAW_TARGET'
 await openSubmissionPreparation()
 expect(showMessage).toHaveBeenCalledWith('待发请求无法核验','warning')
 showMessage.mockClear()
 hasWithdrawalEvidence=true
 await openSubmissionPreparation()
 expect(readSubmissionPreparation).toHaveBeenLastCalledWith(
  {projectId,attemptRef,requestKey:'REQUEST',combinedWithdrawalTarget:'WITHDRAW_TARGET'},signal)
 expect(showAlert).toHaveBeenLastCalledWith(
  `待发请求已生成，待登记 · REQUEST · 拟撤回 WITHDRAW_TARGET · 摘要 ${combined.requestDigest}`,'递交前核验')
 selectedProject='OTHER'
 await openSubmissionPreparation()
 expect(showMessage).toHaveBeenCalledWith('待发请求无法核验','warning')
})
