/** @module app:views/features/application/smart-bid/authoring/model/content-tender-record-reader
 * 职责：按固定引用读取同项目已核定的原文解析记录。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {readTenderRecordReference} from '@/services/smart-bid/content/references/baseline-tender-records'
import {snapshotReferenceIdentity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionReadHost} from './content-revision-reader'

const keys=['projectId','runId','type','ordinal','recordVersion','recordHash']
function scoped(view:DataView):boolean {
 return view.dataTable?.modelBinding?.modelName==='TenderRecord'&&view.commitMode==='staged'
  &&keys.every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))
}

/** 返回原视图和失效证明，当前用途由业务调用链另核。 */
export async function readContentTenderRecord(host:ContentRevisionReadHost,reference:unknown):Promise<Readonly<{
 dataViewKey:string;assertCurrent:()=>void
}>>{
 const {runtime,scenarioId,projectId}=host
 host.assertCurrent()
 if(!snapshotReferenceIdentity(scenarioId)||!snapshotReferenceIdentity(projectId))throw Error('CONTENT_TENDER_RECORD_IDENTITY_REQUIRED')
 const parameters={projectId,...readTenderRecordReference(reference)}
 const dataViewKey=buildDataViewKey('TenderRecord','selectedTenderRecord',scenarioId)
 const view=runtime.resolveView(dataViewKey)
 if(!view||!scoped(view))throw Error('CONTENT_TENDER_RECORD_SCOPE_REQUIRED')
 if(view.hasEditingChanges())throw Error('CONTENT_TENDER_RECORD_EDITING')
 view.queryContext={...view.queryContext,...parameters}
 const entries=Object.entries(parameters)
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(dataViewKey)!==view||!scoped(view)||view.hasEditingChanges()
   ||!entries.every(([key,value])=>view.queryContext[key]===value))throw Error('CONTENT_TENDER_RECORD_STALE')
 }
 await view.refresh()
 assertScope()
 const assertResult=view.captureReadResult()
 if(!hasCompleteSingleContentResult(view))throw Error('CONTENT_TENDER_RECORD_NOT_UNIQUE')
 const row=view.rows[0]
 if(!row||!snapshotReferenceIdentity(row['id'])||!entries.every(([key,value])=>row[key]===value)
  ||row['sourceSpan']===null||row['sourceSpan']===undefined
  ||row['confirmStatus']!=='CONFIRMED'||!['LOCATED','TEXT_ONLY'].some(quality=>quality===row['parseQuality']))
  throw Error('CONTENT_TENDER_RECORD_UNAVAILABLE')
 const assertRow=view.captureReadRow(row,['id',...keys,'payload','sourceSpan','parseQuality','confirmStatus'])
 const assertCurrent=()=>{assertScope();assertResult();assertRow()}
 assertCurrent()
 return Object.freeze({dataViewKey,assertCurrent})
}
