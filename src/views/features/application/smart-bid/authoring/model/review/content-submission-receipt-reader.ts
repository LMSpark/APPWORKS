/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-submission-receipt-reader
 * 职责：按原办理与回执身份读取渠道接收证据。
 * 边界：仅消费已核接收范围；拒收、撤回与待配对记录不能证明栏位提交。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {snapshotReferenceIdentity as identity,visitSnapshotReferences} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionReadHost} from '../content-revision-reader'

const scopeFields=[['projectId','projectId'],['id','receiptRef'],['attemptRef','attemptRef']] as const
const fields=['id','projectId','revisionId','attemptRef','eventKind','observationRefs']
function valid(view:DataView):boolean{
 return view.dataTable?.modelBinding?.modelName==='ChannelReceipt'&&view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&
  scopeFields.every(([field,param])=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:param}))
}

/** 只读已核接收事件，不把包级回执自动展开成任意栏位。 */
export async function readPlatformSubmissionReceipt(host:ContentRevisionReadHost,selection:Readonly<{
 receiptRef:string;attemptRef:string;revisionId:string
}>){
 const {runtime,scenarioId,projectId}=host,{receiptRef,attemptRef,revisionId}=selection
 host.assertCurrent()
 if(![scenarioId,projectId,receiptRef,attemptRef,revisionId].every(identity))throw Error('CONTENT_PLATFORM_RECEIPT_SCOPE')
 const key=buildDataViewKey('ChannelReceipt','selectedPlatformReceipt',scenarioId),view=runtime.resolveView(key)
 if(!view||!valid(view)||view.hasEditingChanges())throw Error('CONTENT_PLATFORM_RECEIPT_VIEW')
 const context={projectId,receiptRef,attemptRef}
 view.queryContext={...view.queryContext,...context}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid(view)||view.hasEditingChanges()||
   Object.entries(context).some(([field,value])=>view.queryContext[field]!==value))throw Error('CONTENT_PLATFORM_RECEIPT_STALE')
 }
 await view.refresh();assertScope()
 if(!hasCompleteSingleContentResult(view))throw Error('CONTENT_PLATFORM_RECEIPT_NOT_UNIQUE')
 const row=view.rows[0]
 if(row?.['id']!==receiptRef||row['projectId']!==projectId||row['attemptRef']!==attemptRef||row['revisionId']!==revisionId)
  throw Error('CONTENT_PLATFORM_RECEIPT_SCOPE')
 const assertResult=view.captureReadResult(),assertRow=view.captureReadRow(row,fields)
 if(row['eventKind']!=='RECEIVED')throw Error('CONTENT_PLATFORM_RECEIPT_NOT_ACCEPTED')
 const observations=new Set<string>()
 visitSnapshotReferences(row['observationRefs'],item=>{
  if(!identity(item)||observations.has(item))throw Error('CONTENT_PLATFORM_RECEIPT_SCOPE')
  observations.add(item)
 },'CONTENT_PLATFORM_RECEIPT_SCOPE')
 const assertCurrent=()=>{assertScope();assertResult();assertRow()}
 assertCurrent()
 return Object.freeze({projectId,revisionId,attemptRef,receiptRef,observationRefs:Object.freeze([...observations]),assertCurrent})
}
