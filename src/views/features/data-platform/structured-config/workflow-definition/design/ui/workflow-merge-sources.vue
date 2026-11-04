<!--
@module app:views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-merge-sources
职责：以标准候选视图选择合并来源，确认来源加入或输入子树移除。
边界：只触发原节点DataView命令；不查询、保存、维护输入副本或删除业务节点。
AI用途：在原工作流编辑域复用标准对话框、表格、按钮及来源会话守卫。
-->
<template>
 <section v-if="eligible">
  <RendererButton :label="parentPath === null ? '添加合并根输入' : '添加合并子输入'" :disabled="disabled || busy || visible" @click="open('add')" />
  <RendererButton v-if="parentPath !== null" label="移除合并输入及子项" :disabled="disabled || busy || visible" @click="open('remove')" />
  <p v-if="error && !visible" role="alert">{{ error }}</p>
  <RendererDialog v-if="options" v-model="visible" :data-view-key="options.dataViewKey" :title="mode === 'add' ? '选择合并来源' : '确认移除合并输入'"
   width="min(900px, calc(100vw - 32px))" :grid-columns="1" :close-disabled="true" append-to-body>
   <p v-if="error" role="alert">{{ error }}</p>
   <RendererTable v-if="mode === 'add'" :data-view-key="options.dataViewKey" data-member="rows" :auto-columns="false" :show-data-view-meta="false"
    :max-height="420" highlight-current-row>
    <FieldText field="label" label="来源节点" :readonly="true" />
    <FieldText field="value" label="节点身份" :readonly="true" />
   </RendererTable>
   <p v-else>确认移除选中的合并输入及其全部子项？来源业务节点和模型会保留。</p>
   <template #footer>
    <RendererButton :label="mode === 'add' ? '取消合并来源选择' : '取消移除合并输入'" :disabled="busy" :onClick="actions.cancel" />
    <RendererButton :label="mode === 'add' ? '确认合并来源' : '确认移除合并输入'" :disabled="busy || (mode === 'add' && !canSelect)" :onClick="actions.confirm" />
   </template>
  </RendererDialog>
 </section>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,shallowRef,watch,watchEffect} from 'vue'
import type {DataSet} from '@spark-appworks/spark-data'
import type {JsonPath} from '@spark-appworks/spark-json-document'
import {RendererButton,RendererDialog,RendererTable,FieldText} from '@spark-appworks/spark-component'
import {WorkflowMergeSourceOptions} from '@/lowcode/resources/structured-config/workflow-definition/merge-inputs'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'
const props=defineProps<{dataSet:DataSet;workflowId:string;nodeId:string;parentPath:JsonPath|null;eligible:boolean;disabled:boolean}>()
const emit=defineEmits<{pendingChange:[value:boolean];changed:[path:JsonPath|null]}>()
const options=shallowRef<WorkflowMergeSourceOptions>(),visible=ref(false),busy=ref(false),error=ref(''),revision=ref(0),sessionRevision=ref(0),mode=ref<'add'|'remove'>('add')
let active=true,assertCurrent:()=>void=()=>{throw Error('合并来源会话尚未打开')},capturedPath:JsonPath|null=null
function changed():void{revision.value++}
watch(()=>props.dataSet,(dataSet,_previous,cleanup)=>{cleanup(dataSet.onAnyViewChange({rowsChanged:changed,currentRowChanged:changed,editingChanged:changed,requestStateChanged:changed}))},{immediate:true})
const canSelect=computed(()=>{revision.value;return !!options.value?.view.currentRow})
const actions=computed(()=>{
 const own=sessionRevision.value,valid=()=>active&&visible.value&&own===sessionRevision.value
 return{confirm:()=>{if(valid())confirm()},cancel:()=>{if(valid())cancel()}}
})
watchEffect(()=>emit('pendingChange',visible.value||busy.value))
function close():void{sessionRevision.value++;visible.value=false;options.value?.dispose();options.value=undefined;emit('pendingChange',false)}
function open(action:'add'|'remove'):void{
 if(props.disabled||!props.eligible||busy.value||visible.value||action==='remove'&&props.parentPath===null)return
 error.value='';mode.value=action;sessionRevision.value++
 try{
  const dataSet=props.dataSet,workflowId=props.workflowId,nodeId=props.nodeId,scope=lowcodeApi.readRequestScope(),path=JSON.stringify(props.parentPath)
  capturedPath=props.parentPath===null?null:[...props.parentPath]
  assertCurrent=()=>{
   const current=lowcodeApi.readRequestScope()
   if(!active||!visible.value||props.dataSet!==dataSet||props.workflowId!==workflowId||props.nodeId!==nodeId||!props.eligible||JSON.stringify(props.parentPath)!==path
    ||scope.token!==current.token||scope.headers['X-AppId']!==current.headers['X-AppId'])throw Error('合并来源会话身份已变化')
  }
  options.value=new WorkflowMergeSourceOptions({dataSet,workflowId,nodeId});const state=options.value.refresh();if(state.error)throw Error(state.error)
  visible.value=true
 }catch(cause){error.value=cause instanceof Error?cause.message:String(cause);close()}
}
function confirm():void{
 if(busy.value)return;busy.value=true;error.value=''
 try{
  assertCurrent();const commands=options.value;if(!commands)throw Error('合并来源会话已失效')
  const path=mode.value==='add'?commands.add(capturedPath):null
  if(mode.value==='remove'){if(capturedPath===null)throw Error('未选中合并输入');commands.remove(capturedPath)}
  close();emit('changed',path)
 }catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}finally{busy.value=false}
}
function cancel():void{if(!busy.value){close();error.value=''}}
function discardChanges():boolean{if(busy.value)return false;cancel();return true}
defineExpose({discardChanges})
watch([()=>props.dataSet,()=>props.workflowId,()=>props.nodeId,()=>JSON.stringify(props.parentPath),()=>props.eligible],()=>{if(visible.value)cancel()},{flush:'sync'})
onBeforeUnmount(()=>{active=false;close()})
</script>
