<!-- @module app:views/features/data-platform/structured-config/data-code/ui/data-code-editor-page -->
<template>
  <section class="structured-editor-page">
    <h1>编码方案设计</h1>
    <p v-if="loading" role="status">正在读取编码设计…</p>
    <p v-if="error || queryError" role="alert">{{ error || queryError }}</p>
    <p v-if="unconfirmed" role="status">保存结果尚未确认，请核验保存结果。</p>
    <p v-if="newDefinition" role="status">先保存主定义，再进入设计维护分段。</p>
    <p v-if="missingDefinition" role="alert">当前应用下未找到该编码设计</p>
    <template v-if="hasDefinition">
      <RendererForm :data-view-key="mainKey" :show-data-view-meta="false" :auto-columns="false" :grid-columns="2">
        <FieldText field="Name" label="名称" :readonly="saving" />
        <FieldText field="BusTableName" label="业务表" :readonly="true" />
        <RendererButton label="设置业务表及其字段" :disabled="busy || unconfirmed" @click="openBusinessTable" />
        <FieldText field="CodeDescription" label="编码描述" :readonly="true" />
        <FieldText field="CodeExample" label="编码示例" :readonly="true" />
      </RendererForm>
      <CodeSegmentEditor ref="segmentEditor" :data-view-key="nodesKey" :interaction-locked="saving || loading || !!openDialog" @select="openRule" />
      <div class="structured-editor-actions">
        <RendererButton :label="unconfirmed ? '核验保存结果' : '保存设计'" button-type="primary" :disabled="busy" @click="save" />
        <RendererButton label="取消修改" :disabled="busy || unconfirmed" @click="cancel" />
        <RendererButton label="编码类选择…" :disabled="busy || unconfirmed" @click="openCurrentClass" />
        <RendererButton label="初始化数据…" :disabled="busy" @click="openInitialization" />
      </div>
    </template>
    <CodeClassSelectorDialog v-if="openDialog === 'classSelector' && ruleTarget" :data-view-key="nodesKey" :node-id="ruleTarget.nodeId" @close="closeRule" />
    <ParentCodeDialog v-if="openDialog === 'parentCode' && ruleTarget" :data-view-key="nodesKey" :node-id="ruleTarget.nodeId" :bus-table-rowid="ruleTarget.busTableRowid" @close="closeRule" />
    <SequenceSelectorDialog v-if="openDialog === 'sequence' && ruleTarget" :data-view-key="nodesKey" :node-id="ruleTarget.nodeId" @close="closeRule" />
    <TimeStringDialog v-if="openDialog === 'timeString' && ruleTarget" :data-view-key="nodesKey" :node-id="ruleTarget.nodeId" :bus-table-rowid="ruleTarget.busTableRowid" @close="closeRule" />
    <CodeInitDialog v-if="openDialog === 'codeInit'" :data-view-key="mainKey" @close="openDialog = ''" />
    <CodeReferenceTableDialog v-if="openDialog === 'businessTable' && businessTarget" :data-view-key="mainKey" :record-id="businessTarget.id"
      target-kind="business" :validate-target="validateBusinessTarget" @close="closeBusinessTable" />
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {onBeforeRouteLeave, onBeforeRouteUpdate, useRoute} from 'vue-router'
import {buildDataViewKey, RequestState, type DataRow, type DataSet} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, FieldText, RendererForm, RendererButton, useSparkComponent} from '@spark-appworks/spark-component'
import {LowcodeDataCode} from '@/lowcode/resources/structured-config/data-code/resource'
import {codeNodeTypeLabel, saveDataCodeDesign} from '@/lowcode/resources/structured-config/data-code/design-ops'
import {getCodeInitializationPlan} from '@/lowcode/resources/structured-config/data-code/initialization-plan'
import CodeClassSelectorDialog from './code-class-selector-dialog.vue'
import CodeInitDialog from './code-init-dialog.vue'
import ParentCodeDialog from './parent-code-dialog.vue'
import SequenceSelectorDialog from './sequence-selector-dialog.vue'
import TimeStringDialog from './time-string-dialog.vue'
import CodeReferenceTableDialog from './code-reference-table-dialog.vue'
import CodeSegmentEditor from './code-segment-editor.vue'

const props = defineProps<{
  /** 宿主传入的被管理应用ID；提供任一目标prop时必须同时提供另一项，不从路由补齐。 */
  applicationId?: string
  /** 宿主传入的编码主记录ID；独立路由入口仅在两个目标prop均未提供时读取URL参数。 */
  codeDesignId?: string
  /** 仅由目录宿主明确传入新增模式；沿原查询准备正式身份，不由URL或查询缺失推断。 */
  create?: boolean
}>()
const emit = defineEmits<{saved: []}>()
const route = useRoute(), openDialog = ref(''), error = ref(''), saving = ref(false), revision = ref(0)
const ruleTarget = shallowRef<{nodeId: string | number; busTableRowid: string}>()
const businessTarget = shallowRef<{id: string | number; row: DataRow; generation: number; tableId: unknown; create: boolean}>()
function closeRule(): void {openDialog.value = ''; ruleTarget.value = undefined}
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'data-code-editor-page'})
const scene = LowcodeDataCode.designScenarioId
const dataSet = shallowRef<DataSet>()
const segmentEditor = ref<InstanceType<typeof CodeSegmentEditor>>()
const opening = ref(false)
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true
const hostTarget = computed(() => props.applicationId !== undefined || props.codeDesignId !== undefined)
const applicationId = computed(() => hostTarget.value ? props.applicationId ?? '' : (typeof route.query['applicationId'] === 'string' ? route.query['applicationId'] : ''))
const codeDesignId = computed(() => hostTarget.value ? props.codeDesignId ?? '' : (typeof route.query['codeDesignId'] === 'string' ? route.query['codeDesignId'] : ''))
const mainKey = buildDataViewKey('Base_CodeDesign', 'default', scene), nodesKey = buildDataViewKey('Base_CodeNodeDesign', 'default', scene)
const main = computed(() => dataSet.value?.getView('Base_CodeDesign')), nodes = computed(() => dataSet.value?.getView('Base_CodeNodeDesign'))
const loading = computed(() => {revision.value; return opening.value || !!dataSet.value && Object.values(dataSet.value.tables).some(table => table.viewList.some(view =>
  view.requestState === RequestState.Preparing || view.requestState === RequestState.Loading))})
const busy = computed(() => saving.value || loading.value || !!openDialog.value || segmentEditor.value?.busy === true)
const unconfirmed = computed(() => {revision.value; return [main.value, nodes.value].some(view => view?.hasUnconfirmedSave === true)})
const newDefinition = computed(() => {revision.value; return (main.value?.dirtyTracking.pendingCreateIds.size ?? 0) > 0})
const hasDefinition = computed(() => {revision.value; return main.value?.rows.length === 1})
const missingDefinition = computed(() => {revision.value; return main.value?.requestState === RequestState.Loaded && !main.value.rows.length})
const queryError = computed(() => {revision.value; return Object.values(dataSet.value?.tables ?? {}).flatMap(table => table.viewList)
  .find(view => view.loadingError)?.loadingError?.message ?? ''})
const hasPending = computed(() => {revision.value; return saving.value || !!openDialog.value || segmentEditor.value?.busy === true || [main.value, nodes.value].some(view =>
  view && (view.hasUnconfirmedSave || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()))})
defineExpose({hasPending, busy, unconfirmed, discardChanges: cancel})
onBeforeRouteLeave(() => !hasPending.value)
onBeforeRouteUpdate(() => !hasPending.value)
function openBusinessTable(): void {
  if (busy.value || unconfirmed.value) return
  try {
    const view = main.value, row = view?.currentRow, id = row ? view?.getPkKey(row) : undefined
    if (!view || !row || id === undefined) throw new Error('编码业务表目标缺失')
    for (const field of ['BusTableRowid', 'BusTableName', 'KeyFields']) {
      const access = view.fieldAccess(row, field)
      if (access.read !== 'visible' || access.write !== 'allowed') throw new Error('业务表映射字段不可读写')
    }
    businessTarget.value = {id, row, generation, tableId: (view.getEditingRow(id) ?? row)['BusTableRowid'], create: props.create === true}
    validateBusinessTarget(); openDialog.value = 'businessTable'
  } catch (cause) {businessTarget.value = undefined; error.value = cause instanceof Error ? cause.message : String(cause)}
}
function validateBusinessTarget(): void {
  const target = businessTarget.value, view = main.value, row = view?.currentRow
  if (!active || !target || target.generation !== generation || target.create !== (props.create === true) || !view || !row
    || runtime?.resolveView(mainKey) !== view || row !== target.row || view.getPkKey(row) !== target.id
    || view.queryContext['applicationId'] !== applicationId.value || view.queryContext['codeDesignId'] !== codeDesignId.value
    || view.hasUnconfirmedSave || view.mutating || view.fieldAccess(row, 'AppID').read !== 'visible'
    || (view.getEditingRow(target.id) ?? row)['AppID'] !== applicationId.value
    || (view.getEditingRow(target.id) ?? row)['BusTableRowid'] !== target.tableId) throw new Error('业务表编辑目标已改变，请重新打开')
}
function closeBusinessTable(): void {businessTarget.value = undefined; openDialog.value = ''}
function openInitialization():void {
  if(!dataSet.value||busy.value)return
  try{getCodeInitializationPlan(dataSet.value);openDialog.value='codeInit'}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
}
function openCurrentClass(): void {
  const row = nodes.value?.currentRow
  if (!row || !dataSet.value || !nodes.value || nodes.value.fieldAccess(row, 'NodeType').read !== 'visible'
    || codeNodeTypeLabel(dataSet.value, (nodes.value.getEditingRow(nodes.value.getPkKey(row)!) ?? row)['NodeType']) !== '分类字符串') {error.value = '请选择分类字符串编码段'; return}
  openRule(row)
}
function openRule(row: DataRow): void {
  if (busy.value || unconfirmed.value || !nodes.value || !main.value || !dataSet.value || !row || typeof row !== 'object') return
  const owner = main.value.currentRow
  if (!owner || nodes.value.fieldAccess(row, 'NodeType').read !== 'visible') return
  const label = codeNodeTypeLabel(dataSet.value, (nodes.value.getEditingRow(nodes.value.getPkKey(row)!) ?? row)['NodeType'])
  const dialog = label.includes('时间字符串') ? 'timeString' : label === '父编码串' ? 'parentCode' : label === '顺序号串' ? 'sequence' : label === '分类字符串' ? 'classSelector' : ''
  if (!dialog) {error.value = '该类型规则尚未恢复'; return}
  const needsBusinessFields = dialog === 'timeString' || dialog === 'parentCode'
  if (needsBusinessFields && main.value.fieldAccess(owner, 'BusTableRowid').read !== 'visible') return
  const nodeId = nodes.value.getPkKey(row), busTableRowid = needsBusinessFields ? owner['BusTableRowid'] : ''
  if ((typeof nodeId !== 'string' && typeof nodeId !== 'number') || needsBusinessFields && (typeof busTableRowid !== 'string' || !busTableRowid)) {error.value = '缺少编码段或业务表身份'; return}
  ruleTarget.value = {nodeId, busTableRowid: typeof busTableRowid === 'string' ? busTableRowid : ''}; openDialog.value = dialog
}
watch([applicationId, codeDesignId, () => props.create], async ([app, code, create]) => {
  const own = ++generation
  unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined; dataSet.value = undefined
  error.value = ''; openDialog.value = ''; businessTarget.value = undefined; opening.value = true; saving.value = false
  try {
    if (!app.trim() || !code.trim()) throw new Error('缺少唯一 applicationId 或 codeDesignId 参数')
    if (create && !hostTarget.value) throw new Error('新增编码必须由目录宿主提供完整目标')
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
    sparkProvide(PAGE_RUNTIME, page)
    if (create) {
      const view = loaded.getView('Base_CodeDesign')
      if (!view || view.primaryKey !== 'rowid') throw new Error('新增编码缺少正式主记录视图')
      await view.refresh()
      if (!active || own !== generation) return
      if (view.loadingError) throw view.loadingError
      if (view.rows.length) throw new Error('新增编码身份已存在，请从目录打开原设计')
      const added = await view.addRowWithIdentity({field: 'rowid', value: code}, {AppID: app, Name: '', BusTableRowid: '', BusTableName: '', KeyFields: '', CodeDescription: '', CodeExample: ''})
      if (!active || own !== generation) return
      view.setCurrentRow(added); view.setSelectedRows([added])
    }
    loaded.triggerAutoLoad()
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
  try {nodes.value?.discardPendingChanges(); main.value?.discardPendingChanges(); error.value = ''; return !hasPending.value}
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause); return false}
}
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
</script>

<style scoped>
.structured-editor-page {display:grid; gap:16px; padding:24px;}
.structured-editor-page h1 {margin:0; font-size:1.25rem;}
.structured-editor-actions {display:flex; gap:8px; flex-wrap:wrap;}
</style>
