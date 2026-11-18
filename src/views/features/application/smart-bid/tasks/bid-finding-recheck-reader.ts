/**
 * @module app:views/features/application/smart-bid/tasks/bid-finding-recheck-reader
 * 职责：第44项先按项目与预期版本读取原问题，再核其整改和复核证据。
 */
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {prepareReviewFindingRecheck} from '@/services/smart-bid/content/review/finding/review-finding-recheck'
import {originalRegistrationView,readOriginalRegistrationView} from '../authority/original-registration-view'

type Recheck=Parameters<typeof prepareReviewFindingRecheck>
type EvidenceSource=Omit<Recheck[1],'finding'>
const keys=['projectId','findingId','versionRef']
const fields=['targetKind','targetId','targetVersionRef','effectiveHash','remediatorId']
const kinds=['CONTENT','FILE','FIELD','PACKAGE','SUBMISSION','VALIDATION'] as const
const error='REVIEW_FINDING_ORIGINAL_REQUIRED'

/** 装配页15的 CheckFinding@originalRecheckFinding。 */
export function bidFindingRecheckView(primaryKey:string){
 return originalRegistrationView(primaryKey,keys,fields)
}

/** 原问题正式可读且身份匹配后，才读取当前复核决定与改后证据。 */
export async function prepareRegisteredBidFindingRecheck(
 host:Parameters<typeof readOriginalRegistrationView>[0]&Readonly<{projectId:string}>,request:Recheck[0],
 readEvidence:(finding:Recheck[1]['finding'])=>Promise<EvidenceSource>){
 host.assertCurrent()
 const {projectId,findingId,expectedFindingVersion,requestKey}=request
 if(projectId!==host.projectId||![projectId,findingId,expectedFindingVersion,requestKey].every(identity))throw Error(error)
 const read=await readOriginalRegistrationView(host,{model:'CheckFinding',viewName:'originalRecheckFinding'},
  {projectId,findingId,versionRef:expectedFindingVersion})
 const {row}=read
 if(!row)throw Error(error)
 const assertCurrent=read.captureFields(fields)
 assertCurrent()
 const {targetKind,targetId,targetVersionRef,effectiveHash,remediatorId}=row
 const kind=kinds.find(value=>value===targetKind)
 if(!kind||!identity(targetId)||!identity(targetVersionRef)||!identity(effectiveHash)||!identity(remediatorId)||
  !/^[a-f0-9]{64}$/u.test(effectiveHash))throw Error(error)
 const target=Object.freeze({kind,targetId,versionRef:targetVersionRef,effectiveHash})
 const finding=Object.freeze({projectId,findingId,versionRef:expectedFindingVersion,target,remediatorId,assertCurrent})
 const evidence=await readEvidence(finding)
 return prepareReviewFindingRecheck(request,{...evidence,finding})
}
