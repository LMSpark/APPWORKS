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
  const key=JSON.stringify([purposeId,recipientId])
  if(![purposeId,recipientId,...fieldIds].every(identity)||keys.has(key)||!fieldIds.length||
   new Set(fieldIds).size!==fieldIds.length||time(expiresAt)<=effective)throw Error('RESOURCE_USE_DECISION_USES')
  keys.add(key)
  return Object.freeze({purposeId,recipientId,fieldIds:Object.freeze([...fieldIds].sort()),expiresAt})
 })
 if(!uses.length)throw Error('RESOURCE_USE_DECISION_USES')
 const {sourceEnterpriseId,recipientEnterpriseId,projectId,applicationRef,resourceVersionId,decisionChainId}=request
 const record=Object.freeze({sourceEnterpriseId,recipientEnterpriseId,projectId,applicationRef,resourceVersionId,decisionChainId,
  decisionRef,requestKey,expectedVersion,intent,decisionEnterpriseId,decisionMakerId,
  authorityRef,effectiveAt,knownAt,uses:Object.freeze(uses)})
 const requestDigest=await hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.resource-use-decision/1',record]))
 source.assertCurrent()
 return Object.freeze({record,requestDigest,assertCurrent:()=>source.assertCurrent()})
}
