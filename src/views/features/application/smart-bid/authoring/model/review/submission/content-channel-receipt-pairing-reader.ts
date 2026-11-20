/**
 * @module app:views/features/application/smart-bid/authoring/model/review/submission/content-channel-receipt-pairing-reader
 * 职责：第53项读取原渠道回执来源，交同范围原办理配对。
 * 边界：从正式视图取得回执及来源，候选范围由原办理提供。
 * AI用途：排查原回执为何仍待配对或指向唯一办理。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {pairOriginalChannelReceipt} from '@/services/smart-bid/content/review/submission/channel-receipt-pairing'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionReadHost} from '../../content-revision-reader'

/** 原渠道回执与原办理的配对合同。 */
type Pair=Parameters<typeof pairOriginalChannelReceipt>
/** 单个回执来源及其获知时点。 */
type Read=Pair[1][number]
const keys=[['projectId','projectId'],['id','receiptRef']] as const
const fields=['id','projectId','lotId','subjectId','channelId','eventRef','eventKind','eventAt','operationRef','objectRef','sources']
const valid=(view:DataView)=>view.dataTable?.modelBinding?.modelName==='ChannelReceipt'&&
 view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&
 (view.queryConfig.cacheType===undefined||view.queryConfig.cacheType==='none')&&keys.every(([field,ParamName])=>
  hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName}))

/** 保留原回执获得时点；候选集合须由同渠道办理记录证明完整。 */
export async function readRegisteredChannelReceiptPairing(host:ContentRevisionReadHost,receiptRef:string,
 readCandidates:(scope:Pair[0],receipt:Readonly<Pick<Read,'eventRef'|'operationRef'|'objectRef'>>) => Promise<Readonly<{
  attempts:Pair[2];assertCurrent:()=>void
 }>>){
 const {scenarioId,projectId,runtime}=host
 host.assertCurrent()
 const error='CHANNEL_RECEIPT_READ_SCOPE'
 if(![scenarioId,projectId,receiptRef].every(identity))throw Error(error)
 const key=buildDataViewKey('ChannelReceipt','originalPairing',scenarioId),view=runtime.resolveView(key)
 if(!view||!valid(view)||view.hasEditingChanges())throw Error('CHANNEL_RECEIPT_READ_VIEW_REQUIRED')
 view.queryContext={...view.queryContext,projectId,receiptRef}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid(view)||view.loadingError||view.hasEditingChanges()||
   view.queryContext['projectId']!==projectId||view.queryContext['receiptRef']!==receiptRef)throw Error('CHANNEL_RECEIPT_READ_STALE')
 }
 await view.refresh()
 assertScope()
 const row=view.rows[0]
 if(!row||!hasCompleteSingleContentResult(view))throw Error('CHANNEL_RECEIPT_READ_NOT_UNIQUE')
 const assertRead=view.captureReadResult(),assertRow=view.captureReadRow(row,fields)
 const assertReceipt=()=>{assertScope();assertRead();assertRow()}
 const {lotId,subjectId,channelId,eventRef,eventKind:kind,eventAt,operationRef,objectRef,sources}=row
 if(row['id']!==receiptRef||row['projectId']!==projectId||!identity(lotId)||!identity(subjectId)||
  !identity(channelId)||!identity(eventRef)||!identity(eventAt)||(operationRef!==null&&!identity(operationRef))||
  (objectRef!==null&&!identity(objectRef))||!Array.isArray(sources)||
  (kind!=='RECEIVED'&&kind!=='REJECTED'&&kind!=='WITHDRAWAL_CONFIRMED'))throw Error(error)
 const scope=Object.freeze({projectId,lotId,subjectId,channelId})
 const receipt=Object.freeze({eventRef,operationRef,objectRef})
 const reads=sources.map((source:unknown):Read=>{
  if(!isRecord(source)||!identity(source['sourceRef'])||!identity(source['knownAt']))throw Error(error)
  return {...scope,...receipt,kind,eventAt,sourceRef:source['sourceRef'],knownAt:source['knownAt']}
 })
 const candidates=await readCandidates(scope,receipt)
 const assertCurrent=()=>{assertReceipt();candidates.assertCurrent()}
 assertCurrent()
 return Object.freeze({...pairOriginalChannelReceipt(scope,reads,candidates.attempts),receiptRef,assertCurrent})
}
