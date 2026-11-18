import {expect,it} from 'vitest'
import {reviewPersonAppointment} from '@/services/smart-bid/content/references/person-appointment-review'

const request={personId:'PERSON',employerId:'EMPLOYER',enterpriseId:'E',projectId:'P',positionRef:'POSITION',start:10,end:20}
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
