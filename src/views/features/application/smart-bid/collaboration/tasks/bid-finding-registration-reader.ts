/**
 * @module app:views/features/application/smart-bid/collaboration/tasks/bid-finding-registration-reader
 * 职责：第43项只以同项目已完成原检查办理固定登记输入。
 */
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {prepareReviewFindingRegistration} from '@/services/smart-bid/content/review/finding/review-finding-registration'
import {originalRegistrationView,readOriginalRegistrationView} from '../../authority/original-registration-view'

type Registration=Parameters<typeof prepareReviewFindingRegistration>
type RecordInput=Pick<Registration[1],'projectId'|'target'|'checkRef'|'assertCurrent'>
const keys=['projectId','checkRef']
const fields=['state','targetKind','targetId','targetVersionRef','effectiveHash','ruleRef','authorityRef','reviewerId','checkedAt']
const kinds=['CONTENT','FILE','FIELD','PACKAGE','SUBMISSION','VALIDATION'] as const
const error='REVIEW_COMPLETED_CHECK_REQUIRED'

/** 装配页15原检查视图。字段由正式 CheckFinding 模型供给。 */
export function bidFindingRegistrationView(primaryKey:string){
 return originalRegistrationView(primaryKey,keys,fields)
}

/** 查询已完成原检查，再读取同位置问题证据；原检查未完成时零派发。 */
export async function prepareRegisteredBidFinding(
 host:Parameters<typeof readOriginalRegistrationView>[0]&Readonly<{projectId:string}>,
 selection:Readonly<{checkRef:string;requestKey:string}>,
 readFindings:(check:RecordInput)=>Promise<Pick<Registration[1],'finding'|'observations'|'assertCurrent'>>){
 const {projectId}=host,{checkRef,requestKey}=selection
 host.assertCurrent()
 if(![projectId,checkRef,requestKey].every(identity))throw Error(error)
 const read=await readOriginalRegistrationView(host,{model:'CheckFinding',viewName:'originalCompletedCheck'},{projectId,checkRef})
 const {row}=read
 if(!row)throw Error(error)
 const assertCheck=read.captureFields(fields)
 assertCheck()
 const {state,targetKind,targetId,targetVersionRef,effectiveHash,ruleRef,authorityRef,reviewerId,checkedAt}=row
 const kind=kinds.find(value=>value===targetKind)
 if(state!=='COMPLETED'||!kind||!identity(targetId)||!identity(targetVersionRef)||!identity(effectiveHash)||
  !/^[a-f0-9]{64}$/u.test(effectiveHash)||!identity(ruleRef)||!identity(authorityRef)||!identity(reviewerId)||!identity(checkedAt))
  throw Error(error)
 const target=Object.freeze({kind,targetId,versionRef:targetVersionRef,effectiveHash})
 const selected=await readFindings(Object.freeze({projectId,target,checkRef,assertCurrent:assertCheck}))
 return prepareReviewFindingRegistration({projectId,requestKey,target},{
  ...selected,projectId,target,checkRef,ruleRef,authorityRef,reviewerId,checkedAt,assertCurrent:()=>{assertCheck();selected.assertCurrent()},
 })
}

const resultKeys=['projectId','checkRef','requestKey']
const resultFields=['requestDigest','id','findingId']

/** 按原请求查已登记的问题或零问题覆盖。 */
export function bidFindingRegistrationResultView(primaryKey:string){
 return originalRegistrationView(primaryKey,resultKeys,resultFields)
}

/** 丢回执后按原请求回读，无登记证据保持待确认。 */
export async function readBidFindingRegistrationResult(
 host:Parameters<typeof prepareRegisteredBidFinding>[0],
 input:Readonly<{checkRef:string;requestKey:string;requestDigest:string}>){
 const {projectId}=host,{checkRef,requestKey,requestDigest}=input
 const resultError='REVIEW_FINDING_REGISTRATION_RESULT_SCOPE'
 host.assertCurrent()
 if(![projectId,checkRef,requestKey].every(identity)||!/^[a-f0-9]{64}$/u.test(requestDigest))throw Error(resultError)
 const read=await readOriginalRegistrationView(host,{model:'CheckFinding',viewName:'originalFindingRegistration'},
  {projectId,checkRef,requestKey})
 if(!read.row)return Object.freeze({state:'UNKNOWN' as const,assertCurrent:read.assertCurrent})
 const assertCurrent=read.captureFields(resultFields)
 assertCurrent()
 const {id:registrationRef,findingId}=read.row
 if(read.row['requestDigest']!==requestDigest||!identity(registrationRef)||(findingId!==null&&!identity(findingId)))throw Error(resultError)
 return Object.freeze({state:'REGISTERED' as const,registrationRef,findingId,assertCurrent})
}
