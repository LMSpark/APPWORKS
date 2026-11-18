/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-deadline-field-reconciliation
 * 职责：给动作54已核截止批次关联同批平台栏回读及批准值比较。
 * 边界：栏位比对不改变送达、实件装入、开启或准入结论。
 */
import type {reconcileSubmissionDeadline} from '@/services/smart-bid/content/review/submission-reconciliation'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import type {readSubmittedPlatformFields} from './content-platform-field-review'

type Deadline=ReturnType<typeof reconcileSubmissionDeadline>
type Batch=Awaited<ReturnType<typeof readSubmittedPlatformFields>>
type Field=Readonly<{obligationId:string;assignmentId:string;fieldId:string}>
const key=(attemptRef:string,assignmentId:string,fieldId:string)=>JSON.stringify([attemptRef,assignmentId,fieldId])

/** 只沿截止有效批次匹配原栏位；已有送达但缺同批值时保持待核。 */
export function reconcileDeadlineFieldValues(source:Readonly<{
 projectId:string;deadline:Deadline;requiredFields:readonly Field[];assertCurrent:()=>void
}>,batches:readonly Batch[]){
 const proofs=[...batches]
 const assertCurrent=()=>{source.assertCurrent();for(const batch of proofs)batch.assertCurrent()}
 assertCurrent()
 const obligations=new Set(source.deadline.items.map(item=>item.obligationId)),seen=new Set<string>()
 for(const {obligationId,assignmentId,fieldId} of source.requiredFields){
  const binding=JSON.stringify([obligationId,assignmentId,fieldId])
  if(!obligations.has(obligationId)||!identity(assignmentId)||!identity(fieldId)||seen.has(binding))
   throw Error('SUBMISSION_FIELD_RECONCILIATION_SCOPE')
  seen.add(binding)
 }
 const observations=new Map<string,{receiptRef:string;result:Batch['results'][number]}>()
 for(const batch of proofs){
  if(batch.projectId!==source.projectId)throw Error('SUBMISSION_FIELD_RECONCILIATION_SCOPE')
  for(const result of batch.results){
   const id=key(batch.attemptRef,result.assignmentId,result.fieldId)
   if(observations.has(id))throw Error('SUBMISSION_FIELD_RECONCILIATION_SCOPE')
   observations.set(id,{receiptRef:batch.receiptRef,result})
  }
 }
 const items=source.deadline.items.map(item=>{
  const fields=source.requiredFields.filter(field=>field.obligationId===item.obligationId).map(({assignmentId,fieldId})=>{
   const evidence=item.state==='EFFECTIVE_ATTEMPT'&&item.attemptRef!==null?
    observations.get(key(item.attemptRef,assignmentId,fieldId)):undefined
   const state=evidence?.result.state==='MATCHED'?'MATCHED':evidence?.result.state==='MISMATCHED'?'MISMATCHED':'PENDING'
   return Object.freeze({assignmentId,fieldId,state,observationRef:evidence?.result.observationRef??null,receiptRef:evidence?.receiptRef??null})
  })
  return Object.freeze({...item,fields:Object.freeze(fields)})
 })
 assertCurrent()
 return Object.freeze({cutoffAt:source.deadline.cutoffAt,knownAt:source.deadline.knownAt,items:Object.freeze(items),assertCurrent})
}
