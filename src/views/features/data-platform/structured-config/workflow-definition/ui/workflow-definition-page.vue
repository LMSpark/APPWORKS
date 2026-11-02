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
    <RendererDialog v-if="designTarget" :model-value="true" title="数据工作流设计" :data-view-key="catalogKey"
      width="94vw" top="3vh" :append-to-body="true" :destroy-on-close="true" :close-disabled="designPending" @update:model-value="closeDesign">
      <WorkflowDesign ref="designPage" :rowid="designTarget" />
      <template #footer>
        <RendererButton v-if="designPage?.hasPending" label="放弃修改并关闭" :disabled="designPage?.busy || designPage?.unconfirmed" @click="discardDesign" />
        <RendererButton label="关闭" :disabled="designPending" @click="closeDesign(false)" />
      </template>
    </RendererDialog>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {useRoute} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererTable, RendererDialog, RendererButton, useSparkComponent, type RToolbarProps} from '@spark-appworks/spark-component'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {LowcodeWorkflowDefinition} from '@/lowcode/resources/structured-config/workflow-definition/resource'
import WorkflowTriggerTableDialog from './workflow-trigger-table-dialog.vue'
import WorkflowDesign from '../design/ui/workflow-design-page.vue'

const route = useRoute()
const designTarget=ref(''),designPage=ref<{hasPending:boolean;busy:boolean;unconfirmed:boolean;discardChanges:()=>boolean}>()
const designPending=computed(()=>designPage.value?.hasPending===true||designPage.value?.busy===true)
useSystemPageDirtySource({get isDirty(){return designPending.value}})
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
const toolbar = computed<RToolbarProps>(() => ({wrap: true, children: [
  {type: 'r-button', props: {label: '新增工作流', permAction: 'create', disabled: loading.value, onClick: createFlow}},
  {type: 'r-button', props: {label: '打开设计', disabled: !selected.value || loading.value, onClick: openDesign}},
  {type: 'r-button', props: {label: '触发表…', disabled: !selected.value || loading.value, onClick: () => {triggerOpen.value = true}}},
  {type: 'r-button', props: {label: '刷新', action: 'refresh'}},
]}))
const fields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'name', label: '工作流名称', width: 260}},
  {type: 'r-text', props: {field: 'workflow_key', label: '工作流编码', width: 180}},
  {type: 'r-text', props: {field: 'description', label: '描述', width: 320}},
  {type: 'r-select', props: {field: 'status', label: '状态', width: 120,
    optionDataViewKey: buildDataViewKey('workflowStatus', 'default', scenarioId.value)}},
])
function choose(row: DataRow): void {view.value?.setSelectedRows([row])}
function createFlow(): void {if(!designTarget.value)designTarget.value=crypto.randomUUID().replaceAll('-', '').toUpperCase()}
function openDesign(): void {if(selected.value&&!designTarget.value)designTarget.value=selected.value}
function closeDesign(open:boolean):void{if(!open&&!designPending.value)designTarget.value=''}
function discardDesign():void{if(designPage.value?.busy||designPage.value?.unconfirmed)return;if(designPage.value?.discardChanges()===true)closeDesign(false)}
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
    sparkProvide(PAGE_RUNTIME, runtime); ready.value = true; dataSet.triggerAutoLoad()
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
</script>

<style scoped>
.structured-catalog-page { display: grid; gap: 16px; padding: 24px; }
.structured-catalog-page h1 { margin: 0; font-size: 1.25rem; }
</style>
