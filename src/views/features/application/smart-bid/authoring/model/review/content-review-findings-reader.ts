/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-review-findings-reader
 * 职责：批读固定目标及检查器版本的原 CheckFinding 记录。
 * 边界：零问题只证明查询结果为零；已完成检查及用途许可仍由独立原记录证明。
 */
import {buildDataViewKey,type DataViewFilterTree} from '@spark-appworks/spark-data'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../content-revision-reader'

type FindingSelection=Readonly<{targetHash:string;checkerHash:string}>
const fields=['id','projectId','targetHash','checkerHash','anchor','code','severity','status','message']
const isDigest=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value)
const key=(targetHash:unknown,checkerHash:unknown)=>JSON.stringify([targetHash,checkerHash])

export async function readContentReviewFindings(host:ContentRevisionReadHost,selections:readonly FindingSelection[]){
 const {runtime,scenarioId,projectId,assertCurrent:assertHost}=host
 assertHost()
 if(!identity(scenarioId)||!identity(projectId)||selections.some(item=>!isDigest(item.targetHash)||!isDigest(item.checkerHash)))
  throw Error('CONTENT_REVIEW_FINDINGS_SCOPE')
 const pairs=new Map(selections.map(item=>[key(item.targetHash,item.checkerHash),item]))
 if(!pairs.size)return Object.freeze({records:Object.freeze([]),assertCurrent:assertHost})
 const dataViewKey=buildDataViewKey('CheckFinding','selectedReviewFindings',scenarioId),view=runtime.resolveView(dataViewKey)
 const valid=()=>view?.dataTable?.modelBinding?.modelName==='CheckFinding'&&view.commitMode==='staged'&&
  view.queryConfig.autoQuery===false&&view.queryConfig.allPages===true&&view.queryConfig.pagination==='paged'&&
  hasContentScopeCondition(view,'projectId',{Type:'GetInputParam',ParamName:'projectId'})
 if(!view||!valid()||view.hasEditingChanges())throw Error('CONTENT_REVIEW_FINDINGS_VIEW_REQUIRED')
 const filter:DataViewFilterTree={logic:'or',filters:[...pairs.values()].map(({targetHash,checkerHash})=>({logic:'and',filters:[
  {field:'targetHash',operator:'eq',value:targetHash},{field:'checkerHash',operator:'eq',value:checkerHash},
 ]}))}
 view.queryContext={...view.queryContext,projectId};view.filterExpression=filter
 const signature=JSON.stringify(view.filterExpression)
 const assertScope=()=>{
  assertHost()
  if(!valid()||runtime.resolveView(dataViewKey)!==view||view.hasEditingChanges()||view.queryContext['projectId']!==projectId||
   JSON.stringify(view.filterExpression)!==signature)throw Error('CONTENT_REVIEW_FINDINGS_STALE')
 }
 await view.refresh();assertScope()
 const assertResult=view.captureReadResult()
 if(view.countReported!==true||view.total!==view.rows.length||view.nextPageAvailable===true)throw Error('CONTENT_REVIEW_FINDINGS_INCOMPLETE')
 const seen=new Set<string>(),proofs:Array<()=>void>=[]
 const records=view.rows.map(row=>{
  const {id,targetHash,checkerHash}=row
  if(row['projectId']!==projectId||!identity(id)||seen.has(id)||!pairs.has(key(targetHash,checkerHash)))
   throw Error('CONTENT_REVIEW_FINDINGS_SCOPE')
  seen.add(id);proofs.push(view.captureReadRow(row,fields))
  return Object.freeze(Object.fromEntries(fields.map(field=>[field,row[field]])))
 })
 const assertCurrent=()=>{assertScope();assertResult();for(const proof of proofs)proof()}
 assertCurrent()
 return Object.freeze({records:Object.freeze(records),assertCurrent})
}
