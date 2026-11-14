<!--
@module app:views/features/data-platform/structured-config/data-dictionary/ui/data-dictionary-list-page
职责：保留原生导航URL的字典方案目录，在同一正式宿主内承载独立设计与数据工作区。
边界：列表绑定正式DataView，选中值来自视图；不复制行数组，不合并设计与数据编辑，也不给隐藏子页伪造导航身份。
AI用途：恢复专题目录时复用正式数据空间和标准组件，分别组织设计和用户数据流程。
-->
<template>
  <RendererSection class="dictionary-catalog-page" title="数据字典" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取字典目录…' : ''" :error="error">
    <template v-if="ready" #header-actions>
      <RendererButton label="新增字典" button-type="primary" icon="Plus" :data-view-key="catalogKey" perm-action="create"
        :disabled="loading || workspaceDirty" @click="createDictionary" />
      <RendererButton label="方案设计" icon="Edit" :disabled="!selected || loading || workspaceDirty" @click="openSelected" />
      <RendererButton label="打开数据维护" icon="List" :disabled="!selected || loading || workspaceDirty" @click="openData" />
      <RendererButton label="刷新" icon="Refresh" :disabled="loading || workspaceDirty" @click="refresh" />
    </template>
    <template v-if="ready">
      <DisplayAlert v-if="hasUnresolvedCreator" alert-type="warning" :closable="false" :show-icon="true"
        title="部分创建人在当前可读用户目录中未解析，保留原始标识。" />
      <div :inert="workspaceDirty">
        <RendererTable :data-view-key="catalogKey" :children="fields" :filter="filter" :stripe="true" :border="true"
          :highlight-current-row="true" :on-row-click="choose" :show-data-view-meta="false" />
      </div>
    </template>
    <RendererDialog :model-value="!!editingId && workspaceKind === 'design'" title="字典方案设计" width="min(1100px, 94vw)"
      :close-disabled="workspaceDirty" @update:model-value="close">
      <DictionarySetting v-if="editingId && workspaceKind === 'design'" :key="`${workspaceKind}:${editingId}`" :dictionary-id="editingId"
        :application-scenario-id="scenarioId" :create="creating"
        @pending="editorPending = $event" @saved="refresh" @deleted="deleted" @cancelled="cancelled" />
      <template #footer>
        <RendererButton label="关闭" :disabled="workspaceDirty" @click="close" />
      </template>
    </RendererDialog>
    <DictionaryData ref="dataWorkspace" v-bind="workspaceKind === 'data' ? {dictionaryId: editingId} : {}"
      :open="!!editingId && workspaceKind === 'data'" @pending="editorPending = $event" @close="close" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {useRoute} from 'vue-router'
import {NativePageRuntimeSession, useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, type DataView, type DataRow, type SparkNode} from '@spark-appworks/spark-data'
import * as SparkComponent from '@spark-appworks/spark-component'
import type {RFilterProps} from '@spark-appworks/spark-component'
import {LowcodeDictionary} from '@/lowcode/resources/structured-config/dictionary/resource'
import DictionarySetting from './dictionary-setting.vue'
import DictionaryData from './dictionary-data-page.vue'

const {PAGE_RUNTIME, RendererSection, RendererTable, RendererButton, RendererDialog, DisplayAlert, useSparkComponent, consumeRequiredPageService} = SparkComponent
const route = useRoute()
const {sparkProvide, sparkRemove, sparkConsume} = useSparkComponent({type: 'data-dictionary-list-page'})
consumeRequiredPageService(sparkConsume, 'data-dictionary-list-page')
const session = new NativePageRuntimeSession({
  provide: current => sparkProvide(PAGE_RUNTIME, current),
  remove: () => sparkRemove(PAGE_RUNTIME),
})
const view = shallowRef<DataView>(), loading = ref(false), ready = ref(false), error = ref(''), revision = ref(0)
const editingId = ref(''), creating = ref(false), editorPending = ref(false)
const dataWorkspace = ref<{releaseClean(): void; readonly isDirty: boolean}>()
const workspaceDirty = computed(() => editorPending.value || dataWorkspace.value?.isDirty === true)
const workspaceKind = ref<'design' | 'data'>('design')
let unsubscribe: (() => void) | undefined, generation = 0, active = true
const selected = computed(() => {
  revision.value
  const values = view.value?.getSelectedValues() ?? []
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : ''
})
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const catalogKey = computed(() => buildDataViewKey('_Base_DictType', 'default', scenarioId.value))
const applicationsKey = computed(() => buildDataViewKey('Base_AppSystemList', 'default', scenarioId.value))
const hasUnresolvedCreator = computed(() => {
  revision.value
  const catalog = view.value
  const users = session.runtime?.getDataSet(scenarioId.value)?.getView('Base_UserInfo', 'default')
  if (!catalog || !users) return false
  const readableIds = new Set(users.rows.filter(row => users.fieldAccess(row, 'rowid').read === 'visible'
    && users.fieldAccess(row, 'UserName').read === 'visible').map(row => row['rowid']))
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
function hasWorkspaceDirty(): boolean {return editorPending.value || dataWorkspace.value?.isDirty === true}
useSystemPageDirtySource({get isDirty() {return hasWorkspaceDirty()}})
function choose(row: DataRow): void {view.value?.setSelectedRows([row])}
function prepareDataWorkspaceSwitch(): boolean {
  if (hasWorkspaceDirty()) return false
  if (workspaceKind.value !== 'data') return true
  try {dataWorkspace.value?.releaseClean(); return true}
  catch {return false}
}
function openSelected(): void {
  if (selected.value && prepareDataWorkspaceSwitch()) {workspaceKind.value = 'design'; creating.value = false; editingId.value = selected.value}
}
function openData(): void {
  if (workspaceKind.value === 'data' && editingId.value === selected.value) return
  if (selected.value && prepareDataWorkspaceSwitch()) {workspaceKind.value = 'data'; creating.value = false; editingId.value = selected.value}
}
function createDictionary(): void {
  if (!prepareDataWorkspaceSwitch()) return
  workspaceKind.value = 'design'; creating.value = true; editingId.value = crypto.randomUUID().replaceAll('-', '').toUpperCase()
}
function close(): void {
  if (hasWorkspaceDirty()) return
  if (workspaceKind.value === 'data') {
    try {dataWorkspace.value?.releaseClean()}
    catch {return}
  }
  editingId.value = ''; creating.value = false
}
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
  session.dispose()
  try {
    if (!id) throw new Error('字典管理入口缺少导航绑定的数据空间ID')
    const dataSet = await LowcodeDictionary.loadCatalog(id)
    if (!active || own !== generation) {dataSet.destroy(); return}
    const current = session.acquire({pageId: 'data-dictionary-list-page', scenarioIds: [id], targetId: id,
      loadScenario: async () => dataSet})
    await current.load()
    if (!active || own !== generation || !session.isCurrent(current)) return
    view.value = dataSet.getView('_Base_DictType', 'default')
    unsubscribe = dataSet.onAnyViewChange({selectedRowsChanged: () => revision.value++, rowsChanged: () => revision.value++,
      requestStateChanged: () => revision.value++})
    if (active && own === generation && session.isCurrent(current)) ready.value = true
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); session.dispose()})
</script>

<style scoped>
.dictionary-catalog-page {padding: 8px}
</style>
