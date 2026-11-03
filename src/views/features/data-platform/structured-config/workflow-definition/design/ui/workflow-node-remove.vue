<!-- @module app:views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-node-remove -->
<template>
 <section>
  <RendererButton v-if="eligible" :data-view-key="dataViewKey" label="删除查询节点" :disabled="disabled || busy || !!owner" @click="open" />
  <p v-if="error" role="alert">{{ error }}</p>
  <RendererDialog v-if="owner" :model-value="true" title="删除查询节点" :data-view-key="dataViewKey" width="600px" :append-to-body="true" :close-disabled="true">
   <template v-if="state?.summary">
    <p>节点：{{ state.summary.nodeId }}</p>
    <p>删除连线 {{ state.summary.edgeCount }} 条、节点条件 {{ state.summary.conditionCount }} 条。</p>
    <p v-if="state.summary.deleteModel">这是模型的最后一个节点消费者，将删除模型及 {{ state.summary.fieldCount }} 个字段、{{ state.summary.modelRelationCount }} 条模型关系。</p>
    <p v-else>其他节点仍使用该模型，保留模型及字段。</p>
    <p v-if="state.summary.layoutChanges">保存后将分别核对定义删除和布局清理结果。</p>
   </template>
   <p v-if="state?.databaseConfirmed" role="status">定义删除已确认，正在核对布局清理。</p>
   <p v-if="error" role="alert">{{ error }}</p>
   <RendererButton v-if="state?.status === 'ready'" :data-view-key="dataViewKey" label="暂存删除" :disabled="busy" @click="stage" />
   <RendererButton v-if="state?.status === 'staged'" :data-view-key="dataViewKey" label="保存删除" :disabled="busy" @click="save" />
   <RendererButton v-if="state?.status === 'database' || state?.status === 'layout'" :data-view-key="dataViewKey" label="核验原删除结果" :disabled="busy" @click="save" />
   <RendererButton v-if="state?.canReadCurrent" :data-view-key="dataViewKey" label="读取并采用当前原范围结果" :disabled="busy" @click="readCurrent" />
   <RendererButton v-if="state?.canRetryLayout" :data-view-key="dataViewKey" label="重提已确认未生效的布局清理" :disabled="busy" @click="retryLayout" />
   <RendererButton v-if="state?.status === 'complete'" :data-view-key="dataViewKey" label="刷新已确认结果" :disabled="busy" @click="finish" />
   <RendererButton v-if="state?.status === 'ready' || state?.status === 'staged' || state?.status === 'not-applied'" :data-view-key="dataViewKey" label="取消删除" :disabled="busy" @click="cancel" />
  </RendererDialog>
 </section>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,shallowRef,watchEffect} from 'vue'
import type {DataSet} from '@spark-appworks/spark-data'
import {RendererButton,RendererDialog} from '@spark-appworks/spark-component'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'
import {openWorkflowNodeRemoval,type WorkflowNodeRemoval} from '@/lowcode/resources/structured-config/workflow-definition/node-removal'
const props=defineProps<{dataSet:DataSet;workflowId:string;nodeId:string;dataViewKey:string;eligible:boolean;disabled?:boolean;onRemoved:()=>Promise<void>}>()
const emit=defineEmits<{pendingChange:[value:boolean]}>()
const owner=shallowRef<WorkflowNodeRemoval>(),busy=ref(false),error=ref(''),revision=ref(0)
let active=true
const state=computed(()=>{revision.value;return owner.value?.getState()})
watchEffect(()=>{revision.value;emit('pendingChange',busy.value||!!owner.value)})
async function act(action:()=>Promise<void>):Promise<void>{if(busy.value)return;busy.value=true;error.value='';try{await action()}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}finally{busy.value=false;revision.value++}}
async function open():Promise<void>{if(props.disabled||!props.eligible||owner.value)return;await act(async()=>{
 const ds=props.dataSet,workflowId=props.workflowId,nodeId=props.nodeId,scope=lowcodeApi.readRequestScope()
 owner.value=await openWorkflowNodeRemoval({dataSet:ds,workflowId,nodeId,assertCurrent(){const current=lowcodeApi.readRequestScope();if(!active||props.dataSet!==ds||props.workflowId!==workflowId||current.token!==scope.token||current.headers['X-AppId']!==scope.headers['X-AppId'])throw Error('节点删除身份已失效')}})
})}
async function stage():Promise<void>{await act(async()=>{if(!owner.value)throw Error('删除预览已失效');await owner.value.stage()})}
async function finish():Promise<void>{await act(async()=>{await props.onRemoved();owner.value=undefined})}
async function readCurrent():Promise<void>{await act(async()=>{if(!owner.value)throw Error('删除预览已失效');await owner.value.verify(true);await props.onRemoved();owner.value=undefined})}
async function retryLayout():Promise<void>{await act(async()=>{if(!owner.value)throw Error('删除预览已失效');await owner.value.retryLayout();await props.onRemoved();owner.value=undefined})}
async function save():Promise<void>{await act(async()=>{const command=owner.value;if(!command)throw Error('删除预览已失效');await command.save();await props.onRemoved();owner.value=undefined})}
function cancel():void{if(busy.value)return;try{owner.value?.cancel();owner.value=undefined;error.value='';revision.value++}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
function discardChanges():boolean{if(busy.value)return false;cancel();return !owner.value}
defineExpose({discardChanges})
onBeforeUnmount(()=>{active=false})
</script>
