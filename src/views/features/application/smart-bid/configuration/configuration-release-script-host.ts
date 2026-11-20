/**
 * @module app:views/features/application/smart-bid/configuration/configuration-release-script-host
 * 职责：页19按已绑定作用域回查配置启停的原请求。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readRegisteredConfigurationRelease} from './configuration-release-reader'
import {readRegisteredConfigurationChannel,readRegisteredConfigurationVersion,type ConfigurationScope} from './configuration-channel-reader'
import {assessConfigurationDisableImpact} from '@/services/smart-bid/content/references/configuration/configuration-disable-impact'

import {prepareConfigurationRelease} from '@/services/smart-bid/content/references/configuration/configuration-release-decision'
import type {JsonValue} from '@spark-appworks/spark-json-document'

type Read=Parameters<typeof readRegisteredConfigurationRelease>
type Impact=Parameters<typeof assessConfigurationDisableImpact>
type ImpactReader=(original:Readonly<Pick<Impact[0],'kind'|'key'|'scopeId'|'versionId'|'digest'|'releaseRef'>>,signal:AbortSignal)=>
 Promise<Readonly<{stop:Impact[0];uses:Impact[1]}>>

type Prepare=Parameters<typeof prepareConfigurationRelease>
type Pointer=Prepare[0]&Readonly<{pointerVersion:string|null;version:Readonly<{versionId:string;digest:string}>|null;assertCurrent:()=>void}>
type CandidateReader=(selection:Prepare[0]&Readonly<{versionId:string}>,signal:AbortSignal)=>Promise<Readonly<{
 decision:Extract<Prepare[2],{action:'ENABLE'}>
 pointer:Pointer
}>>
type DisableReader=(selection:Prepare[0]&Readonly<{versionId:string;decisionRef:string}>,signal:AbortSignal)=>Promise<Readonly<{
 decision:Extract<Prepare[2],{action:'DISABLE'}>
}>>
type PreparedRelease=Awaited<ReturnType<typeof prepareConfigurationRelease>>
type ReleaseOwner=Readonly<{
 submitEnable?:(prepared:PreparedRelease,signal:AbortSignal)=>Promise<JsonValue>
 submitDisable?:(prepared:PreparedRelease,signal:AbortSignal)=>Promise<JsonValue>
}>

/** 页面提供原配置与请求引用，作用域由当前正式宿主限定。 */
export function createConfigurationReleaseScriptHost<Runtime extends Pick<PageRuntime,'resolveView'|'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,host:Omit<Read[0],'runtime'>&Readonly<{configurationScope?:ConfigurationScope}>,
 {readDisableImpact,readCandidate,readDisableDecision,submitEnable,submitDisable}:Readonly<{
  readDisableImpact?:ImpactReader;readCandidate?:CandidateReader;readDisableDecision?:DisableReader
 }>&ReleaseOwner={}){
 return {runtime,assertCurrent:host.assertCurrent,invoke(name:string,input:unknown,signal:AbortSignal){
  const error='CONFIGURATION_RELEASE_PAGE_REQUEST'
  if(!isRecord(input)||Object.hasOwn(input,'scopeId'))throw Error(error)
  const generation=runtime.generation
  const assertCurrent=()=>{
   host.assertCurrent()
   if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)
    throw Error('CONFIGURATION_RELEASE_PAGE_STALE')
  }
  const {scopeId}=host
  if(name==='configuration.release.readCurrentChannel'&&host.configurationScope){
   const {kind,key}=input
   if(Object.keys(input).length!==2||!identity(kind)||!identity(key))throw Error(error)
   return readRegisteredConfigurationChannel({...host,runtime,assertCurrent,configurationScope:host.configurationScope},{kind,key})
  }
  if((name==='configuration.release.prepareDisable'||name==='configuration.release.submitDisable')&&
   readDisableDecision&&host.configurationScope&&(name!=='configuration.release.submitDisable'||submitDisable)){
   const {kind,key,requestKey,versionId,decisionRef}=input
   if(Object.keys(input).length!==5||!identity(kind)||!identity(key)||!identity(requestKey)||
    !identity(versionId)||!identity(decisionRef))throw Error(error)
   const selection={kind,key,scopeId}
   assertCurrent()
   return Promise.all([
    readDisableDecision({...selection,versionId,decisionRef},signal),
    readRegisteredConfigurationChannel({...host,runtime,assertCurrent,configurationScope:host.configurationScope},{kind,key}),
   ]).then(async ([{decision},pointer])=>{
    const assertEvidence=()=>{assertCurrent();pointer.assertCurrent();decision.assertCurrent()}
    assertEvidence()
    if(pointer.state!=='ACTIVE'||decision.decisionRef!==decisionRef||decision.original.versionId!==versionId||
     pointer.versionDigest!==decision.original.digest)
     throw Error('CONFIGURATION_RELEASE_DISABLE_SCOPE')
    const assertVersion=await readRegisteredConfigurationVersion({...host,runtime,assertCurrent},
     {kind,key,hash:pointer.versionDigest},versionId)
    const prepared=await prepareConfigurationRelease(selection,{requestKey,expectedPointerVersion:pointer.pointerVersion},
     {...decision,assertCurrent:()=>{assertEvidence();assertVersion()}})
    if(name==='configuration.release.submitDisable'){
     const outcome=await submitDisable?.(prepared,signal)
     assertEvidence()
     if(outcome===undefined)throw Error('CONFIGURATION_RELEASE_COMMAND_REQUIRED')
     return Object.freeze({release:prepared,outcome,assertCurrent:prepared.assertCurrent})
    }
    return prepared
   })
  }
  if((name==='configuration.release.prepareEnable'||name==='configuration.release.submitEnable')&&
   readCandidate&&host.configurationScope&&(name!=='configuration.release.submitEnable'||submitEnable)){
   const {kind,key,requestKey,versionId}=input
   if(Object.keys(input).length!==4||!identity(kind)||!identity(key)||!identity(requestKey)||!identity(versionId))throw Error(error)
   const selection={kind,key,scopeId}
   assertCurrent()
   return Promise.all([
    readCandidate({...selection,versionId},signal),
    readRegisteredConfigurationChannel({...host,runtime,assertCurrent,configurationScope:host.configurationScope},{kind,key}),
   ]).then(async ([{decision,pointer},channel])=>{
    const assertEvidence=()=>{assertCurrent();pointer.assertCurrent();decision.assertCurrent();channel.assertCurrent()}
    assertEvidence()
    const expectedPointerVersion=channel.state==='MISSING'?null:channel.pointerVersion
    if(pointer.kind!==kind||pointer.key!==key||pointer.scopeId!==scopeId||decision.candidate.versionId!==versionId||
     pointer.pointerVersion!==expectedPointerVersion||(channel.state==='ACTIVE'?
      !pointer.version||!identity(pointer.version.versionId)||pointer.version.digest!==channel.versionDigest:
      pointer.version!==null))throw Error('CONFIGURATION_RELEASE_CANDIDATE_SCOPE')
    const assertVersion=await readRegisteredConfigurationVersion({...host,runtime,assertCurrent},
     {kind,key,hash:decision.candidate.digest},versionId)
    const currentVersion=pointer.version===null?null:Object.freeze({...pointer.version})
    const prepared=await prepareConfigurationRelease(selection,{requestKey,expectedPointerVersion},
      {...decision,assertCurrent:()=>{assertEvidence();assertVersion()}})
    if(name==='configuration.release.submitEnable'){
     const outcome=await submitEnable?.(prepared,signal)
     assertEvidence()
     if(outcome===undefined)throw Error('CONFIGURATION_RELEASE_COMMAND_REQUIRED')
     return Object.freeze({release:prepared,currentVersion,outcome,assertCurrent:prepared.assertCurrent})
    }
    return Object.freeze({...prepared,currentVersion})
   })
  }
  if(name!=='configuration.release.readOriginal')throw Error(error)
  const {kind,key,requestKey,requestDigest,action,versionId,versionDigest,expectedPointerVersion}=input
  if(!identity(kind)||!identity(key)||!identity(requestKey)||!identity(requestDigest)||!identity(versionId)||!identity(versionDigest)||
   (action!=='ENABLE'&&action!=='DISABLE')||(expectedPointerVersion!==null&&!identity(expectedPointerVersion)))throw Error(error)
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
    return Object.freeze({...result,impact})
   }catch{
    result.assertCurrent()
    return Object.freeze({...result,impactState:'UNVERIFIED' as const})
   }
  })
 }}
}
