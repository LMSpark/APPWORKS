import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {LowcodeJsonData} from '@/lowcode/resources/semi-structured/json-data/resource'

/** Opens the exact catalog record in the tool's existing scenario. */
export function createJsonDataScriptHost(runtime:PageRuntime,scenarioId:string,assertCurrent:()=>void){
 let document:DataView|undefined
 return {
  runtime,
  assertCurrent,
  async invoke(command:string,id:unknown,signal:AbortSignal){
   if(command!=='jsonData.openDocument'||typeof id!=='string'||!id||id.trim()!==id)throw new Error('JSON_DOCUMENT_REQUEST')
   const assertActive=()=>{
    assertCurrent()
    if(signal.aborted||runtime.destroyed)throw new Error('JSON_DOCUMENT_STALE')
   }
   assertActive()
   const dataSet=runtime.getDataSet(scenarioId)
   if(!dataSet)throw new Error('JSON正式目录视图缺失')
   const next=LowcodeJsonData.openDocument(dataSet,id)
   if(document&&document!==next)document.dataTable?.destroyView(document.viewId)
   document=next
   await next.refresh()
   assertActive()
   if(document!==next)throw new Error('JSON_DOCUMENT_STALE')
   if(next.loadingError)throw next.loadingError
   return {visible:true,dataViewKey:buildDataViewKey(next.tableName,next.viewId,scenarioId),contextRowId:id}
  },
 }
}
