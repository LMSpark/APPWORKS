/** @module app:views/features/application/smart-bid/followup/tender-change-attempt-reader
 * 职责：核验调用方显式传入的 Agent 试次参数，供动作23逐次追查。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import type {ContentRevisionReadHost} from '../authoring/model/content-revision-reader'
import {captureTenderChangeCallEvidence} from './tender-change-call-reader'

const keys=['projectId','basisRevisionId'] as const
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value)
const error='TENDER_CHANGE_ATTEMPT_SCOPE'

/** 只接受显式 Agent 参数；运行结果不是 D3 GenerationRun 数据模型。 */
export function readTenderChangeAttempts(host:ContentRevisionReadHost,basisRevisionId:string,input:unknown,includeEvidence=false){
 const {scenarioId,projectId}=host
 const scope={projectId,basisRevisionId}
 host.assertCurrent()
 if(![scenarioId,projectId,basisRevisionId].every(identity)||!Array.isArray(input))throw Error(error)
 const seen=new Set<string>()
 const items=input.map(value=>{
  host.assertCurrent()
  if(!isRecord(value))throw Error(error)
  const row=value,proof=host.assertCurrent
  proof()
  const {runId,attemptRef,requestKey}=row
  if(keys.some(field=>row[field]!==scope[field])||!identity(runId)||!identity(attemptRef)||!identity(requestKey))throw Error(error)
  const id=JSON.stringify([runId,attemptRef,requestKey])
  if(seen.has(id))throw Error(error)
  seen.add(id)
  let evidence:ReturnType<typeof captureTenderChangeCallEvidence>|null=null
  if(includeEvidence){
   try{
    evidence=captureTenderChangeCallEvidence(row,required=>{
     void required
     return host.assertCurrent
    })
   }catch{
    proof()
    evidence=Object.freeze({state:'UNKNOWN' as const,assertCurrent:proof})
   }
  }
  const {targetDigest,configurationLockHash}=row
  const operationAttempt=digest(targetDigest)&&digest(configurationLockHash)?
   Object.freeze({projectId,runId,attemptRef,requestKey,targetDigest,configurationLockHash}):null
  return Object.freeze({runId,attemptRef,requestKey,evidence,operationAttempt})
 })
 const assertCurrent=host.assertCurrent
 assertCurrent()
 return Object.freeze({basisRevisionId,items:Object.freeze(items),assertCurrent})
}
