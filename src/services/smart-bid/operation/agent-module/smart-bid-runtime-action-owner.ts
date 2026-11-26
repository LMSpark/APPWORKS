/**
 * @module app:services/smart-bid/operation/agent-module/smart-bid-runtime-action-owner
 * 职责：把已生成的 SmartBid 动作提交到当前 PageRuntime 中显式声明的单一命令视图。
 * 边界：只接受完整动作输入；不推断模型视图、不把普通 CRUD 当业务命令、不创建后端协议。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {RequestState,submitDataSetCommand} from '@spark-appworks/spark-data'
import {coerceStrictJsonValue} from '@spark-appworks/spark-json-document'
import {canonicalSnapshotValue} from '@/services/smart-bid/content/revision-snapshot-hash'
import type {SmartBidActionExecutor} from './smart-bid-action-module'

const commandFields=[
 'operationId','registrationId','businessInstanceId','runtimeInstanceId','requestKey','prompt','inputs',
] as const
type RuntimeOwner=Readonly<{runtime:Pick<PageRuntime,'getDataSet'|'destroyed'|'isLoaded'>;scenarioId:string;assertCurrent:()=>void}>

function resolveActionView(source:RuntimeOwner){
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
  if(view.hasUnconfirmedSave)throw Error('SMART_BID_ACTION_OWNER_UNCONFIRMED')
  if(!view.hasQueryExecutorBinding()||view.requestState!==RequestState.Loaded||view.addActionState()!=='enabled')
   throw Error('SMART_BID_ACTION_OWNER_NOT_READY')
  return {dataSet,view}
}

/** 开轮前固定唯一可提交的原命令视图。取消只阻止尚未进入保存的命令，已开始的保存沿原 owner 结算。 */
export function prepareSmartBidRuntimeAction(source:RuntimeOwner,signal?:AbortSignal){
 const {dataSet,view}=resolveActionView(source)
 const assertCurrent=()=>{
  if(view.destroyed||view.dataSet!==dataSet||resolveActionView(source).view!==view)
   throw Error('SMART_BID_ACTION_OWNER_STALE')
 }
 const execute:SmartBidActionExecutor=async input=>{
  const submitted=structuredClone(input)
  try{
   const receipt=await submitDataSetCommand(view,{...submitted},{assertCurrent,...(signal===undefined?{}:{signal})})
   source.assertCurrent()
   const mismatch=commandFields.find(field=>Object.hasOwn(receipt,field)
    &&canonicalSnapshotValue(receipt[field])!==canonicalSnapshotValue(submitted[field]))
   if(mismatch)throw Error(`SMART_BID_ACTION_RECEIPT_CONFLICT: ${mismatch}`)
   const outcome=coerceStrictJsonValue(Object.fromEntries(Object.entries(receipt).filter(([field])=>field!=='_pk')))
   if(outcome===undefined)throw Error('SMART_BID_ACTION_RECEIPT_INVALID')
   return outcome
  }catch(error){
   source.assertCurrent()
   throw error
  }
 }
 return Object.freeze({assertCurrent,execute})
}
