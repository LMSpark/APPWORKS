/**
 * @module app:views/features/application/smart-bid/authoring/model/review/package/content-package-release
 * 职责：第50项按当次要求核放行证据，供第51项绑定最终待发包。
 */
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
/** Identity of the registered original package and its frozen selection. */
type Scope=Readonly<{projectId:string;packageId:string;packageHash:string;selectionHash:string}>
/** Current member comparison from an independently observed final package. */
type PackageProof=Scope&Readonly<{membershipMatches:boolean;assertCurrent:()=>void}>
type Requirement=Readonly<{kind:'SELECTION_USE'|'APPROVAL'|'SIGNATURE';targetId:string}>
type Evidence=Scope&Requirement&Readonly<{evidenceRef:string;accepted:boolean;assertCurrent:()=>void}>
const key=({kind,targetId}:Requirement)=>JSON.stringify([kind,targetId])

/** 成员匹配后仍须验证当次选件适用、批准覆盖及规则要求的签署。 */
export function assessSubmissionPackageRelease(pack:PackageProof,rules:Scope&Readonly<{
 requirements:readonly Requirement[];assertCurrent:()=>void
}>,evidence:readonly Evidence[]){
 const proofs=[...evidence]
 const assertCurrent=()=>{pack.assertCurrent();rules.assertCurrent();for(const proof of proofs)proof.assertCurrent()}
 assertCurrent()
 const {projectId,packageId,packageHash,selectionHash}=pack
 const requirements=new Map(rules.requirements.map(requirement=>[key(requirement),requirement]))
 if(rules.projectId!==projectId||rules.packageId!==packageId||rules.packageHash!==packageHash||
  rules.selectionHash!==selectionHash||requirements.size!==rules.requirements.length||
  !rules.requirements.some(item=>item.kind==='SELECTION_USE')||!rules.requirements.some(item=>item.kind==='APPROVAL')||
  rules.requirements.some(({kind,targetId})=>!['SELECTION_USE','APPROVAL','SIGNATURE'].includes(kind)||!identity(targetId)))
  throw Error('SUBMISSION_PACKAGE_RELEASE_SCOPE')
 const matched=new Map<string,Evidence>()
 for(const proof of proofs){
  const id=key(proof)
  if(proof.projectId!==projectId||proof.packageId!==packageId||proof.packageHash!==packageHash||
   proof.selectionHash!==selectionHash||!requirements.has(id)||matched.has(id)||!identity(proof.evidenceRef))
   throw Error('SUBMISSION_PACKAGE_RELEASE_SCOPE')
  matched.set(id,proof)
 }
 const decisions=Object.freeze(rules.requirements.map(requirement=>{
  const proof=matched.get(key(requirement))
  return Object.freeze({...requirement,evidenceRef:proof?.evidenceRef??null,accepted:proof?.accepted===true})
 }))
 return Object.freeze({projectId,packageId,packageHash,selectionHash,decisions,
  deliverable:pack.membershipMatches&&decisions.every(item=>item.accepted),assertCurrent})
}
