/**
 * @module app:services/smart-bid/operation/agent-module/smart-bid-operation-module
 * 职责：SmartBid 前端 Agent 的 ClassModel 根模块，将正式 action guide 编排为当前 PageRuntime owner 的一次工具执行。
 * 边界：不持久化业务状态、不解析低层 CRUD、不读取凭据；执行回调由可信宿主按当前 DataView/file/command owner 提供。
 */
import {coerceStrictJsonValue,type JsonParams,type JsonValue} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import type {SmartBidActionRequest,SmartBidActionResult} from './smart-bid-action-module'
import {resolveSmartBidModel} from './smart-bid-model-resolver'

/** 同次 Agent turn 固定的业务动作输入。 */
export type SmartBidOperationCommand=Readonly<{
 operationId:string
 registrationId:string
 businessInstanceId:string
 runtimeInstanceId:string
 requestKey:string
 prompt:string
 inputs:JsonParams
}>

/** 当前 PageRuntime owner 的一次权威执行结果；具体 owner 再补行、文件或命令回执。 */
export type SmartBidOperationResult=Readonly<{
 operationId:string
 requestKey:string
 outcome:JsonValue
}>

type ExecuteOperation=(command:SmartBidOperationCommand)=>Promise<JsonValue>

/**
 * SmartBid 前端 Agent 根模块。
 * 公开方法由 ClassModel 编译器自动生成 tool schema；运行时 registration 仅绑定本次实例。
 */
export class SmartBidOperationModule {
 constructor(private readonly executeOperation:ExecuteOperation){}

 /** 按正式 action guide 输入执行当前 PageRuntime 的原 owner，并返回原结果。 */
 public async dispatchOperation(command:SmartBidOperationCommand):Promise<SmartBidOperationResult>{
  const required=[command.operationId,command.registrationId,command.businessInstanceId,
   command.runtimeInstanceId,command.requestKey,command.prompt]
  if(required.some(value=>!value.trim())||Object.keys(command.inputs).some(key=>!key.trim()))
   throw Error('SMART_BID_OPERATION_SCOPE')
  const outcome=await this.executeOperation(command)
  return Object.freeze({operationId:command.operationId,requestKey:command.requestKey,outcome})
 }

 /** 按生成 ClassModel 的 exact kind/actionName 解析到已编译模型方法，不建立第二套动作注册表。 */
 public async dispatchAction(command:Readonly<{
  kind:string;actionName:string;input:SmartBidActionRequest
 }>):Promise<SmartBidActionResult>{
  if(!command.kind.trim()||command.kind!==command.kind.trim()||!command.actionName.trim()||
   command.actionName!==command.actionName.trim())throw Error('SMART_BID_MODEL_ACTION_REQUIRED')
  const model=resolveSmartBidModel(command.kind,async input=>this.executeOperation(input))
  const descriptor=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(model),command.actionName)
  const method:unknown=descriptor?.value
  if(typeof method!=='function')throw Error('SMART_BID_MODEL_ACTION_UNAVAILABLE')
  const result:unknown=await Reflect.apply(method,model,[command.input])
  if(!isRecord(result)||typeof result['operationId']!=='string'||typeof result['requestKey']!=='string'||
   !Object.hasOwn(result,'outcome'))throw Error('SMART_BID_MODEL_ACTION_RESULT_INVALID')
  const outcome=coerceStrictJsonValue(result['outcome'])
  if(outcome===undefined)throw Error('SMART_BID_MODEL_ACTION_RESULT_INVALID')
  return Object.freeze({
   operationId:result['operationId'],requestKey:result['requestKey'],
   outcome,
  })
 }
}
