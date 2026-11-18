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
