/**
 * @module app:views/features/application/smart-bid/authoring/model/operation/content-operation-rework-reader
 * 职责：页18从原试次的返工证据视图准备第07项交接。
 * 边界：读取原试次证据供返工判断，责任域继续办理后续动作。
 * AI用途：定位工艺返工前需要读取哪些原调用证明。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {prepareOperationStepRework} from '@/services/smart-bid/operation/rework/operation-step-rework'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionReadHost} from '../content-revision-reader'

const keys=['projectId','runId','attemptRef','requestKey'] as const
const evidence=[...keys,'targetDigest','configurationLockHash','inputRef','returnRef','calls','findings','priorResults']
const isReworkView=(view:DataView)=>view.dataTable?.modelBinding?.modelName==='GenerationRun'&&
 view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&
 keys.every(key=>hasContentScopeCondition(view,key,{Type:'GetInputParam',ParamName:key}))
type Source=Parameters<typeof prepareOperationStepRework>[0]

function isChoice<T extends string>(value:unknown,choices:readonly T[]):value is T{
 return choices.some(choice=>choice===value)
}

function records(value:unknown){
 if(!Array.isArray(value)||!value.every(isRecord))throw Error('OPERATION_REWORK_READ_EVIDENCE')
 return value
}

/** 正式证据包含有序逐笔调用、影响依据和可沿用依据，仅准备交接。 */
export async function prepareRegisteredOperationStepRework(host:ContentRevisionReadHost,selection:Readonly<{
 runId:string;attemptRef:string;requestKey:string;targetDigest:string;configurationLockHash:string;reason:string
}>){
 const {runtime,scenarioId,projectId}=host,{runId,attemptRef,requestKey,targetDigest,configurationLockHash,reason}=selection
 const context={projectId,runId,attemptRef,requestKey}
 host.assertCurrent()
 if(![scenarioId,...Object.values(context)].every(identity)||!reason.trim()||
  ![targetDigest,configurationLockHash].every(value=>/^[a-f0-9]{64}$/u.test(value)))throw Error('OPERATION_REWORK_READ_SCOPE')
 const key=buildDataViewKey('GenerationRun','originalReworkEvidence',scenarioId),view=runtime.resolveView(key)
 if(!view||!isReworkView(view)||view.hasEditingChanges())throw Error('OPERATION_REWORK_VIEW_REQUIRED')
 view.queryContext={...view.queryContext,...context}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!isReworkView(view)||view.loadingError||view.hasEditingChanges()||
   keys.some(field=>view.queryContext[field]!==context[field]))throw Error('OPERATION_REWORK_READ_STALE')
 }
 await view.refresh()
 assertScope()
 const row=view.rows[0]
 if(!row||!hasCompleteSingleContentResult(view)||keys.some(field=>row[field]!==context[field]))
  throw Error('OPERATION_REWORK_READ_SCOPE')
 const assertResult=view.captureReadResult(),assertRow=view.captureReadRow(row,evidence)
 if(row['targetDigest']!==targetDigest||row['configurationLockHash']!==configurationLockHash)throw Error('OPERATION_REWORK_READ_SCOPE')
 const assertCurrent=()=>{assertScope();assertResult();assertRow()}
 const {inputRef:attemptInputRef,returnRef:attemptReturnRef}=row
 if(!identity(attemptInputRef)||(attemptReturnRef!==null&&!identity(attemptReturnRef)))throw Error('OPERATION_REWORK_READ_EVIDENCE')
 const calls=records(row['calls']).map(({callRef,ownerRef,effect,state,inputRef,returnRef}):Source['calls'][number]=>{
  if(!identity(callRef)||!identity(ownerRef)||!isChoice(effect,['COMPUTE','SIGN','SUBMIT','WITHDRAW','OTHER_EXTERNAL'])||
   !isChoice(state,['NOT_STARTED','COMPLETE','PARTIAL','UNKNOWN'])||(inputRef!==null&&!identity(inputRef))||
   (returnRef!==null&&!identity(returnRef)))throw Error('OPERATION_REWORK_READ_EVIDENCE')
  return {callRef,ownerRef,effect,state,inputRef,returnRef,assertCurrent}
 })
 const findings=records(row['findings']).map(({cause,callRef,evidenceRef,affectedRefs}):Source['findings'][number]=>{
  if(!identity(callRef)||!identity(evidenceRef)||!Array.isArray(affectedRefs)||!affectedRefs.every(identity)||
   !isChoice(cause,['DIRECTORY','BINDING','INPUT','RECOMPUTE','ACTUAL_INPUT_MISSING','EVIDENCE_ONLY',
    'MODEL_DEFECT','BUSINESS_CONDITION','UNKNOWN_IMPACT']))throw Error('OPERATION_REWORK_READ_EVIDENCE')
  return {cause,callRef,evidenceRef,affectedRefs,assertCurrent}
 })
 const priorResults=records(row['priorResults']).map(({resultRef,applicabilityRef})=>{
  if(!identity(resultRef)||!identity(applicabilityRef))throw Error('OPERATION_REWORK_READ_EVIDENCE')
  return {resultRef,applicabilityRef,assertCurrent}
 })
 const rework=prepareOperationStepRework({...context,reason,inputRef:attemptInputRef,returnRef:attemptReturnRef,
  calls,findings,priorResults,assertCurrent})
 return Object.freeze({...rework,requestKey,targetDigest,configurationLockHash})
}
