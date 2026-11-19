/**
 * @module app:views/features/application/smart-bid/authoring/model/operation/content-operation-dispatch-reader
 * 职责：第05项通过原 ContextManifest 视图定位同试次实发记录。
 * 边界：通过原命名视图读取派发记录，保留未知办理结果。
 * AI用途：定位请求发出后缺少派发凭据的原因。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import type {verifyOriginalOperationRouteDispatch} from '@/services/smart-bid/operation/operation-route-dispatch-evidence'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../content-revision-reader'

/** 读取工艺证据所需的项目、场景和当前会话约束。 */
type Scope=Parameters<typeof verifyOriginalOperationRouteDispatch>[0]
/** 原派发办理记录回读合同。 */
type Readback=Parameters<typeof verifyOriginalOperationRouteDispatch>[1]
const contextFields=['projectId','runId','attemptRef','requestKey'] as const
const fields=[...contextFields,'targetDigest','configurationLockHash','dispatchRef','actualInputDigest']
function valid(view:DataView){
 return view.dataTable?.modelBinding?.modelName==='ContextManifest'&&view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&
  (view.queryConfig.cacheType===undefined||view.queryConfig.cacheType==='none')&&
  contextFields.every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))
}

/** 查空不认定未发；实际输入详情由本次查询返回的字段权限决定。 */
export async function readRegisteredOperationDispatch(host:ContentRevisionReadHost,input:Scope):Promise<Readback>{
 const {runtime,scenarioId,projectId}=host
 host.assertCurrent()
 const scope=Object.freeze({...input})
 const context={projectId,runId:scope.runId,attemptRef:scope.attemptRef,requestKey:scope.requestKey}
 const error='OPERATION_DISPATCH_READ_SCOPE'
 if(![scenarioId,...Object.values(context)].every(identity)||scope.projectId!==projectId||
  ![scope.targetDigest,scope.configurationLockHash].every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value)))throw Error(error)
 const key=buildDataViewKey('ContextManifest','originalDispatch',scenarioId),view=runtime.resolveView(key)
 if(!view||!valid(view)||view.hasEditingChanges())throw Error('OPERATION_DISPATCH_VIEW_REQUIRED')
 view.queryContext={...view.queryContext,...context}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid(view)||view.loadingError||view.hasEditingChanges()||
   Object.entries(context).some(([field,value])=>view.queryContext[field]!==value))throw Error('OPERATION_DISPATCH_READ_STALE')
 }
 await view.refresh()
 assertScope()
 if(view.countReported!==true||view.total!==view.rows.length||view.nextPageAvailable===true||view.rows.length>1)
  throw Error('OPERATION_DISPATCH_READ_INCOMPLETE')
 const assertRead=view.captureReadResult(),row=view.rows[0]
 if(!row)return Object.freeze({...scope,state:'UNKNOWN',assertCurrent:()=>{assertScope();assertRead()}})
 if(Object.entries(scope).some(([field,value])=>row[field]!==value))throw Error(error)
 const {dispatchRef,actualInputDigest}=row
 if(!identity(dispatchRef)||typeof actualInputDigest!=='string'||!/^[a-f0-9]{64}$/u.test(actualInputDigest))throw Error(error)
 const canReadInput=view.fieldAccess(row,'actualInput').read==='visible'&&Object.hasOwn(row,'actualInput')
 const assertRow=view.captureReadRow(row,canReadInput?[...fields,'actualInput']:fields)
 const assertCurrent=()=>{assertScope();assertRead();assertRow()}
 assertCurrent()
 return Object.freeze({...scope,state:'DISPATCH_RECORDED',dispatchRef,actualInputDigest,
  ...(canReadInput?{input:structuredClone(row['actualInput'])}:{}),assertCurrent})
}
