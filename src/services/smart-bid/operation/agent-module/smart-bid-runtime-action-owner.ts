/**
 * @module app:services/smart-bid/operation/agent-module/smart-bid-runtime-action-owner
 * 职责：把已生成的 SmartBid 动作提交到当前 PageRuntime 中显式声明的单一命令视图。
 * 边界：只接受完整动作输入；不推断模型视图、不把普通 CRUD 当业务命令、不创建后端协议。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {coerceStrictJsonValue} from '@spark-appworks/spark-json-document'
import type {SmartBidActionExecutor} from './smart-bid-action-module'

const commandFields=[
 'operationId','registrationId','businessInstanceId','runtimeInstanceId','requestKey','prompt','inputs',
] as const
const claimFields=[...commandFields,'turnId','state'] as const
type CommandField=(typeof commandFields)[number]

type RuntimeOwner=Readonly<{runtime:Pick<PageRuntime,'getDataSet'|'destroyed'|'isLoaded'>;scenarioId:string;assertCurrent:()=>void}>

/** 当前场景必须且只能声明一个与公开动作合同完全匹配的 command 视图。 */
export function createSmartBidRuntimeActionExecutor(source:RuntimeOwner):SmartBidActionExecutor{
 return async input=>{
  source.assertCurrent()
  const runtime=source.runtime
  if(runtime.destroyed||!runtime.isLoaded)throw Error('SMART_BID_ACTION_OWNER_STALE')
  const dataSet=runtime.getDataSet(source.scenarioId)
  if(dataSet?.scenarioId!==source.scenarioId)throw Error('SMART_BID_ACTION_OWNER_SCENARIO')
  const candidates=Object.values(dataSet.tables).flatMap(table=>{
   if(table.resourceType!=='command')return []
   return Object.values(table.views).filter(view=>commandFields.every(field=>view.columns.some(column=>column.name===field))&&
    !view.columns.some(column=>column.name==='turnId'||column.name==='state'))
  })
  if(candidates.length!==1)throw Error(`SMART_BID_ACTION_COMMAND_REQUIRED: ${candidates.length}`)
  const view=candidates[0]
  if(!view||view.destroyed||view.dataSet!==dataSet)throw Error('SMART_BID_ACTION_OWNER_STALE')
  source.assertCurrent()
  const row=await view.addRow({...input})
  const key=view.getPkKey(row)
  if(key===undefined)throw Error('SMART_BID_ACTION_COMMAND_KEY_REQUIRED')
  try{
   const result=await dataSet.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId,ids:[key]}]})
   source.assertCurrent()
   if(!result.success)throw Error(result.message??'SMART_BID_ACTION_SAVE_FAILED')
   const receipt=view.rows.find(item=>view.getPkKey(item)===key)
   if(!receipt)throw Error('SMART_BID_ACTION_RECEIPT_REQUIRED')
   const outcome=coerceStrictJsonValue(Object.fromEntries(Object.entries(receipt).filter(([field])=>field!=='_pk')))
   if(outcome===undefined)throw Error('SMART_BID_ACTION_RECEIPT_INVALID')
   return outcome
  }catch(error){
   source.assertCurrent()
   throw error
  }
 }
}

export type SmartBidRuntimeClaimInput=Readonly<Record<CommandField,unknown>&Readonly<{turnId:string}>>
export type SmartBidRuntimeClaim=Readonly<{state:'CLAIMED'|'EXISTING'|'UNKNOWN';receiptRef?:string;assertCurrent:()=>void}>

/** Claim uses an explicit command resource; it never turns an ordinary CRUD view into idempotency proof. */
export function createSmartBidRuntimeClaimOwner(owner:RuntimeOwner){
 return async(input:SmartBidRuntimeClaimInput):Promise<SmartBidRuntimeClaim>=>{
  owner.assertCurrent()
  const runtime=owner.runtime
   if(runtime.destroyed||!runtime.isLoaded)throw Error('SMART_BID_ACTION_OWNER_STALE')
  const dataSet=runtime.getDataSet(owner.scenarioId)
   if(dataSet?.scenarioId!==owner.scenarioId)throw Error('SMART_BID_ACTION_OWNER_SCENARIO')
   const candidates=Object.values(dataSet.tables).flatMap(table=>{
    if(table.resourceType!=='command')return []
    return Object.values(table.views).filter(view=>claimFields.every(field=>view.columns.some(column=>column.name===field)))
   })
   if(candidates.length!==1)throw Error(`SMART_BID_AGENT_CLAIM_COMMAND_REQUIRED: ${candidates.length}`)
   const view=candidates[0]
   if(!view||view.destroyed||view.dataSet!==dataSet)throw Error('SMART_BID_ACTION_OWNER_STALE')
   owner.assertCurrent()
   const row=await view.addRow({...input})
   const key=view.getPkKey(row)
   if(key===undefined)throw Error('SMART_BID_AGENT_CLAIM_KEY_REQUIRED')
   const result=await dataSet.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId,ids:[key]}]})
   owner.assertCurrent()
   if(!result.success)throw Error(result.message??'SMART_BID_AGENT_CLAIM_SAVE_FAILED')
   const receipt=view.rows.find(item=>view.getPkKey(item)===key)
   if(!receipt)throw Error('SMART_BID_AGENT_CLAIM_RECEIPT_REQUIRED')
   const state=receipt['state'],receiptRef=receipt['receiptRef']
   if((state!=='CLAIMED'&&state!=='EXISTING'&&state!=='UNKNOWN')||
    [...commandFields,'turnId' as const].some(field=>!sameClaimField(field,receipt[field],input[field]))||
    receiptRef!==undefined&&typeof receiptRef!=='string')throw Error('SMART_BID_AGENT_CLAIM_RECEIPT_INVALID')
   return Object.freeze({state,...(receiptRef===undefined?{}:{receiptRef}),
    assertCurrent:()=>{owner.assertCurrent();if(view.destroyed||view.dataSet!==dataSet)
     throw Error('SMART_BID_AGENT_CLAIM_STALE')}})
  }
}

function sameClaimField(field:string,actual:unknown,expected:unknown):boolean{
  if(field!=='inputs')return actual===expected
  const decode=(value:unknown):unknown=>{
   if(typeof value!=='string')return value
   try{const parsed:unknown=JSON.parse(value);return parsed}catch{return value}
  }
  return JSON.stringify(decode(actual))===JSON.stringify(decode(expected))
}
