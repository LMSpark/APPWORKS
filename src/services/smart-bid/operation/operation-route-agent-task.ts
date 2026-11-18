/**
 * @module app:services/smart-bid/operation/operation-route-agent-task
 * 职责：由正式工艺装配原参数，并沿 SPARK AI 注册契约准备同一次任务。
 */
import {createAiAgentSession,createAiAgentTask,type AiAgentTurnMeta} from '@spark-appworks/spark-ai/agent'
import {canonicalSnapshotValue} from '../content/revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '../content/references/snapshot-reference-values'

type Registry=Parameters<typeof createAiAgentTask>[0]

/** 草案不能派发；原业务实例与配置证据由正式来源提供。 */
export function prepareOperationRouteAgentTask(registry:Registry,source:Readonly<{
 registrationId:string;businessInstanceId:string;runtimeInstanceId:string;publishedVersionRef:string
 inputs:unknown;assertCurrent:()=>void
}>){
 source.assertCurrent()
 const {registrationId,businessInstanceId,runtimeInstanceId,publishedVersionRef}=source
 if(![registrationId,businessInstanceId,runtimeInstanceId,publishedVersionRef].every(identity))
  throw Error('OPERATION_ROUTE_AGENT_SCOPE')
 const encoded=canonicalSnapshotValue(source.inputs)
 const input:unknown=JSON.parse(encoded)
 const task=createAiAgentTask(registry,registrationId,input)
 const {scope}=task
 if(scope.businessInstanceId!==businessInstanceId||scope.runtimeInstanceId!==runtimeInstanceId||
  canonicalSnapshotValue(task.normalizedInput)!==encoded)throw Error('OPERATION_ROUTE_AGENT_SCOPE')
 source.assertCurrent()
 return Object.freeze({task,publishedVersionRef,assertCurrent:()=>{
  source.assertCurrent()
  if(task.scope.businessInstanceId!==businessInstanceId||task.scope.runtimeInstanceId!==runtimeInstanceId||
   canonicalSnapshotValue(task.normalizedInput)!==encoded)throw Error('OPERATION_ROUTE_AGENT_SCOPE')
 }})
}

/** 通过现有 Agent I/O 派发一次已登记试次；未知结果留给原试次回查。 */
export async function dispatchOperationRouteAgentTask(options:Parameters<typeof createAiAgentSession>[0],
 source:Parameters<typeof prepareOperationRouteAgentTask>[1]&Readonly<{
  turn:AiAgentTurnMeta
 }>){
 const {turn}=source
 if(!identity(turn.turnId))throw Error('OPERATION_ROUTE_AGENT_TURN_REQUIRED')
 const fixedTurn=Object.freeze({...turn})
 const prepared=prepareOperationRouteAgentTask(options.registry,source)
 const session=createAiAgentSession(options,prepared.task.target)
 if(session.scope.businessInstanceId!==prepared.task.scope.businessInstanceId||
  session.scope.runtimeInstanceId!==prepared.task.scope.runtimeInstanceId||
  session.scope.instanceId!==prepared.task.scope.instanceId)throw Error('OPERATION_ROUTE_AGENT_SCOPE')
 await session.start()
 prepared.assertCurrent()
 await session.send(prepared.task.toChatRequest({turn:fixedTurn}))
 return Object.freeze({session,turnId:fixedTurn.turnId,publishedVersionRef:prepared.publishedVersionRef})
}
