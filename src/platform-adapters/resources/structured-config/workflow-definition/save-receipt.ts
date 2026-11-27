/**
 * @module app:lowcode/resources/structured-config/workflow-definition/save-receipt
 * 职责：保留工作流普通保存发起的原批次，核验只消费这次保存的原视图与原目标。
 * 边界：只编排 SPARK Data 的写入与恢复，保留原视图草稿，核验阶段不发业务保存。
 * AI用途：设计定义、节点、布局和连线复用同一批次归属与原回执检查。
 */
import type {DataSetSaveChangesResult,DataView} from '@spark-appworks/spark-data'

const ownedBatches=new WeakMap<DataView,string>()

/** 提交当前原视图。未知时只核验本入口捕获的批次，明确未生效后保留草稿供人工重试。 */
export async function settleWorkflowSave(view:DataView,id?:string|number):Promise<DataSetSaveChangesResult|'verified'|'not-submitted'>{
 const dataSet=view.dataSet
 if(!dataSet)throw Error('工作流保存缺少原数据空间')
 const original=dataSet.saveJournal
 if(view.hasUnconfirmedSave){
  const target=original.views.find(item=>item.tableName===view.tableName&&item.viewId===view.viewId&&item.state==='unknown')
  if(!original.batchId||ownedBatches.get(view)!==original.batchId||!target
   ||id!==undefined&&(target.ids.length!==1||target.ids[0]!==id))throw Error('请通过原工作流操作核验保存结果')
  const result=await dataSet.verifySaveJournalAndRead({batchId:original.batchId,receiptViews:[view],readbackViews:[]})
  if(result.settlement==='confirmed'){ownedBatches.delete(view);return 'verified'}
  if(result.settlement==='not-applied'){
   dataSet.releaseSettledSaveJournal(original.batchId)
   ownedBatches.delete(view)
   throw Error('原保存明确未生效，已保留草稿，请显式重试',{cause:result.journal.originalError})
  }
  throw result.journal.originalError??Error('原工作流保存未完整确认')
 }

 if(original.batchId&&!original.completed)throw Error('请先处理原工作流保存批次')
 const saving=id===undefined?dataSet.saveView(view):dataSet.saveRecord(view,id)
 const batchId=dataSet.saveJournal.batchId
 try{
  const result=await saving
  if(!('state' in result)){
   if(result.followUpError)throw Error(`保存已确认，后续处理失败：${result.followUpError.message}`,{cause:result.followUpError})
   return result
  }
  if(result.state==='confirmed')return result.receipt
  if(result.state==='not-submitted')return result.state
  if(result.state==='partial')throw Error(`部分变更已确认：${result.error.message}`,{cause:result.error})
  if(result.state==='follow-up-failed')throw Error(`保存已确认，后续处理失败：${result.error.message}`,{cause:result.error})
  throw result.error
 }catch(cause){
  const journal=dataSet.saveJournal
  const target=journal.views.find(item=>item.tableName===view.tableName&&item.viewId===view.viewId)
  if(batchId&&batchId!==original.batchId&&journal.batchId===batchId&&target){
   if(target.state==='unknown')ownedBatches.set(view,batchId)
   if(journal.views.length===1&&journal.currentRecoverableAction==='discard-not-applied')dataSet.releaseSettledSaveJournal(batchId)
  }
  throw cause
 }
}
