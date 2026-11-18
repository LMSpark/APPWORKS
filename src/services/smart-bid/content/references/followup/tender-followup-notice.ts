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
