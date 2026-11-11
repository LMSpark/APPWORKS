<!--
@module app:views/features/integration/report/ui/report-create-dialog
职责：新增报表：报表头（名称、应用系统、描述）与初始版本（合并报表、看板标志）两条待新增记录在同一次DataSet保存中提交。
边界：两条记录由宿主在正式DataView中预先新增并互相引用；取消时撤销两条待新增，保存结果未确认时保留并提示核验。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="infoKey" title="新增报表" :width="640" :append-to-body="true" :close-disabled="busy"
    @update:model-value="cancel">
    <p v-if="hint" role="alert">{{ hint }}</p>
    <RendererForm :data-view-key="infoKey" :context-row-id="infoId" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
      <FieldText field="RptName" label="报表名称" :readonly="busy" />
      <FieldSelect field="modid" label="应用系统" :option-data-view-key="appKey" :filterable="true" :readonly="busy" />
      <FieldTextarea field="RptDesc" label="报表描述" :readonly="busy" />
    </RendererForm>
    <RendererForm :data-view-key="reportKey" :context-row-id="reportId" :auto-columns="false" :show-data-view-meta="false" :grid-columns="2">
      <FieldCheckbox field="isMerg" label="合并报表" true-value="1" false-value="0" :readonly="busy" />
      <FieldCheckbox field="isDashboards" label="看板" true-value="1" false-value="0" :readonly="busy || merged" />
    </RendererForm>
    <template #footer>
      <RendererButton label="取消" :disabled="busy" @click="cancel" />
      <RendererButton label="确定" button-type="primary" :disabled="busy" @click="submit" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref} from 'vue'
import type {DataRow, DataView} from '@spark-appworks/spark-data'
import * as Components from '@spark-appworks/spark-component'
import {isOn, syncAppName, textOf} from './report-format'
const {PAGE_RUNTIME, RendererDialog, RendererForm, RendererButton, FieldText, FieldTextarea, FieldSelect, FieldCheckbox, useSparkComponent} = Components
const props = defineProps<{infoKey: string; reportKey: string; appKey: string; infoId: string | number; reportId: string | number}>()
const emit = defineEmits<{close: []}>()
const {sparkConsume} = useSparkComponent({type: 'report-create-dialog'})
const busy = ref(false), hint = ref(''), revision = ref(0)

function view(key: string): DataView {
  const found = sparkConsume(PAGE_RUNTIME)?.resolveView(key)
  if (!found) throw new Error(`新增报表缺少正式视图 ${key}`)
  return found
}
const info = view(props.infoKey), report = view(props.reportKey)
const editing = (target: DataView, id: string | number): Readonly<DataRow> | undefined => {
  void revision.value
  return target.getEditingRow(id) ?? undefined
}
const merged = computed(() => isOn(editing(report, props.reportId)?.['isMerg']))
const stop = info.dataSet?.onAnyViewChange({editingFieldChanged: (table, viewId, event) => {
  revision.value++
  if (table === report.tableName && viewId === report.viewId && event.rowId === props.reportId && event.field === 'isMerg' && isOn(event.nextValue)) {
    report.updateEditingValue(props.reportId, 'isDashboards', '0')
  }
}})
onBeforeUnmount(() => stop?.())

function cancel(): void {
  if (busy.value) return
  report.discardPendingChanges([props.reportId])
  info.discardPendingChanges([props.infoId])
  emit('close')
}
async function submit(): Promise<void> {
  hint.value = ''
  const row = editing(info, props.infoId)
  if (!row || !textOf(row, 'RptName')) { hint.value = '请填写报表名称'; return }
  const invalid = syncAppName({info, apps: view(props.appKey), id: props.infoId, row})
  if (invalid) { hint.value = invalid; return }
  busy.value = true
  try {
    const dataSet = info.dataSet
    if (!dataSet) throw new Error('报表视图缺少DataSet')
    const result = await dataSet.saveChanges({views: [
      {tableName: info.tableName, viewId: info.viewId, ids: [props.infoId]},
      {tableName: report.tableName, viewId: report.viewId, ids: [props.reportId]},
    ]})
    if (!result.success) throw new Error(result.error?.message ?? '新增结果未确认，请刷新核验')
    emit('close')
  } catch (cause) {
    hint.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}
</script>
