/**
 * @module app:views/features/application/application-function-management/ui/blueprint-navigation/blueprint-node-save
 * 职责：绑定原蓝图节点的单记录回执与当前 DataView 的独立回读。
 * 边界：数据和权限均来自原 SPARK Data，切走节点保留原操作，重试回读不派发。
 * AI用途：导航宿主和桌面配置共用本模块校验原记录及真实回读。
 */
import type {DataRow,DataView} from '@spark-appworks/spark-data'

/** 当前正式模型的标量记录主键。 */
type RecordKey=string|number
/** 一次明确的蓝图关联记录提交或只读恢复输入。 */
type SaveIntent=Readonly<{
 /** 当前正式场景下的原保存视图。 */
 view:DataView
 /** 捕获提交时的正式蓝图节点。 */
 nodeId:string
 /** 本次 DataView 提交所选行键。 */
 id:RecordKey
 /** 原保存所执行的新建、修改或删除。 */
 operation:'create'|'update'|'delete'
 /** 与本次正式读回查询的范围一致。 */
 scope:'host'|'desktop'
 /** 检查原视图、节点和页面调用是否仍可消费结果。 */
 assertCurrent:()=>void
}>
type OriginalSave={
 intent:SaveIntent
 expected:Readonly<Partial<DataRow>>
 batchId?:string
 formalId:unknown
 readback?:Readonly<{savedId:RecordKey|undefined}>
}

/** 同一编辑器只跟踪本次调用捕获的回执；新查询和原草稿仍由 SPARK Data 管理。 */
export class BlueprintNodeSave{
 #original:OriginalSave|undefined

 /** 原回执已确认且正式回读仍未完成时为真。 */
 get awaitingReadback():boolean{return this.#original?.readback!==undefined}
 /** 当前实例尚须结算的原操作，供切回节点时恢复原按钮。 */
 get pending():SaveIntent|undefined{return this.#original?.intent}

 /**
  * 提交单条原记录，或仅核验并读取已发出的那次提交。
  * @param intent 从当前正式 DataView 捕获的原节点、行键、操作与实例校验。
  * @returns 已确认且精确回读，或修改意图无任何待提交值。
  */
 async commit(intent:SaveIntent):Promise<'confirmed'|'not-submitted'>{
  const {view,id,nodeId,operation,scope,assertCurrent}=intent
  const dataSet=view.dataSet
  if(!dataSet)throw Error('缺少原保存 DataSet')
  assertCurrent()
  let original=this.#original
  if(original&&(original.intent.view!==view||original.intent.id!==id||original.intent.operation!==operation
   ||original.intent.nodeId!==nodeId))throw Error('请先处理原节点的保存结果')
  if(!original){
   if(view.hasUnconfirmedSave)throw Error('请通过原操作核验保存结果')
   if(operation==='update'&&!view.hasEditingChanges(id)&&!view.dirtyTracking.hasPendingChanges(id))return 'not-submitted'
   const source=view.rows.find(row=>view.getPkKey(row)===id)??view.dirtyTracking.getPendingDeleteSnapshot(id)
   const formalId=view.effectivePkFields.length===1?source?.[view.primaryKey]:undefined
   const initial=operation==='create'&&source?Object.fromEntries(view.columns.flatMap(({name})=>
    name!==view.primaryKey&&Object.hasOwn(source,name)&&source[name]!==undefined&&view.newRowFieldAccess(name).write==='allowed'
     ?[[name,source[name]]]:[])):{}
   const diff=source?Object.fromEntries(Object.entries(view.dirtyTracking.getDiff(id,source)).map(([field,change])=>[field,change.to])):{}
   const expected:Partial<DataRow>=operation==='delete'?{}:structuredClone({...initial,...diff,...view.getEditingPatch(id)})
   original={intent,formalId,expected}
   this.#original=original
   const priorBatch=dataSet.saveJournal.batchId
   const submission=dataSet.saveRecord(view,id)
   const batchId=dataSet.saveJournal.batchId
   if(batchId&&batchId!==priorBatch)original.batchId=batchId
   try{
    const receipt=await submission
    const entries=receipt.viewResults[0]?.createdIdentities?.filter(item=>item.submittedId===id)??[]
    const entry=entries[0]
    const createdKey=entries.length===1&&entry&&(scope==='host'||entry.savedId===id)?entry.savedId:undefined
    original.readback={savedId:operation==='create'?createdKey:id}
    if(receipt.followUpError)throw Error(`保存已确认，后续处理失败：${receipt.followUpError.message}`)
   }catch(cause){
    if(original.readback)throw cause
    const journal=dataSet.saveJournal
    const target=journal.views.find(item=>item.tableName===view.tableName&&item.viewId===view.viewId
     &&item.ids.length===1&&item.ids[0]===id&&item.state==='unknown')
    if(!original.batchId||journal.batchId!==original.batchId||!target)this.#original=undefined
    throw cause
   }
  }else if(!original.readback){
   const batchId=original.batchId,journal=dataSet.saveJournal
   const target=journal.views.find(item=>item.tableName===view.tableName&&item.viewId===view.viewId
    &&item.ids.length===1&&item.ids[0]===id&&item.state==='unknown')
   if(!batchId||journal.batchId!==batchId||target?.owner!=='database')throw Error('原保存批次或数据库目标已变化')
   const result=await dataSet.verifySaveJournalAndRead({batchId,receiptViews:[view],readbackViews:[]})
   if(result.settlement==='not-applied'){
    dataSet.releaseSettledSaveJournal(batchId)
    this.#original=undefined
    throw Error('原保存明确未生效，已保留草稿，请显式重试')
   }
   if(result.settlement!=='confirmed')throw result.journal.originalError??Error('原保存仍未确认')
   // 正式数据库 owner 核验用原捕获键精确查询；改键且丢回执时只会保留未知。
   original.readback={savedId:original.formalId===id?id:undefined}
  }
  try{
   assertCurrent()
   if(original.readback.savedId===undefined)throw Error('原新增回执未提供正式保存键')
   const readback=await view.requestRefresh({defer:false})
   assertCurrent()
   if(!readback.success||readback.refreshStatus!=='read')throw Error(readback.message??'原视图没有完成本次读取')
   verifyReadback(original,original.readback.savedId)
  }catch(cause){
   throw Error(`保存已确认，回读未完成：${cause instanceof Error?cause.message:String(cause)}`,{cause})
  }
  if(this.#original===original)this.#original=undefined
  return 'confirmed'
 }
}

function verifyReadback(original:OriginalSave,savedId:RecordKey):void{
 const {view,nodeId,scope,operation}=original.intent
 const readResult=view.captureReadResult()
 if(view.countReported!==true||view.nextPageAvailable===true||view.rows.length!==view.total)
  throw Error('原节点查询结果不完整')
 const keys=new Set<RecordKey>()
 for(const row of view.rows){
  const key=view.getPkKey(row)
  const fields=scope==='host'?[view.primaryKey,'prowid']:[view.primaryKey]
  view.captureReadRow(row,fields)()
  if(key===undefined||row[view.primaryKey]!==key||keys.has(key)||(scope==='host'?row['prowid']!==nodeId:key!==nodeId))
   throw Error('原节点回读身份不唯一或超出范围')
  keys.add(key)
 }
 const row=view.rows.find(item=>view.getPkKey(item)===savedId)
 if(operation==='delete'){
  if(row)throw Error('删除后仍读取到原记录')
 }else{
  if(!row)throw Error('未读取到原保存记录')
  const fields=Object.keys(original.expected).filter(field=>field!==view.primaryKey)
  if(fields.length){
   view.captureReadRow(row,fields)()
   if(fields.some(field=>!Object.hasOwn(row,field)||!Object.is(original.expected[field],row[field])))throw Error('原保存字段回读值不一致')
  }
 }
 readResult()
}
