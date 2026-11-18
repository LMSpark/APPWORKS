import {expect,it} from 'vitest'
import {reconcileSubmissionDeadline} from '@/services/smart-bid/content/review/submission-reconciliation'

const at=(hour:string)=>`2026-11-18T${hour}:00:00+08:00`
const received={kind:'RECEIVED' as const,eventRef:'E1',obligationId:'F',attemptRef:'OLD',effectiveAt:at('09'),knownAt:at('09')}
const withdrawn={...received,kind:'WITHDRAWN' as const,eventRef:'E2',effectiveAt:at('10'),knownAt:at('13')}
const input={cutoffAt:at('11'),knownAt:at('11'),obligationIds:['F','FIELD']}

it('preserves the prior known assessment but re-evaluates effective delivery when receipt arrives late',()=>{
 expect(reconcileSubmissionDeadline({...input,effects:[withdrawn,received]}).items.map(item=>item.attemptRef)).toEqual(['OLD',null])
 const later=reconcileSubmissionDeadline({...input,knownAt:at('14'),effects:[received,withdrawn]})
 expect(later.items.map(item=>item.state)).toEqual(['WITHDRAWN','PENDING_DELIVERY'])
 expect(later.items[0]?.eventRefs).toEqual(['E1','E2'])
})

it('requires a new attempt or further evidence after an effective withdrawal',()=>{
 const afterWithdrawal={...received,eventRef:'E3',effectiveAt:at('11')}
 const later={...input,knownAt:at('14')}
 expect(reconcileSubmissionDeadline({...later,effects:[received,withdrawn,afterWithdrawal]}).items[0])
  .toMatchObject({state:'PENDING_EFFECT',attemptRef:null})
 expect(reconcileSubmissionDeadline({...later,effects:[received,withdrawn,{...afterWithdrawal,attemptRef:'NEW'}]}).items[0])
  .toMatchObject({state:'EFFECTIVE_ATTEMPT',attemptRef:'NEW'})
})

it('requires a proved replacement relation and does not resurrect what was withdrawn',()=>{
 const proposed={...received,kind:'REPLACED' as const,priorAttemptRef:'OLD',attemptRef:'NEW',eventRef:'E3',effectiveAt:at('11')}
 expect(reconcileSubmissionDeadline({...input,effects:[received,proposed]}).items[0]?.attemptRef).toBe('NEW')
 const withoutPrior=reconcileSubmissionDeadline({...input,knownAt:at('14'),effects:[received,withdrawn,proposed]})
 expect(withoutPrior.items[0]).toMatchObject({state:'PENDING_EFFECT',attemptRef:null})
})
