import {expect,it} from 'vitest'
import {readReviewedResponseForCandidate,reviewResponseDraft} from '@/services/smart-bid/content/references/response/response-review'
import {prepareResponseDraft} from '@/services/smart-bid/content/references/response/response-draft'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'

it('requires verification of the exact AI-assisted position separately from the original response',async()=>{
 const scope={projectId:'P',baselineId:'B',assignmentId:'A',lineageId:'L',version:'V1',targetRef:'FIELD'}
 const assertCurrent=()=>{}
 const draft=prepareResponseDraft({...scope,authorRef:'AUTHOR',at:10,body:{statement:'按条款答复',data:{}}},{
  ...scope,task:{...scope,taskRef:'TASK',assignmentVersion:'A1',assigneeRef:'AUTHOR',dueAt:20,state:'ACCEPTED' as const,acceptance:{receiptRef:'ACCEPT',assignmentVersion:'A1',assigneeRef:'AUTHOR',acceptedAt:1},assertCurrent:()=>{}},allowedNodeIds:[],requiredEvidence:[],evidence:[],assertCurrent,
 })
 const {assertCurrent:_proof,...body}=draft
 const draftHash=await hashCanonicalSnapshotText(canonicalSnapshotValue(body))
 const contentHash=await hashCanonicalSnapshotText(canonicalSnapshotValue(draft.body))
 const position={positionRef:'FIELD',contentHash,requiresAiVerification:true}
 const check={...position,accepted:true,reviewRef:'R',aiVerificationRef:null,assertCurrent}
 const source={draftHash,reviewerRef:'REVIEWER',ruleVersionRef:'RULE',deviation:null,deviationAllowed:false,
  positions:[position],deferredPositionRefs:['FILE-FIELD'],assertCurrent}
 const pending=await reviewResponseDraft(draft,{...source,checks:[check]})
 expect(pending).toMatchObject({verified:false})
 const verified=await reviewResponseDraft(draft,{...source,checks:[{...check,aiVerificationRef:'AI'}]})
 expect(verified).toMatchObject({
  verified:true,deferredPositionRefs:['FILE-FIELD'],
 })
 expect(await readReviewedResponseForCandidate(scope,draft,verified)).toMatchObject({
  response:{assignmentId:'A',body:{statement:'按条款答复'}},deferredPositionRefs:['FILE-FIELD'],
 })
 await expect(readReviewedResponseForCandidate(scope,draft,pending)).rejects.toThrow('BID_RESPONSE_CANDIDATE_SCOPE')
 await expect(readReviewedResponseForCandidate(scope,{...draft,body:{statement:'换文',data:{}}},verified))
  .rejects.toThrow('BID_RESPONSE_CANDIDATE_VERSION')
 await expect(reviewResponseDraft(draft,{...source,checks:[{...check,contentHash:'b'.repeat(64)}]}))
  .rejects.toThrow('BID_RESPONSE_REVIEW_EVIDENCE')
 const otherPosition={...position,contentHash:'b'.repeat(64)}
 await expect(reviewResponseDraft(draft,{...source,positions:[otherPosition],checks:[{...check,...otherPosition}]}))
  .rejects.toThrow('BID_RESPONSE_REVIEW_VERSION')
 await expect(reviewResponseDraft(draft,{...source,deviation:'NONE',checks:[check]})).rejects.toThrow('BID_RESPONSE_REVIEW_SCOPE')
})
