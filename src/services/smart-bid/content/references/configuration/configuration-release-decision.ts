/**
 * @module app:services/smart-bid/content/references/configuration/configuration-release-decision
 * 职责：第60、61项固定配置启停决定和预期指针。
 */
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../../revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'

type Scope=Readonly<{kind:string;key:string;scopeId:string}>
type Version=Readonly<{versionId:string;digest:string}>
type Decision=Scope&Readonly<{decisionRef:string;authorityRef:string;assertCurrent:()=>void}>&(
 Readonly<{action:'ENABLE';candidate:Version;typeCheckRef:string;closureCheckRef:string;reviewRef:string}>|
 Readonly<{action:'DISABLE';original:Version;effectiveAt:string;stopScope:'NEW_SELECTION'|'UNEXECUTED'}>
)
const digest=(value:string)=>/^[a-f0-9]{64}$/u.test(value)

/** 按授权查询给出的作用域顺序选用，显式停用阻止继承。 */
export function resolveActiveConfiguration(scope:Pick<Scope,'kind'|'key'>,source:Readonly<{
 scopeIds:readonly string[]
 pointers:ReadonlyArray<Scope&Readonly<{pointerVersion:string;state:'DISABLED'}|{pointerVersion:string;state:'ENABLED';version:Version}>>
 assertCurrent:()=>void
}>){
 source.assertCurrent()
 const scopeIds=[...source.scopeIds],scopes=new Set(scopeIds),byScope=new Map<string,(typeof source.pointers)[number]>()
 const error='CONFIGURATION_POINTER_SCOPE'
 if(![scope.kind,scope.key,...scopeIds].every(identity)||scopeIds.length!==scopes.size)throw Error(error)
 for(const pointer of source.pointers){
  if(pointer.kind!==scope.kind||pointer.key!==scope.key||!scopes.has(pointer.scopeId)||
   !identity(pointer.pointerVersion)||byScope.has(pointer.scopeId)||
   pointer.state==='ENABLED'&&(!identity(pointer.version.versionId)||!digest(pointer.version.digest)))throw Error(error)
  byScope.set(pointer.scopeId,pointer)
 }
 for(const scopeId of scopeIds){
  const pointer=byScope.get(scopeId)
  if(pointer)return Object.freeze({...pointer,...(pointer.state==='ENABLED'?{version:Object.freeze({...pointer.version})}:{}),
   assertCurrent:()=>source.assertCurrent()})
 }
 return Object.freeze({state:'MISSING' as const,assertCurrent:()=>source.assertCurrent()})
}

/** 预备同次提交的期望指针，权威保存负责比较更新和固定原结果。 */
export async function prepareConfigurationRelease(scope:Scope,input:Readonly<{
 requestKey:string;expectedPointerVersion:string|null
}>,decision:Decision){
 decision.assertCurrent()
 const {kind,key,scopeId}=scope
 const {requestKey,expectedPointerVersion}=input,{action,decisionRef,authorityRef}=decision
 if(![kind,key,scopeId,requestKey,decisionRef,authorityRef].every(identity)||scopeId!==decision.scopeId||
  kind!==decision.kind||key!==decision.key||expectedPointerVersion!==null&&!identity(expectedPointerVersion))
  throw Error('CONFIGURATION_RELEASE_SCOPE')
 const version=action==='ENABLE'?decision.candidate:decision.original
 if(!identity(version.versionId)||!digest(version.digest))throw Error('CONFIGURATION_RELEASE_VERSION')
 if(action==='ENABLE'&&![decision.typeCheckRef,decision.closureCheckRef,decision.reviewRef].every(identity))
  throw Error('CONFIGURATION_RELEASE_EVIDENCE')
 if(action==='DISABLE'&&(expectedPointerVersion===null||!Number.isFinite(Date.parse(decision.effectiveAt))||
  !/(?:Z|[+-]\d{2}:\d{2})$/u.test(decision.effectiveAt)||!['NEW_SELECTION','UNEXECUTED'].includes(decision.stopScope)))
  throw Error('CONFIGURATION_RELEASE_EVIDENCE')
 const change=action==='ENABLE'?{targetState:'ENABLED' as const,typeCheckRef:decision.typeCheckRef,
  closureCheckRef:decision.closureCheckRef,reviewRef:decision.reviewRef}:
  {targetState:'DISABLED' as const,effectiveAt:decision.effectiveAt,stopScope:decision.stopScope}
 const record=Object.freeze({kind,key,scopeId,requestKey,expectedPointerVersion,action,decisionRef,authorityRef,
  version:Object.freeze({versionId:version.versionId,digest:version.digest}),...change})
 const requestDigest=await hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.configuration-release/1',record]))
 decision.assertCurrent()
 return Object.freeze({record,requestDigest,assertCurrent:()=>decision.assertCurrent()})
}
