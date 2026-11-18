import {expect,it} from 'vitest'
import {computeDeliverySelectionDigests,verifyDeliverySelectionDigests} from '@/services/smart-bid/content/review/delivery-selection-digest'

it('binds fixed member positions and retains the approved basis and historical production references',async()=>{
 const member={manifestId:'COMMERCE',manifestVersion:'M1',position:'商务/投标函.pdf',fileVersionId:'L1',fileHash:'a'.repeat(64)}
 const other={...member,manifestId:'ECONOMICS',position:'经济/报价表.pdf',fileVersionId:'E2'}
 const input={requestKey:'FREEZE-1',requestDigest:'b'.repeat(64),selectionId:'DELIVERY',selectionVersion:'V2',expectedSelectionVersion:'V1',
  groupScope:{enterpriseId:'ORG',projectId:'P',lotId:'L',roundId:'R',stageId:'STAGE',obligationGroupId:'G'},
  targetBasisRefs:['A2'],members:[member,other],compatibilityRefs:['KEEP-L1-UNDER-A2','E2-MADE-UNDER-A2'],checkedStateRefs:['COVERAGE-A2']}
 const result=await computeDeliverySelectionDigests(input)
 expect(await verifyDeliverySelectionDigests({...input,...result,members:[other,member]})).toEqual(result)
 const newBasis=await computeDeliverySelectionDigests({...input,targetBasisRefs:['A3']})
 expect(newBasis.memberSetHash).toBe(result.memberSetHash)
 expect(newBasis.selectionHash).not.toBe(result.selectionHash)
 await expect(verifyDeliverySelectionDigests({...input,...result,members:[{...member,fileVersionId:'L0'},other]}))
  .rejects.toThrow('DELIVERY_SELECTION_HASH_MISMATCH')
 await expect(computeDeliverySelectionDigests({...input,members:[member,{...other,position:member.position}]}))
  .rejects.toThrow('DELIVERY_SELECTION_MEMBER')
})
