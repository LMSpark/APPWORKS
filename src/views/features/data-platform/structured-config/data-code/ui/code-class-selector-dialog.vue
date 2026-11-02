<!--
@module app:views/features/data-platform/structured-config/data-code/ui/code-class-selector-dialog
职责：绑定原分类目录，确认后将已保存规则映射写回原编码节点，取消不改节点。
边界：只消费本次PageRuntime与DataView，目录独立保存，不提交设计或替代引用字段选择。
AI用途：恢复分类编码段的来源选择时复用此弹窗，并提供完整节点绑定及稳定主键。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="catalogKey" title="编码类选择" :width="820" :close-disabled="busy || dirty" @update:model-value="cancel">
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">正在读取分类规则…</p>
    <p v-if="unconfirmed" role="status">目录保存结果尚未确认，请先核验。</p>
    <div v-if="ready">
      <RendererButton label="编辑" :disabled="busy || unconfirmed || !selected" @click="editClass" />
      <RendererButton :data-view-key="catalogKey" label="删除" perm-action="delete" :disabled="busy || unconfirmed || !selected" @click="removeClass" />
      <RendererButton :label="unconfirmed ? '核验目录保存结果' : '保存目录'" :disabled="busy || !dirty" @click="saveCatalog" />
      <RendererButton label="放弃目录修改" :disabled="busy || unconfirmed || !dirty" @click="discardCatalog" />
    </div>
    <RendererTable v-if="ready" :data-view-key="catalogKey" :children="fields" :highlight-current-row="true" :max-height="420" />
    <template #footer>
      <RendererButton label="取消" :disabled="busy || unconfirmed" @click="cancel" />
      <RendererButton label="确定" button-type="primary" :disabled="!ready || busy || !selected || dirty" @click="confirm" />
    </template>
  </RendererDialog>
  <RendererDialog v-if="removing" :model-value="true" :data-view-key="catalogKey" title="删除确认" :width="420" :append-to-body="true"
    :close-disabled="acting" @update:model-value="cancelRemoveClass">
    <p>确定删除所选分类规则？</p>
    <template #footer>
      <RendererButton label="取消删除" :disabled="acting" @click="cancelRemoveClass" />
      <RendererButton :data-view-key="catalogKey" label="确定删除" perm-action="delete" :disabled="acting || unconfirmed" @click="confirmRemoveClass" />
    </template>
  </RendererDialog>
  <CodeClassEditDialog v-if="editing" :data-view-key="catalogKey" :class-id="editing.classId" :bus-table-rowid="editing.busTableRowid" @close="editing = undefined" />
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {buildDataViewKey, parseDataViewKey, RequestState, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, RendererButton, RendererDialog, RendererTable, useSparkComponent} from '@spark-appworks/spark-component'
import {codeNodeTypeLabel, saveCodeClasses, selectCodeClass} from '@/lowcode/resources/structured-config/data-code/design-ops'
import CodeClassEditDialog from './code-class-edit-dialog.vue'
const props = defineProps<{dataViewKey: string; nodeId: string | number}>()
const emit = defineEmits<{close: []}>()
const {sparkConsume} = useSparkComponent({type: 'code-class-selector-dialog'}), runtime = sparkConsume(PAGE_RUNTIME)
const target = {...props}, parsed = parseDataViewKey(target.dataViewKey)
const catalogKey = parsed?.scope ? buildDataViewKey('Base_CodeClassTable', 'default', parsed.scope) : ''
const catalog = shallowRef<DataView>(), ready = ref(false), loading = ref(true), acting = ref(false), error = ref(''), revision = ref(0)
const editing = shallowRef<{classId: string | number; busTableRowid: string}>()
const removing = shallowRef<{id: string | number}>()
let active = true, nodes: DataView | undefined, original: DataRow | null = null, unsubscribe: (() => void) | undefined
const selected = computed(() => {revision.value; return catalog.value?.currentRow})
const busy = computed(() => {revision.value; return loading.value || acting.value || !!editing.value || !!removing.value || catalog.value?.mutating === true})
const unconfirmed = computed(() => {revision.value; return catalog.value?.hasUnconfirmedSave === true})
const dirty = computed(() => {revision.value; return !!catalog.value && (catalog.value.hasUnconfirmedSave || catalog.value.hasEditingChanges() || catalog.value.dirtyTracking.hasPendingChanges())})
const fields: SparkNode[] = Object.entries({Name: '名称', TableName: '引用表名', ValueFieldName: '引用表过滤字段', TextFieldName: '引用字段'})
  .map(([field, label]) => ({type: 'r-text', props: {field, label, readonly: true}}))
function assertTarget(): DataView {
  if (!active || props.dataViewKey !== target.dataViewKey || props.nodeId !== target.nodeId || !nodes || nodes.destroyed || !original
    || runtime?.resolveView(target.dataViewKey) !== nodes || nodes.currentRow !== original || nodes.getPkKey(original) !== target.nodeId
    || !catalog.value || catalog.value.destroyed || runtime.resolveView(catalogKey) !== catalog.value) throw new Error('编码段目标已改变，请重新打开')
  return catalog.value
}
function confirm(): void {
  if (!ready.value || busy.value || dirty.value) return
  try {
    const view = assertTarget(), row = view.currentRow, id = row ? view.getPkKey(row) : undefined
    if (!view.dataSet || id === undefined) throw new Error('请选择已保存的分类规则')
    selectCodeClass(view.dataSet, target.nodeId, id); emit('close')
  } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
function editClass(): void {
  if (!ready.value || busy.value || unconfirmed.value) return
  try {
    const view = assertTarget(), row = view.currentRow, classId = row ? view.getPkKey(row) : undefined
    const main = view.dataSet?.getView('Base_CodeDesign'), owner = main?.currentRow
    if (classId === undefined || !owner || main?.fieldAccess(owner, 'BusTableRowid').read !== 'visible') throw new Error('缺少分类或业务表身份')
    const busTableRowid = owner['BusTableRowid']
    if (typeof busTableRowid !== 'string' || !busTableRowid) throw new Error('当前设计未选择业务表')
    editing.value = {classId, busTableRowid}
  } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
function cancel(): void {
  if (busy.value || unconfirmed.value) return
  if (dirty.value) {error.value = '请先保存或明确放弃目录修改'; return}
  emit('close')
}
function removeClass(): void {
  if (!ready.value || busy.value || unconfirmed.value) return
  try {
    const view = assertTarget(), row = view.currentRow, id = row ? view.getPkKey(row) : undefined
    if (id === undefined) throw new Error('请选择要删除的分类规则')
    removing.value = {id}
  } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
function cancelRemoveClass(): void {if (!acting.value) removing.value = undefined}
async function confirmRemoveClass(): Promise<void> {
  if (!ready.value || loading.value || acting.value || unconfirmed.value || !removing.value) return
  const id = removing.value.id
  acting.value = true; error.value = ''
  try {
    const view = assertTarget(), row = view.currentRow
    if (!row || view.getPkKey(row) !== id) throw new Error('分类删除目标已改变，请重新选择')
    const result = await view.removeRow(id)
    if (result === false || typeof result === 'object' && !result.success) throw new Error(typeof result === 'object' ? result.message ?? '删除未完成' : '删除未完成')
  } catch (cause) {if (active) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active) {removing.value = undefined; acting.value = false; revision.value++}}
}
async function saveCatalog(): Promise<void> {
  if (busy.value) return
  acting.value = true; error.value = ''
  try {
    const view = assertTarget()
    if (!view.dataSet) throw new Error('分类目录数据空间已释放')
    const result = await saveCodeClasses(view.dataSet)
    if (!result.success) throw new Error(result.message ?? '目录保存未完整确认')
  } catch (cause) {if (active) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active) {acting.value = false; revision.value++}}
}
function discardCatalog(): void {
  if (busy.value || unconfirmed.value) return
  try {assertTarget().discardPendingChanges(); error.value = ''; revision.value++}
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
async function open(): Promise<void> {
  try {
    if (!parsed?.scope || parsed.tableName !== 'Base_CodeNodeDesign') throw new Error('分类规则缺少完整节点视图绑定')
    nodes = runtime?.resolveView(target.dataViewKey) ?? undefined
    if (!nodes?.setCurrentRowById(target.nodeId) || !nodes.dataSet) throw new Error('当前编码段不存在')
    original = nodes.currentRow
    if (!original || nodes.fieldAccess(original, 'NodeType').read !== 'visible' || codeNodeTypeLabel(nodes.dataSet, original['NodeType']) !== '分类字符串') throw new Error('当前编码段不是分类字符串')
    catalog.value = runtime?.resolveView(catalogKey) ?? undefined
    if (!catalog.value) throw new Error('分类目录视图缺失')
    const changed = () => revision.value++
    unsubscribe = nodes.dataSet.onAnyViewChange({rowsChanged: changed, editingChanged: changed, currentRowChanged: changed, requestStateChanged: changed, mutatingChanged: changed})
    catalog.value.assertResultReplacementAllowed()
    if (catalog.value.requestState !== RequestState.Loaded) await catalog.value.refresh()
    if (!active) return
    if (catalog.value.loadingError) throw catalog.value.loadingError
    assertTarget(); ready.value = true
  } catch (cause) {if (active) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active) loading.value = false}
}
watch(() => [props.dataViewKey, props.nodeId], (_value, previous) => {
  if (!previous) {void open(); return}
  ready.value = false; error.value = '编码段目标已改变，请重新打开'
}, {immediate: true, flush: 'sync'})
onBeforeUnmount(() => {active = false; unsubscribe?.()})
</script>
