import {expect,it} from 'vitest'
import {pairOriginalChannelReceipt} from '@/services/smart-bid/content/review/submission/channel-receipt-pairing'
import {reconcileSubmissionReceiptEffects} from '@/services/smart-bid/content/review/submission/submission-receipt-effects'

it('keeps an ambiguous receipt pending and retains sources when exact evidence pairs it',()=>{
 const scope={projectId:'P',lotId:'L',subjectId:'ORG',channelId:'PORTAL'}
 const first={...scope,kind:'RECEIVED' as const,eventRef:'EVENT',sourceRef:'PORTAL-COPY',
  eventAt:'2026-11-18T09:00:00+08:00',knownAt:'2026-11-18T09:11:00+08:00',operationRef:null,objectRef:'SAME-PKG'}
 const attempts=[{...scope,attemptRef:'A',operationRef:'OP-A',objectRef:first.objectRef},
  {...scope,attemptRef:'B',operationRef:'OP-B',objectRef:first.objectRef}]
 expect(pairOriginalChannelReceipt(scope,[first],attempts)).toMatchObject({state:'PENDING_PAIR',attemptRef:null})
 expect(pairOriginalChannelReceipt(scope,[{...first,objectRef:null}],attempts.slice(0,1))).toMatchObject({state:'PENDING_PAIR'})
 const exact={...first,operationRef:'OP-B'}
 const late={...exact,sourceRef:'OFFICIAL-COPY',knownAt:'2026-11-18T12:00:00+08:00'}
 expect(pairOriginalChannelReceipt(scope,[late,exact],attempts)).toMatchObject({state:'PAIRED',attemptRef:'B',
  sources:[{sourceRef:late.sourceRef,knownAt:late.knownAt},{sourceRef:exact.sourceRef,knownAt:exact.knownAt}]})
 expect(()=>pairOriginalChannelReceipt(scope,[exact,{...late,kind:'REJECTED'}],attempts)).toThrow('CHANNEL_RECEIPT_CONFLICT')
 const matched=pairOriginalChannelReceipt(scope,[late,exact],attempts)
 const assertCurrent=()=>{}
 const decision={kind:'RECEIVED' as const,eventRef:matched.eventRef,obligationId:'O',attemptRef:'B',
  effectiveAt:exact.eventAt,knownAt:exact.eventAt,ruleRef:'RULE',assertCurrent}
 const deadline={cutoffAt:'2026-11-18T10:00:00+08:00',knownAt:exact.eventAt,obligationIds:['O']}
 const source={scope,receipts:[matched],decisions:[decision],assertCurrent}
 expect(reconcileSubmissionReceiptEffects(deadline,source).items[0]?.state).toBe('PENDING_DELIVERY')
 const atCutoff=reconcileSubmissionReceiptEffects({...deadline,knownAt:exact.knownAt},source)
 expect(atCutoff.items[0]).toMatchObject({state:'EFFECTIVE_ATTEMPT',attemptRef:'B'})
 expect(atCutoff.evidence).toMatchObject([{ruleRef:'RULE',eventRef:exact.eventRef,receiptEventAt:exact.eventAt,
  sources:[{sourceRef:exact.sourceRef,knownAt:exact.knownAt}]}])
 expect(reconcileSubmissionReceiptEffects(deadline,source).evidence).toEqual([])
 expect(()=>reconcileSubmissionReceiptEffects(deadline,{...source,scope:{...scope,projectId:'OTHER'}}))
  .toThrow('SUBMISSION_RECEIPT_EFFECT_SCOPE')
 expect(()=>reconcileSubmissionReceiptEffects(deadline,{...source,receipts:[pairOriginalChannelReceipt(scope,[first],attempts)]}))
  .toThrow('SUBMISSION_RECEIPT_EFFECT_SCOPE')
 const withdrawAt='2026-11-18T09:30:00+08:00'
 const withdrawalRead={...exact,eventRef:'WITHDRAW',kind:'WITHDRAWAL_CONFIRMED' as const,
  eventAt:withdrawAt,knownAt:withdrawAt,operationRef:'OP-W'}
 const withdrawalOperation={...scope,attemptRef:'W',operationRef:'OP-W',objectRef:exact.objectRef,withdrawalTargetRef:'B'}
 const withdrawal=pairOriginalChannelReceipt(scope,[withdrawalRead],[...attempts,withdrawalOperation])
 const withdrawalSource={...source,receipts:[matched,withdrawal],decisions:[decision,
  {...decision,kind:'WITHDRAWN' as const,eventRef:'WITHDRAW',effectiveAt:withdrawAt,knownAt:withdrawAt}]}
 const revoked=reconcileSubmissionReceiptEffects({...deadline,knownAt:withdrawAt},withdrawalSource)
 expect(revoked.items[0]?.state).toBe('WITHDRAWN')
 expect(revoked.evidence[1]).toMatchObject({attemptRef:'B',receiptAttemptRef:'W'})
 const wrongTarget=pairOriginalChannelReceipt(scope,[withdrawalRead],[{...withdrawalOperation,withdrawalTargetRef:'A'}])
 expect(()=>reconcileSubmissionReceiptEffects({...deadline,knownAt:withdrawAt},{...withdrawalSource,receipts:[matched,wrongTarget]}))
  .toThrow('SUBMISSION_RECEIPT_EFFECT_SCOPE')
})
