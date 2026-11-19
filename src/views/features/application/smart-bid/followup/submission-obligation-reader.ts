/** @module app:views/features/application/smart-bid/followup/submission-obligation-reader
 * 职责：从已选依据基线读取原递交事项，供页09及分册策划使用。
 */
import {buildDataViewKey,type ViewMetadata} from '@spark-appworks/spark-data'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../authoring/model/content-revision-reader'
import {originalRegistrationView} from '../authority/original-registration-view'

const model='SubmissionObligation',viewName='originalBaselineObligations'
const keys=['projectId','baselineId'] as const
const fields=['obligationRef','sourceRef','kind','required','allowedDisclosureRefs']
const error='BID_SUBMISSION_OBLIGATION_SCOPE'

export function submissionObligationScenarioView(primaryKey:string):ViewMetadata{
 const view=originalRegistrationView(primaryKey,keys,fields)
 return {...view,queryConfig:{...view.queryConfig,pagination:'paged',allPages:true}}
}

/** 保留固定来源、独立落点和披露范围，空结果只描述本次查询。 */
export async function readBaselineSubmissionObligations(host:ContentRevisionReadHost,baselineId:string){
 const {scenarioId,projectId,runtime}=host
 const scope={projectId,baselineId}
 host.assertCurrent()
 if(![scenarioId,projectId,baselineId].every(identity))throw Error(error)
 const key=buildDataViewKey(model,viewName,scenarioId),view=runtime.resolveView(key)
 const valid=()=>view?.dataTable?.modelBinding?.modelName===model&&view.commitMode==='staged'&&
  view.queryConfig.autoQuery===false&&view.queryConfig.allPages===true&&
  (view.queryConfig.cacheType===undefined||view.queryConfig.cacheType==='none')&&
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
  throw Error('BID_SUBMISSION_OBLIGATION_INCOMPLETE')
 const assertRead=view.captureReadResult(),seen=new Set<string>(),proofs:Array<()=>void>=[]
 const obligations=view.rows.map(row=>{
  const proof=view.captureReadRow(row,[...keys,...fields])
  proof()
  const {obligationRef,sourceRef,kind,required,allowedDisclosureRefs}=row
  if(keys.some(field=>row[field]!==scope[field])||!identity(obligationRef)||seen.has(obligationRef)||!identity(sourceRef)||
   (kind!=='DOCUMENT'&&kind!=='INDEPENDENT')||typeof required!=='boolean'||!Array.isArray(allowedDisclosureRefs)||
   !allowedDisclosureRefs.every(identity)||new Set(allowedDisclosureRefs).size!==allowedDisclosureRefs.length)throw Error(error)
  seen.add(obligationRef)
  proofs.push(proof)
  return Object.freeze({obligationRef,sourceRef,kind,required,allowedDisclosureRefs:Object.freeze([...allowedDisclosureRefs])})
 })
 const assertCurrent=()=>{assertScope();assertRead();for(const proof of proofs)proof()}
 assertCurrent()
 return Object.freeze({...scope,obligations:Object.freeze(obligations),assertCurrent})
}
