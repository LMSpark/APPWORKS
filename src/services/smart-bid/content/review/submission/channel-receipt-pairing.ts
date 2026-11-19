/**
 * @module app:services/smart-bid/content/review/submission/channel-receipt-pairing
 * 职责：第53项将接收方回执配回原办理，保留原事件与各取得来源。
 */
import {snapshotReferenceIdentity as identity} from '../../references/snapshot-reference-values'

type Scope=Readonly<{projectId:string;lotId:string;subjectId:string;channelId:string}>
type Receipt=Scope&Readonly<{
 eventRef:string;sourceRef:string;kind:'RECEIVED'|'REJECTED'|'WITHDRAWAL_CONFIRMED'
 eventAt:string;knownAt:string;operationRef:string|null;objectRef:string|null
}>
type Candidate=Scope&Readonly<{attemptRef:string;operationRef:string|null;objectRef:string|null;withdrawalTargetRef?:string}>
const time=(value:string)=>{
 const instant=Date.parse(value)
 if(!Number.isFinite(instant)||!/(?:Z|[+-]\d{2}:\d{2})$/u.test(value))throw Error('CHANNEL_RECEIPT_TIME')
 return instant
}

/** 候选由原渠道记录提供；项目、主体或相同报价不足以配批。 */
export function pairOriginalChannelReceipt(scope:Scope,receiptReads:readonly Receipt[],attempts:readonly Candidate[]){
 const keys=['projectId','lotId','subjectId','channelId'] as const
 const matchesScope=(record:Scope)=>keys.every(key=>identity(scope[key])&&record[key]===scope[key])
 const first=receiptReads[0]
 if(!first||!identity(first.eventRef))throw Error('CHANNEL_RECEIPT_SCOPE')
 const eventTime=time(first.eventAt),sources=new Map<string,string>()
 for(const receipt of receiptReads){
  const known=time(receipt.knownAt)
  if(!matchesScope(receipt)||receipt.eventRef!==first.eventRef||!identity(receipt.sourceRef)||
   !['RECEIVED','REJECTED','WITHDRAWAL_CONFIRMED'].includes(receipt.kind)||
   [receipt.operationRef,receipt.objectRef].some(value=>value!==null&&!identity(value)))throw Error('CHANNEL_RECEIPT_SCOPE')
  if(receipt.kind!==first.kind||time(receipt.eventAt)!==eventTime||receipt.operationRef!==first.operationRef||receipt.objectRef!==first.objectRef)
   throw Error('CHANNEL_RECEIPT_CONFLICT')
  if(known<eventTime)throw Error('CHANNEL_RECEIPT_TIME')
  const earlier=sources.get(receipt.sourceRef)
  if(earlier===undefined||known<time(earlier))sources.set(receipt.sourceRef,receipt.knownAt)
 }
 const seen=new Set<string>()
 const compatible=attempts.filter(attempt=>{
  if(!matchesScope(attempt)||!identity(attempt.attemptRef)||seen.has(attempt.attemptRef)||
   attempt.withdrawalTargetRef!==undefined&&(!identity(attempt.withdrawalTargetRef)||attempt.withdrawalTargetRef===attempt.attemptRef)||
   [attempt.operationRef,attempt.objectRef].some(value=>value!==null&&!identity(value)))throw Error('CHANNEL_RECEIPT_SCOPE')
  seen.add(attempt.attemptRef)
  return (first.kind==='WITHDRAWAL_CONFIRMED'?attempt.withdrawalTargetRef!==undefined:
   first.kind==='RECEIVED'?attempt.withdrawalTargetRef===undefined:true)&&
   (first.operationRef!==null||first.objectRef!==null)&&
   (first.operationRef===null||first.operationRef===attempt.operationRef)&&
   (first.objectRef===null||first.objectRef===attempt.objectRef)
 })
 const paired=compatible.length===1?compatible[0]:undefined
 const attemptRef=paired?.attemptRef??null
 return Object.freeze({projectId:first.projectId,lotId:first.lotId,subjectId:first.subjectId,channelId:first.channelId,
  eventRef:first.eventRef,kind:first.kind,eventAt:first.eventAt,attemptRef,
  withdrawalTargetRef:first.kind==='WITHDRAWAL_CONFIRMED'?paired?.withdrawalTargetRef??null:null,
  state:attemptRef===null?'PENDING_PAIR':'PAIRED',
  sources:Object.freeze([...sources].map(([sourceRef,knownAt])=>Object.freeze({sourceRef,knownAt})))})
}
