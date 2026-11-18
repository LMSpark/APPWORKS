/**
 * @module app:views/features/application/smart-bid/authoring/model/operation/content-operation-frozen-reader
 * 职责：冷回读冻结输入摘要，供页18核验原试次。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../content-revision-reader'
import type {recoverRegisteredOperationRouteAttempt} from './content-operation-result-reader'

type Manifest=Parameters<typeof recoverRegisteredOperationRouteAttempt>[1]
const keys=['projectId','runId','attemptRef','requestKey'] as const
const fields=[...keys,'targetDigest','configurationLockHash','guideRef','guideVersionRef','guideDigest','usable','inputDigest']
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value)
const valid=(view:DataView)=>view.dataTable?.modelBinding?.modelName==='ContextManifest'&&
 view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&
 keys.every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))

/** 只读原待发摘要；不恢复发起能力，也不读取待发载荷。 */
export async function readRegisteredFrozenOperationContext(host:ContentRevisionReadHost,input:Manifest['scope']):Promise<Manifest|undefined>{
 const {runtime,scenarioId,projectId}=host
 host.assertCurrent()
 const scope=Object.freeze({...input})
 const context={projectId,runId:scope.runId,attemptRef:scope.attemptRef,requestKey:scope.requestKey}
 if(![scenarioId,...Object.values(context)].every(identity)||scope.projectId!==projectId||
  !digest(scope.targetDigest)||!digest(scope.configurationLockHash))throw Error('OPERATION_FROZEN_READ_SCOPE')
 const key=buildDataViewKey('ContextManifest','originalFrozen',scenarioId),view=runtime.resolveView(key)
 if(!view||!valid(view)||view.hasEditingChanges())throw Error('OPERATION_FROZEN_VIEW_REQUIRED')
 view.queryContext={...view.queryContext,...context}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid(view)||view.hasEditingChanges()||view.loadingError||
   keys.some(field=>view.queryContext[field]!==context[field]))throw Error('OPERATION_FROZEN_READ_STALE')
 }
 await view.refresh()
 assertScope()
 if(view.countReported!==true||view.total!==view.rows.length||view.nextPageAvailable===true||view.rows.length>1)
  throw Error('OPERATION_FROZEN_READ_INCOMPLETE')
 const assertRead=view.captureReadResult(),row=view.rows[0]
 if(!row)return undefined
 const assertRow=view.captureReadRow(row,fields)
 const assertCurrent=()=>{assertScope();assertRead();assertRow()}
 const {guideRef,guideVersionRef,guideDigest,usable,inputDigest}=row
 if(Object.entries(scope).some(([field,value])=>row[field]!==value)||!identity(guideRef)||!identity(guideVersionRef)||!digest(guideDigest)||
  typeof usable!=='boolean'||(usable?!digest(inputDigest):inputDigest!==null))throw Error('OPERATION_FROZEN_READ_SCOPE')
 assertCurrent()
 return Object.freeze({scope,guideRef,guideVersionRef,guideDigest,usable,inputDigest:usable&&digest(inputDigest)?inputDigest:null,assertCurrent})
}
