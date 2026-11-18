/**
 * @module app:services/smart-bid/content/references/resource-use/resource-use-decision
 * 职责：第56项绑定来源企业的决定、原件版本和接收方的逐项用途。
 */
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../../revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'

type Scope=Readonly<{
 sourceEnterpriseId:string;recipientEnterpriseId:string;projectId:string;applicationRef:string;resourceVersionId:string;decisionChainId:string
}>
type Intent='ALLOW'|'DENY'|'CHANGE'|'REVOKE'
type Use=Readonly<{purposeId:string;recipientId:string;fieldIds:readonly string[];expiresAt:string}>
type Decision=Scope&Readonly<{
 decisionRef:string;decisionEnterpriseId:string;decisionMakerId:string;authorityRef:string;intent:Intent
 effectiveAt:string;knownAt:string;uses:readonly Use[];assertCurrent:()=>void
}>
const time=(value:string)=>{
 const parsed=Date.parse(value)
 if(!Number.isFinite(parsed)||!/(?:Z|[+-]\d{2}:\d{2})$/u.test(value))throw Error('RESOURCE_USE_DECISION_TIME')
 return parsed
}
const scopeFields=['sourceEnterpriseId','recipientEnterpriseId','projectId','applicationRef','resourceVersionId','decisionChainId'] as const
const useKey=({purposeId,recipientId}:Pick<Use,'purposeId'|'recipientId'>)=>JSON.stringify([purposeId,recipientId])

/** 生成正式登记所需载荷，原件身份固定并由来源企业的有权人决定。 */
export async function prepareResourceUseDecision(request:Scope&Readonly<{
 decisionRef:string;requestKey:string;expectedVersion:string|null;intent:Intent
}>,source:Decision){
 source.assertCurrent()
 const {decisionRef,requestKey,expectedVersion,intent}=request
 const {decisionEnterpriseId,decisionMakerId,authorityRef,effectiveAt,knownAt}=source
 if(scopeFields.some(field=>!identity(request[field])||request[field]!==source[field])||
  ![decisionRef,requestKey,decisionMakerId,authorityRef].every(identity)||
  decisionEnterpriseId!==request.sourceEnterpriseId||decisionRef!==source.decisionRef||intent!==source.intent||
  !['ALLOW','DENY','CHANGE','REVOKE'].includes(intent)||
  (intent==='CHANGE'||intent==='REVOKE'? !identity(expectedVersion):expectedVersion!==null))
  throw Error('RESOURCE_USE_DECISION_SCOPE')
 const effective=time(effectiveAt)
 time(knownAt)
 const keys=new Set<string>()
 const uses=source.uses.map(({purposeId,recipientId,fieldIds,expiresAt})=>{
  const key=useKey({purposeId,recipientId})
  if(![purposeId,recipientId,...fieldIds].every(identity)||keys.has(key)||!fieldIds.length||
   new Set(fieldIds).size!==fieldIds.length||time(expiresAt)<=effective)throw Error('RESOURCE_USE_DECISION_USES')
  keys.add(key)
  return Object.freeze({purposeId,recipientId,fieldIds:Object.freeze([...fieldIds].sort()),expiresAt})
 })
 if(!uses.length)throw Error('RESOURCE_USE_DECISION_USES')
 uses.sort((left,right)=>{
  const a=useKey(left),b=useKey(right)
  return a<b?-1:a>b?1:0
 })
 const {sourceEnterpriseId,recipientEnterpriseId,projectId,applicationRef,resourceVersionId,decisionChainId}=request
 const record=Object.freeze({sourceEnterpriseId,recipientEnterpriseId,projectId,applicationRef,resourceVersionId,decisionChainId,
  decisionRef,requestKey,expectedVersion,intent,decisionEnterpriseId,decisionMakerId,
  authorityRef,effectiveAt,knownAt,uses:Object.freeze(uses)})
 const requestDigest=await hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.resource-use-decision/1',record]))
 source.assertCurrent()
 return Object.freeze({record,requestDigest,assertCurrent:()=>source.assertCurrent()})
}

type Prepared=Awaited<ReturnType<typeof prepareResourceUseDecision>>
type RegistrationKey=Scope&Readonly<{requestKey:string;requestDigest:string}>
type RegistrationOutcome=RegistrationKey&Readonly<{assertCurrent:()=>void}>&(
 Readonly<{status:'REGISTERED';versionId:string;record:Prepared['record']}>|
 Readonly<{status:'REJECTED';receiptRef:string}>|
 Readonly<{status:'UNKNOWN'}>
)

/** 原登记未知只回查同一请求；已登记的拒绝决定仍保留其正式版本。 */
export async function readOriginalResourceUseRegistration(input:RegistrationKey,source:Readonly<{
 lookup:(request:RegistrationKey)=>Promise<RegistrationOutcome|undefined>;assertCurrent:()=>void
}>){
 source.assertCurrent()
 const {sourceEnterpriseId,recipientEnterpriseId,projectId,applicationRef,resourceVersionId,decisionChainId,requestKey,requestDigest}=input
 const request=Object.freeze({sourceEnterpriseId,recipientEnterpriseId,projectId,applicationRef,resourceVersionId,
  decisionChainId,requestKey,requestDigest})
 const error='RESOURCE_USE_REGISTRATION_SCOPE'
 if(!scopeFields.every(field=>identity(request[field]))||!identity(request.requestKey)||
  !/^[a-f0-9]{64}$/u.test(request.requestDigest))throw Error(error)
 const result=await source.lookup(request)
 const assertCurrent=()=>{source.assertCurrent();result?.assertCurrent()}
 assertCurrent()
 if(!result)return Object.freeze({status:'UNKNOWN' as const,assertCurrent})
 if(scopeFields.some(field=>result[field]!==request[field])||
  result.requestKey!==request.requestKey||result.requestDigest!==request.requestDigest)throw Error(error)
 if(result.status==='UNKNOWN')return Object.freeze({status:result.status,assertCurrent})
 if(result.status==='REJECTED'){
  if(!identity(result.receiptRef))throw Error(error)
  return Object.freeze({status:result.status,receiptRef:result.receiptRef,assertCurrent})
 }
 const record=structuredClone(result.record),{versionId}=result
 if(!identity(versionId)||versionId===record.expectedVersion||
  scopeFields.some(field=>record[field]!==request[field])||record.requestKey!==request.requestKey)throw Error(error)
 const recovered=await prepareResourceUseDecision(record,{...record,assertCurrent})
 if(recovered.requestDigest!==request.requestDigest||canonicalSnapshotValue(record)!==canonicalSnapshotValue(recovered.record))
  throw Error(error)
 assertCurrent()
 return Object.freeze({status:result.status,versionId,record:recovered.record,assertCurrent})
}
