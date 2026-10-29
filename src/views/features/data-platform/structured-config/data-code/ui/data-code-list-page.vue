<!--
@module app:views/features/data-platform/structured-config/data-code/ui/data-code-list-page
-->
<template>
  <section class="structured-catalog-page">
    <header><h1>数据编码</h1><p>编码方案目录，规则设计在独立编辑器中维护。</p></header>
    <p v-if="loading" role="status">正在读取编码目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="ready">
      <RendererTable :data-view-key="catalogKey" :children="fields" :toolbar="toolbar" :filter="filter"
        :stripe="true" :highlight-current-row="true" :on-row-click="choose" :show-data-view-meta="false" />
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererTable, useSparkComponent, type RFilterProps, type RToolbarProps} from '@spark-appworks/spark-component'
import {LowcodeDataCode} from '@/lowcode/resources/data-code/lowcode-data-code'
import {buildApplicationPath, parseApplicationPathScope} from '@/services/application-scope'

const route = useRoute()
const router = useRouter()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'data-code-list-page'})
const view = shallowRef<DataView>(), loading = ref(false), ready = ref(false), error = ref(''), revision = ref(0)
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true
const selected = computed(() => {
  revision.value
  const values = view.value?.getSelectedValues() ?? []
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : ''
})
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const catalogKey = computed(() => buildDataViewKey(LowcodeDataCode.catalogMetaName, 'default', scenarioId.value))
const editorPath = '/features/data-platform/structured-config/data-code/ui/data-code-editor-page'
const toolbar = computed<RToolbarProps>(() => ({wrap: true, children: [
  {type: 'r-button', props: {label: '新增编码', permAction: 'create', disabled: loading.value, onClick: createCode}},
  {type: 'r-button', props: {label: '方案设计', disabled: !selected.value || loading.value, onClick: openEditor}},
  {type: 'r-button', props: {label: '刷新', action: 'refresh'}},
]}))
const fields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'CodeName', label: '方案名称', width: 230}},
  {type: 'r-text', props: {field: 'functiondesc', label: '功能描述', width: 320}},
  {type: 'r-select', props: {field: 'createuser', label: '创建人', width: 150,
    optionDataViewKey: buildDataViewKey('Base_UserInfo', 'default', scenarioId.value)}},
  {type: 'r-text', props: {field: 'crttime', label: '创建时间', width: 180}},
])
const filter = computed<RFilterProps>(() => ({autoFitMinWidth: '230px', children: [
  {type: 'r-text', props: {field: 'CodeName', label: '方案名称', placeholder: '按名称筛选'}},
  {type: 'r-text', props: {field: 'functiondesc', label: '功能描述', placeholder: '按描述筛选'}},
]}))
function choose(row: DataRow): void {view.value?.setSelectedRows([row])}
function createCode(): void {
  const id = crypto.randomUUID().replaceAll('-', '').toUpperCase()
  void openEditorRoute(id, true)
}
async function openEditor(): Promise<void> {
  if (selected.value) await openEditorRoute(selected.value, false)
}
async function openEditorRoute(codeDesignId: string, create: boolean): Promise<void> {
  const scope = parseApplicationPathScope(route.path)
  const path = scope ? buildApplicationPath(scope, editorPath) : editorPath
  await router.push({path, query: {codeDesignId, ...(create ? {create: '1'} : {})}})
}
watch(scenarioId, async id => {
  const own = ++generation
  ready.value = false; loading.value = true; error.value = ''
  unsubscribe?.(); view.value = undefined
  sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined
  try {
    if (!id) throw new Error('编码管理入口缺少导航绑定的数据空间ID')
    const dataSet = await LowcodeDataCode.loadCatalog(id)
    if (!active || own !== generation) {dataSet.destroy(); return}
    runtime = new PageRuntime({pageId: 'data-code-list-page', scenarioIds: [id], loadScenario: async () => dataSet})
    await runtime.load()
    if (!active || own !== generation) {runtime.dispose(); return}
    view.value = dataSet.getView(LowcodeDataCode.catalogMetaName, 'default')
    unsubscribe = dataSet.onAnyViewChange({selectedRowsChanged: () => revision.value++, requestStateChanged: () => revision.value++})
    sparkProvide(PAGE_RUNTIME, runtime); ready.value = true
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
</script>

<style scoped>
.structured-catalog-page { display: grid; gap: 16px; padding: 24px; color: var(--el-text-color-primary); }
.structured-catalog-page header { display: grid; gap: 4px; }
.structured-catalog-page h1 { margin: 0; font-size: 1.25rem; font-weight: 600; }
.structured-catalog-page header p { margin: 0; color: var(--el-text-color-secondary); }
</style>
