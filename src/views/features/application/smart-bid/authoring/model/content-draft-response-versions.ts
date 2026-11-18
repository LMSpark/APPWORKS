/** @module app:views/features/application/smart-bid/authoring/model/content-draft-response-versions
 * 职责：一次精确读取草稿引用的新独立答复版本及其事实占位。
 */
import {buildDataViewKey,type ViewMetadata} from '@spark-appworks/spark-data'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {assertRevisionResponseText,readIndependentResponseFactOccurrences} from '@/services/smart-bid/content/references/revision-response-text'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {originalRegistrationView} from '../../authority/original-registration-view'
import {hasContentScopeCondition,type ContentRevisionReadHost} from './content-revision-reader'

const model='Response',viewName='selectedDraftResponseVersions'
const fields=['id','projectId','assignmentId','lineageId','version','revisionId','statement','data']
const optional=['chapterId','anchorNodeId']
const error='CONTENT_DRAFT_RESPONSE_VERSION'
type Selection=Readonly<{responseId:string;assignmentId:string;lineageId:string;version:string}>

export function draftResponseVersionsScenarioView(primaryKey:string):ViewMetadata{
 const view=originalRegistrationView(primaryKey,['projectId'],[...fields,...optional])
 return {...view,queryConfig:{...view.queryConfig,pagination:'paged',allPages:true}}
}

/** 保留整个原查询的逐行证明；当前准用和答复核定由各自责任域继续给证。 */
export async function readDraftResponseVersions(host:ContentRevisionReadHost,selection:readonly Selection[],nodeIds:readonly string[]){
 const {projectId,scenarioId,runtime}=host
 host.assertCurrent()
 const wanted=new Map(selection.map(item=>[item.responseId,{...item}]))
 if(!identity(projectId)||!identity(scenarioId)||wanted.size!==selection.length||selection.some(item=>
  ![item.responseId,item.assignmentId,item.lineageId,item.version].every(identity)))throw Error(error)
 if(!wanted.size)return Object.freeze({versions:[],factIds:[],assertCurrent:host.assertCurrent})
 const key=buildDataViewKey(model,viewName,scenarioId),view=runtime.resolveView(key)
 const valid=()=>view?.dataTable?.modelBinding?.modelName===model&&view.commitMode==='staged'&&
  view.queryConfig.autoQuery===false&&view.queryConfig.allPages===true&&
  hasContentScopeCondition(view,'projectId',{Type:'GetInputParam',ParamName:'projectId'})
 if(!view||!valid()||view.hasEditingChanges())throw Error(error)
 view.queryContext={...view.queryContext,projectId}
 view.queryConfig={...view.queryConfig,maxRows:wanted.size+1}
 view.filterExpression={field:'id',operator:'in',value:[...wanted.keys()]}
 const filter=JSON.stringify(view.filterExpression)
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid()||view.loadingError||view.hasEditingChanges()||
   view.queryContext['projectId']!==projectId||view.queryConfig.maxRows!==wanted.size+1||
   JSON.stringify(view.filterExpression)!==filter)throw Error(error)
 }
 await view.refresh()
 assertScope()
 if(view.countReported!==true||view.total!==wanted.size||view.rows.length!==wanted.size||view.nextPageAvailable===true)throw Error(error)
 const resultProof=view.captureReadResult(),rowProofs:Array<()=>void>=[],seen=new Set<string>()
 const responses=view.rows.map(row=>{
  if(optional.some(field=>view.fieldAccess(row,field).read!=='visible'))throw Error(error)
  const proof=view.captureReadRow(row,[...fields,...optional.filter(field=>Object.hasOwn(row,field))])
  proof()
  const {id,assignmentId,lineageId,version,revisionId,statement,data,chapterId,anchorNodeId}=row
  const matched=identity(id)?wanted.get(id):undefined
  if(!identity(id)||!matched||seen.has(id)||row['projectId']!==projectId||matched.assignmentId!==assignmentId||
   matched.lineageId!==lineageId||matched.version!==version||!identity(revisionId)||typeof statement!=='string'||
   chapterId!==null&&chapterId!==undefined||anchorNodeId!==null&&anchorNodeId!==undefined)throw Error(error)
  seen.add(id)
  rowProofs.push(proof)
  return {id,assignmentId:matched.assignmentId,lineageId:matched.lineageId,version:matched.version,revisionId,statement,data}
 })
 assertRevisionResponseText(responses,nodeIds)
 const factIds=[...new Set(readIndependentResponseFactOccurrences(responses,selection).map(item=>item.factId))].sort()
 const versions=await Promise.all(responses.map(async response=>Object.freeze({responseId:response.id,
  assignmentId:response.assignmentId,payloadHash:await hashCanonicalSnapshotText(canonicalSnapshotValue(response))})))
 versions.sort((left,right)=>left.responseId<right.responseId?-1:left.responseId>right.responseId?1:0)
 const assertCurrent=()=>{assertScope();resultProof();for(const proof of rowProofs)proof()}
 assertCurrent()
 return Object.freeze({versions:Object.freeze(versions),factIds:Object.freeze(factIds),assertCurrent})
}
