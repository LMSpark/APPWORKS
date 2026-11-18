/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-delivery-freeze-reader
 * 职责：通过指定 DataView 查询原冻结，不读取当前选件指针。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {readOriginalDeliveryFreeze} from '@/services/smart-bid/content/review/delivery-freeze-recovery'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {isRecord} from '@spark-appworks/spark-utils'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../content-revision-reader'

type Request=Parameters<typeof readOriginalDeliveryFreeze>[0]
const scopeFields=['projectId','requestKey','requestDigest']
const fields=[...scopeFields,'groupScope','status','terminalRef','frozenResult']
function valid(view:DataView){
 return view.dataTable?.modelBinding?.modelName==='DeliveryManifest'&&view.commitMode==='staged'&&
  view.queryConfig.autoQuery===false&&scopeFields.every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))
}

/** 查询固定请求；只有完整且身份一致的回读可以交给恢复核验。 */
export function readRegisteredDeliveryFreeze(host:ContentRevisionReadHost,request:Request){
 const {runtime,scenarioId,projectId}=host
 host.assertCurrent()
 if(!identity(scenarioId)||projectId!==request.groupScope.projectId)throw Error('DELIVERY_FREEZE_REQUEST_SCOPE')
 return readOriginalDeliveryFreeze(request,{assertCurrent:()=>host.assertCurrent(),lookup:async selection=>{
  const key=buildDataViewKey('DeliveryManifest','originalFreeze',scenarioId),view=runtime.resolveView(key)
  if(!view||!valid(view)||view.hasEditingChanges())throw Error('DELIVERY_FREEZE_VIEW_REQUIRED')
  const context={projectId,requestKey:selection.requestKey,requestDigest:selection.requestDigest}
  view.queryContext={...view.queryContext,...context}
  const assertScope=()=>{
   host.assertCurrent()
   if(runtime.resolveView(key)!==view||!valid(view)||view.hasEditingChanges()||
    Object.entries(context).some(([field,value])=>view.queryContext[field]!==value))throw Error('DELIVERY_FREEZE_STALE')
  }
  await view.refresh()
  assertScope()
  if(view.countReported!==true||view.total!==view.rows.length||view.nextPageAvailable===true||view.rows.length>1)
   throw Error('DELIVERY_FREEZE_READ_INCOMPLETE')
  const assertResult=view.captureReadResult(),row=view.rows[0]
  if(!row)return {status:'UNKNOWN',request:selection,assertCurrent:()=>{assertScope();assertResult()}}
  const {groupScope,status,terminalRef,frozenResult}=row
  if(Object.entries(context).some(([field,value])=>row[field]!==value)||!isRecord(groupScope))
   throw Error('DELIVERY_FREEZE_REQUEST_SCOPE')
  const original={...context,groupScope:groupScope as Request['groupScope']}
  const required=fields.filter(field=>field!=='terminalRef'&&field!=='frozenResult'||
   field==='terminalRef'&&status==='NOT_EFFECTIVE'||field==='frozenResult'&&status==='FROZEN')
  const assertRow=view.captureReadRow(row,required)
  const assertCurrent=()=>{assertScope();assertResult();assertRow()}
  assertCurrent()
  if(status==='UNKNOWN')return {status,request:original,assertCurrent}
  if(status==='NOT_EFFECTIVE'&&identity(terminalRef))return {status,request:original,terminalRef,assertCurrent}
  if(status==='FROZEN'&&isRecord(frozenResult)){
   type Frozen=Extract<Awaited<ReturnType<typeof readOriginalDeliveryFreeze>>,{status:'FROZEN'}>
   return {status,request:original,record:frozenResult as Frozen['record'],assertCurrent}
  }
  throw Error('DELIVERY_FREEZE_READ_EVIDENCE')
 }})
}
