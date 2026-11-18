import {expect,it} from 'vitest'
import {checkCommitmentApprovalCoverage} from '@/services/smart-bid/content/references/commitment-approval-coverage'

const scope={scopeRef:'SCOPE',purposeRef:'USE',assertCurrent:()=>{}}
const price={key:'fee',kind:'PRICE' as const,value:'0',unit:'CNY'}
const person={key:'lead',kind:'PERSON' as const,value:'P1',unit:null}
const approvedPrice={...scope,...price,usable:true,decisionRefs:['PRICE-V1']}
const approvedPerson={...scope,...person,usable:true,decisionRefs:['PERSON-DECISION']}

it('requires separate approval of both price and person, retaining zero as a value',()=>{
 const input={...scope,fields:[price,person]}
 expect(checkCommitmentApprovalCoverage({...input,approvals:[approvedPrice]})).toMatchObject({ready:false,fields:[
  {key:'fee',state:'VERIFIED'},{key:'lead',state:'PENDING'},
 ]})
 expect(checkCommitmentApprovalCoverage({...input,approvals:[approvedPrice,approvedPerson]})).toMatchObject({ready:true})
 expect(checkCommitmentApprovalCoverage({...input,approvals:[approvedPrice,{...approvedPerson,value:'P2'}]}).ready).toBe(false)
 expect(checkCommitmentApprovalCoverage({...input,approvals:[approvedPrice,{...approvedPerson,usable:false}]}).ready).toBe(false)
 expect(()=>checkCommitmentApprovalCoverage({...input,approvals:[{...approvedPrice,purposeRef:'OTHER'},approvedPerson]}))
  .toThrow('BID_COMMITMENT_APPROVAL_SCOPE')
})
