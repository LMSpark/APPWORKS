<!--
@module app:views/features/data-platform/semi-structured/excel-import/ui/excel-import-target-dialog
职责：按正式DataView级联选择Excel物理目标并预览字段；确认交回原配置命令。
边界：只读来源，不复制候选，不自行暂存或保存目标记录。
AI用途：Excel编辑器选择与替换目标表时复用原PageRuntime及标准容器。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="dataViewKey" title="选择目标数据" :width="1000" :append-to-body="true" @update:model-value="!busy && emit('close')">
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">正在读取目标来源…</p>
    <div v-if="ready" :inert="busy">
      <RendererForm :data-view-key="appsKey" :auto-columns="false" :show-data-view-meta="false">
        <FieldSelect data-member="value" :option-data-view-key="appsKey" label="来源应用" />
      </RendererForm>
      <div class="excel-target-columns">
        <section><h3>数据库</h3><RendererTable :data-view-key="databasesKey" :children="databaseColumns" :highlight-current-row="true" :on-row-click="chooseDatabase" :max-height="220" /></section>
        <section><h3>目标数据表</h3><RendererTable :data-view-key="tablesKey" :children="tableColumns" :highlight-current-row="true" :on-row-click="chooseTable" :max-height="220" /></section>
      </div>
      <h3>字段替换预览</h3>
      <p>确认后暂存目标及完整字段替换，Excel 列号留空；保存配置时一起提交。</p>
      <RendererTable :data-view-key="fieldsKey" :children="fieldColumns" :max-height="250" />
    </div>
    <template #footer>
      <RendererButton label="取消目标选择" :disabled="busy" @click="emit('close')" />
      <RendererButton label="确认并暂存目标及字段" button-type="primary" :disabled="!ready || querying || busy" @click="confirm" />
    </template>
  </RendererDialog>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import {buildDataViewKey, RequestState, type DataRow, type DataSet, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, FieldSelect, RendererButton, RendererDialog, RendererForm, RendererTable, useSparkComponent} from '@spark-appworks/spark-component'
import {LowcodeExcelImport} from '@/lowcode/resources/semi-structured/excel-import/resource'
import {projectExcelTarget} from '@/lowcode/resources/semi-structured/excel-import/target-selection'
const props = defineProps<{dataViewKey: string; recordId: string; busy: boolean; validateTarget: () => void}>()
const emit = defineEmits<{close: []; confirm: [source: DataSet]}>()
const {sparkConsume} = useSparkComponent({type: 'excel-import-target-dialog'}), runtime = sparkConsume(PAGE_RUNTIME)
const original = {runtime, key: props.dataViewKey, recordId: props.recordId}
const key = (table: string, view = 'default') => buildDataViewKey(table, view, LowcodeExcelImport.referenceScenarioId)
const appsKey = key('Base_AppSystemList'), databasesKey = key('Base_AppAndSource_Relation'), tablesKey = key('_Base_TblList'), fieldsKey = key('Base_TblField', 'excelFields')
const databaseColumns: SparkNode[] = [{type: 'r-text', props: {field: 'conName', label: '数据库', readonly: true}}]
const tableColumns: SparkNode[] = [{type: 'r-text', props: {field: 'tblname', label: '表名', readonly: true}}, {type: 'r-text', props: {field: 'tbldesc', label: '说明', readonly: true}}]
const fieldColumns: SparkNode[] = [{type: 'r-text', props: {field: 'enname', label: '字段名称', readonly: true}}, {type: 'r-text', props: {field: 'cnname', label: '标题', readonly: true}}, {type: 'r-text', props: {field: 'DataType', label: '数据类型', readonly: true}}]
const ready = ref(false), loading = ref(true), error = ref(''), revision = ref(0)
let active = true, source: DataSet | undefined, unsubscribe: (() => void) | undefined
const querying = computed(() => {revision.value; return loading.value || [appsKey, databasesKey, tablesKey, fieldsKey].some(binding => {const view = runtime?.resolveView(binding); return view?.requestState === RequestState.Preparing || view?.requestState === RequestState.Loading})})
function current(): void {
  props.validateTarget()
  const view = runtime?.resolveView(props.dataViewKey)
  if (!active || !runtime || runtime !== original.runtime || props.dataViewKey !== original.key || props.recordId !== original.recordId || !view?.currentRow || view.getPkKey(view.currentRow) !== original.recordId) throw new Error('Excel目标选择已过期')
}
function choose(binding: string, row: DataRow): void {
  if (props.busy) return
  try {current(); const view = runtime!.resolveView(binding); view?.setCurrentRow(row); view?.setSelectedRows([row])}
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
function chooseDatabase(row: DataRow): void {choose(databasesKey, row)}
function chooseTable(row: DataRow): void {choose(tablesKey, row)}
function confirm(): void {
  if (props.busy || querying.value || !source) return
  try {current(); projectExcelTarget(source); emit('confirm', source)}
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
onMounted(async () => {
  try {
    current(); source = await runtime!.ensureScenarioLoaded(LowcodeExcelImport.referenceScenarioId); if (!active) return; current()
    unsubscribe = source.onAnyViewChange({rowsChanged: () => revision.value++, requestStateChanged: () => revision.value++})
    for (const binding of [appsKey, databasesKey, tablesKey, fieldsKey]) {const view = runtime!.resolveView(binding); view?.clearSelectedRows(); view?.setCurrentRow(null)}
    source.triggerAutoLoad(); ready.value = true
  } catch (cause) {if (active) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active) loading.value = false}
})
onBeforeUnmount(() => {active = false; unsubscribe?.()})
</script>
<style scoped>
.excel-target-columns {display: grid; grid-template-columns: 1fr 2fr; gap: 16px}
.excel-target-columns section {min-width: 0}
</style>
