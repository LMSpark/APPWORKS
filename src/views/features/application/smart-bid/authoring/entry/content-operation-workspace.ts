/**
 * @module app:views/features/application/smart-bid/authoring/entry/content-operation-workspace
 * 职责：页18在当前 PageRuntime 和 ClassModel 根中办理发现、回读、验证与退回准备。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import type {ClassModelRuntime} from '@spark-appworks/spark-ai/class-model'
import {readDiscoveredOperationGuide} from '@/services/smart-bid/operation/guides/operation-guide-discovery'
import {freezeOperationRouteContext} from '@/services/smart-bid/operation/operation-route-context'
import {dispatchOperationRouteAgentTask} from '@/services/smart-bid/operation/operation-route-agent-task'
import {discoverRegisteredOperationGuides} from '../model/operation/content-operation-guide-reader'
import {readRegisteredOperationDispatch} from '../model/operation/content-operation-dispatch-reader'
import {recoverRegisteredOperationRouteAttempt} from '../model/operation/content-operation-result-reader'
import {prepareRegisteredOperationStepRework} from '../model/operation/content-operation-rework-reader'

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
   definition:Omit<Freeze[1],'action'>&Readonly<{
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
   const manifest=await freezeOperationRouteContext(attempt,{createdAt:definition.createdAt,slots:definition.slots,
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
  recover(manifest:Parameters<typeof recoverRegisteredOperationRouteAttempt>[1],
   guide:Parameters<typeof recoverRegisteredOperationRouteAttempt>[2]){
   return recoverRegisteredOperationRouteAttempt(host,manifest,guide)
  },
  prepareRework(selection:Parameters<typeof prepareRegisteredOperationStepRework>[1]){
   return prepareRegisteredOperationStepRework(host,selection)
  },
 })
}
