import {expect,it,vi} from 'vitest'
import {createContentOperationScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-operation-script-host'
import {SmartBidOperationModule} from '@/services/smart-bid/operation/agent-module/smart-bid-operation-module'

it('exposes one trusted frontend SSE dispatch command through the current PageRuntime',async()=>{
 const runtime={generation:1,destroyed:false,isLoaded:true,resolveView:()=>undefined}
 const dispatchOperation=vi.fn(async command=>({
  state:'CHECK_ORIGINAL' as const,observation:'CLAIM_UNKNOWN' as const,turnId:'TURN',
  attempt:{runId:'RUN',attemptRef:'ATTEMPT',requestKey:'Q',projectId:'P',
   targetDigest:'a'.repeat(64),configurationLockHash:'b'.repeat(64)},
  command,
 }))
 const host=createContentOperationScriptHost(runtime,{
  executeTool:vi.fn(async()=>({ok:true,data:null})),
 },{
  scenarioId:'SPACE',projectId:'P',rootKind:'OperationRoute',assertCurrent:()=>{},dispatchOperation,
 })
 const input={operationId:'39',registrationId:'bid.operation',businessInstanceId:'P',
  runtimeInstanceId:'RUNTIME',requestKey:'Q',prompt:'采用候选',inputs:{revisionId:'REV'}}
 const controller=new AbortController()

 const result=await host.invoke('content.operation.dispatch',input,controller.signal)

 expect(dispatchOperation).toHaveBeenCalledOnce()
 expect(dispatchOperation.mock.calls[0]?.[0]).toMatchObject({input,signal:controller.signal})
 expect(result).toMatchObject({state:'CHECK_ORIGINAL',observation:'CLAIM_UNKNOWN'})
})

it('does not fall through to direct ClassModel execution when an SSE dispatcher is bound',async()=>{
 const runtime={generation:1,destroyed:false,isLoaded:true,resolveView:()=>undefined}
 const direct=vi.fn(async()=>({receiptRef:'DIRECT'}))
 const dispatchOperation=vi.fn(async()=>({state:'CHECK_ORIGINAL' as const,observation:'CLAIM_UNKNOWN' as const,
  turnId:'TURN',attempt:{runId:'RUN',attemptRef:'TRY',requestKey:'Q',projectId:'P',
   targetDigest:'a'.repeat(64),configurationLockHash:'b'.repeat(64)}}))
 const host=createContentOperationScriptHost(runtime,{executeTool:vi.fn(async()=>({ok:true,data:null}))},{
  scenarioId:'SPACE',projectId:'P',rootKind:'OperationRoute',assertCurrent:()=>{},
  operationModule:new SmartBidOperationModule(direct),dispatchOperation,
 })
 const input={operationId:'39',registrationId:'SmartBidOperationModule',businessInstanceId:'P',
  runtimeInstanceId:'RT',requestKey:'Q',prompt:'采用候选',inputs:{}}

 await host.invoke('content.operation.dispatch',input,new AbortController().signal)

 expect(dispatchOperation).toHaveBeenCalledOnce()
 expect(direct).not.toHaveBeenCalled()
})

it('dispatches through the generated SmartBid ClassModel module instance',async()=>{
 const runtime={generation:1,destroyed:false,isLoaded:true,resolveView:()=>undefined}
 const execute=vi.fn(async()=>({receiptRef:'R1'}))
 const operationModule=new SmartBidOperationModule(execute)
 const host=createContentOperationScriptHost(runtime,{
  executeTool:vi.fn(async()=>({ok:true,data:null})),
 },{
  scenarioId:'SPACE',projectId:'P',rootKind:'OperationRoute',assertCurrent:()=>{},operationModule,
 })
 const input={operationId:'39',registrationId:'SmartBidOperationModule',businessInstanceId:'P',
  runtimeInstanceId:'RT',requestKey:'Q',prompt:'采用候选',inputs:{revisionId:'REV'}}

 const result=await host.invoke('content.operation.dispatch',input,new AbortController().signal)

 expect(result).toMatchObject({operationId:'39',requestKey:'Q',outcome:{receiptRef:'R1'}})
 expect(execute).toHaveBeenCalledExactlyOnceWith(input)
 expect(result).toHaveProperty('assertCurrent')
})
