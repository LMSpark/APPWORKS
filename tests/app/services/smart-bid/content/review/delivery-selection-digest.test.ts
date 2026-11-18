import {expect,it} from 'vitest'
import {computeDeliverySelectionDigests,prepareDeliveryFreezeSelection,verifyDeliverySelectionDigests} from '@/services/smart-bid/content/review/delivery-selection-digest'
import {readOriginalDeliveryFreeze} from '@/services/smart-bid/content/review/delivery-freeze-recovery'

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
 const {requestKey,requestDigest,groupScope}=input
 const request={requestKey,requestDigest,groupScope}
 let current=true
 const assertCurrent=()=>{if(!current)throw Error('FREEZE_SOURCE_STALE')}
 const uses=input.members.map(file=>({...file,projectId:'P',evidenceRef:'COVERAGE-A2',usage:null,allowed:true,assertCurrent}))
 const prepared=await prepareDeliveryFreezeSelection(input,uses)
 expect(prepared.record).toMatchObject(result)
 await expect(prepareDeliveryFreezeSelection(input,uses.map(use=>({...use,usage:'READ_ONLY'}))))
  .rejects.toThrow('DELIVERY_FREEZE_MEMBER_USE')
 await expect(prepareDeliveryFreezeSelection(input,uses.map(use=>({...use,evidenceRef:'OTHER'}))))
  .rejects.toThrow('DELIVERY_FREEZE_MEMBER_USE')
 const read=(lookup:Parameters<typeof readOriginalDeliveryFreeze>[1]['lookup'])=>
  readOriginalDeliveryFreeze(request,{lookup,assertCurrent})
 expect(await read(async()=>undefined)).toMatchObject({status:'UNKNOWN'})
 expect(await read(async()=>({request,status:'NOT_EFFECTIVE',terminalRef:'TERMINAL',assertCurrent})))
  .toMatchObject({status:'NOT_EFFECTIVE',terminalRef:'TERMINAL'})
 const original=await read(async()=>({request,status:'FROZEN',record:{...input,...result},assertCurrent}))
 expect(original).toMatchObject({status:'FROZEN',record:{selectionVersion:'V2',selectionHash:result.selectionHash}})
 await expect(read(async()=>({request,status:'FROZEN',record:{...input,...result,requestKey:'LATER'},assertCurrent})))
  .rejects.toThrow('DELIVERY_FREEZE_REQUEST_SCOPE')
 current=false
 expect(()=>prepared.assertCurrent()).toThrow('FREEZE_SOURCE_STALE')
 expect(()=>original.assertCurrent()).toThrow('FREEZE_SOURCE_STALE')
})
