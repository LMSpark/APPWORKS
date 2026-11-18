/** @module app:views/features/application/smart-bid/followup/tender-change-call-reader
 * 职责：动作23按原试次回查明确登记的条款读取记录。
 */
import {snapshotReferenceFields,snapshotReferenceIdentity as identity,visitSnapshotReferences}
 from '@/services/smart-bid/content/references/snapshot-reference-values'
import {originalRegistrationView,readOriginalRegistrationView} from '../authority/original-registration-view'

const keys=['projectId','runId','attemptRef','requestKey']
const fields=['actualRequirementReads']
const viewName='originalRequirementReads'
const error='TENDER_CHANGE_CALL_EVIDENCE'
type Scope=Readonly<{projectId:string;runId:string;attemptRef:string;requestKey:string}>

/** 原调用视图按试次完整身份精确取证。 */
export function tenderChangeCallScenarioView(primaryKey:string){
 return originalRegistrationView(primaryKey,keys,fields)
}

function captureReference(value:unknown){
 const {callRef,resultRef,fieldPath,lineageId,version}=snapshotReferenceFields(value,
  ['callRef','resultRef','fieldPath','lineageId','version'],error)
 if(!identity(callRef)||!identity(resultRef)||!identity(fieldPath)||!identity(lineageId)||!identity(version))throw Error(error)
 return Object.freeze({callRef,resultRef,fieldPath,lineageId,version})
}

/** 缺失清单表示待取得原引用，空清单只描述本次已核试次。 */
export async function readTenderChangeCallReferences(host:Parameters<typeof readOriginalRegistrationView>[0],scope:Scope){
 const read=await readOriginalRegistrationView(host,{model:'GenerationRun',viewName},scope)
 if(!read.row)return Object.freeze({state:'UNKNOWN' as const,assertCurrent:read.assertCurrent})
 const assertCurrent=read.captureFields(fields)
 assertCurrent()
 const raw=read.row['actualRequirementReads']
 if(raw===null)return Object.freeze({state:'UNKNOWN' as const,assertCurrent})
 const items:Array<ReturnType<typeof captureReference>>=[],seen=new Set<string>()
 visitSnapshotReferences(raw,value=>{
  const item=captureReference(value)
  const key=JSON.stringify([item.callRef,item.resultRef,item.fieldPath,item.lineageId,item.version])
  if(seen.has(key))throw Error(error)
  seen.add(key)
  items.push(item)
 },error)
 return Object.freeze({state:'REGISTERED' as const,items:Object.freeze(items),assertCurrent})
}
