<!--
@module app:views/app/dev-system/DevDataSetDesigner
职责：编辑单场景共享视图配置及真实N__pagedata.json历史。
边界：正式模型定义不在配置文件中；缺文件需显式新建，dirty禁止恢复与快照。
AI用途：绑定工作区正式定义DataView编辑，DataSet保存；历史来自同一来源适配，恢复也写回原定义视图。
-->
<template>
  <div class="scenario-designer">
    <div class="toolbar">
      <strong>场景视图配置</strong>
      <RendererButton v-if="!definitionView && nodeViewKey" :data-view-key="nodeViewKey" :disabled="busy || creating || state.pageDataDirty.value || !state.selectedNode.value?.dataSpace?.scenarioId" label="重新加载" @click="load" />
      <RendererForm v-else-if="definitionView" :key="definitionContextKey" :data-source="definitionView" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" class="definition-commands">
        <div class="definition-commands__actions">
          <span>{{ state.scenarioDefinitionDocument.value?.scenarioId }}</span>
          <RendererButton v-if="canCreate" :loading="creating" label="按正式模型新建视图草稿" @click="create" />
          <RendererButton v-if="nodeViewKey" :data-view-key="nodeViewKey" :disabled="busy || creating || state.pageDataDirty.value || !state.selectedNode.value?.dataSpace?.scenarioId" label="重新加载" @click="load" />
          <RendererButton :disabled="busy || recovering || !definitionCanUndo" label="撤销" @click="undo" />
          <RendererButton :disabled="busy || recovering || !definitionCanRedo" label="重做" @click="redo" />
          <RendererButton data-test="scene-save" button-type="primary" :disabled="busy || !state.pageDataDirty.value || !!inputError && !recovering" :label="recovering ? '核验场景提交' : '保存场景视图'" @click="save" />
          <RendererButton data-test="scene-history" :disabled="busy || !definitionIsPersisted" label="场景历史" @click="historyOpen = true" />
        </div>
      </RendererForm>
    </div>
    <ScenarioHistoryPanel v-if="historyOpen && historyView" :key="historyRequest" :open="true" :view="historyView" :can-create="canVersion"
      :draft-dirty="state.pageDataDirty.value" :on-restore="restoreHistory" :on-save="saveHistoryDraft"
      :can-undo="historyDocument?.canUndo === true" :can-redo="historyDocument?.canRedo === true"
      :on-undo="undoHistoryDraft" :on-redo="redoHistoryDraft"
      @pending="working = $event" @close="closeHistory" />
    <p v-if="displayError" role="alert">{{ displayError }}</p>
    <p v-if="recovering" role="status">场景提交结果尚未确认；请先核验原提交，新修改保留到下一次保存。</p>
    <p v-else-if="message" role="status">{{ message }}</p>
    <p v-if="!state.scenarioDefinitionDocument.value">选择已绑定场景的蓝图节点后加载视图配置</p>
    <template v-else>
      <p>正式模型与字段由 SPARK 提供。此文件配置每个模型的命名视图、查询条件和视图级联。</p>
      <ScenarioDefinitionTextEditor :document="state.scenarioDefinitionDocument.value" :revision="state.scenarioDefinitionRevision.value"
        :readonly="busy" @error="inputError = $event" @changed="state.scenarioDefinitionRevision.value++" />
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import type {DataView} from '@spark-appworks/spark-data'
import {RendererButton, RendererForm} from '@spark-appworks/spark-component'
import ScenarioHistoryPanel from '@/views/features/data-platform/data-set-management/design/ui/ScenarioHistoryPanel.vue'
import ScenarioDefinitionTextEditor from './definition/ScenarioDefinitionTextEditor.vue'
import type { DevState } from './useDevState'
const props=defineProps<{state:DevState}>()
const definitionView=computed<DataView|undefined>(()=>props.state.scenarioDefinitionDocument.value?.dataSet.getView('DataViewDefinition'))
const definitionViewRevision=ref(0)
watch(()=>props.state.scenarioDefinitionDocument.value,()=>{definitionViewRevision.value++})
const definitionContextKey=computed(()=>{
  return `${definitionViewRevision.value}:${props.state.selectedNode.value?.nodeId??''}`
})
const nodeViewKey=computed(()=>props.state.blueprintWorkspaceDataView.value?.standardComponentBinding.dataViewKey)
const definitionCanUndo=computed(()=>{props.state.scenarioDefinitionRevision.value;return props.state.scenarioDefinitionDocument.value?.canUndo===true})
const definitionCanRedo=computed(()=>{props.state.scenarioDefinitionRevision.value;return props.state.scenarioDefinitionDocument.value?.canRedo===true})
const definitionIsPersisted=computed(()=>{props.state.scenarioDefinitionRevision.value;return props.state.scenarioDefinitionDocument.value?.isPersisted===true})
const error=ref('')
const inputError=ref(''), message=ref('')
const creating=ref(false)
const working=ref(false)
const definitionViews=computed(()=>{
  props.state.scenarioDefinitionRevision.value
  const document=props.state.scenarioDefinitionDocument.value
  return document?.viewSelectors.map(item=>document.dataSet.getView(item.tableName,item.viewId)).filter((view):view is DataView=>!!view) ?? []
})
const recovering=computed(()=>definitionViews.value.some(view=>view.hasUnconfirmedSave))
const busy=computed({get:()=>working.value || definitionViews.value.some(view=>view.mutating),set:value=>{working.value=value}})
const historyOpen=ref(false)
const historyDocument=computed(()=>{props.state.scenarioDefinitionRevision.value;return props.state.scenarioDefinitionDocument.value})
let operationRequest=0
const historyRequest=ref(0)
const canVersion=computed(()=>!busy.value && props.state.scenarioDefinitionDocument.value?.isPersisted === true && !props.state.pageDataDirty.value && !inputError.value)
const historyView=computed(()=>{props.state.scenarioDefinitionRevision.value;return props.state.scenarioDefinitionDocument.value?.dataSet.getView('DataViewDefinition')})
function closeHistory():void {historyRequest.value++;historyOpen.value=false}
watch(()=>[props.state.projectId,props.state.selectedNode.value?.nodeId,props.state.scenarioDefinitionDocument.value],closeHistory)
onUnmounted(()=>{operationRequest++;historyRequest.value++})
watch(()=>[props.state.projectId,props.state.selectedNode.value?.nodeId,props.state.selectedNode.value?.dataSpace?.scenarioId],()=>{
  operationRequest++
  const node=props.state.selectedNode.value?.nodeId
  void props.state.loadSelectedScenarioViews().catch(cause=>{
    if(props.state.selectedNode.value?.nodeId===node)error.value=cause instanceof Error?cause.message:String(cause)
  })
}, {immediate:true})
async function restoreHistory(version:string|number,text:string):Promise<void>{await props.state.restoreScenarioVersion(version,text)}
async function saveHistoryDraft():Promise<void>{await props.state.saveScenarioViewText()}
async function undoHistoryDraft():Promise<void>{if(!await props.state.scenarioDefinitionDocument.value?.undo())throw new Error('没有可撤销的定义修改');props.state.scenarioDefinitionRevision.value++}
async function redoHistoryDraft():Promise<void>{if(!await props.state.scenarioDefinitionDocument.value?.redo())throw new Error('没有可重做的定义修改');props.state.scenarioDefinitionRevision.value++}
const canCreate=computed(()=>{props.state.scenarioDefinitionRevision.value;return props.state.scenarioDefinitionDocument.value?.isPersisted === false && !props.state.pageDataDirty.value})
const displayError=computed(()=>inputError.value || error.value || props.state.pageDataError.value || '')
watch(()=>props.state.scenarioDefinitionDocument.value,()=>{error.value='';inputError.value='';message.value=''})
async function create():Promise<void>{if(creating.value)return;creating.value=true;try{await props.state.createSelectedScenarioViews();error.value=''}catch(cause){error.value=cause instanceof Error ? cause.message : String(cause)}finally{creating.value=false}}
async function load():Promise<void>{
  if(busy.value)return
  const id=++operationRequest;busy.value=true
  try{await props.state.loadSelectedScenarioViews(true);if(id===operationRequest)error.value=''}
  catch(cause){if(id===operationRequest)error.value=cause instanceof Error?cause.message:String(cause)}
  finally{busy.value=false}
}
async function save():Promise<void>{
  if(busy.value)return
  const id=++operationRequest, verifying=recovering.value;busy.value=true;error.value='';message.value=''
  try{await props.state.saveScenarioViewText();if(id===operationRequest){
    message.value=props.state.pageDataDirty.value ? '本轮提交已确认，仍有新修改待保存' : verifying ? '原提交已核验，未重复写入' : '场景视图已保存并确认'
  }}
  catch(cause){if(id===operationRequest)error.value=cause instanceof Error?cause.message:String(cause)}
  finally{busy.value=false}
}
async function undo():Promise<void>{try{if(await props.state.scenarioDefinitionDocument.value?.undo())props.state.scenarioDefinitionRevision.value++}catch(cause){error.value=String(cause)}}
async function redo():Promise<void>{try{if(await props.state.scenarioDefinitionDocument.value?.redo())props.state.scenarioDefinitionRevision.value++}catch(cause){error.value=String(cause)}}
</script>
<style scoped>
.scenario-designer {padding:16px;}
.toolbar {display:flex;align-items:center;gap:12px;margin-bottom:16px;}
.definition-commands__actions {display:flex;align-items:center;gap:12px;}
</style>
