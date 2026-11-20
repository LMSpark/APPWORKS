<!--
@module app:views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-copy-target
职责：标准来源视图选择迁移目标，确认后写回原节点config编辑域。
边界：不保存节点、不迁移业务数据；候选查询和选择由原DataView承接。
AI用途：在工作流节点原编辑域中接入标准组件目标选择及取消生命周期。
-->
<template>
 <section v-if="eligible">
  <RendererButton label="选择迁移目标" :disabled="disabled || busy || visible" @click="open" />
  <p v-if="error && !visible" role="alert">{{ error }}</p>
  <RendererDialog v-if="controls" v-model="visible" :data-view-key="controls.key(controls.search)" title="选择迁移目标"
   width="min(1000px, calc(100vw - 32px))" :grid-columns="1" :close-disabled="true" append-to-body>
   <p v-if="error" role="alert">{{ error }}</p>
   <RendererForm :data-view-key="controls.key(controls.search)" context-data-member="currentRow" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
    <FieldText field="keyword" label="目标表名称" :readonly="busy" />
    <FieldText field="description" label="目标表说明" :readonly="busy" />
    <FieldText field="databaseName" label="数据库名称" :readonly="busy" />
   </RendererForm>
   <RendererTable :data-view-key="controls.key(controls.results)" data-member="rows" :auto-columns="false" :show-data-view-meta="false" :show-pagination="true" :max-height="420" highlight-current-row>
    <FieldText :field="controls.specification.name" label="名称" />
    <FieldText v-if="controls.specification.description" :field="controls.specification.description" label="说明" />
    <FieldText v-if="controls.specification.databaseName" :field="controls.specification.databaseName" label="数据库" />
   </RendererTable>
   <template #footer>
    <RendererButton label="取消目标选择" :disabled="busy" @click="cancel" />
    <RendererButton label="确认迁移目标" :disabled="busy || !canSelect" @click="confirm" />
   </template>
  </RendererDialog>
 </section>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,shallowRef,watchEffect} from 'vue'
import type {DataSet} from '@spark-appworks/spark-data'
import {RendererButton,RendererDialog,RendererForm,RendererTable,FieldText} from '@spark-appworks/spark-component'
import {DataSpaceSourceControls} from '@/views/features/data-platform/data-set-management/design/model/source/data-space-source-controls'
import {stageWorkflowCopyTarget} from '@/lowcode/resources/structured-config/workflow-definition/source/copy-target'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'
const props=defineProps<{dataSet:DataSet;workflowId:string;nodeId:string;eligible:boolean;disabled:boolean}>()
const emit=defineEmits<{pendingChange:[value:boolean]}>()
const controls=shallowRef<DataSpaceSourceControls>(),visible=ref(false),busy=ref(false),error=ref(''),revision=ref(0)
let active=true,assertCurrent:()=>void=()=>{throw Error('迁移目标选择尚未打开')}
const off=props.dataSet.onAnyViewChange({rowsChanged:changed,currentRowChanged:changed,selectedRowsChanged:changed,editingChanged:changed,requestStateChanged:changed})
function changed():void{revision.value++}
const canSelect=computed(()=>{revision.value;return controls.value?.canSelect===true})
watchEffect(()=>emit('pendingChange',visible.value||busy.value))
function close():void{visible.value=false;controls.value?.dispose();controls.value=undefined}
function open():void{
 if(props.disabled||!props.eligible||busy.value||visible.value)return
 error.value=''
 try{
  const dataSet=props.dataSet,workflowId=props.workflowId,nodeId=props.nodeId,scope=lowcodeApi.readRequestScope()
  assertCurrent=()=>{
   const current=lowcodeApi.readRequestScope()
   if(!active||!visible.value||props.dataSet!==dataSet||props.workflowId!==workflowId||props.nodeId!==nodeId||!props.eligible||scope.token!==current.token||scope.headers['X-AppId']!==current.headers['X-AppId'])throw Error('迁移目标选择身份已变化')
  }
  controls.value=new DataSpaceSourceControls(dataSet,changed);visible.value=true;controls.value.setOpen(true)
 }catch(cause){error.value=cause instanceof Error?cause.message:String(cause);close()}
}
async function confirm():Promise<void>{
 if(busy.value)return
 busy.value=true;error.value=''
 try{
  assertCurrent();const source=controls.value;if(!source)throw Error('迁移目标候选已失效')
  await stageWorkflowCopyTarget({dataSet:props.dataSet,workflowId:props.workflowId,nodeId:props.nodeId,selection:source.selected(),assertCurrent})
  close()
 }catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}finally{busy.value=false}
}
function cancel():void{if(!busy.value){close();error.value=''}}
function discardChanges():boolean{if(busy.value)return false;cancel();return true}
defineExpose({discardChanges})
onBeforeUnmount(()=>{active=false;off();close()})
</script>
