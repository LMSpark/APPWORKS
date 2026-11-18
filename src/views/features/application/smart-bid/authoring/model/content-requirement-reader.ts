/** @module app:views/features/application/smart-bid/authoring/model/content-requirement-reader
 * 职责：读取项目内指定谱系及版本的要求原记录。
 * 边界：只返回原DataView证明，基线成员与用途许可由上层确认。
 */
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionReadHost} from './content-revision-reader'

export type ContentRequirementSelection=Readonly<{lineageId:string;version:string}>
/** 原版本可读证明；两个待核标志不因status=ADOPTED而消失。 */
export type ContentRequirementBinding=Readonly<{
 dataViewKey:string;requirementContentHash:string;requiresBaselineMembershipCheck:true;requiresUseCheck:true;assertCurrent:()=>void
}>
const contentFields=['projectId','lineageId','version','kind','text','score','sourceSpan','supportingSpans','sourceRecord','parseQuality','checks','constraint','applicability']
const fields=['id',...contentFields,'status']

function validScope(view:DataView):boolean{
 return view.dataTable?.modelBinding?.modelName==='Requirement'&&view.commitMode==='staged'
  &&['projectId','lineageId','version'].every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))
}

/** 读取同次正式查询的原记录，查询代次或会话变化后撤销证明。 */
export async function readContentRequirement(host:ContentRevisionReadHost,input:ContentRequirementSelection):Promise<ContentRequirementBinding>{
 const {runtime,scenarioId,projectId,assertCurrent:assertHost}=host,{lineageId,version}=input
 assertHost()
 if(!identity(scenarioId)||!identity(projectId)||!identity(lineageId)||!identity(version))
  throw Error('CONTENT_REQUIREMENT_IDENTITY_REQUIRED')
 const dataViewKey=buildDataViewKey('Requirement','selectedRequirement',scenarioId),view=runtime.resolveView(dataViewKey)
 if(!view||!validScope(view))throw Error('CONTENT_REQUIREMENT_SCOPE_REQUIRED')
 if(view.hasEditingChanges())throw Error('CONTENT_REQUIREMENT_EDITING')
 view.queryContext={...view.queryContext,projectId,lineageId,version}
 const assertScope=()=>{
  assertHost()
  if(runtime.resolveView(dataViewKey)!==view||!validScope(view)||view.hasEditingChanges()
   ||view.queryContext['projectId']!==projectId||view.queryContext['lineageId']!==lineageId||view.queryContext['version']!==version)
   throw Error('CONTENT_REQUIREMENT_STALE')
 }
 await view.refresh();assertScope()
 const assertResult=view.captureReadResult()
 if(!hasCompleteSingleContentResult(view))throw Error('CONTENT_REQUIREMENT_NOT_UNIQUE')
 const row=view.rows[0]
 if(!row||!identity(row['id'])||row['projectId']!==projectId||row['lineageId']!==lineageId||row['version']!==version)
  throw Error('CONTENT_REQUIREMENT_UNAVAILABLE')
 const assertRow=view.captureReadRow(row,fields)
 const assertCurrent=()=>{
  assertScope();assertResult();assertRow()
  if(!hasCompleteSingleContentResult(view))throw Error('CONTENT_REQUIREMENT_NOT_UNIQUE')
 }
 const content=Object.fromEntries(contentFields.map(field=>[field,row[field]]))
 const requirementContentHash=await hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.requirement-content/1',content]))
 assertCurrent()
 return Object.freeze({dataViewKey,requirementContentHash,requiresBaselineMembershipCheck:true,requiresUseCheck:true,assertCurrent})
}
