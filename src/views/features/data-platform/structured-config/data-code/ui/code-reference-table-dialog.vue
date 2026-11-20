<!--
@module app:views/features/data-platform/structured-config/data-code/ui/code-reference-table-dialog
职责：以正式来源视图选择应用、数据库、表和两个字段，确认暂存到原分类或编码业务表。
边界：复用当前PageRuntime的按需来源空间；不保存、不复制候选或维护第二份草稿。
AI用途：分类编辑器内的引用表选择，完整绑定及目标身份由宿主传入。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="dataViewKey" :title="business ? '业务表及其字段选择' : '选择引用表'" :width="960" :append-to-body="true" @update:model-value="emit('close')">
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">正在读取引用来源…</p>
    <RendererForm :data-view-key="dataViewKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="2">
      <FieldText :field="business ? 'BusTableName' : 'TableName'" label="当前表名" :readonly="true" />
      <FieldText v-if="business" field="KeyFields" label="当前主键字段" :readonly="true" />
      <template v-else>
        <FieldText field="TextFieldName" label="当前引用字段" :readonly="true" />
        <FieldText field="ValueFieldName" label="当前过滤字段" :readonly="true" />
      </template>
    </RendererForm>
    <RendererButton v-if="mode !== 'browse'" label="浏览其他来源" :disabled="loading || !sources" @click="browse" />
    <RendererButton v-else-if="reference" label="当前引用" :disabled="busy" @click="restoreCurrent" />
    <template v-if="ready && mode === 'browse'">
      <RendererForm :data-view-key="appsKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
        <FieldSelect data-member="value" :option-data-view-key="appsKey" label="应用" />
      </RendererForm>
      <div class="reference-tables">
        <section><h3>数据库</h3><RendererTable :data-view-key="databasesKey" :children="databaseFields" :highlight-current-row="true" :on-row-click="chooseDatabase" :max-height="300" /></section>
        <section><h3>业务表</h3><RendererTable :data-view-key="tablesKey" :children="tableFields" :highlight-current-row="true" :on-row-click="chooseTable" :max-height="300" /></section>
      </div>
    </template>
    <template v-if="ready && mode === 'stored'">
      <p>按当前表身份恢复；来源应用和数据库未保存在编码引用中。</p>
      <p v-if="business">业务表的显示字段不保存，重开时不会推测。</p>
      <section><h3>当前引用表</h3><RendererTable :data-view-key="storedTableKey" :children="tableFields" :highlight-current-row="true" :max-height="180" /></section>
    </template>
    <template v-if="ready">
      <RendererForm v-if="mode === 'browse' || !business" :data-view-key="textKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
        <FieldSelect data-member="value" :option-data-view-key="textKey" :label="business ? '显示字段' : '引用字段'" />
      </RendererForm>
      <RendererForm :data-view-key="valueKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
        <FieldSelect data-member="value" :option-data-view-key="valueKey" :label="business ? '主键字段' : '引用表过滤字段'" />
      </RendererForm>
    </template>
    <template #footer>
      <RendererButton :label="business ? '取消选择业务表' : '取消选择引用表'" @click="emit('close')" />
      <RendererButton :label="business ? '确定业务表' : '确定引用表'" button-type="primary" :disabled="!ready || busy" @click="confirm" />
    </template>
  </RendererDialog>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, shallowRef} from 'vue'
import {buildDataViewKey, RequestState, type DataRow, type DataSet, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, FieldSelect, FieldText, RendererButton, RendererDialog, RendererForm, RendererTable, useSparkComponent} from '@spark-appworks/spark-component'
import {LowcodeDataCode} from '@/lowcode/resources/structured-config/data-code/resource'
import {applyCodeBusinessTable, applyCodeClassReference, projectCodeReferenceSelection, projectCodeStoredSelection,
  readCodeStoredReference, restoreCodeStoredReference, type CodeStoredReference} from '@/lowcode/resources/structured-config/data-code/reference-ops'
const props = defineProps<{dataViewKey: string; recordId: string | number; targetKind: 'class' | 'business'; validateTarget: () => void}>()
const emit = defineEmits<{close: []; applied: []}>()
const {sparkConsume} = useSparkComponent({type: 'code-reference-table-dialog'}), runtime = sparkConsume(PAGE_RUNTIME)
const target = {...props}, targetView = runtime?.resolveView(target.dataViewKey), targetRow = targetView?.currentRow
const business = target.targetKind === 'business'
const key = (model: string, view = 'default') => buildDataViewKey(model, view, LowcodeDataCode.referenceScenarioId)
const appsKey = key('Base_AppSystemList'), databasesKey = key('Base_AppAndSource_Relation'), tablesKey = key('_Base_TblList'), storedTableKey = key('_Base_TblList', 'storedObject')
const textKey = computed(() => key('Base_TblField', mode.value === 'stored' ? 'storedTableText' : 'textFields'))
const valueKey = computed(() => key('Base_TblField', mode.value === 'stored' ? 'storedTableValue' : 'valueFields'))
const databaseFields: SparkNode[] = [{type: 'r-text', props: {field: 'conName', label: '数据库', readonly: true}}]
const tableFields: SparkNode[] = [{type: 'r-text', props: {field: 'tblname', label: '表名', readonly: true}}, {type: 'r-text', props: {field: 'tbldesc', label: '说明', readonly: true}}]
const ready = ref(false), loading = ref(true), error = ref(''), revision = ref(0), mode = ref<'restoring' | 'stored' | 'browse' | 'unresolved'>('restoring')
const reference = shallowRef<CodeStoredReference>()
let active = true, generation = 0, browseInitialized = false, sources: DataSet | undefined, unsubscribe: (() => void) | undefined
const sourceViews = () => [appsKey, databasesKey, tablesKey, storedTableKey, textKey.value, valueKey.value].map(binding => runtime?.resolveView(binding))
const busy = computed(() => {revision.value; return loading.value || sourceViews().some(view => view?.requestState === RequestState.Loading || view?.requestState === RequestState.Preparing)})
function current(): DataView {
  props.validateTarget()
  if (!active || !runtime || props.dataViewKey !== target.dataViewKey || props.recordId !== target.recordId || props.targetKind !== target.targetKind || !targetView || !targetRow
    || runtime.resolveView(target.dataViewKey) !== targetView || targetView.currentRow !== targetRow || targetView.getPkKey(targetRow) !== target.recordId) throw new Error('编码来源目标已改变')
  return targetView
}
function choose(binding: string, row: DataRow): void {
  try {current(); const view = runtime?.resolveView(binding); view?.setCurrentRow(row); view?.setSelectedRows([row])}
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
function chooseDatabase(row: DataRow): void {choose(databasesKey, row)}
function chooseTable(row: DataRow): void {choose(tablesKey, row)}
function sameReference(left: CodeStoredReference | undefined, right: CodeStoredReference | undefined): boolean {
  return left?.tableId === right?.tableId && left?.tableName === right?.tableName && left?.textField === right?.textField && left?.valueField === right?.valueField
}
function browse(): void {
  if (!active || !sources) return
  generation++
  try {
    current()
    if (!browseInitialized) {
      for (const binding of [appsKey, databasesKey, tablesKey, key('Base_TblField', 'textFields'), key('Base_TblField', 'valueFields')]) {
        const view = runtime?.resolveView(binding); view?.clearSelectedRows(); view?.setCurrentRow(null)
      }
      browseInitialized = true
    }
    error.value = ''; mode.value = 'browse'; ready.value = true; loading.value = false; sources.triggerAutoLoad()
  } catch (cause) {mode.value = 'unresolved'; ready.value = false; loading.value = false; error.value = cause instanceof Error ? cause.message : String(cause)}
}
async function restoreCurrent(): Promise<void> {
  if (!active || !sources) return
  const own = ++generation
  mode.value = 'restoring'; ready.value = false; loading.value = true; error.value = ''
  try {
    const captured = readCodeStoredReference(current(), target.targetKind); reference.value = captured
    if (!captured) {browse(); return}
    const check = () => {
      if (!active || own !== generation || !sameReference(readCodeStoredReference(current(), target.targetKind), captured)) throw new Error('编码引用目标或草稿已改变')
    }
    await restoreCodeStoredReference({dataSet: sources, reference: captured, kind: target.targetKind, check}); check()
    mode.value = 'stored'; ready.value = true
  } catch (cause) {
    if (active && own === generation) {mode.value = 'unresolved'; error.value = `当前引用未能定位，原值已保留。${cause instanceof Error ? cause.message : String(cause)}`}
  } finally {if (active && own === generation) loading.value = false}
}
function confirm(): void {
  if (!ready.value || busy.value || !sources) return
  try {
    const view = current(), saved = reference.value
    if (mode.value === 'stored' && (!saved || !sameReference(readCodeStoredReference(view, target.targetKind), saved))) throw new Error('编码引用目标或草稿已改变')
    const selection = mode.value === 'stored' ? projectCodeStoredSelection(sources, target.targetKind, saved?.tableName) : projectCodeReferenceSelection(sources)
    if (mode.value === 'stored') {
      if (!saved || selection.TableRowid !== saved.tableId) throw new Error('编码引用目标或草稿已改变')
      if (saved.tableName && selection.ValueFieldName === saved.valueField && (business || selection.TextFieldName === saved.textField)) {emit('close'); return}
    }
    if (business) applyCodeBusinessTable(view, target.recordId, selection)
    else applyCodeClassReference(view, target.recordId, selection)
    emit('applied'); emit('close')
  }
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
onMounted(async () => {
  try {
    current(); sources = await runtime!.ensureScenarioLoaded(LowcodeDataCode.referenceScenarioId)
    if (!active) return
    current(); const changed = () => revision.value++
    unsubscribe = sources.onAnyViewChange({rowsChanged: changed, selectedRowsChanged: changed, requestStateChanged: changed})
    await restoreCurrent()
  } catch (cause) {if (active) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active) loading.value = false}
})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.()})
</script>
<style scoped>
.reference-tables {display: grid; grid-template-columns: 1fr 2fr; gap: 16px}
.reference-tables section {min-width: 0}
</style>
