/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-produced-file-review
 * 职责：为动作45重新打开动作41登记的电子实件并复算文件摘要。
 * 边界：文件和登记读取方核原授权；不登记、签署、保存或代纸件验收。
 */
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionReadHost} from '../content-revision-reader'

type FileSelection=Readonly<{projectId:string;producedFileId:string;productionRequestRef:string}>
type RegisteredFile=FileSelection&Readonly<{
 revisionId:string;documentId:string;fileHash:string
 assertCurrent:()=>void;reopen:()=>Promise<ArrayBuffer>
}>

/** 沿原制作请求及文件身份重开，读实件字节产生可交审核的版本摘要。 */
export async function readProducedFileReviewVersion(selection:FileSelection,readOriginal:(input:FileSelection)=>Promise<RegisteredFile>){
 const {projectId,producedFileId,productionRequestRef}=selection
 if(![projectId,producedFileId,productionRequestRef].every(identity))throw Error('CONTENT_PRODUCED_FILE_SCOPE')
 const record=await readOriginal(Object.freeze({projectId,producedFileId,productionRequestRef}))
 record.assertCurrent()
 const {revisionId,documentId,fileHash}=record
 if(record.projectId!==projectId||record.producedFileId!==producedFileId||record.productionRequestRef!==productionRequestRef||
  !identity(revisionId)||!identity(documentId)||!/^[a-f0-9]{64}$/u.test(fileHash))throw Error('CONTENT_PRODUCED_FILE_SCOPE')
 const bytes=await record.reopen()
 record.assertCurrent()
 if(bytes.byteLength===0)throw Error('CONTENT_PRODUCED_FILE_EMPTY')
 const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes)
 const versionHash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')
 record.assertCurrent()
 if(versionHash!==fileHash)throw Error('CONTENT_PRODUCED_FILE_HASH_MISMATCH')
 return Object.freeze({projectId,producedFileId,productionRequestRef,revisionId,documentId,versionHash,
  assertCurrent:()=>record.assertCurrent()})
}

const fields=['id','projectId','productionRequestRef','revisionId','documentId','fileHash','resourceVersionId']
const scopeFields=[['projectId','projectId'],['id','producedFileId'],['productionRequestRef','productionRequestRef']] as const
function valid(view:DataView):boolean{
 return view.dataTable?.modelBinding?.modelName==='ProducedFile'&&view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&
  scopeFields.every(([field,param])=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:param}))
}

/** 读取原 ProducedFile 记录及资源版本后，由原附件读取能力重开电子实件。 */
export async function readRegisteredProducedFileReviewVersion(host:ContentRevisionReadHost,input:Omit<FileSelection,'projectId'>,
 openAuthorized:(input:FileSelection&Readonly<{resourceVersionId:string}>)=>Promise<Readonly<{
  projectId:string;resourceVersionId:string;bytes:ArrayBuffer;assertCurrent:()=>void
 }>>){
 const {runtime,scenarioId,projectId}=host
 if(!identity(scenarioId))throw Error('CONTENT_PRODUCED_FILE_SCOPE')
 return readProducedFileReviewVersion({projectId,producedFileId:input.producedFileId,productionRequestRef:input.productionRequestRef},async selection=>{
  const {producedFileId,productionRequestRef}=selection
  host.assertCurrent()
  const dataViewKey=buildDataViewKey('ProducedFile','selectedReviewFile',scenarioId),view=runtime.resolveView(dataViewKey)
  if(!view||!valid(view)||view.hasEditingChanges())throw Error('CONTENT_PRODUCED_FILE_VIEW_REQUIRED')
  view.queryContext={...view.queryContext,...selection}
  const assertScope=()=>{
   host.assertCurrent()
   if(runtime.resolveView(dataViewKey)!==view||!valid(view)||view.hasEditingChanges()||
    Object.entries(selection).some(([field,value])=>view.queryContext[field]!==value))throw Error('CONTENT_PRODUCED_FILE_STALE')
  }
  await view.refresh();assertScope()
  if(!hasCompleteSingleContentResult(view))throw Error('CONTENT_PRODUCED_FILE_NOT_UNIQUE')
  const row=view.rows[0]
  if(row?.['id']!==producedFileId||row['projectId']!==projectId||row['productionRequestRef']!==productionRequestRef)
   throw Error('CONTENT_PRODUCED_FILE_SCOPE')
  const {revisionId,documentId,fileHash,resourceVersionId}=row
  if(!identity(revisionId)||!identity(documentId)||!identity(fileHash)||!identity(resourceVersionId))throw Error('CONTENT_PRODUCED_FILE_SCOPE')
  const assertResult=view.captureReadResult(),assertRow=view.captureReadRow(row,fields)
  let assertResource:(()=>void)|undefined
  const assertCurrent=()=>{assertScope();assertResult();assertRow();assertResource?.()}
  return Object.freeze({...selection,revisionId,documentId,fileHash,assertCurrent,reopen:async()=>{
   assertCurrent()
   const resource=await openAuthorized(Object.freeze({...selection,resourceVersionId}))
   assertCurrent()
   if(resource.projectId!==projectId||resource.resourceVersionId!==resourceVersionId)throw Error('CONTENT_PRODUCED_FILE_RESOURCE_MISMATCH')
   resource.assertCurrent()
   assertResource=()=>resource.assertCurrent()
   return resource.bytes
  }})
 })
}
