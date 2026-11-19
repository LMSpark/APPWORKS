/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-paper-answer-reader
 * 职责：第42项回读原纸件、份次及页栏；封装归属及截止另核。
 * 边界：纸件登记提供份次与页标识，SPARK Data 提供原填报位置及可读值。
 * AI用途：核对纸件观察是否对应实际登记份次和页栏。
 */
import {buildDataViewKey,type DataView,type ViewMetadata} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {canonicalSnapshotValue} from '@/services/smart-bid/content/revision-snapshot-hash'
import type {preparePaperOutputRegistration} from '@/services/smart-bid/content/review/production/paper-output-registration'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionReadHost} from '../content-revision-reader'

/** 原纸件登记的项目、纸件、份次和修订身份。 */
type PaperScope=Readonly<{projectId:string;paperRef:string;copyRef:string;revisionId:string}>
/** 已登记纸件及可证明属于该份次的页。 */
type RegisteredPaper=PaperScope&Readonly<{registrationRef:string;pageRefs:readonly string[];assertCurrent:()=>void}>
const keys=[['projectId','projectId'],['id','observationId']] as const
const fields=['id','projectId','paperRef','copyRef','producedFileId','revisionId','pageRef','locationRef','evidenceRef','value','unit']

/** 纸件观察和电子实件观察共用 ProducedFile 身份字段。 */
export function paperObservationView():ViewMetadata{
 return {autoLoad:false,autoCurrentFirst:false,autoSelectFirst:false,commitMode:'staged',
  queryConfig:{autoQuery:false,cacheType:'none',pagination:'none',fields:[...fields]},
  scopeFilter:{logic:'and',filters:keys.map(([field,ParamName])=>({
   field,operator:'eq',value:{Type:'GetInputParam',ParamName},
  }))}}
}
const valid=(view:DataView)=>view.dataTable?.modelBinding?.modelName==='AnswerLocation'&&
 view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&view.queryConfig.cacheType==='none'&&keys.every(([field,ParamName])=>
  hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName}))

/** 从正式纸件登记中取观察指定的份次和页标识。 */
export async function readPaperRegistration(host:ContentRevisionReadHost,scope:Omit<PaperScope,'copyRef'>,
 prepared?:ReturnType<typeof preparePaperOutputRegistration>){
 const {projectId,paperRef,revisionId}=scope
 const error='CONTENT_PAPER_ANSWER_SCOPE'
 host.assertCurrent()
 prepared?.assertCurrent()
 if(projectId!==host.projectId||![projectId,paperRef,revisionId,host.scenarioId].every(identity))throw Error(error)
 const context={projectId,paperRef,revisionId}
 const key=buildDataViewKey('ProducedFile','selectedPaperRegistration',host.scenarioId)
 const view=host.runtime.resolveView(key)
 const validRegistration=(target:DataView)=>target.dataTable?.modelBinding?.modelName==='ProducedFile'&&
  target.commitMode==='staged'&&target.queryConfig.autoQuery===false&&target.queryConfig.cacheType==='none'&&Object.keys(context).every(field=>
   hasContentScopeCondition(target,field,{Type:'GetInputParam',ParamName:field}))
 if(!view||!validRegistration(view)||view.hasEditingChanges())throw Error('CONTENT_PAPER_REGISTRATION_VIEW_REQUIRED')
 view.queryContext={...view.queryContext,...context}
 const assertScope=()=>{
  host.assertCurrent()
  prepared?.assertCurrent()
  if(host.runtime.resolveView(key)!==view||!validRegistration(view)||view.loadingError||view.hasEditingChanges()||
   Object.entries(context).some(([field,value])=>view.queryContext[field]!==value))throw Error('CONTENT_PAPER_REGISTRATION_STALE')
 }
 await view.refresh()
 assertScope()
 const row=view.rows[0]
 if(view.countReported!==true||view.total!==view.rows.length||view.nextPageAvailable===true||view.rows.length>1)
  throw Error('CONTENT_PAPER_REGISTRATION_NOT_UNIQUE')
 const assertResult=view.captureReadResult()
 if(!row)return Object.freeze({state:'UNKNOWN' as const,assertCurrent:()=>{assertScope();assertResult()}})
 const originFields=['documentId','requestKey','inputDigest','productionRequestRef','witnessRef'] as const
 const assertRow=view.captureReadRow(row,[...Object.keys(context),'id','copies',...(prepared?originFields:[])])
 const {id,copies}=row
 if(!identity(id)||!Array.isArray(copies)||Object.entries(context).some(([field,value])=>row[field]!==value))throw Error(error)
 const copyRefs=new Set<string>()
 const registeredCopies=(copies as unknown[]).map(copy=>{
  if(!isRecord(copy)||!identity(copy['copyRef'])||copyRefs.has(copy['copyRef'])||!Array.isArray(copy['pageRefs']))throw Error(error)
  const pages:unknown[]=copy['pageRefs']
  if(!pages.length||!pages.every(identity)||new Set(pages).size!==pages.length)throw Error(error)
  copyRefs.add(copy['copyRef'])
  return Object.freeze({copyRef:copy['copyRef'],pageRefs:Object.freeze([...pages])})
 })
 if(!registeredCopies.length)throw Error(error)
 if(prepared&&(originFields.some(field=>row[field]!==prepared.record[field])||
  canonicalSnapshotValue(registeredCopies)!==canonicalSnapshotValue(prepared.record.copies)))
  throw Error('CONTENT_PAPER_REGISTRATION_CONFLICT')
 return Object.freeze({state:'REGISTERED' as const,registrationRef:id,copies:Object.freeze(registeredCopies),
  assertCurrent:()=>{assertScope();assertResult();assertRow()}})
}

/** 观察必须关联已登记的指定份次。 */
export async function readRegisteredPaperCopy(host:ContentRevisionReadHost,input:PaperScope):Promise<RegisteredPaper>{
 const scope={...input}
 const registration=await readPaperRegistration(host,scope)
 if(registration.state==='UNKNOWN')throw Error('CONTENT_PAPER_REGISTRATION_NOT_UNIQUE')
 const copy=registration.copies.find(item=>item.copyRef===scope.copyRef)
 if(!copy)throw Error('CONTENT_PAPER_ANSWER_SCOPE')
 return Object.freeze({...scope,registrationRef:registration.registrationRef,pageRefs:copy.pageRefs,assertCurrent:registration.assertCurrent})
}

/** 原登记给实际纸件和份次，观察视图给其原版位置与值。 */
export async function readRegisteredPaperAnswer(host:ContentRevisionReadHost,observationId:string){
 const {runtime,scenarioId,projectId}=host
 host.assertCurrent()
 const error='CONTENT_PAPER_ANSWER_SCOPE'
 if(![scenarioId,projectId,observationId].every(identity))throw Error(error)
 const key=buildDataViewKey('AnswerLocation','selectedPaperObservation',scenarioId),view=runtime.resolveView(key)
 if(!view||!valid(view)||view.hasEditingChanges())throw Error('CONTENT_PAPER_ANSWER_VIEW_REQUIRED')
 const context={projectId,observationId}
 view.queryContext={...view.queryContext,...context}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid(view)||view.loadingError||view.hasEditingChanges()||
   Object.entries(context).some(([field,value])=>view.queryContext[field]!==value))throw Error('CONTENT_PAPER_ANSWER_STALE')
 }
 await view.refresh()
 assertScope()
 const row=view.rows[0]
 if(!row||!hasCompleteSingleContentResult(view))throw Error('CONTENT_PAPER_ANSWER_NOT_UNIQUE')
 const assertRead=view.captureReadResult(),assertRow=view.captureReadRow(row,fields)
 const {paperRef,copyRef,revisionId,pageRef,locationRef,producedFileId,evidenceRef,unit,value}=row
 if(row['id']!==observationId||row['projectId']!==projectId||
  !identity(paperRef)||!identity(copyRef)||!identity(revisionId)||!identity(pageRef)||
  !identity(locationRef)||!identity(producedFileId)||!identity(evidenceRef)||
  (unit!==null&&!identity(unit))||!Object.hasOwn(row,'value'))throw Error(error)
 const scope={projectId,paperRef,copyRef,revisionId}
 const paper=await readRegisteredPaperCopy(host,scope)
 const assertCurrent=()=>{assertScope();assertRead();assertRow();paper.assertCurrent()}
 assertCurrent()
 if(paper.registrationRef!==producedFileId||!paper.pageRefs.includes(pageRef))throw Error(error)
 const observedValueJson=canonicalSnapshotValue(value)
 return Object.freeze({...scope,observationId,pageRef,locationRef,registrationRef:paper.registrationRef,
  evidenceRef,observedValueJson,unit,assertCurrent})
}
