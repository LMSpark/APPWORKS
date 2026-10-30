<!--
@module app:views/features/data-platform/semi-structured/excel-import/ui/excel-import-list-page
-->
<template>
  <section class="structured-catalog-page">
    <header><h1>Excel 导入</h1><p>导入方案目录；Sheet 布局与转换规则在编辑器中维护。</p></header>
    <p v-if="loading" role="status">正在读取导入目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="ready">
      <RendererTable :data-view-key="catalogKey" :children="fields" :toolbar="toolbar" :stripe="true"
        :highlight-current-row="true" :on-row-click="choose" :show-data-view-meta="false" />
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererTable, useSparkComponent, type RToolbarProps} from '@spark-appworks/spark-component'
import {LowcodeExcelImport} from '@/lowcode/resources/semi-structured/excel-import/resource'
import {buildApplicationPath, parseApplicationPathScope} from '@/services/application-scope'

const route = useRoute()
const router = useRouter()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'excel-import-list-page'})
const view = shallowRef<DataView>(), loading = ref(false), ready = ref(false), error = ref(''), revision = ref(0)
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true
const selected = computed(() => {
  revision.value
  const row = view.value?.selectedRows[0]
  const id = row?.['rowid']
  return typeof id === 'string' || typeof id === 'number' ? String(id) : ''
})
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const catalogKey = computed(() => buildDataViewKey(LowcodeExcelImport.catalogMetaName, 'default', scenarioId.value))
const editorPath = '/features/data-platform/semi-structured/excel-import/ui/excel-import-editor-page'
const toolbar = computed<RToolbarProps>(() => ({wrap: true, children: [
  {type: 'r-button', props: {label: '打开设计', disabled: !selected.value || loading.value, onClick: openEditor}},
  {type: 'r-button', props: {label: '刷新', action: 'refresh'}},
]}))
const fields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'ConfigName', label: '方案名称', width: 240}},
  {type: 'r-text', props: {field: 'functiondesc', label: '描述', width: 300}},
  {type: 'r-select', props: {field: 'createuser', label: '创建人', width: 150,
    optionDataViewKey: buildDataViewKey('Base_UserInfo', 'default', scenarioId.value)}},
])
function choose(row: DataRow): void {view.value?.setSelectedRows([row])}
async function openEditor(): Promise<void> {
  if (!selected.value) return
  const scope = parseApplicationPathScope(route.path)
  const path = scope ? buildApplicationPath(scope, editorPath) : editorPath
  await router.push({path, query: {importConfigId: selected.value}})
}
watch(scenarioId, async id => {
  const own = ++generation
  ready.value = false; loading.value = true; error.value = ''
  unsubscribe?.(); view.value = undefined
  sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined
  try {
    if (!id) throw new Error('Excel 导入入口缺少导航绑定的数据空间ID')
    const dataSet = await LowcodeExcelImport.loadCatalog(id)
    if (!active || own !== generation) {dataSet.destroy(); return}
    runtime = new PageRuntime({pageId: 'excel-import-list-page', scenarioIds: [id], loadScenario: async () => dataSet})
    await runtime.load()
    if (!active || own !== generation) {runtime.dispose(); return}
    view.value = dataSet.getView(LowcodeExcelImport.catalogMetaName, 'default')
    unsubscribe = dataSet.onAnyViewChange({selectedRowsChanged: () => revision.value++})
    sparkProvide(PAGE_RUNTIME, runtime); ready.value = true
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
</script>

<style scoped>
.structured-catalog-page { display: grid; gap: 16px; padding: 24px; }
.structured-catalog-page header h1 { margin: 0; font-size: 1.25rem; }
</style>
