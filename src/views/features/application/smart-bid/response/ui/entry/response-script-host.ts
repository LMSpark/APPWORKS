/**
 * @module app:views/features/application/smart-bid/response/ui/entry/response-script-host
 * 职责：在同一页10运行实例提供报价、担保及固定事实读取。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {createApprovedPriceScriptHost} from './approved-price-script-host'
import {createBidSecurityScriptHost} from './bid-security-script-host'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readContentBaselineFactUse} from '../../../authoring/model/content-baseline-reader'
import {readRegisteredResponseAssignment} from '../../model/response-assignment-reader'

import {reviewPersonAppointment} from '@/services/smart-bid/content/references/commercial/person-appointment-review'

import {checkCommitmentApprovalCoverage,prepareApprovedCommitmentFacts} from '@/services/smart-bid/content/references/commercial/commitment-approval-coverage'

type Commitment=Parameters<typeof checkCommitmentApprovalCoverage>[0]
type CommitmentSource=Parameters<typeof prepareApprovedCommitmentFacts>[1]
type Appointment=Parameters<typeof reviewPersonAppointment>

type Scope=Parameters<typeof createApprovedPriceScriptHost>[1]&Parameters<typeof createBidSecurityScriptHost>[1]
type Sources=Readonly<{
 assertCurrent?:()=>void
 readPriceEvidence:Parameters<typeof createApprovedPriceScriptHost>[2]
 readSecurityReceipts:Parameters<typeof createBidSecurityScriptHost>[2]
 appointmentBasis?:Readonly<{projectId:string;enterpriseId:string;assertCurrent:()=>void;
  read:(appointmentRef:string,signal:AbortSignal)=>Promise<Readonly<{appointmentRef:string;request:Appointment[0];evidence:Appointment[1]}>>}>
 commitmentBasis?:Readonly<{projectId:string;assertCurrent:()=>void;
  read:(commitmentRef:string,signal:AbortSignal)=>Promise<Readonly<{
   commitmentRef:string;coverage:Commitment;source:CommitmentSource
  }>>}>
 assignmentBasis?:Readonly<{projectId:string;baselineId:string;assertCurrent:()=>void}>
 fixedFacts?:Readonly<{
  projectId:string
  basis:Omit<Parameters<typeof readContentBaselineFactUse>[1],'factId'|'version'|'purposeRef'|'useAt'>
  assertCurrent:()=>void
  readUse:Parameters<typeof readContentBaselineFactUse>[2]
 }>
}>

/** 页面传事实键；目标修订基线从正式宿主取得。 */
export function createBidResponseScriptHost<Runtime extends Pick<PageRuntime,'resolveView'|'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,scope:Scope,sources:Sources,
){
 const assertOwner=()=>{scope.assertCurrent();sources.assertCurrent?.()}
 const ownedScope={...scope,assertCurrent:assertOwner}
 const price=createApprovedPriceScriptHost(runtime,ownedScope,sources.readPriceEvidence)
 const security=createBidSecurityScriptHost(runtime,ownedScope,sources.readSecurityReceipts)
 return {runtime,assertCurrent:assertOwner,invoke(name:string,input:unknown,signal:AbortSignal){
  if(name==='bid.response.reviewCommitment'){
   const basis=sources.commitmentBasis
   if(!basis||!isRecord(input)||Object.keys(input).length!==1||!identity(input['commitmentRef']))
    throw Error('BID_RESPONSE_COMMITMENT_REQUEST')
   const {commitmentRef}=input,generation=runtime.generation
   const assertCurrent=()=>{
    assertOwner()
    basis.assertCurrent()
    if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)
     throw Error('BID_RESPONSE_COMMITMENT_STALE')
   }
   assertCurrent()
   return basis.read(commitmentRef,signal).then(selected=>{
    assertCurrent()
    const {coverage,source}=selected
    if(selected.commitmentRef!==commitmentRef||coverage.projectId!==basis.projectId||source.projectId!==basis.projectId||
     coverage.scopeRef!==scope.scopeRef||source.scopeRef!==scope.scopeRef||coverage.purposeRef!==scope.purposeRef)
     throw Error('BID_RESPONSE_COMMITMENT_REQUEST')
    const reviewed=checkCommitmentApprovalCoverage({...coverage,assertCurrent:()=>{
     assertCurrent();coverage.assertCurrent();source.assertCurrent()
    }})
    if(!reviewed.ready)return reviewed
    const prepared=prepareApprovedCommitmentFacts(reviewed,source)
    return Object.freeze({...reviewed,facts:prepared.facts,assertCurrent:prepared.assertCurrent})
   })
  }
  if(name==='bid.response.reviewAppointment'){
   const basis=sources.appointmentBasis
   if(!basis||!isRecord(input)||Object.keys(input).length!==1||!identity(input['appointmentRef']))
    throw Error('BID_RESPONSE_APPOINTMENT_REQUEST')
   const {appointmentRef}=input,generation=runtime.generation
   const assertCurrent=()=>{
    assertOwner()
    basis.assertCurrent()
    if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)
     throw Error('BID_RESPONSE_APPOINTMENT_STALE')
   }
   assertCurrent()
   return basis.read(appointmentRef,signal).then(selected=>{
    assertCurrent()
    const {request,evidence}=selected
    if(selected.appointmentRef!==appointmentRef||request.projectId!==basis.projectId||request.enterpriseId!==basis.enterpriseId||
     request.scopeRef!==scope.scopeRef||request.purposeRef!==scope.purposeRef)throw Error('BID_RESPONSE_APPOINTMENT_REQUEST')
    const reviewed=reviewPersonAppointment(request,evidence)
    return Object.freeze({...reviewed,assertCurrent:()=>{assertCurrent();reviewed.assertCurrent()}})
   })
  }
  if(name==='bid.response.readSecurity')return security.invoke(name,input,signal)
  if(name==='bid.response.readAssignment'){
   const {assignmentBasis}=sources
   if(!assignmentBasis||!isRecord(input)||Object.keys(input).length!==1||!identity(input['assignmentId']))
    throw Error('BID_RESPONSE_ASSIGNMENT_REQUEST')
   const generation=runtime.generation
   const assertCurrent=()=>{
    assertOwner()
    assignmentBasis.assertCurrent()
    if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)
     throw Error('BID_RESPONSE_ASSIGNMENT_STALE')
   }
   return readRegisteredResponseAssignment({...assignmentBasis,runtime,scenarioId:scope.scenarioId,assertCurrent},input['assignmentId'])
  }
  if(name==='bid.response.readFixedFact'){
   const {fixedFacts}=sources
   if(!fixedFacts||!isRecord(input)||Object.keys(input).length!==1||!identity(input['factId']))
    throw Error('BID_RESPONSE_FACT_REQUEST')
   const generation=runtime.generation
   const assertCurrent=()=>{
    assertOwner()
    fixedFacts.assertCurrent()
    if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)
     throw Error('BID_RESPONSE_FACT_STALE')
   }
   return readContentBaselineFactUse({runtime,scenarioId:scope.scenarioId,projectId:fixedFacts.projectId,assertCurrent},
    {...fixedFacts.basis,factId:input['factId'],purposeRef:scope.purposeRef,useAt:scope.asOf},fixedFacts.readUse)
  }
  return price.invoke(name,input,signal)
 }}
}
