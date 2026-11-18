/**
 * @module app:views/features/application/smart-bid/authority/authority-grant-registration-reader
 * 职责：页04以正式命名视图回查原委托登记结果。
 * 边界：只读当前实例可见的原登记，不写入或重发委托决定。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readOriginalAuthorityGrantRegistration} from '@/services/smart-bid/content/review/submission/authority-grant-decision'
import {originalRegistrationView,readOriginalRegistrationView} from './original-registration-view'

type Request=Parameters<typeof readOriginalAuthorityGrantRegistration>[0]
type Registration=NonNullable<Awaited<ReturnType<Parameters<typeof readOriginalAuthorityGrantRegistration>[1]['lookup']>>>
type Registered=Extract<Registration,{status:'REGISTERED'}>
const keys=['enterpriseId','grantId','requestKey'] as const
const decisionFields=['enterpriseId','grantId','requestKey','decisionRef','decisionMakerId','decisionAuthorityRef',
 'representativeId','effectiveAt','expiresAt','knownAt']
const error='AUTHORITY_GRANT_REGISTRATION_READ'

/** 供页04所属正式场景为已经登记的模型装配原请求查询。 */
export function authorityGrantRegistrationView(primaryKey:string){
 return originalRegistrationView(primaryKey,keys,['requestDigest','status','versionId','decisionRef','decisionRecord'])
}

function isDecisionRecord(value:unknown):value is Registered['record']{
 if(!isRecord(value)||!decisionFields.every(field=>identity(value[field])))return false
 const {intent,expectedVersion,projectId,actions,objectRefs}=value
 return (intent==='REGISTER'||intent==='CHANGE'||intent==='REVOKE')&&
  (expectedVersion===null||identity(expectedVersion))&&(projectId===null||identity(projectId))&&
  Array.isArray(actions)&&Array.isArray(objectRefs)&&
  Array.from<unknown>(actions).every(identity)&&Array.from<unknown>(objectRefs).every(identity)
}

/** 只使用当前企业、当前运行实例及同请求的正式行证明。 */
export function readRegisteredAuthorityGrantRegistration(
 host:Parameters<typeof readOriginalRegistrationView>[0]&Readonly<{enterpriseId:string}>,input:Request){
 host.assertCurrent()
 if(host.enterpriseId!==input.enterpriseId)throw Error(error)
 return readOriginalAuthorityGrantRegistration(input,{assertCurrent:()=>host.assertCurrent(),lookup:async request=>{
  const {requestDigest,...original}=request
  const read=await readOriginalRegistrationView(host,{model:'AuthorityGrant'},original),{row}=read
  if(!row)return {...request,status:'UNKNOWN',assertCurrent:read.assertCurrent}
  const {status,versionId,decisionRef,decisionRecord}=row
  const fields=['requestDigest','status',...(status==='REGISTERED'?['versionId','decisionRecord']:status==='REJECTED'?['decisionRef']:[])]
  const assertCurrent=read.captureFields(fields)
  assertCurrent()
  if(row['requestDigest']!==requestDigest)throw Error(error)
  if(status==='UNKNOWN')return {...request,status,assertCurrent}
  if(status==='REJECTED'&&identity(decisionRef))return {...request,status,decisionRef,assertCurrent}
  if(status==='REGISTERED'&&identity(versionId)&&isDecisionRecord(decisionRecord))
   return {...request,status,versionId,record:decisionRecord,assertCurrent}
  throw Error(error)
 }})
}
