/**
 * @module app:services/smart-bid/content/references/response/response-task
 * 职责：从同目标的原任务现行版确认拟答资格。
 */
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'

type Scope=Readonly<{projectId:string;baselineId:string;assignmentId:string;targetRef:string;version:string}>
type Execution=Scope&Readonly<{authorRef:string;at:number}>
type Task=Scope&Readonly<{
 taskRef:string;assignmentVersion:string;assigneeRef:string;dueAt:number
 state:'ASSIGNED'|'ACCEPTED'|'RETURNED'|'SUSPENDED'
 acceptance?:Readonly<{receiptRef:string;assignmentVersion:string;assigneeRef:string;acceptedAt:number}>
 assertCurrent:()=>void
}>
const fields=['projectId','baselineId','assignmentId','targetRef','version'] as const

/** 新承办人须签收当前改派版；旧承办或旧签收不可继续拟答。 */
export function checkResponseTaskAuthor(execution:Execution,task:Task){
 task.assertCurrent()
 const {authorRef,at}=execution
 const {acceptance}=task
 if(fields.some(key=>!identity(execution[key])||execution[key]!==task[key])||
  ![authorRef,task.taskRef,task.assignmentVersion,task.assigneeRef].every(identity)||
  !Number.isSafeInteger(at)||!Number.isSafeInteger(task.dueAt))throw Error('BID_RESPONSE_TASK_SCOPE')
 const current=task.state==='ACCEPTED'&&task.assigneeRef===authorRef&&at<=task.dueAt&&
  acceptance?.assigneeRef===authorRef&&acceptance.assignmentVersion===task.assignmentVersion&&
  identity(acceptance.receiptRef)&&Number.isSafeInteger(acceptance.acceptedAt)&&acceptance.acceptedAt<=at
 if(!current)throw Error('BID_RESPONSE_TASK_NOT_ACCEPTED')
 return Object.freeze({taskRef:task.taskRef,assignmentVersion:task.assignmentVersion,acceptanceRef:acceptance.receiptRef,
  assertCurrent:task.assertCurrent})
}
