/**
 * @module app:views/features/application/smart-bid/authority/resource-allocation-script-host
 * 职责：页07在正式占用快照上核指定项目的时段和份额。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {checkResourceAllocationConflict} from '@/services/smart-bid/content/references/resource-use/resource-allocation-conflict'

import {checkResourceAllocationRelease} from '@/services/smart-bid/content/references/resource-use/resource-allocation-release'

type Allocation=Parameters<typeof checkResourceAllocationConflict>[0]
type Selection=Readonly<{enterpriseId:string;projectId:string;resourceVersionId:string;requestRef:string}>
type Snapshot=Selection&Allocation&Readonly<{complete:boolean}>
type Release=Parameters<typeof checkResourceAllocationRelease>[0]
type ReleaseReader=(allocation:Release['allocation'],signal:AbortSignal)=>Promise<Release&Readonly<{complete:boolean}>>

/** 查询所需的当前企业从宿主绑定取得，申请引用只用于定位原记录。 */
export function createResourceAllocationScriptHost<Runtime extends Pick<PageRuntime,'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,
 scope:Pick<Selection,'enterpriseId'|'projectId'>&Readonly<{assertCurrent:()=>void}>,
 readSnapshot:(selection:Selection,signal:AbortSignal)=>Promise<Snapshot>,
 readRelease?:ReleaseReader,
){
 return {runtime,assertCurrent:scope.assertCurrent,async invoke(name:string,input:unknown,signal:AbortSignal){
  const error='BID_RESOURCE_ALLOCATION_PAGE_SCOPE'
  if(!isRecord(input)||!identity(scope.enterpriseId)||!identity(scope.projectId))throw Error(error)
  const generation=runtime.generation
  const assertCurrent=()=>{
   scope.assertCurrent()
   if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)
    throw Error('BID_RESOURCE_ALLOCATION_PAGE_STALE')
  }
  assertCurrent()
  if(name==='bid.resources.checkRelease'&&readRelease){
   if(Object.keys(input).length!==1||!identity(input['allocationRef']))throw Error(error)
   const allocation=Object.freeze({enterpriseId:scope.enterpriseId,projectId:scope.projectId,allocationRef:input['allocationRef']})
   const original=await readRelease(allocation,signal)
   const assertRelease=()=>{
    assertCurrent()
    original.assertCurrent()
    for(const item of original.evidence)item.assertCurrent()
   }
   assertRelease()
   if((['enterpriseId','projectId','allocationRef'] as const).some(field=>original.allocation[field]!==allocation[field]))throw Error(error)
   if(original.complete!==true)return Object.freeze({state:'PENDING' as const,assertCurrent:assertRelease})
   return Object.freeze({...checkResourceAllocationRelease({...original,assertCurrent:assertRelease}),assertCurrent:assertRelease})
  }
  if(name!=='bid.resources.checkAllocation'||Object.keys(input).length!==2||
   !identity(input['resourceVersionId'])||!identity(input['requestRef']))throw Error(error)
  const selection={enterpriseId:scope.enterpriseId,projectId:scope.projectId,
   resourceVersionId:input['resourceVersionId'],requestRef:input['requestRef']}
  const snapshot=await readSnapshot(Object.freeze(selection),signal)
  const assertSnapshot=()=>{assertCurrent();snapshot.assertCurrent()}
  assertSnapshot()
  if((['enterpriseId','projectId','resourceVersionId','requestRef'] as const).some(field=>snapshot[field]!==selection[field]))throw Error(error)
  if(snapshot.complete!==true)return Object.freeze({state:'PENDING' as const,assertCurrent:assertSnapshot})
  const checked=checkResourceAllocationConflict({...snapshot,assertCurrent:assertSnapshot})
  return Object.freeze({...checked,resourceVersionId:selection.resourceVersionId,limit:snapshot.limit,
   requested:Object.freeze({...snapshot.requested}),assertCurrent:assertSnapshot})
 }}
}
