/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-produced-file-review
 * 职责：为动作45重新打开动作41登记的电子实件并复算文件摘要。
 * 边界：文件和登记读取方核原授权；不登记、签署、保存或代纸件验收。
 */
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hashContentBytes} from '@/services/smart-bid/content/revision-snapshot-hash'
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionReadHost} from '../content-revision-reader'
import type {recoverProductionRequest} from '@/services/smart-bid/content/review/production/production-recovery'

type FileSelection=Readonly<{projectId:string;producedFileId:string;productionRequestRef:string}>
type RegisteredFile=FileSelection&Readonly<{
 revisionId:string;documentId:string;fileHash:string
 assertCurrent:()=>void;reopen:()=>Promise<ArrayBuffer>
}>
type FileTarget=Omit<FileSelection,'projectId'>
type OpenAuthorized=(input:FileSelection&Readonly<{resourceVersionId:string}>)=>Promise<Readonly<{
 projectId:string;resourceVersionId:string;bytes:ArrayBuffer;assertCurrent:()=>void
}>>

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
 const versionHash=await hashContentBytes(bytes)
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
 openAuthorized:OpenAuthorized){
 const {runtime,scenarioId,projectId}=host
 if(!identity(scenarioId))throw Error('CONTENT_PRODUCED_FILE_SCOPE')
 return readProducedFileReviewVersion({projectId,producedFileId:input.producedFileId,productionRequestRef:input.productionRequestRef},async selection=>{
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
  if(!row)throw Error('CONTENT_PRODUCED_FILE_NOT_UNIQUE')
  return bindRegisteredFile({view,row,selection,assertScope,assertResult:view.captureReadResult(),openAuthorized})
 })
}

/** 核回执与实际登记实件是否同一制作、同册和同一文件字节。 */
export async function readCompletedProductionFile(
 host:ContentRevisionReadHost,
 completed:Extract<Awaited<ReturnType<typeof recoverProductionRequest>>,{state:'COMPLETED'}>,
 openAuthorized:OpenAuthorized,
){
 const {request,producedFileId,productionRequestRef}=completed
 const assertScope=()=>{host.assertCurrent();completed.assertCurrent()}
 assertScope()
 if(request.projectId!==host.projectId)throw Error('CONTENT_PRODUCED_FILE_RECEIPT_SCOPE')
 const file=await readRegisteredProducedFileReviewVersion({...host,assertCurrent:assertScope},{producedFileId,productionRequestRef},
  openAuthorized)
 if(file.revisionId!==request.revisionId||file.documentId!==request.documentId||file.versionHash!==completed.fileHash)
  throw Error('CONTENT_PRODUCED_FILE_RECEIPT_SCOPE')
 file.assertCurrent()
 return Object.freeze({...file,completedScopeRefs:completed.completedScopeRefs})
}

function bindRegisteredFile(input:Readonly<{view:DataView;row:DataView['rows'][number];selection:FileSelection;
 assertScope:()=>void;assertResult:()=>void;openAuthorized:OpenAuthorized}>):RegisteredFile{
  const {view,row,selection,assertScope,assertResult,openAuthorized}=input
  const {projectId,producedFileId,productionRequestRef}=selection
  if(row['id']!==producedFileId||row['projectId']!==projectId||row['productionRequestRef']!==productionRequestRef)
   throw Error('CONTENT_PRODUCED_FILE_SCOPE')
  const {revisionId,documentId,fileHash,resourceVersionId}=row
  if(!identity(revisionId)||!identity(documentId)||!identity(fileHash)||!identity(resourceVersionId))throw Error('CONTENT_PRODUCED_FILE_SCOPE')
  const assertRow=view.captureReadRow(row,fields)
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
}

/** 同一正式查询代次读取多份实件，供一次审核组合。 */
export async function readRegisteredProducedFileReviewVersions(host:ContentRevisionReadHost,inputs:readonly FileTarget[],
 openAuthorized:OpenAuthorized){
 const {runtime,scenarioId,projectId}=host
 host.assertCurrent()
 const targets=inputs.map(({producedFileId,productionRequestRef})=>Object.freeze({projectId,producedFileId,productionRequestRef}))
 const byId=new Map(targets.map(target=>[target.producedFileId,target]))
 if(![scenarioId,projectId].every(identity)||byId.size!==targets.length||
  targets.some(target=>![target.producedFileId,target.productionRequestRef].every(identity)))
  throw Error('CONTENT_PRODUCED_FILE_SCOPE')
 if(!targets.length)return Object.freeze([])
 const key=buildDataViewKey('ProducedFile','selectedReviewFiles',scenarioId),view=runtime.resolveView(key)
 const validBatch=()=>view?.dataTable?.modelBinding?.modelName==='ProducedFile'&&view.commitMode==='staged'&&
  view.queryConfig.autoQuery===false&&view.queryConfig.allPages===true&&view.queryConfig.pagination==='paged'&&
  hasContentScopeCondition(view,'projectId',{Type:'GetInputParam',ParamName:'projectId'})
 if(!view||!validBatch()||view.hasEditingChanges())throw Error('CONTENT_PRODUCED_FILE_VIEW_REQUIRED')
 view.queryContext={...view.queryContext,projectId}
 view.filterExpression={logic:'or',filters:targets.map(({producedFileId,productionRequestRef})=>({logic:'and',filters:[
  {field:'id',operator:'eq',value:producedFileId},{field:'productionRequestRef',operator:'eq',value:productionRequestRef},
 ]}))}
 const signature=JSON.stringify(view.filterExpression)
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!validBatch()||view.hasEditingChanges()||view.queryContext['projectId']!==projectId||
   JSON.stringify(view.filterExpression)!==signature)throw Error('CONTENT_PRODUCED_FILE_STALE')
 }
 await view.refresh();assertScope()
 if(view.countReported!==true||view.total!==targets.length||view.rows.length!==targets.length||view.nextPageAvailable===true)
  throw Error('CONTENT_PRODUCED_FILE_NOT_UNIQUE')
 const assertResult=view.captureReadResult()
 const records=new Map<string,RegisteredFile>()
 for(const row of view.rows){
  const id=row['id'],target=identity(id)?byId.get(id):undefined
  if(!target||records.has(target.producedFileId))throw Error('CONTENT_PRODUCED_FILE_SCOPE')
  records.set(target.producedFileId,bindRegisteredFile({view,row,selection:target,assertScope,assertResult,openAuthorized}))
 }
 const versions=[]
 for(const target of targets){
  const record=records.get(target.producedFileId)
  if(!record)throw Error('CONTENT_PRODUCED_FILE_SCOPE')
  versions.push(await readProducedFileReviewVersion(target,()=>Promise.resolve(record)))
 }
 for(const version of versions)version.assertCurrent()
 return Object.freeze(versions)
}
