/**
 * @module app:services/smart-bid/content/references/response/response-review
 * 职责：动作37核对原拟答、本次复核位置及其证明和验证引用。
 */
import type {prepareResponseDraft} from './response-draft'
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../../revision-snapshot-hash'

type Draft=ReturnType<typeof prepareResponseDraft>
type Position=Readonly<{positionRef:string;contentHash:string;requiresAiVerification:boolean}>
type Check=Pick<Position,'positionRef'|'contentHash'>&Readonly<{
 accepted:boolean;reviewRef:string;aiVerificationRef:string|null;assertCurrent:()=>void
}>

/** 明确复核的每个位置须关联本版原文及证据，制件后位置另列。 */
export async function reviewResponseDraft(draft:Draft,source:Readonly<{
 draftHash:string;reviewerRef:string;ruleVersionRef:string
 deviation:'NONE'|'POSITIVE'|'NEGATIVE'|null;deviationAllowed:boolean
 positions:readonly Position[];checks:readonly Check[];deferredPositionRefs:readonly string[];assertCurrent:()=>void
}>){
 const checks=source.checks.map(check=>({...check}))
 const assertSource=()=>{draft.assertCurrent();source.assertCurrent();for(const check of checks)check.assertCurrent()}
 assertSource()
 const positionsInput=source.positions.map(position=>({...position}))
 const deferredPositionRefs=Object.freeze([...source.deferredPositionRefs])
 const {reviewerRef,ruleVersionRef,deviation,deviationAllowed,draftHash:expectedDraftHash}=source
 const {assertCurrent:_proof,...document}=draft
 const documentText=canonicalSnapshotValue(document)
 const assertCurrent=()=>{
  assertSource()
  if(canonicalSnapshotValue(document)!==documentText)throw Error('BID_RESPONSE_REVIEW_VERSION')
 }
 const [draftHash,bodyHash]=await Promise.all([
  hashCanonicalSnapshotText(documentText),
  'chapterId' in draft.body?null:hashCanonicalSnapshotText(canonicalSnapshotValue(draft.body)),
 ])
 assertCurrent()
 if(draftHash!==expectedDraftHash||![reviewerRef,ruleVersionRef].every(identity)||
  (deviation!==null&&(!deviationAllowed||!['NONE','POSITIVE','NEGATIVE'].includes(deviation))))
  throw Error('BID_RESPONSE_REVIEW_SCOPE')
 const positions=new Map(positionsInput.map(item=>[item.positionRef,item]))
 if(!positions.size||positions.size!==positionsInput.length||positionsInput.some(item=>
  !identity(item.positionRef)||!/^[a-f0-9]{64}$/u.test(item.contentHash)||typeof item.requiresAiVerification!=='boolean')||
  !deferredPositionRefs.every(identity)||new Set(deferredPositionRefs).size!==deferredPositionRefs.length)
  throw Error('BID_RESPONSE_REVIEW_POSITIONS')
 if(bodyHash!==null&&positions.get(draft.targetRef)?.contentHash!==bodyHash)throw Error('BID_RESPONSE_REVIEW_VERSION')
 const byPosition=new Map<string,Check>()
 for(const check of checks){
  const position=positions.get(check.positionRef)
  if(!position||byPosition.has(check.positionRef)||check.contentHash!==position.contentHash||!identity(check.reviewRef)||
   typeof check.accepted!=='boolean'||(check.aiVerificationRef!==null&&!identity(check.aiVerificationRef)))
   throw Error('BID_RESPONSE_REVIEW_EVIDENCE')
  byPosition.set(check.positionRef,check)
 }
 const results=Object.freeze(positionsInput.map(position=>{
  const check=byPosition.get(position.positionRef)
  const verified=check?.accepted===true&&(!position.requiresAiVerification||check.aiVerificationRef!==null)
  return Object.freeze({positionRef:position.positionRef,contentHash:position.contentHash,verified,reviewRef:check?.reviewRef??null,
   aiVerificationRef:check?.aiVerificationRef??null})
 }))
 return Object.freeze({draftHash,assignmentId:draft.assignmentId,targetRef:draft.targetRef,
  reviewerRef,ruleVersionRef,verified:results.every(item=>item.verified),deviation,positions:results,
  deferredPositionRefs,assertCurrent})
}

/** 候选只取同分工、同落点的已核拟答，仍携带制件后待核位置。 */
export async function readReviewedResponseForCandidate(
 target:Readonly<{projectId:string;baselineId:string;assignmentId:string;targetRef:string}>,
 draft:Draft,review:Awaited<ReturnType<typeof reviewResponseDraft>>,
){
 const assertCurrent=()=>{draft.assertCurrent();review.assertCurrent()}
 assertCurrent()
 if(draft.projectId!==target.projectId||draft.baselineId!==target.baselineId||
  draft.assignmentId!==target.assignmentId||draft.targetRef!==target.targetRef||
  review.assignmentId!==target.assignmentId||review.targetRef!==target.targetRef||!review.verified)
  throw Error('BID_RESPONSE_CANDIDATE_SCOPE')
 const {assertCurrent:_proof,...record}=draft
 const snapshot=structuredClone(record)
 const snapshotText=canonicalSnapshotValue(snapshot)
 const reviewRecord=Object.freeze({draftHash:review.draftHash,reviewerRef:review.reviewerRef,
  ruleVersionRef:review.ruleVersionRef,deviation:review.deviation,positions:review.positions,
  deferredPositionRefs:review.deferredPositionRefs})
 const [draftHash,reviewHash]=await Promise.all([
  hashCanonicalSnapshotText(snapshotText),
  hashCanonicalSnapshotText(canonicalSnapshotValue(reviewRecord)),
 ])
 if(draftHash!==review.draftHash)
  throw Error('BID_RESPONSE_CANDIDATE_VERSION')
 assertCurrent()
 return Object.freeze({response:snapshot,draftHash,reviewHash,reviewRecord,deviation:review.deviation,
  reviewedPositions:review.positions,deferredPositionRefs:review.deferredPositionRefs,assertCurrent:()=>{
   assertCurrent()
   if(canonicalSnapshotValue(snapshot)!==snapshotText)throw Error('BID_RESPONSE_CANDIDATE_VERSION')
  }})
}
