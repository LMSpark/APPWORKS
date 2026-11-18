/**
 * @module app:services/smart-bid/content/review/submission-attempt-recovery
 * 职责：第52项核对原办理结果，区分上传、实发、撤回及权威未执行。
 */
import {snapshotReferenceIdentity as identity} from '../references/snapshot-reference-values'

type Scope=Readonly<{projectId:string;lotId:string;subjectId:string;channelId:string;attemptRef:string;requestDigest:string}>
type Event=Scope&Readonly<{eventRef:string;assertCurrent:()=>void}>&(
 Readonly<{kind:'UPLOADED';fileVersionId:string}>|
 Readonly<{kind:'DISPATCHED';actualObjectRef:string;uploadEventRef?:string}>|
 Readonly<{kind:'WITHDRAWAL_SENT';targetAttemptRef:string}>|
 Readonly<{kind:'NOT_EXECUTED'}>
)

/** 仅返回唯一、同请求的原办理事实；上传本身保留为待查线索。 */
export function recoverSubmissionAttempt(scope:Scope,source:Readonly<{events:readonly Event[];assertCurrent:()=>void;
 combinedWithdrawalTarget?:string}>){
 const events=[...source.events]
 const assertCurrent=()=>{source.assertCurrent();for(const event of events)event.assertCurrent()}
 assertCurrent()
 const {projectId,lotId,subjectId,channelId,attemptRef,requestDigest}=scope
 if(![projectId,lotId,subjectId,channelId,attemptRef].every(identity)||!/^[a-f0-9]{64}$/u.test(requestDigest))
  throw Error('SUBMISSION_ATTEMPT_RECOVERY_SCOPE')
 const seen=new Set<string>(),uploads=new Map<string,string>()
 const outcomes=[]
 for(const event of events){
  if(event.projectId!==projectId||event.lotId!==lotId||event.subjectId!==subjectId||event.channelId!==channelId||
   event.attemptRef!==attemptRef||event.requestDigest!==requestDigest||!identity(event.eventRef)||seen.has(event.eventRef))
   throw Error('SUBMISSION_ATTEMPT_RECOVERY_SCOPE')
  seen.add(event.eventRef)
  if(event.kind==='UPLOADED'){
   if(!identity(event.fileVersionId))throw Error('SUBMISSION_ATTEMPT_RECOVERY_EVIDENCE')
   uploads.set(event.eventRef,event.fileVersionId)
  }else outcomes.push(event)
 }
 const event=outcomes.length===1?outcomes[0]:undefined
 const base={projectId,lotId,subjectId,channelId,attemptRef,requestDigest,
  eventRefs:Object.freeze([...seen]),assertCurrent}
 const target=source.combinedWithdrawalTarget
 if(target!==undefined){
  const error='SUBMISSION_ATTEMPT_RECOVERY_EVIDENCE'
  if(!identity(target)||target===attemptRef)throw Error(error)
  const dispatched=outcomes.filter(item=>item.kind==='DISPATCHED')
  const withdrawn=outcomes.filter(item=>item.kind==='WITHDRAWAL_SENT')
  const terminal=outcomes.filter(item=>item.kind==='NOT_EXECUTED')
  if(terminal.length===1&&outcomes.length===1&&terminal[0])
   return Object.freeze({...base,status:'NOT_EXECUTED' as const,evidenceRef:terminal[0].eventRef})
  if(terminal.length)return Object.freeze({...base,status:'UNKNOWN' as const})
  if(withdrawn.some(item=>item.targetAttemptRef!==target))throw Error(error)
  const dispatch=dispatched.length===1?dispatched[0]:undefined
  const withdrawal=withdrawn.length===1?withdrawn[0]:undefined
  if(dispatch&&!identity(dispatch.actualObjectRef))throw Error(error)
  const uploadedFileVersionId=dispatch?.uploadEventRef===undefined?null:uploads.get(dispatch.uploadEventRef)
  const newDelivery=dispatch&&uploadedFileVersionId!==undefined?Object.freeze({
   evidenceRef:dispatch.eventRef,actualObjectRef:dispatch.actualObjectRef,uploadedFileVersionId,
  }):null
  const oldWithdrawal=withdrawal?Object.freeze({evidenceRef:withdrawal.eventRef,targetAttemptRef:target}):null
  const status=newDelivery&&oldWithdrawal?'COMBINED_SENT':newDelivery||oldWithdrawal?'PARTIAL':'UNKNOWN'
  return Object.freeze({...base,status,newDelivery,oldWithdrawal})
 }
 if(!event)return Object.freeze({...base,status:'UNKNOWN' as const})
 const evidenceRef=event.eventRef
 if(event.kind==='NOT_EXECUTED')return Object.freeze({...base,status:event.kind,evidenceRef})
 if(event.kind==='WITHDRAWAL_SENT'){
  if(!identity(event.targetAttemptRef)||event.targetAttemptRef===attemptRef)throw Error('SUBMISSION_ATTEMPT_RECOVERY_EVIDENCE')
  return Object.freeze({...base,status:event.kind,evidenceRef,targetAttemptRef:event.targetAttemptRef})
 }
 if(!identity(event.actualObjectRef))throw Error('SUBMISSION_ATTEMPT_RECOVERY_EVIDENCE')
 const uploadedFileVersionId=event.uploadEventRef===undefined?null:uploads.get(event.uploadEventRef)
 if(uploadedFileVersionId===undefined)return Object.freeze({...base,status:'UNKNOWN' as const})
 return Object.freeze({...base,status:event.kind,evidenceRef,actualObjectRef:event.actualObjectRef,uploadedFileVersionId})
}
