<!--
@module app:views/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-list-page
-->
<template>
  <section class="structured-catalog-page">
    <header><h1>PDF 识别规则</h1><p>规则目录；设计在编辑器中维护。</p></header>
    <p v-if="loading" role="status">正在读取规则目录…</p>
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
import {LowcodePdfInspect} from '@/lowcode/resources/pdf-inspect/lowcode-pdf-inspect'
import {buildApplicationPath, parseApplicationPathScope} from '@/services/application-scope'

const route = useRoute()
const router = useRouter()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'pdf-inspect-list-page'})
const view = shallowRef<DataView>(), loading = ref(false), ready = ref(false), error = ref(''), revision = ref(0)
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true
const selected = computed(() => {
  revision.value
  const row = view.value?.selectedRows[0]
  const id = row?.['rowid']
  return typeof id === 'string' || typeof id === 'number' ? String(id) : ''
})
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const catalogKey = computed(() => buildDataViewKey(LowcodePdfInspect.catalogMetaName, 'default', scenarioId.value))
const editorPath = '/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-editor-page'
const toolbar = computed<RToolbarProps>(() => ({wrap: true, children: [
  {type: 'r-button', props: {label: '打开设计', disabled: !selected.value || loading.value, onClick: openEditor}},
  {type: 'r-button', props: {label: '刷新', action: 'refresh'}},
]}))
const fields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'RuleName', label: '规则名称', width: 240}},
  {type: 'r-select', props: {field: 'createuser', label: '创建人', width: 150,
    optionDataViewKey: buildDataViewKey('Base_UserInfo', 'default', scenarioId.value)}},
])
function choose(row: DataRow): void {view.value?.setSelectedRows([row])}
async function openEditor(): Promise<void> {
  if (!selected.value) return
  const scope = parseApplicationPathScope(route.path)
  const path = scope ? buildApplicationPath(scope, editorPath) : editorPath
  await router.push({path, query: {ruleId: selected.value}})
}
watch(scenarioId, async id => {
  const own = ++generation
  ready.value = false; loading.value = true; error.value = ''
  unsubscribe?.(); view.value = undefined
  sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined
  try {
    if (!id) throw new Error('PDF 识别入口缺少导航绑定的数据空间ID')
    const dataSet = await LowcodePdfInspect.loadCatalog(id)
    if (!active || own !== generation) {dataSet.destroy(); return}
    runtime = new PageRuntime({pageId: 'pdf-inspect-list-page', scenarioIds: [id], loadScenario: async () => dataSet})
    await runtime.load()
    if (!active || own !== generation) {runtime.dispose(); return}
    view.value = dataSet.getView(LowcodePdfInspect.catalogMetaName, 'default')
    unsubscribe = dataSet.onAnyViewChange({selectedRowsChanged: () => revision.value++})
    sparkProvide(PAGE_RUNTIME, runtime); ready.value = true
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
</script>

<style scoped>
.structured-catalog-page { display: grid; gap: 16px; padding: 24px; }
</style>
