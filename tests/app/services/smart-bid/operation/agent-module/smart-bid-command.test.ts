import {describe,expect,it} from 'vitest'
import {createSmartBidCommand} from '@/services/smart-bid/operation/agent-module/smart-bid-command'

describe('SmartBid command envelope',()=>{
 const scope={registrationId:'SmartBidOperationModule',businessInstanceId:'PROJECT',runtimeInstanceId:'RUNTIME'}

 it('captures fixed runtime scope and strict JSON inputs',()=>{
  expect(createSmartBidCommand({
   operationId:'39',requestKey:'REQUEST',prompt:'采用候选',inputs:{revisionId:'REV'},
  },scope)).toEqual({
   operationId:'39',registrationId:'SmartBidOperationModule',businessInstanceId:'PROJECT',
   runtimeInstanceId:'RUNTIME',requestKey:'REQUEST',prompt:'采用候选',inputs:{revisionId:'REV'},
  })
 })

 it('rejects a conflicting explicit scope or invalid inputs',()=>{
  expect(()=>createSmartBidCommand({
   operationId:'39',businessInstanceId:'OTHER',requestKey:'REQUEST',prompt:'采用候选',inputs:{},
  },scope)).toThrow('SMART_BID_COMMAND_SCOPE_REQUIRED')
  expect(()=>createSmartBidCommand({
   operationId:'39',requestKey:'REQUEST',prompt:'采用候选',inputs:[],
  },scope)).toThrow('SMART_BID_COMMAND_INPUT_REQUIRED')
  expect(()=>createSmartBidCommand({
   operationId:'39',requestKey:'REQUEST',prompt:'采用候选',inputs:'{"revisionId":"REV"}',
  },scope)).toThrow('SMART_BID_COMMAND_INPUT_REQUIRED')
 })

  it('applies identity validation only when required by the caller contract',()=>{
   const blank={operationId:' ',requestKey:'',prompt:'采用候选',inputs:{}}
   const padded={...blank,operationId:' 39 ',requestKey:' REQUEST '}
   expect(()=>createSmartBidCommand(blank,scope)).not.toThrow()
   expect(()=>createSmartBidCommand(blank,{...scope,requireIdentity:true})).toThrow('SMART_BID_COMMAND_INPUT_REQUIRED')
   expect(()=>createSmartBidCommand(padded,{...scope,requireIdentity:true})).toThrow('SMART_BID_COMMAND_INPUT_REQUIRED')
  })
})
