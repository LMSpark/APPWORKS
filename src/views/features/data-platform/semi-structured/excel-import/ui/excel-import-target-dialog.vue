<!--
@module app:views/features/data-platform/semi-structured/excel-import/ui/excel-import-target-dialog
职责：按正式DataView级联选择Excel物理目标并预览字段；确认交回原配置命令。
边界：只读来源，不复制候选，不自行暂存或保存目标记录。
AI用途：Excel编辑器选择与替换目标表时复用原PageRuntime及标准容器。
-->
<template><slot /></template>
<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import {buildDataViewKey, RequestState, type DataRow, type DataSet} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'
import {LowcodeExcelImport} from '@/platform-adapters/resources/semi-structured/excel-import/resource'
import {projectExcelTarget} from '@/platform-adapters/resources/semi-structured/excel-import/target-selection'
const props = defineProps<{dataViewKey: string; recordId: string; busy: boolean; validateTarget: () => void}>()
const emit = defineEmits<{close: []; confirm: [source: DataSet]}>()
const {sparkConsume} = useSparkComponent({type: 'excel-import-target-dialog'}), runtime = sparkConsume(PAGE_RUNTIME)
const original = {runtime, key: props.dataViewKey, recordId: props.recordId}
const key = (table: string, view = 'default') => buildDataViewKey(table, view, LowcodeExcelImport.referenceScenarioId)
const appsKey = key('Base_AppSystemList'), databasesKey = key('Base_AppAndSource_Relation'), tablesKey = key('_Base_TblList'), fieldsKey = key('Base_TblField', 'excelFields')
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
defineExpose({
  state: () => ({ready:ready.value,loading:loading.value,error:error.value,busy:props.busy,canConfirm:ready.value&&!querying.value&&!props.busy}),
  bindings: {appsKey,databasesKey,tablesKey,fieldsKey},
  chooseDatabase,chooseTable,confirm,
  close: () => {if(!props.busy)emit('close')},
})
onBeforeUnmount(() => {active = false; unsubscribe?.()})
</script>
