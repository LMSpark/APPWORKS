import {expect,it} from 'vitest'
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
