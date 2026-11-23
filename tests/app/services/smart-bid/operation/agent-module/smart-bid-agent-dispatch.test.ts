import {afterEach,expect,it,vi} from 'vitest'
import {DataSet,bindDataSetCommandSubmit,ensureDataSetResourceView} from '@spark-appworks/spark-data'

type ContractInput={operationId:string;registrationId:string;businessInstanceId:string;runtimeInstanceId:string;
 requestKey:string;prompt:string;inputs:Record<string,unknown>}
const state=vi.hoisted(()=>({
 accepted:undefined as ((identity:Readonly<{sessionId:string;turnId:string;localTurnId:string}>)=>void)|undefined,
 operation:undefined as undefined|{dispatchOperation:(command:unknown)=>Promise<unknown>},
 inputContract:undefined as undefined|{toOrchestration:(input:ContractInput)=>Readonly<{userMessage:string}>},
 failRun:false,
}))

vi.mock('@/services/ai/ai-turn-bridge',()=>({
 createAiAgentTurnCallbacks:(options:Readonly<{
  onAccepted?:(identity:Readonly<{sessionId:string;turnId:string;localTurnId:string}>)=>void
 }>)=>{state.accepted=options.onAccepted;return {prepareSession:vi.fn(),executeTurn:vi.fn(),appendMessages:vi.fn()}},
}))
vi.mock('@spark-appworks/spark-ai/agent',async importOriginal=>{
 const actual=await importOriginal<typeof import('@spark-appworks/spark-ai/agent')>()
 return {...actual,ClassModelAgentAdapter:{register:(options:Readonly<{
  options:Readonly<{instance:{dispatchOperation:(command:unknown)=>Promise<unknown>};
  inputContract:{toOrchestration:(input:ContractInput)=>Readonly<{userMessage:string}>}}>
 }>)=>{
  state.operation=options.options.instance
  state.inputContract=options.options.inputContract
  return {run:async(_alias:string,input:unknown,chat:Readonly<{turn:Readonly<{turnId:string}>}>)=>{
   state.accepted?.({sessionId:'SSE-SESSION',turnId:'SSE-TURN',localTurnId:chat.turn.turnId})
   if(state.failRun)throw Error('SSE_TIMEOUT')
   await state.operation?.dispatchOperation(input)
   return {session:{sessionId:'LOCAL'},task:{}}
  }}
 }},createAiAgentHost:()=>({})}
})

import {createSmartBidAgentDispatcher} from '@/services/smart-bid/operation/agent-module/smart-bid-agent-dispatch'

afterEach(()=>{state.failRun=false})

it('dispatches through Spark AI/SSE and exposes the real transport ACK after the original owner receipt',async()=>{
 const dataSet=DataSet.fromJson({scenarioId:'SPACE',tables:{}})
 const view=ensureDataSetResourceView({dataSet,tableName:'SmartBidAction',resource:{resourceType:'command',resourceId:'smart-bid:action'},
  columns:[{name:'commandId',primary:true},...['operationId','registrationId','businessInstanceId','runtimeInstanceId','requestKey','prompt','receiptRef']
   .map(name=>({name})),{name:'inputs',type:'json'}]})
 const submit=vi.fn(async row=>({...row,receiptRef:'RECEIPT'}))
 bindDataSetCommandSubmit(view,{resource:{resourceType:'command',resourceId:'smart-bid:action'},
  guard:()=>{},inputFields:['operationId','registrationId','businessInstanceId','runtimeInstanceId','requestKey','prompt','inputs'],
  createKey:()=> 'COMMAND-1',submit,verify:async()=>undefined})
 await view.refresh()
 const runtime={destroyed:false,isLoaded:true,getDataSet:()=>dataSet,call:{instanceId:'RUNTIME',scenarioIds:['SPACE']}}
 const dispatcher=createSmartBidAgentDispatcher({runtime:runtime as never,scenarioId:'SPACE',projectId:'PROJECT',assertCurrent:()=>{}})
 const command={operationId:'39',registrationId:'SmartBidOperationModule',businessInstanceId:'PROJECT',
  runtimeInstanceId:'RUNTIME',requestKey:'REQUEST',prompt:'采用候选',inputs:{revisionId:'REVISION'}}
 const signal=new AbortController().signal
 await expect(dispatcher.dispatch(command,signal)).resolves.toEqual({
  operationId:'39',requestKey:'REQUEST',parameters:command,inputDigest:expect.stringMatching(/^[a-f0-9]{64}$/u),
  outcome:{sessionId:'SSE-SESSION',turnId:'SSE-TURN',transport:'SSE',state:'ACTION_APPLIED',
   dispatched:true,actionReceipt:expect.objectContaining({receiptRef:'RECEIPT'})},
 })
 expect(submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(command),expect.anything())
 expect(state.inputContract?.toOrchestration(command).userMessage)
  .toContain('"revisionId":"REVISION"')
 dataSet.destroy()
})

it('preserves the real SSE ACK as unknown instead of replaying an interrupted turn',async()=>{
 state.failRun=true
 const dataSet=DataSet.fromJson({scenarioId:'SPACE',tables:{}})
 const runtime={destroyed:false,isLoaded:true,getDataSet:()=>dataSet,call:{instanceId:'RUNTIME',scenarioIds:['SPACE']}}
 const dispatcher=createSmartBidAgentDispatcher({runtime:runtime as never,scenarioId:'SPACE',projectId:'PROJECT',assertCurrent:()=>{}})
 const command={operationId:'39',registrationId:'SmartBidOperationModule',businessInstanceId:'PROJECT',
  runtimeInstanceId:'RUNTIME',requestKey:'REQUEST',prompt:'采用候选',inputs:{revisionId:'REVISION'}}
 await expect(dispatcher.dispatch(command,new AbortController().signal)).resolves.toEqual({
  operationId:'39',requestKey:'REQUEST',parameters:command,inputDigest:expect.stringMatching(/^[a-f0-9]{64}$/u),
  outcome:{sessionId:'SSE-SESSION',turnId:'SSE-TURN',transport:'SSE',state:'SSE_UNKNOWN',
   dispatched:false,error:'SSE_TIMEOUT'},
 })
 dataSet.destroy()
})
