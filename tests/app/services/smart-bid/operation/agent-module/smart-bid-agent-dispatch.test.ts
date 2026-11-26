import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {DataSet,bindDataSetCommandSubmit,ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {PageRuntime,PageTool} from '@spark-appworks/spark-project-model'
import {createSmartBidAgentDispatcher} from '@/services/smart-bid/operation/agent-module/smart-bid-agent-dispatch'
import type {AiAgentTurnBridgeOptions} from '@/services/ai/ai-turn-bridge'
import type {AiAgentTurnCallbacks} from '@spark-appworks/spark-ai/agent'
import {readOperationDispatchParameter} from '@/views/features/application/smart-bid/authoring/model/operation/content-operation-parameter-reader'

const state=vi.hoisted(()=>({script:'',sent:false,failReturn:false,failBefore:false,forwarded:vi.fn(),prompt:vi.fn()}))
vi.mock('@/services/ai/ai-turn-bridge',()=>({
 createAiAgentTurnCallbacks:(options:AiAgentTurnBridgeOptions={})=>{
  const callbacks:AiAgentTurnCallbacks={
   prepareSession:async()=>undefined,
   executeTurn:async input=>{
    if(state.sent)return {text:'settled',toolCalls:[]}
    state.sent=true
    state.prompt(input.messages.filter(row=>row.role==='user').at(-1)?.content)
    options.onAccepted?.({sessionId:'SSE-SESSION',turnId:'SSE-TURN',localTurnId:input.turn.turnId})
    if(state.failBefore)throw Error('LOCAL_TURN_INTERRUPTED')
    return {text:'',toolCalls:[{id:'CALL',type:'function',function:{
     name:'model_script',arguments:JSON.stringify({script:state.script}),
    }}]}
   },
   appendMessages:async input=>{state.forwarded(input.messages);if(state.failReturn)throw Error('LOCAL_TOOL_RETURN_INTERRUPTED')},
  }
  return callbacks
 },
}))

afterEach(()=>{
 vi.unstubAllGlobals();state.sent=false;state.failReturn=false;state.failBefore=false
 state.forwarded.mockReset();state.prompt.mockReset()
})


const fetchFromGenerated=vi.fn(async(input:RequestInfo|URL)=>{
  const href=input instanceof Request?input.url:String(input)
  const pathname=new URL(href,globalThis.location.href).pathname
  if(!pathname.startsWith('/dts-class-model/'))throw Error('External fetch refused by local fixture')
  const path=resolve('generated',pathname.slice(1))
  return new Response((await readFile(path)).toString('utf8'),{headers:{'Content-Type':'application/json'}})
 })
beforeEach(()=>{
 fetchFromGenerated.mockClear()
 vi.stubGlobal('fetch',fetchFromGenerated)
})

async function openCommandRuntime(){
 const scenarioId='SPACE'
 const dataSet=DataSet.fromJson({scenarioId,tables:{}})
 const view=ensureDataSetResourceView({dataSet,tableName:'SmartBidAction',resource:{resourceType:'command',resourceId:'smart-bid:action'},
  columns:[{name:'commandId',primary:true},...['operationId','registrationId','businessInstanceId','runtimeInstanceId','requestKey','prompt','receiptRef']
   .map(name=>({name})),{name:'inputs',type:'json'}]})
 const submit=vi.fn(async row=>({...row,receiptRef:'RECEIPT'}))
 const verify=vi.fn(async()=>undefined)
 bindDataSetCommandSubmit(view,{resource:{resourceType:'command',resourceId:'smart-bid:action'},
  guard:()=>{},inputFields:['operationId','registrationId','businessInstanceId','runtimeInstanceId','requestKey','prompt','inputs'],
  createKey:()=> crypto.randomUUID(),submit,verify,isUnconfirmed:error=>error instanceof Error&&error.message==='LOCAL_OWNER_RECEIPT_LOST'})
 await view.refresh()
 const tool=new PageTool({pageId:'TEST-OWNER'})
 tool.hydrateFileText('rule.json','[]')
 tool.hydrateFileText('script.js','')
 tool.hydrateFileText('style.css','')
 tool.markLoaded()
 const runtime=new PageRuntime({tool,scenarioIds:[scenarioId],mainScenarioId:scenarioId,loadScenario:async()=>dataSet})
 await runtime.load()
 const createDispatcher=()=>createSmartBidAgentDispatcher({runtime,scenarioId,projectId:'PROJECT',assertCurrent:()=>{}})
 const dispatcher=createDispatcher()
 const command={operationId:'39',registrationId:'SmartBidOperationModule',businessInstanceId:'PROJECT',
  runtimeInstanceId:runtime.call.instanceId,requestKey:'ORIGINAL',prompt:'原采用请求',inputs:{revisionId:'V1',options:{copies:1}}}
 return {command,dispatcher,createDispatcher,signal:new AbortController().signal,submit,verify,runtime}
}


it.each(['identical','reordered','changed','changed-prompt'] as const)('requires exact input in the generated ClassModel tool path for %s',async mode=>{
 const f=await openCommandRuntime()
 try{
  const provided=mode==='changed-prompt'?{...f.command,prompt:'替代提示'}
   :mode==='changed'?{...f.command,inputs:{...f.command.inputs,revisionId:'V2'}}
   :mode==='reordered'?{...f.command,inputs:{options:{copies:1},revisionId:'V1'}}:f.command
  state.script=`return await this.dispatchOperation(${JSON.stringify(provided)})`
  const result=await f.dispatcher.dispatch(f.command,f.signal)
  expect(fetchFromGenerated.mock.calls.some(call=>String(call[0]).includes('manifest.json'))).toBe(true)
  expect(state.forwarded).toHaveBeenCalledOnce()
  expect(state.prompt).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('"revisionId":"V1"'))
  if(mode==='changed'||mode==='changed-prompt'){
   expect(f.submit).not.toHaveBeenCalled()
   expect(result.outcome).toMatchObject({state:'NO_ACTION_RECEIPT',dispatched:false})
   expect(JSON.stringify(state.forwarded.mock.calls)).toContain('SMART_BID_AGENT_DISPATCH_INPUT_CHANGED')
  }else{
   expect(f.submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({inputs:f.command.inputs}),expect.anything())
   expect(result.outcome).toMatchObject({state:'ACTION_APPLIED',dispatched:true,actionReceipt:{receiptRef:'RECEIPT'}})
  }
 }finally{f.runtime.dispose()}
})

it('preserves the original owner receipt when the actual tool-result return is interrupted',async()=>{
 const f=await openCommandRuntime()
 try{
  state.script=`return await this.dispatchOperation(${JSON.stringify(f.command)})`
  state.failReturn=true
  const dispatch=await f.dispatcher.dispatch(f.command,f.signal)
  expect(f.submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({requestKey:'ORIGINAL'}),expect.anything())
  expect(state.forwarded).toHaveBeenCalledOnce()
  expect(dispatch.outcome).toMatchObject({state:'ACTION_APPLIED',dispatched:true,
   actionReceipt:{requestKey:'ORIGINAL',receiptRef:'RECEIPT'},error:'LOCAL_TOOL_RETURN_INTERRUPTED'})
  const readback=await readOperationDispatchParameter({projectId:'PROJECT',assertCurrent:()=>{}},dispatch)
  expect(readback.readActionReceipt()).toMatchObject({requestKey:'ORIGINAL',receiptRef:'RECEIPT'})
  expect(f.submit).toHaveBeenCalledOnce()
 }finally{f.runtime.dispose()}
})

it('uses the same owner execution for a repeated command in one generated ClassModel turn',async()=>{
 const f=await openCommandRuntime()
 try{
  const literal=JSON.stringify(f.command)
  state.script=`const first=await this.dispatchOperation(${literal}); const repeated=await this.dispatchOperation(${literal}); return repeated;`
  const result=await f.dispatcher.dispatch(f.command,f.signal)
  expect(f.submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({requestKey:'ORIGINAL'}),expect.anything())
  expect(result.outcome).toMatchObject({state:'ACTION_APPLIED',dispatched:true,actionReceipt:{requestKey:'ORIGINAL',receiptRef:'RECEIPT'}})
 }finally{f.runtime.dispose()}
})

it.each(['confirmed','delivery-failed','owner-unknown'] as const)('stops a new turn for the same owner attempt after %s',async mode=>{
 const f=await openCommandRuntime()
 try{
  state.script=`return await this.dispatchOperation(${JSON.stringify(f.command)})`
  state.failReturn=mode==='delivery-failed'
  if(mode==='owner-unknown') f.submit.mockRejectedValueOnce(Error('LOCAL_OWNER_RECEIPT_LOST'))
  const original=await f.dispatcher.dispatch(f.command,f.signal)
  expect(original.outcome.state).toBe(mode==='owner-unknown'?'NO_ACTION_RECEIPT':'ACTION_APPLIED')
  state.sent=false;state.failReturn=false
  await expect(f.createDispatcher().dispatch(f.command,f.signal)).rejects.toThrow('SMART_BID_AGENT_ORIGINAL_REQUEST_ENTERED')
  await expect(f.dispatcher.dispatch({...f.command,inputs:{revisionId:'V2'}},f.signal)).rejects.toThrow('SMART_BID_AGENT_ORIGINAL_REQUEST_ENTERED')
  expect(state.prompt).toHaveBeenCalledOnce()
  expect(f.submit).toHaveBeenCalledOnce()
  expect(f.verify).not.toHaveBeenCalled()
  if(mode==='owner-unknown')return
  const originalRead=await readOperationDispatchParameter({projectId:'PROJECT',assertCurrent:()=>{}},original)
  expect(originalRead.readActionReceipt()).toMatchObject({requestKey:'ORIGINAL',receiptRef:'RECEIPT'})
  const next={...f.command,requestKey:'NEW'}
  state.script=`return await this.dispatchOperation(${JSON.stringify(next)})`
  expect((await f.dispatcher.dispatch(next,f.signal)).outcome.state).toBe('ACTION_APPLIED')
  expect(f.submit).toHaveBeenCalledTimes(2)
 }finally{f.runtime.dispose()}
})

it('retains a transport interruption before any owner receipt as unknown',async()=>{
 const f=await openCommandRuntime()
 try{
  state.failBefore=true
  const result=await f.dispatcher.dispatch(f.command,f.signal)
  expect(result.outcome).toEqual({
   sessionId:'SSE-SESSION',turnId:'SSE-TURN',transport:'SSE',state:'SSE_UNKNOWN',dispatched:false,error:'LOCAL_TURN_INTERRUPTED',
  })
  expect(f.submit).not.toHaveBeenCalled()
  state.sent=false;state.failBefore=false
  state.script=`return await this.dispatchOperation(${JSON.stringify(f.command)})`
  expect((await f.dispatcher.dispatch(f.command,f.signal)).outcome.state).toBe('ACTION_APPLIED')
  expect(f.submit).toHaveBeenCalledOnce()
 }finally{f.runtime.dispose()}
})

it('captures the original command and nested values before awaiting its digest',async()=>{
 const f=await openCommandRuntime()
 try{
  state.script=`return await this.dispatchOperation(${JSON.stringify(f.command)})`
  const pending=f.dispatcher.dispatch(f.command,f.signal)
  f.command.prompt='新提示'
  f.command.inputs.revisionId='V2'
  f.command.inputs.options.copies=2
  const result=await pending
  const expected={prompt:'原采用请求',inputs:{revisionId:'V1',options:{copies:1}}}
  expect(f.submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(expected),expect.anything())
  expect(result.parameters).toMatchObject(expected)
  expect(state.prompt).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('原采用请求'))
 }finally{f.runtime.dispose()}
})

it('keeps its original dispatch slot while awaiting the digest',async()=>{
 const f=await openCommandRuntime()
 try{
  state.script=`return await this.dispatchOperation(${JSON.stringify(f.command)})`
  const first=f.dispatcher.dispatch(f.command,f.signal)
  const overlap=f.dispatcher.dispatch({...f.command,requestKey:'SECOND'},f.signal)
  const repeat=f.createDispatcher().dispatch(f.command,f.signal)
  const [owner,other,duplicate]=await Promise.allSettled([first,overlap,repeat])
  expect(owner).toMatchObject({status:'fulfilled',value:{requestKey:'ORIGINAL',outcome:{state:'ACTION_APPLIED'}}})
  expect(other).toMatchObject({status:'rejected',reason:expect.objectContaining({message:'SMART_BID_AGENT_DISPATCH_BUSY'})})
  expect(duplicate).toMatchObject({status:'rejected',reason:expect.objectContaining({message:'SMART_BID_AGENT_ORIGINAL_REQUEST_ENTERED'})})
  expect(f.submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({requestKey:'ORIGINAL'}),expect.anything())
 }finally{f.runtime.dispose()}
})
