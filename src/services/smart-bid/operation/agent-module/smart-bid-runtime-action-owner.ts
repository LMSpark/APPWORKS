/**
 * @module app:services/smart-bid/operation/agent-module/smart-bid-runtime-action-owner
 * 职责：把已生成的 SmartBid 动作提交到当前 PageRuntime 中显式声明的单一命令视图。
 * 边界：只接受完整动作输入；不推断模型视图、不把普通 CRUD 当业务命令、不创建后端协议。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {coerceStrictJsonValue} from '@spark-appworks/spark-json-document'
import {canonicalSnapshotValue} from '@/services/smart-bid/content/revision-snapshot-hash'
import type {SmartBidActionExecutor} from './smart-bid-action-module'

const commandFields=[
 'operationId','registrationId','businessInstanceId','runtimeInstanceId','requestKey','prompt','inputs',
] as const
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
  const submitted=structuredClone(input)
  const row=await view.addRow({...submitted})
  const key=view.getPkKey(row)
  if(key===undefined)throw Error('SMART_BID_ACTION_COMMAND_KEY_REQUIRED')
  try{
   const result=await dataSet.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId,ids:[key]}]})
   source.assertCurrent()
   if(!result.success)throw Error(result.message??'SMART_BID_ACTION_SAVE_FAILED')
   const batch=result.data, saved=batch?.viewResults[0]
   if(batch?.viewCount!==1||batch.viewResults.length!==1||saved?.tableName!==view.tableName
    ||saved.viewId!==view.viewId||saved.createdCount!==1||saved.savedCount!==0||saved.deletedCount!==0
    ||saved.failedCount!==0||saved.failedEditingRows!==0)throw Error('SMART_BID_ACTION_RECEIPT_REQUIRED')
   const receipt=view.rows.find(item=>view.getPkKey(item)===key)
   if(!receipt)throw Error('SMART_BID_ACTION_RECEIPT_REQUIRED')
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
}
