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

/** 原递交请求的读取合同。 */
type Read=Parameters<typeof readRegisteredSubmissionRequest>

/** 原请求身份由当前项目与调用引用取得，原事件由已绑定办理记录读取方供给。 */
export function createContentSubmissionScriptHost<Runtime extends Pick<PageRuntime,'resolveView'|'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,scope:Omit<Read[0],'runtime'>){
 return {runtime,assertCurrent:scope.assertCurrent,
  async invoke(name:string,input:unknown,signal:AbortSignal){
   if(!isRecord(input))throw Error('SUBMISSION_PAGE_COMMAND_REQUIRED')
   const generation=runtime.generation,projectId=scope.projectId
   const assertCurrent=()=>{
    scope.assertCurrent()
    if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)throw Error('SUBMISSION_PAGE_STALE')
   }
   const host={...scope,runtime,assertCurrent}
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
