<!--
@module app:views/features/data-platform/structured-config/workflow-definition/ui/workflow-definition-page
-->
<template>
  <section class="structured-catalog-page">
    <header><h1>数据工作流</h1><p>工作流目录（与 Agent Workflow 分离）。</p></header>
    <p v-if="loading" role="status">正在读取工作流目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererTable v-if="ready" :data-view-key="catalogKey" :children="fields" :toolbar="toolbar"
      :stripe="true" :highlight-current-row="true" :on-row-click="choose" :show-data-view-meta="false" />
    <WorkflowTriggerTableDialog v-if="triggerOpen" :workflow-id="selected" @close="triggerOpen = false" />
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererTable, useSparkComponent, type RToolbarProps} from '@spark-appworks/spark-component'
import {LowcodeWorkflowDefinition} from '@/lowcode/resources/workflow-definition/lowcode-workflow-definition'
import {buildApplicationPath, parseApplicationPathScope} from '@/services/application-scope'
import WorkflowTriggerTableDialog from './workflow-trigger-table-dialog.vue'

const route = useRoute()
const router = useRouter()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'workflow-definition-page'})
const view = shallowRef<DataView>(), loading = ref(false), ready = ref(false), error = ref(''), revision = ref(0)
const triggerOpen = ref(false)
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true
const selected = computed(() => {
  revision.value
  const values = view.value?.getSelectedValues() ?? []
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : ''
})
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const catalogKey = computed(() => buildDataViewKey(LowcodeWorkflowDefinition.catalogMetaName, 'default', scenarioId.value))
const designPath = '/features/data-platform/structured-config/workflow-definition/design/ui/workflow-design-page'
const toolbar = computed<RToolbarProps>(() => ({wrap: true, children: [
  {type: 'r-button', props: {label: '新增工作流', permAction: 'create', disabled: loading.value, onClick: createFlow}},
  {type: 'r-button', props: {label: '打开设计', disabled: !selected.value || loading.value, onClick: openDesign}},
  {type: 'r-button', props: {label: '触发表…', disabled: !selected.value || loading.value, onClick: () => {triggerOpen.value = true}}},
  {type: 'r-button', props: {label: '刷新', action: 'refresh'}},
]}))
const fields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'FlowName', label: '工作流名称', width: 260}},
  {type: 'r-text', props: {field: 'functiondesc', label: '描述', width: 320}},
])
function choose(row: DataRow): void {view.value?.setSelectedRows([row])}
function createFlow(): void {void openDesignRoute(crypto.randomUUID().replaceAll('-', '').toUpperCase())}
async function openDesign(): Promise<void> {if (selected.value) await openDesignRoute(selected.value)}
async function openDesignRoute(workflowId: string): Promise<void> {
  const scope = parseApplicationPathScope(route.path)
  const path = scope ? buildApplicationPath(scope, designPath) : designPath
  await router.push({path, query: {workflowId}})
}
watch(scenarioId, async id => {
  const own = ++generation
  ready.value = false; loading.value = true; error.value = ''
  unsubscribe?.(); view.value = undefined; sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined
  try {
    if (!id) throw new Error('数据工作流入口缺少导航绑定的数据空间ID')
    const dataSet = await LowcodeWorkflowDefinition.loadCatalog(id)
    if (!active || own !== generation) {dataSet.destroy(); return}
    runtime = new PageRuntime({pageId: 'workflow-definition-page', scenarioIds: [id], loadScenario: async () => dataSet})
    await runtime.load()
    if (!active || own !== generation) {runtime.dispose(); return}
    view.value = dataSet.getView(LowcodeWorkflowDefinition.catalogMetaName, 'default')
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
