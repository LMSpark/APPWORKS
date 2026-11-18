/**
 * @module app:views/features/application/smart-bid/collaboration/handoff/bid-handoff-script-host
 * 职责：页08按当前项目与轮次回查原移交清单及原任务签收。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {compareBidHandoffVersions} from '@/services/smart-bid/content/review/submission/bid-handoff-evidence'
import {readRegisteredBidHandoff} from './bid-handoff-reader'

type Read=Parameters<typeof readRegisteredBidHandoff>
type ReadReceipts=(scope:Parameters<Read[2]>[0],items:Parameters<Read[2]>[1],signal:AbortSignal,role:'current'|'previous')=>ReturnType<Read[2]>

/** 页面仅提交待查询的移交编号，轮次和签收读取来自当前调用。 */
export function createBidHandoffScriptHost<Runtime extends Pick<PageRuntime,'resolveView'|'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,host:Omit<Read[0],'runtime'>,options:Readonly<{selection:Omit<Read[1],'handoffId'>;readReceipts:ReadReceipts}>){
 const {selection,readReceipts}=options
 const scope=Object.freeze({...selection})
 return {runtime,assertCurrent:host.assertCurrent,async invoke(name:string,input:unknown,signal:AbortSignal){
  const error='BID_HANDOFF_PAGE_REQUEST'
  if(!isRecord(input)||!identity(input['handoffId']))throw Error(error)
  const {handoffId,previousHandoffId}=input
  const compare=name==='bid.handoff.compareVersions'
  if(compare?Object.keys(input).length!==2||!identity(previousHandoffId)||previousHandoffId===handoffId:
   name!=='bid.handoff.readOriginal'||Object.keys(input).length!==1)throw Error(error)
  const generation=runtime.generation
  const assertCurrent=()=>{
   host.assertCurrent()
   if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)throw Error('BID_HANDOFF_PAGE_STALE')
  }
  const read=(id:string,role:'current'|'previous')=>readRegisteredBidHandoff({...host,runtime,assertCurrent},
   {...scope,handoffId:id},(selected,items)=>readReceipts(selected,items,signal,role),role)
  const current=await read(handoffId,'current')
  if(!compare||!identity(previousHandoffId))return current
  const previous=await read(previousHandoffId,'previous')
  return compareBidHandoffVersions(previous,current)
 }}
}
