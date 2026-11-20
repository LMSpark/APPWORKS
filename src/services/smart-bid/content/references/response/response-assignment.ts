/**
 * @module app:services/smart-bid/content/references/response/response-assignment
 * 职责：动作34对照固定基线及应交清单核全答复分工。
 */
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'

type Scope=Readonly<{projectId:string;baselineId:string;lineageId:string;version:string}>
type Destination=Readonly<{kind:'DOCUMENT'|'FORM_CELL'|'PLATFORM_FIELD';targetRef:string;duty:'LEAD'|'SEPARATE'|'EVIDENCE'}>
type Assignment=Destination&Readonly<{assigneeRef:string;dueAt:number}>
type Proof=Readonly<{assertCurrent:()=>void}>
const destinationKey=(item:Destination)=>JSON.stringify([item.kind,item.targetRef,item.duty])
const validDestination=(item:Destination)=>['DOCUMENT','FORM_CELL','PLATFORM_FIELD'].includes(item.kind)&&identity(item.targetRef)&&
 ['LEAD','SEPARATE','EVIDENCE'].includes(item.duty)

/** 落点由上游完整清单提供；按同范围确认每位承办人的目标资料访问权。 */
export function prepareResponseAssignment(input:Scope&Readonly<{assignmentRef:string;assignments:readonly Assignment[]}>,source:Scope&Proof&Readonly<{
 destinations:readonly Destination[]
 canAccess:(assignment:Assignment)=>boolean
}>){
 source.assertCurrent()
 const {projectId,baselineId,lineageId,version,assignmentRef}=input
 if(![projectId,baselineId,lineageId,version,assignmentRef].every(identity)||projectId!==source.projectId||
  baselineId!==source.baselineId||lineageId!==source.lineageId||version!==source.version)throw Error('BID_RESPONSE_ASSIGNMENT_SCOPE')
 const destinations=new Set(source.destinations.map(destinationKey))
 if(!destinations.size||destinations.size!==source.destinations.length||!source.destinations.every(validDestination))
  throw Error('BID_RESPONSE_ASSIGNMENT_DESTINATIONS')
 const rows=input.assignments.map(item=>{
  if(!validDestination(item)||!destinations.delete(destinationKey(item))||!identity(item.assigneeRef)||
   !Number.isSafeInteger(item.dueAt)||!source.canAccess(item))throw Error('BID_RESPONSE_ASSIGNMENT_TARGET')
  return Object.freeze({kind:item.kind,targetRef:item.targetRef,duty:item.duty,assigneeRef:item.assigneeRef,dueAt:item.dueAt})
 })
 if(destinations.size)throw Error('BID_RESPONSE_ASSIGNMENT_INCOMPLETE')
 source.assertCurrent()
 return Object.freeze({projectId,baselineId,lineageId,version,assignmentRef,
  assignments:Object.freeze(rows),assertCurrent:source.assertCurrent})
}
