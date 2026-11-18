import {expect,it} from 'vitest'
import {reviewApprovedPrice} from '@/services/smart-bid/content/references/approved-price-review'

const request={scopeRef:'LOT-ROUND',approvalRef:'APPROVAL',version:'V1',purposeRef:'SUBMISSION',rateOnly:false}
const assertCurrent=()=>{}
const approval={...request,approverRef:'OWNER',value:'0.00',unit:'CNY',detailRef:'DETAIL',assertCurrent}
const use={...request,decisionRef:'USE',state:'USABLE' as const,assertCurrent}
const detail={...request,detailRef:'DETAIL',matchesApproval:true,assertCurrent}

it('preserves the original approval while checking same-version details and current purpose',()=>{
 expect(reviewApprovedPrice(request,{assertCurrent})).toMatchObject({original:'PENDING_APPROVAL',use:'PENDING'})
 expect(reviewApprovedPrice(request,{approval,use,assertCurrent})).toMatchObject({original:'APPROVED',use:'PENDING'})
 expect(reviewApprovedPrice(request,{approval,detail,use,assertCurrent})).toMatchObject({original:'APPROVED',use:'USABLE',value:'0.00'})
 expect(reviewApprovedPrice(request,{approval,detail,use:{...use,state:'RESTRICTED'},assertCurrent}))
  .toMatchObject({original:'APPROVED',use:'RESTRICTED'})
 expect(()=>reviewApprovedPrice(request,{approval,detail:{...detail,version:'V2'},use,assertCurrent})).toThrow('BID_APPROVED_PRICE_SCOPE')
})

it('allows the direct rate path only where both the request and original permit it',()=>{
 const rate={...approval,rateOnly:true,unit:'%',detailRef:null}
 expect(reviewApprovedPrice({...request,rateOnly:true},{approval:rate,use,assertCurrent}).use).toBe('USABLE')
 expect(reviewApprovedPrice(request,{approval:rate,use,assertCurrent}).use).toBe('PENDING')
})

it('retains the original approval while a confirmed finding blocks this use',()=>{
 const finding={...request,findingRef:'FINDING',evidenceRef:'EVIDENCE',targetRef:'DETAIL',blocksUse:true,assertCurrent}
 const source={approval,detail,use,findings:[finding],assertCurrent}
 expect(reviewApprovedPrice(request,source)).toMatchObject({
  original:'APPROVED',use:'RESTRICTED',blockingFindingRefs:['FINDING'],
 })
 expect(reviewApprovedPrice(request,{...source,findings:[{...finding,blocksUse:false}]}).use).toBe('USABLE')
 expect(()=>reviewApprovedPrice(request,{...source,findings:[{...finding,targetRef:'OTHER'}]}))
  .toThrow('BID_APPROVED_PRICE_FINDING')
})
