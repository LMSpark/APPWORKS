/**
 * @module app:views/features/application/smart-bid/collaboration/tasks/bid-findings-script-host
 * 职责：页15回查当前任务固定目标的原检查问题。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readFindingsForCompletedCoverage} from '../../authoring/model/review/content-review-findings-reader'
import {prepareRegisteredBidFindingRecheck,readBidFindingRecheckResult} from './bid-finding-recheck-reader'
import {prepareRegisteredBidFinding,readBidFindingRegistrationResult} from './bid-finding-registration-reader'

type Read=Parameters<typeof readFindingsForCompletedCoverage>
type Recheck=Parameters<typeof prepareRegisteredBidFindingRecheck>
type Registration=Parameters<typeof prepareRegisteredBidFinding>

/** 只消费当前任务已核的目标版本和覆盖，页面不提交另一个检查范围。 */
export function createBidFindingsScriptHost<Runtime extends Pick<PageRuntime,'resolveView'|'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,host:Omit<Read[0],'runtime'>,sources:Readonly<{
  readCoverage:(signal:AbortSignal)=>Promise<Read[1]>
  readRegistration?:(check:Parameters<Registration[2]>[0],signal:AbortSignal)=>ReturnType<Registration[2]>
  readRecheck?:(input:Readonly<{request:Recheck[1];finding:Parameters<Recheck[2]>[0]}>,signal:AbortSignal)=>ReturnType<Recheck[2]>
 }>){
 return {runtime,assertCurrent:host.assertCurrent,async invoke(name:string,input:unknown,signal:AbortSignal){
  if(!isRecord(input))throw Error('BID_FINDINGS_PAGE_REQUEST')
  const generation=runtime.generation
  const assertCurrent=()=>{
   host.assertCurrent()
   if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)throw Error('BID_FINDINGS_PAGE_STALE')
  }
  assertCurrent()
  if(name==='bid.tasks.readFindingRegistration'){
   const {checkRef,requestKey,requestDigest}=input
   if(Object.keys(input).length!==3||!identity(checkRef)||!identity(requestKey)||!identity(requestDigest))
    throw Error('BID_FINDINGS_PAGE_REQUEST')
   return readBidFindingRegistrationResult({...host,runtime,assertCurrent},{checkRef,requestKey,requestDigest})
  }
  if(name==='bid.tasks.prepareFindingRegistration'&&sources.readRegistration){
   const {checkRef,requestKey}=input
   if(Object.keys(input).length!==2||!identity(checkRef)||!identity(requestKey))throw Error('BID_FINDINGS_PAGE_REQUEST')
   const readRegistration=sources.readRegistration
   return prepareRegisteredBidFinding({...host,runtime,assertCurrent},{checkRef,requestKey},check=>readRegistration(check,signal))
  }
  if(name==='bid.tasks.readRecheckResult'){
   const {findingId,expectedFindingVersion,requestKey,requestDigest}=input
   if(Object.keys(input).length!==4||!identity(findingId)||!identity(expectedFindingVersion)||!identity(requestKey)||!identity(requestDigest))
    throw Error('BID_FINDINGS_PAGE_REQUEST')
   return readBidFindingRecheckResult({...host,runtime,assertCurrent},
    {projectId:host.projectId,findingId,expectedFindingVersion,requestKey,requestDigest})
  }
  if(name==='bid.tasks.prepareRecheck'&&sources.readRecheck){
   const {findingId,expectedFindingVersion,requestKey}=input
   if(Object.keys(input).length!==3||!identity(findingId)||!identity(expectedFindingVersion)||!identity(requestKey))
    throw Error('BID_FINDINGS_PAGE_REQUEST')
   const request=Object.freeze({projectId:host.projectId,findingId,expectedFindingVersion,requestKey})
   const readRecheck=sources.readRecheck
   return prepareRegisteredBidFindingRecheck({...host,runtime,assertCurrent},request,finding=>readRecheck({request,finding},signal))
  }
  if(name!=='bid.tasks.readFindings'||Object.keys(input).length!==0)throw Error('BID_FINDINGS_PAGE_REQUEST')
  const source=await sources.readCoverage(signal)
  assertCurrent()
  return readFindingsForCompletedCoverage({...host,runtime,assertCurrent},source)
 }}
}
