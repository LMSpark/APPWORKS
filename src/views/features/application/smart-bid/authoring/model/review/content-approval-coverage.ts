/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-approval-coverage
 * 职责：按原判定记录将批准映射到实际审定的文件和平台栏。
 * 边界：判定读取方核批准时的授权、原范围及结果；本函数不推断整标批准涵盖哪些事项。
 */
import {snapshotReferenceFields,snapshotReferenceIdentity,visitSnapshotReferences} from '@/services/smart-bid/content/references/snapshot-reference-values'
import type {readContentApproval} from './content-approval-reader'

type OriginalApproval=Awaited<ReturnType<typeof readContentApproval>>
type OriginalDecision=Readonly<{
 projectId:string;revisionId:string;approvalRef:string;authorityRef:string;decisionTraceRef:string;approvalEffectiveHash:string;approvedTargets:unknown
 assertCurrent:()=>void
}>

/** 沿同一原批准和判定引用读取精确已批准范围。 */
export async function readApprovalCoverageEvidence(approval:OriginalApproval,
 readDecision:(ref:string)=>Promise<OriginalDecision>){
 approval.assertCurrent()
 const decision=await readDecision(approval.decisionTraceRef)
 const assertCurrent=()=>{approval.assertCurrent();decision.assertCurrent()}
 assertCurrent()
 if(decision.projectId!==approval.projectId||decision.revisionId!==approval.revisionId||decision.approvalRef!==approval.approvalRef||
  decision.authorityRef!==approval.authorityRef||decision.decisionTraceRef!==approval.decisionTraceRef||
  decision.approvalEffectiveHash!==approval.effectiveHash)throw Error('CONTENT_APPROVAL_TRACE_MISMATCH')
 const evidence:Array<Readonly<{kind:'FILE'|'FIELD';targetId:string;effectiveHash:string;versionHash:string;approvalRef:string}>>=[],seen=new Set<string>()
 const error='CONTENT_APPROVAL_TRACE_SCOPE'
 visitSnapshotReferences(decision.approvedTargets,item=>{
  const {kind,targetId,effectiveHash,versionHash}=snapshotReferenceFields(item,['kind','targetId','effectiveHash','versionHash'],error)
  if((kind!=='FILE'&&kind!=='FIELD')||!snapshotReferenceIdentity(targetId)||typeof effectiveHash!=='string'||
   !/^[a-f0-9]{64}$/u.test(effectiveHash)||typeof versionHash!=='string'||!/^[a-f0-9]{64}$/u.test(versionHash)||
   kind==='FIELD'&&approval.scope!=='PROJECT')throw Error(error)
  const key=JSON.stringify([kind,targetId])
  if(seen.has(key))throw Error(error)
  seen.add(key)
  evidence.push(Object.freeze({kind,targetId,effectiveHash,versionHash,approvalRef:approval.approvalRef}))
 },error)
 return Object.freeze({projectId:approval.projectId,evidence:Object.freeze(evidence),assertCurrent})
}
