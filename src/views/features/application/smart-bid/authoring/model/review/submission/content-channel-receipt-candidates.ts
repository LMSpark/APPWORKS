/**
 * @module app:views/features/application/smart-bid/authoring/model/review/submission/content-channel-receipt-candidates
 * 职责：第53项从同标段、主体和渠道查可配对的原办理索引。
 * 边界：读取同一运行实例的完整候选视图，配对判定由原业务规则执行。
 * AI用途：核对候选视图的授权范围、数量完整性和原办理身份。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import type {pairOriginalChannelReceipt} from '@/services/smart-bid/content/review/submission/channel-receipt-pairing'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../../content-revision-reader'

/** 约束回执配对范围和原办理候选的数据合同。 */
type Pair=Parameters<typeof pairOriginalChannelReceipt>
const keys=['projectId','lotId','subjectId','channelId'] as const
const fields=['id',...keys,'operationRef','actualObjectRef','withdrawalTargetRef']
const valid=(view:DataView)=>view.dataTable?.modelBinding?.modelName==='SubmissionAttempt'&&
 view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&view.queryConfig.allPages===true&&
 keys.every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))

/** 只查办理索引。输出必须完整，避免把截断列表中的唯一候选判成唯一原批次。 */
export async function readRegisteredReceiptCandidates(host:ContentRevisionReadHost,input:Pair[0]):Promise<Readonly<{
 attempts:Pair[2];assertCurrent:()=>void
}>>{
 const {projectId,scenarioId,runtime}=host
 const scope=Object.freeze({...input})
 host.assertCurrent()
 if(scope.projectId!==projectId||![scenarioId,...Object.values(scope)].every(identity))throw Error('CHANNEL_RECEIPT_CANDIDATE_SCOPE')
 const key=buildDataViewKey('SubmissionAttempt','receiptCandidates',scenarioId),view=runtime.resolveView(key)
 if(!view||!valid(view)||view.hasEditingChanges())throw Error('CHANNEL_RECEIPT_CANDIDATE_VIEW_REQUIRED')
 view.queryContext={...view.queryContext,...scope}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid(view)||view.loadingError||view.hasEditingChanges()||
   keys.some(field=>view.queryContext[field]!==scope[field]))throw Error('CHANNEL_RECEIPT_CANDIDATE_STALE')
 }
 await view.refresh()
 assertScope()
 if(view.countReported!==true||view.total!==view.rows.length||view.nextPageAvailable===true)
  throw Error('CHANNEL_RECEIPT_CANDIDATE_INCOMPLETE')
 const assertRead=view.captureReadResult(),proofs=view.rows.map(row=>view.captureReadRow(row,fields))
 const attempts=view.rows.map(row=>{
  const {id:attemptRef,operationRef,actualObjectRef:objectRef,withdrawalTargetRef}=row
  if(keys.some(field=>row[field]!==scope[field])||!identity(attemptRef)||
   (operationRef!==null&&!identity(operationRef))||(objectRef!==null&&!identity(objectRef))||
   (withdrawalTargetRef!==null&&!identity(withdrawalTargetRef)))throw Error('CHANNEL_RECEIPT_CANDIDATE_SCOPE')
  return Object.freeze({...scope,attemptRef,operationRef,objectRef,...(withdrawalTargetRef===null?{}:{withdrawalTargetRef})})
 })
 const assertCurrent=()=>{assertScope();assertRead();for(const proof of proofs)proof()}
 assertCurrent()
 return Object.freeze({attempts:Object.freeze(attempts),assertCurrent})
}
