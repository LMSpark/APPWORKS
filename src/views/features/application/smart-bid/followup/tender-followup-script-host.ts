/**
 * @module app:views/features/application/smart-bid/followup/tender-followup-script-host
 * 职责：页09以当前招标范围读取原通知时间线。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readRegisteredTenderFollowupNotices} from './tender-followup-notice-reader'
import {matchFollowupNoticeToDeadlinePackage,type reconcileDeadlineDelivery} from '../authoring/model/review/deadline/content-deadline-reconciliation'

type Read=Parameters<typeof readRegisteredTenderFollowupNotices>
type ReadDeadline=(scope:Read[1]&Readonly<{projectId:string;knownAt:string}>,signal:AbortSignal)=>
 Promise<ReturnType<typeof reconcileDeadlineDelivery>|null>

/** 固定本次调用的项目、标段、轮次、主体与阶段，页面只选择获知时点。 */
export function createTenderFollowupScriptHost<Runtime extends Pick<PageRuntime,'resolveView'|'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,host:Omit<Read[0],'runtime'>,options:Readonly<{selection:Read[1];readDeadline?:ReadDeadline}>){
 const {selection,readDeadline}=options
 const scope=Object.freeze({...selection})
 return {runtime,assertCurrent:host.assertCurrent,async invoke(name:string,input:unknown,signal:AbortSignal){
  if(name!=='tender.followup.readNotices'||!isRecord(input)||Object.keys(input).length!==1||!identity(input['knownAt']))
   throw Error('TENDER_FOLLOWUP_PAGE_REQUEST')
  const generation=runtime.generation
  const assertCurrent=()=>{
   host.assertCurrent()
   if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)
    throw Error('TENDER_FOLLOWUP_PAGE_STALE')
  }
  const knownAt=input['knownAt']
  const timeline=await readRegisteredTenderFollowupNotices({...host,runtime,assertCurrent},scope,knownAt)
  if(!readDeadline||!timeline.items.some(item=>item.event.originalObjectRef!==null))return timeline
  try{
   const delivery=await readDeadline(Object.freeze({...scope,projectId:host.projectId,knownAt}),signal)
   timeline.assertCurrent()
   if(delivery===null)return timeline
   const known=Date.parse(knownAt),deliveryKnown=Date.parse(delivery.knownAt),cutoff=Date.parse(delivery.cutoffAt)
   if(!Number.isFinite(deliveryKnown)||!Number.isFinite(cutoff)||deliveryKnown>known||cutoff>known)
    throw Error('TENDER_FOLLOWUP_DEADLINE_SCOPE')
   const items=timeline.items.map(item=>{
    const match=matchFollowupNoticeToDeadlinePackage({record:item.event,assertCurrent:timeline.assertCurrent},delivery)
    return Object.freeze({...item,originalPackage:match.original})
   })
   return Object.freeze({...timeline,items:Object.freeze(items),assertCurrent:()=>{
    timeline.assertCurrent();delivery.assertCurrent()
   }})
  }catch{
   timeline.assertCurrent()
   return Object.freeze({...timeline,packageEvidence:'UNVERIFIED' as const})
  }
 }}
}
