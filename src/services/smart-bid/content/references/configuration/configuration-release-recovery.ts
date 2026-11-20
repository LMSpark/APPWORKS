/**
 * @module app:services/smart-bid/content/references/configuration/configuration-release-recovery
 * 职责：第60、61项按原启停请求恢复历史结果。
 */
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'
import type {prepareConfigurationRelease} from './configuration-release-decision'

type Prepared=Awaited<ReturnType<typeof prepareConfigurationRelease>>
type Request=Pick<Prepared['record'],'kind'|'key'|'scopeId'|'requestKey'|'action'|'version'|'expectedPointerVersion'>&
 Readonly<{requestDigest:string}>
type Receipt=Request&Readonly<{assertCurrent:()=>void}>&(
 Readonly<{status:'APPLIED';releaseRef:string;resultPointerVersion:string;state:'ENABLED'|'DISABLED'}>|
 Readonly<{status:'NOT_APPLIED';terminalRef:string}>|
 Readonly<{status:'UNKNOWN'}>
)

/** 空记录保持未知；历史成功只证明当次原指针更新。 */
export async function readOriginalConfigurationRelease(input:Request,source:Readonly<{
 lookup:(request:Request)=>Promise<Receipt|undefined>;assertCurrent:()=>void
}>){
 source.assertCurrent()
 const {kind,key,scopeId,requestKey,requestDigest,action,expectedPointerVersion}=input
 const version=Object.freeze({versionId:input.version.versionId,digest:input.version.digest})
 const error='CONFIGURATION_RELEASE_RECOVERY_SCOPE'
 if(![kind,key,scopeId,requestKey,version.versionId].every(identity)||
  ![requestDigest,version.digest].every(value=>/^[a-f0-9]{64}$/u.test(value))||
  expectedPointerVersion!==null&&!identity(expectedPointerVersion))throw Error(error)
 const request=Object.freeze({kind,key,scopeId,requestKey,requestDigest,action,expectedPointerVersion,version})
 const receipt=await source.lookup(request)
 const assertCurrent=()=>{source.assertCurrent();receipt?.assertCurrent()}
 assertCurrent()
 if(!receipt)return Object.freeze({status:'UNKNOWN' as const,assertCurrent})
 const fields=['kind','key','scopeId','requestKey','requestDigest','action','expectedPointerVersion'] as const
 if(fields.some(field=>receipt[field]!==request[field])||receipt.version.versionId!==version.versionId||receipt.version.digest!==version.digest)
  throw Error(error)
 if(receipt.status==='UNKNOWN')return Object.freeze({status:receipt.status,assertCurrent})
 if(receipt.status==='NOT_APPLIED'){
  if(!identity(receipt.terminalRef))throw Error(error)
  return Object.freeze({status:receipt.status,terminalRef:receipt.terminalRef,assertCurrent})
 }
 if(![receipt.releaseRef,receipt.resultPointerVersion].every(identity)||receipt.resultPointerVersion===expectedPointerVersion||
  receipt.state!==(action==='ENABLE'?'ENABLED':'DISABLED'))throw Error(error)
 return Object.freeze({status:receipt.status,releaseRef:receipt.releaseRef,resultPointerVersion:receipt.resultPointerVersion,
  state:receipt.state,version,assertCurrent})
}
