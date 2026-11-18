/**
 * @module app:services/smart-bid/content/review/submission-reconciliation
 * 职责：按动作54指定截止与获知时点，逐项归并已经核定效力的渠道事件。
 * 边界：事件的生效条件由原规则和渠道证据核定；本函数不认定开启、准入或审批值相符。
 */
import {snapshotReferenceIdentity as identity} from '../references/snapshot-reference-values'

type Effect=Readonly<{
 eventRef:string;obligationId:string;attemptRef:string;effectiveAt:string;knownAt:string
}> & (Readonly<{kind:'RECEIVED'}>|Readonly<{kind:'WITHDRAWN'}>|Readonly<{kind:'REPLACED';priorAttemptRef:string}>)
function time(value:string):number{
 const result=Date.parse(value)
 if(!Number.isFinite(result)||!/(?:Z|[+-]\d{2}:\d{2})$/u.test(value))throw Error('SUBMISSION_RECONCILIATION_TIME')
 return result
}

function sameEffect(left:Effect,right:Effect):boolean{
 return left.kind===right.kind&&left.attemptRef===right.attemptRef&&
  (left.kind!=='REPLACED'||right.kind==='REPLACED'&&left.priorAttemptRef===right.priorAttemptRef)
}

/** 空证据保持待核，撤回以后的失败新件不能恢复旧件。 */
export function reconcileSubmissionDeadline(input:Readonly<{
 cutoffAt:string;knownAt:string;obligationIds:readonly string[];effects:readonly Effect[]
}>){
 const cutoff=time(input.cutoffAt),known=time(input.knownAt)
 const obligations=new Set(input.obligationIds)
 if(obligations.size!==input.obligationIds.length||!input.obligationIds.every(identity))throw Error('SUBMISSION_RECONCILIATION_SCOPE')
 const seen=new Set<string>(),byObligation=new Map<string,Array<{event:Effect;effective:number}>>()
 for(const event of input.effects){
  const {eventRef,obligationId,attemptRef}=event,key=JSON.stringify([obligationId,eventRef])
  if(!obligations.has(obligationId)||!identity(eventRef)||!identity(attemptRef)||seen.has(key))throw Error('SUBMISSION_RECONCILIATION_SCOPE')
  seen.add(key)
  const effective=time(event.effectiveAt)
  if(effective>cutoff||time(event.knownAt)>known)continue
  const list=byObligation.get(obligationId)??[]
  list.push({event,effective});byObligation.set(obligationId,list)
 }
 const items=input.obligationIds.map(obligationId=>{
  const events=(byObligation.get(obligationId)??[]).sort((a,b)=>a.effective-b.effective)
  let current:string|null=null,previous:typeof events[number]|undefined,needsResolution=false
  const retiredAttempts=new Set<string>()
  let effectiveWithdrawal=false
  for(const entry of events){
   const {event,effective}=entry
   if(previous?.effective===effective){
    if(sameEffect(previous.event,event))continue
    needsResolution=true
    break
   }
   previous=entry
   if(event.kind==='RECEIVED'){
    if(retiredAttempts.has(event.attemptRef)||(current!==null&&current!==event.attemptRef)){needsResolution=true;break}
    current=event.attemptRef
   }else if(event.kind==='REPLACED'){
    if(!identity(event.priorAttemptRef)||event.priorAttemptRef===event.attemptRef||current!==event.priorAttemptRef||retiredAttempts.has(event.attemptRef)){needsResolution=true;break}
    retiredAttempts.add(event.priorAttemptRef)
    current=event.attemptRef
   }else{
    retiredAttempts.add(event.attemptRef)
    if(current===event.attemptRef){
     current=null
     effectiveWithdrawal=true
    }
   }
  }
  const state=needsResolution?'PENDING_EFFECT':current!==null?'EFFECTIVE_ATTEMPT':effectiveWithdrawal?'WITHDRAWN':'PENDING_DELIVERY'
  return Object.freeze({obligationId,state,attemptRef:needsResolution?null:current,
   eventRefs:Object.freeze(events.map(item=>item.event.eventRef))})
 })
 return Object.freeze({cutoffAt:input.cutoffAt,knownAt:input.knownAt,items:Object.freeze(items)})
}
