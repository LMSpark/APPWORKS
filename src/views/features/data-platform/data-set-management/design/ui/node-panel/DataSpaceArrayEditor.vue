<!--
@module app:views/features/data-platform/data-set-management/design/ui/node-panel/DataSpaceArrayEditor
职责：恢复数组数据维护入口，标准JSON行组件绑定正式模型items。
边界：正式字段定义提供子组件，编辑与提交沿原模型DataView和保存owner；不转换其他来源，不自动猜表头。
AI用途：元模型工作区的数组编辑弹窗、取消和未知提交核验。
-->
<template>
  <RendererButton :data-view-key="dataViewKey" data-action="edit-array" label="编辑数组" :disabled="disabled || open || !isArray" @click="show" />
  <p v-if="error && !open" role="alert">{{ error }}</p>
  <RendererDialog v-if="open" :model-value="true" :data-view-key="dataViewKey" title="编辑前端数组" width="min(1180px, calc(100vw - 32px))"
    :grid-columns="1" append-to-body :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false">
    <RendererForm :data-view-key="dataViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="2" label-width="68px"
      :form-props="{rules: {Name: [{required: true, message: '名称不能为空', trigger: 'blur'}]}}">
      <FieldText field="Name" label="名称" :maxlength="100" :readonly="locked" />
      <FieldText field="description" label="描述" :maxlength="200" :readonly="locked" />
    </RendererForm>
    <RendererForm :data-view-key="dataViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" label-width="0px">
      <FieldJson v-if="definition?.readable" field="items" label="" mode="rows" :height="460" :children="children" :toolbar="toolbar"
        :readonly="locked || !definition.writable" :on-editing-change="rowEditingChanged" />
      <p v-else>数组数据不可读</p>
    </RendererForm>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="state.status === 'configuration'" role="alert">数据库定义已确认，场景或工具绑定尚未保存完成。请继续核验。</p>
    <p v-else-if="state.status !== 'idle'" role="alert">保存结果尚未核实，请先核验，不能重复提交。</p>
    <ul><li v-for="item in state.verification" :key="item">{{ item }}</li></ul>
    <template #footer>
      <RendererToolbar :data-view-key="dataViewKey" justify="end" :children="footer" />
    </template>
  </RendererDialog>
  <DataSpaceArrayHeaders v-if="headerDraft" :draft="headerDraft" :on-confirm="applyHeaders" @closed="closeHeaders" />
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef} from 'vue'
import {buildDataViewKey, RequestState, type SparkNode} from '@spark-appworks/spark-data'
import {FieldText, FieldJson, RendererButton, RendererDialog, RendererForm, RendererToolbar, type RToolbarProps} from '@spark-appworks/spark-component'
import type {ArrayDefinition, LowcodeDataSpaceArrayDraft} from '@/lowcode/data-space/model-source/array/lowcode-data-space-array-draft'
import type {ArrayEditHandle} from '@/lowcode/data-space/model-source/array/lowcode-data-space-array-session'
import type {DataSpaceDefinitionRecoveryOptions} from '@/lowcode/data-space/model-source/data-space-definition-save'
import DataSpaceArrayHeaders from './DataSpaceArrayHeaders.vue'
import type {DataSpaceModelEditorProps} from './data-set-design-node-panel.props'
const props=defineProps<DataSpaceModelEditorProps>()
const emit=defineEmits<{changed: [];pending:[value:boolean]}>()
const open=ref(false),busy=ref(false),rowEditing=ref(false),error=ref(''),tick=ref(0)
const view=props.session.metadataDataSet.getView('Base_DataModel')!
const dataViewKey=buildDataViewKey('Base_DataModel','default',props.session.metadataDataSet.scenarioId)
const owner=shallowRef<ArrayEditHandle>(),headerDraft=shallowRef<LowcodeDataSpaceArrayDraft>()
const isArray=computed(()=>{props.revision;tick.value;const row=view.rows.find(row=>row['rowid']===props.modelId)
  return !!row && view.fieldAccess(row,'Type').read==='visible' && row['Type']==='数组'})
const state=computed(()=>{props.revision;tick.value;return owner.value?.getState()??{status:'idle',pending:false,verification:[],discardLocalChanges:false}})
const definition=computed(()=>{props.revision;tick.value;const row=view.rows.find(r=>r['rowid']===props.modelId)
  return row&&owner.value?{headers:owner.value.headers(),readable:view.fieldAccess(row,'items').read==='visible',writable:view.fieldAccess(row,'items').write==='allowed'&&view.editActionState(row)==='enabled'}:null})
const locked=computed(()=>busy.value||state.value.status!=='idle'||!!headerDraft.value)
const children=computed<SparkNode[]>(()=>definition.value?.headers.map(field=>{
  const type=['number','int','integer','decimal','float','double'].includes(field.type.toLowerCase())?'r-number':field.type==='boolean'?'r-switch':'r-text'
  return {type,props:{field:field.name,label:field.label,...type==='r-text'?{maxlength:200}:{}}}
})??[])
const toolbar=computed<RToolbarProps>(()=>({dataViewKey,children:[{type:'r-button',props:{label:'设置表头','data-action':'array-headers',disabled:locked.value||rowEditing.value,onClick:showHeaders}}]}))
const footer=computed<SparkNode[]>(()=>[
  {type:'r-button',props:{label:'取消','data-action':'cancel-array',disabled:locked.value||rowEditing.value,onClick:cancel}},
  {type:'r-button',props:{label:'保存',buttonType:'primary','data-action':'save-array',disabled:locked.value||rowEditing.value||!state.value.pending,onClick:save}},
    ...state.value.status!=='idle'?[{type:'r-button',props:{label:state.value.status==='different'?'重新核验':'核验原提交（未生效时放弃本次草稿）','data-action':'verify-array',disabled:busy.value||rowEditing.value,onClick:verify}}]:[],
  ...state.value.discardLocalChanges?[{type:'r-button',props:{label:'放弃本地新修改并核验','data-action':'discard-local-array-changes',disabled:busy.value||rowEditing.value,onClick:()=>verify({discardLocalChanges:true})}}]:[],
  ...state.value.status==='different'?[{type:'r-button',props:{label:'接受当前正式结果，结束本次操作','data-action':'accept-array',disabled:busy.value,onClick:accept}}]:[],
])
function changed():void{tick.value++;emit('changed')}
function rowEditingChanged(value:boolean):void{rowEditing.value=value}
async function show():Promise<void>{
  if(props.disabled || open.value || !isArray.value)return
  busy.value=true;error.value=''
  try{
    const model=props.session.getModelEdit(props.modelId)
    if(model.getState().pending || model.getState().status!=='idle')throw new Error('请先保存、取消或核验当前模型修改')
    const fields=props.session.metadataDataSet.getView('Base_DataModel_Field','modelFields')
    if(fields?.requestState!==RequestState.Loaded||fields.queryContext['modelId']!==props.modelId)await props.session.loadModelFields(props.modelId)
    owner.value=props.session.getArrayEdit(props.modelId,'modelFields');owner.value.headers();view.setCurrentRowById(props.modelId);open.value=true;emit('pending',true)
  }catch(cause){error.value=String(cause)}finally{busy.value=false;changed()}
}
function close():void{props.session.releaseArrayEdit(props.modelId,'modelFields');open.value=false;owner.value=undefined;emit('pending',false);changed()}
function showHeaders():void{if(locked.value||rowEditing.value)return;try{headerDraft.value=owner.value?.beginHeaders();headerDraft.value?.beginHeaders()}catch(cause){error.value=String(cause)}}
async function applyHeaders(value:ArrayDefinition):Promise<void>{await owner.value?.applyHeaders(value)}
function closeHeaders():void{headerDraft.value?.dispose();headerDraft.value=undefined;changed()}
function cancel():void{
  if(locked.value || rowEditing.value)return
  try{owner.value?.discard();error.value='';close()}catch(cause){error.value=String(cause)}
}
async function save():Promise<void>{
  if(locked.value || rowEditing.value)return
  busy.value=true;error.value=''
  try{await owner.value?.save();if(!owner.value?.getState().pending)close()}catch(cause){error.value=String(cause)}finally{busy.value=false;changed()}
}
async function verify(options?:DataSpaceDefinitionRecoveryOptions):Promise<void>{
  if(busy.value || rowEditing.value)return
  busy.value=true;error.value=''
  try{if(await owner.value?.verify(options))close()}catch(cause){error.value=String(cause)}finally{busy.value=false;changed()}
}
function accept():void{try{owner.value?.acceptCurrent();close()}catch(cause){error.value=String(cause)}}
view.events.on('editingFieldChanged',changed)
onBeforeUnmount(()=>{view.events.off('editingFieldChanged',changed);headerDraft.value?.dispose();props.session.releaseArrayEdit(props.modelId,'modelFields');emit('pending',false)})
</script>
