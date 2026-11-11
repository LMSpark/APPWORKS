<!--
@module app:views/features/integration/report/ui/report-model-dialog
职责：为报表的启用版本绑定数据模型（数据空间）：按名称分页查找，确定后报表头与启用版本在同一次DataSet保存中写入。
边界：只修改报表头 version_dataid 与启用版本 DataFormID；候选来自Base_DataSet的picker视图。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="pickerKey" title="选择模型" :width="760" :append-to-body="true" :close-disabled="busy"
    @update:model-value="close">
    <p v-if="message" role="alert">{{ message }}</p>
    <p v-if="selectedName" role="status">已选择：{{ selectedName }}</p>
    <RendererTable v-if="ready" :data-view-key="pickerKey" :children="columns" :filter="filter" :highlight-current-row="true"
      :show-data-view-meta="false" :on-row-click="choose" :pagination="{pageSizes: [10, 20, 50], showJumper: true}" />
    <template #footer>
      <RendererButton label="取消" :disabled="busy" @click="close" />
      <RendererButton label="确定" button-type="primary" :disabled="busy || !selectedId" @click="submit" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {onMounted, ref} from 'vue'
import type {DataRow, DataView, SparkNode} from '@spark-appworks/spark-data'
import * as Components from '@spark-appworks/spark-component'
import {formatDay, textOf} from './report-format'
import {commitReportChanges, reportPendingReason} from './report-save'
const {PAGE_RUNTIME, RendererDialog, RendererTable, RendererButton, useSparkComponent} = Components
type RFilterProps = Components.RFilterProps
const props = defineProps<{infoKey: string; reportKey: string; pickerKey: string; infoId: string | number}>()
const emit = defineEmits<{close: []}>()
const {sparkConsume} = useSparkComponent({type: 'report-model-dialog'})
const busy = ref(false), ready = ref(false), message = ref(''), selectedId = ref(''), selectedName = ref('')

function view(key: string): DataView {
  const found = sparkConsume(PAGE_RUNTIME)?.resolveView(key)
  if (!found) throw new Error(`选择模型缺少正式视图 ${key}`)
  return found
}
const failure = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
onMounted(async () => {
  busy.value = true
  try {
    const picker = view(props.pickerKey)
    await picker.refresh()
    if (picker.loadingError) throw picker.loadingError
    ready.value = true
  } catch (cause) { message.value = failure(cause) } finally { busy.value = false }
})

const columns: SparkNode[] = [
  {type: 'r-text', props: {field: 'Name', label: '名称', readonly: true, minWidth: 260, sortable: false, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'createtime', label: '创建时间', readonly: true, minWidth: 120, sortable: false, displayFormatter: formatDay}},
]
const filter: RFilterProps = {
  autoQuery: false, queryOnReset: true, firstPageOnSearch: true, showExpressionEditor: false, showDataViewMeta: false,
  children: [{type: 'r-text', props: {field: 'Name', label: '名称', placeholder: '名称', filterTrim: true}}],
}
function choose(row: DataRow): void {
  selectedId.value = textOf(row, 'rowid'); selectedName.value = textOf(row, 'Name')
}
async function submit(): Promise<void> {
  if (busy.value || !selectedId.value) return
  busy.value = true; message.value = ''
  const info = view(props.infoKey), report = view(props.reportKey)
  let versionId = ''
  try {
    const reason = reportPendingReason([info, report])
    if (reason) throw new Error(reason)
    versionId = textOf(info.getEditingRow(props.infoId) ?? undefined, 'version_id')
    if (!versionId || !report.getEditingRow(versionId)) throw new Error('该报表的启用版本不存在，请先在历史版本中启动一个版本')
    info.updateEditingValue(props.infoId, 'version_dataid', selectedId.value)
    report.updateEditingValue(versionId, 'DataFormID', selectedId.value)
    await commitReportChanges({label: '绑定模型', targets: [{view: info, ids: [props.infoId]}, {view: report, ids: [versionId]}]})
    emit('close')
  } catch (cause) {
    message.value = failure(cause)
    if (versionId && ![info, report].some(item => item.hasUnconfirmedSave)) {
      try {
        if (info.hasEditingChanges(props.infoId) || info.dirtyTracking.hasPendingChanges(props.infoId)) info.discardPendingChanges([props.infoId])
        if (report.hasEditingChanges(versionId) || report.dirtyTracking.hasPendingChanges(versionId)) report.discardPendingChanges([versionId])
      } catch (discard) { message.value += `；撤销本地修改失败：${failure(discard)}` }
    }
  } finally { busy.value = false }
}
function close(): void {
  if (!busy.value) emit('close')
}
</script>
