<!--
@module app:views/features/data-platform/structured-config/workflow-definition/ui/workflow-trigger-table-dialog
职责：绑定原目录DataSet的数据库、表视图，确认触发表选择，取消不写目标。
-->
<template>
  <SparkComponent.RendererDialog :model-value="true" title="触发表选择" :data-view-key="dataViewKey" width="920px" :append-to-body="true" :destroy-on-close="true" :close-disabled="busy" @update:model-value="close">
    <p v-if="busy" role="status">正在读取触发表目录…</p>
    <p v-if="error || queryError" role="alert">{{ error || queryError }}</p>
    <template v-if="ready">
      <SparkComponent.RendererForm :data-view-key="dbKey" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
        <SparkComponent.FieldSelect :data-view-key="dbKey" data-member="value" :option-data-view-key="dbKey" label="数据库" placeholder="请选择数据库" />
      </SparkComponent.RendererForm>
      <SparkComponent.RendererFilter ref="filterApi" :data-view-key="tableKey" :children="searchFields" :auto-query="false" :show-data-view-meta="false" />
      <SparkComponent.RendererTable :data-view-key="tableKey" :children="fields" :on-row-click="chooseTable" :highlight-current-row="true" :show-data-view-meta="false" />
    </template>
    <template #footer>
      <SparkComponent.RendererButton label="确认触发表" :disabled="busy || !canConfirm" @click="confirm" />
      <SparkComponent.RendererButton label="取消选择" :disabled="busy" @click="close(false)" />
    </template>
  </SparkComponent.RendererDialog>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref} from 'vue'
import {buildDataViewKey,RequestState,type DataRow,type SparkNode} from '@spark-appworks/spark-data'
import * as SparkComponent from '@spark-appworks/spark-component'
import {LowcodeWorkflowDefinition} from '@/lowcode/resources/structured-config/workflow-definition/resource'
import {applyWorkflowTriggerSelection,projectWorkflowTriggerSelection} from '@/lowcode/resources/structured-config/workflow-definition/trigger/trigger-selection'
const props=defineProps<{workflowId:string;dataViewKey:string;validateTarget:()=>void}>()
const emit=defineEmits<{close:[];applied:[]}>()
const {sparkConsume}=SparkComponent.useSparkComponent({type:'workflow-trigger-table-dialog'}),runtime=sparkConsume(SparkComponent.PAGE_RUNTIME)
const captured={id:props.workflowId,key:props.dataViewKey},scene=LowcodeWorkflowDefinition.navigationScenarioId
const ds=runtime?.getDataSet(scene),target=runtime?.resolveView(captured.key),targetRow=target?.currentRow
const db=ds?.getView('_base_dbInfo'),tables=ds?.getView('_Base_TblList')
const dbKey=buildDataViewKey('_base_dbInfo','default',scene),tableKey=buildDataViewKey('_Base_TblList','default',scene)
const fields:SparkNode[]=[{type:'r-text',props:{field:'tblname',label:'表名',readonly:true}},{type:'r-text',props:{field:'tbldesc',label:'中文名',readonly:true}}]
const searchFields:SparkNode[]=[{type:'r-text',props:{field:'tblname',label:'表名'}},{type:'r-text',props:{field:'tbldesc',label:'中文名'}}]
const ready=ref(false),loading=ref(true),error=ref(''),revision=ref(0)
const filterApi=ref<SparkComponent.RendererFilterApi>()
let active=true,signature:string|undefined,off:(()=>void)|undefined,offDatabase:(()=>void)|undefined
const busy=computed(()=>{revision.value;return loading.value||[db,tables].some(view=>view?.requestState===RequestState.Loading||view?.requestState===RequestState.Preparing)})
const queryError=computed(()=>{revision.value;return db?.loadingError?.message||tables?.loadingError?.message||''})
const canConfirm=computed(()=>{revision.value;try{if(!ready.value||!ds)return false;projectWorkflowTriggerSelection(ds);return true}catch{return false}})
function current():void{
 props.validateTarget()
 if(!active||!ds||!runtime||!target||!targetRow||props.workflowId!==captured.id||props.dataViewKey!==captured.key
  ||runtime.resolveView(captured.key)!==target||target.currentRow!==targetRow||target.getPkKey(targetRow)!==captured.id)throw Error('触发表选择的工作流目标已变化')
 const fields=['dbName','tblName','tblid','filter']
 for(const field of fields)if(target.fieldAccess(targetRow,field).read!=='visible')throw Error('当前触发表配置不可读')
 const row=target.getEditingRow(captured.id),now=JSON.stringify(fields.map(field=>row?.[field]))
 if(signature!==undefined&&now!==signature)throw Error('触发表配置已改变，请重新打开选择器')
 signature=now
}
function chooseTable(row:DataRow):void{try{current();tables?.setSelectedRows([row])}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
function confirm():void{
 if(busy.value||!canConfirm.value||!ds)return
 try{current();applyWorkflowTriggerSelection(ds,captured.id);emit('applied');emit('close')}
 catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
}
function close(open:boolean):void{if(!open&&!busy.value)emit('close')}
async function queryTables():Promise<void>{
 if(!active||!ready.value||!tables||!db)return
 try{current();tables.setSelectedRows([]);tables.page=1;await filterApi.value?.search();current()}
 catch(cause){if(active)error.value=cause instanceof Error?cause.message:String(cause)}
}
onMounted(async()=>{
 try{
  current();if(!db||!tables||!ds)throw Error('触发表正式来源视图缺失')
  const changed=()=>revision.value++
  off=ds.onAnyViewChange({selectedRowsChanged:changed,rowsChanged:changed,requestStateChanged:changed})
  const databaseChanged=()=>{void queryTables()}
  db.events.on('selectedRowsChanged',databaseChanged);offDatabase=()=>db.events.off('selectedRowsChanged',databaseChanged)
  db.setSelectedRows([]);tables.setSelectedRows([]);tables.filterExpression=undefined;tables.page=1
  await db.refresh();if(db.loadingError)throw db.loadingError
  current();ready.value=true
 }catch(cause){if(active)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active)loading.value=false}
})
onBeforeUnmount(()=>{active=false;off?.();offDatabase?.()})
</script>
