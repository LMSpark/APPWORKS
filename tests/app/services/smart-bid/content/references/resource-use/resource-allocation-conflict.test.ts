import {expect,it,vi} from 'vitest'
import {createResourceAllocationScriptHost} from '@/views/features/application/smart-bid/authority/resource-allocation-script-host'
import script from '@/views/features/application/smart-bid/authority/page07/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'
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

it('checks only the current enterprise allocation request and does not clear incomplete evidence',async()=>{
 const scope={enterpriseId:'ORG',projectId:'P',assertCurrent:()=>{}}
 const runtime={generation:1,isLoaded:true,destroyed:false}
 const request={resourceVersionId:'V1',requestRef:'REQUEST'}
 const start=Date.parse('2026-11-19T08:00:00+08:00'),end=start+3600000
 let complete=false
 const snapshot=vi.fn(async()=>({...scope,...request,complete,limit:1,requested:{start,end,units:1,exclusive:false},
  occupancies:[{allocationRef:'OTHER-PROJECT',start,end,units:1,exclusive:false}]}))
 let releaseComplete=false,endedAt=end+1,evidenceCurrent=true
 const allocation={enterpriseId:'ORG',projectId:'P',allocationRef:'ALLOC'}
 const readRelease=vi.fn(async()=>({allocation,complete:releaseComplete,effectiveAt:end,obligationRefs:['OBLIGATION'],
  evidence:[{...allocation,obligationRef:'OBLIGATION',endedAt,evidenceRef:'END-RECEIPT',
   assertCurrent:()=>{if(!evidenceCurrent)throw Error('EVIDENCE_STALE')}}],assertCurrent:scope.assertCurrent}))
 const host=createResourceAllocationScriptHost(runtime,scope,snapshot,readRelease)
 const signal=new AbortController().signal,showAlert=vi.fn(async()=>{})
 const {openAllocation,openAllocationRelease}=compileFunctions(script,{$route:{query:{resourceVersionId:'V1',allocationRequestRef:'REQUEST',allocationRef:'ALLOC'}},
  $page:{showAlert,invokeHostCommand:(name:string,input:unknown)=>host.invoke(name,input,signal)}} as unknown as PageContext)
 if(!openAllocation||!openAllocationRelease)throw Error('TEST_ALLOCATION_HANDLER_REQUIRED')
 await openAllocation()
 expect(showAlert).toHaveBeenLastCalledWith('占用记录尚未核全','跨项目占用核对')
 complete=true
 await openAllocation()
 expect(showAlert).toHaveBeenLastCalledWith(expect.stringContaining('涉及占用 OTHER-PROJECT'),'跨项目占用核对')
 expect(snapshot).toHaveBeenLastCalledWith({enterpriseId:'ORG',projectId:'P',...request},signal)
 await expect(host.invoke('bid.resources.checkAllocation',{...request,enterpriseId:'OTHER'},signal))
  .rejects.toThrow('BID_RESOURCE_ALLOCATION_PAGE_SCOPE')
 await expect(host.invoke('bid.resources.checkAllocation',{...request,requestRef:'OTHER'},signal))
  .rejects.toThrow('BID_RESOURCE_ALLOCATION_PAGE_SCOPE')
 await openAllocationRelease()
 expect(showAlert).toHaveBeenLastCalledWith('原义务清单尚未核全，继续占用','资源释放前核对')
 releaseComplete=true
 await openAllocationRelease()
 expect(showAlert).toHaveBeenLastCalledWith('继续占用 · 待核义务 OBLIGATION','资源释放前核对')
 endedAt=end
 await openAllocationRelease()
 expect(showAlert).toHaveBeenLastCalledWith('原调配 ALLOC · 可交释放决定 · 终止证据 END-RECEIPT','资源释放前核对')
 expect(readRelease).toHaveBeenLastCalledWith(allocation,signal)
 await expect(host.invoke('bid.resources.checkRelease',{allocationRef:'OTHER'},signal)).rejects.toThrow('BID_RESOURCE_ALLOCATION_PAGE_SCOPE')
 const checked=await host.invoke('bid.resources.checkRelease',{allocationRef:'ALLOC'},signal)
 evidenceCurrent=false
 expect(()=>checked.assertCurrent()).toThrow('EVIDENCE_STALE')

})
