import {expect,it,vi} from 'vitest'
import {AiAgentRegistration,AiAgentToolResult,DefaultAiAgentSessionStore,createSimpleInputContract} from '@spark-appworks/spark-ai/agent'
import {dispatchOperationRouteAgentTask,prepareOperationRouteAgentTask} from '@/services/smart-bid/operation/operation-route-agent-task'

it('uses a registered SPARK Agent input contract and rejects another runtime instance',async()=>{
 const registrationId='bid.route.compose',businessInstanceId='ROUTE-1'
 const registration=new AiAgentRegistration({
  moduleId:registrationId,name:'路线编排',description:'生成路线候选',
  runtime:{getTools:()=>[],executeTool:async()=>AiAgentToolResult.ok({}),
   projectKnowledge:()=>({promptSnapshot:'路线工艺'}),
   inspect:()=>({status:'ok',rootKinds:['Route'],moduleCount:1,findings:[]})},
  inputContract:createSimpleInputContract({businessId:registrationId,identityField:'id',messageField:'prompt',
   paramsSchema:{type:'object',properties:{id:{type:'string'},prompt:{type:'string'}},required:['id','prompt'],additionalProperties:false},
   systemPrompt:'只返回路线候选 JSON'}),
  sessionStore:new DefaultAiAgentSessionStore(),
 })
 const registry={get:(id:string)=>id===registrationId?registration:undefined}
 const source={registrationId,businessInstanceId,runtimeInstanceId:businessInstanceId,publishedVersionRef:'CFG-1',
  inputs:{id:businessInstanceId,prompt:'按固定目录组织路线'},assertCurrent:()=>{}}
 const ready=prepareOperationRouteAgentTask(registry,source)
 expect(ready.task.toChatRequest().historyMsgs).toEqual([{role:'user',content:source.inputs.prompt}])
 expect(()=>prepareOperationRouteAgentTask(registry,{...source,runtimeInstanceId:'OTHER'})).toThrow('OPERATION_ROUTE_AGENT_SCOPE')
 expect(()=>prepareOperationRouteAgentTask(registry,{...source,publishedVersionRef:''})).toThrow('OPERATION_ROUTE_AGENT_SCOPE')
 const executeTurn=vi.fn(async()=>({text:'{"nodes":[]}',toolCalls:[]}))
 const options={registry,turnCallbacks:{executeTurn,appendMessages:async()=>{}}}
 const time='2026-11-18T10:00:00+08:00'
 const turn={turnId:crypto.randomUUID(),seq:1,baseRevision:0,queuedAt:time,startedAt:time,maxParallelTurns:1}
 const dispatched=await dispatchOperationRouteAgentTask(options,{...source,turn})
 expect(dispatched.turnId).toBe(turn.turnId)
 expect(executeTurn).toHaveBeenCalledOnce()
 await expect(dispatchOperationRouteAgentTask(options,{...source,turn,runtimeInstanceId:'OTHER'})).rejects.toThrow('OPERATION_ROUTE_AGENT_SCOPE')
 expect(executeTurn).toHaveBeenCalledOnce()
})
