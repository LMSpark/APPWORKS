/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/bid-security-script-host
 * 职责：在页10可信编制范围及观察时点核担保。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readRegisteredBidSecurity} from '../../model/bid-security-reader'

type Scope=Omit<Parameters<typeof readRegisteredBidSecurity>[0],'runtime'>&Readonly<{asOf:number}>

/** 页面只传担保要求版本及承担方；实际范围由编制宿主给定。 */
export function createBidSecurityScriptHost<Runtime extends Pick<PageRuntime,'resolveView'|'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,scope:Scope,readReceipts:Parameters<typeof readRegisteredBidSecurity>[2],
){
 return {runtime,assertCurrent:scope.assertCurrent,invoke(name:string,input:unknown,signal:AbortSignal){
  if(name!=='bid.response.readSecurity'||!isRecord(input)||Object.keys(input).length!==2)
   throw Error('BID_SECURITY_PAGE_REQUEST')
  const {requirementVersion,liablePartyRef}=input
  if(!identity(requirementVersion)||!identity(liablePartyRef))throw Error('BID_SECURITY_PAGE_REQUEST')
  const generation=runtime.generation
  const assertCurrent=()=>{
   scope.assertCurrent()
   if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)
    throw Error('BID_SECURITY_PAGE_STALE')
  }
  return readRegisteredBidSecurity({...scope,runtime,assertCurrent},{requirementVersion,liablePartyRef,asOf:scope.asOf},readReceipts)
 }}
}
