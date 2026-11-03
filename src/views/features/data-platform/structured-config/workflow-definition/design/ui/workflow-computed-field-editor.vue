<!--
@module app:views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-computed-field-editor
职责：标准表单直接绑定原字段视图的本次新增/编辑行。
边界：确认只应用原编辑覆盖，保存与取消批次归查询宿主，不复制字段草稿。
-->
<template>
 <section>
  <RendererButton :data-view-key="viewKey" label="新增计算字段" perm-action="create" :disabled="disabled || busy || visible" @click="open(true)" />
  <RendererButton :data-view-key="viewKey" label="编辑计算字段" :disabled="disabled || busy || visible || !canEdit" @click="open(false)" />
  <RendererButton :data-view-key="viewKey" label="删除计算字段" :disabled="disabled || busy || visible || !canDelete" @click="remove" />
  <p v-if="error && !visible" role="alert">{{ error }}</p>
  <RendererDialog v-if="visible" :model-value="true" :data-view-key="viewKey" data-member="currentRow" :title="created ? '新增计算字段' : '编辑计算字段'"
   :grid-columns="1" width="520px" append-to-body :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false" :close-disabled="true">
   <p v-if="error" role="alert">{{ error }}</p>
   <RendererForm :data-view-key="viewKey" context-data-member="currentRow" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
    <FieldText field="Name" label="字段名称" :readonly="disabled || busy" />
    <FieldText field="description" label="字段说明" :readonly="disabled || busy" />
    <FieldValueFunction field="ValueFun" label="值函数" :input-parameter-data-view-key="inputParameterDataViewKey" :readonly="disabled || busy"
     :on-dialog-visible-change="value=>functionOpen=value" />
   </RendererForm>
   <template #footer>
    <RendererButton label="取消字段编辑" :disabled="busy || functionOpen" @click="cancel" />
    <RendererButton label="确认字段编辑" :disabled="disabled || busy || functionOpen" @click="confirm" />
   </template>
  </RendererDialog>
 </section>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watchEffect} from 'vue'
import {buildDataViewKey,type DataSet} from '@spark-appworks/spark-data'
import {RendererButton,RendererDialog,RendererForm,FieldText,FieldValueFunction} from '@spark-appworks/spark-component'
import {WorkflowComputedFields} from '@/lowcode/resources/structured-config/workflow-definition/query-computed-fields'
const props=defineProps<{dataSet:DataSet;workflowId:string;nodeId:string;revision:number;disabled:boolean;inputParameterDataViewKey:string}>()
const emit=defineEmits<{pendingChange:[value:boolean]}>()
const visible=ref(false),busy=ref(false),created=ref(false),fieldId=ref(''),error=ref(''),functionOpen=ref(false)
const view=props.dataSet.getView('Base_DataModel_Field')!
const viewKey=buildDataViewKey(view.tableName,view.viewId,props.dataSet.scenarioId)
const canEdit=computed(()=>{props.revision;const row=view.currentRow;return !!row&&view.fieldAccess(row,'FieldType').read==='visible'&&row['FieldType']==='计算字段'&&view.editActionState(row)==='enabled'})
const canDelete=computed(()=>{props.revision;const row=view.currentRow;return !!row&&view.fieldAccess(row,'FieldType').read==='visible'&&row['FieldType']==='计算字段'&&view.deleteActionState(row)==='enabled'})
watchEffect(()=>emit('pendingChange',visible.value||busy.value))
async function open(adding:boolean):Promise<void>{
 if(props.disabled||busy.value||visible.value)return
 busy.value=true;error.value=''
 try{
  if(adding)fieldId.value=await WorkflowComputedFields.begin(props.dataSet,props.workflowId,props.nodeId)
  else{
   if(!canEdit.value||!view.currentRow)throw Error('请先选择可编辑的计算字段')
   const id=view.getPkKey(view.currentRow)
   if(typeof id!=='string'||view.hasEditingChanges(id))throw Error('请先保存或取消该字段的其他修改')
   fieldId.value=id
  }
  created.value=adding;view.setCurrentRowById(fieldId.value);visible.value=true
 }catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}finally{busy.value=false}
}
function guard():void{if(!visible.value||props.dataSet.destroyed||view.destroyed||view.getPkKey(view.currentRow??{})!==fieldId.value||view.hasUnconfirmedSave)throw Error('原计算字段编辑目标已变化')}
function cancel():void{
 try{guard();if(created.value)view.discardPendingChanges([fieldId.value]);else view.discardEditingRows([fieldId.value]);visible.value=false;error.value=''}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
}
async function confirm():Promise<void>{
 busy.value=true;error.value=''
 try{guard();await WorkflowComputedFields.confirm(props.dataSet,props.workflowId,props.nodeId,fieldId.value);visible.value=false}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}finally{busy.value=false}
}
async function remove():Promise<void>{
 if(props.disabled||busy.value||visible.value||!canDelete.value||!view.currentRow)return
 busy.value=true;error.value=''
 try{const id=view.getPkKey(view.currentRow);if(typeof id!=='string')throw Error('缺少原字段身份');await WorkflowComputedFields.remove(props.dataSet,props.workflowId,props.nodeId,id)}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}finally{busy.value=false}
}
onBeforeUnmount(()=>emit('pendingChange',false))
</script>
