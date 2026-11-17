/**
 * @module app:views/features/application/smart-bid/authoring/model/content-fact-version-reader
 * 职责：在正文宿主原DataView读取精确事实键及版本，保留原事实和来源决定引用。
 * 边界：不选择最新版本、不证明基线成员或本次用途许可、不扩展字段、不保存。
 * AI用途：基线成员确定后消费原版本；未接通基线时只能作为待核原记录展示。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionReadHost} from './content-revision-reader'

/** factId为项目内事实键；version是显式原版本，不从状态或当前项目指针推导。 */
export type ContentFactVersionSelection=Readonly<{factId:string;version:number}>
/** 原版本可读证明；两个待核标志不因status=ADOPTED而消失。 */
export type ContentFactVersionBinding=Readonly<{
 dataViewKey:string;requiresBaselineMembershipCheck:true;requiresUseCheck:true;assertCurrent:()=>void
}>
const fields=['id','projectId','key','version','kind','value','unit','sourceIds','claimId','scopeRef','decisionRefs','dependencyRefs','promiseTerms','sourceRecord','status']
function identity(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value.trim()===value}
function validScope(view:DataView):boolean{
 return view.dataTable?.modelBinding?.modelName==='FactVersion'&&view.commitMode==='staged'
  &&['projectId','key','version'].every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))
}

/** 精确参数只交原常驻范围查询；零值、null、空串及原决定引用保持原字段，不复制业务真源。 */
export async function readContentFactVersion(host:ContentRevisionReadHost,input:ContentFactVersionSelection):Promise<ContentFactVersionBinding>{
 const {runtime,scenarioId,projectId,assertCurrent:assertHost}=host,{factId,version}=input
 assertHost()
 if(!identity(scenarioId)||!identity(projectId)||!identity(factId)||!Number.isSafeInteger(version)||version<0)
  throw Error('CONTENT_FACT_VERSION_IDENTITY_REQUIRED')
 const dataViewKey=buildDataViewKey('FactVersion','selectedFactVersion',scenarioId),view=runtime.resolveView(dataViewKey)
 if(!view||!validScope(view))throw Error('CONTENT_FACT_VERSION_SCOPE_REQUIRED')
 if(view.hasEditingChanges())throw Error('CONTENT_FACT_VERSION_EDITING')
 view.queryContext={...view.queryContext,projectId,key:factId,version}
 const assertScope=()=>{
  assertHost()
  if(runtime.resolveView(dataViewKey)!==view||!validScope(view)||view.hasEditingChanges()
   ||view.queryContext['projectId']!==projectId||view.queryContext['key']!==factId||view.queryContext['version']!==version)
   throw Error('CONTENT_FACT_VERSION_STALE')
 }
 await view.refresh();assertScope()
 const assertResult=view.captureReadResult()
 if(!hasCompleteSingleContentResult(view))throw Error('CONTENT_FACT_VERSION_NOT_UNIQUE')
 const row=view.rows[0]
 if(!row||!identity(row['id'])||row['projectId']!==projectId||row['key']!==factId||row['version']!==version)
  throw Error('CONTENT_FACT_VERSION_UNAVAILABLE')
 const assertRow=view.captureReadRow(row,fields)
 return Object.freeze({dataViewKey,requiresBaselineMembershipCheck:true,requiresUseCheck:true,assertCurrent:()=>{
  assertScope();assertResult();assertRow()
  if(!hasCompleteSingleContentResult(view))throw Error('CONTENT_FACT_VERSION_NOT_UNIQUE')
 }})
}
