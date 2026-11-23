/**
 * @module app:views/features/application/smart-bid/authoring/model/operation/content-operation-parameter-reader
 * 职责：把已持有的 SmartBid 派发参数与 SSE ACK 作为页面原试次输入核验。
 * 边界：不查询伪 ContextManifest/GenerationRun 模型；只读取调用方传入的固定参数和正式 owner receipt。
 * AI用途：页面重查时直接核对原 command、inputDigest、sessionId、turnId 和 actionReceipt。
 */
import {coerceStrictJsonValue} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import type {SmartBidAgentDispatchResult} from '@/services/smart-bid/operation/agent-module/smart-bid-agent-dispatch'
import {createSmartBidCommand} from '@/services/smart-bid/operation/agent-module/smart-bid-command'

type Scope=Readonly<{projectId:string;assertCurrent:()=>void}>
type TurnState=SmartBidAgentDispatchResult['outcome']['state']

function requiredTurnState(value:unknown):TurnState{
 if(value==='NO_ACTION_RECEIPT'||value==='ACTION_APPLIED'||value==='SSE_UNKNOWN')return value
 throw Error('OPERATION_PARAMETER_TURN_STATE')
}

function readDispatch(value:unknown,scope:Scope):SmartBidAgentDispatchResult{
 scope.assertCurrent()
 if(!isRecord(value)||!isRecord(value['parameters'])||!isRecord(value['outcome']))throw Error('OPERATION_PARAMETER_REQUIRED')
 const {parameters,outcome}=value
 const command=createSmartBidCommand(parameters,{
  businessInstanceId:scope.projectId,registrationId:'SmartBidOperationModule',requireIdentity:true,
  inputError:'OPERATION_PARAMETER_REQUIRED',scopeError:'OPERATION_PARAMETER_SCOPE',
 })
 const actionReceipt=outcome['actionReceipt']
 const normalizedActionReceipt=coerceStrictJsonValue(actionReceipt)
 const state=requiredTurnState(outcome['state'])
 if(value['operationId']!==command.operationId||value['requestKey']!==command.requestKey||
  !identity(outcome['sessionId'])||!identity(outcome['turnId'])||outcome['transport']!=='SSE'||
  typeof outcome['dispatched']!=='boolean'||typeof value['inputDigest']!=='string'||
  !/^[a-f0-9]{64}$/u.test(value['inputDigest'])||
  state==='ACTION_APPLIED'&&!Object.hasOwn(outcome,'actionReceipt')||
  state==='ACTION_APPLIED'&&outcome['dispatched']!==true||
  state!=='ACTION_APPLIED'&&outcome['dispatched']!==false||
  actionReceipt!==undefined&&normalizedActionReceipt===undefined)throw Error('OPERATION_PARAMETER_SCOPE')
 return Object.freeze({
  operationId:command.operationId,requestKey:command.requestKey,
  parameters:command,
  inputDigest:value['inputDigest'],
  outcome:Object.freeze({
   sessionId:outcome['sessionId'],turnId:outcome['turnId'],transport:'SSE',state,
   dispatched:outcome['dispatched'],
   ...(normalizedActionReceipt===undefined?{}:{actionReceipt:normalizedActionReceipt}),
   ...(typeof outcome['error']==='string'?{error:outcome['error']}:{}),
  }),
 })
}

/** 只核对显式传入的派发参数；空白或伪造身份直接失败，不触发重发。 */
export async function readOperationDispatchParameter(scope:Scope,value:unknown){
 const dispatch=readDispatch(value,scope)
 const inputJson=canonicalSnapshotValue(dispatch.parameters.inputs)
 if(await hashCanonicalSnapshotText(inputJson)!==dispatch.inputDigest)throw Error('OPERATION_PARAMETER_INPUT_DIGEST')
 const assertCurrent=()=>scope.assertCurrent()
 const base=Object.freeze({
  state:dispatch.outcome.state==='SSE_UNKNOWN'?'UNKNOWN':'DISPATCH_RECORDED',
  operationId:dispatch.operationId,requestKey:dispatch.requestKey,
  sessionId:dispatch.outcome.sessionId,turnId:dispatch.outcome.turnId,
  dispatchState:dispatch.outcome.state,actualInputDigest:dispatch.inputDigest,assertCurrent,
 })
 return Object.freeze({...base,
  ...(dispatch.outcome.state==='ACTION_APPLIED'?{actionReceipt:dispatch.outcome.actionReceipt}:{}),
  readActualInput:()=>{assertCurrent();return inputJson},
  readActionReceipt:()=>{
   assertCurrent()
   if(dispatch.outcome.state!=='ACTION_APPLIED')throw Error('OPERATION_PARAMETER_ACTION_RECEIPT_REQUIRED')
   return dispatch.outcome.actionReceipt
  },
 })
}

/** 把一次参数化回查交给后续动作；不合成调用明细或持久证据。 */
export async function prepareOperationReworkParameter(scope:Scope,value:unknown,reason:string){
 const dispatch=await readOperationDispatchParameter(scope,value)
 if(!reason.trim())throw Error('OPERATION_PARAMETER_REWORK_REQUIRED')
 const inputs=coerceStrictJsonValue(JSON.parse(dispatch.readActualInput()))
 if(!isRecord(inputs))throw Error('OPERATION_PARAMETER_INPUT_REQUIRED')
 return Object.freeze({
  state:'REWORK_PARAMETERS_READY' as const,reason:reason.trim(),
  operationId:dispatch.operationId,requestKey:dispatch.requestKey,
  sessionId:dispatch.sessionId,turnId:dispatch.turnId,dispatchState:dispatch.dispatchState,
  inputs,
  ...('actionReceipt' in dispatch?{actionReceipt:dispatch.actionReceipt}:{}),
  assertCurrent:dispatch.assertCurrent,
 })
}
