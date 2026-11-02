<!--
@module app:views/features/data-platform/structured-config/data-code/ui/code-class-selector-dialog
职责：绑定原分类目录，确认后将已保存规则映射写回原编码节点，取消不改节点。
边界：只消费本次PageRuntime与DataView，不提交目录或设计，不替代分类维护页。
AI用途：恢复分类编码段的来源选择时复用此弹窗，并提供完整节点绑定及稳定主键。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="catalogKey" title="编码类选择" :width="820" :close-disabled="loading" @update:model-value="cancel">
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">正在读取分类规则…</p>
    <RendererTable v-if="ready" :data-view-key="catalogKey" :children="fields" :highlight-current-row="true" :max-height="420" />
    <template #footer>
      <RendererButton label="取消" :disabled="loading" @click="cancel" />
      <RendererButton label="确定" button-type="primary" :disabled="!ready || loading || !selected || dirty" @click="confirm" />
    </template>
  </RendererDialog>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {buildDataViewKey, parseDataViewKey, RequestState, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, RendererButton, RendererDialog, RendererTable, useSparkComponent} from '@spark-appworks/spark-component'
import {codeNodeTypeLabel, selectCodeClass} from '@/lowcode/resources/structured-config/data-code/design-ops'
const props = defineProps<{dataViewKey: string; nodeId: string | number}>()
const emit = defineEmits<{close: []}>()
const {sparkConsume} = useSparkComponent({type: 'code-class-selector-dialog'}), runtime = sparkConsume(PAGE_RUNTIME)
const target = {...props}, parsed = parseDataViewKey(target.dataViewKey)
const catalogKey = parsed?.scope ? buildDataViewKey('Base_CodeClassTable', 'default', parsed.scope) : ''
const catalog = shallowRef<DataView>(), ready = ref(false), loading = ref(true), error = ref(''), revision = ref(0)
let active = true, nodes: DataView | undefined, original: DataRow | null = null, unsubscribe: (() => void) | undefined
const selected = computed(() => {revision.value; return catalog.value?.currentRow})
const dirty = computed(() => {revision.value; return !!catalog.value && (catalog.value.hasUnconfirmedSave || catalog.value.hasEditingChanges() || catalog.value.dirtyTracking.hasPendingChanges())})
const fields: SparkNode[] = Object.entries({Name: '名称', TableName: '引用表名', ValueFieldName: '引用表过滤字段', TextFieldName: '引用字段', BusFilterField: '业务表过滤字段'})
  .map(([field, label]) => ({type: 'r-text', props: {field, label, readonly: true}}))
function assertTarget(): DataView {
  if (!active || props.dataViewKey !== target.dataViewKey || props.nodeId !== target.nodeId || !nodes || nodes.destroyed || !original
    || runtime?.resolveView(target.dataViewKey) !== nodes || nodes.currentRow !== original || nodes.getPkKey(original) !== target.nodeId
    || !catalog.value || catalog.value.destroyed || runtime.resolveView(catalogKey) !== catalog.value) throw new Error('编码段目标已改变，请重新打开')
  return catalog.value
}
function confirm(): void {
  if (!ready.value || loading.value || dirty.value) return
  try {
    const view = assertTarget(), row = view.currentRow, id = row ? view.getPkKey(row) : undefined
    if (!view.dataSet || id === undefined) throw new Error('请选择已保存的分类规则')
    selectCodeClass(view.dataSet, target.nodeId, id); emit('close')
  } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
function cancel(): void {if (!loading.value) emit('close')}
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
