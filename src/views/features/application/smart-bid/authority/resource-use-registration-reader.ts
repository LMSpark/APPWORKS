/**
 * @module app:views/features/application/smart-bid/authority/resource-use-registration-reader
 * 职责：页06按原资料版本、申请和决定链回查使用决定。
 * 边界：当前企业必须属于原申请，字段可读性由正式查询证据决定。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readOriginalResourceUseRegistration} from '@/services/smart-bid/content/references/resource-use/resource-use-decision'
import {originalRegistrationView,readOriginalRegistrationView} from './original-registration-view'

type Request=Parameters<typeof readOriginalResourceUseRegistration>[0]
type Outcome=Awaited<ReturnType<typeof readOriginalResourceUseRegistration>>
type Decision=Extract<Outcome,{status:'REGISTERED'}>['record']
const scope=['sourceEnterpriseId','recipientEnterpriseId','projectId','applicationRef','resourceVersionId','decisionChainId'] as const
const keys=[...scope,'requestKey']
const decisionFields=[...scope,'requestKey','decisionRef','decisionEnterpriseId','decisionMakerId','authorityRef','effectiveAt','knownAt']
const error='RESOURCE_USE_REGISTRATION_READ'

/** 为页06正式登记模型提供原请求命名视图。 */
export function resourceUseRegistrationView(primaryKey:string){
 return originalRegistrationView(primaryKey,keys,['requestDigest','status','versionId','receiptRef','decisionRecord'])
}

function isDecisionRecord(value:unknown):value is Decision{
 if(!isRecord(value)||!decisionFields.every(field=>identity(value[field])))return false
 const {intent,expectedVersion,uses}=value
 return (intent==='ALLOW'||intent==='DENY'||intent==='CHANGE'||intent==='REVOKE')&&
  (expectedVersion===null||identity(expectedVersion))&&Array.isArray(uses)&&Array.from<unknown>(uses).every(use=>
   isRecord(use)&&identity(use['purposeId'])&&identity(use['recipientId'])&&identity(use['expiresAt'])&&
   Array.isArray(use['fieldIds'])&&Array.from<unknown>(use['fieldIds']).every(identity))
}

/** 核定当前场景、项目和企业对应原决定，再复算原请求摘要。 */
export function readRegisteredResourceUseRegistration(
 host:Parameters<typeof readOriginalRegistrationView>[0]&Readonly<{enterpriseId:string;projectId:string}>,input:Request){
 host.assertCurrent()
 if(host.projectId!==input.projectId||
  (host.enterpriseId!==input.sourceEnterpriseId&&host.enterpriseId!==input.recipientEnterpriseId))throw Error(error)
 return readOriginalResourceUseRegistration(input,{assertCurrent:()=>host.assertCurrent(),lookup:async request=>{
  const {requestDigest,...original}=request
  const read=await readOriginalRegistrationView(host,{model:'ResourceUseDecision'},original),{row}=read
  if(!row)return {...request,status:'UNKNOWN',assertCurrent:read.assertCurrent}
  const {status,versionId,receiptRef,decisionRecord}=row
  const fields=['requestDigest','status',...(status==='REGISTERED'?['versionId','decisionRecord']:status==='REJECTED'?['receiptRef']:[])]
  const assertCurrent=read.captureFields(fields)
  assertCurrent()
  if(row['requestDigest']!==requestDigest)throw Error(error)
  if(status==='UNKNOWN')return {...request,status,assertCurrent}
  if(status==='REJECTED'&&identity(receiptRef))return {...request,status,receiptRef,assertCurrent}
  if(status==='REGISTERED'&&identity(versionId)&&isDecisionRecord(decisionRecord))
   return {...request,status,versionId,record:decisionRecord,assertCurrent}
  throw Error(error)
 }})
}
