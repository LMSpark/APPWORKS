<!--
@module app:views/features/data-platform/data-set-management/design/ui/node-panel/DataSpaceArrayCreate
职责：恢复新增数组和新定义设置表头窗口，标准组件绑定局部输入视图。
边界：正式新增沿原ModelCreate批次及核验，不转换当前模型、不另建请求或权限。
AI用途：设计页数组新建入口，确认、取消和未知结果处理。
-->
<template>
  <RendererButton :data-view-key="modelKey" data-action="add-array" label="添加数组" :disabled="disabled || !!draft || !canAdd" @click="show" />
  <p v-if="error && !draft" role="alert">{{ error }}</p>
  <RendererDialog v-if="draft" :model-value="true" :data-view-key="draft.key" title="新增前端数组" width="min(1180px, calc(100vw - 32px))"
    :grid-columns="1" append-to-body :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false">
    <RendererForm :data-view-key="draft.key" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="2" label-width="68px"
      :form-props="{rules: {name: [{required: true, message: '名称不能为空', trigger: 'blur'}]}}">
      <FieldText field="name" label="名称" :maxlength="100" :readonly="locked" />
      <FieldText field="description" label="描述" :maxlength="200" :readonly="locked" />
    </RendererForm>
    <RendererForm :data-view-key="draft.key" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" label-width="0px">
      <FieldJson field="items" label="" mode="rows" :height="460" :children="children" :toolbar="toolbar"
        :readonly="locked" :on-editing-change="value=>rowEditing=value" />
    </RendererForm>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="unresolved" role="alert">新增结果尚未完整确认，请先核验，不能重复提交。</p>
    <ul v-if="unresolved"><li v-for="item in state.verification" :key="item.table+item.id">{{ item.table }}：{{ item.result }}</li></ul>
    <template #footer>
      <RendererToolbar :data-view-key="draft.key" justify="end" :children="footer" />
    </template>
  </RendererDialog>
  <DataSpaceArrayHeaders v-if="draft && headerOpen" :draft="draft" @closed="headerOpen=false;changed()" />
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef} from 'vue'
import {buildDataViewKey, type SparkNode} from '@spark-appworks/spark-data'
import {FieldText, FieldJson, RendererButton, RendererDialog, RendererForm, RendererToolbar, type RToolbarProps} from '@spark-appworks/spark-component'
import {LowcodeDataSpaceArrayDraft} from '@/lowcode/data-space/model-source/array/lowcode-data-space-array-draft'
import type {DataSpaceModelEditorProps} from './data-set-design-node-panel.props'
import DataSpaceArrayHeaders from './DataSpaceArrayHeaders.vue'
const props=defineProps<Pick<DataSpaceModelEditorProps,'session'|'revision'|'disabled'>>()
const emit=defineEmits<{changed:[];pending:[value:boolean];created:[id:string]}>()
const draft=shallowRef<LowcodeDataSpaceArrayDraft>(),busy=ref(false),rowEditing=ref(false),headerOpen=ref(false)
const error=ref(''),tick=ref(0)
const owner=computed(()=>props.session.getModelCreate())
const modelKey=buildDataViewKey('Base_DataModel','default',props.session.metadataDataSet.scenarioId)
const state=computed(()=>{props.revision;tick.value;return owner.value.getState()})
const unresolved=computed(()=>!['idle','ready'].includes(state.value.status))
const locked=computed(()=>busy.value || unresolved.value || headerOpen.value)
const canAdd=computed(()=>{props.revision;tick.value;return props.session.metadataDataSet.getView('Base_DataModel')?.addActionState()==='enabled'})
const children=computed<SparkNode[]>(()=>{tick.value;return draft.value?.headers().map(h=>({type:'r-text',props:{field:h.name,label:h.label||h.name,maxlength:200}}))??[]})
const toolbar=computed<RToolbarProps>(()=>({...draft.value?{dataViewKey:draft.value.key}:{},children:[{type:'r-button',props:{label:'设置表头','data-action':'array-headers',disabled:locked.value||rowEditing.value,onClick:showHeaders}}]}))
const footer=computed<SparkNode[]>(()=>[
  {type:'r-button',props:{label:'取消','data-action':'cancel-new-array',disabled:locked.value||rowEditing.value,onClick:cancel}},
  {type:'r-button',props:{label:'保存',buttonType:'primary','data-action':'save-new-array',disabled:locked.value||rowEditing.value||!canAdd.value,onClick:save}},
  ...unresolved.value?[{type:'r-button',props:{label:'重新核验','data-action':'verify-new-array',disabled:busy.value,onClick:verify}}]:[],
  ...state.value.status==='different'?[{type:'r-button',props:{label:'接受当前正式结果，结束本次操作','data-action':'accept-new-array',disabled:busy.value,onClick:accept}}]:[],
])
function changed():void{tick.value++;emit('changed')}
function show():void {
  if(props.disabled || draft.value || !canAdd.value)return
  try {
    if(owner.value.getState().pending)throw new Error('请先处理当前模型新增')
    draft.value=new LowcodeDataSpaceArrayDraft(props.session.metadataDataSet);error.value='';emit('pending',true)
  }catch(cause){error.value=String(cause)}
}
function close():void{draft.value?.dispose();draft.value=undefined;emit('pending',false);changed()}
function cancel():void{if(locked.value||rowEditing.value)return;try{owner.value.discard();close()}catch(cause){error.value=String(cause)}}
function showHeaders():void{if(locked.value||rowEditing.value||!draft.value)return;draft.value.beginHeaders();headerOpen.value=true}
async function save():Promise<void> {
  if(locked.value||rowEditing.value||!draft.value)return
  busy.value=true;error.value=''
  try{const id=await owner.value.createArray(draft.value.definition());close();emit('created',id)}catch(cause){error.value=String(cause)}finally{busy.value=false;changed()}
}
async function verify():Promise<void> {
  if(busy.value)return
  busy.value=true;error.value=''
  try{const result=await owner.value.verify();if(result.confirmed&&result.modelId){close();emit('created',result.modelId)}}catch(cause){error.value=String(cause)}finally{busy.value=false;changed()}
}
function accept():void{try{owner.value.acceptCurrent();close()}catch(cause){error.value=String(cause)}}
onBeforeUnmount(()=>{draft.value?.dispose();emit('pending',false)})
</script>
