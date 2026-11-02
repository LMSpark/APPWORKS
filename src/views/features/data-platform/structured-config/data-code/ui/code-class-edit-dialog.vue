<!--
@module app:views/features/data-platform/structured-config/data-code/ui/code-class-edit-dialog
职责：在原分类视图编辑名称和字段映射，以独立字段视图提供业务表及引用表候选。
边界：编辑覆盖及取消检查点均由原DataView持有，确认不提交目录或编码设计，不更换引用表。
AI用途：为当前分类恢复已选引用表的字段编辑；提供完整分类绑定、分类主键和实际业务表身份。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="dataViewKey" title="编辑编码分类设计" :width="820" :append-to-body="true"
    :close-disabled="loading || closing" @update:model-value="cancel">
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">正在读取业务表与引用表字段…</p>
    <RendererForm v-if="ready" :data-view-key="dataViewKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="2">
      <FieldText field="Name" label="分类名称" :on-change="guardEdit" />
      <FieldText field="BusTableName" label="业务表名" :readonly="true" />
      <FieldSelect field="BusFilterField" label="业务表过滤字段" :option-data-view-key="businessFieldsKey" :on-change="guardEdit" />
      <FieldText field="TableName" label="引用表名" :readonly="true" />
      <FieldSelect field="TextFieldName" label="引用字段" :option-data-view-key="referenceFieldsKey" :on-change="guardEdit" />
      <FieldSelect field="ValueFieldName" label="引用表过滤字段" :option-data-view-key="referenceFieldsKey" :on-change="guardEdit" />
      <FieldText field="description" label="说明" :on-change="guardEdit" />
    </RendererForm>
    <template #footer>
      <RendererButton label="取消编辑" :disabled="loading || closing" @click="cancel" />
      <RendererButton label="确认编辑" button-type="primary" :disabled="!ready || loading || closing" @click="confirm" />
    </template>
  </RendererDialog>
</template>
<script setup lang="ts">
import {onBeforeUnmount, ref, watch} from 'vue'
import {buildDataViewKey, parseDataViewKey, RequestState, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, FieldSelect, FieldText, RendererButton, RendererDialog, RendererForm, useSparkComponent} from '@spark-appworks/spark-component'
const props = defineProps<{dataViewKey: string; classId: string | number; busTableRowid: string}>()
const emit = defineEmits<{close: []}>()
const {sparkConsume} = useSparkComponent({type: 'code-class-edit-dialog'}), runtime = sparkConsume(PAGE_RUNTIME)
const target = {...props}, parsed = parseDataViewKey(target.dataViewKey)
const businessFieldsKey = parsed?.scope ? buildDataViewKey('Base_TblField', 'default', parsed.scope) : ''
const referenceFieldsKey = parsed?.scope ? buildDataViewKey('Base_TblField', 'referenceFields', parsed.scope) : ''
const loading = ref(true), closing = ref(false), ready = ref(false), error = ref('')
let active = true, view: DataView | undefined, original: DataRow | null = null, referenceId = ''
let checkpoint: ReturnType<DataView['createEditingCheckpoint']> | undefined
function current(): DataRow {
  if (!active || props.dataViewKey !== target.dataViewKey || props.classId !== target.classId || props.busTableRowid !== target.busTableRowid
    || !view || view.destroyed || runtime?.resolveView(target.dataViewKey) !== view || !original || view.currentRow !== original
    || view.getPkKey(original) !== target.classId) throw new Error('分类编辑目标已改变，请重新打开')
  if (view.hasUnconfirmedSave || view.mutating) throw new Error('请先核验目录保存结果')
  const main = view.dataSet?.getView('Base_CodeDesign'), owner = main?.currentRow
  const ownerId = owner ? main?.getPkKey(owner) : undefined
  const effectiveOwner = ownerId === undefined ? owner : main?.getEditingRow(ownerId) ?? owner
  if (!owner || main?.hasUnconfirmedSave || main?.fieldAccess(owner, 'BusTableRowid').read !== 'visible' || effectiveOwner?.['BusTableRowid'] !== target.busTableRowid) throw new Error('业务表目标已改变，请重新打开')
  const row = view.getEditingRow(target.classId) ?? original
  if (view.fieldAccess(original, 'TableRowid').read !== 'visible' || row['TableRowid'] !== referenceId) throw new Error('引用表目标已改变，请重新打开')
  return row
}
function guardEdit(): void {current(); if (!ready.value || loading.value || closing.value) throw new Error('分类当前不可编辑')}
function optionView(key: string, tableId: string): DataView {
  const options = runtime?.resolveView(key)
  if (!options || options.loadingError) throw options?.loadingError ?? new Error('字段候选视图缺失')
  const parameter = options.viewId === 'referenceFields' ? 'referenceTableRowid' : 'busTableRowid'
  if (options.requestState !== RequestState.Loaded || options.queryContext[parameter] !== tableId) throw new Error('字段候选查询目标已改变')
  if (options.rows.some(row => options.fieldAccess(row, 'tblid').read !== 'visible' || row['tblid'] !== tableId)) throw new Error('字段候选不属于当前目标表')
  return options
}
function confirm(): void {
  if (!ready.value || loading.value || closing.value) return
  try {
    const row = current(), business = optionView(businessFieldsKey, target.busTableRowid), reference = optionView(referenceFieldsKey, referenceId)
    if (typeof row['Name'] !== 'string' || !row['Name'].trim()) throw new Error('分类名称不能为空')
    for (const [field, options] of [['BusFilterField', business], ['TextFieldName', reference], ['ValueFieldName', reference]] as const) {
      if (view?.fieldAccess(original, field).read !== 'visible' || !options.rows.some(option => options.fieldAccess(option, 'enname').read === 'visible' && option['enname'] === row[field])) throw new Error('请选择当前表的有效字段映射')
    }
    checkpoint?.release(); checkpoint = undefined; ready.value = false; emit('close')
  } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
function cancel(): void {
  if (loading.value || closing.value) return
  closing.value = true; ready.value = false
  try {checkpoint?.restore(); checkpoint = undefined; emit('close')}
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {closing.value = false}
}
async function open(): Promise<void> {
  try {
    if (!parsed?.scope || parsed.tableName !== 'Base_CodeClassTable' || !target.busTableRowid) throw new Error('分类编辑缺少完整目标绑定')
    view = runtime?.resolveView(target.dataViewKey) ?? undefined
    if (!view?.setCurrentRowById(target.classId)) throw new Error('分类记录不存在')
    original = view.currentRow
    const row = view.getEditingRow(target.classId) ?? original
    if (!row || typeof row['TableRowid'] !== 'string' || !row['TableRowid']) throw new Error('当前分类未选择引用表')
    referenceId = row['TableRowid']; current()
    checkpoint = view.createEditingCheckpoint(target.classId, ['Name', 'description', 'BusFilterField', 'TextFieldName', 'ValueFieldName'])
    const business = view.dataSet?.getView('Base_TblField'), reference = view.dataSet?.getView('Base_TblField', 'referenceFields')
    if (!business || !reference) throw new Error('分类字段候选视图缺失')
    business.queryContext = {...business.queryContext, busTableRowid: target.busTableRowid}
    reference.queryContext = {...reference.queryContext, referenceTableRowid: referenceId}
    await Promise.all([business.refresh(), reference.refresh()])
    if (!active) return
    current(); optionView(businessFieldsKey, target.busTableRowid); optionView(referenceFieldsKey, referenceId); ready.value = true
  } catch (cause) {if (active) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active) loading.value = false}
}
watch(() => [props.dataViewKey, props.classId, props.busTableRowid], (_value, previous) => {
  if (!previous) {void open(); return}
  ready.value = false; error.value = '分类编辑目标已改变，请重新打开'
}, {immediate: true, flush: 'sync'})
onBeforeUnmount(() => {active = false; try {checkpoint?.restore()} catch {checkpoint?.release()} checkpoint = undefined})
</script>
