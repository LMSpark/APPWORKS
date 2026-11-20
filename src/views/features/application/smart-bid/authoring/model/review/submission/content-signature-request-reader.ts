/**
 * @module app:views/features/application/smart-bid/authoring/model/review/submission/content-signature-request-reader
 * 职责：经原签署命名视图读取动作46的原请求结果。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {recoverSignatureRequest} from '@/services/smart-bid/content/review/submission/signature-request'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../../content-revision-reader'

type Request=Parameters<typeof recoverSignatureRequest>[0]
const keys=['projectId','requestKey','requestDigest'] as const
const fields=[...keys,'objectKind','objectRef','objectVersion','objectHash','positionRef','signerRef','state'] as const
const valid=(view:DataView)=>view.dataTable?.modelBinding?.modelName==='SignatureRecord'&&
 view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&keys.every(field=>
  hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))

/** 空查保留未知；只使用当前代次可读的原始办理字段。 */
export function readOriginalSignatureRequest(host:ContentRevisionReadHost,input:Request){
 const {runtime,scenarioId,projectId}=host
 host.assertCurrent()
 if(!identity(scenarioId)||input.projectId!==projectId)throw Error('BID_SIGNATURE_RECOVERY_SCOPE')
 return recoverSignatureRequest(input,{assertCurrent:host.assertCurrent,async lookup(request){
  const {requestKey,requestDigest}=request
  const context={projectId,requestKey,requestDigest}
  const key=buildDataViewKey('SignatureRecord','originalSignatureRequest',scenarioId),view=runtime.resolveView(key)
  if(!view||!valid(view)||view.hasEditingChanges())throw Error('BID_SIGNATURE_RECOVERY_VIEW')
  view.queryContext={...view.queryContext,...context}
  const assertScope=()=>{
   host.assertCurrent()
   if(runtime.resolveView(key)!==view||!valid(view)||view.loadingError||view.hasEditingChanges()||
    keys.some(field=>view.queryContext[field]!==context[field]))throw Error('BID_SIGNATURE_RECOVERY_STALE')
  }
  await view.refresh()
  assertScope()
  if(view.countReported!==true||view.total!==view.rows.length||view.nextPageAvailable===true||view.rows.length>1)
   throw Error('BID_SIGNATURE_RECOVERY_INCOMPLETE')
  const assertResult=view.captureReadResult(),row=view.rows[0]
  if(!row)return {request,state:'UNKNOWN',assertCurrent:()=>{assertScope();assertResult()}}
  const {state,terminalRef,id,operationRef,signedObjectRef,signedObjectHash}=row
  const assertRow=view.captureReadRow(row,state==='SIGNED'?[...fields,'id','operationRef','signedObjectRef','signedObjectHash']:
   state==='NOT_EFFECTIVE'?[...fields,'terminalRef']:fields)
  const assertCurrent=()=>{assertScope();assertResult();assertRow()}
  if(fields.some(field=>field!=='state'&&row[field]!==request[field]))throw Error('BID_SIGNATURE_RECOVERY_SCOPE')
  if(state==='UNKNOWN'||state==='IN_PROGRESS')return {request,state,assertCurrent}
  if(state==='NOT_EFFECTIVE'&&identity(terminalRef))return {request,state,terminalRef,assertCurrent}
  if(state==='SIGNED'&&identity(id)&&identity(operationRef)&&identity(signedObjectRef)&&identity(signedObjectHash))
   return {request,state,operationRef,signatureRecordId:id,signedObjectRef,signedObjectHash,assertCurrent}
  throw Error('BID_SIGNATURE_RECOVERY_RECEIPT')
 }})
}
