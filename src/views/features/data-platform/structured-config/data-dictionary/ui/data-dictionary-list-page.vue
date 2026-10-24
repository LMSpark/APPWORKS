<!--
@module app:views/features/data-platform/structured-config/data-dictionary/ui/data-dictionary-list-page
职责：保留原生导航URL的字典方案目录，在同一正式宿主内承载独立设计与数据工作区。
边界：列表绑定正式DataView，选中值来自视图；不复制行数组，不合并设计与数据编辑，也不给隐藏子页伪造导航身份。
AI用途：恢复专题目录时复用正式数据空间和标准组件，分别组织设计和用户数据流程。
-->
<template>
  <section class="dictionary-catalog-page">
    <header>
      <h1>数据字典</h1>
      <p>字典方案设计目录，配置与业务数据分别维护。</p>
    </header>
    <p v-if="loading" role="status">正在读取字典目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="ready">
      <p v-if="hasUnresolvedCreator" role="status">部分创建人在当前可读用户目录中未解析，保留原始标识。</p>
      <div :inert="editorPending">
        <RendererTable :data-view-key="catalogKey" :children="fields" :toolbar="toolbar" :filter="filter"
          :stripe="true" :highlight-current-row="true" :on-row-click="choose" :show-data-view-meta="false" />
      </div>
    </template>
    <RendererDialog :model-value="!!editingId" :title="workspaceKind === 'design' ? '字典方案设计' : '字典数据维护'" width="min(1100px, 94vw)"
      :close-disabled="editorPending" @update:model-value="close">
      <DictionarySetting v-if="editingId && workspaceKind === 'design'" :key="`${workspaceKind}:${editingId}`" :dictionary-id="editingId"
        :application-scenario-id="scenarioId" :create="creating"
        @pending="editorPending = $event" @saved="refresh" @deleted="deleted" @cancelled="cancelled" />
      <DictionaryData v-else-if="editingId && workspaceKind === 'data'" :key="`${workspaceKind}:${editingId}`" :dictionary-id="editingId"
        @pending="editorPending = $event" />
      <template #footer>
        <RendererButton label="关闭" :disabled="editorPending" @click="close" />
      </template>
    </RendererDialog>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {useRoute} from 'vue-router'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, type DataView, type DataRow, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererTable, RendererButton, RendererDialog, useSparkComponent, type RFilterProps, type RToolbarProps} from '@spark-appworks/spark-component'
import {LowcodeDictionary} from '@/lowcode/resources/dictionary/lowcode-dictionary'
import DictionarySetting from './dictionary-setting.vue'
import DictionaryData from './dictionary-data-page.vue'

const route = useRoute()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'data-dictionary-list-page'})
const view = shallowRef<DataView>(), loading = ref(false), ready = ref(false), error = ref(''), revision = ref(0)
const editingId = ref(''), creating = ref(false), editorPending = ref(false)
const workspaceKind = ref<'design' | 'data'>('design')
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true
const selected = computed(() => {
  revision.value
  const values = view.value?.getSelectedValues() ?? []
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : ''
})
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const catalogKey = computed(() => buildDataViewKey('_Base_DictType', 'default', scenarioId.value))
const applicationsKey = computed(() => buildDataViewKey('Base_AppSystemList', 'default', scenarioId.value))
const toolbar = computed<RToolbarProps>(() => ({wrap: true, children: [
  {type: 'r-button', props: {label: '新增字典', permAction: 'create', disabled: loading.value || editorPending.value, onClick: createDictionary}},
  {type: 'r-button', props: {label: '方案设计', disabled: !selected.value || loading.value || editorPending.value, onClick: openSelected}},
  {type: 'r-button', props: {label: '打开数据维护', disabled: !selected.value || loading.value || editorPending.value, onClick: openData}},
  {type: 'r-button', props: {label: '刷新', action: 'refresh'}},
]}))
const hasUnresolvedCreator = computed(() => {
  revision.value
  const catalog = view.value
  const users = runtime?.getDataSet(scenarioId.value)?.getView('Base_UserInfo', 'default')
  if (!catalog || !users) return false
  const readableIds = new Set(users.rows.filter(row => users.fieldAccess(row, 'ROWID').read === 'visible'
    && users.fieldAccess(row, 'UserName').read === 'visible').map(row => row['ROWID']))
  return catalog.rows.some(row => catalog.fieldAccess(row, 'createuser').read === 'visible'
    && row['createuser'] !== null && row['createuser'] !== undefined && row['createuser'] !== ''
    && !readableIds.has(row['createuser']))
})
const fields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'TypeName', label: '字典名称', width: 230}},
  {type: 'r-select', props: {field: 'AppId', label: '所属应用', width: 180, optionDataViewKey: applicationsKey.value,
    optionLabelField: 'AppDesc', optionValueField: 'rowid'}},
  {type: 'r-text', props: {field: 'functiondesc', label: '功能描述', width: 320}},
  {type: 'r-tree-select', props: {field: 'StructureTypeID', label: '领域分类', width: 180,
    optionDataViewKey: buildDataViewKey('Base_StructureType', 'default', scenarioId.value)}},
  {type: 'r-select', props: {field: 'createuser', label: '创建人', width: 150,
    optionDataViewKey: buildDataViewKey('Base_UserInfo', 'default', scenarioId.value)}},
  {type: 'r-text', props: {field: 'crttime', label: '创建时间', width: 180}},
])
const filter = computed<RFilterProps>(() => ({autoFitMinWidth: '230px', children: [
  {type: 'r-select', props: {field: 'AppId', label: '所属应用', clearable: true, filterable: true,
    optionDataViewKey: applicationsKey.value, optionLabelField: 'AppDesc', optionValueField: 'rowid'}},
  {type: 'r-tree-select', props: {field: 'StructureTypeID', label: '领域分类', checkStrictly: true, filterable: true,
    optionDataViewKey: buildDataViewKey('Base_StructureType', 'default', scenarioId.value)}},
  {type: 'r-text', props: {field: 'TypeName', label: '字典名称', placeholder: '按字典名称筛选'}},
  {type: 'r-text', props: {field: 'functiondesc', label: '功能描述', placeholder: '按功能描述筛选'}},
  {type: 'r-text', props: {field: 'createuser', label: '创建人', placeholder: '按姓名片段筛选'}},
]}))
useSystemPageDirtySource({get isDirty() {return editorPending.value}})
function choose(row: DataRow): void {view.value?.setSelectedRows([row])}
function openSelected(): void {
  if (selected.value && !editorPending.value) {workspaceKind.value = 'design'; creating.value = false; editingId.value = selected.value}
}
function openData(): void {
  if (selected.value && !editorPending.value) {workspaceKind.value = 'data'; creating.value = false; editingId.value = selected.value}
}
function createDictionary(): void {
  if (editorPending.value) return
  workspaceKind.value = 'design'; creating.value = true; editingId.value = crypto.randomUUID().replaceAll('-', '').toUpperCase()
}
function close(): void {if (!editorPending.value) {editingId.value = ''; creating.value = false}}
function cancelled(): void {editorPending.value = false; close()}
async function refresh(): Promise<void> {
  view.value?.setSelectedRows([])
  await view.value?.refresh()
  error.value = view.value?.loadingError?.message ?? ''
}
async function deleted(): Promise<void> {editorPending.value = false; editingId.value = ''; await refresh()}
watch(scenarioId, async id => {
  const own = ++generation
  ready.value = false; loading.value = true; error.value = ''; editingId.value = ''
  unsubscribe?.(); view.value = undefined
  sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined
  try {
    if (!id) throw new Error('字典管理入口缺少导航绑定的数据空间ID')
    const dataSet = await LowcodeDictionary.loadCatalog(id)
    if (!active || own !== generation) {dataSet.destroy(); return}
    const current = new PageRuntime({pageId: 'data-dictionary-list-page', scenarioIds: [id], loadScenario: async () => dataSet})
    runtime = current; await current.load()
    if (!active || own !== generation) {current.dispose(); return}
    view.value = dataSet.getView('_Base_DictType', 'default')
    unsubscribe = dataSet.onAnyViewChange({selectedRowsChanged: () => revision.value++, rowsChanged: () => revision.value++,
      requestStateChanged: () => revision.value++})
    sparkProvide(PAGE_RUNTIME, current); ready.value = true
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
</script>

<style scoped>
.dictionary-catalog-page { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; gap: 16px; padding: 24px; color: var(--el-text-color-primary); }
.dictionary-catalog-page > * { min-width: 0; }
.dictionary-catalog-page header { display: grid; gap: 4px; }
.dictionary-catalog-page h1 { margin: 0; font-size: 1.25rem; font-weight: 600; }
.dictionary-catalog-page header p { margin: 0; color: var(--el-text-color-secondary); }
</style>
