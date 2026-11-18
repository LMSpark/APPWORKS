/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-review-coverage-reader
 * 职责：用固定审定范围、原批准及本次检查证明读取动作45覆盖结果。
 * 边界：只组合原证据；检查写入、审定决策及交付放行由原业务动作负责。
 */
import {compareReviewCoverage} from '@/services/smart-bid/content/review/review-coverage'
import {projectReviewChecks} from '@/services/smart-bid/content/review/review-check-evidence'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import type {readApprovalCoverageEvidence} from './content-approval-coverage'

type CoverageInput=Parameters<typeof compareReviewCoverage>[0]
type CoverageSelection=Readonly<{projectId:string;revisionId:string;targets:CoverageInput['targets'];assertCurrent:()=>void}>
type CoverageChecks=Readonly<{
 projectId:string;revisionId:string
 completed:Parameters<typeof projectReviewChecks>[0];findings:Parameters<typeof projectReviewChecks>[1]
 assertCurrent:()=>void
}>
type ApprovalProof=Awaited<ReturnType<typeof readApprovalCoverageEvidence>>

/** 当前检查必须来自所选修订；旧批准沿原判定证据比较有效摘要。 */
export async function readContentReviewCoverage(selection:CoverageSelection,approvals:readonly ApprovalProof[],
 readChecks:(input:Readonly<{projectId:string;revisionId:string;targets:CoverageInput['targets']}>)=>Promise<CoverageChecks>){
 selection.assertCurrent()
 const {projectId,revisionId}=selection
 if(!identity(projectId)||!identity(revisionId))throw Error('CONTENT_REVIEW_COVERAGE_SCOPE')
 const targets=Object.freeze(selection.targets.map(target=>Object.freeze({
  ...target,requiredUseIds:Object.freeze([...target.requiredUseIds]),
 })))
 const proofs=[...approvals]
 for(const approval of proofs){
  approval.assertCurrent()
  if(approval.projectId!==projectId)throw Error('CONTENT_REVIEW_COVERAGE_SCOPE')
 }
 const current=await readChecks(Object.freeze({projectId,revisionId,targets}))
 const assertCurrent=()=>{selection.assertCurrent();current.assertCurrent();for(const approval of proofs)approval.assertCurrent()}
 assertCurrent()
 if(current.projectId!==projectId||current.revisionId!==revisionId)throw Error('CONTENT_REVIEW_CHECK_REVISION')
 const result=compareReviewCoverage({targets,approvals:proofs.flatMap(approval=>approval.evidence),
  checks:projectReviewChecks(current.completed,current.findings)})
 return Object.freeze({...result,assertCurrent})
}
