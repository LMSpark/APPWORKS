/**
 * @module app:views/features/application/smart-bid/authoring/model/review/submission/content-submission-request-reader
 * 职责：独立回读第51项原待发请求，为第52项提供同一请求证明。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../../content-revision-reader'
import type {prepareSubmissionRequest} from './content-submission-preflight'

type Prepared=Awaited<ReturnType<typeof prepareSubmissionRequest>>
const scopeFields=[['projectId','projectId'],['id','attemptRef'],['requestKey','requestKey']] as const
const fields=['id','projectId','requestKey','requestDigest','requestPayload']
function valid(view:DataView){
 return view.dataTable?.modelBinding?.modelName==='SubmissionAttempt'&&view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&
  scopeFields.every(([field,ParamName])=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName}))
}

/** 查空保持未知；只有同键、同摘要、同原载荷才确认登记。 */
export async function readRegisteredSubmissionRequest(host:ContentRevisionReadHost,
 original:Pick<Prepared,'requestDigest'>&Pick<Prepared['record'],'projectId'|'attemptRef'|'requestKey'>){
 const {runtime,scenarioId,projectId}=host
 const {attemptRef,requestKey,requestDigest}=original
 host.assertCurrent()
 if(![scenarioId,attemptRef,requestKey].every(identity)||projectId!==original.projectId||!/^[a-f0-9]{64}$/u.test(requestDigest))
  throw Error('SUBMISSION_REQUEST_READ_SCOPE')
 const key=buildDataViewKey('SubmissionAttempt','originalRequest',scenarioId),view=runtime.resolveView(key)
 if(!view||!valid(view)||view.hasEditingChanges())throw Error('SUBMISSION_REQUEST_READ_VIEW')
 const context={projectId,attemptRef,requestKey}
 view.queryContext={...view.queryContext,...context}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid(view)||view.hasEditingChanges()||
   Object.entries(context).some(([field,value])=>view.queryContext[field]!==value))throw Error('SUBMISSION_REQUEST_READ_STALE')
 }
 await view.refresh()
 assertScope()
 if(view.countReported!==true||view.total!==view.rows.length||view.nextPageAvailable===true||view.rows.length>1)
  throw Error('SUBMISSION_REQUEST_READ_INCOMPLETE')
 const assertRead=view.captureReadResult(),row=view.rows[0]
 if(!row)return Object.freeze({state:'UNKNOWN' as const,assertCurrent:()=>{assertScope();assertRead()}})
 const assertRow=view.captureReadRow(row,fields)
 const assertCurrent=()=>{assertScope();assertRead();assertRow()}
 assertCurrent()
 if(row['id']!==attemptRef||row['projectId']!==projectId||row['requestKey']!==requestKey||row['requestDigest']!==requestDigest)
  throw Error('SUBMISSION_REQUEST_READ_CONFLICT')
 const payload=structuredClone(row['requestPayload'])
 if(!isRecord(payload)||payload['projectId']!==projectId||payload['attemptRef']!==attemptRef||payload['requestKey']!==requestKey)
  throw Error('SUBMISSION_REQUEST_READ_CONFLICT')
 const {enterpriseId,objectRef,channelId,priorAttemptRef}=payload
 if(!identity(enterpriseId)||!identity(objectRef)||!identity(channelId)||(priorAttemptRef!==null&&!identity(priorAttemptRef)))
  throw Error('SUBMISSION_REQUEST_READ_CONFLICT')
 const encoded=canonicalSnapshotValue(['spark-bid.submission-request/1',payload])
 if(await hashCanonicalSnapshotText(encoded)!==requestDigest)throw Error('SUBMISSION_REQUEST_READ_CONFLICT')
 assertCurrent()
 return Object.freeze({state:'REGISTERED' as const,...context,requestDigest,
  lotId:objectRef,subjectId:enterpriseId,channelId,priorAttemptRef,assertCurrent})
}
