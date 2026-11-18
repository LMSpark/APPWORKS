import {expect,it} from 'vitest'
import {checkResourceAllocationRelease} from '@/services/smart-bid/content/references/resource-use/resource-allocation-release'

const allocation={enterpriseId:'E',projectId:'P',allocationRef:'A'}
const input={allocation,effectiveAt:10,obligationRefs:['OB'],assertCurrent:()=>{}}
const evidence={...allocation,obligationRef:'OB',evidenceRef:'END',endedAt:10,assertCurrent:()=>{}}

it('keeps occupancy until there is evidence the original obligation ended',()=>{
 expect(checkResourceAllocationRelease({...input,evidence:[]})).toEqual({state:'KEEP_OCCUPIED',pending:['OB']})
 expect(checkResourceAllocationRelease({...input,evidence:[{...evidence,endedAt:11}]})).toEqual({
  state:'KEEP_OCCUPIED',pending:['OB'],
 })
 expect(checkResourceAllocationRelease({...input,evidence:[evidence]})).toEqual({
  state:'READY_FOR_RELEASE_DECISION',allocationRef:'A',effectiveAt:10,evidenceRefs:['END'],
 })
})

it('rejects evidence from another project or an obsolete query',()=>{
 expect(()=>checkResourceAllocationRelease({...input,evidence:[{...evidence,projectId:'OTHER'}]}))
  .toThrow('BID_RESOURCE_RELEASE_SCOPE')
 expect(()=>checkResourceAllocationRelease({...input,evidence:[{...evidence,assertCurrent:()=>{throw Error('STALE')}}]}))
  .toThrow('STALE')
})
