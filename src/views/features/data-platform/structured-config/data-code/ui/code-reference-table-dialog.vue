<!--
@module app:views/features/data-platform/structured-config/data-code/ui/code-reference-table-dialog
职责：以正式来源视图选择应用、数据库、引用表和两个字段，确认暂存到原分类。
边界：复用当前PageRuntime的按需来源空间；不保存、不复制候选或维护第二份草稿。
AI用途：分类编辑器内的引用表选择，完整绑定及目标身份由宿主传入。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="dataViewKey" title="选择引用表" :width="960" :append-to-body="true" @update:model-value="emit('close')">
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">正在读取引用来源…</p>
    <template v-if="ready">
      <RendererForm :data-view-key="appsKey" :auto-columns="false" :show-data-view-meta="false">
        <FieldSelect data-member="value" :option-data-view-key="appsKey" label="应用" />
      </RendererForm>
      <div class="reference-tables">
        <section><h3>数据库</h3><RendererTable :data-view-key="databasesKey" :children="databaseFields" :highlight-current-row="true" :on-row-click="chooseDatabase" :max-height="300" /></section>
        <section><h3>业务表</h3><RendererTable :data-view-key="tablesKey" :children="tableFields" :highlight-current-row="true" :on-row-click="chooseTable" :max-height="300" /></section>
      </div>
      <RendererForm :data-view-key="textKey" :auto-columns="false" :show-data-view-meta="false">
        <FieldSelect data-member="value" :option-data-view-key="textKey" label="引用字段" />
      </RendererForm>
      <RendererForm :data-view-key="valueKey" :auto-columns="false" :show-data-view-meta="false">
        <FieldSelect data-member="value" :option-data-view-key="valueKey" label="引用表过滤字段" />
      </RendererForm>
    </template>
    <template #footer>
      <RendererButton label="取消选择引用表" @click="emit('close')" />
      <RendererButton label="确定引用表" button-type="primary" :disabled="!ready || busy" @click="confirm" />
    </template>
  </RendererDialog>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import {buildDataViewKey, RequestState, type DataRow, type DataSet, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, FieldSelect, RendererButton, RendererDialog, RendererForm, RendererTable, useSparkComponent} from '@spark-appworks/spark-component'
import {LowcodeDataCode} from '@/lowcode/resources/structured-config/data-code/resource'
import {applyCodeClassReference, projectCodeReferenceSelection} from '@/lowcode/resources/structured-config/data-code/reference-ops'
const props = defineProps<{dataViewKey: string; classId: string | number; validateTarget: () => void}>()
const emit = defineEmits<{close: []; applied: []}>()
const {sparkConsume} = useSparkComponent({type: 'code-reference-table-dialog'}), runtime = sparkConsume(PAGE_RUNTIME)
const target = {...props}, targetView = runtime?.resolveView(target.dataViewKey), targetRow = targetView?.currentRow
const key = (model: string, view = 'default') => buildDataViewKey(model, view, LowcodeDataCode.referenceScenarioId)
const appsKey = key('Base_AppSystemList'), databasesKey = key('Base_AppAndSource_Relation'), tablesKey = key('_Base_TblList')
const textKey = key('Base_TblField', 'textFields'), valueKey = key('Base_TblField', 'valueFields')
const databaseFields: SparkNode[] = [{type: 'r-text', props: {field: 'conName', label: '数据库', readonly: true}}]
const tableFields: SparkNode[] = [{type: 'r-text', props: {field: 'tblname', label: '表名', readonly: true}}, {type: 'r-text', props: {field: 'tbldesc', label: '说明', readonly: true}}]
const ready = ref(false), loading = ref(true), error = ref(''), revision = ref(0)
let active = true, sources: DataSet | undefined, unsubscribe: (() => void) | undefined
const sourceViews = () => [appsKey, databasesKey, tablesKey, textKey, valueKey].map(binding => runtime?.resolveView(binding))
const busy = computed(() => {revision.value; return loading.value || sourceViews().some(view => view?.requestState === RequestState.Loading || view?.requestState === RequestState.Preparing)})
function current(): DataView {
  props.validateTarget()
  if (!active || !runtime || props.dataViewKey !== target.dataViewKey || props.classId !== target.classId || !targetView || !targetRow
    || runtime.resolveView(target.dataViewKey) !== targetView || targetView.currentRow !== targetRow || targetView.getPkKey(targetRow) !== target.classId) throw new Error('分类引用目标已改变')
  return targetView
}
function choose(binding: string, row: DataRow): void {
  try {current(); const view = runtime?.resolveView(binding); view?.setCurrentRow(row); view?.setSelectedRows([row])}
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
function chooseDatabase(row: DataRow): void {choose(databasesKey, row)}
function chooseTable(row: DataRow): void {choose(tablesKey, row)}
function confirm(): void {
  if (!ready.value || busy.value || !sources) return
  try {applyCodeClassReference(current(), target.classId, projectCodeReferenceSelection(sources)); emit('applied'); emit('close')}
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
onMounted(async () => {
  try {
    current(); sources = await runtime!.ensureScenarioLoaded(LowcodeDataCode.referenceScenarioId)
    if (!active) return
    current(); const changed = () => revision.value++
    unsubscribe = sources.onAnyViewChange({rowsChanged: changed, selectedRowsChanged: changed, requestStateChanged: changed})
    for (const view of sourceViews()) {view?.clearSelectedRows(); view?.setCurrentRow(null)}
    sources.triggerAutoLoad(); ready.value = true
  } catch (cause) {if (active) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active) loading.value = false}
})
onBeforeUnmount(() => {active = false; unsubscribe?.()})
</script>
<style scoped>
.reference-tables {display: grid; grid-template-columns: 1fr 2fr; gap: 16px}
.reference-tables section {min-width: 0}
</style>
