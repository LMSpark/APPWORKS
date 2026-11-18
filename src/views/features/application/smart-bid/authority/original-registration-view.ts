/**
 * @module app:views/features/application/smart-bid/authority/original-registration-view
 * 职责：按固定请求从授权登记命名视图捕获可读原行。
 */
import {buildDataViewKey,type DataView,type ViewMetadata} from '@spark-appworks/spark-data'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasContentScopeCondition} from '../authoring/model/content-revision-reader'

type RegistrationViewHost=Readonly<{
 scenarioId:string;runtime:{resolveView:(key:string)=>DataView|undefined};assertCurrent:()=>void
}>
const error='ORIGINAL_REGISTRATION_VIEW_REQUIRED'

/** 配置手动精确查询，字段权限仍取正式查询回执。 */
export function originalRegistrationView(primaryKey:string,keys:readonly string[],fields:readonly string[]):ViewMetadata{
 if(!identity(primaryKey))throw Error(error)
 return {commitMode:'staged',autoLoad:false,autoSelectFirst:false,autoCurrentFirst:false,
  scopeFilter:{logic:'and',filters:keys.map(field=>({field,operator:'eq',value:{Type:'GetInputParam',ParamName:field}}))},
  queryConfig:{autoQuery:false,cacheType:'none',pagination:'none',fields:[...new Set([primaryKey,...keys,...fields])]}}
}

/** 取同请求唯一原行、保留空查询证明，由业务读取器确认状态和可读字段。 */
export async function readOriginalRegistrationView(host:RegistrationViewHost,target:Readonly<{model:string;viewName?:string}>,
 request:Readonly<Record<string,string>>){
 const {scenarioId,runtime}=host
 const {model,viewName='originalRegistration'}=target
 host.assertCurrent()
 if(!identity(scenarioId))throw Error(error)
 const filters=Object.entries(request),fields=Object.keys(request)
 const key=buildDataViewKey(model,viewName,scenarioId),view=runtime.resolveView(key)
 const valid=()=>view?.dataTable?.modelBinding?.modelName===model&&view.commitMode==='staged'&&
  view.queryConfig.autoQuery===false&&fields.every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))
 if(!view||!valid()||view.hasEditingChanges())throw Error(error)
 view.queryContext={...view.queryContext,...request}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid()||view.loadingError||view.hasEditingChanges()||
   filters.some(([field,value])=>view.queryContext[field]!==value))throw Error(error)
 }
 await view.refresh()
 assertScope()
 if(view.countReported!==true||view.nextPageAvailable===true||view.rows.length>1||view.total!==view.rows.length)
  throw Error(error)
 const assertResult=view.captureReadResult(),row=view.rows[0]
 const assertCurrent=()=>{assertScope();assertResult()}
 if(row&&filters.some(([field,value])=>row[field]!==value))throw Error(error)
 return {row,assertCurrent,captureFields:(required:readonly string[])=>{
  if(!row)throw Error(error)
  const assertRow=view.captureReadRow(row,[...fields,...required])
  return ()=>{assertCurrent();assertRow()}
 }}
}
