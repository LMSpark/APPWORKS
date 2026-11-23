/**
 * @module app:services/smart-bid/operation/agent-module/smart-bid-agent-dispatch
 * 职责：统一经 spark-ai Agent Host 和 SSE turn bridge 派发 SmartBid 操作。
 * 边界：Agent 编排走 SSE；前端工具执行仍调用本次 PageRuntime 的正式 DataView owner。
 * AI用途：Page16/18及其他 SmartBid 动作统一复用同一 Agent/SSE 派发、回执和 stale guard。
 */
import {ClassModelAgentAdapter,createAiAgentHost,createSimpleInputContract} from '@spark-appworks/spark-ai/agent'
import {ClassModelRuntime,createDtsBundleClassModelKnowledgeProvider} from '@spark-appworks/spark-ai/class-model'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import type {JsonValue} from '@spark-appworks/spark-json-document'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {createAiAgentTurnCallbacks} from '@/services/ai/ai-turn-bridge'
import {getDtsClassModelManifestUrl} from '@/services/class-model-artifacts/artifact-urls'
import {SmartBidOperationModule,type SmartBidOperationCommand} from './smart-bid-operation-module'
import {createSmartBidRuntimeActionExecutor} from './smart-bid-runtime-action-owner'

const registrationId='SmartBidOperationModule'

export type SmartBidAgentDispatchResult=Readonly<{
 operationId:string
 requestKey:string
 parameters:SmartBidOperationCommand
 inputDigest:string
 outcome:Readonly<{
   sessionId:string
   turnId:string
   transport:'SSE'
   state:'NO_ACTION_RECEIPT'|'ACTION_APPLIED'|'SSE_UNKNOWN'
   dispatched:boolean
   actionReceipt?:JsonValue
   error?:string
 }>
}>

export type SmartBidAgentDispatcher=Readonly<{
 classModel:ClassModelRuntime
 rootKind:string
 operationModule:SmartBidOperationModule
 dispatch(command:SmartBidOperationCommand,signal:AbortSignal):Promise<SmartBidAgentDispatchResult>
 assertCurrent:()=>void
}>

export function createSmartBidAgentDispatcher(input:Readonly<{
 runtime:PageRuntime;scenarioId:string;projectId:string;assertCurrent:()=>void
}>):SmartBidAgentDispatcher{
 const {runtime,scenarioId,projectId,assertCurrent}=input
 const knowledge=createDtsBundleClassModelKnowledgeProvider({
   dtsClassModelManifestUrl:getDtsClassModelManifestUrl(),rootClassName:registrationId,
 })
 const classModel=new ClassModelRuntime({knowledge,scriptExecutor:()=>{
   throw Error('SMART_BID_OPERATION_SCRIPT_OWNER_REQUIRED')
 }})
 const current=()=>{assertCurrent();if(runtime.destroyed||!runtime.isLoaded||!runtime.call.scenarioIds.includes(scenarioId))
   throw Error('SMART_BID_AGENT_RUNTIME_STALE')}
 const executeOwner=createSmartBidRuntimeActionExecutor({runtime,scenarioId,assertCurrent:current})
 let active:Readonly<{command:SmartBidOperationCommand}> & {receipt?:JsonValue}|undefined
 const execute=async(command:SmartBidOperationCommand):Promise<JsonValue>=>{
   const dispatch=active
   if(dispatch&&(['operationId','registrationId','businessInstanceId','runtimeInstanceId','requestKey'] as const)
     .some(field=>dispatch.command[field]!==command[field]))throw Error('SMART_BID_AGENT_DISPATCH_SCOPE')
   const receipt=await executeOwner(command)
   if(dispatch)dispatch.receipt=receipt
   return receipt
 }
 const operationModule=new SmartBidOperationModule(execute)
 const defaultInputContract=createSimpleInputContract({
  businessId:registrationId,identityField:'businessInstanceId',messageField:'prompt',
  paramsSchema:{type:'object',additionalProperties:false,required:[
   'operationId','registrationId','businessInstanceId','runtimeInstanceId','requestKey','prompt','inputs',
  ],properties:{
    operationId:{type:'string',minLength:1},registrationId:{const:registrationId},
    businessInstanceId:{type:'string',minLength:1},runtimeInstanceId:{type:'string',minLength:1},
    requestKey:{type:'string',minLength:1},prompt:{type:'string',minLength:1},inputs:{type:'object'},
  }},
  systemPrompt:'必须先查询当前动作指南，再通过 model_script 执行 SmartBidOperationModule.dispatchAction；只接受原 DataView owner 回执。',
 })
 let accepted:Readonly<{sessionId:string;turnId:string;localTurnId:string}>|undefined
 const requireAccepted=(localTurnId:string)=>{
   const receipt=accepted
   if(receipt?.localTurnId!==localTurnId)throw Error('SMART_BID_AGENT_SSE_ACK_REQUIRED')
   return receipt
 }
 const acceptedFor=(localTurnId:string)=>{
   const receipt=accepted
   return receipt?.localTurnId===localTurnId?receipt:undefined
 }
 const host=ClassModelAgentAdapter.register({
   host:createAiAgentHost({turnCallbacks:createAiAgentTurnCallbacks({
    onAccepted:identity=>{accepted=identity},
   }),maxToolRounds:16}),
   alias:registrationId,moduleClass:SmartBidOperationModule,options:{
     moduleId:registrationId,instance:operationModule,rootClassName:registrationId,
     dtsClassModelManifestUrl:getDtsClassModelManifestUrl(),
     inputContract:Object.freeze({...defaultInputContract,toOrchestration:(commandInput:SmartBidOperationCommand)=>{
      const plan=defaultInputContract.toOrchestration(commandInput)
      const parameterText=canonicalSnapshotValue(commandInput)
      return Object.freeze({...plan,userMessage:`${plan.userMessage}\n\nSmartBid 参数上下文（只读）：\n${parameterText}`})
     }}),
   },
 })
 return Object.freeze({
   classModel,rootKind:'SmartBidOperationModule',operationModule,assertCurrent:current,
   async dispatch(command,signal){
     current()
     signal.throwIfAborted()
     if(command.registrationId!==registrationId||command.businessInstanceId!==projectId
       ||command.runtimeInstanceId!==runtime.call.instanceId)throw Error('SMART_BID_AGENT_DISPATCH_SCOPE')
     if(active)throw Error('SMART_BID_AGENT_DISPATCH_BUSY')
     const now=new Date().toISOString(),turnId=crypto.randomUUID()
     const inputDigest=await hashCanonicalSnapshotText(canonicalSnapshotValue(command.inputs))
     accepted=undefined
     const dispatch:Readonly<{command:SmartBidOperationCommand}> & {receipt?:JsonValue}={command}
     active=dispatch
     try{
       try {
         await host.run(registrationId,command,{turn:{
           turnId,seq:1,baseRevision:-1,queuedAt:now,startedAt:now,maxParallelTurns:1,
         },signal})
       } catch (error) {
         const acknowledged=acceptedFor(turnId)
         if(acknowledged===undefined)throw error
         return Object.freeze({
           operationId:command.operationId,requestKey:command.requestKey,parameters:command,inputDigest,
           outcome:Object.freeze({
             sessionId:acknowledged.sessionId,turnId:acknowledged.turnId,transport:'SSE' as const,
             state:'SSE_UNKNOWN' as const,dispatched:false,
             error:error instanceof Error?error.message:String(error),
           }),
         })
       }
       current()
       const ack=requireAccepted(turnId)
       const receipt=dispatch.receipt
       return Object.freeze({
         operationId:command.operationId,requestKey:command.requestKey,parameters:command,inputDigest,
         outcome:Object.freeze(receipt===undefined
           ? {sessionId:ack.sessionId,turnId:ack.turnId,transport:'SSE' as const,state:'NO_ACTION_RECEIPT' as const,dispatched:false}
           : {sessionId:ack.sessionId,turnId:ack.turnId,transport:'SSE' as const,state:'ACTION_APPLIED' as const,
             dispatched:true,actionReceipt:receipt}),
       })
     }finally{
       if(active===dispatch)active=undefined
       accepted=undefined
     }
   },
 })
}
