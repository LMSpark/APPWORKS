/**
 * @module app:views/features/application/smart-bid/authoring/model/review/production/production-registration-reader
 * 职责：动作41从制作文件视图核对原登记，同输出异摘要交制作人核查。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import type {prepareExportRegistration} from '@/services/smart-bid/content/review/production/production-output-registration'
import type {prepareSignedOutputRegistration} from '@/services/smart-bid/content/review/production/signed-output-registration'
import {isRecord} from '@spark-appworks/spark-utils'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../../content-revision-reader'

/** 空查只表示未读到原登记，写入仍需独立的正式办理命令处理并发。 */
export function readOriginalExportRegistration(host:ContentRevisionReadHost,
 prepared:Awaited<ReturnType<typeof prepareExportRegistration>>){
 const {record}=prepared
 return readRegistration(host,prepared,{viewName:'originalExportRegistration',context:{projectId:record.projectId,
  requestKey:record.requestKey,outputRef:record.outputRef},match:{documentId:record.documentId,revisionId:record.revisionId,
  inputDigest:record.inputDigest,productionRequestRef:record.productionRequestRef,templateVersionRef:record.templateVersionRef,
  ruleVersionRef:record.ruleVersionRef,formVersionRef:record.formVersionRef}})
}

/** 签后件按原签署操作及输出定位既有登记。 */
export function readOriginalSignedRegistration(host:ContentRevisionReadHost,
 prepared:Awaited<ReturnType<typeof prepareSignedOutputRegistration>>){
 const {record}=prepared
 return readRegistration(host,prepared,{viewName:'originalSignedRegistration',context:{projectId:record.projectId,
  signatureOperationRef:record.signatureOperationRef,signedObjectRef:record.signedObjectRef},
 match:{documentId:record.documentId,revisionId:record.revisionId,signatureRecordId:record.signatureRecordId,
  originalFileId:record.originalFileId,originalHash:record.originalHash},signing:record.signing})
}

async function readRegistration(host:ContentRevisionReadHost,
 prepared:Readonly<{record:Readonly<{fileHash:string}>;assertCurrent:()=>void}>,
 {viewName,context,match,signing}:Readonly<{viewName:string;context:Readonly<Record<string,string>>;
  match:Readonly<Record<string,string|null>>;signing?:Readonly<Record<string,string>>}>){
 const {runtime,scenarioId,projectId}=host
 host.assertCurrent();prepared.assertCurrent()
 if(!identity(scenarioId)||context['projectId']!==projectId)throw Error('BID_EXPORT_REGISTRATION_SCOPE')
 const keys=Object.keys(context),fields=[...keys,...Object.keys(match),'id','fileHash','resourceVersionId',...(signing?['signing']:[])]
 const valid=(view:DataView)=>view.dataTable?.modelBinding?.modelName==='ProducedFile'&&
  view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&
  (view.queryConfig.cacheType===undefined||view.queryConfig.cacheType==='none')&&
  keys.every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))
 const key=buildDataViewKey('ProducedFile',viewName,scenarioId),view=runtime.resolveView(key)
 if(!view||!valid(view)||view.hasEditingChanges())throw Error('BID_EXPORT_REGISTRATION_VIEW_REQUIRED')
 view.queryContext={...view.queryContext,...context}
 const assertScope=()=>{
  host.assertCurrent();prepared.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid(view)||view.loadingError||view.hasEditingChanges()||
   keys.some(field=>view.queryContext[field]!==context[field]))throw Error('BID_EXPORT_REGISTRATION_STALE')
 }
 await view.refresh()
 assertScope()
 if(view.countReported!==true||view.total!==view.rows.length||view.nextPageAvailable===true||view.rows.length>1)
  throw Error('BID_EXPORT_REGISTRATION_INCOMPLETE')
 const assertResult=view.captureReadResult(),row=view.rows[0]
 if(!row)return Object.freeze({state:'UNKNOWN' as const,assertCurrent:()=>{assertScope();assertResult()}})
 const assertRow=view.captureReadRow(row,fields)
 assertRow()
 const {id,resourceVersionId}=row
 if(Object.entries({...context,...match}).some(([field,value])=>row[field]!==value)||!identity(id)||!identity(resourceVersionId))
  throw Error('BID_EXPORT_REGISTRATION_SCOPE')
 const persistedSigning=row['signing']
 if(signing&&(!isRecord(persistedSigning)||Object.entries(signing).some(([field,value])=>persistedSigning[field]!==value)))
  throw Error('BID_SIGNED_REGISTRATION_REQUEST_MISMATCH')
 if(row['fileHash']!==prepared.record.fileHash)throw Error('BID_EXPORT_REGISTRATION_HASH_CONFLICT')
 return Object.freeze({state:'REGISTERED' as const,producedFileId:id,resourceVersionId,
  assertCurrent:()=>{assertScope();assertResult();assertRow()}})
}
