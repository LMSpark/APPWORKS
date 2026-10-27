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
          <el-tooltip content="从服务端重新加载此文件" placement="bottom" :show-after="600">
            <el-button size="small" :disabled="!state.activePageId.value" @click="refreshFile">
              <NavIcon name="Refresh" :size="14" />
            </el-button>
          </el-tooltip>
          <el-tooltip content="保存当前文件到服务端" placement="bottom" :show-after="600">
            <el-button
              type="primary"
              size="small"
              :disabled="!fileEditor.isDirty.value && !fileEditor.isUnconfirmed.value"
              :loading="state.pageIoBusy.value"
              @click="saveFile"
            >
              <NavIcon name="DocumentChecked" :size="14" /> {{ fileEditor.isUnconfirmed.value ? '核验原提交' : '保存' }}
            </el-button>
          </el-tooltip>
          <span class="action-divider" />
          <el-button
            size="small"
            :type="showVersionPanel ? 'primary' : 'default'"
            :disabled="!state.activePageId.value"
            @click="toggleVersionPanel"
          >
            <NavIcon name="Clock" :size="14" /> 版本
          </el-button>
        </div>
      </div>

      <el-tabs v-if="showTabs" v-model="localActiveFile" type="card" class="file-tab-bar">
        <el-tab-pane v-for="f in props.state.pageFileNames" :key="f" :name="f">
          <template #label>
            <span class="file-tab-label" :class="{ 'file-dirty': fileEditor.isFileDirty(f) }">
              <NavIcon :name="fileIcon(f)" :size="13" /> {{ f }}
            </span>
          </template>
        </el-tab-pane>
      </el-tabs>

      <div class="editor-body" v-loading="!fileEditor.isReady.value">
        <div class="editor-area">
          <JsonTreeEditor
            v-if="resolvedActiveFile === 'rule.json'"
            type="json-tree-editor"
            :model-value="fileEditor.text.value"
            :policy="rulePolicy"
            :schema="RULE_JSON_SCHEMA"
            class="code-input code-input--json"
            height="100%"
            @update:model-value="(val: unknown) => state.project.writePageFile({ fileName: 'rule.json', text: String(val) })"
          />
          <SparkCodeEditor
            v-else-if="isCodeFile(resolvedActiveFile)"
            :model-value="fileEditor.text.value"
            :language="resolveCodeLanguage(resolvedActiveFile)"
            readonly
            class="code-input code-input--code"
            height="100%"
          />
          <el-input
            v-else
            :model-value="fileEditor.text.value"
            type="textarea"
            :autosize="{ minRows: 30, maxRows: 60 }"
            readonly
            class="code-input"
          />
        </div>

        <!-- ── 版本侧栏（内联） ── -->
        <transition name="slide-version">
          <div v-if="showVersionPanel" class="version-side">
            <div class="vs-header">
              <span class="vs-title">版本历史</span>
              <el-button size="small" type="primary" :disabled="versionBusy" :loading="creatingVersion" @click="createVersion">
                <NavIcon name="Plus" :size="12" /> 存档
              </el-button>
            </div>
            <div class="vs-file">{{ resolvedActiveFile }}</div>
            <div v-loading="remoteVersionLoading" class="vs-list">
              <p v-if="remoteVersionLoading" role="status">正在读取版本…</p>
              <p v-else-if="versionQueryError" role="alert">读取版本失败：{{ versionQueryError }}</p>
              <RendererTable v-else-if="versionQueryLoaded && versionRowCount > 0" :data-view-key="versionViewKey" :auto-columns="false"
                :show-data-view-meta="false" :show-selection-summary="false" :show-aggregate-summary="false"
                :show-pagination="false" :actions="versionActions">
                <FieldText :data-view-key="versionViewKey" field="version" label="版本" readonly />
                <FieldText :data-view-key="versionViewKey" field="lastModified" label="更新时间" readonly :display-formatter="formatVersionTime" />
              </RendererTable>
              <div v-else-if="versionQueryLoaded" class="vs-empty">暂无版本</div>
            </div>
          </div>
        </transition>
      </div>
    </template>
    <el-empty v-else description="请从左侧树中选择一个配置页面开始编辑" class="empty-hint" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { SparkCodeEditor, JsonTreeEditor, FieldText, PAGE_RUNTIME, RendererTable, useSparkComponent, type RToolbarProps } from '@spark-appworks/spark-component'
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
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'dev-file-editor'})

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
onBeforeUnmount(() => { disposed = true; versionRevision++; sparkRemove(PAGE_RUNTIME) })
const resolvedActiveFile = computed<PageToolFileName>(() => props.activeFile ?? localActiveFile.value)
const showTabs = computed(() => props.showTabs)
const fileEditor = useDevFileEditor(props.state, resolvedActiveFile)
const host = computed(() => props.state.editor)
const project = computed(() => props.state.project)
const versionViewKey = buildDataViewKey('ProjectToolVersion', 'default', LOWCODE_APPLICATION_CATALOG_FORM_KEY)
const versionActions = computed<RToolbarProps>(() => ({children: [{type: 'r-button', props: {
  label: '恢复', disabled: versionBusy.value || fileEditor.isDirty.value || fileEditor.isUnconfirmed.value,
  onClick: (row: DataRow) => restoreVersion(Number(row['version'])),
}}]}))

watch(() => props.state.blueprintPageRuntime.value, runtime => {
  if (runtime?.isLoaded) sparkProvide(PAGE_RUNTIME, runtime)
  else sparkRemove(PAGE_RUNTIME)
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

function isCodeFile(name: string): boolean {
  return name.endsWith('.js') || name.endsWith('.css')
}

function resolveCodeLanguage(name: string): 'javascript' | 'css' {
  return name.endsWith('.css') ? 'css' : 'javascript'
}

function fileIcon(name: string): string {
  if (name === 'rule.json') return 'Crop'
  if (name === 'script.js') return 'Lightning'
  if (name === 'style.css') return 'Brush'
  return 'Document'
}

function saveFile() {
  void fileEditor.save().catch(() => undefined)
}

function refreshFile() {
  void fileEditor.refresh().catch(() => undefined)
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
    sparkProvide(PAGE_RUNTIME, runtime)
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

async function restoreVersion(version: number) {
  if (versionBusy.value || fileEditor.isDirty.value || fileEditor.isUnconfirmed.value) return
  const pageId = props.state.activePageId.value
  const fileName = resolvedActiveFile.value
  if (!pageId || !alignActivePage()) return
  restoringVersion.value = version
  try {
    await host.value.restoreRemotePageVersion(version, fileName)
    props.state.addStatus(`页面 ${pageId} 已将 ${fileName} 快照 v${version} 恢复为工作文件`, 'success')
    if (!disposed && pageId === props.state.activePageId.value && fileName === resolvedActiveFile.value && showVersionPanel.value) await loadVersions()
  } catch (e) {
    props.state.addStatus(`恢复版本失败: ${String(e)}`, 'error')
  } finally {
    restoringVersion.value = null
  }
}

async function createVersion() {
  if (versionBusy.value) return
  if (!alignActivePage()) return
  const pageId = props.state.activePageId.value
  const fileName = resolvedActiveFile.value
  creatingVersion.value = true
  try {
    await fileEditor.save()
    if (disposed || pageId !== props.state.activePageId.value || fileName !== resolvedActiveFile.value) throw new Error('保存期间编辑目标已切换，未创建快照')
    if (fileEditor.isFileDirty(fileName)) throw new Error('保存期间文件已修改，请先保存最新修改')
    await host.value.createRemotePageVersion(fileName)
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
