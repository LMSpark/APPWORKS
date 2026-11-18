import {expect,it,vi} from 'vitest'
import {createBidResponseScriptHost} from '@/views/features/application/smart-bid/response/ui/entry/response-script-host'
import script from '@/views/features/application/smart-bid/response/page10/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'
import {reviewPersonAppointment} from '@/services/smart-bid/content/references/commercial/person-appointment-review'
import {checkCommitmentApprovalCoverage,personCommitmentApproval} from '@/services/smart-bid/content/references/commercial/commitment-approval-coverage'

const request={personId:'PERSON',employerId:'EMPLOYER',enterpriseId:'E',projectId:'P',positionRef:'POSITION',
 scopeRef:'SCOPE',purposeRef:'USE',start:10,end:20}
const assertCurrent=()=>{}
const material={personId:'PERSON',employerId:'EMPLOYER',versionRef:'M1',assertCurrent}
const appointment={...request,decisionRef:'D1',assertCurrent}
const allocation={...request,decisionRef:'A1',intent:'ASSIGN' as const,assertCurrent}
const availability={start:10,end:20,restricted:true as const,assertCurrent}

it('keeps the exact material, appointment and allocation references for the verified person',()=>{
 expect(reviewPersonAppointment(request,{material,appointment,availability:{...availability,allocation}})).toMatchObject({
  state:'VERIFIED',personId:'PERSON',materialVersionRef:'M1',appointmentDecisionRef:'D1',allocationDecisionRef:'A1',
 })
 expect(()=>reviewPersonAppointment(request,{material:{...material,personId:'SAME-NAME'},appointment,availability}))
  .toThrow('BID_PERSON_APPOINTMENT_SCOPE')
})

it('requires full availability and allocation for the requested period',()=>{
 expect(reviewPersonAppointment(request,{material,appointment,availability}).state).toBe('ALLOCATION_PENDING')
 expect(reviewPersonAppointment(request,{material,appointment,availability:{...availability,allocation:{...allocation,intent:'RELEASE'}}}).state)
  .toBe('ALLOCATION_PENDING')
 expect(reviewPersonAppointment(request,{material,appointment,availability:{...availability,allocation:{...allocation,end:19}}}).state)
  .toBe('ALLOCATION_PENDING')
 expect(reviewPersonAppointment(request,{material,appointment,availability:{...availability,end:19}}).state)
  .toBe('AVAILABILITY_PENDING')
 expect(()=>reviewPersonAppointment(request,{material,appointment,availability:{...availability,allocation:{...allocation,projectId:'OTHER'}}}))
  .toThrow('BID_PERSON_APPOINTMENT_SCOPE')
})

it('hands only an exact verified appointment to commitment registration',()=>{
 const approved=reviewPersonAppointment(request,{material,appointment,availability:{...availability,allocation}})
 const pending=reviewPersonAppointment(request,{material,appointment,availability})
 const evidence=personCommitmentApproval('lead',approved)
 if(!evidence)throw Error('VERIFIED_APPOINTMENT_REQUIRED')
 const input={scopeRef:request.scopeRef,purposeRef:request.purposeRef,assertCurrent,
  fields:[{key:'lead',kind:'PERSON' as const,value:request.personId,unit:null}],approvals:[evidence]}
 expect(checkCommitmentApprovalCoverage(input)).toMatchObject({
  ready:true,fields:[{sourceVersion:'M1',decisionRefs:['A1','D1']}],
 })
 expect(personCommitmentApproval('lead',pending)).toBeUndefined()
 expect(()=>checkCommitmentApprovalCoverage({...input,purposeRef:'OTHER'})).toThrow('BID_COMMITMENT_APPROVAL_SCOPE')
})

it('shows only in-scope appointment evidence and leaves released allocations pending',async()=>{
 let intent:'ASSIGN'|'RELEASE'='ASSIGN'
 const runtime={resolveView:()=>undefined,generation:1,isLoaded:true,destroyed:false}
 const read=vi.fn(async()=>({appointmentRef:'REF',request,evidence:{material,appointment,availability:{
  ...availability,allocation:{...allocation,intent},
 }}}))
 const host=createBidResponseScriptHost(runtime,{scenarioId:'S',scopeRef:'SCOPE',purposeRef:'USE',asOf:10,rateOnly:false,assertCurrent},{
  appointmentBasis:{enterpriseId:'E',projectId:'P',read,assertCurrent},
  readPriceEvidence:async()=>{throw Error('UNEXPECTED_PRICE')},readSecurityReceipts:async()=>[],
 })
 const signal=new AbortController().signal,showAlert=vi.fn(async()=>{})
 const {openPersonAppointment}=compileFunctions(script,{$route:{query:{appointmentRef:'REF'}},
  $page:{showAlert,invokeHostCommand:(name:string,input:unknown)=>host.invoke(name,input,signal)}} as unknown as PageContext)
 if(!openPersonAppointment)throw Error('TEST_APPOINTMENT_HANDLER_REQUIRED')
 await openPersonAppointment()
 expect(showAlert).toHaveBeenLastCalledWith('人员 PERSON · 岗位 POSITION\n材料版 M1 · 用人决定 D1\n调配决定 A1','人员拟任核对')
 intent='RELEASE'
 await openPersonAppointment()
 expect(showAlert).toHaveBeenLastCalledWith('待核本项目现行调配','人员拟任核对')
 expect(()=>host.invoke('bid.response.reviewAppointment',{appointmentRef:'REF',projectId:'OTHER'},signal))
  .toThrow('BID_RESPONSE_APPOINTMENT_REQUEST')
 await expect(host.invoke('bid.response.reviewAppointment',{appointmentRef:'OTHER'},signal))
  .rejects.toThrow('BID_RESPONSE_APPOINTMENT_REQUEST')
})
