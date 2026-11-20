/**
 * @module app:services/smart-bid/content/references/followup/tender-followup-response-scope
 * 职责：第57项通知向应答任务交接时核解释、修正和重新报价的原范围。
 */
import type {projectTenderFollowupNotices} from './tender-followup-notice'
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'

type Timeline=ReturnType<typeof projectTenderFollowupNotices>
type Action='EXPLAIN'|'CORRECT'|'REPRICE'
type Proof=Readonly<{
 noticeId:string;eventDigest:string;permittedScopeRef:string;ruleRef:string
 allowed:ReadonlyArray<Readonly<{action:Action;targetRefs:readonly string[]}>>
 assertCurrent:()=>void
}>

/** 现行正式通知和独立原文核定均成立时才给出当次答复范围。 */
export function checkTenderFollowupResponseScope(timeline:Timeline,request:Readonly<{
 noticeId:string;action:Action;targetRefs:readonly string[]
}>,proof:Proof|undefined){
 const assertCurrent=()=>{timeline.assertCurrent();proof?.assertCurrent()}
 assertCurrent()
 const {noticeId,action}=request,targetRefs=Object.freeze([...request.targetRefs])
 const error='TENDER_FOLLOWUP_RESPONSE_SCOPE'
 if(![noticeId,...targetRefs].every(identity)||!targetRefs.length||new Set(targetRefs).size!==targetRefs.length||
  !['EXPLAIN','CORRECT','REPRICE'].includes(action))throw Error(error)
 const item=timeline.items.find(entry=>entry.event.noticeId===noticeId)
 const result={noticeId,action,targetRefs,assertCurrent}
 if(item?.state!=='ACTIVE')return Object.freeze({...result,state:'NOTICE_REQUIRED' as const})
 const {event,eventDigest}=item
 if(!proof||event.permittedScopeRef===null)return Object.freeze({...result,state:'SCOPE_REQUIRED' as const})
 if(proof.noticeId!==noticeId||proof.eventDigest!==eventDigest||proof.permittedScopeRef!==event.permittedScopeRef||
  !identity(proof.ruleRef))throw Error(error)
 const matched=proof.allowed.filter(entry=>entry.action===action)
 const allowed=matched[0]?.targetRefs
 if(matched.length>1||allowed!==undefined&&(!allowed.every(identity)||new Set(allowed).size!==allowed.length))throw Error(error)
 const permitted=allowed!==undefined&&targetRefs.every(target=>allowed.includes(target))
 return Object.freeze({...result,eventDigest,ruleRef:proof.ruleRef,replyDueAt:event.replyDueAt,channelId:event.channelId,
  state:permitted?'ALLOWED':'OUTSIDE_SCOPE'})
}
