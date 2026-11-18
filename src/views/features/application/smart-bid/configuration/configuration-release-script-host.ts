/**
 * @module app:views/features/application/smart-bid/configuration/configuration-release-script-host
 * 职责：页19按已绑定作用域回查配置启停的原请求。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readRegisteredConfigurationRelease} from './configuration-release-reader'
import {assessConfigurationDisableImpact} from '@/services/smart-bid/content/references/configuration/configuration-disable-impact'

type Read=Parameters<typeof readRegisteredConfigurationRelease>
type Impact=Parameters<typeof assessConfigurationDisableImpact>
type ImpactReader=(original:Readonly<Pick<Impact[0],'kind'|'key'|'scopeId'|'versionId'|'digest'|'releaseRef'>>,signal:AbortSignal)=>
 Promise<Readonly<{stop:Impact[0];uses:Impact[1]}>>

/** 页面提供原配置与请求引用，作用域由当前正式宿主限定。 */
export function createConfigurationReleaseScriptHost<Runtime extends Pick<PageRuntime,'resolveView'|'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,host:Omit<Read[0],'runtime'>,readDisableImpact?:ImpactReader){
 return {runtime,assertCurrent:host.assertCurrent,invoke(name:string,input:unknown,signal:AbortSignal){
  const error='CONFIGURATION_RELEASE_PAGE_REQUEST'
  if(name!=='configuration.release.readOriginal'||!isRecord(input)||Object.hasOwn(input,'scopeId'))throw Error(error)
  const {kind,key,requestKey,requestDigest,action,versionId,versionDigest,expectedPointerVersion}=input
  if(!identity(kind)||!identity(key)||!identity(requestKey)||!identity(requestDigest)||!identity(versionId)||!identity(versionDigest)||
   (action!=='ENABLE'&&action!=='DISABLE')||(expectedPointerVersion!==null&&!identity(expectedPointerVersion)))throw Error(error)
  const generation=runtime.generation
  const assertCurrent=()=>{
   host.assertCurrent()
   if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)
    throw Error('CONFIGURATION_RELEASE_PAGE_STALE')
  }
  const {scopeId}=host
  return readRegisteredConfigurationRelease({...host,runtime,assertCurrent},{kind,key,requestKey,requestDigest,action,
   expectedPointerVersion,scopeId,version:{versionId,digest:versionDigest}}).then(async result=>{
   if(result.status!=='APPLIED'||result.state!=='DISABLED')return result
   if(!readDisableImpact)return Object.freeze({...result,impactState:'PENDING' as const})
   const {releaseRef}=result,digest=versionDigest
   const original=Object.freeze({kind,key,scopeId,versionId,digest,releaseRef})
   try{
    const {stop,uses}=await readDisableImpact(original,signal)
    result.assertCurrent()
    if(stop.kind!==kind||stop.key!==key||stop.scopeId!==scopeId||stop.versionId!==versionId||stop.digest!==digest||
     stop.releaseRef!==releaseRef)throw Error('CONFIGURATION_DISABLE_IMPACT_SCOPE')
    const impact=assessConfigurationDisableImpact(stop,uses)
    return Object.freeze({...result,impact,assertCurrent:()=>{result.assertCurrent();impact.assertCurrent()}})
   }catch{
    result.assertCurrent()
    return Object.freeze({...result,impactState:'UNVERIFIED' as const})
   }
  })
 }}
}
