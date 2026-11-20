import {expect,it,vi} from 'vitest'
import {createContentOperationScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-operation-script-host'

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
 const input={registrationId:'bid.operation',attemptRef:'ATTEMPT'}
 const controller=new AbortController()

 const result=await host.invoke('content.operation.dispatch',input,controller.signal)

 expect(dispatchOperation).toHaveBeenCalledOnce()
 expect(dispatchOperation.mock.calls[0]?.[0]).toMatchObject({input,signal:controller.signal})
 expect(result).toMatchObject({state:'CHECK_ORIGINAL',observation:'CLAIM_UNKNOWN'})
})
