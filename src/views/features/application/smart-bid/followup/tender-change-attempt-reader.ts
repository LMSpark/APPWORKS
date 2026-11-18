/** @module app:views/features/application/smart-bid/followup/tender-change-attempt-reader
 * 职责：按原正文基版枚举有记录的工艺试次，供动作23逐次追查。
 */
import {buildDataViewKey,type ViewMetadata} from '@spark-appworks/spark-data'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../authoring/model/content-revision-reader'
import {originalRegistrationView} from '../authority/original-registration-view'
import {captureTenderChangeCallEvidence,tenderChangeCallFields} from './tender-change-call-reader'

const keys=['projectId','basisRevisionId'] as const
const fields=['runId','attemptRef','requestKey']
const model='GenerationRun',viewName='originalBasisAttempts'
const error='TENDER_CHANGE_ATTEMPT_SCOPE'

export function tenderChangeAttemptScenarioView(primaryKey:string):ViewMetadata{
 const view=originalRegistrationView(primaryKey,keys,[...fields,...tenderChangeCallFields])
 return {...view,queryConfig:{...view.queryConfig,pagination:'paged',allPages:true}}
}

/** 收齐所选正文基版的原调用目录，不以部分页推断追查完毕。 */
export async function readTenderChangeAttempts(host:ContentRevisionReadHost,basisRevisionId:string,includeEvidence=false){
 const {scenarioId,projectId,runtime}=host
 const scope={projectId,basisRevisionId}
 host.assertCurrent()
 if(![scenarioId,projectId,basisRevisionId].every(identity))throw Error(error)
 const key=buildDataViewKey(model,viewName,scenarioId),view=runtime.resolveView(key)
 const valid=()=>view?.dataTable?.modelBinding?.modelName===model&&view.commitMode==='staged'&&
  view.queryConfig.autoQuery===false&&view.queryConfig.allPages===true&&
  keys.every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))
 if(!view||!valid()||view.hasEditingChanges())throw Error(error)
 view.queryContext={...view.queryContext,...scope}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid()||view.loadingError||view.hasEditingChanges()||
   keys.some(field=>view.queryContext[field]!==scope[field]))throw Error(error)
 }
 await view.refresh()
 assertScope()
 if(view.countReported!==true||view.nextPageAvailable===true||view.total!==view.rows.length)
  throw Error('TENDER_CHANGE_ATTEMPT_INCOMPLETE')
 const assertRead=view.captureReadResult(),seen=new Set<string>(),proofs:Array<()=>void>=[]
 const items=view.rows.map(row=>{
  const proof=view.captureReadRow(row,[...keys,...fields])
  proof()
  const {runId,attemptRef,requestKey}=row
  if(keys.some(field=>row[field]!==scope[field])||!identity(runId)||!identity(attemptRef)||!identity(requestKey))throw Error(error)
  const id=JSON.stringify([runId,attemptRef,requestKey])
  if(seen.has(id))throw Error(error)
  seen.add(id)
  proofs.push(proof)
  let evidence:ReturnType<typeof captureTenderChangeCallEvidence>|null=null
  if(includeEvidence){
   try{
    evidence=captureTenderChangeCallEvidence(row,required=>view.captureReadRow(row,[...keys,...fields,...required]))
   }catch{
    proof()
    evidence=Object.freeze({state:'UNKNOWN' as const,assertCurrent:proof})
   }
  }
  if(evidence)proofs.push(evidence.assertCurrent)
  return Object.freeze({runId,attemptRef,requestKey,evidence})
 })
 const assertCurrent=()=>{assertScope();assertRead();for(const proof of proofs)proof()}
 assertCurrent()
 return Object.freeze({basisRevisionId,items:Object.freeze(items),assertCurrent})
}
