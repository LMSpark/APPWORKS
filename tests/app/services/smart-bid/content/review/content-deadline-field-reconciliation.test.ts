import {expect,it} from 'vitest'
import {reconcileSubmissionDeadline} from '@/services/smart-bid/content/review/submission-reconciliation'
import {reconcileDeadlineFieldValues} from '@/views/features/application/smart-bid/authoring/model/review/content-deadline-field-reconciliation'

it('retains deadline reception while leaving nonmatching attempts and missing field observations pending',()=>{
 const time='2026-11-18T10:00:00+08:00'
 const deadline=reconcileSubmissionDeadline({cutoffAt:time,knownAt:time,obligationIds:['O1','O2'],effects:[
  {kind:'RECEIVED',eventRef:'E',obligationId:'O1',attemptRef:'SEND',effectiveAt:time,knownAt:time},
 ]})
 const source={projectId:'P',deadline,requiredFields:[{obligationId:'O1',assignmentId:'A',fieldId:'F'},
  {obligationId:'O2',assignmentId:'A',fieldId:'F'}],assertCurrent:()=>{}}
 let current=true
 const result={assignmentId:'A',fieldId:'F',observationRef:'OBS',state:'MISMATCHED' as const,observedValueHash:'a'.repeat(64),
  assertCurrent:()=>{}}
 const batch={projectId:'P',revisionId:'R',attemptRef:'SEND',receiptRef:'REC',results:[result],allSelectedFieldsMatched:false,
  assertCurrent:()=>{if(!current)throw Error('BATCH_STALE')}}
 const unrelated=reconcileDeadlineFieldValues(source,[{...batch,attemptRef:'OTHER'}])
 expect(unrelated.items[0]).toMatchObject({state:'EFFECTIVE_ATTEMPT',fields:[{state:'PENDING'}]})
 const linked=reconcileDeadlineFieldValues(source,[batch])
 expect(linked.items[0]).toMatchObject({state:'EFFECTIVE_ATTEMPT',fields:[{state:'MISMATCHED',observationRef:'OBS',receiptRef:'REC'}]})
 expect(linked.items[1]).toMatchObject({state:'PENDING_DELIVERY',fields:[{state:'PENDING'}]})
 current=false
 expect(()=>linked.assertCurrent()).toThrow('BATCH_STALE')
})
