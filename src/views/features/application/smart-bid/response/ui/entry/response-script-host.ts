/**
 * @module app:views/features/application/smart-bid/response/ui/entry/response-script-host
 * 职责：在同一页10运行实例提供报价、担保及固定事实读取。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {createApprovedPriceScriptHost} from './approved-price-script-host'
import {createBidSecurityScriptHost} from './bid-security-script-host'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readContentBaselineFactUse} from '../../../authoring/model/content-baseline-reader'
import {readRegisteredResponseAssignment} from '../../model/response-assignment-reader'

type Scope=Parameters<typeof createApprovedPriceScriptHost>[1]&Parameters<typeof createBidSecurityScriptHost>[1]
type Sources=Readonly<{
 readPriceEvidence:Parameters<typeof createApprovedPriceScriptHost>[2]
 readSecurityReceipts:Parameters<typeof createBidSecurityScriptHost>[2]
 assignmentBasis?:Readonly<{projectId:string;baselineId:string;assertCurrent:()=>void}>
 fixedFacts?:Readonly<{
  projectId:string
  basis:Omit<Parameters<typeof readContentBaselineFactUse>[1],'factId'|'version'|'purposeRef'|'useAt'>
  assertCurrent:()=>void
  readUse:Parameters<typeof readContentBaselineFactUse>[2]
 }>
}>

/** 页面传事实键；目标修订基线从正式宿主取得。 */
export function createBidResponseScriptHost<Runtime extends Pick<PageRuntime,'resolveView'|'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,scope:Scope,sources:Sources,
){
 const price=createApprovedPriceScriptHost(runtime,scope,sources.readPriceEvidence)
 const security=createBidSecurityScriptHost(runtime,scope,sources.readSecurityReceipts)
 return {runtime,assertCurrent:scope.assertCurrent,invoke(name:string,input:unknown,signal:AbortSignal){
  if(name==='bid.response.readSecurity')return security.invoke(name,input,signal)
  if(name==='bid.response.readAssignment'){
   const {assignmentBasis}=sources
   if(!assignmentBasis||!isRecord(input)||Object.keys(input).length!==1||!identity(input['assignmentId']))
    throw Error('BID_RESPONSE_ASSIGNMENT_REQUEST')
   const generation=runtime.generation
   const assertCurrent=()=>{
    scope.assertCurrent()
    assignmentBasis.assertCurrent()
    if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)
     throw Error('BID_RESPONSE_ASSIGNMENT_STALE')
   }
   return readRegisteredResponseAssignment({...assignmentBasis,runtime,scenarioId:scope.scenarioId,assertCurrent},input['assignmentId'])
  }
  if(name==='bid.response.readFixedFact'){
   const {fixedFacts}=sources
   if(!fixedFacts||!isRecord(input)||Object.keys(input).length!==1||!identity(input['factId']))
    throw Error('BID_RESPONSE_FACT_REQUEST')
   const generation=runtime.generation
   const assertCurrent=()=>{
    scope.assertCurrent()
    fixedFacts.assertCurrent()
    if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)
     throw Error('BID_RESPONSE_FACT_STALE')
   }
   return readContentBaselineFactUse({runtime,scenarioId:scope.scenarioId,projectId:fixedFacts.projectId,assertCurrent},
    {...fixedFacts.basis,factId:input['factId'],purposeRef:scope.purposeRef,useAt:scope.asOf},fixedFacts.readUse)
  }
  return price.invoke(name,input,signal)
 }}
}
