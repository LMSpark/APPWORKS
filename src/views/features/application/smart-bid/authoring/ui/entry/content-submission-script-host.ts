/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/content-submission-script-host
 * 职责：页14按原请求查办理及回执配对，供页13递交辅助共用。
 * 边界：仅查当前 PageRuntime 的原办理，正式递交和撤回由原服务执行。
 * AI用途：核对查询命令是否保留原请求和渠道身份。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {recoverSubmissionAttempt} from '@/services/smart-bid/content/review/submission-attempt-recovery'
import {prepareDeliveryFreezeSelection} from '@/services/smart-bid/content/review/delivery-selection-digest'
import {preparePaperPackingRecord} from '@/services/smart-bid/content/review/paper-submission-package'
import {prepareSignatureRequest,recoverSignatureRequest} from '@/services/smart-bid/content/review/submission/signature-request'
import {prepareRegisteredDeliveryZipPackage} from '../../model/review/package/content-delivery-package-preparation'
import {readPackingRegistrationIdentity,recoverRegisteredPackingCandidate} from '../../model/review/package/content-submission-package-reader'
import {readRegisteredSubmissionRequest} from '../../model/review/submission/content-submission-request-reader'
import {readRegisteredSubmissionEvents} from '../../model/review/submission/content-submission-events-reader'
import {readRegisteredChannelReceiptPairing} from '../../model/review/submission/content-channel-receipt-pairing-reader'
import {readRegisteredReceiptCandidates} from '../../model/review/submission/content-channel-receipt-candidates'
import {attachDeadlinePackageDisposition,reconcileDeadlineDelivery} from '../../model/review/deadline/content-deadline-reconciliation'
import {readRegisteredTenderOutcome} from '../../model/review/submission/content-tender-outcome-reader'
import {readRegisteredDeadlineRecord} from '../../model/review/deadline/content-deadline-record-reader'
import {reviewRegisteredDeliveryZipPackage} from '../../model/review/package/content-package-review'
import {readRegisteredPaperPacking,reviewRegisteredPaperSubmissionPackage} from '../../model/review/package/content-paper-submission-package-reader'
import {assessSubmissionPackageRelease,bindPackageSignatureCoverage,readPackageSignatureChecks} from '../../model/review/package/content-package-release'
import {checkRepresentedSubmission,checkSubmissionStart,prepareSubmissionRequest} from '../../model/review/submission/content-submission-preflight'

/** 原递交请求的读取合同。 */
type Read=Parameters<typeof readRegisteredSubmissionRequest>
/** 截止对账的原记录、证据和核对选项合同。 */
type Deadline=Parameters<typeof reconcileDeadlineDelivery>
/** 同一截止核对可关联的后续开放与准入处置。 */
type DeadlineDisposition=Parameters<typeof attachDeadlinePackageDisposition>
/** 冻结包、原装封请求与 ZIP 字节核验合同。 */
type PackageReview=Parameters<typeof reviewRegisteredDeliveryZipPackage>
/** 当前实包的原放行规则及证据。 */
type PackageRelease=Parameters<typeof assessSubmissionPackageRelease>
type FreezePreparation=Parameters<typeof prepareDeliveryFreezeSelection>
type PackingPreparation=Parameters<typeof prepareRegisteredDeliveryZipPackage>
type PackingRecovery=Parameters<typeof recoverRegisteredPackingCandidate>
type PaperPacking=Parameters<typeof preparePaperPackingRecord>
type SignaturePreparation=Parameters<typeof prepareSignatureRequest>
type SignatureRecovery=Parameters<typeof recoverSignatureRequest>
type PackingSelection=Readonly<{
 selectionRef:string;request:PackingPreparation[1];assertCurrent:()=>void
}>&(
 Readonly<{state:'PREPARE';options:PackingPreparation[2]}>|
 Readonly<{state:'RECOVER';packingRequestRef:PackingRecovery[1];candidate:PackingRecovery[2];
  openAuthorized:PackingRecovery[3]}>
)
/** 读取原截止记录对应的回执和核对证据。 */
type ReadDeadline=(record:Awaited<ReturnType<typeof readRegisteredDeadlineRecord>>,signal:AbortSignal)=>Promise<Readonly<{
 options:Deadline[2]
 dispositions?:ReadonlyArray<Readonly<{binding:DeadlineDisposition[1];source:DeadlineDisposition[2]}>>
 receipts:Omit<Deadline[1],'receipts'>&Readonly<{
  receipts:ReadonlyArray<Deadline[1]['receipts'][number]&Readonly<{assertCurrent:()=>void}>>
 }>
}>>
/** 正式宿主按原包身份提供装封请求及原件读取能力。 */
type PackageSelection=(input:PackageReview[2]['package'],signal:AbortSignal)=>Promise<Readonly<{
 request:PackageReview[1];options:PackageReview[2];assertCurrent:()=>void
}>>

/** Resolve authoritative inputs for a proposed request in the current project. */
type SubmissionPreparation=(input:Readonly<{
 projectId:string;attemptRef:string;requestKey:string;combinedWithdrawalTarget:string|null
}>,signal:AbortSignal)=>Promise<Readonly<{
 contents:Parameters<typeof checkRepresentedSubmission>[0]
 representation:Parameters<typeof checkRepresentedSubmission>[1]
 channel:Parameters<typeof checkSubmissionStart>[1]
}>>

/** 原请求身份由当前项目与调用引用取得，原事件由已绑定办理记录读取方供给。 */
export function createContentSubmissionScriptHost<Runtime extends Pick<PageRuntime,'resolveView'|'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,scope:Omit<Read[0],'runtime'>,sources:Readonly<{
  readDeadline?:ReadDeadline;readPackageSelection?:PackageSelection
  paperEvidence?:Parameters<typeof reviewRegisteredPaperSubmissionPackage>[2]
  readPaperPackingSelection?:(selectionRef:string,signal:AbortSignal)=>Promise<Readonly<{
   selectionRef:string;frozen:PaperPacking[0]
  }>&(
   Readonly<{state:'PREPARE';packed:PaperPacking[1]}>|
   Readonly<{state:'RECOVER';packingRequestRef:string}>
  )>
  readPackageRelease?:(
   original:Readonly<Pick<PackageRelease[0],'projectId'|'packageId'|'packageHash'|'selectionHash'>>,signal:AbortSignal
  )=>Promise<Readonly<{rules:PackageRelease[1];evidence:PackageRelease[2];
   signature?:Readonly<{targets:Parameters<typeof bindPackageSignatureCoverage>[1];recordIds:readonly string[]}>
  }>>
  readSubmissionPreparation?:SubmissionPreparation
  readSignatureSelection?:(selectionRef:string,signal:AbortSignal)=>Promise<Readonly<{
   selectionRef:string;request:SignaturePreparation[0];basis:SignaturePreparation[1];authority:SignaturePreparation[2]
  }>>
  readOriginalSignatureSelection?:(selectionRef:string,signal:AbortSignal)=>Promise<Readonly<{
   selectionRef:string;request:SignatureRecovery[0];source:SignatureRecovery[1]
  }>>
  readFreezeSelection?:(selectionRef:string,signal:AbortSignal)=>Promise<Readonly<{
   selectionRef:string;selection:FreezePreparation[0];uses:FreezePreparation[1];assertCurrent:()=>void
  }>>
  readPackingSelection?:(selectionRef:string,signal:AbortSignal)=>Promise<PackingSelection>
 }>={}){
 async function readRelease(proof:PackageRelease[0],signal:AbortSignal){
  proof.assertCurrent()
  if(!proof.membershipMatches||!sources.readPackageRelease)return null
  const {projectId,packageId,packageHash,selectionHash}=proof
  const selected=await sources.readPackageRelease(Object.freeze({projectId,packageId,packageHash,selectionHash}),signal)
  const signatures=selected.signature?bindPackageSignatureCoverage(proof,selected.signature.targets,
   await readPackageSignatureChecks({...scope,runtime,assertCurrent:proof.assertCurrent},proof,selected.signature.recordIds)):[]
  const otherEvidence=selected.evidence.filter(item=>item.kind!=='SIGNATURE')
  return assessSubmissionPackageRelease(proof,selected.rules,[...otherEvidence,...signatures])
 }
 return {runtime,assertCurrent:scope.assertCurrent,
  async invoke(name:string,input:unknown,signal:AbortSignal){
   if(!isRecord(input))throw Error('SUBMISSION_PAGE_COMMAND_REQUIRED')
   const generation=runtime.generation,projectId=scope.projectId
   const assertCurrent=()=>{
    scope.assertCurrent()
    if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)throw Error('SUBMISSION_PAGE_STALE')
   }
   const host={...scope,runtime,assertCurrent}
   if(name==='content.submission.recoverSignature'&&sources.readOriginalSignatureSelection){
    const {selectionRef}=input
    if(!identity(selectionRef))throw Error('SUBMISSION_PAGE_SIGNATURE_SCOPE')
    assertCurrent()
    const selected=await sources.readOriginalSignatureSelection(selectionRef,signal)
    assertCurrent()
    if(selected.selectionRef!==selectionRef||selected.request.projectId!==projectId)
     throw Error('SUBMISSION_PAGE_SIGNATURE_SCOPE')
    return recoverSignatureRequest(selected.request,{
     lookup:request=>selected.source.lookup(request),
     assertCurrent:()=>{assertCurrent();selected.source.assertCurrent()},
    })
   }
   if(name==='content.submission.prepareSignature'&&sources.readSignatureSelection){
    const {selectionRef}=input
    if(!identity(selectionRef))throw Error('SUBMISSION_PAGE_SIGNATURE_SCOPE')
    assertCurrent()
    const selected=await sources.readSignatureSelection(selectionRef,signal)
    assertCurrent()
    if(selected.selectionRef!==selectionRef||selected.request.projectId!==projectId)
     throw Error('SUBMISSION_PAGE_SIGNATURE_SCOPE')
    const prepared=await prepareSignatureRequest(selected.request,selected.basis,selected.authority)
    assertCurrent()
    return Object.freeze({...prepared,assertCurrent:()=>{assertCurrent();prepared.assertCurrent()}})
   }
   if(name==='content.submission.preparePaperPacking'&&sources.readPaperPackingSelection){
    const {selectionRef}=input
    if(!identity(selectionRef))throw Error('SUBMISSION_PAGE_PACKING_SCOPE')
    assertCurrent()
    const selected=await sources.readPaperPackingSelection(selectionRef,signal)
    assertCurrent()
    if(selected.selectionRef!==selectionRef||selected.frozen.projectId!==projectId)
     throw Error('SUBMISSION_PAGE_PACKING_SCOPE')
    if(selected.state==='PREPARE'){
     const prepared=preparePaperPackingRecord(selected.frozen,selected.packed)
     return Object.freeze({status:'PREPARED' as const,...prepared,assertCurrent:()=>{assertCurrent();prepared.assertCurrent()}})
    }
    const original=await readPackingRegistrationIdentity(host,selected.packingRequestRef,'PAPER')
    if(original.status!=='REGISTERED')return original
    const {packed}=await readRegisteredPaperPacking({...host,assertCurrent:original.assertCurrent},original)
    const prepared=preparePaperPackingRecord(selected.frozen,packed)
    return Object.freeze({status:'REGISTRATION_VERIFIED' as const,...prepared})
   }
   if(name==='content.submission.preparePacking'&&sources.readPackingSelection){
    const {selectionRef}=input
    if(!identity(selectionRef))throw Error('SUBMISSION_PAGE_PACKING_SCOPE')
    assertCurrent()
    const selected=await sources.readPackingSelection(selectionRef,signal)
    const assertSelection=()=>{assertCurrent();selected.assertCurrent()}
    assertSelection()
    if(selected.selectionRef!==selectionRef||selected.request.groupScope.projectId!==projectId)
     throw Error('SUBMISSION_PAGE_PACKING_SCOPE')
    const scopedHost={...host,assertCurrent:assertSelection}
    if(selected.state==='PREPARE')return prepareRegisteredDeliveryZipPackage(scopedHost,selected.request,selected.options)
    return recoverRegisteredPackingCandidate(scopedHost,selected.packingRequestRef,selected.candidate,selected.openAuthorized)
   }
   if(name==='content.submission.prepareFreeze'&&sources.readFreezeSelection){
    const {selectionRef}=input
    if(!identity(selectionRef))throw Error('SUBMISSION_PAGE_FREEZE_SCOPE')
    assertCurrent()
    const selected=await sources.readFreezeSelection(selectionRef,signal)
    const assertSelection=()=>{assertCurrent();selected.assertCurrent()}
    assertSelection()
    if(selected.selectionRef!==selectionRef||selected.selection.groupScope.projectId!==projectId)
     throw Error('SUBMISSION_PAGE_FREEZE_SCOPE')
    const prepared=await prepareDeliveryFreezeSelection(selected.selection,selected.uses)
    assertSelection()
    return Object.freeze({...prepared,assertCurrent:()=>{assertSelection();prepared.assertCurrent()}})
   }
   if(name==='content.submission.prepareRequest'&&sources.readSubmissionPreparation){
    const {attemptRef,requestKey,combinedWithdrawalTarget=null}=input
    if(!identity(attemptRef)||!identity(requestKey)||
     (combinedWithdrawalTarget!==null&&(!identity(combinedWithdrawalTarget)||combinedWithdrawalTarget===attemptRef)))
     throw Error('SUBMISSION_PAGE_REQUEST_REQUIRED')
    assertCurrent()
    const request=Object.freeze({projectId,attemptRef,requestKey,combinedWithdrawalTarget})
    const {contents,representation,channel}=await sources.readSubmissionPreparation(request,signal)
    assertCurrent()
    if(contents.projectId!==projectId||contents.attemptRef!==attemptRef||
     (channel.combinedWithdrawal?.target.attemptRef??null)!==combinedWithdrawalTarget)
     throw Error('SUBMISSION_PAGE_PREPARATION_SCOPE')
    const represented=await checkRepresentedSubmission({...contents,assertCurrent:()=>{
     assertCurrent();contents.assertCurrent()
    }},representation)
    const start=checkSubmissionStart(represented,channel)
    if(start.state!=='READY')return Object.freeze({state:start.state,assertCurrent:start.assertCurrent})
    const prepared=await prepareSubmissionRequest(start,requestKey)
    return Object.freeze({state:'PREPARED' as const,...prepared})
   }
   if(name==='content.submission.reviewPaperPackage'&&sources.paperEvidence){
    const {packageId,packingRequestRef}=input
    if(!identity(packageId)||!identity(packingRequestRef))throw Error('SUBMISSION_PAGE_PACKAGE_SCOPE')
    const report=await reviewRegisteredPaperSubmissionPackage(host,{packageId,packingRequestRef},sources.paperEvidence)
    const release=await readRelease(report,signal)
    return Object.freeze({...report,release,assertCurrent:release?.assertCurrent??report.assertCurrent})
   }
   if(name==='content.submission.reviewPackage'&&sources.readPackageSelection){
    const {packageId,packingRequestRef}=input
    if(!identity(packageId)||!identity(packingRequestRef))throw Error('SUBMISSION_PAGE_PACKAGE_SCOPE')
    assertCurrent()
    const selection=await sources.readPackageSelection(Object.freeze({packageId,packingRequestRef}),signal)
    const assertSelection=()=>{assertCurrent();selection.assertCurrent()}
    assertSelection()
    if(selection.request.groupScope.projectId!==projectId||selection.options.package.packageId!==packageId||
     selection.options.package.packingRequestRef!==packingRequestRef)throw Error('SUBMISSION_PAGE_PACKAGE_SCOPE')
    const result=await reviewRegisteredDeliveryZipPackage({...host,assertCurrent:assertSelection},selection.request,selection.options)
    if(result.status!=='FROZEN')return result
    const release=await readRelease(result.proof,signal)
    return Object.freeze({...result,release,assertCurrent:release?.assertCurrent??result.assertCurrent})
   }
   if(name==='content.submission.readOutcome'){
    const {lotId,roundId,stageId,subjectId,knownAt}=input
    if(!identity(lotId)||!identity(roundId)||!identity(stageId)||!identity(subjectId)||!identity(knownAt))
     throw Error('SUBMISSION_PAGE_OUTCOME_SCOPE')
    return readRegisteredTenderOutcome(host,{lotId,roundId,stageId,subjectId,knownAt})
   }
   if(name==='content.submission.readDeadline'&&sources.readDeadline&&identity(input['deadlineRef'])){
    assertCurrent()
    const record=await readRegisteredDeadlineRecord(host,input['deadlineRef'])
    const selected=await sources.readDeadline(record,signal)
    record.assertCurrent()
    const {scope:receiptScope}=selected.receipts
    if(record.scope.projectId!==receiptScope.projectId||record.scope.lotId!==receiptScope.lotId||
     record.scope.subjectId!==receiptScope.subjectId||record.scope.channelId!==receiptScope.channelId)
     throw Error('SUBMISSION_PAGE_DEADLINE_SCOPE')
    const receipts=[...selected.receipts.receipts]
    const delivery=reconcileDeadlineDelivery({...record.input,roundId:record.roundId},{...selected.receipts,receipts,assertCurrent:()=>{
     record.assertCurrent();selected.receipts.assertCurrent()
     for(const receipt of receipts)receipt.assertCurrent()
    }},selected.options)
    const attachments=(selected.dispositions??[]).map(({binding,source})=>attachDeadlinePackageDisposition(delivery,binding,source))
    return Object.freeze({...delivery,dispositions:Object.freeze(attachments.map(item=>item.disposition)),assertCurrent:()=>{
     delivery.assertCurrent()
     for(const item of attachments)item.assertCurrent()
    }})
   }
   if(name==='content.submission.readReceipt'&&identity(input['receiptRef']))
    return readRegisteredChannelReceiptPairing(host,input['receiptRef'],(original,receipt)=>
     receipt.operationRef===null&&receipt.objectRef===null?Promise.resolve({attempts:[],assertCurrent}):
      readRegisteredReceiptCandidates(host,original))
   if(name!=='content.submission.readOriginal')throw Error('SUBMISSION_PAGE_COMMAND_REQUIRED')
   const {attemptRef,requestKey,requestDigest}=input
   if(!identity(attemptRef)||!identity(requestKey)||!identity(requestDigest)||!/^[a-f0-9]{64}$/u.test(requestDigest))
    throw Error('SUBMISSION_PAGE_REQUEST_REQUIRED')
   const original=await readRegisteredSubmissionRequest(host,{projectId,attemptRef,requestKey,requestDigest})
   original.assertCurrent()
   if(original.state==='UNKNOWN')return Object.freeze({status:'UNKNOWN' as const,registered:false,assertCurrent:original.assertCurrent})
   const {lotId,subjectId,channelId}=original
   const exact=Object.freeze({projectId,attemptRef,requestDigest,lotId,subjectId,channelId})
   const source=await readRegisteredSubmissionEvents(host,exact)
   original.assertCurrent()
   if((source.combinedWithdrawalTarget??null)!==original.combinedWithdrawalTarget)
    throw Error('SUBMISSION_PAGE_WITHDRAWAL_SCOPE')
   const result=recoverSubmissionAttempt(exact,{...source,assertCurrent:()=>{original.assertCurrent();source.assertCurrent()}})
   return Object.freeze({...result,registered:true,combinedWithdrawalTarget:original.combinedWithdrawalTarget})
  },
 }
}
