/**
 * @module app:services/smart-bid/content/references/followup/tender-followup-notice
 * 职责：第57项固定正式后续通知及其已证边界，供下游分派和期限跟踪。
 */
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../../revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'

type Scope=Readonly<{projectId:string;lotId:string;roundId:string;subjectId:string;stageId:string}>
type Notice=Scope&Readonly<{
 noticeId:string;documentVersionId:string;sourceRef:string;issuerRef:string;channelId:string
 kind:'INQUIRY'|'CLARIFICATION'|'REVIEW'|'REPRICE_INVITATION'|'OTHER'
 change:'INITIAL'|'SUPPLEMENT'|'CORRECTION'|'CANCELLATION';previousNoticeRef:string|null
 originalObjectRef:string|null;issuedAt:string;knownAt:string;replyDueAt:string|null
 permittedScopeRef:string|null;assertCurrent:()=>void
}>
const times=(value:string)=>{
 const parsed=Date.parse(value)
 if(!Number.isFinite(parsed)||!/(?:Z|[+-]\d{2}:\d{2})$/u.test(value))throw Error('TENDER_FOLLOWUP_TIME')
 return parsed
}

/** 旧包待配也保留正式来件与期限；报价权限由后续原范围核定。 */
export async function prepareTenderFollowupNotice(scope:Scope,notice:Notice){
 notice.assertCurrent()
 const {projectId,lotId,roundId,subjectId,stageId}=scope
 const {noticeId,documentVersionId,sourceRef,issuerRef,channelId,kind,change,previousNoticeRef,
  originalObjectRef,issuedAt,knownAt,replyDueAt,permittedScopeRef}=notice
 const fields=['projectId','lotId','roundId','subjectId','stageId'] as const
 if(fields.some(key=>!identity(scope[key])||notice[key]!==scope[key])||
  ![noticeId,documentVersionId,sourceRef,issuerRef,channelId].every(identity)||
  !['INQUIRY','CLARIFICATION','REVIEW','REPRICE_INVITATION','OTHER'].includes(kind)||
  !['INITIAL','SUPPLEMENT','CORRECTION','CANCELLATION'].includes(change)||
  (change==='INITIAL'?previousNoticeRef!==null:!identity(previousNoticeRef)||previousNoticeRef===noticeId)||
  [originalObjectRef,permittedScopeRef].some(ref=>ref!==null&&!identity(ref)))
  throw Error('TENDER_FOLLOWUP_SCOPE')
 const issued=times(issuedAt)
 if(times(knownAt)<issued||replyDueAt!==null&&times(replyDueAt)<issued)throw Error('TENDER_FOLLOWUP_TIME')
 const record=Object.freeze({projectId,lotId,roundId,subjectId,stageId,noticeId,documentVersionId,sourceRef,issuerRef,channelId,
  kind,change,previousNoticeRef,originalObjectRef,issuedAt,knownAt,replyDueAt,permittedScopeRef})
 const digest=await hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.followup-notice/1',record]))
 notice.assertCurrent()
 return Object.freeze({record,digest,objectState:originalObjectRef===null?'PENDING_PAIR':'IDENTIFIED',
  scopeState:permittedScopeRef===null?'PENDING_SCOPE':'REQUIRES_INTERPRETATION',assertCurrent:()=>notice.assertCurrent()})
}

/** 按同一原通知归并取得记录，维持原文件版本、事实范围和各入口线索。 */
export async function mergeTenderFollowupNoticeReads(scope:Scope,reads:readonly Notice[]){
 const source=[...reads]
 if(!source.length)throw Error('TENDER_FOLLOWUP_SCOPE')
 const checked:Array<Awaited<ReturnType<typeof prepareTenderFollowupNotice>>>=[]
 for(const notice of source)checked.push(await prepareTenderFollowupNotice(scope,notice))
 const first=checked[0]
 if(!first)throw Error('TENDER_FOLLOWUP_SCOPE')
 const eventRecord=(record:typeof first.record)=>{
  const {sourceRef:_source,knownAt:_known,...event}=record
  return event
 }
 const event=eventRecord(first.record)
 const encoded=canonicalSnapshotValue(['spark-bid.followup-event/1',event])
 const origins=new Map<string,string>()
 for(const {record} of checked){
  if(canonicalSnapshotValue(['spark-bid.followup-event/1',eventRecord(record)])!==encoded)
   throw Error('TENDER_FOLLOWUP_SOURCE_CONFLICT')
  const prior=origins.get(record.sourceRef)
  if(prior===undefined||times(record.knownAt)<times(prior))origins.set(record.sourceRef,record.knownAt)
 }
 const eventDigest=await hashCanonicalSnapshotText(encoded)
 const assertCurrent=()=>{for(const read of checked)read.assertCurrent()}
 assertCurrent()
 return Object.freeze({event:Object.freeze(event),eventDigest,
  origins:Object.freeze([...origins].map(([sourceRef,knownAt])=>Object.freeze({sourceRef,knownAt}))),assertCurrent})
}

/** 按获知时点核原通知关系，续件保留独立期限，更正或撤销才代替原项。 */
export function projectTenderFollowupNotices(scope:Scope,source:Readonly<{
 knownAt:string;notices:ReadonlyArray<Awaited<ReturnType<typeof mergeTenderFollowupNoticeReads>>>;assertCurrent:()=>void
}>){
 const {knownAt}=source,cutoff=times(knownAt),notices=[...source.notices]
 const assertCurrent=()=>{source.assertCurrent();for(const notice of notices)notice.assertCurrent()}
 assertCurrent()
 const fields=['projectId','lotId','roundId','subjectId','stageId'] as const
 const all=new Set<string>(),visible=new Map<string,(typeof notices)[number]>()
 if(fields.some(key=>!identity(scope[key])))throw Error('TENDER_FOLLOWUP_SCOPE')
 for(const notice of notices){
  const {event,origins}=notice
  if(fields.some(key=>event[key]!==scope[key])||all.has(event.noticeId))throw Error('TENDER_FOLLOWUP_SCOPE')
  all.add(event.noticeId)
  if(origins.some(origin=>times(origin.knownAt)<=cutoff))visible.set(event.noticeId,notice)
 }
 const replaced=new Map<string,number>(),unresolved=new Set<string>()
 for(const {event} of visible.values()){
  const parentRef=event.previousNoticeRef
  if(parentRef===null)continue
  const parent=visible.get(parentRef)
  if(!parent||times(parent.event.issuedAt)>times(event.issuedAt)){
   unresolved.add(event.noticeId)
   continue
  }
  if(event.change==='CORRECTION'||event.change==='CANCELLATION')replaced.set(parentRef,(replaced.get(parentRef)??0)+1)
 }
 const status=(event:(typeof notices)[number]['event'])=>{
  const path=new Set<string>()
  let parent:typeof event|undefined=event
  while(parent){
   if(path.has(parent.noticeId)||unresolved.has(parent.noticeId))return 'PENDING_LINK'
   if((replaced.get(parent.noticeId)??0)>1)return 'PENDING_CONFLICT'
   path.add(parent.noticeId)
   parent=parent.previousNoticeRef===null?undefined:visible.get(parent.previousNoticeRef)?.event
  }
  return replaced.has(event.noticeId)?'SUPERSEDED':event.change==='CANCELLATION'?'CANCELLED':'ACTIVE'
 }
 const items=[...visible.values()].map(({event,eventDigest,origins})=>Object.freeze({
  event,eventDigest,origins:Object.freeze(origins.filter(origin=>times(origin.knownAt)<=cutoff)),
  state:status(event),
 }))
 assertCurrent()
 return Object.freeze({...scope,knownAt,items:Object.freeze(items),assertCurrent})
}
