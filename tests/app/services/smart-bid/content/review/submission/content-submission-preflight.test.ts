import {expect,it} from 'vitest'
import {checkRepresentedSubmission,checkSubmissionContents,checkSubmissionStart} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-preflight'
import {prepareAuthorityGrantDecision} from '@/services/smart-bid/content/review/submission/authority-grant-decision'
import {recoverSubmissionAttempt} from '@/services/smart-bid/content/review/submission-attempt-recovery'
import {readPlatformFieldReviewVersion} from '@/views/features/application/smart-bid/authoring/model/review/content-platform-field-review'

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
 expect(checkSubmissionStart(checked,{...channel,includesClose:true}).state).toBe('READY')
 const originalScope={projectId,lotId:'LOT',subjectId:'ORG',channelId:'PORTAL',attemptRef:'OLD',requestDigest:'a'.repeat(64)}
 const unknown=recoverSubmissionAttempt(originalScope,{events:[],assertCurrent})
 expect(checkSubmissionStart(checked,{...channel,includesClose:true,prior:unknown}).state)
  .toBe('ORIGINAL_PENDING')
 const terminated=recoverSubmissionAttempt(originalScope,{events:[{...originalScope,
  eventRef:'TERM',kind:'NOT_EXECUTED',assertCurrent}],assertCurrent})
 expect(checkSubmissionStart(checked,{...channel,includesClose:true,prior:terminated}).state).toBe('READY')
 expect(()=>checkSubmissionStart(checked,{...channel,channelId:'OTHER',prior:terminated})).toThrow('SUBMISSION_START_SCOPE')
})
