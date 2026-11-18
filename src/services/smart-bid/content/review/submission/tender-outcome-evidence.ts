/**
 * @module app:services/smart-bid/content/review/submission/tender-outcome-evidence
 * 职责：第58项按主体和轮次固定可证的正式阶段结果，保留更正前的原记录。
 */
import {snapshotReferenceIdentity as identity} from '../../references/snapshot-reference-values'

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
 const superseded=new Set<string>()
 for(const event of known.values()){
  if(event.supersedesRef===null)continue
  const prior=known.get(event.supersedesRef)
  if(!prior||prior===event||prior.subjectId!==event.subjectId||time(prior.eventAt)>=time(event.eventAt))
   throw Error('TENDER_OUTCOME_CORRECTION_SCOPE')
  superseded.add(prior.eventRef)
 }
 const active=[...known.values()].filter(event=>!superseded.has(event.eventRef))
 const subjects=active.filter(event=>event.subjectId!==null&&event.kind!=='RECOMMENDED')
 const kinds=new Set(subjects.map(event=>event.kind))
 const recommended=active.some(event=>event.kind==='RECOMMENDED')
 const subjectState=kinds.size>1?'PENDING_CONFLICT':subjects[0]?.kind??(recommended?'RECOMMENDED':'PENDING')
 const roundState=active.some(event=>event.kind==='ROUND_TERMINATED')?'TERMINATED':'UNCONFIRMED'
 const evidence=[...known.values()].map(({eventRef,issuerRef,documentVersionId,kind,eventAt,knownAt:acquiredAt,supersedesRef})=>
  Object.freeze({eventRef,issuerRef,documentVersionId,kind,eventAt,acquiredAt,supersedesRef}))
 assertCurrent()
 return Object.freeze({...scope,knownAt:source.knownAt,subjectState,roundState,evidence:Object.freeze(evidence),assertCurrent})
}
