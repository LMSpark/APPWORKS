/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-review-coverage-reader
 * 职责：用固定审定范围、原批准及本次检查证明读取动作45覆盖结果。
 * 边界：只组合原证据；检查写入、审定决策及交付放行由原业务动作负责。
 */
import {compareReviewCoverage} from '@/services/smart-bid/content/review/review-coverage'
import {projectReviewChecks} from '@/services/smart-bid/content/review/review-check-evidence'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import type {readApprovalCoverageEvidence} from './content-approval-coverage'
import {readFindingsForCompletedCoverage} from './content-review-findings-reader'
import type {ContentRevisionReadHost} from '../content-revision-reader'

type CoverageInput=Parameters<typeof compareReviewCoverage>[0]
type CoverageSelection=Readonly<{projectId:string;revisionId:string;targets:CoverageInput['targets'];assertCurrent:()=>void}>
type CoverageChecks=Readonly<{
 projectId:string;revisionId:string
 completed:Parameters<typeof projectReviewChecks>[0];findings:Parameters<typeof projectReviewChecks>[1]
 assertCurrent:()=>void
}>
type ApprovalProof=Awaited<ReturnType<typeof readApprovalCoverageEvidence>>
type CompletedCoverageSource=Parameters<typeof readFindingsForCompletedCoverage>[1]

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

/** 使用本轮完成记录和原 CheckFinding DataView 执行动作45的覆盖读取。 */
export async function readContentReviewCoverageFromFindings(host:ContentRevisionReadHost,selection:CoverageSelection,
 sources:Readonly<{approvals:readonly ApprovalProof[];readCompleted:(input:Readonly<{
  projectId:string;revisionId:string;targets:CoverageInput['targets']
 }>)=>Promise<CompletedCoverageSource>}>){
 const assertCurrent=()=>{host.assertCurrent();selection.assertCurrent()}
 assertCurrent()
 if(host.projectId!==selection.projectId)throw Error('CONTENT_REVIEW_COVERAGE_SCOPE')
 return readContentReviewCoverage({...selection,assertCurrent},sources.approvals,async input=>{
  const source=await sources.readCompleted(input)
  assertCurrent();source.assertCurrent()
  if(source.projectId!==input.projectId||source.revisionId!==input.revisionId)throw Error('CONTENT_REVIEW_CHECK_REVISION')
  const targetKey=({kind,targetId,effectiveHash,versionHash}:Omit<CoverageInput['targets'][number],'requiredUseIds'>)=>
   JSON.stringify([kind,targetId,effectiveHash,versionHash])
  const targets=new Set(input.targets.map(targetKey))
  if(source.completed.some(item=>!targets.has(targetKey(item))))throw Error('CONTENT_REVIEW_COVERAGE_SCOPE')
  return readFindingsForCompletedCoverage({...host,assertCurrent},source)
 })
}
