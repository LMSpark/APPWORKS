/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-deadline-package-reconciliation
 * 职责：给截止义务关联经渠道记录唯一定位的原实包及同位置成员。
 * 边界：包关联来自原办理证据；只投影已核成员，不改变送达或准入状态。
 */
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import type {reconcileSubmissionDeadline} from '@/services/smart-bid/content/review/submission-reconciliation'
import type {readSubmissionPackageMembers} from './content-package-review'

type Deadline=ReturnType<typeof reconcileSubmissionDeadline>
type ReviewedPackage=Awaited<ReturnType<typeof readSubmissionPackageMembers>>
type PackageLink=Readonly<{
 obligationId:string;attemptRef:string;packageId:string;packageHash:string;position:string;assertCurrent:()=>void
}>

/** 只使用有效批次中渠道实际指出的包和位置；其它批次不能补缺。 */
export function reconcileDeadlinePackageMembers(source:Readonly<{
 projectId:string;deadline:Deadline;links:readonly PackageLink[];assertCurrent:()=>void
}>,packages:readonly ReviewedPackage[]){
 const links=[...source.links],proofs=[...packages]
 const assertCurrent=()=>{
  source.assertCurrent()
  for(const link of links)link.assertCurrent()
  for(const item of proofs)item.assertCurrent()
 }
 assertCurrent()
 const obligations=new Set(source.deadline.items.map(item=>item.obligationId))
 const byObligation=new Map<string,PackageLink>()
 for(const link of links){
  if(!obligations.has(link.obligationId)||byObligation.has(link.obligationId)||
   ![link.attemptRef,link.packageId,link.position].every(identity)||!/^[a-f0-9]{64}$/u.test(link.packageHash))
   throw Error('SUBMISSION_PACKAGE_RECONCILIATION_SCOPE')
  byObligation.set(link.obligationId,link)
 }
 const byPackage=new Map(proofs.map(item=>[item.packageId,item]))
 if(byPackage.size!==proofs.length||proofs.some(item=>item.projectId!==source.projectId))throw Error('SUBMISSION_PACKAGE_RECONCILIATION_SCOPE')
 const items=source.deadline.items.map(item=>{
  const link=byObligation.get(item.obligationId)
  const pack=link&&item.state==='EFFECTIVE_ATTEMPT'&&link.attemptRef===item.attemptRef?byPackage.get(link.packageId):undefined
  const verified=link&&pack?.packageHash===link.packageHash?pack:undefined
  const member=verified?.members.find(entry=>entry.position===link?.position)
  const contentState=!member?'PENDING':member.issues.length?'MISMATCHED':'MATCHED'
  return Object.freeze({...item,packageId:verified?.packageId??null,position:member?.position??null,contentState})
 })
 assertCurrent()
 return Object.freeze({items:Object.freeze(items),cutoffAt:source.deadline.cutoffAt,knownAt:source.deadline.knownAt,assertCurrent})
}
