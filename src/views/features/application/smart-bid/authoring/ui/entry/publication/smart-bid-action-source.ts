/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/publication/smart-bid-action-source
 * 职责：把已核请求交给本次 PageRuntime 唯一显式的 SmartBid command owner，消费原命令回执。
 * 边界：复用场景绑定，不创建命令视图。流结束只证明轮次完成，动作确认仍须原业务回执。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {coerceStrictJsonValue,type JsonParams,type JsonValue} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {createSmartBidCommand} from '@/services/smart-bid/operation/agent-module/smart-bid-command'
import {createSmartBidAgentDispatcher} from '@/services/smart-bid/operation/agent-module/smart-bid-agent-dispatch'

export type SmartBidPageAction=Readonly<{
 operationId:string;requestKey:string;prompt:string;inputs:unknown
}>

export type SmartBidPageActionSubmit=(action:SmartBidPageAction,signal?:AbortSignal)=>Promise<JsonValue>

export function createSmartBidPageActionSubmit(runtime:PageRuntime,projectId:string,assertCurrent:()=>void)
:SmartBidPageActionSubmit{
 const scenarioId=runtime.call.mainScenarioId??runtime.call.scenarioIds[0]??''
 const agent=createSmartBidAgentDispatcher({runtime,scenarioId,projectId,assertCurrent})
 return async (action,signal=new AbortController().signal)=>{
  assertCurrent()
  const command=createSmartBidCommand(action,{
   registrationId:'SmartBidOperationModule',businessInstanceId:projectId,runtimeInstanceId:runtime.call.instanceId,
   inputError:'SMART_BID_PAGE_ACTION_INPUT_REQUIRED',
  })
  const outcome=await agent.dispatch(command,signal)
  assertCurrent()
  const result=outcome.outcome
  if(!isRecord(result)||result['state']!=='ACTION_APPLIED'||result['dispatched']!==true||!isRecord(result['actionReceipt'])){
   const interrupted=isRecord(result)&&result['state']==='SSE_UNKNOWN'
   throw Error(interrupted?'工具回传中断，原业务结果待核验':'当前没有原业务回执，请核验原请求')
  }
  return result
 }
}

export function smartBidActionInputs(record:unknown):JsonParams{
 const value=coerceStrictJsonValue(record)
 if(!isRecord(value))throw Error('SMART_BID_PAGE_ACTION_RECORD_REQUIRED')
 return {record:value}
}

export function withSmartBidPageActionSubmit<Sources extends object>(
 options:Readonly<{runtime:PageRuntime;projectId:string;assertCurrent:()=>void;sources:Sources}>,
):Sources&Readonly<{submitAction:SmartBidPageActionSubmit}>{
 const {runtime,projectId,assertCurrent,sources}=options
 return Object.freeze({...sources,submitAction:createSmartBidPageActionSubmit(runtime,projectId,assertCurrent)})
}
