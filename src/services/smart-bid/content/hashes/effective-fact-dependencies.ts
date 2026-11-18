/**
 * @module app:services/smart-bid/content/hashes/effective-fact-dependencies
 * 职责：固定审核范围内实际使用的事实版本、依据引用及显示摘要。
 * 边界：输入须由原事实读取链提供；不认为原采纳等同现在可用。
 */
import {readBaselineFactMembers} from '../references/baseline/baseline-fact-members'
import {snapshotReferenceFields,snapshotReferenceIdentity,visitSnapshotReferences} from '../references/snapshot-reference-values'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../revision-snapshot-hash'

export const EFFECTIVE_FACT_FIELDS=['id','projectId','key','version','kind','value','unit','sourceIds','claimId','scopeRef',
 'decisionRefs','dependencyRefs','promiseTerms','sourceRecord','status'] as const

/** 事实记录必须精确对应固定基线；显示与采用依据分别纳入摘要。 */
export async function hashEffectiveFactDependencies(input:unknown){
 const error='EFFECTIVE_FACT_MODEL'
 const {projectId,factVersions,usedFactIds,records}=snapshotReferenceFields(input,['projectId','factVersions','usedFactIds','records'],error)
 if(!snapshotReferenceIdentity(projectId))throw Error(error)
 const versions=readBaselineFactMembers(factVersions),used=new Set<string>(),rows=new Map<string,Record<string,unknown>>()
 visitSnapshotReferences(usedFactIds,key=>{
  if(!snapshotReferenceIdentity(key)||!versions.has(key))throw Error('EFFECTIVE_FACT_SCOPE')
  used.add(key)
 },error)
 visitSnapshotReferences(records,item=>{
  const row=snapshotReferenceFields(item,EFFECTIVE_FACT_FIELDS,error),key=row['key']
  if(!snapshotReferenceIdentity(key)||!used.has(key)||row['projectId']!==projectId)throw Error('EFFECTIVE_FACT_SCOPE')
  if(!snapshotReferenceIdentity(row['id'])||!snapshotReferenceIdentity(row['kind'])||row['status']!=='ADOPTED')throw Error(error)
  if(versions.get(key)!==row['version'])throw Error('EFFECTIVE_FACT_VERSION')
  if(rows.has(key))throw Error('EFFECTIVE_FACT_DUPLICATE')
  rows.set(key,row)
 },error)
 if(rows.size!==used.size)throw Error('EFFECTIVE_FACT_MISSING')
 const ordered=[...rows].sort(([a],[b])=>a<b?-1:a>b?1:0)
 const dependencies=canonicalSnapshotValue(['spark-bid.fact-dependencies/1',projectId,ordered.map(([,row])=>row)])
 const displayJobs=ordered.map(async([factId,row])=>{
  const {value,unit,sourceIds,promiseTerms}=row
  const displayHash=await hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.fact-display/1',value,unit,sourceIds,promiseTerms]))
  return Object.freeze({factId,displayHash})
 })
 const [factDependencyHash,displayHashes]=await Promise.all([hashCanonicalSnapshotText(dependencies),Promise.all(displayJobs)])
 return Object.freeze({factDependencyHash,displayHashes:Object.freeze(displayHashes),requiresUseCheck:true})
}
