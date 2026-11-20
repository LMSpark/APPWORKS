/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/publication/smart-bid-action-source
 * 职责：把页08–15 的已核请求交给本次 PageRuntime 唯一显式的 SmartBid command owner。
 * 边界：不创建命令视图、不映射后端 HTTP；场景没有已绑定 owner 时明确失败。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {coerceStrictJsonValue,type JsonParams,type JsonValue} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {createSmartBidRuntimeActionExecutor} from '@/services/smart-bid/operation/agent-module/smart-bid-runtime-action-owner'
import {createSmartBidCommand} from '@/services/smart-bid/operation/agent-module/smart-bid-command'

export type SmartBidPageAction=Readonly<{
 operationId:string;requestKey:string;prompt:string;inputs:unknown
}>

export type SmartBidPageActionSubmit=(action:SmartBidPageAction)=>Promise<JsonValue>

export function createSmartBidPageActionSubmit(runtime:PageRuntime,projectId:string,assertCurrent:()=>void)
:SmartBidPageActionSubmit{
 const execute=createSmartBidRuntimeActionExecutor({runtime,scenarioId:runtime.call.mainScenarioId??runtime.call.scenarioIds[0]??'',
  assertCurrent})
 return async action=>{
  assertCurrent()
  const command=createSmartBidCommand(action,{
   registrationId:'SmartBidOperationModule',businessInstanceId:projectId,runtimeInstanceId:runtime.call.instanceId,
   inputError:'SMART_BID_PAGE_ACTION_INPUT_REQUIRED',
  })
  const outcome=await execute(command)
  assertCurrent()
  return outcome
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
