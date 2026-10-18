<!--
@module app:views/features/integration/api-management/ui/api-management-page
职责：外部服务商目录与基础定义维护，保留原导航和业务路径。
边界：标准组件直接绑定DataView；不混入接口运行数据，不复制行或权限，不发送HTTP。
AI用途：专题目录使用正式导航场景，选中主键作为独立定义视图输入。
-->
<template>
  <p v-if="error" role="alert">{{ error }}</p>
  <p v-if="loading">正在读取外部服务目录…</p>
  <p v-if="ready && unresolvedModifier" role="status">部分修改人在当前可读用户目录中未解析，保留原始标识。</p>
  <RendererTable v-if="ready" :data-view-key="catalogKey" :children="catalogFields" :toolbar="toolbar" :filter="{}" :on-row-click="choose" />
  <RendererDialog v-if="ready && editing" :data-view-key="definitionKey" :model-value="editing" :close-disabled="busy || pending" title="服务商基础信息设计" width="min(700px, 94vw)" @update:model-value="close">
    <template v-if="editing && owner">
      <p v-if="editorError" role="alert">{{ editorError }}</p>
      <RendererForm :data-view-key="definitionKey" :children="definitionFields" label-width="120px" grid-min-width="460px" :show-data-view-meta="false" />
      <RendererButton :data-view-key="definitionKey" label="保存基础信息" button-type="primary" :disabled="busy || uncertain" @click="save" />
      <RendererButton :data-view-key="definitionKey" :label="uncertain ? '重读核验（放弃本地修改）' : '放弃修改并重读'" :disabled="busy" @click="reloadDefinition" />
      <RendererButton :data-view-key="definitionKey" label="放弃修改并关闭" :disabled="busy || uncertain" @click="cancel" />
    </template>
  </RendererDialog>
  <ApiConfigPage v-if="configProviderId" :provider-id="configProviderId" @close="configProviderId = ''" />
  <ApiInterfaceListPage v-if="interfaceProviderId" :provider-id="interfaceProviderId" @close="interfaceProviderId = ''" />
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {useRoute} from 'vue-router'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, type DataRow, type DataSet, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {ApiProviderDesign} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererTable, RendererForm, RendererDialog, RendererButton, useSparkComponent, type RToolbarProps} from '@spark-appworks/spark-component'
import {LowcodeApiProvider} from '@/lowcode/resources/external-api/lowcode-api-provider'
import ApiConfigPage from './api-config-page.vue'
import ApiInterfaceListPage from './api-interface-list-page.vue'

const route = useRoute()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'api-management-page'})
const ready = ref(false), loading = ref(true), error = ref(''), editorError = ref(''), editing = ref(false), busy = ref(false), revision = ref(0)
const catalog = shallowRef<DataView>(), owner = shallowRef<ApiProviderDesign>()
const configProviderId = ref('')
const interfaceProviderId = ref('')
let dataSet: DataSet | undefined, runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, active = true, generation = 0
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const catalogKey = computed(() => buildDataViewKey('Base_InterfaceProvider', 'default', scenarioId.value))
const definitionKey = computed(() => buildDataViewKey('Base_InterfaceProvider', 'definition', scenarioId.value))
const pending = computed(() => {revision.value; return owner.value?.pending === true})
const uncertain = computed(() => {revision.value; return owner.value?.requiresVerification === true})
const selected = computed(() => {revision.value; const values = catalog.value?.getSelectedValues() ?? []; return values.length === 1 && typeof values[0] === 'string' ? values[0] : ''})
const unresolvedModifier = computed(() => {
  revision.value
  const users = dataSet?.getView('Base_UserInfo', 'default'), providers = catalog.value
  if (!users || !providers) return false
  const ids = new Set(users.rows.filter(row => users.fieldAccess(row, 'ROWID').read === 'visible'
    && users.fieldAccess(row, 'UserName').read === 'visible').map(row => row['ROWID']))
  return providers.rows.some(row => providers.fieldAccess(row, 'updateuser').read === 'visible'
    && row['updateuser'] !== undefined && row['updateuser'] !== null && row['updateuser'] !== '' && !ids.has(row['updateuser']))
})
const catalogFields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'Name', label: '服务提供商名称', width: 220}},
  {type: 'r-text', props: {field: 'BaseURL', label: 'API 基础 URL', width: 320}},
  {type: 'r-select', props: {field: 'updateuser', label: '修改人', width: 160, optionDataViewKey: buildDataViewKey('Base_UserInfo', 'default', scenarioId.value)}},
  {type: 'r-text', props: {field: 'updatetime', label: '修改时间', width: 180}},
])
const definitionFields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'Name', label: '服务提供商名称', readonly: busy.value || uncertain.value}},
  {type: 'r-text', props: {field: 'BaseURL', label: 'API 基础 URL', readonly: busy.value || uncertain.value}},
])
const toolbar = computed<RToolbarProps>(() => ({wrap: true, children: [
  {type: 'r-button', props: {label: '新增服务商', permAction: 'create', disabled: !!configProviderId.value || editing.value || busy.value, onClick: () => openDefinition(true)}},
  {type: 'r-button', props: {label: '编辑基础信息', disabled: !!configProviderId.value || !selected.value || editing.value || busy.value, onClick: () => openDefinition(false)}},
  {type: 'r-button', props: {label: '请求方案设计', disabled: !!configProviderId.value || !selected.value || editing.value || busy.value, onClick: () => {configProviderId.value = selected.value}}},
  {type: 'r-button', props: {label: '接口方案设计', disabled: !!interfaceProviderId.value || !!configProviderId.value || !selected.value || editing.value || busy.value, onClick: () => {interfaceProviderId.value = selected.value}}},
  {type: 'r-button', props: {label: '刷新', action: 'refresh'}},
]}))
useSystemPageDirtySource({get isDirty() {return busy.value || pending.value}})
function changed(): void {revision.value++}
function choose(row: DataRow): void {catalog.value?.setSelectedRows([row])}
async function run(action: () => Promise<void>): Promise<boolean> {
  if (busy.value || !active) return false
  const own = generation
  busy.value = true; editorError.value = ''; changed()
  try {await action(); return active && own === generation}
  catch (cause) {if (active && own === generation) editorError.value = cause instanceof Error ? cause.message : String(cause); return false}
  finally {if (active && own === generation) {busy.value = false; changed()}}
}
async function openDefinition(create: boolean): Promise<void> {
  if (!dataSet || editing.value || busy.value || !create && !selected.value) return
  const current = new ApiProviderDesign({dataSet, providerId: create ? crypto.randomUUID().replaceAll('-', '').toUpperCase() : selected.value, create})
  owner.value = current; editing.value = true
  await run(() => current.load())
}
async function save(): Promise<void> {
  const current = owner.value
  if (current && await run(() => current.save())) {
    await catalog.value?.refresh(); error.value = catalog.value?.loadingError?.message ?? ''
  }
}
async function reloadDefinition(): Promise<void> {const current = owner.value; if (current) await run(() => current.load(true))}
function close(): void {if (!busy.value && !pending.value) {editing.value = false; owner.value = undefined}}
function cancel(): void {if (!busy.value && !uncertain.value) {owner.value?.discard(); changed(); close()}}
watch(scenarioId, async id => {
  const own = ++generation
  ready.value = false; loading.value = true; error.value = ''; editing.value = false; busy.value = false; owner.value = undefined
  configProviderId.value = ''
  interfaceProviderId.value = ''
  unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined; catalog.value = undefined; dataSet = undefined
  try {
    const loaded = await LowcodeApiProvider.load(id)
    if (!active || own !== generation) {loaded.destroy(); return}
    dataSet = loaded
    const current = new PageRuntime({pageId: 'api-management-page', scenarioIds: [id], loadScenario: async () => loaded})
    runtime = current; await current.load()
    if (!active || own !== generation) {current.dispose(); return}
    catalog.value = loaded.getView('Base_InterfaceProvider', 'default')
    unsubscribe = loaded.onAnyViewChange({selectedRowsChanged: changed, rowsChanged: changed, editingChanged: changed,
      editingFieldChanged: changed, editingDiscarded: changed, requestStateChanged: changed})
    const results = await Promise.allSettled(['Base_InterfaceProvider', 'Base_UserInfo'].map(async name => {
      const view = loaded.getView(name, 'default')
      if (!view) throw new Error(`服务商视图缺失: ${name}`)
      await view.refresh(); if (view.loadingError) throw view.loadingError
    }))
    if (!active || own !== generation) return
    for (const result of results) if (result.status === 'rejected') throw result.reason
    sparkProvide(PAGE_RUNTIME, current); ready.value = true
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
</script>
