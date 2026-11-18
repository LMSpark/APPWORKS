/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-platform-field-review
 * 职责：固定动作45平台拟填栏位、已采用答复及获准值。
 * 边界：读取方对证采用和批准原记录；拟填版本不表示已保存或提交。
 */
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {buildDataViewKey,type DataView,type ViewMetadata} from '@spark-appworks/spark-data'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionReadHost} from '../content-revision-reader'
import {readPlatformSubmissionReceipt} from './submission/content-submission-receipt-reader'

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
type SubmissionEvidence=Readonly<{
 projectId:string;revisionId:string;attemptRef:string;receiptRef:string;observationRefs:readonly string[];assertCurrent:()=>void
}>
type ExpectedObservation=Readonly<{stage:'SAVED'|'SUBMITTED';attemptRef:string;submission?:SubmissionEvidence}>

/** 回读值须属于同一办理和栏位，保存值不能证明提交态。 */
export async function comparePlatformFieldObservation(approved:ApprovedField,expected:ExpectedObservation,observation:FieldObservation){
 const submission=expected.stage==='SUBMITTED'?expected.submission:undefined
 const assertCurrent=()=>{approved.assertCurrent();observation.assertCurrent();submission?.assertCurrent()}
 assertCurrent()
 if(approved.projectId!==observation.projectId||approved.revisionId!==observation.revisionId||
  approved.fieldId!==observation.fieldId||approved.assignmentId!==observation.assignmentId||
  !identity(expected.attemptRef)||observation.attemptRef!==expected.attemptRef||!identity(observation.observationRef))
  throw Error('CONTENT_PLATFORM_FIELD_OBSERVATION_SCOPE')
 if(observation.stage!==expected.stage)
  return Object.freeze({state:'STAGE_REQUIRED' as const,observationRef:observation.observationRef,assertCurrent})
 if(expected.stage==='SUBMITTED'){
  if(!submission)return Object.freeze({state:'RECEIPT_REQUIRED' as const,observationRef:observation.observationRef,assertCurrent})
  if(submission.projectId!==approved.projectId||submission.revisionId!==approved.revisionId||submission.attemptRef!==expected.attemptRef||
   !identity(submission.receiptRef)||!submission.observationRefs.includes(observation.observationRef))
   throw Error('CONTENT_PLATFORM_FIELD_RECEIPT_SCOPE')
 }
 if(observation.unit!==null&&!identity(observation.unit))throw Error('CONTENT_PLATFORM_FIELD_OBSERVATION_SCOPE')
 const observedValueJson=canonicalSnapshotValue(observation.value),unit=observation.unit
 const observedValueHash=await hashFieldValue(observation.value,unit)
 assertCurrent()
 const state=observedValueHash===approved.valueHash?'MATCHED':'MISMATCHED'
 return Object.freeze({state,observationRef:observation.observationRef,observedValueHash,observedValueJson,unit,
  ...(submission?{receiptRef:submission.receiptRef}:{}),assertCurrent})
}

const observationFields=['id','projectId','revisionId','assignmentId','fieldId','attemptRef','stage','value','unit']
const scopeFields=[['projectId','projectId'],['id','observationId'],['attemptRef','attemptRef']] as const
/** 正式共享场景按项目、观察编号和办理编号读取原观察。 */
export function platformObservationView():ViewMetadata{
 return {autoLoad:false,autoCurrentFirst:false,autoSelectFirst:false,commitMode:'staged',
  queryConfig:{autoQuery:false,cacheType:'none',pagination:'none',fields:[...observationFields]},
  scopeFilter:{logic:'and',filters:scopeFields.map(([field,ParamName])=>({
   field,operator:'eq',value:{Type:'GetInputParam',ParamName},
  }))}}
}

function readObservation(row:Readonly<Record<string,unknown>>,assertCurrent:()=>void):FieldObservation{
 const {id,projectId,revisionId,assignmentId,fieldId,attemptRef,stage,value,unit}=row
 if(!identity(id)||!identity(projectId)||!identity(revisionId)||!identity(assignmentId)||!identity(fieldId)||!identity(attemptRef)||
  (stage!=='DRAFT'&&stage!=='SAVED'&&stage!=='SUBMITTED')||unit!==null&&!identity(unit))
  throw Error('CONTENT_PLATFORM_FIELD_OBSERVATION_SCOPE')
 return {observationRef:id,projectId,revisionId,assignmentId,fieldId,attemptRef,stage,value,unit,assertCurrent}
}
function validObservationView(view:DataView):boolean{
 return view.dataTable?.modelBinding?.modelName==='AnswerLocation'&&view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&
  scopeFields.every(([field,param])=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:param}))
}

/** 按同次原办理只读回读指定平台观察，保留原行证明到比较结果。 */
export async function readPlatformFieldObservation(host:ContentRevisionReadHost,approved:ApprovedField,input:
 Readonly<{observationId:string;stage:'SAVED'|'SUBMITTED';attemptRef:string;receiptRef?:string}>){
 const {projectId,scenarioId,runtime}=host,{observationId,attemptRef,stage,receiptRef}=input
 const assertOwner=()=>{host.assertCurrent();approved.assertCurrent()}
 assertOwner()
 if(projectId!==approved.projectId||![scenarioId,observationId,attemptRef].every(identity))throw Error('CONTENT_PLATFORM_FIELD_OBSERVATION_SCOPE')
 const key=buildDataViewKey('AnswerLocation','selectedPlatformObservation',scenarioId),view=runtime.resolveView(key)
 if(!view||!validObservationView(view)||view.hasEditingChanges())throw Error('CONTENT_PLATFORM_FIELD_OBSERVATION_VIEW')
 const context={projectId,observationId,attemptRef}
 view.queryContext={...view.queryContext,...context}
 const assertScope=()=>{
  assertOwner()
  if(runtime.resolveView(key)!==view||!validObservationView(view)||view.loadingError||view.hasEditingChanges()||
   Object.entries(context).some(([field,value])=>view.queryContext[field]!==value))throw Error('CONTENT_PLATFORM_FIELD_OBSERVATION_STALE')
 }
 await view.refresh();assertScope()
 if(!hasCompleteSingleContentResult(view))throw Error('CONTENT_PLATFORM_FIELD_OBSERVATION_NOT_UNIQUE')
 const row=view.rows[0]
 if(row?.['id']!==observationId||row['projectId']!==projectId||row['attemptRef']!==attemptRef||
  row['revisionId']!==approved.revisionId||row['assignmentId']!==approved.assignmentId||row['fieldId']!==approved.fieldId)
  throw Error('CONTENT_PLATFORM_FIELD_OBSERVATION_SCOPE')
 const assertResult=view.captureReadResult(),assertRow=view.captureReadRow(row,observationFields)
 const assertObservation=()=>{assertScope();assertResult();assertRow()}
 assertObservation()
 const observation=readObservation(row,assertObservation)
 const submission=stage==='SUBMITTED'&&receiptRef!==undefined?
  await readPlatformSubmissionReceipt({...host,assertCurrent:assertObservation},{receiptRef,attemptRef,revisionId:approved.revisionId}):
  undefined
 if(submission&&!submission.observationRefs.includes(observationId))throw Error('CONTENT_PLATFORM_FIELD_RECEIPT_SCOPE')
 return comparePlatformFieldObservation(approved,{attemptRef,stage,...(submission?{submission}:{})},observation)
}

/** 同一回执覆盖的多个栏位一次读取，保留原回执及全部观察证明。 */
export async function readSubmittedPlatformFields(host:ContentRevisionReadHost,input:Readonly<{
 receiptRef:string;attemptRef:string;revisionId:string;fields:ReadonlyArray<Readonly<{observationId:string;approved:ApprovedField}>>
}>){
 const {projectId,scenarioId,runtime}=host,{receiptRef,attemptRef,revisionId}=input
 const requested=new Map(input.fields.map(({observationId,approved})=>[observationId,approved]))
 const fieldKeys=new Set([...requested.values()].map(item=>JSON.stringify([item.assignmentId,item.fieldId])))
 const assertOwner=()=>{host.assertCurrent();for(const approved of requested.values())approved.assertCurrent()}
 assertOwner()
 if(!identity(scenarioId)||!requested.size||requested.size!==input.fields.length||fieldKeys.size!==requested.size||
  [...requested].some(([id,approved])=>!identity(id)||approved.projectId!==projectId||approved.revisionId!==revisionId))
  throw Error('CONTENT_PLATFORM_FIELD_OBSERVATION_SCOPE')
 const submission=await readPlatformSubmissionReceipt({...host,assertCurrent:assertOwner},{receiptRef,attemptRef,revisionId})
 if([...requested.keys()].some(id=>!submission.observationRefs.includes(id)))throw Error('CONTENT_PLATFORM_FIELD_RECEIPT_SCOPE')
 const key=buildDataViewKey('AnswerLocation','submittedPlatformObservations',scenarioId),view=runtime.resolveView(key)
 const valid=()=>view?.dataTable?.modelBinding?.modelName==='AnswerLocation'&&view.commitMode==='staged'&&
  view.queryConfig.autoQuery===false&&view.queryConfig.allPages===true&&view.queryConfig.pagination==='paged'&&
  scopeFields.filter(([field])=>field!=='id').every(([field,param])=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:param}))
 if(!view||!valid()||view.hasEditingChanges())throw Error('CONTENT_PLATFORM_FIELD_OBSERVATION_VIEW')
 view.queryContext={...view.queryContext,projectId,attemptRef}
 view.filterExpression={field:'id',operator:'in',value:[...requested.keys()]}
 const signature=JSON.stringify(view.filterExpression)
 const assertScope=()=>{
  submission.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid()||view.hasEditingChanges()||view.queryContext['projectId']!==projectId||
   view.queryContext['attemptRef']!==attemptRef||JSON.stringify(view.filterExpression)!==signature)
   throw Error('CONTENT_PLATFORM_FIELD_OBSERVATION_STALE')
 }
 await view.refresh();assertScope()
 const assertResult=view.captureReadResult()
 if(view.countReported!==true||view.total!==requested.size||view.rows.length!==requested.size||view.nextPageAvailable===true)
  throw Error('CONTENT_PLATFORM_FIELD_OBSERVATION_INCOMPLETE')
 const rows=new Map(view.rows.map(row=>[row['id'],row]))
 if(rows.size!==requested.size)throw Error('CONTENT_PLATFORM_FIELD_OBSERVATION_SCOPE')
 const results=await Promise.all([...requested].map(async ([id,approved])=>{
  const row=rows.get(id)
  if(!row)throw Error('CONTENT_PLATFORM_FIELD_OBSERVATION_SCOPE')
  const assertRow=view.captureReadRow(row,observationFields)
  const comparison=await comparePlatformFieldObservation(approved,{stage:'SUBMITTED',attemptRef,submission},
   readObservation(row,()=>{assertScope();assertResult();assertRow()}))
  return Object.freeze({...comparison,assignmentId:approved.assignmentId,fieldId:approved.fieldId})
 }))
 const assertCurrent=()=>{for(const result of results)result.assertCurrent()}
 assertCurrent()
 return Object.freeze({projectId,revisionId,attemptRef,receiptRef,results:Object.freeze(results),
  allSelectedFieldsMatched:results.every(item=>item.state==='MATCHED'),assertCurrent})
}

/** 按原回执和原观察双向固定同次提交的栏位值。 */
export async function readSubmittedPlatformField(host:ContentRevisionReadHost,approved:ApprovedField,input:Readonly<{
 observationId:string;receiptRef:string;attemptRef:string
}>){
 return readPlatformFieldObservation(host,approved,{...input,stage:'SUBMITTED'})
}
