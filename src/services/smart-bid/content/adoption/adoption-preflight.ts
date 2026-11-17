/**
 * @module app:services/smart-bid/content/adoption/adoption-preflight
 * 职责：依据当前业务观察检查固定预演是否需要重做，并准备匹配的采用请求。
 * 边界：无权威查询、持久化或写入；正式执行仍须同次核头、依据及权限。
 */
import {compareAdoptionBasisChecks} from './adoption-basis-checks'
import {prepareAdoptionFromApprovedPreview} from './adoption-request'
import {canonicalSnapshotValue} from '../revision-snapshot-hash'
import {snapshotReferenceIdentity,snapshotReferenceRecord} from '../references/snapshot-reference-values'

type AdoptionBasis=Readonly<{stageRef:unknown;baselineId:string;basisChecks:unknown}>
type AdoptionPreflight=Readonly<{
 request:unknown
 preview:AdoptionBasis&Readonly<{selection:unknown}>
 current:AdoptionBasis&Readonly<{projectId:string;headRevisionId:string|null}>
}>
type RepreviewReason='HEAD_CHANGED'|'STAGE_CHANGED'|'BASELINE_CHANGED'|'BASIS_CHECKS_CHANGED'

/** 当前依据变化时只报告重做条件，不签发可执行证明。 */
export async function prepareCheckedAdoption({request,preview,current}:AdoptionPreflight){
 const selection=snapshotReferenceRecord(preview.selection,'ADOPTION_PREVIEW_REQUIRED')
 if(!snapshotReferenceIdentity(current.projectId)||selection['projectId']!==current.projectId)
  throw Error('ADOPTION_PREFLIGHT_PROJECT')
 if(!snapshotReferenceIdentity(current.baselineId)||!snapshotReferenceIdentity(preview.baselineId)||
  (current.headRevisionId!==null&&!snapshotReferenceIdentity(current.headRevisionId))||
  current.stageRef===null||preview.stageRef===null)throw Error('ADOPTION_PREFLIGHT_BASIS_REQUIRED')
 const basis=compareAdoptionBasisChecks(preview.basisChecks,current.basisChecks)
 const reasons:RepreviewReason[]=[]
 if(selection['expectedHead']!==current.headRevisionId)reasons.push('HEAD_CHANGED')
 if(canonicalSnapshotValue(preview.stageRef)!==canonicalSnapshotValue(current.stageRef))reasons.push('STAGE_CHANGED')
 if(preview.baselineId!==current.baselineId)reasons.push('BASELINE_CHANGED')
 if(!basis.matches)reasons.push('BASIS_CHECKS_CHANGED')
 if(reasons.length)return {status:'REPREVIEW_REQUIRED' as const,reasons,basisIssues:basis.issues}
 const prepared=await prepareAdoptionFromApprovedPreview(request,selection)
 return {status:'PREPARED' as const,request:prepared,requiresAtomicCommitChecks:basis.requiresAtomicCommitChecks}
}
