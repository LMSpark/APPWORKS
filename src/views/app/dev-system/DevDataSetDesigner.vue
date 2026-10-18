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
      <span v-if="state.scenarioDefinitionDocument.value">{{ state.scenarioDefinitionDocument.value.scenarioId }}</span>
      <RendererButton v-if="canCreate" :loading="creating" label="按正式模型新建视图草稿" @click="create" />
      <RendererButton :disabled="busy || creating || state.pageDataDirty.value || !state.selectedNode.value?.dataSpace?.scenarioId" label="重新加载" @click="load" />
      <RendererButton :disabled="busy || recovering || !state.scenarioDefinitionDocument.value?.canUndo" label="撤销" @click="undo" />
      <RendererButton :disabled="busy || recovering || !state.scenarioDefinitionDocument.value?.canRedo" label="重做" @click="redo" />
      <RendererButton data-test="scene-save" button-type="primary" :disabled="busy || !state.pageDataDirty.value || !!inputError && !recovering" :label="recovering ? '核验场景提交' : '保存场景视图'" @click="save" />
      <RendererButton data-test="scene-history" :disabled="busy || !state.scenarioDefinitionDocument.value?.isPersisted" label="远端历史" @click="openHistory" />
      <RendererButton data-test="scene-snapshot" :disabled="!canVersion" label="创建场景快照" @click="snapshot" />
    </div>
    <section v-if="historyOpen" class="history">
      <div class="toolbar"><strong>pagedata.json 文件历史</strong><RendererButton data-test="scene-history-close" label="关闭历史" @click="closeHistory" /></div>
      <p v-if="!versions.length && !busy">暂无远端快照</p>
      <div v-for="version in versions" :key="version.label" class="toolbar">
        <span>{{ version.label }}</span><span>{{ version.lastModified === null ? '时间未知' : new Date(version.lastModified).toLocaleString() }}</span>
        <RendererButton data-test="scene-preview" :disabled="!canVersion" label="预览" @click="preview(version.version)" />
      </div>
      <template v-if="previewText !== null">
        <p>预览 {{ previewVersion }}__pagedata.json；恢复将写入场景工作文件。</p>
        <pre class="source-preview">{{ previewText }}</pre>
        <RendererButton data-test="scene-restore" :disabled="!canVersion" label="确认恢复工作文件" @click="restore" />
      </template>
    </section>
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
import {DATA_SOURCE, RendererButton, useSparkComponent} from '@spark-appworks/spark-component'
import ScenarioDefinitionTextEditor from './definition/ScenarioDefinitionTextEditor.vue'
import type { DevState } from './useDevState'
const props=defineProps<{state:DevState}>()
const {sparkProvide, sparkRemove}=useSparkComponent({type: 'scenario-definition-editor'})
watch(()=>props.state.scenarioDefinitionDocument.value, document=>{
  sparkRemove(DATA_SOURCE)
  const view=document?.dataSet.getView('DataViewDefinition')
  if(view)sparkProvide(DATA_SOURCE,view)
}, {immediate:true})
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
const versions=ref<Awaited<ReturnType<DataView['listSourceVersions']>>>([])
const previewText=ref<string|null>(null)
const previewVersion=ref<string|number|null>(null)
let request=0
const canVersion=computed(()=>!busy.value && props.state.scenarioDefinitionDocument.value?.isPersisted === true && !props.state.pageDataDirty.value && !inputError.value)
function closeHistory():void {request++;historyOpen.value=false;versions.value=[];previewText.value=null;previewVersion.value=null;busy.value=false}
watch(()=>[props.state.projectId,props.state.selectedNode.value?.nodeId,props.state.scenarioDefinitionDocument.value],closeHistory)
watch(()=>props.state.scenarioDefinitionRevision.value,()=>{previewText.value=null;previewVersion.value=null})
onUnmounted(()=>{request++})
watch(()=>[props.state.projectId,props.state.selectedNode.value?.nodeId,props.state.selectedNode.value?.dataSpace?.scenarioId],()=>{
  const node=props.state.selectedNode.value?.nodeId
  void props.state.loadSelectedScenarioViews().catch(cause=>{
    if(props.state.selectedNode.value?.nodeId===node)error.value=cause instanceof Error?cause.message:String(cause)
  })
}, {immediate:true})
async function openHistory():Promise<void>{
  if(busy.value)return
  historyOpen.value=true
  const id=++request;busy.value=true;error.value=''
  try{const listed=await props.state.listScenarioVersions();if(id===request)versions.value=listed}
  catch(cause){if(id===request)error.value=cause instanceof Error?cause.message:String(cause)}
  finally{if(id===request)busy.value=false}
}
async function snapshot():Promise<void>{
  if(!canVersion.value)return
  const id=++request;busy.value=true;error.value=''
  try{await props.state.createScenarioVersion();if(id===request){const listed=await props.state.listScenarioVersions();if(id===request){versions.value=listed;historyOpen.value=true}}}
  catch(cause){if(id===request)error.value=cause instanceof Error?cause.message:String(cause)}
  finally{if(id===request)busy.value=false}
}
async function preview(version:string|number):Promise<void>{
  if(!canVersion.value)return
  const id=++request;busy.value=true;previewText.value=null;previewVersion.value=null
  try{const value=await props.state.previewScenarioVersion(version);if(id===request){previewText.value=value;previewVersion.value=version}}
  catch(cause){if(id===request)error.value=cause instanceof Error?cause.message:String(cause)}
  finally{if(id===request)busy.value=false}
}
async function restore():Promise<void>{
  if(!canVersion.value || previewVersion.value===null || previewText.value===null)return
  const id=++request;busy.value=true
  try{await props.state.restoreScenarioVersion(previewVersion.value,previewText.value);if(id===request){previewText.value=null;previewVersion.value=null}}
  catch(cause){if(id===request)error.value=cause instanceof Error?cause.message:String(cause)}
  finally{if(id===request)busy.value=false}
}
const canCreate=computed(()=>props.state.scenarioDefinitionDocument.value?.isPersisted === false && !props.state.pageDataDirty.value)
const displayError=computed(()=>inputError.value || error.value || props.state.pageDataError.value || '')
watch(()=>props.state.scenarioDefinitionDocument.value,()=>{error.value='';inputError.value='';message.value=''})
async function create():Promise<void>{if(creating.value)return;creating.value=true;try{await props.state.createSelectedScenarioViews();error.value=''}catch(cause){error.value=cause instanceof Error ? cause.message : String(cause)}finally{creating.value=false}}
async function load():Promise<void>{
  if(busy.value)return
  const id=++request;busy.value=true
  try{await props.state.loadSelectedScenarioViews(true);if(id===request)error.value=''}
  catch(cause){if(id===request)error.value=cause instanceof Error?cause.message:String(cause)}
  finally{if(id===request)busy.value=false}
}
async function save():Promise<void>{
  if(busy.value)return
  const id=++request, verifying=recovering.value;busy.value=true;error.value='';message.value=''
  try{await props.state.saveScenarioViewText();if(id===request){
    message.value=props.state.pageDataDirty.value ? '本轮提交已确认，仍有新修改待保存' : verifying ? '原提交已核验，未重复写入' : '场景视图已保存并确认'
  }}
  catch(cause){if(id===request)error.value=cause instanceof Error?cause.message:String(cause)}
  finally{if(id===request)busy.value=false}
}
async function undo():Promise<void>{try{if(await props.state.scenarioDefinitionDocument.value?.undo())props.state.scenarioDefinitionRevision.value++}catch(cause){error.value=String(cause)}}
async function redo():Promise<void>{try{if(await props.state.scenarioDefinitionDocument.value?.redo())props.state.scenarioDefinitionRevision.value++}catch(cause){error.value=String(cause)}}
</script>
<style scoped>
.scenario-designer {padding:16px;}
.history {border:1px solid var(--el-border-color);padding:12px;margin-bottom:16px;}
.toolbar {display:flex;align-items:center;gap:12px;margin-bottom:16px;}
.source-preview {white-space:pre-wrap;overflow:auto;max-height:400px;}
</style>
