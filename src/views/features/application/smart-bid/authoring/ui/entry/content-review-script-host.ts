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
import {readPaperRegistration,readRegisteredPaperAnswer} from '../../model/review/content-paper-answer-reader'
import {recoverProductionRequest} from '@/services/smart-bid/content/review/production/production-recovery'
import {readCompletedProductionFiles} from '../../model/review/content-produced-file-review'
import {readOriginalExportRegistration,readOriginalSignedRegistration} from '../../model/review/production/production-registration-reader'
import {readOriginalSignatureRequest} from '../../model/review/submission/content-signature-request-reader'
import {prepareSignedOutputRegistration} from '@/services/smart-bid/content/review/production/signed-output-registration'
import {preparePaperOutputRegistration} from '@/services/smart-bid/content/review/production/paper-output-registration'

/** 审定覆盖工作区的宿主、固定范围与证据读取合同。 */
type Review=Parameters<typeof readContentReviewWorkspace>
/** 平台实填观察和原批准依据的读取合同。 */
type Observation=Parameters<typeof readPlatformFieldObservation>
type FormVerification=Parameters<typeof verifyOriginalFormFileAnswer>
type ProductionRecovery=Parameters<typeof recoverProductionRequest>
type SignedRegistration=Parameters<typeof prepareSignedOutputRegistration>
type PaperRegistration=Parameters<typeof preparePaperOutputRegistration>

/** 固定审定范围由正式办理记录提供，调用地址只携带引用。 */
export function createContentReviewScriptHost<Runtime extends Pick<PageRuntime,'resolveView'|'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,scope:Omit<Review[0],'runtime'>,sources:Review[2]&Readonly<{
  readSelection:(selectionRef:string,signal:AbortSignal)=>Promise<Review[1]&Readonly<{selectionRef:string}>>
  readProductionSelection?:(selectionRef:string,signal:AbortSignal)=>Promise<Readonly<{
   selectionRef:string;request:ProductionRecovery[0];source:ProductionRecovery[1]
  }>>
  readExportRegistrationSelection?:(selectionRef:string,signal:AbortSignal)=>Promise<Readonly<{
   selectionRef:string;prepared:Parameters<typeof readOriginalExportRegistration>[1]
  }>>
  readSignedRegistrationSelection?:(selectionRef:string,signal:AbortSignal)=>Promise<Readonly<{
   selectionRef:string;request:Parameters<typeof readOriginalSignatureRequest>[1];
   original:SignedRegistration[0];receipt:SignedRegistration[1];open:SignedRegistration[3];assertCurrent:()=>void
  }>>
  readPaperRegistrationSelection?:(selectionRef:string,signal:AbortSignal)=>Promise<Readonly<{
   selectionRef:string;prepared:PaperRegistration[0];paper:PaperRegistration[1];observed:PaperRegistration[2]
  }>>
  readObservationSelection?:(observationRef:string,signal:AbortSignal)=>Promise<Readonly<{
   approved:Observation[1];input:Observation[2];assertCurrent:()=>void
  }>>
  readFileObservationContext?:(observationRef:string,signal:AbortSignal)=>Promise<Readonly<{
   projectId:string;observationId:string;approved?:Parameters<typeof compareApprovedFileAnswer>[1]
   originalForm?:Readonly<{mapping:FormVerification[1];placement:FormVerification[2]}>;assertCurrent:()=>void
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
   if(name==='content.review.preparePaperRegistration'&&sources.readPaperRegistrationSelection){
    const selection=await sources.readPaperRegistrationSelection(selectionRef,signal)
    assertCurrent()
    if(selection.selectionRef!==selectionRef||selection.prepared.request.projectId!==scope.projectId)
     throw Error('CONTENT_REVIEW_PAGE_SELECTION_SCOPE')
    const prepared=preparePaperOutputRegistration(selection.prepared,selection.paper,selection.observed)
    const original=await readPaperRegistration({...scope,runtime,assertCurrent},prepared.record,prepared)
    return Object.freeze({...prepared,registrationRef:original.state==='REGISTERED'?original.registrationRef:null,
     assertCurrent:original.assertCurrent})
   }
   if(name==='content.review.prepareSignedRegistration'&&sources.readSignedRegistrationSelection){
    const selection=await sources.readSignedRegistrationSelection(selectionRef,signal)
    const assertSelection=()=>{assertCurrent();selection.assertCurrent()}
    assertSelection()
    if(selection.selectionRef!==selectionRef||selection.request.projectId!==scope.projectId)
     throw Error('CONTENT_REVIEW_PAGE_SELECTION_SCOPE')
    const recovered=await readOriginalSignatureRequest({...scope,runtime,assertCurrent:assertSelection},selection.request)
    if(recovered.state!=='SIGNED')return recovered
    const prepared=await prepareSignedOutputRegistration(selection.original,selection.receipt,recovered,selection.open)
    const registration=await readOriginalSignedRegistration({...scope,runtime,assertCurrent:assertSelection},prepared)
    if(registration.state==='REGISTERED'){
     const registered=registration.resourceVersionId===prepared.record.resourceVersionId?prepared:
      await prepareSignedOutputRegistration(selection.original,{
       ...selection.receipt,resourceVersionId:registration.resourceVersionId,
       assertCurrent:()=>{selection.receipt.assertCurrent();registration.assertCurrent()},
      },recovered,selection.open)
     const assertRegistered=()=>{registration.assertCurrent();registered.assertCurrent()}
     assertRegistered()
     return Object.freeze({...registration,state:'SIGNED_REGISTERED' as const,assertCurrent:assertRegistered})
    }
    return Object.freeze({state:'PREPARED' as const,...prepared,assertCurrent:registration.assertCurrent})
   }
   if(name==='content.review.readExportRegistration'&&sources.readExportRegistrationSelection){
    const selection=await sources.readExportRegistrationSelection(selectionRef,signal)
    assertCurrent()
    if(selection.selectionRef!==selectionRef||selection.prepared.record.projectId!==scope.projectId)
     throw Error('CONTENT_REVIEW_PAGE_SELECTION_SCOPE')
    return readOriginalExportRegistration({...scope,runtime,assertCurrent},selection.prepared)
   }
   if(name==='content.review.recoverProduction'&&sources.readProductionSelection){
    const selection=await sources.readProductionSelection(selectionRef,signal)
    const assertSelection=()=>{assertCurrent();selection.source.assertCurrent()}
    assertSelection()
    if(selection.selectionRef!==selectionRef||selection.request.projectId!==scope.projectId)
     throw Error('CONTENT_REVIEW_PAGE_SELECTION_SCOPE')
    const result=await recoverProductionRequest(selection.request,{
     lookup:request=>selection.source.lookup(request),assertCurrent:assertSelection,
    })
    if(result.state!=='COMPLETED'&&result.state!=='PARTIAL')return result
    const verified=await readCompletedProductionFiles({...scope,runtime,assertCurrent:assertSelection},result,sources.openFile)
    return Object.freeze({state:result.state,verifiedFiles:verified.files,assertCurrent:verified.assertCurrent,
     ...(result.state==='PARTIAL'?{missingScopeRefs:result.missingScopeRefs}:{})})
   }
   if(name==='content.review.readPaperObservation')
    return readRegisteredPaperAnswer({...scope,runtime,assertCurrent},selectionRef)
   if(name==='content.review.readFileObservation'){
    const answer=await readRegisteredFileAnswer({...scope,runtime,assertCurrent},selectionRef,sources.openFile)
    const context=await sources.readFileObservationContext?.(selectionRef,signal)
    if(context&&(context.observationId!==selectionRef||context.projectId!==scope.projectId))
     throw Error('CONTENT_REVIEW_PAGE_SELECTION_SCOPE')
    context?.assertCurrent()
    answer.assertCurrent()
    const comparison=context?.approved&&compareApprovedFileAnswer(answer,context.approved)
    const originalForm=await answer.readOriginalForm()
    const form=originalForm??(context?.originalForm&&verifyOriginalFormFileAnswer(answer,context.originalForm.mapping,context.originalForm.placement))
    const assertAnswer=()=>{answer.assertCurrent();context?.assertCurrent();comparison?.assertCurrent();form?.assertCurrent()}
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
