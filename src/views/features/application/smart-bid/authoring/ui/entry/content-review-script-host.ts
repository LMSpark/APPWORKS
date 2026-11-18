/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/content-review-script-host
 * 职责：为页12同次运行实例提供实填观察和审定覆盖证据。
 * 边界：只读取原选择与证据，批准及写入仍由正式办理方负责。
 * AI用途：核对页12脚本命令、审定范围和证据失效条件。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readContentReviewWorkspace} from '../../model/review/content-review-workspace'
import {readPlatformFieldObservation} from '../../model/review/content-platform-field-review'
import {compareApprovedFileAnswer,readRegisteredFileAnswer,verifyOriginalFormFileAnswer} from '../../model/review/content-file-answer-reader'
import {readRegisteredPaperAnswer} from '../../model/review/content-paper-answer-reader'

/** 审定覆盖工作区的宿主、固定范围与证据读取合同。 */
type Review=Parameters<typeof readContentReviewWorkspace>
/** 平台实填观察和原批准依据的读取合同。 */
type Observation=Parameters<typeof readPlatformFieldObservation>
/** 电子实件及其原填报位置的读取合同。 */
type FileObservation=Parameters<typeof readRegisteredFileAnswer>
type FormVerification=Parameters<typeof verifyOriginalFormFileAnswer>
/** 原纸件观察的宿主、原登记和页栏参数合同。 */
type PaperObservation=Parameters<typeof readRegisteredPaperAnswer>

/** 固定审定范围由正式办理记录提供，调用地址只携带引用。 */
export function createContentReviewScriptHost<Runtime extends Pick<PageRuntime,'resolveView'|'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,scope:Omit<Review[0],'runtime'>,sources:Review[2]&Readonly<{
  readSelection:(selectionRef:string,signal:AbortSignal)=>Promise<Review[1]&Readonly<{selectionRef:string}>>
  readObservationSelection?:(observationRef:string,signal:AbortSignal)=>Promise<Readonly<{
   approved:Observation[1];input:Observation[2];assertCurrent:()=>void
  }>>
  readFileObservationSelection?:(observationRef:string,signal:AbortSignal)=>Promise<Readonly<{
   projectId:string;input:FileObservation[1];approved?:Parameters<typeof compareApprovedFileAnswer>[1]
   originalForm?:Readonly<{mapping:FormVerification[1];placement:FormVerification[2]}>;assertCurrent:()=>void
  }>>
  readPaperObservationSelection?:(observationRef:string,signal:AbortSignal)=>Promise<Readonly<{
   projectId:string;input:PaperObservation[1];readPaper:PaperObservation[2];assertCurrent:()=>void
  }>>
 }>){
 return {runtime,assertCurrent:scope.assertCurrent,
  async invoke(name:string,input:unknown,signal:AbortSignal){
   if(!isRecord(input)||!identity(input['selectionRef']))
    throw Error('CONTENT_REVIEW_PAGE_COMMAND_REQUIRED')
   const {selectionRef}=input,generation=runtime.generation
   const assertCurrent=()=>{
    scope.assertCurrent()
    if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)
     throw Error('CONTENT_REVIEW_PAGE_STALE')
   }
   assertCurrent()
   if(name==='content.review.readPaperObservation'&&sources.readPaperObservationSelection){
    const selection=await sources.readPaperObservationSelection(selectionRef,signal)
    const assertSelection=()=>{assertCurrent();selection.assertCurrent()}
    assertSelection()
    if(selection.input.observationId!==selectionRef||selection.projectId!==scope.projectId)
     throw Error('CONTENT_REVIEW_PAGE_SELECTION_SCOPE')
    return readRegisteredPaperAnswer({...scope,runtime,assertCurrent:assertSelection},selection.input,selection.readPaper)
   }
   if(name==='content.review.readFileObservation'&&sources.readFileObservationSelection){
    const selection=await sources.readFileObservationSelection(selectionRef,signal)
    const assertSelection=()=>{assertCurrent();selection.assertCurrent()}
    assertSelection()
    if(selection.input.observationId!==selectionRef||selection.projectId!==scope.projectId)
     throw Error('CONTENT_REVIEW_PAGE_SELECTION_SCOPE')
    const answer=await readRegisteredFileAnswer({...scope,runtime,assertCurrent:assertSelection},selection.input,sources.openFile)
    const comparison=selection.approved&&compareApprovedFileAnswer(answer,selection.approved)
    const form=selection.originalForm&&verifyOriginalFormFileAnswer(answer,selection.originalForm.mapping,selection.originalForm.placement)
    const assertAnswer=()=>{answer.assertCurrent();comparison?.assertCurrent();form?.assertCurrent()}
    return Object.freeze({...answer,...(comparison?{comparison}:{}),...(form?{form}:{}),assertCurrent:assertAnswer})
   }
   if(name==='content.review.readPlatformObservation'&&sources.readObservationSelection){
    const selection=await sources.readObservationSelection(selectionRef,signal)
    const assertSelection=()=>{assertCurrent();selection.assertCurrent()}
    assertSelection()
    if(selection.input.observationId!==selectionRef||selection.approved.projectId!==scope.projectId)
     throw Error('CONTENT_REVIEW_PAGE_SELECTION_SCOPE')
    return readPlatformFieldObservation({...scope,runtime,assertCurrent:assertSelection},selection.approved,selection.input)
   }
   if(name!=='content.review.readCoverage')throw Error('CONTENT_REVIEW_PAGE_COMMAND_REQUIRED')
   const selection=await sources.readSelection(selectionRef,signal)
   assertCurrent()
   if(selection.selectionRef!==selectionRef||selection.projectId!==scope.projectId)throw Error('CONTENT_REVIEW_PAGE_SELECTION_SCOPE')
   return readContentReviewWorkspace({...scope,runtime,assertCurrent},selection,sources)
  },
 }
}
