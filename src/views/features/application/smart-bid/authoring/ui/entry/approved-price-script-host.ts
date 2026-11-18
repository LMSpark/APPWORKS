/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/approved-price-script-host
 * 职责：页10按已核编制范围查指定批准价。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readRegisteredApprovedPrice} from '../../model/approved-price-reader'

type Scope=Omit<Parameters<typeof readRegisteredApprovedPrice>[0],'runtime'>&Readonly<{
 purposeRef:string;rateOnly:boolean
}>

/** 页面只指定批准号及版本，准用用途与费率路径由本轮已核依据确定。 */
export function createApprovedPriceScriptHost<Runtime extends Pick<PageRuntime,'resolveView'|'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,scope:Scope,readEvidence:Parameters<typeof readRegisteredApprovedPrice>[2],
){
 return {runtime,assertCurrent:scope.assertCurrent,invoke(name:string,input:unknown,signal:AbortSignal){
  if(name!=='bid.response.readApprovedPrice'||!isRecord(input)||Object.keys(input).length!==2)
   throw Error('BID_APPROVED_PRICE_PAGE_REQUEST')
  const {approvalRef,version}=input
  if(!identity(approvalRef)||!identity(version))throw Error('BID_APPROVED_PRICE_PAGE_REQUEST')
  const generation=runtime.generation
  const assertCurrent=()=>{
   scope.assertCurrent()
   if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)
    throw Error('BID_APPROVED_PRICE_PAGE_STALE')
  }
  const {purposeRef,rateOnly}=scope
  return readRegisteredApprovedPrice({...scope,runtime,assertCurrent},{approvalRef,version,purposeRef,rateOnly},readEvidence)
 }}
}
