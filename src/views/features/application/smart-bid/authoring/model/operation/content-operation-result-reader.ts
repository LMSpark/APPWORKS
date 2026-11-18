/**
 * @module app:views/features/application/smart-bid/authoring/model/operation/content-operation-result-reader
 * 职责：第06项以 GenerationRun 原试次视图读取原返回。
 * 边界：通过原办理记录核验结果，保留不确定状态。
 * AI用途：确认原结果回执是否支持本次核验结论。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import type {verifyOperationRouteReturn} from '@/services/smart-bid/operation/operation-route-return'
import {recoverOperationRouteAttempt} from '@/services/smart-bid/operation/operation-route-recovery'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../content-revision-reader'
import {readRegisteredOperationDispatch} from './content-operation-dispatch-reader'

/** 读取工艺证据所需的项目、场景和当前会话约束。 */
type Scope=Parameters<typeof verifyOperationRouteReturn>[0]
/** 原办理返回的持久结果凭据。 */
type Receipt=Parameters<typeof verifyOperationRouteReturn>[1]
const keys=['projectId','runId','attemptRef','requestKey'] as const
const fields=[...keys,'targetDigest','configurationLockHash','receiptRef','state']
function valid(view:DataView){
 return view.dataTable?.modelBinding?.modelName==='GenerationRun'&&view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&
  keys.every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))
}

/** 页18可沿同一正式运行实例回查实发和原返回，不调用派发。 */
export function recoverRegisteredOperationRouteAttempt(host:ContentRevisionReadHost,
 manifest:Parameters<typeof recoverOperationRouteAttempt>[0],guide:Parameters<typeof recoverOperationRouteAttempt>[1]['guide']){
 return recoverOperationRouteAttempt(manifest,{guide,assertCurrent:()=>host.assertCurrent(),
  readDispatch:scope=>readRegisteredOperationDispatch(host,scope),readResult:scope=>readRegisteredOperationResult(host,scope)})
}

export async function readRegisteredOperationResult(host:ContentRevisionReadHost,input:Scope):Promise<Receipt|undefined>{
 const {runtime,scenarioId,projectId}=host
 host.assertCurrent()
 const scope=Object.freeze({...input})
 const context={projectId,runId:scope.runId,attemptRef:scope.attemptRef,requestKey:scope.requestKey}
 const error='OPERATION_RESULT_READ_SCOPE'
 if(![scenarioId,...Object.values(context)].every(identity)||scope.projectId!==projectId)throw Error(error)
 const key=buildDataViewKey('GenerationRun','originalResult',scenarioId),view=runtime.resolveView(key)
 if(!view||!valid(view)||view.hasEditingChanges())throw Error('OPERATION_RESULT_VIEW_REQUIRED')
 view.queryContext={...view.queryContext,...context}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid(view)||view.hasEditingChanges()||
   Object.entries(context).some(([field,value])=>view.queryContext[field]!==value))throw Error('OPERATION_RESULT_READ_STALE')
 }
 await view.refresh()
 assertScope()
 if(view.countReported!==true||view.total!==view.rows.length||view.nextPageAvailable===true||view.rows.length>1)
  throw Error('OPERATION_RESULT_READ_INCOMPLETE')
 const row=view.rows[0]
 if(!row)return undefined
 if(Object.entries(scope).some(([field,value])=>row[field]!==value))throw Error(error)
 const {receiptRef,state}=row
 if(!identity(receiptRef)||(state!=='COMPLETE'&&state!=='PARTIAL'&&state!=='FAILED'&&state!=='UNKNOWN'))throw Error(error)
 const assertRead=view.captureReadResult(),assertRow=view.captureReadRow(row,state==='COMPLETE'?[...fields,'output']:fields)
 const assertCurrent=()=>{assertScope();assertRead();assertRow()}
 assertCurrent()
 return state==='COMPLETE'?Object.freeze({...scope,state,receiptRef,output:structuredClone(row['output']),assertCurrent}):
  Object.freeze({...scope,state,receiptRef,assertCurrent})
}
