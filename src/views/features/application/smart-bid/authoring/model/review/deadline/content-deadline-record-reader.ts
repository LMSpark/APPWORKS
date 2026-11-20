/**
 * @module app:views/features/application/smart-bid/authoring/model/review/deadline/content-deadline-record-reader
 * 职责：第54项回读已登记对账时点及应交义务索引。
 * 边界：原记录确定截止范围和时点，证据由各正式办理方提供。
 * AI用途：核对截止对账是否使用原时点、原阶段和完整应交义务。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionReadHost} from '../../content-revision-reader'

const fields=['id','projectId','lotId','roundId','stageId','subjectId','channelId','cutoffAt','knownAt','obligationIds']
const valid=(view:DataView)=>view.dataTable?.modelBinding?.modelName==='SubmissionReconciliation'&&
 view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&
 hasContentScopeCondition(view,'projectId',{Type:'GetInputParam',ParamName:'projectId'})&&
 hasContentScopeCondition(view,'id',{Type:'GetInputParam',ParamName:'deadlineRef'})

/** 截止时点和义务来自同一原记录，不从当前时间或页面地址补默认。 */
export async function readRegisteredDeadlineRecord(host:ContentRevisionReadHost,deadlineRef:string){
 const {runtime,scenarioId,projectId}=host
 host.assertCurrent()
 const error='SUBMISSION_DEADLINE_READ_SCOPE'
 if(![scenarioId,projectId,deadlineRef].every(identity))throw Error(error)
 const key=buildDataViewKey('SubmissionReconciliation','originalDeadline',scenarioId),view=runtime.resolveView(key)
 if(!view||!valid(view)||view.hasEditingChanges())throw Error('SUBMISSION_DEADLINE_VIEW_REQUIRED')
 view.queryContext={...view.queryContext,projectId,deadlineRef}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid(view)||view.loadingError||view.hasEditingChanges()||
   view.queryContext['projectId']!==projectId||view.queryContext['deadlineRef']!==deadlineRef)
   throw Error('SUBMISSION_DEADLINE_READ_STALE')
 }
 await view.refresh()
 assertScope()
 const row=view.rows[0]
 if(!row||!hasCompleteSingleContentResult(view))throw Error('SUBMISSION_DEADLINE_READ_NOT_UNIQUE')
 const assertRead=view.captureReadResult(),assertRow=view.captureReadRow(row,fields)
 const assertCurrent=()=>{assertScope();assertRead();assertRow()}
 const {lotId,roundId,stageId,subjectId,channelId,cutoffAt,knownAt,obligationIds}=row
 if(row['id']!==deadlineRef||row['projectId']!==projectId||!identity(lotId)||!identity(roundId)||!identity(stageId)||
  !identity(subjectId)||!identity(channelId)||!identity(cutoffAt)||!identity(knownAt)||
  !Array.isArray(obligationIds)||!obligationIds.every(identity)||new Set(obligationIds).size!==obligationIds.length)throw Error(error)
 assertCurrent()
 return Object.freeze({deadlineRef,roundId,stageId,scope:Object.freeze({projectId,lotId,subjectId,channelId}),
  input:Object.freeze({cutoffAt,knownAt,obligationIds:Object.freeze([...obligationIds])}),assertCurrent})
}
