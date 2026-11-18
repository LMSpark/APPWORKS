/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-file-answer-reader
 * 职责：第42项以实际文件字节和同版 AnswerLocation 回读原填报位置。
 * 边界：沿原 DataView 和实件读取证据；批准事实独立核对，保存归原办理方。
 * AI用途：核对电子实件的回读位置、文件哈希与批准版本是否一致。
 */
import {buildDataViewKey,type DataView,type ViewMetadata} from '@spark-appworks/spark-data'
import {canonicalSnapshotValue} from '@/services/smart-bid/content/revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionReadHost} from '../content-revision-reader'
import {readRegisteredProducedFileReviewVersion} from './content-produced-file-review'
import type {mapOriginalForm} from '@/services/smart-bid/content/references/response/original-form-mapping'

/** 从正式文件记录和实际字节确认版本的输入合同。 */
type FileInput=Parameters<typeof readRegisteredProducedFileReviewVersion>
const scopeFields=[['projectId','projectId'],['id','observationId']] as const
const fields=['id','projectId','revisionId','documentId','producedFileId','fileHash','locationRef','value','unit']
const valid=(view:DataView)=>view.dataTable?.modelBinding?.modelName==='AnswerLocation'&&
 view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&scopeFields.every(([field,ParamName])=>
  hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName}))

/** 正式共享场景按项目和观察编号定位电子实件。 */
export function fileObservationView():ViewMetadata{
 return {autoLoad:false,autoCurrentFirst:false,autoSelectFirst:false,commitMode:'staged',
  queryConfig:{autoQuery:false,cacheType:'none',pagination:'none',fields:[...fields]},
  scopeFilter:{logic:'and',filters:scopeFields.map(([field,ParamName])=>({
   field,operator:'eq',value:{Type:'GetInputParam',ParamName},
  }))}}
}

/** 交原件及所见栏位读数。批准比较、同批装入和截止归属由各自事实另核。 */
export async function readRegisteredFileAnswer(host:ContentRevisionReadHost,observationId:string,openFile:FileInput[2]){
 host.assertCurrent()
 const {runtime,projectId,scenarioId}=host
 if(![scenarioId,projectId,observationId].every(identity))throw Error('CONTENT_FILE_ANSWER_SCOPE')
 const key=buildDataViewKey('AnswerLocation','selectedFileObservation',scenarioId),view=runtime.resolveView(key)
 if(!view||!valid(view)||view.hasEditingChanges())throw Error('CONTENT_FILE_ANSWER_VIEW_REQUIRED')
 const context={projectId,observationId}
 view.queryContext={...view.queryContext,...context}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid(view)||view.loadingError||view.hasEditingChanges()||
   Object.entries(context).some(([field,value])=>view.queryContext[field]!==value))throw Error('CONTENT_FILE_ANSWER_STALE')
 }
 await view.refresh()
 assertScope()
 const row=view.rows[0]
 if(!row||!hasCompleteSingleContentResult(view))throw Error('CONTENT_FILE_ANSWER_NOT_UNIQUE')
 const assertRead=view.captureReadResult(),assertRow=view.captureReadRow(row,fields)
 const {unit,value,locationRef,producedFileId}=row
 if(row['id']!==observationId||row['projectId']!==projectId||!identity(locationRef)||!identity(producedFileId)||
  (unit!==null&&!identity(unit))||!Object.hasOwn(row,'value'))throw Error('CONTENT_FILE_ANSWER_SCOPE')
 const file=await readRegisteredProducedFileReviewVersion({...host,assertCurrent:()=>{assertScope();assertRead();assertRow()}},
  {producedFileId},openFile)
 const assertCurrent=file.assertCurrent
 if(row['revisionId']!==file.revisionId||row['documentId']!==file.documentId||row['fileHash']!==file.versionHash)
  throw Error('CONTENT_FILE_ANSWER_SCOPE')
 const observedValueJson=canonicalSnapshotValue(value)
 assertCurrent()
 return Object.freeze({file,observationId,locationRef,observedValueJson,unit,assertCurrent})
}

/** 绑定实际文件版本和填报位置的原观察结果。 */
type FileAnswer=Awaited<ReturnType<typeof readRegisteredFileAnswer>>

/** 只有同版同位置的批准依据才能用于比对；原观察值和批准值各自保留出处。 */
export function compareApprovedFileAnswer(answer:FileAnswer,approved:Readonly<{
 projectId:string;revisionId:string;producedFileId:string;fileHash:string;locationRef:string
 approvalRef:string;value:unknown;unit:string|null;assertCurrent:()=>void
}>){
 const assertCurrent=()=>{answer.assertCurrent();approved.assertCurrent()}
 assertCurrent()
 const {file,locationRef}=answer,{approvalRef,unit}=approved
 if(approved.projectId!==file.projectId||approved.revisionId!==file.revisionId||approved.producedFileId!==file.producedFileId||
  approved.fileHash!==file.versionHash||approved.locationRef!==locationRef||!identity(approvalRef)||(unit!==null&&!identity(unit)))
  throw Error('CONTENT_FILE_ANSWER_APPROVAL_SCOPE')
 const valueJson=canonicalSnapshotValue(approved.value)
 return Object.freeze({state:answer.observedValueJson===valueJson&&answer.unit===unit?'MATCHED':'MISMATCHED',
  approvalRef,valueJson,unit,assertCurrent})
}

/** 承接动作33的原表栏位及制作登记的实件定位，不用原表行号猜实际文件位置。 */
export function verifyOriginalFormFileAnswer(
 answer:FileAnswer,mapping:ReturnType<typeof mapOriginalForm>,placement:Readonly<{
  fieldRef:string;formRef:string;formVersion:string;cellRef:string;locationRef:string
  revisionId:string;producedFileId:string;fileHash:string;assertCurrent:()=>void
 }>,
){
 const assertCurrent=()=>{answer.assertCurrent();mapping.assertCurrent();placement.assertCurrent()}
 assertCurrent()
 const {file}=answer
 const field=mapping.mappings.find(item=>item.fieldRef===placement.fieldRef)
 if(field?.cell.cellRef!==placement.cellRef||mapping.projectId!==file.projectId||
  mapping.formRef!==placement.formRef||mapping.formVersion!==placement.formVersion||
  placement.locationRef!==answer.locationRef||placement.revisionId!==file.revisionId||
  placement.producedFileId!==file.producedFileId||placement.fileHash!==file.versionHash)
  throw Error('CONTENT_FILE_ANSWER_FORM_SCOPE')
 return Object.freeze({fieldRef:field.fieldRef,cellRef:field.cell.cellRef,formVersion:mapping.formVersion,
  displayRef:field.cell.displayRef,expectedUnit:field.cell.unit,observedUnit:answer.unit,
  unitMatched:field.cell.unit===answer.unit,assertCurrent})
}
