/** @module app:views/features/application/smart-bid/authoring/model/content-requirement-reader
 * 职责：读取项目内指定谱系及版本的要求原记录。
 * 边界：只返回原DataView证明，基线成员与用途许可由上层确认。
 */
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {buildDataViewKey,type DataView,type DataViewFilterTree} from '@spark-appworks/spark-data'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionReadHost} from './content-revision-reader'

export type ContentRequirementSelection=Readonly<{lineageId:string;version:string}>
/** 原版本可读证明；两个待核标志不因status=ADOPTED而消失。 */
export type ContentRequirementBinding=Readonly<{
 dataViewKey:string;requirementContentHash:string;requiresBaselineMembershipCheck:true;requiresUseCheck:true;assertCurrent:()=>void
}>
const contentFields=['projectId','lineageId','version','kind','text','score','sourceSpan','supportingSpans','sourceRecord','parseQuality','checks','constraint','applicability']
const fields=['id',...contentFields,'status']
function hashRequirementContent(row:Readonly<Record<string,unknown>>):Promise<string>{
 const content=Object.fromEntries(contentFields.map(field=>[field,row[field]]))
 return hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.requirement-content/1',content]))
}

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
 const requirementContentHash=await hashRequirementContent(row)
 assertCurrent()
 return Object.freeze({dataViewKey,requirementContentHash,requiresBaselineMembershipCheck:true,requiresUseCheck:true,assertCurrent})
}

/** 对本次范围已知谱系/原版组一次查询，保持全部原行读取证明。 */
export async function readEffectiveRequirementVersions(host:ContentRevisionReadHost,selections:readonly ContentRequirementSelection[]){
 const {runtime,scenarioId,projectId,assertCurrent:assertHost}=host
 assertHost()
 const memberKey=(lineageId:unknown,version:unknown)=>JSON.stringify([lineageId,version])
 if(!identity(scenarioId)||!identity(projectId)||selections.some(item=>!identity(item.lineageId)||!identity(item.version)))
  throw Error('CONTENT_REQUIREMENT_IDENTITY_REQUIRED')
 const members=new Map(selections.map(item=>[memberKey(item.lineageId,item.version),item]))
 if(!members.size)return Object.freeze({records:Object.freeze([]),assertCurrent:assertHost})
 const key=buildDataViewKey('Requirement','effectiveRequirementVersions',scenarioId),view=runtime.resolveView(key)
 const valid=()=>view?.dataTable?.modelBinding?.modelName==='Requirement'&&view.commitMode==='staged'&&
  view.queryConfig.allPages===true&&view.queryConfig.pagination==='paged'&&view.queryConfig.autoQuery===false&&
  hasContentScopeCondition(view,'projectId',{Type:'GetInputParam',ParamName:'projectId'})
 if(!view||!valid()||view.hasEditingChanges())throw Error('CONTENT_EFFECTIVE_REQUIREMENT_VIEW_REQUIRED')
 const filter:DataViewFilterTree={logic:'or',filters:[...members.values()].map(({lineageId,version})=>({logic:'and',
  filters:[{field:'lineageId',operator:'eq',value:lineageId},{field:'version',operator:'eq',value:version}],
 }))}
 view.queryContext={...view.queryContext,projectId}
 view.queryConfig={...view.queryConfig,maxRows:members.size+1}
 view.filterExpression=filter
 const signature=JSON.stringify(view.filterExpression)
 const assertScope=()=>{
  assertHost()
  if(runtime.resolveView(key)!==view||!valid()||view.hasEditingChanges()||view.queryContext['projectId']!==projectId||
   view.queryConfig.maxRows!==members.size+1||JSON.stringify(view.filterExpression)!==signature)throw Error('CONTENT_EFFECTIVE_REQUIREMENT_STALE')
 }
 await view.refresh();assertScope()
 const assertResult=view.captureReadResult()
 if(view.countReported!==true||view.total!==members.size||view.rows.length!==members.size||view.nextPageAvailable===true)
  throw Error('CONTENT_EFFECTIVE_REQUIREMENT_INCOMPLETE')
 const seen=new Set<string>(),proofs:Array<()=>void>=[]
 const records=await Promise.all(view.rows.map(async row=>{
  const {lineageId,version}=row,identityKey=memberKey(lineageId,version)
  if(row['projectId']!==projectId||!identity(row['id'])||!identity(lineageId)||!identity(version)||!members.has(identityKey)||seen.has(identityKey))
   throw Error('CONTENT_EFFECTIVE_REQUIREMENT_INCOMPLETE')
  seen.add(identityKey);proofs.push(view.captureReadRow(row,fields))
  return Object.freeze({lineageId,version,requirementContentHash:await hashRequirementContent(row)})
 }))
 const assertCurrent=()=>{assertScope();assertResult();for(const proof of proofs)proof()}
 assertCurrent()
 return Object.freeze({records:Object.freeze(records),assertCurrent})
}
