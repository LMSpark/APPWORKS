/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-platform-field-review
 * 职责：固定动作45平台拟填栏位、已采用答复及获准值。
 * 边界：读取方对证采用和批准原记录；拟填版本不表示已保存或提交。
 */
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'

type FieldSelection=Readonly<{projectId:string;revisionId:string;assignmentId:string;fieldId:string}>
type ProposedField=FieldSelection&Readonly<{
 responseId:string;fieldRuleRef:string;approvalRef:string;value:unknown;unit:string|null;assertCurrent:()=>void
}>
const hashFieldValue=(value:unknown,unit:string|null)=>hashCanonicalSnapshotText(
 canonicalSnapshotValue(['spark-bid.platform-field-value/1',value,unit]))

/** 非格式化值连同审批出处一并固定；同值的异版批准也产生不同版本。 */
export async function readPlatformFieldReviewVersion(selection:FieldSelection,readApproved:(input:FieldSelection)=>Promise<ProposedField>){
 const {projectId,revisionId,assignmentId,fieldId}=selection
 if(![projectId,revisionId,assignmentId,fieldId].every(identity))throw Error('CONTENT_PLATFORM_FIELD_SCOPE')
 const original=await readApproved(Object.freeze({projectId,revisionId,assignmentId,fieldId}))
 original.assertCurrent()
 const {responseId,fieldRuleRef,approvalRef,value,unit}=original
 if(original.projectId!==projectId||original.revisionId!==revisionId||original.assignmentId!==assignmentId||original.fieldId!==fieldId||
  ![responseId,fieldRuleRef,approvalRef].every(identity)||unit!==null&&!identity(unit))throw Error('CONTENT_PLATFORM_FIELD_SCOPE')
 const [versionHash,valueHash]=await Promise.all([
  hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.platform-proposed-field/1',
   projectId,assignmentId,fieldId,responseId,fieldRuleRef,approvalRef,value,unit])),
  hashFieldValue(value,unit),
 ])
 original.assertCurrent()
 return Object.freeze({projectId,revisionId,assignmentId,fieldId,responseId,fieldRuleRef,approvalRef,versionHash,valueHash,
  assertCurrent:()=>original.assertCurrent()})
}

type ApprovedField=Awaited<ReturnType<typeof readPlatformFieldReviewVersion>>
type FieldObservation=FieldSelection&Readonly<{
 stage:'DRAFT'|'SAVED'|'SUBMITTED';attemptRef:string;observationRef:string;value:unknown;unit:string|null;assertCurrent:()=>void
}>

/** 回读值须属于同一办理和栏位，保存值不能证明提交态。 */
export async function comparePlatformFieldObservation(approved:ApprovedField,expected:Readonly<{
 stage:'SAVED'|'SUBMITTED';attemptRef:string
}>,observation:FieldObservation){
 const assertCurrent=()=>{approved.assertCurrent();observation.assertCurrent()}
 assertCurrent()
 if(approved.projectId!==observation.projectId||approved.revisionId!==observation.revisionId||
  approved.fieldId!==observation.fieldId||approved.assignmentId!==observation.assignmentId||
  !identity(expected.attemptRef)||observation.attemptRef!==expected.attemptRef||!identity(observation.observationRef))
  throw Error('CONTENT_PLATFORM_FIELD_OBSERVATION_SCOPE')
 if(observation.stage!==expected.stage)
  return Object.freeze({state:'STAGE_REQUIRED' as const,observationRef:observation.observationRef,assertCurrent})
 if(observation.unit!==null&&!identity(observation.unit))throw Error('CONTENT_PLATFORM_FIELD_OBSERVATION_SCOPE')
 const observedValueHash=await hashFieldValue(observation.value,observation.unit)
 assertCurrent()
 const state=observedValueHash===approved.valueHash?'MATCHED':'MISMATCHED'
 return Object.freeze({state,observationRef:observation.observationRef,observedValueHash,assertCurrent})
}
