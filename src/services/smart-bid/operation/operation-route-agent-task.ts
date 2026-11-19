/**
 * @module app:services/smart-bid/operation/operation-route-agent-task
 * 职责：由正式工艺装配原参数，并沿 SPARK AI 注册契约准备同一次任务。
 */
import {createAiAgentSession,createAiAgentTask,type AiAgentTurnMeta} from '@spark-appworks/spark-ai/agent'
import {canonicalSnapshotValue} from '../content/revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '../content/references/snapshot-reference-values'
import type {freezeOperationRouteContext} from './operation-route-context'

type Registry=Parameters<typeof createAiAgentTask>[0]
/** 本次工艺动作冻结的执行上下文。 */
type FrozenContext=Awaited<ReturnType<typeof freezeOperationRouteContext>>
type DispatchIdentity=Readonly<{registrationId:string;businessInstanceId:string;runtimeInstanceId:string;turnId:string;
 publishedVersionRef:string;guideRef:string;guideVersionRef:string;guideDigest:string;manifestDigest:string;inputDigest:string}>&FrozenContext['scope']
type DispatchClaim=DispatchIdentity&Readonly<{state:'CLAIMED'|'EXISTING'|'UNKNOWN';assertCurrent:()=>void}>
const dispatchIdentityFields={
 runId:true,attemptRef:true,requestKey:true,projectId:true,targetDigest:true,configurationLockHash:true,
 publishedVersionRef:true,guideRef:true,guideVersionRef:true,guideDigest:true,manifestDigest:true,inputDigest:true,
 registrationId:true,businessInstanceId:true,runtimeInstanceId:true,turnId:true,
} satisfies Record<keyof DispatchIdentity,true>
function isDispatchIdentityField(key:string):key is keyof DispatchIdentity{
 return Object.hasOwn(dispatchIdentityFields,key)
}

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
 source:Omit<Parameters<typeof prepareOperationRouteAgentTask>[1],'inputs'>&Readonly<{
  turn:AiAgentTurnMeta
  manifest:FrozenContext
  claimOriginalTurn:(input:DispatchIdentity)=>Promise<DispatchClaim>
 }>){
 const {turn,manifest}=source
 if(!identity(turn.turnId))throw Error('OPERATION_ROUTE_AGENT_TURN_REQUIRED')
 manifest.assertCurrent()
 if(!manifest.usable||manifest.inputJson===null||manifest.inputDigest===null)throw Error('OPERATION_ROUTE_AGENT_INPUT_REQUIRED')
 const fixedTurn=Object.freeze({...turn})
 const inputs:unknown=JSON.parse(manifest.inputJson)
 const prepared=prepareOperationRouteAgentTask(options.registry,{...source,inputs,
  assertCurrent:()=>{source.assertCurrent();manifest.assertCurrent()}})
 const session=createAiAgentSession(options,prepared.task.target)
 if(session.scope.businessInstanceId!==prepared.task.scope.businessInstanceId||
  session.scope.runtimeInstanceId!==prepared.task.scope.runtimeInstanceId||
  session.scope.instanceId!==prepared.task.scope.instanceId)throw Error('OPERATION_ROUTE_AGENT_SCOPE')
 const request=prepared.task.toChatRequest({turn:fixedTurn})
 const dispatch=Object.freeze({...manifest.scope,manifestDigest:manifest.manifestDigest,inputDigest:manifest.inputDigest,
  publishedVersionRef:prepared.publishedVersionRef,guideRef:manifest.guideRef,guideVersionRef:manifest.guideVersionRef,guideDigest:manifest.guideDigest,
  registrationId:source.registrationId,businessInstanceId:source.businessInstanceId,runtimeInstanceId:source.runtimeInstanceId,turnId:fixedTurn.turnId})
 let claim:DispatchClaim
 try{
  claim=await source.claimOriginalTurn(dispatch)
 }catch{
  prepared.assertCurrent()
  return Object.freeze({state:'CHECK_ORIGINAL' as const,observation:'CLAIM_UNKNOWN' as const,turnId:fixedTurn.turnId})
 }
 prepared.assertCurrent()
 claim.assertCurrent()
 if(Object.keys(dispatchIdentityFields).some(key=>isDispatchIdentityField(key)&&claim[key]!==dispatch[key]))
  throw Error('OPERATION_ROUTE_AGENT_SCOPE')
 if(claim.state!=='CLAIMED')return Object.freeze({state:'CHECK_ORIGINAL' as const,observation:'CLAIM_UNAVAILABLE' as const,turnId:fixedTurn.turnId})
 const original={state:'CHECK_ORIGINAL' as const,session,turnId:fixedTurn.turnId,publishedVersionRef:prepared.publishedVersionRef}
 try{
  await session.start()
 }catch{
  return Object.freeze({...original,observation:'START_UNKNOWN' as const})
 }
 prepared.assertCurrent()
 claim.assertCurrent()
 try{
  await session.send(request)
 }catch{
  return Object.freeze({...original,observation:'SEND_UNKNOWN' as const})
 }
 return Object.freeze({...original,observation:'SEND_RETURNED' as const})
}
