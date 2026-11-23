/** @module app:views/features/application/smart-bid/followup/tender-change-call-reader
 * 职责：动作23按原试次回查明确登记的条款读取记录。
 */
import {snapshotReferenceFields,snapshotReferenceIdentity as identity,visitSnapshotReferences}
 from '@/services/smart-bid/content/references/snapshot-reference-values'
import {isRecord} from '@spark-appworks/spark-utils'
import type {ContentRevisionReadHost} from '../authoring/model/content-revision-reader'

const keys=['projectId','runId','attemptRef','requestKey'] as const
const fields=['actualRequirementReads']
const dispositionField='changeDispositions'
const error='TENDER_CHANGE_CALL_EVIDENCE'
type Scope=Readonly<{projectId:string;runId:string;attemptRef:string;requestKey:string}>

function captureReference(value:unknown){
 const {callRef,resultRef,fieldPath,lineageId,version}=snapshotReferenceFields(value,
  ['callRef','resultRef','fieldPath','lineageId','version'],error)
 if(!identity(callRef)||!identity(resultRef)||!identity(fieldPath)||!identity(lineageId)||!identity(version))throw Error(error)
 return Object.freeze({callRef,resultRef,fieldPath,lineageId,version})
}

function captureDisposition(value:unknown){
 const {addendumId,changeId,resultRef,decisionRef,ownerRef,reason,decision}=snapshotReferenceFields(value,
  ['addendumId','changeId','resultRef','decisionRef','ownerRef','reason','decision'],error)
 if(!identity(addendumId)||!identity(changeId)||!identity(resultRef)||!identity(decisionRef)||!identity(ownerRef)||
  typeof reason!=='string'||!reason.trim()||(decision!=='REDO'&&decision!=='RECHECK'&&decision!=='REUSE'))throw Error(error)
 return Object.freeze({addendumId,changeId,resultRef,decisionRef,ownerRef,reason,decision})
}

/** 从本次查询中核验可读的原引用及处置字段。 */
export function captureTenderChangeCallEvidence(row:Readonly<Record<string,unknown>>,captureFields:(fields:readonly string[])=>()=>void){
 const assertCurrent=captureFields(fields)
 assertCurrent()
 const raw=row['actualRequirementReads']
 if(raw===null||raw===undefined)return Object.freeze({state:'UNKNOWN' as const,assertCurrent})
 const items:Array<ReturnType<typeof captureReference>>=[],seen=new Set<string>()
 visitSnapshotReferences(raw,value=>{
  const item=captureReference(value)
  const key=JSON.stringify([item.callRef,item.resultRef,item.fieldPath,item.lineageId,item.version])
  if(seen.has(key))throw Error(error)
  seen.add(key)
  items.push(item)
 },error)
 const rawDispositions=row[dispositionField]
 let dispositions:ReadonlyArray<ReturnType<typeof captureDisposition>>=[]
 let assertDispositions=assertCurrent
 if(rawDispositions!==null&&rawDispositions!==undefined){
  try{
   const proof=captureFields([dispositionField])
   proof()
   const entries:Array<ReturnType<typeof captureDisposition>>=[]
   visitSnapshotReferences(rawDispositions,value=>{entries.push(captureDisposition(value))},error)
   dispositions=entries
   assertDispositions=proof
  }catch{
   // Missing disposition evidence must not invalidate independently authorized call references.
   assertCurrent()
  }
 }
 return Object.freeze({state:'REGISTERED' as const,items:Object.freeze(items),dispositions:Object.freeze(dispositions),
  assertCurrent:()=>{assertCurrent();assertDispositions()}})
}

/** 缺失清单表示待取得原引用，运行参数只来自调用方显式上下文。 */
export function readTenderChangeCallReferences(host:ContentRevisionReadHost,scope:Scope,input:unknown){
 host.assertCurrent()
 if(![scope.projectId,scope.runId,scope.attemptRef,scope.requestKey].every(identity)||
  scope.projectId!==host.projectId||!isRecord(input)||
  keys.some(key=>input[key]!==scope[key]))throw Error(error)
 if(input['actualRequirementReads']===undefined)return Object.freeze({state:'UNKNOWN' as const,assertCurrent:host.assertCurrent})
 return captureTenderChangeCallEvidence(input,required=>{
  void required
  return host.assertCurrent
 })
}
