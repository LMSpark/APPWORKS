/**
 * @module app:services/smart-bid/operation/agent-module/smart-bid-action-module
 * 职责：为 47 个 SmartBid 业务模型公开同一套当前 PageRuntime 动作执行合同。
 * 边界：不建立动作注册表；模型类的方法名和源码声明由 ClassModel 编译器自动投影。
 */
import type {JsonParams,JsonValue} from '@spark-appworks/spark-json-document'

/** 一个正式业务动作的固定调用输入；operationId 由公开方法绑定，调用方不能替换。 */
export type SmartBidActionRequest=Readonly<{
 registrationId:string;businessInstanceId:string;runtimeInstanceId:string;requestKey:string;prompt:string;inputs:JsonParams
}>

/** 模型公开方法的统一结果；outcome 由当前原 owner 提供，不解释业务成功。 */
export type SmartBidActionResult=Readonly<{
 operationId:string;requestKey:string;outcome:JsonValue
}>

/** 当前 PageRuntime 可信 owner；每次调用核本次场景、业务对象、权限、版本与原请求。 */
export type SmartBidActionExecutor=(input:SmartBidActionRequest&Readonly<{operationId:string}>)=>Promise<JsonValue>

export async function executeSmartBidAction(execute:SmartBidActionExecutor,operationId:string,input:SmartBidActionRequest)
:Promise<SmartBidActionResult>{
 const required=[operationId,input.registrationId,input.businessInstanceId,input.runtimeInstanceId,input.requestKey,input.prompt]
 if(required.some(value=>!value.trim()))throw Error('SMART_BID_ACTION_SCOPE')
 const outcome=await execute(Object.freeze({...input,operationId}))
 return Object.freeze({operationId,requestKey:input.requestKey,outcome})
}
