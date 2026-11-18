/**
 * @module app:views/features/application/smart-bid/authoring/model/review/deadline/content-deadline-reconciliation
 * 职责：动作54在同一截止判断中逐义务合并同批文件和平台栏。
 * 边界：只读原证据，不据内容一致推断送达、开启或准入，不持久化。
 */
import {reconcileDeadlineFieldValues} from './content-deadline-field-reconciliation'
import {reconcileDeadlinePackageMembers} from './content-deadline-package-reconciliation'

type FieldSource=Parameters<typeof reconcileDeadlineFieldValues>[0]
type PackageSource=Parameters<typeof reconcileDeadlinePackageMembers>[0]

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
