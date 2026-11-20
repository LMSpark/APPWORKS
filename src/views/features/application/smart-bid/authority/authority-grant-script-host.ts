/**
 * @module app:views/features/application/smart-bid/authority/authority-grant-script-host
 * 职责：页04宿主在当前企业和页面实例内回查原代表委托登记。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readRegisteredAuthorityGrantRegistration} from './authority-grant-registration-reader'

/** 企业和场景身份由已发布调用宿主提供。 */
export function createAuthorityGrantScriptHost<Runtime extends Pick<PageRuntime,'resolveView'|'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,scope:Omit<Parameters<typeof readRegisteredAuthorityGrantRegistration>[0],'runtime'>){
 return {runtime,assertCurrent:scope.assertCurrent,invoke(name:string,input:unknown,signal:AbortSignal){
  if(name==='authority.grant.register')throw Error('AUTHORITY_GRANT_COMMAND_CONTRACT_UNAVAILABLE')
  if(name!=='authority.grant.readRegistration'||!isRecord(input))throw Error('AUTHORITY_GRANT_PAGE_REQUEST')
  const {grantId,requestKey,requestDigest}=input
  if(!identity(grantId)||!identity(requestKey)||!identity(requestDigest)||Object.hasOwn(input,'enterpriseId'))
   throw Error('AUTHORITY_GRANT_PAGE_REQUEST')
  const generation=runtime.generation
  const assertCurrent=()=>{
   scope.assertCurrent()
   if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)
    throw Error('AUTHORITY_GRANT_PAGE_STALE')
  }
  return readRegisteredAuthorityGrantRegistration({...scope,runtime,assertCurrent},
   {enterpriseId:scope.enterpriseId,grantId,requestKey,requestDigest})
 }}
}
