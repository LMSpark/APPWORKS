<!--
@module app:views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-query-source-edit
职责：承接参考“选择模型”入口，标准来源组件绑定同一原owner，保留分阶段恢复。
边界：不生成正式草稿、查询或保存器；隔离名称只是本实例的组件输入。
-->
<template>
 <section>
  <RendererButton v-if="eligible" :label="operation ? '更换操作目标' : '选择模型'" :disabled="disabled || busy || visible" @click="open" />
  <p v-if="error && !visible" role="alert">{{ error }}</p>
  <RendererDialog v-if="owner && names" v-model="visible" :data-view-key="nameKey" :title="operation ? '选择操作目标来源' : '选择查询模型来源'"
   width="min(1100px, calc(100vw - 32px))" :grid-columns="1" :close-disabled="true" append-to-body>
   <p v-if="error" role="alert">{{ error }}</p>
   <template v-if="state?.shared && !state.source">
    <p role="status">当前为共享模型。先明确创建当前节点的隔离模型，再选择来源并保存；其他节点保留原模型。</p>
    <RendererForm :data-view-key="nameKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
     <FieldText field="name" label="隔离模型名称" :readonly="busy || !!state.isolation" />
    </RendererForm>
    <template v-if="isolationPreview.plan">
     <p>将创建 {{ isolationPreview.plan.models.length }} 个关联模型的副本及 {{ isolationPreview.plan.relationCount }} 条模型关系；原模型和原关系保留，只切换当前节点。</p>
     <p v-for="item in isolationPreview.plan.models" :key="item.from">{{ item.previousName }} → {{ item.name }}</p>
    </template>
    <p v-if="isolationPreview.error" role="alert">{{ isolationPreview.error }}</p>
    <RendererButton v-if="!state.isolation" label="创建当前节点的隔离模型" :disabled="busy" @click="isolate" />
    <RendererButton v-else label="核验原隔离模型、字段及关系" :disabled="busy" @click="verifyIsolation" />
    <RendererButton v-if="state.isolation?.canAbandonNotApplied" label="放弃已确认未生效的隔离创建" :disabled="busy" @click="recoverIsolation('abandonIsolationNotApplied')" />
    <RendererButton v-if="state.isolation?.canDiscardLocalChanges" label="放弃隔离模型后续修改并核验" :disabled="busy" @click="recoverIsolation('discardIsolationLocalChanges')" />
    <p v-if="state.isolation" role="status">隔离创建已开始，须核验同一批次；原节点尚未改绑。</p>
    <details v-if="state.isolation?.fork"><summary>本次隔离记录标识</summary><p>模型：{{ state.isolation.fork.modelId ?? '尚未分配' }}</p><ul><li v-for="item in state.isolation.fork.fieldIds" :key="item.from">{{ item.from }} → {{ item.to }}</li></ul></details>
    <details v-if="state.isolation?.fork && 'models' in state.isolation.fork"><summary>关联模型与关系标识</summary><p v-for="item in state.isolation.fork.models" :key="item.from">{{ item.name }}：{{ item.from }} → {{ item.to }}</p><p v-for="item in state.isolation.fork.relationIds" :key="item.from">关系：{{ item.from }} → {{ item.to }}</p></details>
    <ul><li v-for="item in state.isolation?.verification ?? []" :key="`${item.table}:${item.id}`">{{ item.table }} · {{ item.id }}：{{ item.result }}</li></ul>
   </template>
   <DataSpaceModelSource v-if="state?.source && sourceHost" :session="sourceHost" :model-id="state.modelId"
    :revision="revision" :disabled="busy || state.complete" :configuration-label="operation ? '操作目标确认' : '节点来源及输出映射'" @changed="changed" />
   <p v-if="state?.complete" role="status">{{ operation ? '目标与节点绑定已确认，可重新载入原节点。' : '来源和节点输出已确认，可重新载入原节点。' }}</p>
   <template #footer>
    <RendererButton v-if="!state?.isolation && !state?.node && !state?.complete" label="取消来源选择" :disabled="busy" @click="cancel" />
    <RendererButton v-if="state?.node?.canAcceptCurrent" label="读取原节点当前正式结果" :disabled="busy" @click="recover('verifyNodeCurrent')" />
    <RendererButton v-if="state?.node?.notApplied" label="重新提交已确认未生效的原节点切换" :disabled="busy" @click="recover('resubmitNode')" />
    <RendererButton v-if="state?.node?.canDiscardLocalChanges" label="放弃原节点后续修改并核验" :disabled="busy" @click="recover('discardNodeLocalChanges')" />
    <RendererButton v-if="state?.complete" label="重新载入已确认节点" :disabled="busy" @click="finish" />
   </template>
  </RendererDialog>
 </section>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,shallowRef,watchEffect} from 'vue'
import type {DataSet,DataView} from '@spark-appworks/spark-data'
import {RendererButton,RendererDialog,RendererForm,FieldText} from '@spark-appworks/spark-component'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'
import {LowcodeDataSpaceModelSourceReader} from '@/lowcode/data-space/model-source/lowcode-data-space-model-source-reader'
import {openWorkflowQuerySourceEdit,type WorkflowModelSourceEdit} from '@/lowcode/resources/structured-config/workflow-definition/query-source-edit'
import DataSpaceModelSource from '@/views/features/data-platform/data-set-management/design/model/source/DataSpaceModelSource.vue'
import {DataSpaceSourceControls} from '@/views/features/data-platform/data-set-management/design/model/source/data-space-source-controls'
const props=defineProps<{dataSet:DataSet;workflowId:string;nodeId:string;eligible:boolean;revision:number;operation?:boolean;disabled?:boolean;onSaved?:(id:string)=>void|Promise<void>}>()
const emit=defineEmits<{pendingChange:[value:boolean]}>()
const owner=shallowRef<WorkflowModelSourceEdit>(),names=shallowRef<DataView>(),visible=ref(false),busy=ref(false),error=ref(''),tick=ref(0)
let active=true
let registration:DataSpaceSourceControls|undefined
const revision=computed(()=>props.revision+tick.value)
const state=computed(()=>{revision.value;return owner.value?.getState()})
const nameKey=computed(()=>names.value&&registration?registration.key(names.value):'')
const isolationPreview=computed(()=>{revision.value;const name=names.value?.getEditingRow('registration')?.['name'];if(!owner.value||state.value?.isolation||typeof name!=='string'||!name)return{plan:undefined,error:''};try{return{plan:owner.value.isolationPlan(name),error:''}}catch(cause){return{plan:undefined,error:cause instanceof Error?cause.message:String(cause)}}})
const sourceHost=computed(()=>{
 const command=owner.value;if(!command)return undefined
 return{metadataDataSet:props.dataSet,getModelCreate(){throw Error('当前入口只修改既有节点来源')},getModelSourceEdit(id:string){if(id!==command.getState().modelId)throw Error('节点来源模型身份已变化');return command.source}}
})
watchEffect(()=>emit('pendingChange',busy.value||visible.value||owner.value?.getState().pending===true),{flush:'sync'})
async function act(action:()=>Promise<void>):Promise<void>{if(busy.value)return;busy.value=true;error.value='';try{await action()}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}finally{busy.value=false;tick.value++}}
async function open():Promise<void>{
 if(props.disabled||!props.eligible||visible.value)return
 await act(async()=>{
  const ds=props.dataSet,workflowId=props.workflowId,nodeId=props.nodeId,scope=lowcodeApi.readRequestScope()
  const assertCurrent=()=>{const current=lowcodeApi.readRequestScope();if(!active||props.dataSet!==ds||props.workflowId!==workflowId||props.nodeId!==nodeId||current.token!==scope.token||current.headers['X-AppId']!==scope.headers['X-AppId'])throw Error('工作流来源编辑身份已失效')}
  owner.value=await openWorkflowQuerySourceEdit({dataSet:ds,workflowId,nodeId,operation:props.operation===true,sources:new LowcodeDataSpaceModelSourceReader(ds),assertCurrent})
  try{registration=new DataSpaceSourceControls(ds,()=>{tick.value++});names.value=registration.registration;names.value.replaceRows([{id:'registration',name:''}]);names.value.setCurrentRowById('registration');visible.value=true}
  catch(cause){owner.value.cancel();owner.value=undefined;registration?.dispose();registration=undefined;throw cause}
 })
}
async function isolate():Promise<void>{await act(async()=>{const value=names.value?.getEditingRow('registration')?.['name'];if(typeof value!=='string'||!owner.value)throw Error('请填写隔离模型名称');await owner.value.isolate(value)})}
async function verifyIsolation():Promise<void>{await act(async()=>{await owner.value?.verifyIsolation()})}
async function recoverIsolation(method:'abandonIsolationNotApplied'|'discardIsolationLocalChanges'):Promise<void>{await act(async()=>{if(!owner.value)throw Error('原隔离创建已失效');await owner.value[method]()})}
async function recover(method:'verifyNodeCurrent'|'resubmitNode'|'discardNodeLocalChanges'):Promise<void>{await act(async()=>{if(!owner.value)throw Error('原来源编辑已失效');await owner.value[method]();await finishConfirmed()})}
function release():void{visible.value=false;registration?.dispose();registration=undefined;names.value=undefined;owner.value=undefined;tick.value++}
function cancel():void{if(busy.value)return;try{owner.value?.cancel();release();error.value=''}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
async function finishConfirmed():Promise<void>{const command=owner.value;if(!command?.getState().complete)return;await props.onSaved?.(props.nodeId);command.close();release()}
async function finish():Promise<void>{await act(finishConfirmed)}
function changed():void{tick.value++;if(owner.value?.getState().complete)void finish()}
function discardChanges():boolean{if(busy.value)return false;if(!visible.value&&!owner.value?.getState().pending)return true;cancel();return !visible.value}
defineExpose({discardChanges})
onBeforeUnmount(()=>{active=false;registration?.dispose();emit('pendingChange',false)})
</script>
