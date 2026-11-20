/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-approval-reader
 * 职责：按项目和原批准 ID 读取动作45的固定 Approval 记录。
 * 边界：不选最近批准、不判断当前用途、不推断项目批准所覆盖的平台栏。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionReadHost} from '../content-revision-reader'

const fields=['id','projectId','nodeId','scope','effectiveHash','revisionId','approverId','note','createdAt','actorKind','authorityRef','decisionTraceRef']
const scopes=new Set(['SECTION','DOCUMENT','PROJECT'])
function validScope(view:DataView):boolean{
 return view.dataTable?.modelBinding?.modelName==='Approval'&&view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&
  hasContentScopeCondition(view,'projectId',{Type:'GetInputParam',ParamName:'projectId'})&&
  hasContentScopeCondition(view,'id',{Type:'GetInputParam',ParamName:'approvalId'})
}

/** 按原读权限捕获完整批准记录；允许保留异版批准供审核覆盖比较。 */
export async function readContentApproval(host:ContentRevisionReadHost,approvalId:string){
 const {runtime,scenarioId,projectId,assertCurrent:assertHost}=host
 assertHost()
 if(!identity(scenarioId)||!identity(projectId)||!identity(approvalId))throw Error('CONTENT_APPROVAL_IDENTITY_REQUIRED')
 const dataViewKey=buildDataViewKey('Approval','selectedContentApproval',scenarioId),view=runtime.resolveView(dataViewKey)
 if(!view||!validScope(view)||view.hasEditingChanges())throw Error('CONTENT_APPROVAL_VIEW_REQUIRED')
 view.queryContext={...view.queryContext,projectId,approvalId}
 const assertScope=()=>{
  assertHost()
  if(runtime.resolveView(dataViewKey)!==view||!validScope(view)||view.hasEditingChanges()||
   view.queryContext['projectId']!==projectId||view.queryContext['approvalId']!==approvalId)throw Error('CONTENT_APPROVAL_STALE')
 }
 await view.refresh();assertScope()
 if(!hasCompleteSingleContentResult(view))throw Error('CONTENT_APPROVAL_NOT_UNIQUE')
 const row=view.rows[0]
 if(!row)throw Error('CONTENT_APPROVAL_UNAVAILABLE')
 return bindApproval(view,row,{dataViewKey,projectId,approvalId,assertScope,assertResult:view.captureReadResult()})
}

function bindApproval(view:DataView,row:DataView['rows'][number],selection:Readonly<{
 dataViewKey:string;projectId:string;approvalId:string;assertScope:()=>void;assertResult:()=>void
}>){
 const {dataViewKey,projectId,approvalId,assertScope,assertResult}=selection
 if(row['id']!==approvalId||row['projectId']!==projectId)throw Error('CONTENT_APPROVAL_UNAVAILABLE')
 const {scope,nodeId,effectiveHash,revisionId,approverId,actorKind,authorityRef,decisionTraceRef}=row
 const assertRow=view.captureReadRow(row,fields.filter(field=>field!=='nodeId'||Object.hasOwn(row,field)))
 if(typeof scope!=='string'||!scopes.has(scope)||(scope==='PROJECT'?nodeId!==null&&nodeId!==undefined:!identity(nodeId))||
  typeof effectiveHash!=='string'||!/^[a-f0-9]{64}$/u.test(effectiveHash)||
  !identity(revisionId)||!identity(authorityRef)||!identity(decisionTraceRef)||![approverId,actorKind].every(identity))
  throw Error('CONTENT_APPROVAL_EVIDENCE')
 const assertCurrent=()=>{assertScope();assertResult();assertRow()}
 assertCurrent()
 return Object.freeze({dataViewKey,projectId,approvalRef:approvalId,scope,nodeId,effectiveHash,revisionId,authorityRef,decisionTraceRef,
  requiresCurrentCoverageCheck:true,assertCurrent})
}

/** 固定同一次审核所需的全部原批准，使其共同依赖同一读回代次。 */
export async function readContentApprovals(host:ContentRevisionReadHost,approvalIds:readonly string[]){
 const {runtime,scenarioId,projectId,assertCurrent:assertHost}=host
 assertHost()
 const requested=[...approvalIds],ids=new Set(requested)
 if(![scenarioId,projectId,...requested].every(identity)||ids.size!==requested.length)
  throw Error('CONTENT_APPROVAL_IDENTITY_REQUIRED')
 if(!requested.length)return Object.freeze([])
 const dataViewKey=buildDataViewKey('Approval','selectedContentApprovals',scenarioId),view=runtime.resolveView(dataViewKey)
 const valid=()=>view?.dataTable?.modelBinding?.modelName==='Approval'&&view.commitMode==='staged'&&
  view.queryConfig.autoQuery===false&&view.queryConfig.allPages===true&&view.queryConfig.pagination==='paged'&&
  hasContentScopeCondition(view,'projectId',{Type:'GetInputParam',ParamName:'projectId'})
 if(!view||!valid()||view.hasEditingChanges())throw Error('CONTENT_APPROVAL_VIEW_REQUIRED')
 view.queryContext={...view.queryContext,projectId}
 view.filterExpression={logic:'or',filters:requested.map(value=>({field:'id',operator:'eq',value}))}
 const signature=JSON.stringify(view.filterExpression)
 const assertScope=()=>{
  assertHost()
  if(runtime.resolveView(dataViewKey)!==view||!valid()||view.hasEditingChanges()||
   view.queryContext['projectId']!==projectId||JSON.stringify(view.filterExpression)!==signature)
   throw Error('CONTENT_APPROVAL_STALE')
 }
 await view.refresh();assertScope()
 if(view.countReported!==true||view.rows.length!==requested.length||view.total!==requested.length||view.nextPageAvailable===true)
  throw Error('CONTENT_APPROVAL_NOT_UNIQUE')
 const assertResult=view.captureReadResult(),records=new Map<string,ReturnType<typeof bindApproval>>()
 for(const row of view.rows){
  const approvalId=row['id']
  if(!identity(approvalId)||!ids.has(approvalId)||records.has(approvalId))throw Error('CONTENT_APPROVAL_UNAVAILABLE')
  records.set(approvalId,bindApproval(view,row,{dataViewKey,projectId,approvalId,assertScope,assertResult}))
 }
 return Object.freeze(requested.map(id=>{
  const record=records.get(id)
  if(!record)throw Error('CONTENT_APPROVAL_UNAVAILABLE')
  return record
 }))
}
