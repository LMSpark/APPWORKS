import {expect,it,vi} from 'vitest'
import {SmartBidOperationModule} from '@/services/smart-bid/operation/agent-module/smart-bid-operation-module'

it('executes only the current frontend owner and preserves operation identity',async()=>{
 const execute=vi.fn(async()=>({receiptRef:'R1'}))
 const module=new SmartBidOperationModule(execute)
 const command={operationId:'39',registrationId:'SmartBidOperationModule',businessInstanceId:'P',
  runtimeInstanceId:'RT',requestKey:'Q',prompt:'采用候选',inputs:{revisionId:'R'}}

 await expect(module.dispatchOperation(command)).resolves.toEqual({
  operationId:'39',requestKey:'Q',outcome:{receiptRef:'R1'},
 })
 expect(execute).toHaveBeenCalledExactlyOnceWith(command)
 await expect(module.dispatchOperation({...command,requestKey:''})).rejects.toThrow('SMART_BID_OPERATION_SCOPE')
 expect(execute).toHaveBeenCalledOnce()
})

it('executes an exact generated model action through the root module',async()=>{
 const execute=vi.fn(async()=>({receiptRef:'R39'}))
 const module=new SmartBidOperationModule(execute)
 const input={registrationId:'SmartBidOperationModule',businessInstanceId:'P',runtimeInstanceId:'RT',
  requestKey:'Q',prompt:'采用候选',inputs:{revisionId:'R'}}

 await expect(module.dispatchAction({kind:'ContentAdoption',actionName:'采用变更',input}))
  .resolves.toEqual({operationId:'39',requestKey:'Q',outcome:{receiptRef:'R39'}})
 expect(execute).toHaveBeenCalledExactlyOnceWith({...input,operationId:'39'})
 await expect(module.dispatchAction({kind:'ContentAdoption',actionName:'toString',input}))
  .rejects.toThrow('SMART_BID_MODEL_ACTION_UNAVAILABLE')
})
