/**
 * @module app:services/smart-bid/content/review/review-coverage
 * 职责：逐项比较动作45的本轮审定范围、原批准与阻断检查。
 * 边界：输入来自授权读取；只确定覆盖及差距，不批准或保存。
 */
import {snapshotReferenceIdentity as identity} from '../references/snapshot-reference-values'

type Target=Readonly<{kind:'FILE'|'FIELD';targetId:string;effectiveHash:string;versionHash:string}>
type ReviewTarget=Target&Readonly<{requiredUseIds:readonly string[]}>
type ApprovalEvidence=Target&Readonly<{approvalRef:string}>
type ReviewCheck=Target&Readonly<{checkRef:string;openBlockerIds:readonly string[];
 checkedUses:ReadonlyArray<Readonly<{id:string;useCheckRef:string}>>}>
type CoverageState='COVERED'|'NO_APPROVAL'|'CHANGED'|'CHECK_REQUIRED'|'BLOCKED'|'USE_CHECK_REQUIRED'
const key=({kind,targetId}:Target)=>JSON.stringify([kind,targetId])
const targetKinds=new Set(['FILE','FIELD'])
function index<T extends Target>(records:readonly T[]):Map<string,T>{
 const indexed=new Map<string,T>()
 for(const record of records){
  const id=key(record)
  if(!targetKinds.has(record.kind)||!identity(record.targetId)||!/^[a-f0-9]{64}$/u.test(record.effectiveHash)||!/^[a-f0-9]{64}$/u.test(record.versionHash)||
   indexed.has(id))throw Error('CONTENT_REVIEW_COVERAGE_SCOPE')
  indexed.set(id,record)
 }
 return indexed
}

/** 文件和平台栏分别核对；无阻断必须有同版检查证据。 */
export function compareReviewCoverage(input:Readonly<{
 targets:readonly ReviewTarget[];approvals:readonly ApprovalEvidence[];checks:readonly ReviewCheck[]
}>){
 const targets=index(input.targets),approvals=index(input.approvals),checks=index(input.checks)
 for(const id of [...approvals.keys(),...checks.keys()])if(!targets.has(id))throw Error('CONTENT_REVIEW_COVERAGE_SCOPE')
 const items=[...targets].map(([id,target])=>{
  const approval=approvals.get(id),check=checks.get(id)
  const uses=new Set(check?.checkedUses.map(item=>item.id))
  if(!target.requiredUseIds.every(identity)||new Set(target.requiredUseIds).size!==target.requiredUseIds.length||
   approval&&!identity(approval.approvalRef)||check&&(!identity(check.checkRef)||!check.openBlockerIds.every(identity)||
   uses.size!==check.checkedUses.length||!check.checkedUses.every(item=>identity(item.id)&&identity(item.useCheckRef))))
   throw Error('CONTENT_REVIEW_COVERAGE_EVIDENCE')
  let state:CoverageState='COVERED'
  if(check?.effectiveHash!==target.effectiveHash||check.versionHash!==target.versionHash)state='CHECK_REQUIRED'
  else if(check.openBlockerIds.length)state='BLOCKED'
  else if(!approval)state='NO_APPROVAL'
  else if(approval.effectiveHash!==target.effectiveHash||approval.versionHash!==target.versionHash)state='CHANGED'
  else if(target.requiredUseIds.some(useId=>!uses.has(useId)))state='USE_CHECK_REQUIRED'
  return Object.freeze({kind:target.kind,targetId:target.targetId,effectiveHash:target.effectiveHash,versionHash:target.versionHash,state,
   approvalRef:approval?.approvalRef??null,checkRef:check?.checkRef??null})
 })
 return Object.freeze({complete:items.length>0&&items.every(item=>item.state==='COVERED'),items:Object.freeze(items)})
}
