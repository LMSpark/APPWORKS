/**
 * @module app:services/smart-bid/content/review/submission/submission-opening-disposition
 * 职责：第54项按可识别原包分别展示开启和准入的正式处置。
 */
import {snapshotReferenceIdentity as identity} from '../../references/snapshot-reference-values'

type ObjectScope=Readonly<{projectId:string;lotId:string;roundId:string;attemptRef:string;objectRef:string}>
type Disposition=ObjectScope&Readonly<{eventRef:string;issuerRef:string;eventAt:string;knownAt:string;assertCurrent:()=>void}>&(
 Readonly<{stage:'OPENING';state:'OPENED'|'OPEN_FAILED'}>|
 Readonly<{stage:'ADMISSIBILITY';state:'ADMITTED'|'EXCLUDED'}>
)
const stageStates={
 OPENING:['OPENED','OPEN_FAILED'],
 ADMISSIBILITY:['ADMITTED','EXCLUDED'],
} satisfies Record<Disposition['stage'],readonly string[]>
const time=(value:string)=>{
 const parsed=Date.parse(value)
 if(!Number.isFinite(parsed)||!/(?:Z|[+-]\d{2}:\d{2})$/u.test(value))throw Error('SUBMISSION_DISPOSITION_TIME')
 return parsed
}

/** 各阶段独立核证，相反记录交原出具方确认，不按到达时间覆盖。 */
export function projectSubmissionOpeningDisposition(scope:ObjectScope,source:Readonly<{
 knownAt:string;records:readonly Disposition[];assertCurrent:()=>void
}>){
 const records=[...source.records],known=time(source.knownAt)
 const assertCurrent=()=>{source.assertCurrent();for(const record of records)record.assertCurrent()}
 assertCurrent()
 const fields=['projectId','lotId','roundId','attemptRef','objectRef'] as const
 const seen=new Set<string>(),visible:Disposition[]=[]
 if(!fields.every(key=>identity(scope[key])))throw Error('SUBMISSION_DISPOSITION_SCOPE')
 for(const record of records){
  if(fields.some(key=>record[key]!==scope[key])||!identity(record.eventRef)||!identity(record.issuerRef)||seen.has(record.eventRef))
   throw Error('SUBMISSION_DISPOSITION_SCOPE')
  seen.add(record.eventRef)
  const states:readonly string[]|undefined=Object.hasOwn(stageStates,record.stage)?stageStates[record.stage]:undefined
  if(!states?.includes(record.state))throw Error('SUBMISSION_DISPOSITION_STAGE')
  const eventAt=time(record.eventAt),knownAt=time(record.knownAt)
  if(knownAt<eventAt)throw Error('SUBMISSION_DISPOSITION_TIME')
  if(knownAt<=known)visible.push(record)
 }
 const project=(stage:Disposition['stage'])=>{
  const evidence=visible.filter(record=>record.stage===stage)
   .map(({eventRef,issuerRef,eventAt,knownAt,state})=>Object.freeze({eventRef,issuerRef,eventAt,knownAt,state}))
  const states=new Set(evidence.map(record=>record.state))
  const state=states.size>1?'PENDING_CONFLICT':evidence[0]?.state??'PENDING'
  return Object.freeze({state,evidence:Object.freeze(evidence)})
 }
 return Object.freeze({...scope,knownAt:source.knownAt,
  opening:project('OPENING'),admissibility:project('ADMISSIBILITY'),assertCurrent})
}
