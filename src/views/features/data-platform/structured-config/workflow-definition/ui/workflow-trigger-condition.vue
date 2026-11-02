<!--
@module app:views/features/data-platform/structured-config/workflow-definition/ui/workflow-trigger-condition
职责：从当前定义的触发表按需读取字段目录，标准条件组件写回原定义视图。
-->
<template>
 <div>
  <p v-if="loading" role="status">正在读取触发表字段目录…</p>
  <p v-if="targetState.error || error || columnState.error" role="alert">{{ targetState.error || error || columnState.error }}</p>
  <p v-else-if="!targetState.tableId">请先选择触发表；原条件保持不变。</p>
  <p v-else-if="ready && !columns.length">当前触发表字段目录未返回可读字段；原条件保持只读。</p>
  <RendererFilterExpression :data-view-key="dataViewKey" field="filter" format="spark-json" title="触发条件" :columns="columns" :function-context="columnState.functionContext" :readonly="readonly || !ready || !columns.length" :on-editing-change="editing" />
 </div>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue'
import {RequestState} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME,RendererFilterExpression,useSparkComponent} from '@spark-appworks/spark-component'
import {WorkflowTriggerCondition} from '@/lowcode/resources/structured-config/workflow-definition/trigger-condition'
import configuration from '../../../../../../../config/pages/structured-config/workflow-catalog/pagedata.json'
const props=defineProps<{workflowId:string;dataViewKey:string;readonly:boolean}>()
const emit=defineEmits<{editing:[value:boolean]}>()
const {sparkConsume}=useSparkComponent({type:'workflow-trigger-condition'}),runtime=sparkConsume(PAGE_RUNTIME)
const ds=runtime?.getDataSet(configuration.scenarioId),revision=ref(0),loading=ref(false),error=ref(''),loadedFor=ref<string>()
let active=true,generation=0
const off=ds?.onAnyViewChange({editingChanged:()=>revision.value++,editingFieldChanged:()=>revision.value++,rowsChanged:()=>revision.value++,requestStateChanged:()=>revision.value++})
const targetState=computed(()=>{
 revision.value
 try{
  if(!ds||runtime?.resolveView(props.dataViewKey)!==ds.getView('Base_WorkflowDefinition','edit'))throw Error('触发条件缺少原定义运行实例')
  return{tableId:WorkflowTriggerCondition.tableId(ds,props.workflowId),error:''}
 }catch(cause){return{tableId:'',error:cause instanceof Error?cause.message:String(cause)}}
})
const ready=computed(()=>{revision.value;const fields=ds?.getView('Base_TblField');return !!targetState.value.tableId&&loadedFor.value===targetState.value.tableId&&fields?.requestState===RequestState.Loaded&&!fields.loadingError&&fields.queryContext['triggerTableId']===loadedFor.value})
const columnState=computed(()=>{
 revision.value
 try{return{columns:ready.value&&ds?WorkflowTriggerCondition.columns(ds,props.workflowId):[],functionContext:ready.value&&ds?WorkflowTriggerCondition.functionContext(ds,props.workflowId):{},error:''}}
 catch(cause){return{columns:[],functionContext:{},error:cause instanceof Error?cause.message:String(cause)}}
})
const columns=computed(()=>columnState.value.columns)
function editing(value:boolean):void{emit('editing',value)}
watch(()=>[props.workflowId,targetState.value.tableId] as const,async([id,tableId],previous)=>{
 if(previous?.[0]===id&&previous[1]===tableId)return
 const own=++generation;loadedFor.value=undefined;error.value='';loading.value=false
 if(!ds||!tableId)return
 loading.value=true
 try{await WorkflowTriggerCondition.load(ds,id);WorkflowTriggerCondition.columns(ds,id);if(active&&own===generation)loadedFor.value=tableId}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation)loading.value=false}
},{immediate:true})
onBeforeUnmount(()=>{active=false;generation++;off?.();emit('editing',false)})
</script>
