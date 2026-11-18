/**
 * @module app:views/features/application/smart-bid/authoring/model/hashes/effective-fact-reader
 * 职责：一次查询同范围实际使用的固定事实版本并生成原依赖摘要。
 * 边界：不抓取全项目事实，不核本次用途，不写入。
 */
import {buildDataViewKey,type DataView,type DataViewFilterTree} from '@spark-appworks/spark-data'
import {EFFECTIVE_FACT_FIELDS,hashEffectiveFactDependencies} from '@/services/smart-bid/content/hashes/effective-fact-dependencies'
import {readBaselineFactMembers} from '@/services/smart-bid/content/references/baseline/baseline-fact-members'
import {snapshotReferenceIdentity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readContentBaselineFactIndex} from '../content-baseline-reader'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../content-revision-reader'

function validScope(view:DataView):boolean{
 return view.dataTable?.modelBinding?.modelName==='FactVersion'&&view.commitMode==='staged'&&
  view.queryConfig.allPages===true&&view.queryConfig.pagination==='paged'&&view.queryConfig.autoQuery===false&&
  hasContentScopeCondition(view,'projectId',{Type:'GetInputParam',ParamName:'projectId'})
}

/** 查精确 key/version 对，保留本批每行的原读取证明。 */
export async function readEffectiveFactDependencies(host:ContentRevisionReadHost,input:Readonly<{
 baselineId:string;stageRef:unknown;usedFactIds:readonly string[]
}>){
 if(!input.usedFactIds.every(snapshotReferenceIdentity))throw Error('EFFECTIVE_FACT_SCOPE')
 const baseline=await readContentBaselineFactIndex(host,{baselineId:input.baselineId,stageRef:input.stageRef,role:'candidate'})
 baseline.assertCurrent()
 const factVersions=host.runtime.resolveView(baseline.dataViewKey)?.rows[0]?.['factVersions']
 return readEffectiveFactsFromBaseline(host,input.usedFactIds,{factVersions,assertCurrent:baseline.assertCurrent})
}

/** 复用本次审核已对证的原基线，不覆写其读取代次。 */
export async function readEffectiveFactsFromBaseline(host:ContentRevisionReadHost,factIds:readonly string[],
 baseline:Readonly<{factVersions:unknown;assertCurrent:()=>void}>){
 const {runtime,scenarioId,projectId}=host,usedFactIds=[...new Set(factIds)],{factVersions}=baseline
 const assertBaseline=()=>{host.assertCurrent();baseline.assertCurrent()}
 assertBaseline()
 if(!usedFactIds.every(snapshotReferenceIdentity))throw Error('EFFECTIVE_FACT_SCOPE')
 if(!usedFactIds.length){
  const result=await hashEffectiveFactDependencies({projectId,factVersions,usedFactIds,records:[]})
  assertBaseline()
  return Object.freeze({...result,assertCurrent:assertBaseline})
 }
 const versions=readBaselineFactMembers(factVersions),filter:DataViewFilterTree={logic:'or',filters:usedFactIds.map(key=>{
  const version=versions.get(key)
  if(version===undefined)throw Error('EFFECTIVE_FACT_SCOPE')
  return {logic:'and',filters:[{field:'key',operator:'eq',value:key},{field:'version',operator:'eq',value:version}]}
 })}
 const key=buildDataViewKey('FactVersion','effectiveFactVersions',scenarioId),view=runtime.resolveView(key)
 if(!view||!validScope(view)||view.hasEditingChanges())throw Error('EFFECTIVE_FACT_VIEW_REQUIRED')
 view.queryContext={...view.queryContext,projectId}
 view.queryConfig={...view.queryConfig,maxRows:usedFactIds.length+1}
 view.filterExpression=filter
 const scopeSignature=JSON.stringify(view.filterExpression)
 const assertScope=()=>{
  assertBaseline()
  if(runtime.resolveView(key)!==view||!validScope(view)||view.hasEditingChanges()||view.queryContext['projectId']!==projectId||
   JSON.stringify(view.filterExpression)!==scopeSignature||view.queryConfig.maxRows!==usedFactIds.length+1)throw Error('EFFECTIVE_FACT_VIEW_STALE')
 }
 await view.refresh();assertScope()
 const assertResult=view.captureReadResult()
 if(view.countReported!==true||view.total!==usedFactIds.length||view.rows.length!==usedFactIds.length||view.nextPageAvailable===true)
  throw Error('EFFECTIVE_FACT_RESULT_INCOMPLETE')
 const proofs=view.rows.map(row=>view.captureReadRow(row,EFFECTIVE_FACT_FIELDS))
 const records=view.rows.map(row=>Object.fromEntries(EFFECTIVE_FACT_FIELDS.map(field=>[field,row[field]])))
 const assertCurrent=()=>{assertScope();assertResult();proofs.forEach(proof=>proof())}
 const result=await hashEffectiveFactDependencies({projectId,factVersions,usedFactIds,records})
 assertCurrent()
 return Object.freeze({...result,assertCurrent})
}
