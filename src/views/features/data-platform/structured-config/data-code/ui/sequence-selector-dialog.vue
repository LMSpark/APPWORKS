<!-- @module app:views/features/data-platform/structured-config/data-code/ui/sequence-selector-dialog -->
<template>
  <RendererDialog :model-value="true" :data-view-key="sequenceKey" title="顺序号串编辑" :width="760" :close-disabled="busy || unconfirmed || dirty" @update:model-value="close">
    <template #header-actions>
      <RendererButton label="确定" button-type="primary" :disabled="locked || dirty || !selected" @click="confirm" />
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="unconfirmed" role="status">目录保存结果尚未确认，请先核验。</p>
    <template v-if="ready">
      <div class="sequence-toolbar">
        <RendererButton :data-view-key="sequenceKey" label="新增" perm-action="create" :disabled="locked" @click="add" />
        <RendererButton :data-view-key="sequenceKey" label="删除" perm-action="delete" :disabled="locked" @click="remove" />
        <RendererButton :label="unconfirmed ? '核验保存结果' : '保存'" :disabled="busy || !dirty && !unconfirmed" @click="save" />
      </div>
      <RendererTable :data-view-key="sequenceKey" :children="fields" :highlight-current-row="true" :max-height="380" />
    </template>
    <p v-else-if="busy" role="status">正在读取顺序号规则…</p>
    <template #footer>
      <RendererButton label="关闭" :disabled="busy || unconfirmed" @click="close" />
      <RendererButton label="放弃修改并关闭" :disabled="busy || unconfirmed" @click="discard" />
    </template>
  </RendererDialog>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {buildDataViewKey, parseDataViewKey, RequestState, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, RendererButton, RendererDialog, RendererTable, useSparkComponent} from '@spark-appworks/spark-component'
import {codeNodeTypeLabel, saveCodingSequences, selectCodingSequence} from '@/lowcode/resources/structured-config/data-code/design-ops'
const props = defineProps<{dataViewKey: string; nodeId: string | number}>()
const emit = defineEmits<{close: []}>()
const {sparkConsume} = useSparkComponent({type: 'sequence-selector-dialog'}), runtime = sparkConsume(PAGE_RUNTIME)
const target = {...props}, parsed = parseDataViewKey(target.dataViewKey)
const sequenceKey = parsed?.scope ? buildDataViewKey('Base_CodingSequence', 'default', parsed.scope) : ''
const view = shallowRef<DataView>(), ready = ref(false), acting = ref(true), error = ref(''), revision = ref(0)
let active = true, nodes: DataView | undefined, original: DataRow | null = null, unsubscribe: (() => void) | undefined
const busy = computed(() => {revision.value; return acting.value || view.value?.requestState === RequestState.Preparing || view.value?.requestState === RequestState.Loading})
const dirty = computed(() => {revision.value; return !!view.value && (view.value.hasEditingChanges() || view.value.dirtyTracking.hasPendingChanges())})
const unconfirmed = computed(() => {revision.value; return view.value?.hasUnconfirmedSave === true})
const locked = computed(() => !ready.value || busy.value || unconfirmed.value)
const selected = computed(() => {revision.value; return view.value?.currentRow ?? null})
function assertTarget(): DataView {
  if (!active || props.dataViewKey !== target.dataViewKey || props.nodeId !== target.nodeId || !nodes || nodes.destroyed
    || runtime?.resolveView(target.dataViewKey) !== nodes || nodes.currentRow !== original || !original || nodes.getPkKey(original) !== target.nodeId
    || !view.value || view.value.destroyed || runtime.resolveView(sequenceKey) !== view.value) throw new Error('编码段目标已改变，请重新打开')
  return view.value
}
function guardEdit(): void {assertTarget(); if (!ready.value || busy.value || unconfirmed.value) throw new Error('顺序号规则当前不可编辑')}
const fields = computed<SparkNode[]>(() => Object.entries({Name: '名称', Incre: '增量', StartNo: '开始段', EndNo: '结束段', Format: '起始值-最大值'}).map(([field, label]) => ({type: 'r-text', props: {
  field, label, editOnDblclick: true, readonly: !ready.value || busy.value || unconfirmed.value, onChange: guardEdit,
}})))
async function act(command: (catalog: DataView) => unknown): Promise<void> {
  if (busy.value) return
  acting.value = true; error.value = ''
  try {await command(assertTarget())}
  catch (cause) {if (active) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active) {acting.value = false; revision.value++}}
}
async function add(): Promise<void> {await act(async catalog => {
  if (catalog.hasUnconfirmedSave) throw new Error('请先核验保存结果')
  const added = await catalog.addRow({Name: '', Incre: '', StartNo: '', EndNo: '', Format: ''})
  catalog.setCurrentRow(added)
})}
async function remove(): Promise<void> {await act(async catalog => {
  if (catalog.hasUnconfirmedSave) throw new Error('请先核验保存结果')
  const row = catalog.currentRow, id = row ? catalog.getPkKey(row) : undefined
  if (id === undefined) throw new Error('请选择要删除的规则')
  const result = await catalog.removeRow(id)
  if (typeof result === 'object' && !result.success) throw new Error(result.message ?? '删除未完成')
})}
async function save(): Promise<void> {await act(async catalog => {
  if (!catalog.dataSet) throw new Error('顺序号目录数据空间已释放')
  const result = await saveCodingSequences(catalog.dataSet)
  if (!result.success) throw new Error(result.message ?? '目录保存未完整确认')
})}
function close(): void {
  if (busy.value) return
  if (dirty.value || unconfirmed.value) {error.value = '请先保存或明确放弃目录修改'; return}
  emit('close')
}
async function discard(): Promise<void> {await act(catalog => {
  if (catalog.hasUnconfirmedSave) throw new Error('请先核验保存结果')
  catalog.discardPendingChanges(); emit('close')
})}
function confirm(): void {
  if (locked.value || dirty.value) return
  try {
    const catalog = assertTarget(), row = catalog.currentRow, id = row ? catalog.getPkKey(row) : undefined
    if (!catalog.dataSet || id === undefined) throw new Error('请选择已保存的顺序号规则')
    selectCodingSequence(catalog.dataSet, target.nodeId, id); emit('close')
  } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
async function open(): Promise<void> {
  try {
    if (!parsed?.scope || parsed.tableName !== 'Base_CodeNodeDesign') throw new Error('顺序号规则缺少完整节点视图绑定')
    nodes = runtime?.resolveView(target.dataViewKey) ?? undefined
    if (!nodes?.setCurrentRowById(target.nodeId) || !nodes.dataSet) throw new Error('当前编码段不存在')
    original = nodes.currentRow
    if (!original || nodes.fieldAccess(original, 'NodeType').read !== 'visible' || codeNodeTypeLabel(nodes.dataSet, (nodes.getEditingRow(target.nodeId) ?? original)['NodeType']) !== '顺序号串') throw new Error('当前编码段不是顺序号串')
    view.value = runtime?.resolveView(sequenceKey) ?? undefined
    if (!view.value) throw new Error('顺序号目录视图缺失')
    const changed = () => revision.value++
    unsubscribe = nodes.dataSet.onAnyViewChange({rowsChanged: changed, editingChanged: changed, requestStateChanged: changed, currentRowChanged: changed, mutatingChanged: changed})
    if (view.value.requestState !== RequestState.Loaded && !view.value.hasUnconfirmedSave) await view.value.refresh()
    if (!active) return
    if (view.value.loadingError) throw view.value.loadingError
    assertTarget(); ready.value = true
  } catch (cause) {if (active) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active) acting.value = false}
}
watch(() => [props.dataViewKey, props.nodeId], (_value, previous) => {
  if (!previous) {void open(); return}
  ready.value = false; error.value = '编码段目标已改变，请重新打开'
}, {immediate: true, flush: 'sync'})
onBeforeUnmount(() => {active = false; unsubscribe?.()})
</script>
<style scoped>
.sequence-toolbar {display:flex;gap:8px;margin-bottom:12px;}
</style>
