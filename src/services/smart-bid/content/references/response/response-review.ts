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
 const checks=[...source.checks]
 const assertCurrent=()=>{draft.assertCurrent();source.assertCurrent();for(const check of checks)check.assertCurrent()}
 assertCurrent()
 const {assertCurrent:_proof,...document}=draft
 const draftHash=await hashCanonicalSnapshotText(canonicalSnapshotValue(document))
 assertCurrent()
 if(draftHash!==source.draftHash||![source.reviewerRef,source.ruleVersionRef].every(identity)||
  (source.deviation!==null&&(!source.deviationAllowed||!['NONE','POSITIVE','NEGATIVE'].includes(source.deviation))))
  throw Error('BID_RESPONSE_REVIEW_SCOPE')
 const positions=new Map(source.positions.map(item=>[item.positionRef,item]))
 if(!positions.size||positions.size!==source.positions.length||source.positions.some(item=>
  !identity(item.positionRef)||!/^[a-f0-9]{64}$/u.test(item.contentHash)||typeof item.requiresAiVerification!=='boolean')||
  !source.deferredPositionRefs.every(identity)||new Set(source.deferredPositionRefs).size!==source.deferredPositionRefs.length)
  throw Error('BID_RESPONSE_REVIEW_POSITIONS')
 const byPosition=new Map<string,Check>()
 for(const check of checks){
  const position=positions.get(check.positionRef)
  if(!position||byPosition.has(check.positionRef)||check.contentHash!==position.contentHash||!identity(check.reviewRef)||
   typeof check.accepted!=='boolean'||(check.aiVerificationRef!==null&&!identity(check.aiVerificationRef)))
   throw Error('BID_RESPONSE_REVIEW_EVIDENCE')
  byPosition.set(check.positionRef,check)
 }
 const results=Object.freeze(source.positions.map(position=>{
  const check=byPosition.get(position.positionRef)
  const verified=check?.accepted===true&&(!position.requiresAiVerification||check.aiVerificationRef!==null)
  return Object.freeze({positionRef:position.positionRef,verified,reviewRef:check?.reviewRef??null,
   aiVerificationRef:check?.aiVerificationRef??null})
 }))
 return Object.freeze({draftHash,assignmentId:draft.assignmentId,targetRef:draft.targetRef,
  reviewerRef:source.reviewerRef,ruleVersionRef:source.ruleVersionRef,
  verified:results.every(item=>item.verified),deviation:source.deviation,positions:results,
  deferredPositionRefs:Object.freeze([...source.deferredPositionRefs]),assertCurrent})
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
 if(await hashCanonicalSnapshotText(canonicalSnapshotValue(snapshot))!==review.draftHash)
  throw Error('BID_RESPONSE_CANDIDATE_VERSION')
 assertCurrent()
 return Object.freeze({response:snapshot,reviewHash:review.draftHash,deviation:review.deviation,
  reviewedPositions:review.positions,deferredPositionRefs:review.deferredPositionRefs,assertCurrent})
}
