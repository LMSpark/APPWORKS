/**
 * @module app:views/features/application/smart-bid/response/model/response-assignment-reader
 * 职责：按固定编制范围回读原答复分工及各落点职责。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {originalRegistrationView,readOriginalRegistrationView} from '../../authority/original-registration-view'
import {prepareResponseDraft} from '@/services/smart-bid/content/references/response/response-draft'

const model='ResponseAssignment',viewName='selectedResponseAssignment'
const keys=['projectId','baselineId','id']
const fields=['lineageId','version','assignments']
const error='BID_RESPONSE_ORIGINAL_ASSIGNMENT'

/** 读原分工，不从当前承办人或相同落点反推分工身份。 */
export function responseAssignmentReadView(primaryKey:string){
 return originalRegistrationView(primaryKey,keys,fields)
}

export async function readRegisteredResponseAssignment(
 host:Parameters<typeof readOriginalRegistrationView>[0]&Readonly<{projectId:string;baselineId:string}>,
 assignmentId:string,
){
 const {projectId,baselineId}=host
 if(![projectId,baselineId,assignmentId].every(identity))throw Error(error)
 const result=await readOriginalRegistrationView(host,{model,viewName},{projectId,baselineId,id:assignmentId})
 if(!result.row)return Object.freeze({state:'UNAVAILABLE' as const,assertCurrent:result.assertCurrent})
 const assertCurrent=result.captureFields(fields)
 assertCurrent()
 const {lineageId,version,assignments}=result.row
 if(!identity(lineageId)||!identity(version)||!Array.isArray(assignments)||!assignments.length)throw Error(error)
 const seen=new Set<string>()
 const rows=Object.freeze(assignments.map((item:unknown)=>{
  if(!isRecord(item))throw Error(error)
  const {targetRef,kind,duty,assigneeRef,dueAt}=item
  if(!identity(targetRef)||!identity(assigneeRef)||typeof dueAt!=='number'||!Number.isSafeInteger(dueAt)||
   (kind!=='DOCUMENT'&&kind!=='FORM_CELL'&&kind!=='PLATFORM_FIELD')||
   (duty!=='LEAD'&&duty!=='SEPARATE'&&duty!=='EVIDENCE'))throw Error(error)
  const key=JSON.stringify([kind,targetRef,duty])
  if(seen.has(key))throw Error(error)
  seen.add(key)
  return Object.freeze({targetRef,kind,duty,assigneeRef,dueAt})
 }))
 return Object.freeze({state:'READ' as const,projectId,baselineId,assignmentId,lineageId,version,assignments:rows,assertCurrent})
}

type DraftInput=Parameters<typeof prepareResponseDraft>[0]
type DraftSource=Parameters<typeof prepareResponseDraft>[1]
type RegisteredAssignment=Extract<Awaited<ReturnType<typeof readRegisteredResponseAssignment>>,{state:'READ'}>
type Duty=RegisteredAssignment['assignments'][number]

/** 先核原分工的要求版及落点职责，再向原任务责任方取得现行办理证明。 */
export async function prepareRegisteredResponseDraft(
 host:Parameters<typeof readRegisteredResponseAssignment>[0],
 target:Pick<DraftInput,'assignmentId'|'targetRef'|'authorRef'|'at'|'body'>&Pick<Duty,'kind'|'duty'>,
 readSource:(assignment:RegisteredAssignment,destination:Duty)=>Promise<DraftSource>,
){
 const {assignmentId,targetRef,authorRef,at,body,kind,duty}=target
 const original=await readRegisteredResponseAssignment(host,assignmentId)
 if(original.state!=='READ')throw Error(error)
 const destination=original.assignments.find(item=>item.targetRef===targetRef&&item.kind===kind&&item.duty===duty)
 if(!destination||duty==='EVIDENCE')throw Error(error)
 const source=await readSource(original,destination)
 const {projectId,baselineId,lineageId,version}=original
 const assertCurrent=()=>{original.assertCurrent();source.assertCurrent()}
 return prepareResponseDraft({projectId,baselineId,assignmentId,lineageId,version,targetRef,authorRef,at,body},
  {...source,assertCurrent})
}
