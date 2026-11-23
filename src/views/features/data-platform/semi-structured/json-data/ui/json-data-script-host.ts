import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {LowcodeJsonData} from '@/platform-adapters/resources/semi-structured/json-data/resource'
import {isRecord} from '@spark-appworks/spark-utils'

/** Opens the exact catalog record in the tool's existing scenario. */
export type JsonDataScriptHostOptions=Readonly<{
 runtime:PageRuntime
 scenarioId:string
 assertCurrent:()=>void
 editable?:boolean
}>
export function createJsonDataScriptHost({runtime,scenarioId,assertCurrent,editable=false}:JsonDataScriptHostOptions){
 let document:DataView|undefined
 let creating:string|undefined
 let fileConfirmed=false
 let inputPending=false
 let pickingFile=false
 let imported=false
 const binding=(view:DataView,id:string)=>({
  visible:true,dataViewKey:buildDataViewKey(view.tableName,view.viewId,scenarioId),
  contextRowId:id,editable,loadError:view.loadingError?.message,
 })
 return {
  runtime,
  assertCurrent,
  get isDirty(){return inputPending||pickingFile||runtime.isDirty},
  async invoke(command:string,id:unknown,signal:AbortSignal){
   const assertActive=()=>{
    assertCurrent()
    if(signal.aborted||runtime.destroyed)throw new Error('JSON_DOCUMENT_STALE')
   }
   assertActive()
   if(command==='jsonData.setInputPending'||command==='jsonData.setPickingFile'){
    if(!editable||typeof id!=='boolean')throw new Error('JSON_DOCUMENT_REQUEST')
    if(command==='jsonData.setInputPending')inputPending=id
    else pickingFile=id
    return
   }
   const dataSet=runtime.getDataSet(scenarioId)
   if(!dataSet)throw new Error('JSON正式目录视图缺失')
   if(command==='jsonData.canEditCatalog')return editable
   const catalog=dataSet.getView(LowcodeJsonData.catalogMetaName)
   if(command==='jsonData.createDocument'||command==='jsonData.importDocument'){
    if(!editable||document!==undefined||runtime.isDirty||catalog?.addActionState()!=='enabled')throw new Error('JSON_CATALOG_REQUEST')
    let name='',content='{}'
    if(command==='jsonData.importDocument'){
     if(!isRecord(id)||typeof id['name']!=='string'||typeof id['content']!=='string')throw new Error('JSON_IMPORT_REQUEST')
     name=id['name']
     content=id['content']
     parseJsonDocument(content)
    }
    await catalog.addRow({name,description:name,path:''})
    assertActive()
    const row=catalog.dirtyTracking.pendingCreateRows[0]
    if(!row)throw new Error('JSON目录新增草稿缺失')
    const key=String(catalog.getPkKey(row))
    creating=key
    imported=command==='jsonData.importDocument'
    fileConfirmed=false
    try{
     const view=LowcodeJsonData.openDocument(dataSet,key,{create:true})
     document=view
     await view.refresh()
     assertActive()
     if(view.loadingError)throw view.loadingError
     await view.addRow({content})
     assertActive()
     return {...binding(view,key),creating:true}
    }catch(error){
     assertActive()
     document?.dataTable?.destroyView(document.viewId)
     document=undefined
     creating=undefined
     catalog.discardPendingChanges([key])
     throw error
    }
   }
   if(command==='jsonData.reloadCatalog'){
    if(!editable||document||!catalog||!catalog.hasPendingSavedRowPermissions||catalog.mutating||catalog.hasUnconfirmedSave||catalog.hasEditingChanges()||catalog.dirtyTracking.hasPendingChanges())throw new Error('JSON_CATALOG_REQUEST')
    await catalog.refresh()
    assertActive()
    if(catalog.loadingError)throw catalog.loadingError
    return
   }
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
   if(typeof id!=='string'||id.length===0||id.trim()!==id)throw new Error('JSON_DOCUMENT_REQUEST')
   if(command==='jsonData.closeDocument'){
    if(document?.queryContext['jsonId']!==id||inputPending||runtime.isDirty)throw new Error('请先处理当前修改')
    document.dataTable?.destroyView(document.viewId)
    document=undefined
    return
   }
   if(command==='jsonData.discardAndCloseDocument'){
    const view=document
    if(!editable||creating!==undefined||view?.queryContext['jsonId']!==id||view.mutating||view.hasUnconfirmedSave)throw new Error('JSON_DOCUMENT_REQUEST')
    view.discardPendingChanges([id])
    view.dataTable?.destroyView(view.viewId)
    document=undefined
    inputPending=false
    return {closed:true}
   }
   if(command==='jsonData.saveDocument'||command==='jsonData.cancelDocument'){
    const view=document
    if(!editable||view?.queryContext['jsonId']!==id||view.mutating||view.loadingError)throw new Error('JSON_DOCUMENT_REQUEST')
    if(command==='jsonData.cancelDocument'){
     if(view.hasUnconfirmedSave||fileConfirmed)throw new Error('请先核验原保存结果')
     view.discardPendingChanges()
     if(creating===id){
      catalog?.discardPendingChanges([id])
      view.dataTable?.destroyView(view.viewId)
      document=undefined
      creating=undefined
      return {closed:true}
     }
    }else{
     if(inputPending)throw new Error('请先处理当前正文输入')
     if(creating===id&&!fileConfirmed&&catalog&&!catalog.hasUnconfirmedSave){
      const draft=catalog.getEditingRow(id)
      if(!draft)throw new Error('JSON目录新增草稿缺失')
      const invalid=catalog.validator?.validate(draft).errors[0]
      if(invalid)throw new Error(invalid.message)
     }
     if(!fileConfirmed){
      const result=await dataSet.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId}]})
      assertActive()
      if(!result.success)throw new Error(result.message??'保存未完整确认')
      fileConfirmed=creating===id
     }
     if(creating===id&&catalog){
      const result=await dataSet.saveChanges({views:[{tableName:catalog.tableName,viewId:catalog.viewId,ids:[id]}]})
      assertActive()
      if(!result.success)throw new Error(result.message??'目录保存未完整确认')
      view.dataTable?.destroyView(view.viewId)
      document=undefined
      creating=undefined
      fileConfirmed=false
      if(imported)return {closed:true}
      await catalog.refresh()
      assertActive()
      if(catalog.loadingError)return {closed:true,readError:`正文和目录已保存，但目录回读失败。${catalog.loadingError.message}`}
      if(!catalog.rows.some(row=>catalog.getPkKey(row)===id))return {closed:true}
      const saved=LowcodeJsonData.openDocument(dataSet,id)
      document=saved
      await saved.refresh()
      assertActive()
      return {binding:binding(saved,id)}
     }
    }
    const row=view.rows.find(candidate=>view.getPkKey(candidate)===id)
    if(row)view.setCurrentRow(row)
    return
   }
   if(command!=='jsonData.openDocument'||!editable||inputPending||runtime.isDirty)throw new Error('JSON_DOCUMENT_REQUEST')
   const next=LowcodeJsonData.openDocument(dataSet,id)
   if(document!==undefined&&document!==next)document.dataTable?.destroyView(document.viewId)
   document=next
   await next.refresh()
   assertActive()
   if(document!==next)throw new Error('JSON_DOCUMENT_STALE')
   return binding(next,id)
  },
 }
}
