<!--
@module app:views/features/application/data-menu/ui/data-menu-dialog
职责：新增或编辑一条导航宿主：名称、用途、数据空间、资源、显示字段及值字段。
边界：值写入原Base_DataMenu视图并由公共记录编辑保存；资源与字段候选按所选空间/资源刷新正式视图，切换上游清空下游。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="dataViewKey" :title="created ? '新增导航宿主' : '编辑导航宿主'" :width="620"
    :append-to-body="true" :close-disabled="busy || ownUnconfirmed" @update:model-value="cancel">
    <p v-if="error || hint" role="alert">{{ error || hint }}</p>
    <p v-if="!current" role="status">原导航宿主已变化，请关闭并保留原修改。</p>
    <RendererForm :data-view-key="dataViewKey" :context-row-id="recordId" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
      <FieldText field="Name" label="宿主名称" :maxlength="100" :readonly="locked" />
      <FieldTextarea field="Desc" label="用途描述" :maxlength="500" :readonly="locked" />
      <FieldSelect field="dataSetId" label="数据空间" :option-data-view-key="dataSetKey" :option-label-fields="['Name', 'description']"
        :filterable="true" :readonly="locked" />
      <FieldSelect field="DataName" label="资源选择" :option-data-view-key="modelKey" :option-label-fields="['Type', 'Name']"
        :filterable="true" :readonly="locked || !row?.['dataSetId']" />
      <FieldSelect field="TextField" label="显示字段" :option-data-view-key="fieldKey" :option-label-fields="['description', 'Name']"
        :filterable="true" :readonly="locked || !row?.['DataName']" />
      <FieldSelect field="ValueField" label="值字段" :option-data-view-key="fieldKey" :option-label-fields="['description', 'Name']"
        :filterable="true" :readonly="locked || !row?.['DataName']" />
    </RendererForm>
    <template #footer>
      <RendererButton :label="foreignRecovery || recoveryEnded || hasStaged && !created ? '关闭并保留修改' : confirmedCreation ? '关闭' : '取消'"
        :disabled="busy || ownUnconfirmed" @click="cancel" />
      <RendererButton :label="permissionsPending ? '回读已保存权限' : ownUnconfirmed ? '核验原保存结果' : '确定'" button-type="primary"
        :disabled="busy || foreignRecovery || !permissionsPending && (recoveryEnded || !current && !ownUnconfirmed)" @click="submit" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {ref, watch} from 'vue'
import type {DataRow, DataView} from '@spark-appworks/spark-data'
import * as Components from '@spark-appworks/spark-component'
const {PAGE_RUNTIME, RendererDialog, RendererForm, RendererButton, FieldText, FieldTextarea, FieldSelect, useSparkComponent,
  useDataViewRecordEditing} = Components
const props = withDefaults(defineProps<{dataViewKey: string; recordId: string | number; dataSetKey: string; modelKey: string
  fieldKey: string; created?: boolean}>(), {created: false})
const emit = defineEmits<{close: []}>()
const {sparkConsume} = useSparkComponent({type: 'data-menu-dialog'})
const runtime = () => sparkConsume(PAGE_RUNTIME)
const editable = ['Name', 'Desc', 'dataSetId', 'DataId', 'DataName', 'DataType', 'DbName', 'TextField', 'ValueField', 'ShowType']
const {view, row, busy, current, locked, error, ownUnconfirmed, foreignRecovery, recoveryEnded, hasStaged, permissionsPending,
  confirmedCreation, save, cancel} = useDataViewRecordEditing({mode: 'edit', runtime, dataViewKey: () => props.dataViewKey,
  recordId: () => props.recordId, created: () => props.created, editableFields: editable, onFinish: () => emit('close')})
const hint = ref('')
const text = (source: Readonly<DataRow> | undefined, field: string) => {
  const raw = source?.[field]
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : ''
}
const option = (key: string): DataView => {
  const found = runtime()?.resolveView(key)
  if (!found) throw new Error(`导航宿主缺少正式视图 ${key}`)
  return found
}
const write = (field: string, value: string) => {
  if (text(row.value, field) !== value) view.updateEditingValue(props.recordId, field, value)
}
async function reload(key: string, context: Record<string, string>): Promise<void> {
  const target = option(key)
  target.queryContext = context
  await target.refresh()
  if (target.loadingError) hint.value = target.loadingError.message
}

/** 按资源注册名定位所选空间下的模型，同步宿主类型与库名并装载其字段候选。 */
async function applyResource(): Promise<void> {
  const name = text(row.value, 'DataName')
  const resource = name ? option(props.modelKey).rows.find(item => text(item, 'Name') === name) : undefined
  if (!resource) { option(props.fieldKey).clearAll(); return }
  write('DataType', text(resource, 'Type') || 'Table')
  write('DbName', text(resource, 'DbName'))
  await reload(props.fieldKey, {modelId: text(resource, 'rowid')})
}
// 原页面切换空间清空资源及字段、切换资源清空字段；打开编辑时只装载候选，不清原值。
watch(() => text(row.value, 'dataSetId'), async (dataSetId, previous) => {
  if (previous !== undefined) { write('DataName', ''); write('TextField', ''); write('ValueField', '') }
  write('DataId', dataSetId)
  if (dataSetId) await reload(props.modelKey, {dataSetId})
  else option(props.modelKey).clearAll()
  await applyResource()
}, {immediate: true})
watch(() => text(row.value, 'DataName'), async (name, previous) => {
  if (previous === undefined) return
  write('TextField', ''); write('ValueField', '')
  await applyResource()
})

async function submit(): Promise<void> {
  hint.value = ''
  if (!ownUnconfirmed.value && !permissionsPending.value) {
    if (!text(row.value, 'Name')) { hint.value = '请输入宿主名称'; return }
    if (!text(row.value, 'Desc')) { hint.value = '请输入用途描述'; return }
    if (!text(row.value, 'ShowType')) write('ShowType', 'ChildItem')
  }
  await save()
}
</script>
