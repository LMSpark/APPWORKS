<!--
@module app:views/app/dev-system/DevFileEditor
职责：提供 DevSystem 的 DevFileEditor 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑配置调试、节点编辑、预览或开发态状态管理。
边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/DevFileEditor。
-->
<template>
  <div class="dev-file-editor">
    <template v-if="state.activePageId.value">
      <div class="file-header">
        <div class="file-header__meta">
          <span class="file-page-id"><NavIcon name="Tickets" :size="14" /> {{ state.activePageId.value }}</span>
        </div>
        <div class="file-header__actions">
          <SparkComponent.RendererButton label="重新加载" icon="Refresh" button-size="small" :disabled="!state.activePageId.value" @click="refreshFile" />
          <SparkComponent.RendererButton :label="fileEditor.isUnconfirmed.value ? '核验原提交' : '保存'" icon="DocumentChecked" button-type="primary" button-size="small" :disabled="ruleEditing || !fileEditor.isDirty.value && !fileEditor.isUnconfirmed.value" :loading="state.pageIoBusy.value" @click="saveFile" />
          <span class="action-divider" />
          <SparkComponent.RendererButton
            label="版本"
            icon="Clock"
            button-size="small"
            :button-type="showVersionPanel ? 'primary' : 'default'"
            :disabled="!state.activePageId.value"
            @click="toggleVersionPanel"
          />
        </div>
      </div>

      <SparkComponent.RendererTabs v-if="showTabs" v-model="localActiveFile" class="file-tab-bar">
        <SparkComponent.RendererTabPane v-for="(f,index) in props.state.pageFileNames" :key="f" :name="f" :label="`${fileEditor.isFileDirty(f) ? '● ' : ''}${f}`" :index="index" />
      </SparkComponent.RendererTabs>

      <div class="editor-body" v-loading="!fileEditor.isReady.value || fileDataViewLoading">
        <div class="editor-area">
          <SparkComponent.RendererForm
            v-if="resolvedActiveFile === 'rule.json'"
            v-bind="fileViewKey ? {dataViewKey:fileViewKey} : {}"
            :auto-columns="false"
            :show-data-view-meta="false"
            context-data-member="currentRow"
            class="code-input code-input--json"
          >
            <SparkComponent.FieldJson v-if="fileViewKey" :data-view-key="fileViewKey" data-member="currentRow" data-field="text" label="页面规则" mode="tree" :schema="RULE_JSON_SCHEMA" :tree-policy="rulePolicy" height="100%" @update:model-value="stageFile" @editing-change="ruleEditing=$event" />
            <SparkComponent.DisplayAlert v-else-if="fileViewError" title="文件 DataView 加载失败" :description="fileViewError" alert-type="error" />
            <SparkComponent.DisplayAlert v-else title="正在载入文件 DataView…" alert-type="info" />
          </SparkComponent.RendererForm>
          <SparkComponent.RendererForm
            v-else-if="isCodeFile(resolvedActiveFile)"
            v-bind="fileViewKey ? {dataViewKey:fileViewKey} : {}"
            :auto-columns="false"
            :show-data-view-meta="false"
            context-data-member="currentRow"
            class="code-input code-input--code"
          >
            <SparkComponent.FieldCodeEditor v-if="fileViewKey" :data-view-key="fileViewKey" data-member="currentRow" data-field="text" :label="resolvedActiveFile" :language="resolveCodeLanguage(resolvedActiveFile)" height="100%" @update:model-value="stageFile" />
            <SparkComponent.DisplayAlert v-else-if="fileViewError" title="文件 DataView 加载失败" :description="fileViewError" alert-type="error" />
            <SparkComponent.DisplayAlert v-else title="正在载入文件 DataView…" alert-type="info" />
          </SparkComponent.RendererForm>
          <SparkComponent.DisplayAlert v-else title="不支持的工具文件类型" :description="fileViewError || `没有可供 ${resolvedActiveFile} 使用的文件 DataView`" alert-type="error" />
        </div>

        <!-- ── 版本侧栏（内联） ── -->
        <transition name="slide-version">
          <div v-if="showVersionPanel" class="version-side">
            <div class="vs-header">
              <span class="vs-title">版本历史</span>
              <SparkComponent.RendererButton label="存档" icon="Plus" button-type="primary" button-size="small" :disabled="versionBusy" :loading="creatingVersion" @click="createVersion" />
            </div>
            <div class="vs-file">{{ resolvedActiveFile }}</div>
            <div v-loading="remoteVersionLoading" class="vs-list">
              <p v-if="remoteVersionLoading" role="status">正在读取版本…</p>
              <p v-else-if="versionQueryError" role="alert">读取版本失败：{{ versionQueryError }}</p>
              <SparkComponent.RendererTable v-else-if="versionQueryLoaded && versionRowCount > 0" :data-view-key="versionViewKey" :auto-columns="false"
                :show-data-view-meta="false" :show-selection-summary="false" :show-aggregate-summary="false"
                :show-pagination="false" :actions="versionActions">
                <SparkComponent.FieldText data-member="currentRow" data-field="version" label="版本" readonly />
                <SparkComponent.FieldText data-member="currentRow" data-field="lastModified" label="更新时间" readonly :display-formatter="formatVersionTime" />
              </SparkComponent.RendererTable>
              <SparkComponent.DisplayEmpty v-else-if="versionQueryLoaded" description="暂无版本" />
            </div>
          </div>
        </transition>
      </div>
    </template>
    <SparkComponent.DisplayEmpty v-else description="请从左侧树中选择一个配置页面开始编辑" class="empty-hint" />
  </div>
</template>

<script setup lang="ts">
import { computed,onBeforeUnmount,ref,shallowRef,watch } from 'vue'
import * as SparkComponent from '@spark-appworks/spark-component'
import type { RToolbarProps } from '@spark-appworks/spark-component'
import type {DataView} from '@spark-appworks/spark-data'
import { buildDataViewKey } from '@spark-appworks/spark-data'
import { LOWCODE_APPLICATION_CATALOG_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import { createRuleJsonSchema, createRuleTreePolicy } from '@/services/project-model-artifacts'
import { useDevFileEditor } from './composables/useDevFileEditor'
import type { DevState } from './useDevState'
import type { DataRow } from '@spark-appworks/spark-data'
import type { PageToolFileName } from '@spark-appworks/spark-project-model'
import NavIcon from '@/components/NavIcon.vue'

const rulePolicy = createRuleTreePolicy()
const RULE_JSON_SCHEMA = createRuleJsonSchema()
const {sparkProvide, sparkRemove} = SparkComponent.useSparkComponent({type: 'dev-file-editor'})

const props = withDefaults(defineProps<{
  state: DevState
  activeFile?: PageToolFileName
  showTabs?: boolean
}>(), {
  showTabs: true,
})

const emit = defineEmits<{
  (e: 'active-file-change', file: PageToolFileName): void
}>()

const localActiveFile = ref<PageToolFileName>('rule.json')
const showVersionPanel = ref(false)
const remoteVersionLoading = ref(false)
const versionQueryError = ref('')
const versionQueryLoaded = ref(false)
const versionRowCount = ref(0)
const restoringVersion = ref<number | null>(null)
const creatingVersion = ref(false)
const versionBusy = computed(() => creatingVersion.value || restoringVersion.value !== null || props.state.pageIoBusy.value)
let versionRevision = 0
let disposed = false
onBeforeUnmount(() => {fileDataView.value=undefined;disposed = true; versionRevision++; fileViewRevision++; sparkRemove(SparkComponent.PAGE_RUNTIME) })
const resolvedActiveFile = computed<PageToolFileName>(() => props.activeFile ?? localActiveFile.value)
const showTabs = computed(() => props.showTabs)
const fileEditor = useDevFileEditor(props.state, resolvedActiveFile)
const fileDataView=shallowRef<DataView>()
const fileDataViewLoading=ref(false)
const fileViewKey=computed(()=>{const view=fileDataView.value;const dataSet=view?.dataSet;return view&&dataSet?buildDataViewKey(view.tableName,view.viewId,dataSet.scenarioId):undefined})
const ruleEditing=ref(false)
const fileViewError=ref('')
let fileViewRevision=0
const project = computed(() => props.state.project)
const versionViewKey = buildDataViewKey('ProjectToolVersion', 'default', LOWCODE_APPLICATION_CATALOG_FORM_KEY)
const versionActions = computed<RToolbarProps>(() => ({children: [{type: 'r-button', props: {
  label: '恢复', disabled: versionBusy.value || fileEditor.isDirty.value || fileEditor.isUnconfirmed.value,
  onClick: (row: DataRow) => restoreVersion(row),
}}]}))

watch(() => props.state.blueprintPageRuntime.value, runtime => {
  if (runtime?.isLoaded) sparkProvide(SparkComponent.PAGE_RUNTIME, runtime)
  else sparkRemove(SparkComponent.PAGE_RUNTIME)
}, {immediate: true})

function alignActivePage(): boolean {
  const pageId = props.state.activePageId.value.trim()
  if (!pageId) return false
  if (project.value.getActivePage()?.pageId !== pageId) {
    project.value.setActivePage(pageId)
  }
  return true
}

watch(() => props.activeFile, (nextFile) => {
  if (nextFile && nextFile !== localActiveFile.value) {
    localActiveFile.value = nextFile
  }
}, { immediate: true })

watch(resolvedActiveFile, (nextFile) => {
  emit('active-file-change', nextFile)
}, { immediate: true })

watch([resolvedActiveFile, () => props.state.activePageId.value], () => {
  versionRevision++
  remoteVersionLoading.value = false
  versionQueryError.value = ''
  versionQueryLoaded.value = false
  versionRowCount.value = 0
  showVersionPanel.value = false
})

watch([()=>props.state.activePageId.value,()=>fileEditor.isReady.value,resolvedActiveFile],async([pageId,ready,fileName])=>{
  const current=++fileViewRevision
  fileDataView.value=undefined;fileViewError.value='';ruleEditing.value=false
  if(!pageId||!ready)return
  fileDataViewLoading.value=true
  try{
    const view=await props.state.loadPageToolFileDataView({pageId,fileName})
    if(current===fileViewRevision&&props.state.activePageId.value===pageId&&resolvedActiveFile.value===fileName)fileDataView.value=view
  }catch(error){if(current===fileViewRevision)fileViewError.value=error instanceof Error?error.message:String(error)}
  finally{if(current===fileViewRevision)fileDataViewLoading.value=false}
},{immediate:true})

function isCodeFile(name: string): boolean {
  return name.endsWith('.js') || name.endsWith('.css')
}

function resolveCodeLanguage(name: string): 'javascript' | 'css' {
  return name.endsWith('.css') ? 'css' : 'javascript'
}

function saveFile() {
  void fileEditor.save().catch(() => undefined)
}

async function refreshFile() {
  const pageId=props.state.activePageId.value
  const fileName=resolvedActiveFile.value
  const revision=fileViewRevision
  const isCurrentTarget=()=>revision===fileViewRevision&&props.state.activePageId.value===pageId&&resolvedActiveFile.value===fileName
  if(pageId&&fileDataView.value){
    const view=fileDataView.value,row=view.rows.find(candidate=>candidate['pageId']===pageId&&candidate['fileName']===fileName),id=row&&view.getPkKey(row)
    if(view.hasUnconfirmedSave){fileViewError.value='原文件提交仍待核验，暂不能取消';return}
    if(id!==undefined&&view.dirtyTracking.hasPendingChanges(id))view.discardPendingChanges([id])
  }
  try{
    await fileEditor.refresh()
    if(pageId&&isCurrentTarget()){
      fileDataView.value=undefined
      const refreshedView=await props.state.loadPageToolFileDataView({pageId,fileName,discardPending:true})
      if(isCurrentTarget())fileDataView.value=refreshedView
    }
  }catch(error){if(isCurrentTarget())fileViewError.value=error instanceof Error?error.message:String(error)}
}

function stageFile(value:string):void{
  const pageId=props.state.activePageId.value
  if(!pageId)return
  try{props.state.stagePageToolFileDataView({pageId,fileName:resolvedActiveFile.value,text:value});fileViewError.value=''}
  catch(error){fileViewError.value=error instanceof Error?error.message:String(error)}
}

async function loadVersions() {
  if (!alignActivePage()) return
  const revision = ++versionRevision
  const pageId = props.state.activePageId.value
  const fileName = resolvedActiveFile.value
  remoteVersionLoading.value = true
  versionQueryError.value = ''
  versionQueryLoaded.value = false
  versionRowCount.value = 0
  try {
    await props.state.loadBlueprintWorkspaceDataView()
    const runtime = props.state.blueprintPageRuntime.value
    const dataSet = runtime?.getDataSet(LOWCODE_APPLICATION_CATALOG_FORM_KEY)
    const view = dataSet?.getView('ProjectToolVersion', 'default')
    if (!runtime?.isLoaded || runtime !== props.state.blueprintPageRuntime.value || !dataSet || !view
      || dataSet.scenarioId !== LOWCODE_APPLICATION_CATALOG_FORM_KEY) throw new Error('正式工具版本 DataView 未装载')
    view.queryContext = {pageId, fileName}
    await view.refresh()
    if (view.loadingError) throw view.loadingError
    if (disposed || revision !== versionRevision || !showVersionPanel.value || pageId !== props.state.activePageId.value
      || fileName !== resolvedActiveFile.value || runtime !== props.state.blueprintPageRuntime.value) return
    sparkProvide(SparkComponent.PAGE_RUNTIME, runtime)
    versionRowCount.value = view.rows.length
    versionQueryLoaded.value = true
  } catch (e) {
    if (disposed || revision !== versionRevision) return
    versionQueryError.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (!disposed && revision === versionRevision) remoteVersionLoading.value = false
  }
}

function toggleVersionPanel() {
  showVersionPanel.value = !showVersionPanel.value
  versionRevision++
  remoteVersionLoading.value = false
  versionQueryError.value = ''
  versionQueryLoaded.value = false
  versionRowCount.value = 0
  if (showVersionPanel.value) {
    void loadVersions()
  }
}

async function restoreVersion(row: DataRow) {
  if (versionBusy.value || fileEditor.isDirty.value || fileEditor.isUnconfirmed.value) return
  const pageId = props.state.activePageId.value
  const projectId = props.state.projectId
  const fileName = resolvedActiveFile.value
  const version=Number(row['version'])
  if (!pageId || !alignActivePage()) return
  if(row['pageId']!==pageId||row['fileName']!==fileName||!Number.isSafeInteger(version)||version<0
    ||row['snapshotFileName']!==`${version}__${fileName}`
    ||row['versionKey']!==JSON.stringify([pageId,fileName,version]))return
  const selectedNode=props.state.selectedNode.value,nodeId=selectedNode?.nodeId,navigationTarget=selectedNode?.navigation?.target
  const customPath=`${projectId}/${pageId}`
  const isCurrentTarget=()=>!disposed&&pageId===props.state.activePageId.value&&projectId===props.state.projectId
    &&fileName===resolvedActiveFile.value&&nodeId===props.state.selectedNode.value?.nodeId
    &&navigationTarget===props.state.selectedNode.value?.navigation?.target
  const assertCurrent=()=>{
    const currentNode=props.state.selectedNode.value
    if(!isCurrentTarget()
      ||nodeId!==currentNode?.nodeId||navigationTarget!==currentNode?.navigation?.target)throw new Error('恢复期间编辑目标已切换')
  }
  restoringVersion.value = version
  try {
    const restoredText=await props.state.restorePageToolVersion({projectId,pageId,customPath,fileName,version,assertCurrent})
    assertCurrent()
    if(fileEditor.text.value!==restoredText)throw new Error('恢复命令已确认，但当前工具文件尚未同步')
    props.state.addStatus(`页面 ${pageId} 已将 ${fileName} 快照 v${version} 恢复为工作文件`, 'success')
    if (!disposed && pageId === props.state.activePageId.value && fileName === resolvedActiveFile.value && showVersionPanel.value) await loadVersions()
  } catch (e) {
    if(isCurrentTarget())props.state.addStatus(`恢复版本失败: ${String(e)}`, 'error')
  } finally {
    restoringVersion.value = null
  }
}

async function createVersion() {
  if (versionBusy.value) return
  if (!alignActivePage()) return
  const pageId = props.state.activePageId.value
  const projectId = props.state.projectId
  const fileName = resolvedActiveFile.value
  const selectedNode = props.state.selectedNode.value
  const nodeId = selectedNode?.nodeId
  const navigationTarget = selectedNode?.navigation?.target
  creatingVersion.value = true
  try {
    await fileEditor.save()
    const assertCurrent = () => {
      const currentNode = props.state.selectedNode.value
      if (disposed || pageId !== props.state.activePageId.value || projectId !== props.state.projectId
        || fileName !== resolvedActiveFile.value || nodeId !== currentNode?.nodeId
        || navigationTarget !== currentNode?.navigation?.target) throw new Error('快照期间编辑目标已切换')
    }
    assertCurrent()
    if (fileEditor.isFileDirty(fileName)) throw new Error('保存期间文件已修改，请先保存最新修改')
    const view=await props.state.loadPageToolFileDataView({pageId,fileName})
    assertCurrent()
    const receipt=await view.createSourceVersion()
    assertCurrent()
    if(receipt.state!=='confirmed')throw new Error('来源未确认快照回执')
    view.acknowledgeSourceHistoryAttempt()
    props.state.addStatus(`${fileName} 已创建新版本快照`, 'success')
    if (!disposed && pageId === props.state.activePageId.value && fileName === resolvedActiveFile.value && showVersionPanel.value) await loadVersions()
  } catch (e) {
    props.state.addStatus(`创建版本快照失败: ${String(e)}`, 'error')
  } finally {
    creatingVersion.value = false
  }
}

function formatVersionTime(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  try {
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return '-'
    const pad = (part: number) => String(part).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  } catch {
    return '-'
  }
}

</script>

<style scoped>
.dev-file-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

/* ── Header ─────────────────────────────────────── */
.file-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}

.file-header__meta,
.file-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.file-header__meta {
  min-width: 0;
  flex: 1;
}

.file-header__actions {
  justify-content: flex-end;
  gap: 6px;
}

.action-group {
  display: inline-flex;
}

.action-divider {
  display: inline-block;
  width: 1px;
  height: 20px;
  background: var(--el-border-color-lighter);
  margin: 0 2px;
  flex-shrink: 0;
}

.file-page-id {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-primary);
}

/* ── Tabs ────────────────────────────────────────── */
.file-tab-bar {
  padding: 0 12px;
  flex-shrink: 0;
}

.file-tab-bar :deep(.el-tabs__header) {
  margin: 0;
}

.file-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* ── Editor Body (flex row) ──────────────────── */
.editor-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* ── Editor ────────────────────────────────── */
.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  padding: 8px 12px 12px;
}



.code-input {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.code-input--json,
.code-input--code {
  min-height: 0;
}



.code-input :deep(textarea) {
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.file-dirty {
  color: var(--el-color-warning);
  font-weight: 600;
}

.file-dirty::after {
  content: ' \2022';
}

/* ── Version Side Panel ───────────────────── */
.version-side {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  overflow: hidden;
}

.vs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
  flex-shrink: 0;
}

.vs-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.vs-file {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  padding: 4px 12px;
  flex-shrink: 0;
}

.vs-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 8px;
}

.vs-empty {
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  padding: 24px 0;
}

.vs-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 4px;
  font-size: 12px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}

.vs-time {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.vs-spacer {
  flex: 1;
}

.version-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

/* slide transition */
.slide-version-enter-active,
.slide-version-leave-active {
  transition: width 0.25s ease, opacity 0.25s ease;
  overflow: hidden;
}

.slide-version-enter-from,
.slide-version-leave-to {
  width: 0;
  opacity: 0;
}

.empty-hint {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
