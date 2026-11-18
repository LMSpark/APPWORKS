import {expect,it} from 'vitest'
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
