/**
 * @module app:services/smart-bid/content/review/submission/authority-grant-coverage
 * 职责：第27项按办理和获知时点核已有登记委托链的代表权。
 */
import {snapshotReferenceIdentity as identity} from '../../references/snapshot-reference-values'
import type {prepareAuthorityGrantDecision} from './authority-grant-decision'

type Grant=Awaited<ReturnType<typeof prepareAuthorityGrantDecision>>['record']
type Version=Readonly<{versionId:string;record:Grant;assertCurrent:()=>void}>
const time=(value:string)=>{
 const parsed=Date.parse(value)
 if(!Number.isFinite(parsed)||!/(?:Z|[+-]\d{2}:\d{2})$/u.test(value))throw Error('AUTHORITY_GRANT_TIME')
 return parsed
}

/** 按原版本链核指定事项，旧版不覆盖查明已生效的撤销。 */
export function checkRegisteredAuthorityGrant(input:Readonly<{
 enterpriseId:string;grantId:string;representativeId:string;projectId:string|null;action:string;objectRef:string
 actionAt:string;knownAt:string
}>,source:Readonly<{versions:readonly Version[];assertCurrent:()=>void}>){
 const versions=[...source.versions]
 const assertCurrent=()=>{source.assertCurrent();for(const version of versions)version.assertCurrent()}
 assertCurrent()
 const {enterpriseId,grantId,representativeId,projectId,action,objectRef}=input
 if(![enterpriseId,grantId,representativeId,action,objectRef].every(identity)||projectId!==null&&!identity(projectId))
  throw Error('AUTHORITY_GRANT_SCOPE')
 const actionAt=time(input.actionAt),knownAt=time(input.knownAt)
 const seen=new Set<string>()
 let prior:string|null=null,selected:Version|undefined
 for(const version of versions){
  const {record,versionId}=version
  if(!identity(versionId)||seen.has(versionId)||record.enterpriseId!==enterpriseId||record.grantId!==grantId||
   record.expectedVersion!==prior||(prior===null)!==(record.intent==='REGISTER'))
   throw Error('AUTHORITY_GRANT_VERSION_CHAIN')
  seen.add(versionId)
  prior=versionId
  if(time(record.effectiveAt)<=actionAt&&time(record.knownAt)<=knownAt)selected=version
 }
 const record=selected?.record
 const state=record===undefined?'PENDING':
  record.intent==='REVOKE'?'REVOKED':
   record.representativeId!==representativeId||record.projectId!==null&&record.projectId!==projectId||
   !record.actions.includes(action)||!record.objectRefs.includes(objectRef)||time(record.expiresAt)<=actionAt?'OUTSIDE_SCOPE':'COVERED'
 assertCurrent()
 return Object.freeze({state,versionId:selected?.versionId??null,decisionRef:record?.decisionRef??null,assertCurrent})
}
