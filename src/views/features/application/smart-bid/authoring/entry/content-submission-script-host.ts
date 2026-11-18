/**
 * @module app:views/features/application/smart-bid/authoring/entry/content-submission-script-host
 * 职责：页14按原请求查办理及回执配对，供页13递交辅助共用。
 * 边界：仅查当前 PageRuntime 的原办理，正式递交和撤回由原服务执行。
 * AI用途：核对查询命令是否保留原请求和渠道身份。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {recoverSubmissionAttempt} from '@/services/smart-bid/content/review/submission-attempt-recovery'
import {readRegisteredSubmissionRequest} from '../model/review/submission/content-submission-request-reader'
import {readRegisteredSubmissionEvents} from '../model/review/submission/content-submission-events-reader'
import {readRegisteredChannelReceiptPairing} from '../model/review/submission/content-channel-receipt-pairing-reader'
import {readRegisteredReceiptCandidates} from '../model/review/submission/content-channel-receipt-candidates'
import {reconcileDeadlineDelivery} from '../model/review/deadline/content-deadline-reconciliation'
import {readRegisteredTenderOutcome} from '../model/review/submission/content-tender-outcome-reader'
import {readRegisteredDeadlineRecord} from '../model/review/deadline/content-deadline-record-reader'
import {reviewRegisteredDeliveryZipPackage} from '../model/review/package/content-package-review'
import {reviewRegisteredPaperSubmissionPackage} from '../model/review/package/content-paper-submission-package-reader'

/** 原递交请求的读取合同。 */
type Read=Parameters<typeof readRegisteredSubmissionRequest>
/** 截止对账的原记录、证据和核对选项合同。 */
type Deadline=Parameters<typeof reconcileDeadlineDelivery>
/** 冻结包、原装封请求与 ZIP 字节核验合同。 */
type PackageReview=Parameters<typeof reviewRegisteredDeliveryZipPackage>
/** 读取原截止记录对应的回执和核对证据。 */
type ReadDeadline=(record:Awaited<ReturnType<typeof readRegisteredDeadlineRecord>>,signal:AbortSignal)=>Promise<Readonly<{
 options:Deadline[2]
 receipts:Omit<Deadline[1],'receipts'>&Readonly<{
  receipts:ReadonlyArray<Deadline[1]['receipts'][number]&Readonly<{assertCurrent:()=>void}>>
 }>
}>>
/** 正式宿主按原包身份提供装封请求及原件读取能力。 */
type PackageSelection=(input:PackageReview[2]['package'],signal:AbortSignal)=>Promise<Readonly<{
 request:PackageReview[1];options:PackageReview[2];assertCurrent:()=>void
}>>

/** 原请求身份由当前项目与调用引用取得，原事件由已绑定办理记录读取方供给。 */
export function createContentSubmissionScriptHost<Runtime extends Pick<PageRuntime,'resolveView'|'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,scope:Omit<Read[0],'runtime'>,sources:Readonly<{
  readDeadline?:ReadDeadline;readPackageSelection?:PackageSelection
  paperEvidence?:Parameters<typeof reviewRegisteredPaperSubmissionPackage>[2]
 }>={}){
 return {runtime,assertCurrent:scope.assertCurrent,
  async invoke(name:string,input:unknown,signal:AbortSignal){
   if(!isRecord(input))throw Error('SUBMISSION_PAGE_COMMAND_REQUIRED')
   const generation=runtime.generation,projectId=scope.projectId
   const assertCurrent=()=>{
    scope.assertCurrent()
    if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)throw Error('SUBMISSION_PAGE_STALE')
   }
   const host={...scope,runtime,assertCurrent}
   if(name==='content.submission.reviewPaperPackage'&&sources.paperEvidence){
    const {packageId,packingRequestRef}=input
    if(!identity(packageId)||!identity(packingRequestRef))throw Error('SUBMISSION_PAGE_PACKAGE_SCOPE')
    return reviewRegisteredPaperSubmissionPackage(host,{packageId,packingRequestRef},sources.paperEvidence)
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
    return reviewRegisteredDeliveryZipPackage({...host,assertCurrent:assertSelection},selection.request,selection.options)
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
    return reconcileDeadlineDelivery(record.input,{...selected.receipts,receipts,assertCurrent:()=>{
     record.assertCurrent();selected.receipts.assertCurrent()
     for(const receipt of receipts)receipt.assertCurrent()
    }},selected.options)
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
   if(source.combinedWithdrawalTarget!==undefined&&source.combinedWithdrawalTarget!==original.priorAttemptRef)
    throw Error('SUBMISSION_PAGE_WITHDRAWAL_SCOPE')
   const result=recoverSubmissionAttempt(exact,{...source,assertCurrent:()=>{original.assertCurrent();source.assertCurrent()}})
   return Object.freeze({...result,registered:true})
  },
 }
}
