/**
 * @module app:views/features/application/smart-bid/configuration/configuration-release-reader
 * 职责：页19通过原启停请求回查历史结果，保留同次指针版。
 */
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readOriginalConfigurationRelease} from '@/services/smart-bid/content/references/configuration/configuration-release-recovery'
import {originalRegistrationView,readOriginalRegistrationView} from '../authority/original-registration-view'

type Request=Parameters<typeof readOriginalConfigurationRelease>[0]
const keys=['kind','key','scopeId','requestKey','requestDigest']
const versionFields=['action','versionId','versionDigest','expectedPointerVersion','status']
const error='CONFIGURATION_RELEASE_REGISTERED_READ'

/** 在页19场景装配 ConfigurationRelease@originalRelease 精确查询。 */
export function configurationReleaseReadView(primaryKey:string){
 return originalRegistrationView(primaryKey,keys,[...versionFields,'releaseRef','resultPointerVersion','state','terminalRef'])
}

/** 只读取当前作用域中同一启停请求的原结果，不回查当前指针代替原回执。 */
export function readRegisteredConfigurationRelease(
 host:Parameters<typeof readOriginalRegistrationView>[0]&Readonly<{scopeId:string}>,input:Request){
 host.assertCurrent()
 if(host.scopeId!==input.scopeId)throw Error(error)
 return readOriginalConfigurationRelease(input,{assertCurrent:()=>host.assertCurrent(),lookup:async request=>{
  const {kind,key,scopeId,requestKey,requestDigest}=request
  const read=await readOriginalRegistrationView(host,{model:'ConfigurationRelease',viewName:'originalRelease'},
   {kind,key,scopeId,requestKey,requestDigest})
  const {row}=read
  if(!row)return {...request,status:'UNKNOWN',assertCurrent:read.assertCurrent}
  const {action,versionId,versionDigest,expectedPointerVersion,status,state,releaseRef,resultPointerVersion,terminalRef}=row
  const assertCurrent=read.captureFields([...versionFields,...(status==='APPLIED'?['state','releaseRef','resultPointerVersion']:
   status==='NOT_APPLIED'?['terminalRef']:[])])
  assertCurrent()
  if(action!==request.action||versionId!==request.version.versionId||versionDigest!==request.version.digest||
   expectedPointerVersion!==request.expectedPointerVersion)throw Error(error)
  if(status==='UNKNOWN')return {...request,status,assertCurrent}
  if(status==='NOT_APPLIED'&&identity(terminalRef))return {...request,status,terminalRef,assertCurrent}
  if(status==='APPLIED'&&(state==='ENABLED'||state==='DISABLED')&&identity(releaseRef)&&identity(resultPointerVersion))
   return {...request,status,state,releaseRef,resultPointerVersion,assertCurrent}
  throw Error(error)
 }})
}
