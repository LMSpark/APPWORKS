import {expect,it} from 'vitest'
import {checkSubmissionContents} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-preflight'
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
})
