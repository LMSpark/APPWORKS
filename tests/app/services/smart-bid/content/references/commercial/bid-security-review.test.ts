import {expect,it} from 'vitest'
import {readBidSecurityFreezeEvidence,reviewBidSecurity} from '@/services/smart-bid/content/references/commercial/bid-security-review'

const scope={scopeRef:'LOT',requirementVersion:'R1',liablePartyRef:'P',assertCurrent:()=>{}}
const clause={...scope,clauseRef:'CLAUSE'}
const cash={...clause,kind:'REQUIRED' as const,methodRef:'CASH',milestones:['RECEIVED','LINKED'] as const,deadline:10}
const receipt={...scope,methodRef:'CASH',effectiveAt:5,knownAt:5}

it('records the application without treating it as a completed deposit',()=>{
 const requested={...receipt,kind:'REQUESTED' as const,receiptRef:'Q'}
 const received={...receipt,kind:'RECEIVED' as const,receiptRef:'R'}
 const linked={...receipt,kind:'LINKED' as const,receiptRef:'L',knownAt:11}
 expect(reviewBidSecurity(cash,{asOf:10,receipts:[requested,received,linked]})).toMatchObject({
  state:'PENDING',requested:true,pending:['LINKED'],proofRefs:['R'],
 })
 expect(reviewBidSecurity(cash,{asOf:11,receipts:[requested,received,linked]})).toMatchObject({
  state:'VERIFIED',proofRefs:['L','R'],
 })
})

it('requires the correct currency, sufficient funds and an on-time receipt',()=>{
 const amount={minorUnits:'10000',currency:'CNY'}
 const requirement={...cash,amount,milestones:['RECEIVED'] as const}
 const received={...receipt,kind:'RECEIVED' as const,receiptRef:'R',amount}
 for(const item of [{...received,amount:{...amount,minorUnits:'9999'}},{...received,amount:{...amount,currency:'USD'}},
  {...received,effectiveAt:11,knownAt:11}]){
  expect(reviewBidSecurity(requirement,{asOf:12,receipts:[item]})).toMatchObject({state:'PENDING',pending:['RECEIVED']})
 }
 expect(reviewBidSecurity(requirement,{asOf:10,receipts:[received]}).state).toBe('VERIFIED')
})

it('requires the original exemption proof when the tender makes it conditional',()=>{
 const requirement={...clause,kind:'CONDITIONAL_EXEMPT' as const,conditionRefs:['EXEMPTION']}
 const proof={...scope,kind:'EXEMPTION_PROOF' as const,conditionRef:'EXEMPTION',receiptRef:'E',knownAt:5,effectiveAt:5}
 expect(reviewBidSecurity(requirement,{asOf:10,receipts:[]})).toMatchObject({state:'PENDING',pending:['EXEMPTION']})
 expect(reviewBidSecurity(requirement,{asOf:10,receipts:[proof]})).toMatchObject({state:'EXEMPT',proofRefs:['E']})
 expect(()=>reviewBidSecurity(requirement,{asOf:10,receipts:[{...proof,liablePartyRef:'WRONG'}]}))
  .toThrow('BID_SECURITY_RECEIPT_SCOPE')
})

it('blocks the current freeze when required evidence is missing and rejects another scope',()=>{
 const pending=reviewBidSecurity(cash,{asOf:10,receipts:[]})
 expect(readBidSecurityFreezeEvidence(scope,pending)).toMatchObject({ready:false,pending:['RECEIVED','LINKED']})
 const exempt=reviewBidSecurity({...clause,kind:'EXEMPT'},{asOf:10,receipts:[]})
 expect(readBidSecurityFreezeEvidence(scope,exempt)).toMatchObject({ready:true,checkedStateRefs:['CLAUSE']})
 expect(()=>readBidSecurityFreezeEvidence({...scope,requirementVersion:'OTHER'},exempt)).toThrow('BID_SECURITY_FREEZE_SCOPE')
})
