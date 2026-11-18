/** @module app:views/features/application/smart-bid/followup/tender-change-call-reader
 * 职责：动作23按原试次回查明确登记的条款读取记录。
 */
import {snapshotReferenceFields,snapshotReferenceIdentity as identity,visitSnapshotReferences}
 from '@/services/smart-bid/content/references/snapshot-reference-values'
import {originalRegistrationView,readOriginalRegistrationView} from '../authority/original-registration-view'

const keys=['projectId','runId','attemptRef','requestKey']
const fields=['actualRequirementReads']
const dispositionField='changeDispositions'
export const tenderChangeCallFields=[...fields,dispositionField]
const viewName='originalRequirementReads'
const error='TENDER_CHANGE_CALL_EVIDENCE'
type Scope=Readonly<{projectId:string;runId:string;attemptRef:string;requestKey:string}>

/** 原调用视图按试次完整身份精确取证。 */
export function tenderChangeCallScenarioView(primaryKey:string){
 return originalRegistrationView(primaryKey,keys,tenderChangeCallFields)
}

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
 const dispositions:Array<ReturnType<typeof captureDisposition>>=[]
 const hasDispositions=rawDispositions!==null&&rawDispositions!==undefined
 const assertDispositions=hasDispositions?captureFields([dispositionField]):assertCurrent
 assertDispositions()
 if(hasDispositions)visitSnapshotReferences(rawDispositions,value=>{dispositions.push(captureDisposition(value))},error)
 return Object.freeze({state:'REGISTERED' as const,items:Object.freeze(items),dispositions:Object.freeze(dispositions),
  assertCurrent:()=>{assertCurrent();assertDispositions()}})
}

/** 缺失清单表示待取得原引用，空清单只描述本次已核试次。 */
export async function readTenderChangeCallReferences(host:Parameters<typeof readOriginalRegistrationView>[0],scope:Scope){
 const read=await readOriginalRegistrationView(host,{model:'GenerationRun',viewName},scope)
 if(!read.row)return Object.freeze({state:'UNKNOWN' as const,assertCurrent:read.assertCurrent})
 return captureTenderChangeCallEvidence(read.row,read.captureFields)
}
