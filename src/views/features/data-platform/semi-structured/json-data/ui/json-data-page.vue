<!--
@module app:views/features/data-platform/semi-structured/json-data/ui/json-data-page
-->
<template>
  <section class="json-data-page">
    <header><h1>JSON 数据</h1><p>目录走 DataView；树内容经设计 file 视图 refresh / saveChanges。</p></header>
    <p v-if="loading" role="status">正在读取 JSON 目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="ready">
      <RendererTable :data-view-key="catalogKey" :children="fields" :toolbar="toolbar" :stripe="true"
        :highlight-current-row="true" :on-row-click="choose" :show-data-view-meta="false" />
      <template v-if="selectedJsonId">
        <h2>树内容（{{ selectedJsonId }}）</h2>
        <p v-if="contentLoading" role="status">正在读取 JSON 内容…</p>
        <JsonTreeEditor v-if="contentReady" v-model="contentText" :height="320" />
        <RendererButton label="保存内容" button-type="primary" :disabled="contentBusy" @click="saveContent" />
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {useRoute} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {JsonTreeEditor, PAGE_RUNTIME, RendererButton, RendererTable, useSparkComponent, type RToolbarProps} from '@spark-appworks/spark-component'
import {JSON_CONTENT_EDIT_VIEW, JSON_CONTENT_INPUT_TABLE} from '@/lowcode/resources/json-data/lowcode-json-data-content-ops'
import {LowcodeJsonData} from '@/lowcode/resources/json-data/lowcode-json-data'
import {setDesignScopeValue} from '@/lowcode/resources/shared/staged-design-file-view'

const route = useRoute()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'json-data-page'})
const catalogView = shallowRef<DataView>(), contentView = shallowRef<DataView>()
const loading = ref(false), ready = ref(false), error = ref(''), revision = ref(0)
const contentLoading = ref(false), contentReady = ref(false), contentBusy = ref(false)
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const catalogKey = computed(() => buildDataViewKey(LowcodeJsonData.catalogMetaName, 'default', scenarioId.value))
const selectedJsonId = computed(() => {
  revision.value
  const row = catalogView.value?.selectedRows[0]
  const id = row?.['rowid']
  return typeof id === 'string' || typeof id === 'number' ? String(id) : ''
})
const toolbar = computed<RToolbarProps>(() => ({wrap: true, children: [
  {type: 'r-button', props: {label: '刷新', action: 'refresh'}},
]}))
const fields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'name', label: '名称', width: 220}},
  {type: 'r-text', props: {field: 'description', label: '描述', width: 320}},
  {type: 'r-select', props: {field: 'createuser', label: '创建人', width: 150,
    optionDataViewKey: buildDataViewKey('Base_UserInfo', 'default', scenarioId.value)}},
])
const contentText = computed({
  get: () => String(contentView.value?.rows[0]?.['contentJson'] ?? ''),
  set: value => {
    const row = contentView.value?.rows[0]
    const pk = contentView.value?.primaryKey
    if (!row || !pk || !contentView.value) return
    const rowId = row[pk]
    if (typeof rowId !== 'string' && typeof rowId !== 'number') return
    void contentView.value.editRowById(rowId, {contentJson: value})
  },
})
function choose(row: DataRow): void {catalogView.value?.setSelectedRows([row])}
function pageDataSet() {
  const id = scenarioId.value
  return id && runtime ? runtime.getDataSet(id) : undefined
}

async function loadContent(): Promise<void> {
  const ds = pageDataSet()
  if (!ds || !selectedJsonId.value) return
  contentReady.value = false; contentLoading.value = true
  try {
    setDesignScopeValue({dataSet: ds, tableName: JSON_CONTENT_INPUT_TABLE, field: 'jsonId', scopeId: selectedJsonId.value})
    contentView.value = ds.getView(JSON_CONTENT_EDIT_VIEW, 'default')
    await contentView.value?.refresh()
    if (contentView.value?.loadingError) throw contentView.value.loadingError
    contentReady.value = true
  } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {contentLoading.value = false}
}
watch(selectedJsonId, () => void loadContent())
async function saveContent(): Promise<void> {
  const ds = pageDataSet()
  if (!ds || contentBusy.value) return
  contentBusy.value = true; error.value = ''
  try {
    const result = await ds.saveChanges({views: [{tableName: JSON_CONTENT_EDIT_VIEW, viewId: 'default'}]})
    if (!result.success) throw new Error(result.message ?? '保存失败')
  } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {contentBusy.value = false}
}
watch(scenarioId, async id => {
  const own = ++generation
  ready.value = false; loading.value = true; error.value = ''
  unsubscribe?.(); catalogView.value = undefined; contentView.value = undefined
  sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined
  try {
    if (!id) throw new Error('JSON 数据入口缺少导航绑定的数据空间ID')
    const dataSet = await LowcodeJsonData.loadPage(id)
    if (!active || own !== generation) {dataSet.destroy(); return}
    runtime = new PageRuntime({pageId: 'json-data-page', scenarioIds: [id], loadScenario: async () => dataSet})
    await runtime.load()
    if (!active || own !== generation) {runtime.dispose(); return}
    catalogView.value = dataSet.getView(LowcodeJsonData.catalogMetaName, 'default')
    contentView.value = dataSet.getView(JSON_CONTENT_EDIT_VIEW, 'default')
    unsubscribe = dataSet.onAnyViewChange({selectedRowsChanged: () => revision.value++})
    sparkProvide(PAGE_RUNTIME, runtime); ready.value = true
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
</script>

<style scoped>
.json-data-page { display: grid; gap: 16px; padding: 24px; }
.json-data-page h1, .json-data-page h2 { margin: 0; font-size: 1.25rem; }
</style>
