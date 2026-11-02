<!-- @module app:views/features/data-platform/structured-config/data-code/ui/data-code-editor-page -->
<template>
  <section class="structured-editor-page">
    <h1>编码方案设计</h1>
    <p v-if="loading" role="status">正在读取编码设计…</p>
    <p v-if="error || queryError" role="alert">{{ error || queryError }}</p>
    <p v-if="unconfirmed" role="status">保存结果尚未确认，请核验保存结果。</p>
    <p v-if="missingDefinition" role="alert">当前应用下未找到该编码设计</p>
    <template v-if="hasDefinition">
      <RendererForm :data-view-key="mainKey" :show-data-view-meta="false" :auto-columns="false" :grid-columns="2">
        <FieldText field="Name" label="名称" :readonly="saving" />
        <FieldText field="BusTableName" label="业务表" :readonly="true" />
        <FieldText field="CodeDescription" label="编码描述" :readonly="true" />
        <FieldText field="CodeExample" label="编码示例" :readonly="true" />
      </RendererForm>
      <RendererTable :data-view-key="nodesKey" :children="nodeFields" :actions="nodeActions" :show-data-view-meta="false" />
      <div class="structured-editor-actions">
        <RendererButton :label="unconfirmed ? '核验保存结果' : '保存设计'" button-type="primary" :disabled="busy" @click="save" />
        <RendererButton label="取消修改" :disabled="busy || unconfirmed" @click="cancel" />
        <RendererButton label="编码类选择…" :disabled="busy || unconfirmed" @click="openCurrentClass" />
        <RendererButton label="初始化数据…" :disabled="busy" @click="openDialog = 'codeInit'" />
      </div>
    </template>
    <CodeClassSelectorDialog v-if="openDialog === 'classSelector' && ruleTarget" :data-view-key="nodesKey" :node-id="ruleTarget.nodeId" @close="closeRule" />
    <ParentCodeDialog v-if="openDialog === 'parentCode' && ruleTarget" :data-view-key="nodesKey" :node-id="ruleTarget.nodeId" :bus-table-rowid="ruleTarget.busTableRowid" @close="closeRule" />
    <SequenceSelectorDialog v-if="openDialog === 'sequence' && ruleTarget" :data-view-key="nodesKey" :node-id="ruleTarget.nodeId" @close="closeRule" />
    <TimeStringDialog v-if="openDialog === 'timeString' && ruleTarget" :data-view-key="nodesKey" :node-id="ruleTarget.nodeId" :bus-table-rowid="ruleTarget.busTableRowid" @close="closeRule" />
    <CodeInitDialog v-if="openDialog === 'codeInit'" @close="openDialog = ''" />
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {onBeforeRouteLeave, onBeforeRouteUpdate, useRoute} from 'vue-router'
import {buildDataViewKey, RequestState, type DataRow, type DataSet, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, FieldText, RendererForm, RendererTable, RendererButton, useSparkComponent} from '@spark-appworks/spark-component'
import {LowcodeDataCode} from '@/lowcode/resources/structured-config/data-code/resource'
import {codeNodeTypeLabel, isFixedCodeNode, saveDataCodeDesign} from '@/lowcode/resources/structured-config/data-code/design-ops'
import CodeClassSelectorDialog from './code-class-selector-dialog.vue'
import CodeInitDialog from './dialogs/code-init-dialog.vue'
import ParentCodeDialog from './parent-code-dialog.vue'
import SequenceSelectorDialog from './sequence-selector-dialog.vue'
import TimeStringDialog from './time-string-dialog.vue'

const props = defineProps<{
  /** 宿主传入的被管理应用ID；提供任一目标prop时必须同时提供另一项，不从路由补齐。 */
  applicationId?: string
  /** 宿主传入的编码主记录ID；独立路由入口仅在两个目标prop均未提供时读取URL参数。 */
  codeDesignId?: string
}>()
const emit = defineEmits<{saved: []}>()
const route = useRoute(), openDialog = ref(''), error = ref(''), saving = ref(false), revision = ref(0)
const ruleTarget = shallowRef<{nodeId: string | number; busTableRowid: string}>()
function closeRule(): void {openDialog.value = ''; ruleTarget.value = undefined}
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'data-code-editor-page'})
const scene = LowcodeDataCode.designScenarioId
const dataSet = shallowRef<DataSet>()
const opening = ref(false)
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true
const hostTarget = computed(() => props.applicationId !== undefined || props.codeDesignId !== undefined)
const applicationId = computed(() => hostTarget.value ? props.applicationId ?? '' : (typeof route.query['applicationId'] === 'string' ? route.query['applicationId'] : ''))
const codeDesignId = computed(() => hostTarget.value ? props.codeDesignId ?? '' : (typeof route.query['codeDesignId'] === 'string' ? route.query['codeDesignId'] : ''))
const mainKey = buildDataViewKey('Base_CodeDesign', 'default', scene), nodesKey = buildDataViewKey('Base_CodeNodeDesign', 'default', scene)
const main = computed(() => dataSet.value?.getView('Base_CodeDesign')), nodes = computed(() => dataSet.value?.getView('Base_CodeNodeDesign'))
const loading = computed(() => {revision.value; return opening.value || !!dataSet.value && Object.values(dataSet.value.tables).some(table => table.viewList.some(view =>
  view.requestState === RequestState.Preparing || view.requestState === RequestState.Loading))})
const busy = computed(() => saving.value || loading.value || !!openDialog.value)
const unconfirmed = computed(() => {revision.value; return [main.value, nodes.value].some(view => view?.hasUnconfirmedSave === true)})
const hasDefinition = computed(() => {revision.value; return main.value?.rows.length === 1})
const missingDefinition = computed(() => {revision.value; return main.value?.requestState === RequestState.Loaded && !main.value.rows.length})
const queryError = computed(() => {revision.value; return Object.values(dataSet.value?.tables ?? {}).flatMap(table => table.viewList)
  .find(view => view.loadingError)?.loadingError?.message ?? ''})
const hasPending = computed(() => {revision.value; return saving.value || !!openDialog.value || [main.value, nodes.value].some(view =>
  view && (view.hasUnconfirmedSave || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()))})
defineExpose({hasPending, busy, unconfirmed, discardChanges: cancel})
onBeforeRouteLeave(() => !hasPending.value)
onBeforeRouteUpdate(() => !hasPending.value)
const nodeFields: SparkNode[] = [
  {type: 'r-text', props: {field: 'NodeNo', label: '段号', readonly: true, width: 90}},
  {type: 'r-select', props: {field: 'NodeType', label: '类型', readonly: true, width: 180,
    optionDataViewKey: buildDataViewKey('Dict_CodeNodeType', 'default', scene)}},
  {type: 'r-text', props: {field: 'ParameterName', label: '参数名称', showCellControl: true,
    cellReadonly: (row: Readonly<DataRow>) => saving.value || !dataSet.value || !isFixedCodeNode(dataSet.value, row)}},
]
const nodeActions = {children: [{type: 'r-button', props: {label: '选择', onClick: openRule}}]}
function openCurrentClass(): void {
  const row = nodes.value?.currentRow
  if (!row || !dataSet.value || !nodes.value || nodes.value.fieldAccess(row, 'NodeType').read !== 'visible'
    || codeNodeTypeLabel(dataSet.value, row['NodeType']) !== '分类字符串') {error.value = '请选择分类字符串编码段'; return}
  openRule(row)
}
function openRule(row: DataRow): void {
  if (busy.value || unconfirmed.value || !nodes.value || !main.value || !dataSet.value || !row || typeof row !== 'object') return
  const owner = main.value.currentRow
  if (!owner || nodes.value.fieldAccess(row, 'NodeType').read !== 'visible') return
  const label = codeNodeTypeLabel(dataSet.value, row['NodeType'])
  const dialog = label.includes('时间字符串') ? 'timeString' : label === '父编码串' ? 'parentCode' : label === '顺序号串' ? 'sequence' : label === '分类字符串' ? 'classSelector' : ''
  if (!dialog) {error.value = '该类型规则尚未恢复'; return}
  const needsBusinessFields = dialog === 'timeString' || dialog === 'parentCode'
  if (needsBusinessFields && main.value.fieldAccess(owner, 'BusTableRowid').read !== 'visible') return
  const nodeId = nodes.value.getPkKey(row), busTableRowid = needsBusinessFields ? owner['BusTableRowid'] : ''
  if ((typeof nodeId !== 'string' && typeof nodeId !== 'number') || needsBusinessFields && (typeof busTableRowid !== 'string' || !busTableRowid)) {error.value = '缺少编码段或业务表身份'; return}
  ruleTarget.value = {nodeId, busTableRowid: typeof busTableRowid === 'string' ? busTableRowid : ''}; openDialog.value = dialog
}
watch([applicationId, codeDesignId], async ([app, code]) => {
  const own = ++generation
  unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined; dataSet.value = undefined
  error.value = ''; openDialog.value = ''; opening.value = true; saving.value = false
  try {
    if (!app.trim() || !code.trim()) throw new Error('缺少唯一 applicationId 或 codeDesignId 参数')
    const loaded = await LowcodeDataCode.loadEditor(scene)
    if (!active || own !== generation) {loaded.destroy(); return}
    const page = new PageRuntime({pageId: 'data-code-editor-page', scenarioIds: [scene, LowcodeDataCode.referenceScenarioId],
      deferredScenarioIds: [LowcodeDataCode.referenceScenarioId], scenarioInputs: {[scene]: {applicationId: app, codeDesignId: code}},
      loadScenario: async id => {
        if (id === scene) return loaded
        if (id === LowcodeDataCode.referenceScenarioId) return LowcodeDataCode.loadReferenceSources()
        throw new Error('引用来源空间未声明')
      }})
    runtime = page
    await page.load()
    if (!active || own !== generation) {page.dispose(); return}
    dataSet.value = loaded
    const changed = () => revision.value++
    unsubscribe = loaded.onAnyViewChange({rowsChanged: changed, editingChanged: changed, requestStateChanged: changed, selectedRowsChanged: changed})
    sparkProvide(PAGE_RUNTIME, page); loaded.triggerAutoLoad()
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) opening.value = false}
}, {immediate: true})
async function save(): Promise<void> {
  if (!dataSet.value || busy.value || !hasDefinition.value) return
  const own = generation
  saving.value = true; error.value = ''
  let saved = false
  try {const result = await saveDataCodeDesign(dataSet.value); if (!result.success) throw new Error(result.message ?? '保存未完成'); saved = true}
  catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) {saving.value = false; revision.value++}}
  if (saved && active && own === generation) emit('saved')
}
function cancel(): boolean {
  if (busy.value) return false
  if (unconfirmed.value) {error.value = '保存结果尚未确认，请先核验保存结果'; return false}
  try {main.value?.discardPendingChanges(); nodes.value?.discardPendingChanges(); error.value = ''; return !hasPending.value}
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause); return false}
}
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
</script>

<style scoped>
.structured-editor-page {display:grid; gap:16px; padding:24px;}
.structured-editor-page h1 {margin:0; font-size:1.25rem;}
.structured-editor-actions {display:flex; gap:8px; flex-wrap:wrap;}
</style>
