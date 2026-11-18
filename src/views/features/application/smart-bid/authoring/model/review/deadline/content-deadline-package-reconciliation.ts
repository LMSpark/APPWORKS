/**
 * @module app:views/features/application/smart-bid/authoring/model/review/deadline/content-deadline-package-reconciliation
 * 职责：给截止义务关联经渠道记录唯一定位的原实包及同位置成员。
 * 边界：包关联来自原办理证据；只投影已核成员，不改变送达或准入状态。
 */
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import type {reconcileSubmissionDeadline} from '@/services/smart-bid/content/review/submission-reconciliation'
import type {readSubmissionPackageMembers} from '../content-package-review'

type Deadline=ReturnType<typeof reconcileSubmissionDeadline>
type ReviewedPackage=Awaited<ReturnType<typeof readSubmissionPackageMembers>>
type PackageLink=Readonly<{
 obligationId:string;attemptRef:string;packageId:string;packageHash:string;position:string;assertCurrent:()=>void
}>
type RequiredMember=Readonly<{obligationId:string;position:string}>
const memberKey=({obligationId,position}:RequiredMember)=>JSON.stringify([obligationId,position])

/** 只使用有效批次中渠道实际指出的包和位置；其它批次不能补缺。 */
export function reconcileDeadlinePackageMembers(source:Readonly<{
 projectId:string;deadline:Deadline;requiredMembers:readonly RequiredMember[];links:readonly PackageLink[];assertCurrent:()=>void
}>,packages:readonly ReviewedPackage[]){
 const links=[...source.links],proofs=[...packages]
 const assertCurrent=()=>{
  source.assertCurrent()
  for(const link of links)link.assertCurrent()
  for(const item of proofs)item.assertCurrent()
 }
 assertCurrent()
 const obligations=new Set(source.deadline.items.map(item=>item.obligationId))
 const required=new Set<string>()
 for(const member of source.requiredMembers){
  const key=memberKey(member)
  if(!obligations.has(member.obligationId)||!identity(member.position)||required.has(key))
   throw Error('SUBMISSION_PACKAGE_RECONCILIATION_SCOPE')
  required.add(key)
 }
 const byMember=new Map<string,PackageLink>()
 for(const link of links){
  const key=memberKey(link)
  if(!required.has(key)||byMember.has(key)||
   ![link.attemptRef,link.packageId,link.position].every(identity)||!/^[a-f0-9]{64}$/u.test(link.packageHash))
   throw Error('SUBMISSION_PACKAGE_RECONCILIATION_SCOPE')
  byMember.set(key,link)
 }
 const byPackage=new Map(proofs.map(item=>[item.packageId,item]))
 if(byPackage.size!==proofs.length||proofs.some(item=>item.projectId!==source.projectId))throw Error('SUBMISSION_PACKAGE_RECONCILIATION_SCOPE')
 const checks=new Map<string,Readonly<{
  attemptRef:string;packageId:string;packageHash:string;membershipMatches:boolean;issues:ReviewedPackage['members']
 }>>()
 const items=source.deadline.items.map(item=>{
  const members=source.requiredMembers.filter(entry=>entry.obligationId===item.obligationId).map(entry=>{
   const link=byMember.get(memberKey(entry))
   const pack=link&&item.state==='EFFECTIVE_ATTEMPT'&&link.attemptRef===item.attemptRef?byPackage.get(link.packageId):undefined
   const verified=link&&pack?.packageHash===link.packageHash?pack:undefined
   if(verified&&link){
    const key=JSON.stringify([link.attemptRef,verified.packageId])
    if(!checks.has(key))checks.set(key,Object.freeze({
     attemptRef:link.attemptRef,packageId:verified.packageId,packageHash:verified.packageHash,
     membershipMatches:verified.membershipMatches,issues:Object.freeze(verified.members.filter(value=>value.issues.length>0)),
    }))
   }
   const member=verified?.members.find(value=>value.position===entry.position)
   const state=!member?'PENDING':member.issues.length?'MISMATCHED':'MATCHED'
   return Object.freeze({position:entry.position,packageId:verified?.packageId??null,state})
  })
  const contentState=members.some(member=>member.state==='MISMATCHED')?'MISMATCHED':
   members.length&&members.every(member=>member.state==='MATCHED')?'MATCHED':'PENDING'
  return Object.freeze({...item,members:Object.freeze(members),contentState})
 })
 assertCurrent()
 return Object.freeze({items:Object.freeze(items),packageChecks:Object.freeze([...checks.values()]),
  cutoffAt:source.deadline.cutoffAt,knownAt:source.deadline.knownAt,assertCurrent})
}
