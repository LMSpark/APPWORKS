import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {LowcodeJsonData} from '@/lowcode/resources/semi-structured/json-data/resource'

/** Opens the exact catalog record in the tool's existing scenario. */
export function createJsonDataScriptHost(runtime:PageRuntime,scenarioId:string,assertCurrent:()=>void,editable=false){
 let document:DataView|undefined
 return {
  runtime,
  assertCurrent,
  async invoke(command:string,id:unknown,signal:AbortSignal){
   const assertActive=()=>{
    assertCurrent()
    if(signal.aborted||runtime.destroyed)throw new Error('JSON_DOCUMENT_STALE')
   }
   assertActive()
   const dataSet=runtime.getDataSet(scenarioId)
   if(!dataSet)throw new Error('JSON正式目录视图缺失')
   if(command==='jsonData.canEditCatalog')return editable
   if(command==='jsonData.saveCatalog'||command==='jsonData.cancelCatalog'){
    const view=dataSet.getView(LowcodeJsonData.catalogMetaName)
    if(!editable||document||!view||view.mutating)throw new Error('JSON_CATALOG_REQUEST')
    if(command==='jsonData.cancelCatalog'){
     if(view.hasUnconfirmedSave)throw new Error('请先核验原保存结果')
     view.discardPendingChanges()
    }else{
     const result=await dataSet.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId}]})
     assertActive()
     if(!result.success)throw new Error(result.message??'目录保存未完整确认')
    }
    return
   }
   if(typeof id!=='string'||!id||id.trim()!==id)throw new Error('JSON_DOCUMENT_REQUEST')
   if(command==='jsonData.closeDocument'){
    if(!document||document.queryContext['jsonId']!==id||runtime.isDirty)throw new Error('请先处理当前修改')
    document.dataTable?.destroyView(document.viewId)
    document=undefined
    return
   }
   if(command==='jsonData.saveDocument'||command==='jsonData.cancelDocument'){
    const view=document
    if(!editable||!view||view.queryContext['jsonId']!==id||view.mutating)throw new Error('JSON_DOCUMENT_REQUEST')
    if(command==='jsonData.cancelDocument'){
     if(view.hasUnconfirmedSave)throw new Error('请先核验原保存结果')
     view.discardPendingChanges()
    }else{
     const result=await dataSet.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId}]})
     assertActive()
     if(!result.success)throw new Error(result.message??'保存未完整确认')
    }
    const row=view.rows.find(candidate=>view.getPkKey(candidate)===id)
    if(row)view.setCurrentRow(row)
    return
   }
   if(command!=='jsonData.openDocument'||!editable||runtime.isDirty)throw new Error('JSON_DOCUMENT_REQUEST')
   const next=LowcodeJsonData.openDocument(dataSet,id)
   if(document&&document!==next)document.dataTable?.destroyView(document.viewId)
   document=next
   await next.refresh()
   assertActive()
   if(document!==next)throw new Error('JSON_DOCUMENT_STALE')
   if(next.loadingError)throw next.loadingError
   return {visible:true,dataViewKey:buildDataViewKey(next.tableName,next.viewId,scenarioId),contextRowId:id,editable}
  },
 }
}
