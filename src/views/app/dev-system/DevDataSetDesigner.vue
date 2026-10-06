<!--
@module app:views/app/dev-system/DevDataSetDesigner
职责：编辑单场景共享视图配置及真实N__pagedata.json历史。
边界：正式模型定义不在配置文件中；缺文件需显式新建，dirty禁止恢复与快照。
AI用途：通过ScenarioViewFile与Workspace编辑、保存、预览并明确恢复场景文件。
-->
<template>
  <div class="scenario-designer">
    <div class="toolbar">
      <strong>场景视图配置</strong>
      <span v-if="state.scenarioViewFile.value">{{ state.scenarioViewFile.value.scenarioId }}</span>
      <el-button v-if="canCreate" :loading="creating" @click="create">按正式模型新建视图草稿</el-button>
      <el-button :disabled="busy || creating || state.pageDataDirty.value || !state.selectedNode.value?.dataSpace?.scenarioId" @click="load">重新加载</el-button>
      <el-button :disabled="busy || !state.scenarioViewFile.value?.canUndo" @click="undo">撤销</el-button>
      <el-button :disabled="busy || !state.scenarioViewFile.value?.canRedo" @click="redo">重做</el-button>
      <el-button type="primary" :disabled="busy || !state.pageDataDirty.value || !!error" @click="save">保存场景视图</el-button>
      <el-button data-test="scene-history" :disabled="busy || !state.scenarioViewFile.value?.isPersisted" @click="openHistory">远端历史</el-button>
      <el-button data-test="scene-snapshot" :disabled="!canVersion" @click="snapshot">创建场景快照</el-button>
    </div>
    <section v-if="historyOpen" class="history">
      <div class="toolbar"><strong>pagedata.json 文件历史</strong><el-button data-test="scene-history-close" @click="closeHistory">关闭历史</el-button></div>
      <p v-if="!versions.length && !busy">暂无远端快照</p>
      <div v-for="version in versions" :key="version.fileName" class="toolbar">
        <span>{{ version.fileName }}</span><span>{{ version.lastModified === null ? '时间未知' : new Date(version.lastModified).toLocaleString() }}</span>
        <el-button data-test="scene-preview" :disabled="!canVersion" @click="preview(version.version)">预览</el-button>
      </div>
      <template v-if="previewText !== null">
        <p>预览 {{ previewVersion }}__pagedata.json；恢复将写入场景工作文件。</p>
        <el-input :model-value="previewText" type="textarea" readonly :autosize="{minRows:8,maxRows:20}" />
        <el-button data-test="scene-restore" :disabled="!canVersion" @click="restore">确认恢复工作文件</el-button>
      </template>
    </section>
    <el-alert v-if="displayError" :title="displayError" type="error" :closable="false" />
    <el-empty v-if="!state.scenarioViewFile.value" description="选择已绑定场景的蓝图节点后加载视图配置" />
    <template v-else>
      <p>正式模型与字段由 SPARK 提供。此文件配置每个模型的命名视图、查询条件和视图级联。</p>
      <el-input :disabled="busy" v-model="text" type="textarea" :autosize="{minRows:20,maxRows:45}" @input="edit" />
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import type { PageToolFileVersionSummary } from '@spark-appworks/spark-project-model'
import type { DevState } from './useDevState'
const props=defineProps<{state:DevState}>()
const text=ref('')
const error=ref('')
const creating=ref(false)
const busy=ref(false)
const historyOpen=ref(false)
const versions=ref<PageToolFileVersionSummary[]>([])
const previewText=ref<string|null>(null)
const previewVersion=ref<number|null>(null)
let request=0
const canVersion=computed(()=>!busy.value && props.state.scenarioViewFile.value?.isPersisted === true && !props.state.pageDataDirty.value && !error.value)
function closeHistory():void {request++;historyOpen.value=false;versions.value=[];previewText.value=null;previewVersion.value=null;busy.value=false}
watch(()=>[props.state.projectId,props.state.selectedNode.value?.nodeId,props.state.scenarioViewFile.value],closeHistory)
watch(()=>props.state.scenarioViewRevision.value,()=>{previewText.value=null;previewVersion.value=null})
onUnmounted(()=>{request++})
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
async function preview(version:number):Promise<void>{
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
const canCreate=computed(()=>!props.state.scenarioViewFile.value && props.state.pageDataError.value?.includes('SCENARIO_VIEW_FILE_MISSING') === true)
const displayError=computed(()=>error.value || props.state.pageDataError.value || '')
watch(()=>[props.state.scenarioViewFile.value,props.state.scenarioViewRevision.value],()=>{text.value=props.state.scenarioViewFile.value?.getText() ?? '';error.value=''}, {immediate:true})
async function create():Promise<void>{if(creating.value)return;creating.value=true;try{await props.state.createSelectedScenarioViews();error.value=''}catch(cause){error.value=cause instanceof Error ? cause.message : String(cause)}finally{creating.value=false}}
function edit():void { try {props.state.writeScenarioViewText(text.value);error.value=''}catch(cause){error.value=cause instanceof Error ? cause.message : String(cause)} }
async function load():Promise<void>{
  if(busy.value)return
  const id=++request;busy.value=true
  try{await props.state.loadSelectedScenarioViews(true);if(id===request)error.value=''}
  catch(cause){if(id===request)error.value=cause instanceof Error?cause.message:String(cause)}
  finally{if(id===request)busy.value=false}
}
async function save():Promise<void>{
  if(busy.value)return
  const id=++request;busy.value=true
  try{await props.state.saveScenarioViewText();if(id===request)error.value=''}
  catch(cause){if(id===request)error.value=cause instanceof Error?cause.message:String(cause)}
  finally{if(id===request)busy.value=false}
}
function undo():void{if(props.state.scenarioViewFile.value?.undo())props.state.scenarioViewRevision.value++}
function redo():void{if(props.state.scenarioViewFile.value?.redo())props.state.scenarioViewRevision.value++}
</script>
<style scoped>
.scenario-designer {padding:16px;}
.history {border:1px solid var(--el-border-color);padding:12px;margin-bottom:16px;}
.toolbar {display:flex;align-items:center;gap:12px;margin-bottom:16px;}
</style>
