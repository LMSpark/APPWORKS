<!--
@module app:views/features/integration/api-management/ui/public-parameter-binding/api-public-parameter-binding-dialog
职责：通过原命名视图选择公共参数，再固定原记录进入重绑或原pending处理。
边界：选择交给标准FieldSelect，保存交给固定记录子窗口，不提供候选数组或保存owner。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="parametersKey" title="设置公共参数" :width="720" :append-to-body="true" :close-disabled="!!chosen" @update:model-value="close">
    <RendererForm :data-view-key="parametersKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
      <FieldSelect :data-view-key="parametersKey" :option-data-view-key="parametersKey" data-member="value" label="公共参数" :filterable="true" :readonly="!!chosen" />
    </RendererForm>
    <RendererButton label="编辑选中参数绑定" :disabled="!!chosen" @click="choose" />
    <DisplayAlert v-if="error" alert-type="error" :closable="false" :title="error" />
    <BindingRecord v-if="chosen" :key="chosen.epoch" :parameters-key="parametersKey" :record-id="chosen.id" :mode="chosen.mode" :interface-key="interfaceKey" :interface-id="interfaceId" :output-key="outputKey" :output-id="outputId" @finish="finished" />
    <RendererButton v-else label="关闭参数选择" @click="close" />
  </RendererDialog>
</template>
<script setup lang="ts">
import {ref} from 'vue'
import {PAGE_RUNTIME,RendererDialog,RendererForm,RendererButton,FieldSelect,DisplayAlert,useSparkComponent,type DataViewRecordEditingFinish} from '@spark-appworks/spark-component'
import BindingRecord from './api-public-parameter-binding-record.vue'
const props=defineProps<{parametersKey:string;interfaceKey:string;interfaceId:string|number;outputKey:string;outputId:string|number}>()
const emit=defineEmits<{close:[result:DataViewRecordEditingFinish]}>()
const {sparkConsume}=useSparkComponent({type:'api-public-parameter-binding-dialog'})
const runtime=sparkConsume(PAGE_RUNTIME),resolved=runtime?.resolveView(props.parametersKey)
if(!resolved)throw Error('PARAMETER_BINDING_VIEW: 缺少原公共参数视图')
const view=resolved
const openedKey=props.parametersKey
const chosen=ref<{id:string|number;mode:'edit'|'pending';epoch:number}>(),error=ref('')
let epoch=0
function choose():void{
 if(chosen.value)return
 try{
  if(props.parametersKey!==openedKey||runtime?.resolveView(openedKey)!==view||view.destroyed)throw Error('原参数选择视图已变化，请关闭后重新打开')
  const row=view.selectedRows[0],id=row?view.getPkKey(row):undefined
  if(view.selectedRows.length!==1||id===undefined)throw Error('请选择一个原公共参数')
  if(view.hasUnconfirmedSave||view.hasEditingChanges(id))throw Error('参数有未确认提交或未保存输入，请先处理')
  chosen.value={id,mode:view.dirtyTracking.hasPendingChanges(id)?'pending':'edit',epoch:++epoch};error.value=''
 }catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
}
function close():void{if(!chosen.value)emit('close','cancelled')}
function finished(result:DataViewRecordEditingFinish):void{chosen.value=undefined;if(result==='cancelled')view.setSelectedRows([]);if(result==='saved')emit('close',result)}
</script>
