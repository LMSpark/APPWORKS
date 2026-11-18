/**
 * @module app:services/smart-bid/content/review/submission/tender-outcome-evidence
 * 职责：第58项按主体和轮次固定可证的正式阶段结果，保留更正前的原记录。
 */
import {snapshotReferenceIdentity as identity} from '../../references/snapshot-reference-values'
import type {projectTenderFollowupNotices} from '../../references/followup/tender-followup-notice'

type Scope=Readonly<{projectId:string;lotId:string;roundId:string;stageId:string;subjectId:string}>
type SubjectOutcome='QUALIFIED'|'DISQUALIFIED'|'RECOMMENDED'|'AWARDED'|'NOT_AWARDED'
type Event=Omit<Scope,'subjectId'>&Readonly<{
 eventRef:string;issuerRef:string;documentVersionId:string;eventAt:string;knownAt:string
 supersedesRef:string|null;assertCurrent:()=>void
}>&(Readonly<{subjectId:string;kind:SubjectOutcome}>|Readonly<{subjectId:null;kind:'ROUND_TERMINATED'}>)
const time=(value:string)=>{
 const parsed=Date.parse(value)
 if(!Number.isFinite(parsed)||!/(?:Z|[+-]\d{2}:\d{2})$/u.test(value))throw Error('TENDER_OUTCOME_TIME')
 return parsed
}

/** 仅按正式原件确定结果，公告日期或总价不用于反推递交事实。 */
export function projectTenderOutcome(scope:Scope,source:Readonly<{
 knownAt:string;officialEvents:readonly Event[];assertCurrent:()=>void
}>){
 const events=[...source.officialEvents]
 const assertCurrent=()=>{source.assertCurrent();for(const event of events)event.assertCurrent()}
 assertCurrent()
 const fields=['projectId','lotId','roundId','stageId'] as const
 if(![...fields.map(key=>scope[key]),scope.subjectId].every(identity))throw Error('TENDER_OUTCOME_SCOPE')
 const knownAt=time(source.knownAt)
 const known=new Map<string,Event>(),seen=new Set<string>()
 for(const event of events){
  const expectedSubject=event.kind==='ROUND_TERMINATED'?null:scope.subjectId
  if(fields.some(key=>event[key]!==scope[key])||event.subjectId!==expectedSubject||
   ![event.eventRef,event.issuerRef,event.documentVersionId].every(identity)||seen.has(event.eventRef))
   throw Error('TENDER_OUTCOME_SCOPE')
  seen.add(event.eventRef)
  if(time(event.eventAt)<=knownAt&&time(event.knownAt)<=knownAt)known.set(event.eventRef,event)
 }
 const superseded=new Set<string>(),pending=new Set<string>()
 for(const event of known.values()){
  if(event.supersedesRef===null)continue
  const prior=known.get(event.supersedesRef)
  if(!prior){pending.add(event.eventRef);continue}
  if(prior===event||prior.subjectId!==event.subjectId||time(prior.eventAt)>=time(event.eventAt))
   throw Error('TENDER_OUTCOME_CORRECTION_SCOPE')
  superseded.add(prior.eventRef)
 }
 const unresolved=(event:Event)=>{
  let ancestor:Event|undefined=event
  while(ancestor){
   if(pending.has(ancestor.eventRef))return true
   ancestor=ancestor.supersedesRef===null?undefined:known.get(ancestor.supersedesRef)
  }
  return false
 }
 const pendingEvents=[...known.values()].filter(unresolved)
 const active=[...known.values()].filter(event=>!superseded.has(event.eventRef)&&!unresolved(event))
 const subjects=active.filter(event=>event.subjectId!==null&&event.kind!=='RECOMMENDED')
 const kinds=new Set(subjects.map(event=>event.kind))
 const recommended=active.some(event=>event.kind==='RECOMMENDED')
 const subjectState=pendingEvents.some(event=>event.subjectId!==null)?'PENDING_CORRECTION':
  kinds.size>1?'PENDING_CONFLICT':subjects[0]?.kind??(recommended?'RECOMMENDED':'PENDING')
 const roundState=pendingEvents.some(event=>event.subjectId===null)?'PENDING_CORRECTION':
  active.some(event=>event.kind==='ROUND_TERMINATED')?'TERMINATED':'UNCONFIRMED'
 const evidence=[...known.values()].map(({eventRef,issuerRef,documentVersionId,kind,eventAt,knownAt:acquiredAt,supersedesRef})=>
  Object.freeze({eventRef,issuerRef,documentVersionId,kind,eventAt,acquiredAt,supersedesRef}))
 assertCurrent()
 return Object.freeze({...scope,knownAt:source.knownAt,subjectState,roundState,evidence:Object.freeze(evidence),
  pendingCorrectionRefs:Object.freeze(pendingEvents.map(event=>event.eventRef)),assertCurrent})
}

/** 已被更正的通知仍可供追溯原处置，关联由正式处置原据提供。 */
export function linkTenderOutcomeFollowup(outcome:ReturnType<typeof projectTenderOutcome>,
 notices:ReturnType<typeof projectTenderFollowupNotices>,link:Readonly<{
 outcomeEventRef:string;noticeId:string;noticeDigest:string;linkRef:string;assertCurrent:()=>void
 }>){
 const assertCurrent=()=>{outcome.assertCurrent();notices.assertCurrent();link.assertCurrent()}
 assertCurrent()
 const fields=['projectId','lotId','roundId','stageId','subjectId'] as const
 if(fields.some(field=>outcome[field]!==notices[field])||
  ![link.outcomeEventRef,link.noticeId,link.linkRef].every(identity)||!/^[a-f0-9]{64}$/u.test(link.noticeDigest))
  throw Error('TENDER_OUTCOME_FOLLOWUP_SCOPE')
 const result=outcome.evidence.find(event=>event.eventRef===link.outcomeEventRef)
 const item=notices.items.find(notice=>notice.event.noticeId===link.noticeId)
 if(!result||!item)return Object.freeze({state:'PENDING_LINK' as const,assertCurrent})
 if(item.eventDigest!==link.noticeDigest||time(item.event.issuedAt)>time(result.eventAt)||result.kind==='ROUND_TERMINATED')
  throw Error('TENDER_OUTCOME_FOLLOWUP_SCOPE')
 return Object.freeze({state:'LINKED' as const,outcomeEventRef:result.eventRef,noticeId:item.event.noticeId,
  noticeDigest:item.eventDigest,noticeVersionId:item.event.documentVersionId,linkRef:link.linkRef,assertCurrent})
}
