/**
 * @module app:services/smart-bid/content/review/finding/review-finding-recheck
 * 职责：第44项按原问题版本、整改证据和复核权限固定本次复验决定。
 * 边界：只生成待登记决定，不关闭原问题或代写整改结果。
 */
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../../revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '../../references/snapshot-reference-values'

type Scope=Readonly<{projectId:string;findingId:string}>
export type ReviewFindingTarget=Readonly<{kind:'CONTENT'|'FILE'|'FIELD'|'PACKAGE'|'SUBMISSION'|'VALIDATION';targetId:string;versionRef:string;effectiveHash:string}>
type Finding=Scope&Readonly<{versionRef:string;target:ReviewFindingTarget;remediatorId:string;assertCurrent:()=>void}>
type Evidence=Scope&Readonly<{findingVersionRef:string;target:ReviewFindingTarget;evidenceRef:string;assertCurrent:()=>void}>
type Decision=Scope&Readonly<{
 findingVersionRef:string;target:ReviewFindingTarget;reviewerId:string;authorityRef:string;ruleRef:string
 outcome:'UNRESOLVED'|'CORRECTED'|'FALSE_POSITIVE'|'WAIVED';waiverRef:string|null;independenceRequired:boolean;assertCurrent:()=>void
}>
const kinds=['CONTENT','FILE','FIELD','PACKAGE','SUBMISSION','VALIDATION']
const outcomes=['UNRESOLVED','CORRECTED','FALSE_POSITIVE','WAIVED']
const assertTarget=(target:ReviewFindingTarget)=>{
 if(!kinds.includes(target.kind)||![target.targetId,target.versionRef].every(identity)||!/^[a-f0-9]{64}$/u.test(target.effectiveHash))
  throw Error('REVIEW_FINDING_RECHECK_TARGET')
}
const matchesTarget=(a:ReviewFindingTarget,b:ReviewFindingTarget)=>
 a.kind===b.kind&&a.targetId===b.targetId&&a.versionRef===b.versionRef&&a.effectiveHash===b.effectiveHash

/** 按预期问题版追加同一决定，放行须有本版证据且满足独立复核规则。 */
export async function prepareReviewFindingRecheck(request:Scope&Readonly<{expectedFindingVersion:string;requestKey:string}>,
 source:Readonly<{finding:Finding;decision:Decision;evidence:Evidence}>){
 const {finding,decision,evidence}=source,{projectId,findingId,expectedFindingVersion,requestKey}=request
 const assertCurrent=()=>{finding.assertCurrent();decision.assertCurrent();evidence.assertCurrent()}
 assertCurrent()
 if(![projectId,findingId,expectedFindingVersion,requestKey,finding.remediatorId,decision.reviewerId,decision.authorityRef,
  decision.ruleRef,evidence.evidenceRef].every(identity)||
  [finding,decision,evidence].some(item=>item.projectId!==projectId||item.findingId!==findingId)||
  [finding.versionRef,decision.findingVersionRef,evidence.findingVersionRef].some(version=>version!==expectedFindingVersion))
  throw Error('REVIEW_FINDING_RECHECK_SCOPE')
 const original=finding.target,checked=decision.target
 for(const target of [original,checked,evidence.target])assertTarget(target)
 if(original.kind!==checked.kind||original.targetId!==checked.targetId||!matchesTarget(checked,evidence.target))
  throw Error('REVIEW_FINDING_RECHECK_TARGET')
 const {outcome,waiverRef,independenceRequired}=decision
 if(!outcomes.includes(outcome)||typeof independenceRequired!=='boolean'||
  (independenceRequired&&decision.reviewerId===finding.remediatorId)||
  (outcome==='WAIVED'?!identity(waiverRef):waiverRef!==null))
  throw Error('REVIEW_FINDING_RECHECK_DECISION')
 const record=Object.freeze({projectId,findingId,expectedFindingVersion,requestKey,originalTarget:Object.freeze({...original}),
  checkedTarget:Object.freeze({...checked}),outcome,waiverRef,independenceRequired,evidenceRef:evidence.evidenceRef,
  reviewerId:decision.reviewerId,authorityRef:decision.authorityRef,ruleRef:decision.ruleRef})
 const requestDigest=await hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.review-finding-recheck/1',record]))
 assertCurrent()
 return Object.freeze({record,requestDigest,assertCurrent})
}
