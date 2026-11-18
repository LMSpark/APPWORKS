/**
 * @module app:views/features/application/smart-bid/authority/resource-use-script-host
 * 职责：页06在当前项目及企业上下文回查原资料使用决定。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readRegisteredResourceUseRegistration} from './resource-use-registration-reader'

/** 当前项目和企业由正式宿主提供，页面只提交原决定引用。 */
export function createResourceUseScriptHost<Runtime extends Pick<PageRuntime,'resolveView'|'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,scope:Omit<Parameters<typeof readRegisteredResourceUseRegistration>[0],'runtime'>){
 return {runtime,assertCurrent:scope.assertCurrent,invoke(name:string,input:unknown,signal:AbortSignal){
  if(name!=='authority.resourceUse.readRegistration'||!isRecord(input))throw Error('RESOURCE_USE_PAGE_REQUEST')
  const {sourceEnterpriseId,recipientEnterpriseId,applicationRef,resourceVersionId,decisionChainId,requestKey,requestDigest}=input
  if(!identity(sourceEnterpriseId)||!identity(recipientEnterpriseId)||!identity(applicationRef)||!identity(resourceVersionId)||
   !identity(decisionChainId)||!identity(requestKey)||!identity(requestDigest)||Object.hasOwn(input,'projectId')||Object.hasOwn(input,'enterpriseId'))
   throw Error('RESOURCE_USE_PAGE_REQUEST')
  const generation=runtime.generation
  const assertCurrent=()=>{
   scope.assertCurrent()
   if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)throw Error('RESOURCE_USE_PAGE_STALE')
  }
  return readRegisteredResourceUseRegistration({...scope,runtime,assertCurrent},{
   projectId:scope.projectId,sourceEnterpriseId,recipientEnterpriseId,applicationRef,resourceVersionId,decisionChainId,requestKey,requestDigest,
  })
 }}
}
