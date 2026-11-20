/**
 * @module app:views/features/application/smart-bid/authoring/model/review/deadline/content-deadline-reconciliation
 * 职责：动作54在同一截止判断中逐义务合并同批文件和平台栏。
 * 边界：只读原证据，不据内容一致推断送达、开启或准入，不持久化。
 */
import {reconcileDeadlineFieldValues} from './content-deadline-field-reconciliation'
import {reconcileDeadlinePackageMembers} from './content-deadline-package-reconciliation'
import {reconcileSubmissionReceiptEffects} from '@/services/smart-bid/content/review/submission/submission-receipt-effects'
import {projectSubmissionOpeningDisposition} from '@/services/smart-bid/content/review/submission/submission-opening-disposition'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import type {prepareTenderFollowupNotice} from '@/services/smart-bid/content/references/followup/tender-followup-notice'

type FieldSource=Parameters<typeof reconcileDeadlineFieldValues>[0]
type PackageSource=Parameters<typeof reconcileDeadlinePackageMembers>[0]

/** 来件中的包引用只在已核截止组合唯一指出原实包时配对。 */
export function matchFollowupNoticeToDeadlinePackage(notice:Readonly<{
 record:Pick<Awaited<ReturnType<typeof prepareTenderFollowupNotice>>['record'],'projectId'|'lotId'|'roundId'|'subjectId'|'originalObjectRef'>
 assertCurrent:()=>void
}>,
 delivery:ReturnType<typeof reconcileDeadlineDelivery>){
 const assertCurrent=()=>{notice.assertCurrent();delivery.assertCurrent()}
 assertCurrent()
 const {projectId,lotId,roundId,subjectId,originalObjectRef}=notice.record
 if(projectId!==delivery.scope.projectId||lotId!==delivery.scope.lotId||roundId!==delivery.roundId||subjectId!==delivery.scope.subjectId)
  throw Error('TENDER_FOLLOWUP_DEADLINE_SCOPE')
 const candidates=delivery.packageChecks.filter(pack=>pack.packageId===originalObjectRef)
 const original=candidates.length===1?candidates[0]:undefined
 return Object.freeze({notice,objectState:original?'IDENTIFIED' as const:'PENDING_PAIR' as const,
  original:original?Object.freeze({packageId:original.packageId,packageHash:original.packageHash,attemptRef:original.attemptRef}):null,
  assertCurrent})
}

/** 后续开启和准入只附在同一批次及原包，原截止时点和结论仍可独立读取。 */
export function attachDeadlinePackageDisposition(delivery:ReturnType<typeof reconcileDeadlineDelivery>,
 binding:Parameters<typeof projectSubmissionOpeningDisposition>[0]&Readonly<{packageHash:string;assertCurrent:()=>void}>,
 source:Parameters<typeof projectSubmissionOpeningDisposition>[1]){
 delivery.assertCurrent()
 binding.assertCurrent()
 const {projectId,lotId,roundId,attemptRef,objectRef,packageHash}=binding
 if(projectId!==delivery.scope.projectId||lotId!==delivery.scope.lotId||roundId!==delivery.roundId||
  !delivery.packageChecks.some(pack=>pack.attemptRef===attemptRef&&pack.packageId===objectRef&&pack.packageHash===packageHash))
  throw Error('SUBMISSION_DEADLINE_DISPOSITION_SCOPE')
 const disposition=projectSubmissionOpeningDisposition({projectId,lotId,roundId,attemptRef,objectRef},source)
 const assertCurrent=()=>{delivery.assertCurrent();binding.assertCurrent();disposition.assertCurrent()}
 assertCurrent()
 return Object.freeze({delivery,disposition,assertCurrent})
}

/** 用同一次规则核验所得的截止结论选择内容证据，保留结论所用原回执。 */
export function reconcileDeadlineDelivery(input:Parameters<typeof reconcileSubmissionReceiptEffects>[0]&Readonly<{roundId:string}>,
 receipts:Parameters<typeof reconcileSubmissionReceiptEffects>[1],
 options:Readonly<{contents:Omit<FieldSource&PackageSource,'deadline'>;proofs:Parameters<typeof reconcileDeadlineContents>[1]}>){
 const {contents,proofs}=options
 contents.assertCurrent()
 if(contents.projectId!==receipts.scope.projectId||!identity(input.roundId))throw Error('SUBMISSION_DEADLINE_CONTENT_SCOPE')
 const deadline=reconcileSubmissionReceiptEffects(input,receipts)
 const assertCurrent=()=>{contents.assertCurrent();deadline.assertCurrent()}
 const result=reconcileDeadlineContents({...contents,deadline,assertCurrent},proofs)
 return Object.freeze({...result,scope:deadline.scope,roundId:input.roundId,evidence:deadline.evidence})
}

/** 文件或平台栏任一应交落点未核实，整项内容仍待核。 */
export function reconcileDeadlineContents(source:FieldSource&PackageSource,inputs:Readonly<{
 packages:Parameters<typeof reconcileDeadlinePackageMembers>[1]
 batches:Parameters<typeof reconcileDeadlineFieldValues>[1]
}>){
 const files=reconcileDeadlinePackageMembers(source,inputs.packages)
 const fields=reconcileDeadlineFieldValues(source,inputs.batches)
 const byObligation=new Map(fields.items.map(item=>[item.obligationId,item.fields]))
 const items=files.items.map(item=>{
  const fieldItems=byObligation.get(item.obligationId)
  if(!fieldItems)throw Error('SUBMISSION_DEADLINE_CONTENT_SCOPE')
  const states=[...item.members.map(member=>member.state),...fieldItems.map(field=>field.state)]
  const contentState=states.includes('MISMATCHED')?'MISMATCHED':
   states.length>0&&states.every(state=>state==='MATCHED')?'MATCHED':'PENDING'
  return Object.freeze({...item,contentState,fields:fieldItems})
 })
 const assertCurrent=()=>{files.assertCurrent();fields.assertCurrent()}
 assertCurrent()
 return Object.freeze({projectId:source.projectId,cutoffAt:files.cutoffAt,knownAt:files.knownAt,
  items:Object.freeze(items),packageChecks:files.packageChecks,assertCurrent})
}
