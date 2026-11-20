<!--
@module app:views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-query-node-create
职责：标准组件绑定原来源候选和预览，触发同实例查询模型及节点创建命令。
边界：不保存候选数组、不发HTTP、不生成第二份正式草稿。
-->
<template>
 <section>
  <RendererButton v-if="eligible && unbound" :label="sourceModel ? '选择模型' : '选择目标表'" :disabled="disabled || busy || visible" @click="open" />
  <p v-if="error && !visible" role="alert">{{ error }}</p>
  <RendererDialog v-if="controls" v-model="visible" :data-view-key="controls.key(controls.search)" :title="sourceModel ? '选择模型' : '选择目标表'"
   width="min(1000px, calc(100vw - 32px))" :grid-columns="1" append-to-body :close-disabled="true">
   <p v-if="error" role="alert">{{ error }}</p>
   <template v-if="!state?.preview && !owner?.modelId">
    <RendererForm :data-view-key="controls.key(controls.search)" context-data-member="currentRow" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
     <FieldSelect field="type" label="来源类型" presentation="tabs" :options="[...sourceTypes]" :clearable="false" :readonly="busy" />
     <FieldText field="keyword" label="来源名称" :readonly="busy" />
     <FieldText v-if="controls.specification.description" field="description" label="来源说明" :readonly="busy" />
     <FieldText v-if="controls.specification.databaseName" field="databaseName" label="数据库名称" :readonly="busy" />
    </RendererForm>
    <RendererTable :key="controls.results.tableName + controls.results.viewId" :data-view-key="controls.key(controls.results)" data-member="rows"
     :auto-columns="false" :show-data-view-meta="false" :show-pagination="true" :max-height="420" highlight-current-row>
     <FieldText :field="controls.specification.name" label="名称" />
     <FieldText v-if="controls.specification.description" :field="controls.specification.description" label="说明" />
     <FieldText v-if="controls.specification.databaseName" :field="controls.specification.databaseName" label="数据库" />
    </RendererTable>
   </template>
   <section v-else>
    <h3>{{ sourceModel ? '查询模型与字段预览' : '操作目标与字段预览' }}</h3>
    <p v-if="owner?.modelId" role="status">模型已确认，继续核验原节点绑定。</p>
    <RendererForm v-else :data-view-key="controls.key(controls.registration)" context-data-member="currentRow" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
     <FieldText field="name" label="模型名称" :readonly="busy || state?.status !== 'ready'" />
    </RendererForm>
    <p v-if="state?.nameError" role="alert">{{ state.nameError }}</p>
    <RendererTable :data-view-key="controls.key(controls.fields)" :auto-columns="false" :show-data-view-meta="false" :show-pagination="false">
     <FieldText field="Name" label="字段" /><FieldText field="description" label="说明" /><FieldText field="FieldType" label="类型" />
     <FieldText field="purpose" label="用途" /><FieldText field="primary" label="主键" /><FieldText field="output" label="输出" />
    </RendererTable>
   </section>
   <template #footer>
    <RendererButton label="取消模型选择" :disabled="busy || !!owner?.modelId || !!owner?.nodeCaptured" @click="cancel" />
    <RendererButton v-if="!state?.preview && !owner?.modelId" label="确认来源" :disabled="busy || !canSelect" @click="preview" />
    <RendererButton v-else-if="!owner?.nodeNotApplied" :label="saveLabel" button-type="primary" :disabled="busy || !!state?.nameError" @click="save" />
    <RendererButton v-if="owner?.nodeNotApplied" label="重新提交已确认未生效的原节点" :disabled="busy" @click="resubmitNode" />
    <RendererButton v-if="state?.canAbandonNotApplied" label="放弃已确认未生效的创建" :disabled="busy" @click="abandon" />
    <RendererButton v-if="state?.canDiscardLocalChanges" label="放弃后续本地修改并核验模型" :disabled="busy" @click="discardModelChanges" />
    <RendererButton v-if="owner?.canDiscardNodeLocalChanges" label="放弃节点后续修改并核验原绑定" :disabled="busy" @click="discardNodeChanges" />
   </template>
  </RendererDialog>
 </section>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,shallowRef,watchEffect} from 'vue'
import type {DataSet} from '@spark-appworks/spark-data'
import {RendererButton,RendererDialog,RendererForm,RendererTable,FieldSelect,FieldText} from '@spark-appworks/spark-component'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'
import {LowcodeDataSpaceModelSourceReader} from '@/lowcode/data-space/model-source/lowcode-data-space-model-source-reader'
import {LowcodeDataSpaceSourceCatalog} from '@/lowcode/data-space/model-source/lowcode-data-space-source-catalog'
import {DataSpaceSourceControls} from '@/views/features/data-platform/data-set-management/design/model/source/data-space-source-controls'
import {openWorkflowNodeModelBinding,type WorkflowNodeModelBinding} from '@/lowcode/resources/structured-config/workflow-definition/source/query-node-create'
const props=defineProps<{dataSet:DataSet;workflowId:string;nodeId:string;eligible:boolean;disabled?:boolean;onCreated?:(id:string)=>void|Promise<void>}>()
const emit=defineEmits<{pendingChange:[value:boolean]}>()
const controls=shallowRef<DataSpaceSourceControls>(),owner=shallowRef<WorkflowNodeModelBinding>(),visible=ref(false),busy=ref(false),error=ref(''),revision=ref(0)
const node=computed(()=>{revision.value;const nodes=props.dataSet.getView('Base_WorkflowNodeDefinition'),row=nodes?.rows.find(row=>nodes.getPkKey(row)===props.nodeId);return row&&nodes?.fieldAccess(row,'node_type').read==='visible'?(nodes.getEditingRow(props.nodeId)??row):undefined})
const operation=computed(()=>node.value?.['node_type'])
const unbound=computed(()=>{const nodes=props.dataSet.getView('Base_WorkflowNodeDefinition'),row=node.value;return !!row&&['node_config','dataOperateModId'].every(field=>nodes?.fieldAccess(row,field).read==='visible'&&(row[field]===undefined||row[field]===null||row[field]===''))})
const sourceModel=computed(()=>operation.value==='query'||operation.value==='copy')
const sourceTypes=computed(()=>sourceModel.value?LowcodeDataSpaceSourceCatalog.types:LowcodeDataSpaceSourceCatalog.types.filter(item=>item.value==='table'))
let active=true
const off=props.dataSet.onAnyViewChange({rowsChanged:changed,currentRowChanged:changed,selectedRowsChanged:changed,editingChanged:changed,requestStateChanged:changed})
function changed():void{revision.value++}
const state=computed(()=>{revision.value;return owner.value?.model.getState()})
const canSelect=computed(()=>{revision.value;return controls.value?.canSelect===true})
const saveLabel=computed(()=>owner.value?.modelId?'继续核验原节点绑定':state.value?.status==='ready'?'确认模型绑定':'核验并继续绑定')
watchEffect(()=>{revision.value;emit('pendingChange',busy.value||visible.value||owner.value?.pending===true)})
function close():void{visible.value=false;controls.value?.dispose();controls.value=undefined;owner.value=undefined;revision.value++}
async function act(action:()=>Promise<void>):Promise<void>{
 if(busy.value)return
 busy.value=true;error.value=''
 try{await action()}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}finally{busy.value=false;revision.value++}
}
async function open():Promise<void>{
 if(props.disabled||!props.eligible||!unbound.value||visible.value)return
 await act(async()=>{
  const ds=props.dataSet,workflowId=props.workflowId,nodeId=props.nodeId,scope=lowcodeApi.readRequestScope()
  const assertCurrent=()=>{
   const current=lowcodeApi.readRequestScope()
   if(!active||props.dataSet!==ds||props.workflowId!==workflowId||props.nodeId!==nodeId||current.token!==scope.token||current.headers['X-AppId']!==scope.headers['X-AppId'])throw Error('原节点绑定身份已失效')
  }
  owner.value=await openWorkflowNodeModelBinding({dataSet:ds,workflowId,nodeId,sources:new LowcodeDataSpaceModelSourceReader(ds),assertCurrent})
  controls.value=new DataSpaceSourceControls(ds,event=>{
   if(event.kind==='name'&&typeof event.value==='string'){
    try{owner.value?.model.setName(event.value)}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
   }
   revision.value++
  })
  visible.value=true;controls.value.setOpen(true)
 })
}
async function preview():Promise<void>{await act(async()=>{
 const source=controls.value,command=owner.value
 if(!source||!command)throw Error('来源选择已失效')
 await command.model.preview(source.selected());source.setOpen(false);source.sync(command.model.getState())
})}
async function save():Promise<void>{await act(async()=>{
 const command=owner.value;if(!command)throw Error('查询节点创建已失效')
 const id=await command.save();await props.onCreated?.(id);close()
})}
async function resubmitNode():Promise<void>{await act(async()=>{
 const command=owner.value;if(!command)throw Error('查询节点创建已失效')
 const id=await command.resubmitNotApplied();await props.onCreated?.(id);close()
})}
function cancel():void{
 if(busy.value)return
 try{owner.value?.cancel();close();error.value=''}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
}
async function abandon():Promise<void>{await act(async()=>{await owner.value?.abandonNotApplied();owner.value?.cancel();close()})}
async function discardModelChanges():Promise<void>{await act(async()=>{await owner.value?.discardModelLocalChanges()})}
async function discardNodeChanges():Promise<void>{await act(async()=>{const command=owner.value;if(!command)throw Error('原节点绑定已失效');const id=await command.discardNodeLocalChanges();await props.onCreated?.(id);close()})}
function discardChanges():boolean{if(busy.value)return false;if(!visible.value&&!owner.value?.pending)return true;cancel();return !visible.value&&!owner.value?.pending}
defineExpose({discardChanges})
onBeforeUnmount(()=>{active=false;off();controls.value?.dispose()})
</script>
