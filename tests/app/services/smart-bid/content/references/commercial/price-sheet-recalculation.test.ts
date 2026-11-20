import {expect,it} from 'vitest'
import {matchApprovedPriceDetail,recalculatePriceLines} from '@/services/smart-bid/content/references/commercial/price-sheet-recalculation'
import {reviewApprovedPrice} from '@/services/smart-bid/content/references/commercial/approved-price-review'

const base={pricingVersion:'PRICE-V1',currency:'CNY',precision:2,rounding:'HALF_UP' as const,assertCurrent:()=>{}}
const line={lineRef:'A',sourceRef:'SOURCE',unit:'项',quantity:'3',unitPrice:'0.335',reportedAmount:'1.005'}

it('calculates decimal amounts, signed amounts and differences without float conversion',()=>{
 expect(recalculatePriceLines({...base,lines:[line,{...line,lineRef:'B',quantity:'-3',reportedAmount:'-1.01'}]}))
  .toMatchObject({total:'0.00',lines:[{amount:'1.01',difference:'0.005'},{amount:'-1.01',difference:'0.00'}]})
 expect(recalculatePriceLines({...base,rounding:'TRUNCATE',lines:[line]}).total).toBe('1.00')
 expect(recalculatePriceLines({...base,lines:[{...line,quantity:'9007199254740993',unitPrice:'0.01'}]}).total)
  .toBe('90071992547409.93')
})

it('rejects duplicate line references and invalid decimal input',()=>{
 expect(()=>recalculatePriceLines({...base,lines:[line,line]})).toThrow('BID_PRICE_RECALCULATION_SCOPE')
 expect(()=>recalculatePriceLines({...base,lines:[{...line,quantity:'1e2'}]})).toThrow('BID_PRICE_DECIMAL')
})

it('checks the approved pricing version and every line even when the total matches',()=>{
 const target={scopeRef:'LOT',approvalRef:'A',version:'V1',purposeRef:'BID',rateOnly:false}
 const approval={...target,pricingVersion:base.pricingVersion,approverRef:'OWNER',value:'1.010',unit:'CNY',
  detailRef:'DETAIL',assertCurrent:base.assertCurrent}
 const use={...target,state:'USABLE' as const,decisionRef:'USE',assertCurrent:base.assertCurrent}
 const reconciled=recalculatePriceLines({...base,lines:[{...line,reportedAmount:'1.01'}]})
 const incomplete=recalculatePriceLines({...base,lines:[line]})
 const detail=matchApprovedPriceDetail(approval,reconciled)
 expect(reviewApprovedPrice(target,{approval,detail,use,assertCurrent:base.assertCurrent}).use).toBe('USABLE')
 expect(matchApprovedPriceDetail(approval,incomplete).matchesApproval).toBe(false)
 expect(()=>matchApprovedPriceDetail(approval,{...reconciled,pricingVersion:'PRICE-V2'}))
  .toThrow('BID_PRICE_APPROVED_DETAIL_VERSION')
})
