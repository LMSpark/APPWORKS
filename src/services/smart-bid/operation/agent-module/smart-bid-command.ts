/**
 * @module app:services/smart-bid/operation/agent-module/smart-bid-command
 * 职责：统一 SmartBid 动作命令的 scope、JSON inputs 与稳定身份封装。
 * 边界：不解析 owner、不执行 claim/dispatch、不决定 receipt；只构造同一命令合同。
 */
import {coerceStrictJsonValue} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import type {SmartBidOperationCommand} from './smart-bid-operation-module'

type SmartBidCommandScope=Readonly<{
 businessInstanceId:string
 registrationId?:string
 runtimeInstanceId?:string
 inputError?:string
 scopeError?:string
 requireIdentity?:boolean
}>

/** 从 route/action input 构造固定 scope 的命令；显式同名 scope 冲突直接拒绝。 */
export function createSmartBidCommand(value:unknown,scope:SmartBidCommandScope):SmartBidOperationCommand{
 if(!isRecord(value)||typeof value['operationId']!=='string'||typeof value['requestKey']!=='string'||
  typeof value['prompt']!=='string'||scope.requireIdentity===true&&
   (!identity(value['operationId'])||!identity(value['requestKey'])))
  throw Error(scope.inputError??'SMART_BID_COMMAND_INPUT_REQUIRED')
 const registrationId=scope.registrationId??value['registrationId']
 const businessInstanceId=scope.businessInstanceId
 const runtimeInstanceId=scope.runtimeInstanceId??value['runtimeInstanceId']
 if(typeof registrationId!=='string'||typeof runtimeInstanceId!=='string'||
  (Object.hasOwn(value,'registrationId')&&value['registrationId']!==registrationId)||
  (Object.hasOwn(value,'businessInstanceId')&&value['businessInstanceId']!==businessInstanceId)||
  (Object.hasOwn(value,'runtimeInstanceId')&&value['runtimeInstanceId']!==runtimeInstanceId))
  throw Error(scope.scopeError??'SMART_BID_COMMAND_SCOPE_REQUIRED')
 const inputs=coerceStrictJsonValue(value['inputs'])
 if(!isRecord(inputs))throw Error(scope.inputError??'SMART_BID_COMMAND_INPUT_REQUIRED')
 return Object.freeze({
  operationId:value['operationId'],registrationId,businessInstanceId,runtimeInstanceId,
  requestKey:value['requestKey'],prompt:value['prompt'],inputs,
 })
}
