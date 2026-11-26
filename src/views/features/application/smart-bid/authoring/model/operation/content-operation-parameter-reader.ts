/**
 * @module app:views/features/application/smart-bid/authoring/model/operation/content-operation-parameter-reader
 * 职责：核验 SmartBid 派发交接及原结果来源，提供原实参与业务回执的读取方法。
 * 边界：项目、试次和摘要一致只证明交接完整性，原结果来源由可信宿主确认。
 * AI用途：按 sessionId、turnId 和 requestKey 保留交接线索，避免将待核交接用于返工。
 */
import {coerceStrictJsonValue} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import type {SmartBidAgentDispatchResult} from '@/services/smart-bid/operation/agent-module/smart-bid-agent-dispatch'
import {createSmartBidCommand} from '@/services/smart-bid/operation/agent-module/smart-bid-command'

type Scope=Readonly<{
 projectId:string;assertCurrent:()=>void
 verifyOriginal?:(dispatch:SmartBidAgentDispatchResult)=>Promise<boolean>
}>
type TurnState=SmartBidAgentDispatchResult['outcome']['state']
const handoffMessage='交接记录待正式来源复核。'

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

/** 核对交接完整性，并在可信宿主确认来源后提供原实参与原回执。 */
export async function readOperationDispatchParameter(scope:Scope,value:unknown){
 const dispatch=readDispatch(value,scope)
 const inputJson=canonicalSnapshotValue(dispatch.parameters.inputs)
 if(await hashCanonicalSnapshotText(inputJson)!==dispatch.inputDigest)throw Error('OPERATION_PARAMETER_INPUT_DIGEST')
 const assertCurrent=()=>scope.assertCurrent()
 const verified=await scope.verifyOriginal?.(dispatch)
 assertCurrent()
 const base=Object.freeze({
  operationId:dispatch.operationId,requestKey:dispatch.requestKey,
  sessionId:dispatch.outcome.sessionId,turnId:dispatch.outcome.turnId,
  assertCurrent,
 })
 if(!verified){
  const requireOriginal=()=>{assertCurrent();throw Error('OPERATION_PARAMETER_ORIGINAL_SOURCE_REQUIRED')}
  return Object.freeze({...base,state:'HANDOFF_UNVERIFIED' as const,dispatchState:'UNVERIFIED' as const,
   message:handoffMessage,handoffInputDigest:dispatch.inputDigest,
   readActualInput:requireOriginal,readActionReceipt:requireOriginal})
 }
 return Object.freeze({...base,
  state:dispatch.outcome.state==='SSE_UNKNOWN'?'UNKNOWN' as const:'DISPATCH_RECORDED' as const,
  dispatchState:dispatch.outcome.state,actualInputDigest:dispatch.inputDigest,
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
 const base={reason:reason.trim(),
  operationId:dispatch.operationId,requestKey:dispatch.requestKey,
  sessionId:dispatch.sessionId,turnId:dispatch.turnId,dispatchState:dispatch.dispatchState,
  assertCurrent:dispatch.assertCurrent,
 }
 if(dispatch.state==='HANDOFF_UNVERIFIED')return Object.freeze({...base,
  state:'REWORK_EVIDENCE_REQUIRED' as const,message:dispatch.message,
 })
 const inputs=coerceStrictJsonValue(JSON.parse(dispatch.readActualInput()))
 if(!isRecord(inputs))throw Error('OPERATION_PARAMETER_INPUT_REQUIRED')
 return Object.freeze({
  ...base,state:'REWORK_PARAMETERS_READY' as const,inputs,
  ...('actionReceipt' in dispatch?{actionReceipt:dispatch.actionReceipt}:{}),
 })
}
