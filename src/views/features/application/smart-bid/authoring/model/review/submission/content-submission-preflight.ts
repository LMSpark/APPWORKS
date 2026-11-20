/**
 * @module app:views/features/application/smart-bid/authoring/model/review/submission/content-submission-preflight
 * 职责：第51项固定待发送包与平台栏，交发送前的原办理检查。
 */
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {checkRegisteredAuthorityGrant} from '@/services/smart-bid/content/review/submission/authority-grant-coverage'
import type {recoverSubmissionAttempt} from '@/services/smart-bid/content/review/submission-attempt-recovery'
import {comparePlatformFieldObservation} from '../content-platform-field-review'
import type {assessSubmissionPackageRelease} from '../package/content-package-release'

type ApprovedField=Parameters<typeof comparePlatformFieldObservation>[0]
type SavedObservation=Parameters<typeof comparePlatformFieldObservation>[2]
type Release=ReturnType<typeof assessSubmissionPackageRelease>
type FieldRequirement=Readonly<{assignmentId:string;fieldId:string;versionHash:string;savedReadbackRequired:boolean}>
/** 同一次原办理回查所得的撤换目标证据。 */
type AttemptProof=ReturnType<typeof recoverSubmissionAttempt>
/** 仅由同一事项的原规则、原批次及撤回授权提供。 */
type CombinedWithdrawal=Readonly<{
 target:AttemptProof;ruleRef:string;allowed:boolean
 grantId:string;knownAt:string;authority:Parameters<typeof checkRegisteredAuthorityGrant>[1];assertCurrent:()=>void
}>
const fieldKey=({assignmentId,fieldId}:Pick<FieldRequirement,'assignmentId'|'fieldId'>)=>JSON.stringify([assignmentId,fieldId])

/** 登记待发原请求所需的固定引用；后续按包摘要和栏位版本取原值。 */
export async function prepareSubmissionRequest(start:ReturnType<typeof checkSubmissionStart>,requestKey:string){
 start.assertCurrent()
 const {represented,channelId,windowEvidenceRef,priorAttemptRef,withdrawal}=start
 const {contents,authority,enterpriseId,representativeId,objectRef,actionAt}=represented
 if(start.state!=='READY'||!identity(requestKey)||!identity(authority.versionId)||!identity(authority.decisionRef))
  throw Error('SUBMISSION_REQUEST_NOT_READY')
 const {projectId,revisionId,attemptRef}=contents
 const fields=Object.freeze(contents.fields.map(({assignmentId,fieldId,versionHash,savedReadbackRequired})=>
  Object.freeze({assignmentId,fieldId,versionHash,savedReadbackRequired})).sort((left,right)=>{
  const a=fieldKey(left),b=fieldKey(right)
  return a<b?-1:a>b?1:0
 }))
 const record=Object.freeze({requestKey,projectId,revisionId,attemptRef,enterpriseId,representativeId,objectRef,actionAt,
  channelId,windowEvidenceRef,priorAttemptRef,authorityVersionId:authority.versionId,authorityDecisionRef:authority.decisionRef,
  package:contents.package,fields,...(withdrawal??{})})
 const requestDigest=await hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.submission-request/1',record]))
 start.assertCurrent()
 return Object.freeze({record,requestDigest,assertCurrent:start.assertCurrent})
}

/** 在实际发起前再核适用窗口和原办理查重，未知时保留原办理待查。 */
export function checkSubmissionStart(represented:Awaited<ReturnType<typeof checkRepresentedSubmission>>,source:Readonly<{
 projectId:string;objectRef:string;channelId:string;attemptRef:string;openedAt:string;closesAt:string;includesClose:boolean
 windowEvidenceRef:string;prior:AttemptProof|null;combinedWithdrawal?:CombinedWithdrawal;assertCurrent:()=>void
}>){
 const {prior,combinedWithdrawal}=source
 const assertCurrent=()=>{
  represented.assertCurrent();source.assertCurrent();prior?.assertCurrent()
  combinedWithdrawal?.assertCurrent();combinedWithdrawal?.target.assertCurrent()
 }
 assertCurrent()
 const {projectId,objectRef,channelId,attemptRef,openedAt,closesAt,windowEvidenceRef}=source
 const {includesClose}=source
 const {actionAt}=represented
 if(projectId!==represented.contents.projectId||attemptRef!==represented.contents.attemptRef||
  objectRef!==represented.objectRef||![channelId,windowEvidenceRef].every(identity)||
  prior!==null&&(prior.projectId!==projectId||prior.channelId!==channelId||prior.lotId!==objectRef||
   prior.subjectId!==represented.enterpriseId))throw Error('SUBMISSION_START_SCOPE')
 const dates=[openedAt,actionAt,closesAt].map(value=>{
  const instant=Date.parse(value)
  if(!Number.isFinite(instant)||!/(?:Z|[+-]\d{2}:\d{2})$/u.test(value))throw Error('SUBMISSION_START_WINDOW')
  return instant
 })
 const [open,action,close]=dates
 if(open===undefined||action===undefined||close===undefined||open>=close||typeof includesClose!=='boolean')
  throw Error('SUBMISSION_START_WINDOW')
 const withdrawal=combinedWithdrawal?checkCombinedWithdrawal(represented,source,combinedWithdrawal):null
 const state=prior?.status==='UNKNOWN'||prior?.status==='PARTIAL'?'ORIGINAL_PENDING':
  prior!==null&&(prior.status!=='NOT_EXECUTED'||prior.attemptRef===attemptRef)?'ORIGINAL_ALREADY_RECORDED':
   action<open||action>close||action===close&&!includesClose?'OUTSIDE_WINDOW':
    represented.authorizedContentsReady&&(!combinedWithdrawal||withdrawal?.record)?'READY':'NOT_READY'
 const assertReady=()=>{assertCurrent();withdrawal?.assertCurrent()}
 assertReady()
 return Object.freeze({state,represented,channelId,windowEvidenceRef,priorAttemptRef:prior?.attemptRef??null,
  withdrawal:withdrawal?.record??null,assertCurrent:assertReady})
}

function checkCombinedWithdrawal(represented:Awaited<ReturnType<typeof checkRepresentedSubmission>>,scope:Readonly<{
 projectId:string;objectRef:string;channelId:string;attemptRef:string;prior:AttemptProof|null
}>,source:CombinedWithdrawal){
 const {enterpriseId,representativeId,actionAt}=represented
 const {target,ruleRef,grantId,knownAt}=source
 const {projectId,objectRef,channelId,attemptRef,prior}=scope
 if(target.projectId!==projectId||target.lotId!==objectRef||target.channelId!==channelId||target.subjectId!==enterpriseId||
  target.attemptRef===attemptRef||target.attemptRef===prior?.attemptRef||!identity(ruleRef))
  throw Error('SUBMISSION_COMBINED_WITHDRAWAL_SCOPE')
 const grant=checkRegisteredAuthorityGrant({enterpriseId,grantId,representativeId,projectId,action:'WITHDRAW',
  objectRef,actionAt,knownAt},source.authority)
 const applicable=source.allowed===true&&target.status==='DISPATCHED'&&grant.state==='COVERED'
 const record=applicable&&grant.versionId&&grant.decisionRef?Object.freeze({
  combinedWithdrawalTarget:target.attemptRef,withdrawalEvidenceRef:target.evidenceRef,withdrawalRuleRef:ruleRef,
  withdrawalAuthorityVersionId:grant.versionId,withdrawalAuthorityDecisionRef:grant.decisionRef,
 }):null
 return {record,assertCurrent:grant.assertCurrent}
}

/** 交付内容和经办人的代表权按同一待递交事项核准。 */
export async function checkRepresentedSubmission(input:Parameters<typeof checkSubmissionContents>[0],sources:Readonly<{
 contents:Parameters<typeof checkSubmissionContents>[1]
 operation:Readonly<{enterpriseId:string;grantId:string;representativeId:string;objectRef:string;actionAt:string;knownAt:string;assertCurrent:()=>void}>
 authority:Parameters<typeof checkRegisteredAuthorityGrant>[1]
}>){
 const {operation,authority}=sources
 operation.assertCurrent()
 const active=checkRegisteredAuthorityGrant({...operation,projectId:input.projectId,action:'SUBMIT'},authority)
 const contents=await checkSubmissionContents(input,sources.contents)
 const assertCurrent=()=>{operation.assertCurrent();active.assertCurrent();contents.assertCurrent()}
 assertCurrent()
 return Object.freeze({contents,authority:active,enterpriseId:operation.enterpriseId,representativeId:operation.representativeId,
  objectRef:operation.objectRef,actionAt:operation.actionAt,
  authorizedContentsReady:active.state==='COVERED'&&contents.contentsReady,assertCurrent})
}

/** 文件与字段均须按原要求核齐，提交后才可回读的栏保留待核。 */
export async function checkSubmissionContents(input:Readonly<{
 projectId:string;revisionId:string;attemptRef:string;assertCurrent:()=>void
 package:Readonly<Pick<Release,'packageId'|'packageHash'|'selectionHash'>>|null
 fields:readonly FieldRequirement[]
}>,sources:Readonly<{
 release:Release|null;fields:readonly ApprovedField[];observations:readonly SavedObservation[]
}>){
 const {projectId,revisionId,attemptRef}=input
 const expectedPack=input.package&&Object.freeze({
  packageId:input.package.packageId,packageHash:input.package.packageHash,selectionHash:input.package.selectionHash,
 })
 const fields=input.fields.map(field=>Object.freeze({...field}))
 const approved=[...sources.fields],observations=[...sources.observations],release=sources.release
 const assertCurrent=()=>{
  input.assertCurrent();release?.assertCurrent()
  for(const item of [...approved,...observations])item.assertCurrent()
 }
 assertCurrent()
 const error='SUBMISSION_PREFLIGHT_SCOPE'
 if(![projectId,revisionId,attemptRef].every(identity)||(!expectedPack&&!fields.length))throw Error(error)
 if(expectedPack&&(!identity(expectedPack.packageId)||
  ![expectedPack.packageHash,expectedPack.selectionHash].every(hash=>/^[a-f0-9]{64}$/u.test(hash))))throw Error(error)
 if(release&&(!expectedPack||release.projectId!==projectId||release.packageId!==expectedPack.packageId||
  release.packageHash!==expectedPack.packageHash||release.selectionHash!==expectedPack.selectionHash))throw Error(error)
 const required=new Map(fields.map(item=>[fieldKey(item),item]))
 if(required.size!==fields.length||fields.some(item=>![item.assignmentId,item.fieldId].every(identity)||
  !/^[a-f0-9]{64}$/u.test(item.versionHash)||typeof item.savedReadbackRequired!=='boolean'))throw Error(error)
 const versions=new Map(approved.map(item=>[fieldKey(item),item])),saved=new Map(observations.map(item=>[fieldKey(item),item]))
 if(versions.size!==approved.length||saved.size!==observations.length||
  approved.some(item=>!required.has(fieldKey(item))||item.projectId!==projectId||item.revisionId!==revisionId)||
  observations.some(item=>!required.get(fieldKey(item))?.savedReadbackRequired||
   item.projectId!==projectId||item.revisionId!==revisionId||item.attemptRef!==attemptRef))throw Error(error)
 const results=[]
 for(const requirement of fields){
  const id=fieldKey(requirement),version=versions.get(id),observation=saved.get(id)
  const state=version?.versionHash!==requirement.versionHash?'APPROVED_VERSION_REQUIRED':
   !requirement.savedReadbackRequired?'POST_SUBMISSION_REQUIRED':
    !observation?'SAVED_READBACK_REQUIRED':(await comparePlatformFieldObservation(version,{stage:'SAVED',attemptRef},observation)).state
  results.push(Object.freeze({...requirement,state}))
 }
 assertCurrent()
 const packageReady=expectedPack===null||release?.deliverable===true
 return Object.freeze({projectId,revisionId,attemptRef,package:expectedPack,packageReady,fields:Object.freeze(results),
  contentsReady:packageReady&&results.every(item=>item.state==='MATCHED'||item.state==='POST_SUBMISSION_REQUIRED'),assertCurrent})
}
