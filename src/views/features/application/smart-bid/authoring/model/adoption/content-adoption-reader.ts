/**
 * @module app:views/features/application/smart-bid/authoring/model/adoption/content-adoption-reader
 * 职责：读取原采用记录并对照固定请求。
 * 边界：只提供原记录读取证明，原子结果凭据及执行终结仍须原责任域核实。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasCompleteSingleContentResult,hasContentScopeCondition,readAdoptedContentRevision,type ContentRevisionReadHost} from '../content-revision-reader'
import {readAdoptionSnapshot} from './content-adoption-snapshot-reader'

export type ContentAdoptionSelection=Readonly<{candidateRevisionId:string;requestKey:string;requestDigest:string;previewRef:string}>
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
 const mergeRevisionId=row['mergeRevisionId']
 if(parameters.some(field=>row[field]!==expected[field])||row['requestDigest']!==requestDigest||row['previewRef']!==previewRef||
  !identity(row['id'])||!identity(mergeRevisionId))throw Error('CONTENT_ADOPTION_REQUEST_MISMATCH')
 const assertCurrent=()=>{assertScope();assertResult();assertRow()}
 const boundHost={...host,assertCurrent}
 const {id:adoptionRef,commitCheckRef}=row
 return Object.freeze({dataViewKey,recordFound:true,adoptionRef,mergeRevisionId,
  commitCheckRef:identity(commitCheckRef)?commitCheckRef:null,requiresOriginalResultEvidence:true,assertCurrent,
  async readMergeRevision(){
   const merge=await readAdoptedContentRevision(boundHost,{kind:'merge',revisionId:mergeRevisionId})
   return Object.freeze({...merge,readSnapshot:()=>readAdoptionSnapshot(boundHost,merge)})
  }})
}

/** 分别核原登记、合并修订和快照；下游缺证时仍交可用的原登记。 */
export async function inspectRegisteredAdoption(host:ContentRevisionReadHost,input:ContentAdoptionSelection){
 const original=await readContentAdoption(host,input)
 if(!original.recordFound)return original
 let merge:Awaited<ReturnType<typeof original.readMergeRevision>>
 try{
  merge=await original.readMergeRevision()
  merge.assertCurrent()
 }catch{
  original.assertCurrent()
  return Object.freeze({...original,revisionEvidence:'UNVERIFIED' as const})
 }
 try{
  const snapshot=await merge.readSnapshot()
  snapshot.assertCurrent()
  return Object.freeze({...original,revisionEvidence:'SNAPSHOT_VERIFIED' as const,baselineId:snapshot.snapshot.index.baselineId,
   nodeCount:snapshot.snapshot.index.nodes.length,assertCurrent:snapshot.assertCurrent})
 }catch{
  merge.assertCurrent()
  return Object.freeze({...original,revisionEvidence:'REVISION_READ' as const,assertCurrent:merge.assertCurrent})
 }
}
