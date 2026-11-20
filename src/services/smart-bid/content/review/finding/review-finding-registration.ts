/**
 * @module app:services/smart-bid/content/review/finding/review-finding-registration
 * 职责：第43项固定原对象、检查覆盖和多份问题观察。
 * 边界：构造待登记 JSON，未执行检查与空查询不产生检查覆盖。
 */
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../../revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '../../references/snapshot-reference-values'
import type {ReviewFindingTarget} from './review-finding-recheck'

type Request=Readonly<{projectId:string;requestKey:string;target:ReviewFindingTarget}>
type Observation=Readonly<{
 projectId:string;target:ReviewFindingTarget;positionRef:string;code:string;evidenceRef:string;assertCurrent:()=>void
}>
type Finding=Readonly<{
 findingId:string;positionRef:string;code:string;severity:'BLOCK'|'CONFIRM'|'HINT';remediatorId:string|null
}>
type Source=Readonly<{
 projectId:string;target:ReviewFindingTarget;checkRef:string;ruleRef:string;authorityRef:string
 reviewerId:string;checkedAt:string;finding:Finding|null;observations:readonly Observation[];assertCurrent:()=>void
}>
const kinds=['CONTENT','FILE','FIELD','PACKAGE','SUBMISSION','VALIDATION']
const sameTarget=(a:ReviewFindingTarget,b:ReviewFindingTarget)=>
 a.kind===b.kind&&a.targetId===b.targetId&&a.versionRef===b.versionRef&&a.effectiveHash===b.effectiveHash

/** 问题观察须落在同一版的位置和规则差异；有原检查凭据才可登记仅覆盖。 */
export async function prepareReviewFindingRegistration(request:Request,source:Source){
 const {projectId,requestKey,target}=request,{checkRef,ruleRef,authorityRef,reviewerId,checkedAt}=source
 const observations=[...source.observations]
 const assertCurrent=()=>{source.assertCurrent();for(const observation of observations)observation.assertCurrent()}
 assertCurrent()
 const error='REVIEW_FINDING_REGISTRATION_SCOPE'
 if(projectId!==source.projectId||!sameTarget(target,source.target)||!kinds.includes(target.kind)||
  ![projectId,requestKey,target.targetId,target.versionRef,checkRef,ruleRef,authorityRef,reviewerId].every(identity)||
  !/^[a-f0-9]{64}$/u.test(target.effectiveHash)||!Number.isFinite(Date.parse(checkedAt))||!/(?:Z|[+-]\d{2}:\d{2})$/u.test(checkedAt))
  throw Error(error)
 const finding=source.finding===null?null:Object.freeze({...source.finding})
 if(finding&&(![finding.findingId,finding.positionRef,finding.code].every(identity)||
  !['BLOCK','CONFIRM','HINT'].includes(finding.severity)||(finding.remediatorId!==null&&!identity(finding.remediatorId))))throw Error(error)
 if((finding===null)!==(observations.length===0))throw Error(error)
 const evidenceRefs=new Set<string>()
 for(const observation of observations){
  if(!finding||observation.projectId!==projectId||!sameTarget(observation.target,target)||
   observation.positionRef!==finding.positionRef||observation.code!==finding.code||!identity(observation.evidenceRef))throw Error(error)
  evidenceRefs.add(observation.evidenceRef)
 }
 const record=Object.freeze({projectId,requestKey,target:Object.freeze({...target}),checkRef,ruleRef,authorityRef,reviewerId,
  checkedAt,finding,evidenceRefs:Object.freeze([...evidenceRefs].sort())})
 const requestDigest=await hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.review-finding-registration/1',record]))
 assertCurrent()
 return Object.freeze({record,requestDigest,assertCurrent})
}
