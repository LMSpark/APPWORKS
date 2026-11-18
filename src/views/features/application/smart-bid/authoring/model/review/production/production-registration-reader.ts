/**
 * @module app:views/features/application/smart-bid/authoring/model/review/production/production-registration-reader
 * 职责：动作41从制作文件视图核对原登记，同输出异摘要交制作人核查。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import type {prepareExportRegistration} from '@/services/smart-bid/content/review/production/production-output-registration'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../../content-revision-reader'

const keys=['projectId','requestKey','outputRef'] as const
const fields=[...keys,'id','documentId','revisionId','inputDigest','productionRequestRef','fileHash','resourceVersionId']
const valid=(view:DataView)=>view.dataTable?.modelBinding?.modelName==='ProducedFile'&&
 view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&
 keys.every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))

/** 空查只表示未读到原登记，写入仍需独立的正式办理命令处理并发。 */
export async function readOriginalExportRegistration(host:ContentRevisionReadHost,
 prepared:Awaited<ReturnType<typeof prepareExportRegistration>>){
 const {runtime,scenarioId,projectId}=host
 const {record}=prepared
 const {requestKey,outputRef}=record
 host.assertCurrent();prepared.assertCurrent()
 if(!identity(scenarioId)||record.projectId!==projectId)throw Error('BID_EXPORT_REGISTRATION_SCOPE')
 const key=buildDataViewKey('ProducedFile','originalExportRegistration',scenarioId),view=runtime.resolveView(key)
 if(!view||!valid(view)||view.hasEditingChanges())throw Error('BID_EXPORT_REGISTRATION_VIEW_REQUIRED')
 const context={projectId,requestKey,outputRef}
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
 const {id,resourceVersionId}=row
 if(keys.some(field=>row[field]!==record[field])||!identity(id)||!identity(resourceVersionId)||
  row['documentId']!==record.documentId||row['revisionId']!==record.revisionId||
  row['inputDigest']!==record.inputDigest||row['productionRequestRef']!==record.productionRequestRef)
  throw Error('BID_EXPORT_REGISTRATION_SCOPE')
 if(row['fileHash']!==record.fileHash)throw Error('BID_EXPORT_REGISTRATION_HASH_CONFLICT')
 return Object.freeze({state:'REGISTERED' as const,producedFileId:id,resourceVersionId,
  assertCurrent:()=>{assertScope();assertResult();assertRow()}})
}
