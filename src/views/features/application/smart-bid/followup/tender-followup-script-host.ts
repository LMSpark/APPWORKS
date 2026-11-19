/**
 * @module app:views/features/application/smart-bid/followup/tender-followup-script-host
 * 职责：页09以当前招标范围读取原通知时间线。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readRegisteredTenderFollowupNotices} from './tender-followup-notice-reader'
import {readTenderChangeChapterPins} from './tender-change-chapter-reader'
import {readTenderAddendum} from './tender-addendum-reader'
import {readTenderChangeCallReferences} from './tender-change-call-reader'
import {readTenderChangeAttempts} from './tender-change-attempt-reader'
import {readBaselineSubmissionObligations} from './submission-obligation-reader'
import {matchFollowupNoticeToDeadlinePackage,type reconcileDeadlineDelivery} from '../authoring/model/review/deadline/content-deadline-reconciliation'

type Read=Parameters<typeof readRegisteredTenderFollowupNotices>
type Addendum=Extract<Awaited<ReturnType<typeof readTenderAddendum>>,{state:'REGISTERED'}>
type CallEvidence=Extract<Awaited<ReturnType<typeof readTenderChangeCallReferences>>,{state:'REGISTERED'}>

function traceCallImpacts(addendum:Addendum,calls:CallEvidence){
 return Object.freeze(addendum.items.map(source=>{
  const references=calls.items.filter(item=>item.lineageId===source.requirementLineageId&&item.version===source.previousRequirementVersion)
  const results=[...new Set(references.map(item=>item.resultRef))].map(resultRef=>{
   const decisions=calls.dispositions.filter(item=>item.addendumId===addendum.id&&item.changeId===source.id&&item.resultRef===resultRef)
   return Object.freeze({resultRef,disposition:decisions.length===1?decisions[0]:null,conflictingDecisionRefs:Object.freeze(decisions.length>1?decisions.map(item=>item.decisionRef):[])})
  })
  return Object.freeze({source,references:Object.freeze(references),results:Object.freeze(results)})
 }))
}
type ReadDeadline=(scope:Read[1]&Readonly<{projectId:string;knownAt:string}>,signal:AbortSignal)=>
 Promise<ReturnType<typeof reconcileDeadlineDelivery>|null>

/** 固定本次调用的项目、标段、轮次、主体与阶段，页面只选择获知时点。 */
export function createTenderFollowupScriptHost<Runtime extends Pick<PageRuntime,'resolveView'|'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,host:Omit<Read[0],'runtime'>,options:Readonly<{selection:Read[1];readDeadline?:ReadDeadline}>){
 const {selection,readDeadline}=options
 const scope=Object.freeze({...selection})
 return {runtime,assertCurrent:host.assertCurrent,async invoke(name:string,input:unknown,signal:AbortSignal){
  if(!isRecord(input))throw Error('TENDER_FOLLOWUP_PAGE_REQUEST')
  const generation=runtime.generation
  const assertCurrent=()=>{
   host.assertCurrent()
   if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)
    throw Error('TENDER_FOLLOWUP_PAGE_STALE')
  }
  if(name==='tender.followup.readAddendum'){
   const {addendumId}=input
   if(Object.keys(input).length!==1||!identity(addendumId))throw Error('TENDER_FOLLOWUP_PAGE_REQUEST')
   return readTenderAddendum({...host,runtime,assertCurrent},
    {projectId:host.projectId,lotId:scope.lotId,roundId:scope.roundId,id:addendumId})
  }
  if(name==='tender.followup.readOriginalAttempts'){
   const {revisionId}=input
   if(Object.keys(input).length!==1||!identity(revisionId))throw Error('TENDER_FOLLOWUP_PAGE_REQUEST')
   return readTenderChangeAttempts({...host,runtime,assertCurrent},revisionId)
  }
  if(name==='tender.followup.readBaselineObligations'){
   const {baselineId}=input
   if(Object.keys(input).length!==1||!identity(baselineId))throw Error('TENDER_FOLLOWUP_PAGE_REQUEST')
   return readBaselineSubmissionObligations({...host,runtime,assertCurrent},baselineId)
  }
  if(name==='tender.followup.traceOriginalAttempts'){
   const {revisionId,addendumId}=input
   if(Object.keys(input).length!==2||!identity(revisionId)||!identity(addendumId))throw Error('TENDER_FOLLOWUP_PAGE_REQUEST')
   const readHost={...host,runtime,assertCurrent}
   const addendum=await readTenderAddendum(readHost,{projectId:host.projectId,lotId:scope.lotId,roundId:scope.roundId,id:addendumId})
   if(addendum.state!=='REGISTERED')return addendum
   const attempts=await readTenderChangeAttempts({...readHost,assertCurrent:addendum.assertCurrent},revisionId,true)
   const items=attempts.items.map(({runId,attemptRef,requestKey,evidence})=>Object.freeze({runId,attemptRef,requestKey,
    impacts:evidence?.state==='REGISTERED'?traceCallImpacts(addendum,evidence):null}))
   attempts.assertCurrent()
   return Object.freeze({state:'HISTORY_TRACED' as const,basisRevisionId:revisionId,items:Object.freeze(items),assertCurrent:attempts.assertCurrent})
  }
  if(name==='tender.followup.traceOutboundBatches'){
   const {addendumId,knownAt}=input
   if(Object.keys(input).length!==2||!identity(addendumId)||!identity(knownAt)||
    !Number.isFinite(Date.parse(knownAt))||!/(?:Z|[+-]\d{2}:\d{2})$/u.test(knownAt))
    throw Error('TENDER_FOLLOWUP_PAGE_REQUEST')
   const projectId=host.projectId
   const addendum=await readTenderAddendum({...host,runtime,assertCurrent},{projectId,lotId:scope.lotId,roundId:scope.roundId,id:addendumId})
   if(addendum.state!=='REGISTERED')return addendum
   const delivery=await readDeadline?.(Object.freeze({...scope,projectId,knownAt}),signal)
   addendum.assertCurrent()
   if(!delivery)return Object.freeze({state:'UNKNOWN' as const,assertCurrent:addendum.assertCurrent})
   const {lotId,subjectId}=delivery.scope
   const known=Date.parse(knownAt),bounds=[Date.parse(delivery.knownAt),Date.parse(delivery.cutoffAt)]
   if(delivery.scope.projectId!==projectId||lotId!==scope.lotId||subjectId!==scope.subjectId||delivery.roundId!==scope.roundId||
    bounds.some(bound=>!Number.isFinite(bound)||bound>known))throw Error('TENDER_FOLLOWUP_DEADLINE_SCOPE')
   const assertBatches=()=>{addendum.assertCurrent();delivery.assertCurrent()}
   assertBatches()
   const evidence=delivery.evidence.map(item=>Object.freeze({
    obligationId:item.obligationId,eventRef:item.eventRef,attemptRef:item.attemptRef,kind:item.kind,
    priorAttemptRef:item.kind==='REPLACED'?item.priorAttemptRef:null,
   }))
   const changes=addendum.items.map(item=>{
    const obligationId=item.deliveryObligationId
    const receipts=evidence.filter(event=>event.obligationId===obligationId)
    const checked=delivery.items.find(entry=>entry.obligationId===obligationId&&entry.state==='EFFECTIVE_ATTEMPT')
    const content=checked&&receipts.some(event=>event.kind!=='WITHDRAWN'&&event.attemptRef===checked.attemptRef)?
     Object.freeze({attemptRef:checked.attemptRef,state:checked.contentState,members:checked.members,fields:checked.fields}):null
    return Object.freeze({changeId:item.id,obligationId,receiptRefs:Object.freeze(receipts.map(event=>event.eventRef)),content})
   })
   return Object.freeze({state:'BATCH_EVIDENCE' as const,addendumId,knownAt:delivery.knownAt,cutoffAt:delivery.cutoffAt,
    evidence:Object.freeze(evidence),changes:Object.freeze(changes),assertCurrent:assertBatches})
  }
  if(name==='tender.followup.traceCallReferences'){
   const {addendumId,runId,attemptRef,requestKey}=input
   if(Object.keys(input).length!==4||!identity(addendumId)||!identity(runId)||!identity(attemptRef)||!identity(requestKey))
    throw Error('TENDER_FOLLOWUP_PAGE_REQUEST')
   const readHost={...host,runtime,assertCurrent},projectId=host.projectId
   const addendum=await readTenderAddendum(readHost,{projectId,lotId:scope.lotId,roundId:scope.roundId,id:addendumId})
   if(addendum.state!=='REGISTERED')return addendum
   const calls=await readTenderChangeCallReferences({...readHost,assertCurrent:addendum.assertCurrent},{projectId,runId,attemptRef,requestKey})
   if(calls.state!=='REGISTERED')return calls
   const impacts=traceCallImpacts(addendum,calls)
   calls.assertCurrent()
   return Object.freeze({state:'CALLS_TRACED' as const,runId,attemptRef,requestKey,impacts,assertCurrent:calls.assertCurrent})
  }
  if(name==='tender.followup.traceChapterPins'){
   const {revisionId,previousId,currentId,addendumId}=input
   if(Object.keys(input).length!==4||!identity(revisionId)||!identity(previousId)||(currentId!==null&&!identity(currentId))
    ||!identity(addendumId)||previousId===currentId)
    throw Error('TENDER_FOLLOWUP_PAGE_REQUEST')
   const readHost={...host,runtime,assertCurrent}
   const addendum=await readTenderAddendum(readHost,{projectId:host.projectId,lotId:scope.lotId,roundId:scope.roundId,id:addendumId})
   if(addendum.state!=='REGISTERED')return addendum
   const trace=await readTenderChangeChapterPins({...readHost,assertCurrent:addendum.assertCurrent},{revisionId,previousId,currentId})
   const tracedItems=trace.state==='TRACED'?trace.items:[]
   const impacts=addendum.items.map(source=>{
    const matching=tracedItems.find(({previous,current})=>{
     if((previous??current)?.lineageId!==source.requirementLineageId)return false
     if((previous?.version??null)!==source.previousRequirementVersion||(current?.version??null)!==source.currentRequirementVersion)
      return false
     return source.kind==='ADDED'?previous===null:source.kind==='CANCELLED'?current===null:previous!==null&&current!==null
    })
    const originalPins=trace.state==='PREVIOUS_ONLY'?trace.pins.filter(pin=>
     pin.lineageId===source.requirementLineageId&&pin.version===source.previousRequirementVersion):[]
    return Object.freeze({source,matching:matching??null,originalPins:Object.freeze(originalPins)})
   })
   trace.assertCurrent()
   return Object.freeze({state:'ADDENDUM_TRACED' as const,revisionId,addendumId,revisionEvidence:trace.state,
    impacts:Object.freeze(impacts),assertCurrent:trace.assertCurrent})
  }
  const knownAt=input['knownAt']
  if(name!=='tender.followup.readNotices'||Object.keys(input).length!==1||!identity(knownAt))
   throw Error('TENDER_FOLLOWUP_PAGE_REQUEST')
  const timeline=await readRegisteredTenderFollowupNotices({...host,runtime,assertCurrent},scope,knownAt)
  if(!readDeadline||!timeline.items.some(item=>item.event.originalObjectRef!==null))return timeline
  try{
   const delivery=await readDeadline(Object.freeze({...scope,projectId:host.projectId,knownAt}),signal)
   timeline.assertCurrent()
   if(delivery===null)return timeline
   const known=Date.parse(knownAt),deliveryKnown=Date.parse(delivery.knownAt),cutoff=Date.parse(delivery.cutoffAt)
   if(!Number.isFinite(deliveryKnown)||!Number.isFinite(cutoff)||deliveryKnown>known||cutoff>known)
    throw Error('TENDER_FOLLOWUP_DEADLINE_SCOPE')
   const items=timeline.items.map(item=>{
    const match=matchFollowupNoticeToDeadlinePackage({record:item.event,assertCurrent:timeline.assertCurrent},delivery)
    return Object.freeze({...item,originalPackage:match.original})
   })
   return Object.freeze({...timeline,items:Object.freeze(items),assertCurrent:()=>{
    timeline.assertCurrent();delivery.assertCurrent()
   }})
  }catch{
   timeline.assertCurrent()
   return Object.freeze({...timeline,packageEvidence:'UNVERIFIED' as const})
  }
 }}
}
