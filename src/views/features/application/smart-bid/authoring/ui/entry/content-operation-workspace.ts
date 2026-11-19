/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/content-operation-workspace
 * 职责：页18在当前 PageRuntime 和 ClassModel 根中办理发现、回读、验证与退回准备。
 * 边界：组织工艺工作区调用和原证据，按本次运行实例检查会话有效性。
 * AI用途：追踪页18从目录发现到原试次回查的操作顺序。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import type {ClassModelRuntime} from '@spark-appworks/spark-ai/class-model'
import {readDiscoveredOperationGuide} from '@/services/smart-bid/operation/guides/operation-guide-discovery'
import {freezeOperationRouteContext} from '@/services/smart-bid/operation/operation-route-context'
import {dispatchOperationRouteAgentTask} from '@/services/smart-bid/operation/operation-route-agent-task'
import {discoverRegisteredOperationGuides} from '../../model/operation/content-operation-guide-reader'
import {readRegisteredOperationDispatch} from '../../model/operation/content-operation-dispatch-reader'
import {readRegisteredFrozenOperationContext} from '../../model/operation/content-operation-frozen-reader'
import {readRegisteredOriginalOperationGuide} from '../../model/operation/content-operation-original-guide-reader'
import {recoverRegisteredOperationRouteAttempt} from '../../model/operation/content-operation-result-reader'
import {prepareRegisteredOperationStepRework} from '../../model/operation/content-operation-rework-reader'

/** 待回查试次固定的原调用清单。 */
type OriginalManifest=NonNullable<Awaited<ReturnType<typeof readRegisteredFrozenOperationContext>>>
/** 回查原试次使用的同一版本指南。 */
type RecoveryGuide=Parameters<typeof recoverRegisteredOperationRouteAttempt>[2]
/** 按原调用证据定位精确指南版本的函数。 */
type ResolveOriginalGuide=(original:Readonly<Pick<OriginalManifest,'scope'|'guideRef'|'guideVersionRef'|'guideDigest'>>,
 signal:AbortSignal)=>Promise<Omit<RecoveryGuide,'guideRef'|'guideVersionRef'|'guideDigest'|'assertGuideCurrent'>|undefined>

/** 调用方提供正式运行实例、当前业务项目和已绑定的 ClassModel 根。 */
export function openContentOperationWorkspace(
 runtime:Pick<PageRuntime,'resolveView'|'generation'|'destroyed'|'isLoaded'>,
 classModel:Pick<ClassModelRuntime,'executeTool'>,
 scope:Readonly<{scenarioId:string;projectId:string;rootKind:string;assertCurrent:()=>void;signal:AbortSignal}>,
){
 const {scenarioId,projectId,rootKind,assertCurrent:assertScope,signal}=scope
 const generation=runtime.generation
 const assertCurrent=()=>{
  assertScope()
  if(runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation||signal.aborted)
   throw Error('OPERATION_WORKSPACE_STALE')
 }
 assertCurrent()
 const host={runtime,scenarioId,projectId,assertCurrent}
 type Discovery=Awaited<ReturnType<typeof discoverRegisteredOperationGuides>>
 type Guide=Awaited<ReturnType<typeof readDiscoveredOperationGuide>>
 type Freeze=Parameters<typeof freezeOperationRouteContext>
 type Dispatch=Parameters<typeof dispatchOperationRouteAgentTask>
 const discoveries=new WeakSet<Discovery>()
 const guides=new WeakSet<Guide>()
 const manifests=new WeakSet<Awaited<ReturnType<typeof freezeOperationRouteContext>>>()
 return Object.freeze({
  async discover(directoryRef:string){
   const discovery=await discoverRegisteredOperationGuides(host,classModel,{directoryRef,rootKind})
   assertCurrent()
   discoveries.add(discovery)
   return discovery
  },
  async readGuide(discovery:Discovery,selection:Parameters<typeof readDiscoveredOperationGuide>[2]){
   assertCurrent()
   if(!discoveries.has(discovery))throw Error('OPERATION_WORKSPACE_GUIDE_SCOPE')
   const guide=await readDiscoveredOperationGuide(classModel,discovery,selection)
   assertCurrent()
   guides.add(guide)
   return guide
  },
  async freeze(attempt:Freeze[0],guide:Guide,input:Readonly<{
   definition:Omit<Freeze[1],'action'|'guideVersionRef'>&Readonly<{
    versionRef:string;guideDigest:string;configurationLockHash:string;assertCurrent:()=>void
   }>
   sources:Freeze[2]
  }>){
   const {definition,sources}=input
   const assertDefinition=()=>{
    assertCurrent()
    if(!guides.has(guide)||attempt.projectId!==projectId||definition.versionRef!==guide.versionRef||
     definition.guideDigest!==guide.guideDigest||definition.configurationLockHash!==attempt.configurationLockHash)
     throw Error('OPERATION_WORKSPACE_GUIDE_SCOPE')
    guide.assertCurrent();definition.assertCurrent()
   }
   const manifest=await freezeOperationRouteContext(attempt,{guideVersionRef:guide.versionRef,createdAt:definition.createdAt,slots:definition.slots,
    action:{guideRef:guide.guideRef,guideDigest:guide.guideDigest,assertCurrent:assertDefinition}},sources)
   assertCurrent()
   manifests.add(manifest)
   return manifest
  },
  async dispatch(options:Dispatch[0],source:Dispatch[1]){
   assertCurrent()
   if(!manifests.has(source.manifest))throw Error('OPERATION_WORKSPACE_MANIFEST_SCOPE')
   return dispatchOperationRouteAgentTask(options,{...source,assertCurrent:()=>{assertCurrent();source.assertCurrent()}})
  },
  readDispatch(attempt:Parameters<typeof readRegisteredOperationDispatch>[1]){
   return readRegisteredOperationDispatch(host,attempt)
  },
  readOriginalGuide(original:Parameters<typeof readRegisteredOriginalOperationGuide>[2]['original']){
   return readRegisteredOriginalOperationGuide(host,classModel,{rootKind,original})
  },
  recover(manifest:Parameters<typeof recoverRegisteredOperationRouteAttempt>[1],
   guide:Parameters<typeof recoverRegisteredOperationRouteAttempt>[2]){
   return recoverRegisteredOperationRouteAttempt(host,manifest,guide)
  },
  async recoverOriginal(attempt:Freeze[0],resolveGuide:ResolveOriginalGuide){
   const manifest=await readRegisteredFrozenOperationContext(host,attempt)
   assertCurrent()
   if(!manifest)return Object.freeze({state:'FROZEN_CONTEXT_REQUIRED' as const,assertCurrent})
   const {scope:originalScope,guideRef,guideVersionRef,guideDigest}=manifest
   const original=Object.freeze({scope:originalScope,guideRef,guideVersionRef,guideDigest})
   const guide=await readRegisteredOriginalOperationGuide(host,classModel,{rootKind,original})
   manifest.assertCurrent()
   if(!guide)return Object.freeze({state:'ORIGINAL_GUIDE_REQUIRED' as const,assertCurrent:manifest.assertCurrent})
   const rules=await resolveGuide(original,signal)
   manifest.assertCurrent()
   guide.assertCurrent()
   if(!rules)return Object.freeze({state:'ORIGINAL_GUIDE_RULES_REQUIRED' as const,
    assertCurrent:()=>{manifest.assertCurrent();guide.assertCurrent()}})
   return recoverRegisteredOperationRouteAttempt(host,manifest,{...rules,guideRef:guide.guideRef,
    guideVersionRef:guide.guideVersionRef,guideDigest:guide.guideDigest,assertGuideCurrent:guide.assertCurrent})
  },
  prepareRework(selection:Parameters<typeof prepareRegisteredOperationStepRework>[1]){
   return prepareRegisteredOperationStepRework(host,selection)
  },
 })
}
