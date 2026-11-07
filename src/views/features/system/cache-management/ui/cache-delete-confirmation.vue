<!--
@module app:views/features/system/cache-management/ui/cache-delete-confirmation
职责：确认原命令视图中已暂存的单键删除，取消及提交复用公共单记录生命周期。
边界：不查询、不复制键值、不创建owner；未知仅核验原捕获。
-->
<template>
 <RendererDialog :model-value="true" :data-view-key="dataViewKey" title="删除确认" :width="520" :close-disabled="busy || ownUnconfirmed" @update:model-value="cancel">
  <p>确定删除以下缓存键吗？</p>
  <RendererForm :data-view-key="dataViewKey" :context-row-id="recordId" :show-data-view-meta="false">
   <FieldText field="key" label="缓存键" :readonly="true" />
  </RendererForm>
  <p v-if="error" role="alert">{{ error }}</p>
  <p v-if="ownUnconfirmed" role="alert">删除结果未知，保留原命令，禁止重新发送。</p>
  <template #footer>
   <RendererButton label="取消删除" :disabled="busy || ownUnconfirmed" @click="cancel" />
   <RendererButton :label="ownUnconfirmed ? '核验原删除结果' : '确定删除'" button-type="danger" :disabled="busy || foreignRecovery || recoveryEnded" @click="save" />
  </template>
 </RendererDialog>
</template>
<script setup lang="ts">
import {PAGE_RUNTIME,RendererDialog,RendererForm,RendererButton,FieldText,useSparkComponent,useDataViewRecordEditing,type DataViewRecordEditingFinish} from '@spark-appworks/spark-component'
const props=defineProps<{dataViewKey:string;recordId:string|number}>()
const emit=defineEmits<{close:[result:DataViewRecordEditingFinish]}>()
const {sparkConsume}=useSparkComponent({type:'cache-delete-confirmation'})
const {busy,error,ownUnconfirmed,foreignRecovery,recoveryEnded,save,cancel}=useDataViewRecordEditing({mode:'edit',created:()=>true,editableFields:['key'],runtime:()=>sparkConsume(PAGE_RUNTIME),dataViewKey:()=>props.dataViewKey,recordId:()=>props.recordId,onFinish:result=>emit('close',result)})
</script>
