/**
 * @module app:views/features/application/smart-bid/authoring/model/review/submission/content-submission-events-reader
 * 职责：读取原递交批次的办理事实，不把上传或查空当终局。
 * 边界：业务事实由原办理 DataView 提供，未知结果留给后续回查。
 * AI用途：核查原批次事件与项目、标段、渠道和请求摘要之间的对应关系。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {assertRegistrationViewRefreshable} from '../../../../authority/original-registration-view'
import {isRecord} from '@spark-appworks/spark-utils'
import type {recoverSubmissionAttempt} from '@/services/smart-bid/content/review/submission-attempt-recovery'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../../content-revision-reader'

/** 原递交试次的回查合同。 */
type Recovery=Parameters<typeof recoverSubmissionAttempt>
/** 固定项目、标段、主体、渠道和请求的回查范围。 */
type Scope=Recovery[0]
/** 原渠道记录中的单个办理事件。 */
type Event=Recovery[1]['events'][number]
const scopeKeys=['projectId','lotId','subjectId','channelId','requestDigest'] as const
const scopeConditions=[...scopeKeys.map(field=>[field,field] as const),['id','attemptRef'] as const]
const fields=['id',...scopeKeys,'events','combinedWithdrawalTarget']
const valid=(view:DataView)=>view.dataTable?.modelBinding?.modelName==='SubmissionAttempt'&&
 view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&
 (view.queryConfig.cacheType===undefined||view.queryConfig.cacheType==='none')&&scopeConditions.every(([field,ParamName])=>
  hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName}))

function readEvent(scope:Scope,value:unknown,assertCurrent:()=>void):Event{
 const error='SUBMISSION_EVENTS_EVIDENCE'
 if(!isRecord(value)||Object.entries(scope).some(([field,expected])=>value[field]!==expected)||!identity(value['eventRef']))
  throw Error(error)
 const {eventRef,kind,fileVersionId,actualObjectRef,uploadEventRef,targetAttemptRef}=value
 const base={...scope,eventRef,assertCurrent}
 if(kind==='UPLOADED'&&identity(fileVersionId))return {...base,kind,fileVersionId}
 if(kind==='DISPATCHED'&&identity(actualObjectRef)&&(uploadEventRef===undefined||identity(uploadEventRef)))
  return {...base,kind,actualObjectRef,...(uploadEventRef===undefined?{}:{uploadEventRef})}
 if(kind==='WITHDRAWAL_SENT'&&identity(targetAttemptRef))return {...base,kind,targetAttemptRef}
 if(kind==='NOT_EXECUTED')return {...base,kind}
 throw Error(error)
}

/** 完整空结果保留原查询证明并交未知。 */
export async function readRegisteredSubmissionEvents(host:ContentRevisionReadHost,original:Scope):Promise<Recovery[1]>{
 const {runtime,scenarioId,projectId}=host
 host.assertCurrent()
 const scope=Object.freeze({...original})
 if(![scenarioId,...Object.values(scope)].every(identity)||scope.projectId!==projectId||
  !/^[a-f0-9]{64}$/u.test(scope.requestDigest))throw Error('SUBMISSION_EVENTS_SCOPE')
 const key=buildDataViewKey('SubmissionAttempt','originalEvents',scenarioId),view=runtime.resolveView(key)
 if(!view||!valid(view)||view.hasEditingChanges())throw Error('SUBMISSION_EVENTS_VIEW_REQUIRED')
 assertRegistrationViewRefreshable(view,'SUBMISSION_EVENTS_STALE')
 view.queryContext={...view.queryContext,...scope}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid(view)||view.loadingError||view.hasEditingChanges()||
   Object.entries(scope).some(([field,value])=>view.queryContext[field]!==value))throw Error('SUBMISSION_EVENTS_STALE')
 }
 const refreshed=await view.requestRefresh({defer:false})
 if(refreshed.refreshStatus!=='read')throw Error('SUBMISSION_EVENTS_STALE')
 assertScope()
 if(view.countReported!==true||view.total!==view.rows.length||view.nextPageAvailable===true||view.rows.length>1)
  throw Error('SUBMISSION_EVENTS_INCOMPLETE')
 const assertRead=view.captureReadResult(),row=view.rows[0]
 if(!row)return Object.freeze({events:Object.freeze([]),assertCurrent:()=>{assertScope();assertRead()}})
 const assertRow=view.captureReadRow(row,fields),assertCurrent=()=>{assertScope();assertRead();assertRow()}
 const {events,combinedWithdrawalTarget}=row
 if(row['id']!==scope.attemptRef||scopeKeys.some(field=>row[field]!==scope[field])||!Array.isArray(events)||
  (combinedWithdrawalTarget!==null&&!identity(combinedWithdrawalTarget)))throw Error('SUBMISSION_EVENTS_SCOPE')
 const parsed=events.map((event:unknown)=>Object.freeze(readEvent(scope,event,assertCurrent)))
 assertCurrent()
 return Object.freeze({events:Object.freeze(parsed),assertCurrent,
  ...(combinedWithdrawalTarget===null?{}:{combinedWithdrawalTarget})})
}
