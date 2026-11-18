/**
 * @module app:services/smart-bid/content/references/person-appointment-review
 * 职责：动作25按已核人员材料、企业用人决定和调配证明确认同一拟任关系。
 */
import {snapshotReferenceIdentity as identity} from './snapshot-reference-values'

type PersonScope=Readonly<{personId:string;employerId:string}>
type AppointmentScope=PersonScope&Readonly<{enterpriseId:string;projectId:string;positionRef:string}>
type Period=Readonly<{start:number;end:number}>
type Proof=Readonly<{assertCurrent:()=>void}>
type AppointmentEvidence=Readonly<{
 material:PersonScope&Proof&Readonly<{versionRef:string}>
 appointment:AppointmentScope&Period&Proof&Readonly<{decisionRef:string}>
 availability:(Period&Proof&Readonly<{restricted:false}>)|(Period&Proof&Readonly<{restricted:true
  allocation?:AppointmentScope&Period&Proof&Readonly<{decisionRef:string;intent:'ASSIGN'|'ADJUST'|'RELEASE'}>
 }>)
}>
const scopeFields=['personId','employerId','enterpriseId','projectId','positionRef'] as const

/** 时段为经来源核实的时间戳，返回拟任核验及下游可回查的引用。 */
export function reviewPersonAppointment(request:AppointmentScope&Period,evidence:AppointmentEvidence){
 const {material,appointment,availability}=evidence
 const allocation=availability.restricted?availability.allocation:undefined
 const assertCurrent=()=>{material.assertCurrent();appointment.assertCurrent();availability.assertCurrent();allocation?.assertCurrent()}
 assertCurrent()
 if(![...scopeFields.map(key=>request[key]),material.versionRef,appointment.decisionRef].every(identity)||
  material.personId!==request.personId||material.employerId!==request.employerId||
  scopeFields.some(key=>appointment[key]!==request[key]||(allocation!==undefined&&allocation[key]!==request[key]))||
  (allocation!==undefined&&(!identity(allocation.decisionRef)||!['ASSIGN','ADJUST','RELEASE'].includes(allocation.intent))))
  throw Error('BID_PERSON_APPOINTMENT_SCOPE')
 for(const period of [request,appointment,availability,...(allocation?[allocation]:[])])
  if(!Number.isSafeInteger(period.start)||!Number.isSafeInteger(period.end)||period.start>=period.end)
   throw Error('BID_PERSON_APPOINTMENT_PERIOD')
 const covers=(period:Period)=>period.start<=request.start&&period.end>=request.end
 if(!covers(appointment)||!covers(availability))return Object.freeze({state:'AVAILABILITY_PENDING' as const,assertCurrent})
 if(availability.restricted&&(!allocation||allocation.intent==='RELEASE'||!covers(allocation)))
  return Object.freeze({state:'ALLOCATION_PENDING' as const,assertCurrent})
 return Object.freeze({state:'VERIFIED' as const,personId:request.personId,employerId:request.employerId,
  enterpriseId:request.enterpriseId,projectId:request.projectId,positionRef:request.positionRef,start:request.start,end:request.end,
  materialVersionRef:material.versionRef,appointmentDecisionRef:appointment.decisionRef,
  allocationDecisionRef:allocation?.decisionRef??null,assertCurrent})
}
