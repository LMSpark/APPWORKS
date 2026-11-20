import {expect,it,vi} from 'vitest'
import {createResourceAllocationScriptHost} from '@/views/features/application/smart-bid/authority/resource-allocation-script-host'
import script from '@/views/features/application/smart-bid/authority/page07/script.js?raw'
import {checkResourceAllocationConflict} from '@/services/smart-bid/content/references/resource-use/resource-allocation-conflict'

const scope={limit:3,assertCurrent:()=>{}}
const requested={start:0,end:10,units:1,exclusive:false}
const first={start:0,end:5,units:2,exclusive:false,allocationRef:'A'}
const second={...first,start:5,end:10,allocationRef:'B'}

it('counts simultaneous usage and treats adjoining windows independently',()=>{
 expect(checkResourceAllocationConflict({...scope,requested,occupancies:[second,first]})).toEqual({state:'CLEAR'})
 expect(checkResourceAllocationConflict({...scope,requested,occupancies:[first,{...second,start:4}]})).toEqual({
  state:'CONFLICT',start:4,exclusive:false,overLimit:true,allocationRefs:['A','B'],
 })
})

it('detects an exclusive overlap even within capacity and refuses duplicate occupancy evidence',()=>{
 expect(checkResourceAllocationConflict({...scope,requested,occupancies:[{...first,exclusive:true}]})).toEqual({
  state:'CONFLICT',start:0,exclusive:true,overLimit:false,allocationRefs:['A'],
 })
 expect(()=>checkResourceAllocationConflict({...scope,requested,occupancies:[first,first]}))
  .toThrow('BID_RESOURCE_ALLOCATION_SCOPE')
})


it('excludes only the verified prior allocation when checking an adjustment',async()=>{
 const scope={enterpriseId:'ORG',projectId:'P',assertCurrent:()=>{}}
 const request={resourceVersionId:'V',requestRef:'ADJUST'}
 const requested={start:0,end:10,units:1,exclusive:false}
 const previous={enterpriseId:'ORG',projectId:'P',resourceVersionId:'V',allocationRef:'OWN',assertCurrent:()=>{}}
 const own={...requested,exclusive:true,allocationRef:'OWN'}
 const other={...requested,allocationRef:'OTHER',units:2}
 let snapshot={...scope,...request,requested,limit:2,complete:true,previous,occupancies:[own,other]}
 const host=createResourceAllocationScriptHost({generation:1,isLoaded:true,destroyed:false},scope,{readSnapshot:async()=>snapshot})
 const check=()=>host.invoke('bid.resources.checkAllocation',request,new AbortController().signal)
 await expect(check()).resolves.toMatchObject({state:'CONFLICT',allocationRefs:['OTHER'],replacesAllocationRef:'OWN'})
 snapshot={...snapshot,occupancies:[own]}
 await expect(check()).resolves.toMatchObject({state:'CLEAR',replacesAllocationRef:'OWN'})
 snapshot={...snapshot,occupancies:[]}
 await expect(check()).rejects.toThrow('BID_RESOURCE_ALLOCATION_SCOPE')
 snapshot={...snapshot,occupancies:[own],previous:{...previous,projectId:'OTHER'}}
 await expect(check()).rejects.toThrow('BID_RESOURCE_ALLOCATION_PAGE_SCOPE')
})
