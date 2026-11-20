/**
 * @module app:services/smart-bid/content/review/submission/authority-grant-decision
 * 职责：第55项按原决定、委托链和准予登记范围构造确定的委托决定版本。
 */
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../../revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '../../references/snapshot-reference-values'

type GrantScope=Readonly<{enterpriseId:string;grantId:string}>
type Request=GrantScope&Readonly<{
 requestKey:string;expectedVersion:string|null;intent:'REGISTER'|'CHANGE'|'REVOKE';decisionRef:string
}>
type DecisionSource=GrantScope&Readonly<{
 decisionRef:string;intent:Request['intent'];decisionMakerId:string;decisionAuthorityRef:string;representativeId:string
 projectId:string|null;actions:readonly string[];objectRefs:readonly string[]
 effectiveAt:string;expiresAt:string;knownAt:string;assertCurrent:()=>void
}>
const instant=(value:string)=>{
 const parsed=Date.parse(value)
 if(!Number.isFinite(parsed)||!/(?:Z|[+-]\d{2}:\d{2})$/u.test(value))throw Error('AUTHORITY_GRANT_TIME')
 return parsed
}

/** 正式写入须再核原版；构造的载荷保留原来源和预期版本。 */
export async function prepareAuthorityGrantDecision(request:Request,source:DecisionSource){
 source.assertCurrent()
 const {enterpriseId,grantId,requestKey,expectedVersion,intent,decisionRef}=request
 const {decisionMakerId,decisionAuthorityRef,representativeId,projectId,effectiveAt,expiresAt,knownAt}=source
 if(![enterpriseId,grantId,requestKey,decisionRef,decisionMakerId,decisionAuthorityRef,representativeId].every(identity)||
  !['REGISTER','CHANGE','REVOKE'].includes(intent)||
  enterpriseId!==source.enterpriseId||grantId!==source.grantId||decisionRef!==source.decisionRef||intent!==source.intent||
  projectId!==null&&!identity(projectId)||(intent==='REGISTER'?expectedVersion!==null:!identity(expectedVersion)))
  throw Error('AUTHORITY_GRANT_SCOPE')
 const actions=Object.freeze([...source.actions].sort()),objectRefs=Object.freeze([...source.objectRefs].sort())
 if(!actions.length||[actions,objectRefs].some(values=>!values.every(identity)||new Set(values).size!==values.length)||
  instant(expiresAt)<=instant(effectiveAt))throw Error('AUTHORITY_GRANT_EVIDENCE')
 instant(knownAt)
 const record=Object.freeze({enterpriseId,grantId,requestKey,expectedVersion,intent,decisionRef,
  decisionMakerId,decisionAuthorityRef,representativeId,projectId,actions,objectRefs,effectiveAt,expiresAt,knownAt})
 const requestDigest=await hashCanonicalSnapshotText(canonicalSnapshotValue(record))
 source.assertCurrent()
 return Object.freeze({record,requestDigest,assertCurrent:()=>source.assertCurrent()})
}

type Prepared=Awaited<ReturnType<typeof prepareAuthorityGrantDecision>>
type RegistrationIdentity=GrantScope&Readonly<{requestKey:string;requestDigest:string}>
type RegistrationResult=RegistrationIdentity&Readonly<{assertCurrent:()=>void}>&(
 Readonly<{status:'REGISTERED';versionId:string;record:Prepared['record']}>|
 Readonly<{status:'REJECTED';decisionRef:string}>|
 Readonly<{status:'UNKNOWN'}>
)

/** 丢失回执后只查原请求，已登记结果须能复算同一决定摘要。 */
export async function readOriginalAuthorityGrantRegistration(input:RegistrationIdentity,source:Readonly<{
 lookup:(request:RegistrationIdentity)=>Promise<RegistrationResult|undefined>;assertCurrent:()=>void
}>){
 source.assertCurrent()
 const {enterpriseId,grantId,requestKey,requestDigest}=input
 const request=Object.freeze({enterpriseId,grantId,requestKey,requestDigest})
 const error='AUTHORITY_GRANT_REGISTRATION_SCOPE'
 if(![enterpriseId,grantId,requestKey].every(identity)||!/^[a-f0-9]{64}$/u.test(requestDigest))throw Error(error)
 const result=await source.lookup(request)
 const assertCurrent=()=>{source.assertCurrent();result?.assertCurrent()}
 assertCurrent()
 if(!result)return Object.freeze({status:'UNKNOWN' as const,assertCurrent})
 if(result.enterpriseId!==enterpriseId||result.grantId!==grantId||result.requestKey!==requestKey||result.requestDigest!==requestDigest)
  throw Error(error)
 if(result.status==='UNKNOWN')return Object.freeze({status:result.status,assertCurrent})
 if(result.status==='REJECTED'){
  if(!identity(result.decisionRef))throw Error(error)
  return Object.freeze({status:result.status,decisionRef:result.decisionRef,assertCurrent})
 }
 const {versionId}=result
 const record=structuredClone(result.record)
 if(!identity(versionId)||versionId===record.expectedVersion||
  record.enterpriseId!==enterpriseId||record.grantId!==grantId||record.requestKey!==requestKey)throw Error(error)
 const recovered=await prepareAuthorityGrantDecision(record,{...record,assertCurrent})
 if(recovered.requestDigest!==requestDigest||canonicalSnapshotValue(record)!==canonicalSnapshotValue(recovered.record))throw Error(error)
 assertCurrent()
 return Object.freeze({status:result.status,versionId,record:recovered.record,assertCurrent})
}
