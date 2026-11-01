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
      <RendererDialog v-if="designTarget" :model-value="true" title="Excel 导入方案设计" :data-view-key="catalogKey"
        :width="1560" :destroy-on-close="true" :close-disabled="designPending" @update:model-value="closeDesign">
        <ExcelEditor ref="designPage" :scheme-rowid="designTarget" />
        <template #footer>
          <RendererButton v-if="designPage?.hasPending" label="放弃修改并关闭" :disabled="designPage?.busy || designPage?.unconfirmed" @click="discardDesign" />
          <RendererButton label="关闭" :disabled="designPending" @click="closeDesign(false)" />
        </template>
      </RendererDialog>
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {useRoute} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererTable, RendererDialog, RendererButton, useSparkComponent, type RToolbarProps} from '@spark-appworks/spark-component'
import {LowcodeExcelImport} from '@/lowcode/resources/semi-structured/excel-import/resource'
import ExcelEditor from './excel-import-editor-page.vue'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'

const route = useRoute()
const designTarget = ref('')
const designPage = ref<{hasPending: boolean; busy: boolean; unconfirmed: boolean; discardChanges: () => boolean}>()
const designPending = computed(() => designPage.value?.hasPending === true || designPage.value?.busy === true)
useSystemPageDirtySource({get isDirty() {return designPending.value}})
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'excel-import-list-page'})
const view = shallowRef<DataView>(), loading = ref(false), ready = ref(false), error = ref(''), revision = ref(0)
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true
const selected = computed(() => {
  revision.value
  const row = view.value?.selectedRows[0]
  const id = row && view.value?.selectedRows.length === 1 ? view.value.getPkKey(row) : undefined
  return typeof id === 'string' || typeof id === 'number' ? String(id) : ''
})
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const catalogKey = computed(() => buildDataViewKey(LowcodeExcelImport.catalogMetaName, 'default', scenarioId.value))
const toolbar = computed<RToolbarProps>(() => ({wrap: true, children: [
  {type: 'r-button', props: {label: '打开设计', disabled: !selected.value || loading.value, onClick: openEditor}},
  {type: 'r-button', props: {label: '刷新', action: 'refresh'}},
]}))
const fields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'coding', label: '方案编码', width: 180}},
  {type: 'r-text', props: {field: 'solutionName', label: '方案名称', width: 240}},
  {type: 'r-select', props: {field: 'dataSetId', label: '数据空间', width: 200,
    optionDataViewKey: buildDataViewKey('Base_DataSet', 'default', scenarioId.value)}},
  {type: 'r-text', props: {field: 'description', label: '描述', width: 300}},
  {type: 'r-select', props: {field: 'createuser', label: '创建人', width: 150,
    optionDataViewKey: buildDataViewKey('Base_UserInfo', 'default', scenarioId.value)}},
])
function choose(row: DataRow): void {view.value?.setSelectedRows([row])}
function openEditor(): void {
  if (selected.value && !designTarget.value) designTarget.value = selected.value
}
function closeDesign(open: boolean): void {
  if (!open && !designPending.value) designTarget.value = ''
}
function discardDesign(): void {
  if (designPage.value?.busy || designPage.value?.unconfirmed) return
  if (designPage.value?.discardChanges() === true) closeDesign(false)
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
    sparkProvide(PAGE_RUNTIME, runtime); ready.value = true; dataSet.triggerAutoLoad()
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
</script>

<style scoped>
.structured-catalog-page { display: grid; gap: 16px; padding: 24px; }
.structured-catalog-page header h1 { margin: 0; font-size: 1.25rem; }
</style>
