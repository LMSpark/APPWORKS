<!--
@module app:views/features/data-platform/structured-config/logic-view/ui/logic-view-list-page
-->
<template>
  <section class="structured-catalog-page">
    <header><h1>逻辑视图</h1><p>视图目录；设计 JSON 经 ViewData 服务读写。</p></header>
    <p v-if="loading" role="status">正在读取逻辑视图目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererTable v-if="ready" :data-view-key="catalogKey" :children="fields" :toolbar="toolbar" :filter="filter"
      :stripe="true" :highlight-current-row="true" :on-row-click="choose" :show-data-view-meta="false" />
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererTable, useSparkComponent, type RFilterProps, type RToolbarProps} from '@spark-appworks/spark-component'
import {LowcodeLogicView} from '@/lowcode/resources/logic-view/lowcode-logic-view'
import {buildTenantPath, parseTenantScope} from '@/services/tenant-scope'

const route = useRoute()
const router = useRouter()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'logic-view-list-page'})
const view = shallowRef<DataView>(), loading = ref(false), ready = ref(false), error = ref(''), revision = ref(0)
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true
const selected = computed(() => {
  revision.value
  const values = view.value?.getSelectedValues() ?? []
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : ''
})
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const catalogKey = computed(() => buildDataViewKey(LowcodeLogicView.catalogMetaName, 'default', scenarioId.value))
const designPath = '/features/data-platform/structured-config/logic-view/ui/logic-view-design-page'
const toolbar = computed<RToolbarProps>(() => ({wrap: true, children: [
  {type: 'r-button', props: {label: '新增视图', permAction: 'create', disabled: loading.value, onClick: createView}},
  {type: 'r-button', props: {label: '打开设计', disabled: !selected.value || loading.value, onClick: openDesign}},
  {type: 'r-button', props: {label: '刷新', action: 'refresh'}},
]}))
const fields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'name', label: '视图名称', width: 260}},
  {type: 'r-text', props: {field: 'description', label: '描述', width: 320}},
  {type: 'r-select', props: {field: 'createuser', label: '创建人', width: 150,
    optionDataViewKey: buildDataViewKey('Base_UserInfo', 'default', scenarioId.value)}},
])
const filter = computed<RFilterProps>(() => ({autoFitMinWidth: '230px', children: [
  {type: 'r-text', props: {field: 'name', label: '视图名称', placeholder: '按名称筛选'}},
]}))
function choose(row: DataRow): void {view.value?.setSelectedRows([row])}
function createView(): void {void openDesignRoute(crypto.randomUUID().replaceAll('-', '').toUpperCase())}
async function openDesign(): Promise<void> {if (selected.value) await openDesignRoute(selected.value)}
async function openDesignRoute(viewId: string): Promise<void> {
  const scope = parseTenantScope(route.path)
  const path = scope ? buildTenantPath(scope, designPath) : designPath
  await router.push({path, query: {viewId}})
}
watch(scenarioId, async id => {
  const own = ++generation
  ready.value = false; loading.value = true; error.value = ''
  unsubscribe?.(); view.value = undefined; sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined
  try {
    if (!id) throw new Error('逻辑视图入口缺少导航绑定的数据空间ID')
    const dataSet = await LowcodeLogicView.loadCatalog(id)
    if (!active || own !== generation) {dataSet.destroy(); return}
    runtime = new PageRuntime({pageId: 'logic-view-list-page', scenarioIds: [id], loadScenario: async () => dataSet})
    await runtime.load()
    if (!active || own !== generation) {runtime.dispose(); return}
    view.value = dataSet.getView(LowcodeLogicView.catalogMetaName, 'default')
    unsubscribe = dataSet.onAnyViewChange({selectedRowsChanged: () => revision.value++})
    sparkProvide(PAGE_RUNTIME, runtime); ready.value = true
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
</script>

<style scoped>
.structured-catalog-page { display: grid; gap: 16px; padding: 24px; }
.structured-catalog-page h1 { margin: 0; font-size: 1.25rem; }
</style>
