/**
 * @module app:services/smart-bid/content/review/review-check-evidence
 * 职责：从原检查覆盖和核查问题投影动作45可消费的检查证据。
 * 边界：原检查读取负责权限及完整计数；空问题不能代替已完成覆盖。
 */
import {snapshotReferenceIdentity as identity} from '../references/snapshot-reference-values'
import type {compareReviewCoverage} from './review-coverage'

type Check=Parameters<typeof compareReviewCoverage>[0]['checks'][number]
type CompletedCheck=Omit<Check,'openBlockerIds'>
type Finding=Pick<Check,'kind'|'targetId'|'effectiveHash'>&Readonly<{
 id:string;severity:'BLOCK'|'CONFIRM'|'HINT';status:'OPEN'|'RESOLVED'|'WAIVED'|'STALE'
}>
const findingKinds=new Set(['BLOCK','CONFIRM','HINT']),findingStates=new Set(['OPEN','RESOLVED','WAIVED','STALE'])
const key=({kind,targetId,effectiveHash}:Pick<Check,'kind'|'targetId'|'effectiveHash'>)=>JSON.stringify([kind,targetId,effectiveHash])

/** 仅为有已完成覆盖的目标输出检查，未决或待复验的阻断均保留。 */
export function projectReviewChecks(completed:readonly CompletedCheck[],findings:readonly Finding[]):readonly Check[]{
 const checks=new Map<string,CompletedCheck>(),blockers=new Map<string,string[]>(),seen=new Set<string>()
 for(const check of completed){
  const id=key(check)
  if(checks.has(id))throw Error('CONTENT_REVIEW_CHECK_DUPLICATE')
  checks.set(id,check);blockers.set(id,[])
 }
 for(const finding of findings){
  const target=blockers.get(key(finding))
  if(!target||!identity(finding.id)||seen.has(finding.id)||!findingKinds.has(finding.severity)||!findingStates.has(finding.status))
   throw Error('CONTENT_REVIEW_FINDING_SCOPE')
  seen.add(finding.id)
  if(finding.severity==='BLOCK'&&(finding.status==='OPEN'||finding.status==='STALE'))target.push(finding.id)
 }
 return Object.freeze([...checks].map(([id,check])=>Object.freeze({
  ...check,openBlockerIds:Object.freeze((blockers.get(id)??[]).sort()),
 })))
}
