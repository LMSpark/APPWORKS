/**
 * @module app:views/features/application/smart-bid/authoring/model/content-adoption-reader
 * 职责：读取原采用记录并对照固定请求。
 * 边界：只提供原记录读取证明，原子结果凭据及执行终结仍须原责任域核实。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionReadHost} from './content-revision-reader'

type ContentAdoptionSelection=Readonly<{candidateRevisionId:string;requestKey:string;requestDigest:string;previewRef:string}>
const parameters=['projectId','candidateRevisionId','requestKey'] as const
const fields=['id',...parameters,'requestDigest','previewRef','mergeRevisionId','commitCheckRef']
function validScope(view:DataView):boolean{
 return view.dataTable?.modelBinding?.modelName==='ContentAdoption'&&view.commitMode==='staged'&&
  parameters.every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))
}

/** 读取精确原请求；空结果只证明当前查询未返回该记录。 */
export async function readContentAdoption(host:ContentRevisionReadHost,input:ContentAdoptionSelection){
 const {runtime,scenarioId,projectId}=host,{candidateRevisionId,requestKey,requestDigest,previewRef}=input
 host.assertCurrent()
 if(![scenarioId,projectId,candidateRevisionId,requestKey,requestDigest,previewRef].every(identity))
  throw Error('CONTENT_ADOPTION_IDENTITY_REQUIRED')
 const dataViewKey=buildDataViewKey('ContentAdoption','selectedAdoption',scenarioId),view=runtime.resolveView(dataViewKey)
 if(!view||!validScope(view))throw Error('CONTENT_ADOPTION_SCOPE_REQUIRED')
 if(view.hasEditingChanges())throw Error('CONTENT_ADOPTION_EDITING')
 const expected={projectId,candidateRevisionId,requestKey}
 view.queryContext={...view.queryContext,...expected}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(dataViewKey)!==view||!validScope(view)||view.hasEditingChanges()||
   parameters.some(field=>view.queryContext[field]!==expected[field]))throw Error('CONTENT_ADOPTION_STALE')
 }
 await view.refresh();assertScope()
 const assertResult=view.captureReadResult()
 const completeEmpty=view.countReported===true&&view.total===0&&view.rows.length===0&&view.nextPageAvailable!==true
 if(completeEmpty)return Object.freeze({dataViewKey,recordFound:false,requiresOriginalResultEvidence:true,assertCurrent:()=>{assertScope();assertResult()}})
 if(!hasCompleteSingleContentResult(view))throw Error('CONTENT_ADOPTION_NOT_UNIQUE')
 const row=view.rows[0]
 if(!row)throw Error('CONTENT_ADOPTION_NOT_UNIQUE')
 const assertRow=view.captureReadRow(row,fields)
 if(parameters.some(field=>row[field]!==expected[field])||row['requestDigest']!==requestDigest||row['previewRef']!==previewRef||
  !identity(row['id'])||!identity(row['mergeRevisionId']))throw Error('CONTENT_ADOPTION_REQUEST_MISMATCH')
 return Object.freeze({dataViewKey,recordFound:true,requiresOriginalResultEvidence:true,assertCurrent:()=>{assertScope();assertResult();assertRow()}})
}
