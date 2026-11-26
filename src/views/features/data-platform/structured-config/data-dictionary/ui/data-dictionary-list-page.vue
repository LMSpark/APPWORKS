<!--
@module app:views/features/data-platform/structured-config/data-dictionary/ui/data-dictionary-list-page
职责：保留原生导航URL的字典方案目录，在同一正式宿主内承载独立设计与数据工作区。
边界：列表绑定正式DataView，选中值来自视图；不复制行数组，不合并设计与数据编辑，也不给隐藏子页伪造导航身份。
AI用途：恢复专题目录时复用正式数据空间和标准组件，分别组织设计和用户数据流程。
-->
<template>
  <div>
    <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :route-snapshot="routeSnapshot" :host="host" :auto-load="false" />
    <RendererSection v-else title="数据字典" :bordered="false" :status="loading ? '正在读取字典目录…' : ''" :error="error" />
    <RendererDialog :model-value="!!editingId && workspaceKind === 'design'" title="字典方案设计" width="min(1100px, 94vw)"
      :close-disabled="workspaceDirty" @update:model-value="close">
      <DictionarySetting v-if="editingId && workspaceKind === 'design'" :key="`${workspaceKind}:${editingId}`" :dictionary-id="editingId"
        :application-scenario-id="scenarioId" :create="creating"
        @pending="editorPending = $event" @saved="refresh" @cancelled="cancelled" />
      <template #footer>
        <RendererButton label="关闭" :disabled="workspaceDirty" @click="close" />
      </template>
    </RendererDialog>
    <DictionaryData ref="dataWorkspace" v-bind="workspaceKind === 'data' ? {dictionaryId: editingId} : {}"
      :open="!!editingId && workspaceKind === 'data'" @pending="editorPending = $event" @close="close" />
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, toRaw, watch} from 'vue'
import {useRoute} from 'vue-router'
import {NativePageRuntimeSession, useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {isDataRow, type DataView} from '@spark-appworks/spark-data'
import {PageTool} from '@spark-appworks/spark-project-model'
import * as SparkComponent from '@spark-appworks/spark-component'
import {LowcodeDictionary} from '@/platform-adapters/resources/structured-config/dictionary/resource'
import DictionarySetting from './dictionary-setting.vue'
import DictionaryData from './dictionary-data-page.vue'
import rule from './catalog-tool/rule.json?raw'
import script from './catalog-tool/script.js?raw'
import style from './catalog-tool/style.css?raw'

const {PAGE_RUNTIME, RendererSection, RendererButton, RendererDialog, SparkPageRenderer, useSparkComponent, consumeRequiredPageService} = SparkComponent
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
function hasWorkspaceDirty(): boolean {return editorPending.value || dataWorkspace.value?.isDirty === true}
useSystemPageDirtySource({get isDirty() {return hasWorkspaceDirty()}})
const runtime = computed(() => ready.value ? session.runtime : undefined)
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
const host = computed(() => {
  const current = runtime.value
  if (!current) return undefined
  const assertCurrent = () => {
    if (!active || !session.isCurrent(current)) throw new Error('字典目录运行实例已失效')
  }
  return {runtime: current, assertCurrent, async invoke(command: string, input: unknown) {
    assertCurrent()
    if (command === 'dictionary.catalog.connect') return {
      state: () => ({error: error.value, locked: workspaceDirty.value, selected: !!selected.value,
        unresolvedCreator: hasUnresolvedCreator.value}),
    }
    if (hasWorkspaceDirty()) return undefined
    if (command === 'dictionary.catalog.select' && isDataRow(input)) {
      const target = view.value
      const original = toRaw(input)
      if (target?.rows.includes(original)) target.setSelectedRows([original])
    }
    if (command === 'dictionary.catalog.create' && view.value?.addActionState() === 'enabled') createDictionary()
    if (command === 'dictionary.catalog.design') openSelected()
    if (command === 'dictionary.catalog.entries') openData()
    if (command === 'dictionary.catalog.refresh') await refresh()
    return undefined
  }}
})
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
  const target = view.value
  if (!target) return
  target.setSelectedRows([])
  await target.refresh()
  if (view.value === target) error.value = target.loadingError?.message ?? ''
}
watch(scenarioId, async id => {
  const own = ++generation
  ready.value = false; loading.value = true; error.value = ''; editingId.value = ''
  unsubscribe?.(); view.value = undefined
  session.dispose()
  try {
    if (!id) throw new Error('字典管理入口缺少导航绑定的数据空间ID')
    const dataSet = await LowcodeDictionary.loadCatalog(id)
    if (!active || own !== generation) {dataSet.destroy(); return}
    const tool = new PageTool({pageId: 'data-dictionary-list-page'})
    tool.hydrateFileText('rule.json', rule)
    tool.hydrateFileText('script.js', script)
    tool.hydrateFileText('style.css', style)
    tool.markLoaded()
    const current = session.acquire({tool, scenarioIds: [id], mainScenarioId: id, targetId: id,
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
