/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-paper-answer-reader
 * 职责：第42项回读原纸件、份次及页栏；封装归属及截止另核。
 * 边界：纸件登记提供份次与页标识，SPARK Data 提供原填报位置及可读值。
 * AI用途：核对纸件观察是否对应实际登记份次和页栏。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {canonicalSnapshotValue} from '@/services/smart-bid/content/revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionReadHost} from '../content-revision-reader'

/** 原纸件登记的项目、纸件、份次和修订身份。 */
type PaperScope=Readonly<{projectId:string;paperRef:string;copyRef:string;revisionId:string}>
/** 已登记纸件及可证明属于该份次的页。 */
type RegisteredPaper=PaperScope&Readonly<{registrationRef:string;pageRefs:readonly string[];assertCurrent:()=>void}>
const keys=[['projectId','projectId'],['id','observationId'],['paperRef','paperRef'],['copyRef','copyRef']] as const
const fields=['id','projectId','paperRef','copyRef','revisionId','pageRef','locationRef','evidenceRef','value','unit']
const valid=(view:DataView)=>view.dataTable?.modelBinding?.modelName==='AnswerLocation'&&
 view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&keys.every(([field,ParamName])=>
  hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName}))

/** 原登记给实际纸件和份次，观察视图给其原版位置与值。 */
export async function readRegisteredPaperAnswer(host:ContentRevisionReadHost,input:Omit<PaperScope,'projectId'>&Readonly<{
 observationId:string;pageRef:string;locationRef:string
}>,readPaper:(scope:PaperScope)=>Promise<RegisteredPaper>){
 const {runtime,scenarioId,projectId}=host,{paperRef,copyRef,revisionId,observationId,pageRef,locationRef}=input
 host.assertCurrent()
 const scope=Object.freeze({projectId,paperRef,copyRef,revisionId})
 const error='CONTENT_PAPER_ANSWER_SCOPE'
 if(![scenarioId,...Object.values(scope),observationId,pageRef,locationRef].every(identity))throw Error(error)
 const paper=await readPaper(scope)
 host.assertCurrent();paper.assertCurrent()
 if(paper.projectId!==projectId||paper.paperRef!==paperRef||paper.copyRef!==copyRef||paper.revisionId!==revisionId||!identity(paper.registrationRef)||
  paper.pageRefs.filter(ref=>ref===pageRef).length!==1)throw Error(error)
 const key=buildDataViewKey('AnswerLocation','selectedPaperObservation',scenarioId),view=runtime.resolveView(key)
 if(!view||!valid(view)||view.hasEditingChanges())throw Error('CONTENT_PAPER_ANSWER_VIEW_REQUIRED')
 const context={projectId,observationId,paperRef,copyRef}
 view.queryContext={...view.queryContext,...context}
 const assertScope=()=>{
  host.assertCurrent();paper.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid(view)||view.loadingError||view.hasEditingChanges()||
   Object.entries(context).some(([field,value])=>view.queryContext[field]!==value))throw Error('CONTENT_PAPER_ANSWER_STALE')
 }
 await view.refresh()
 assertScope()
 const row=view.rows[0]
 if(!row||!hasCompleteSingleContentResult(view))throw Error('CONTENT_PAPER_ANSWER_NOT_UNIQUE')
 const assertRead=view.captureReadResult(),assertRow=view.captureReadRow(row,fields)
 const assertCurrent=()=>{assertScope();assertRead();assertRow()}
 const {evidenceRef,unit,value}=row
 if(row['id']!==observationId||row['pageRef']!==pageRef||row['locationRef']!==locationRef||
  Object.entries(scope).some(([field,expected])=>row[field]!==expected)||
  !identity(evidenceRef)||(unit!==null&&!identity(unit))||!Object.hasOwn(row,'value'))throw Error(error)
 const observedValueJson=canonicalSnapshotValue(value)
 assertCurrent()
 return Object.freeze({...scope,observationId,pageRef,locationRef,registrationRef:paper.registrationRef,
  evidenceRef,observedValueJson,unit,assertCurrent})
}
