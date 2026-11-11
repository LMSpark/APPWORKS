<!--
@module app:views/features/integration/report/ui/report-version-dialog
职责：报表历史版本：列出本报表的版本，新增/改名/删除版本，启动选中版本（原启用版本停用，报表头切换启用版本及模型）。
边界：版本列表按 RptID 过滤（修正参考实现未过滤且新增遗漏 RptID 的缺陷）；启动在同一次DataSet保存中提交版本状态与报表头。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="versionKey" title="报表设计" :width="900" :append-to-body="true" :close-disabled="busy"
    @update:model-value="close">
    <p v-if="loading" role="status">正在读取版本…</p>
    <p v-if="message" role="alert">{{ message }}</p>
    <RendererButton v-if="ready" label="新增" button-type="primary" :disabled="busy || !!editor" @click="add" />
    <RendererTable v-if="ready" :data-view-key="versionKey" :children="columns" :actions="actions" :stripe="true" :show-row-index="true"
      :show-data-view-meta="false" />
    <FeatureRecordDialog v-if="editor" :key="editor.epoch" :data-view-key="versionKey" :record-id="editor.id" :created="editor.created"
      :title="editor.created ? '新增版本' : '编辑版本'" :specs="specs" @close="closeEditor" />
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, shallowRef} from 'vue'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import * as Components from '@spark-appworks/spark-component'
import FeatureRecordDialog from '@/views/features/shared/record/feature-record-dialog.vue'
import type {FeatureFieldSpec} from '@/views/features/shared/record/feature-field-spec'
import {formatDay, isOn, textOf} from './report-format'
import {commitReportChanges, reportPendingReason} from './report-save'
const {PAGE_RUNTIME, RendererDialog, RendererTable, RendererButton, useSparkComponent} = Components
type RToolbarProps = Components.RToolbarProps
const props = defineProps<{infoKey: string; infoId: string | number; scenarioId: string}>()
const emit = defineEmits<{close: []}>()
const {sparkConsume} = useSparkComponent({type: 'report-version-dialog'})
const versionKey = buildDataViewKey('Base_Report', 'byReport', props.scenarioId)
const creatorKey = buildDataViewKey('Base_UserInfo', 'default', props.scenarioId)
const dataSetKey = buildDataViewKey('Base_DataSet', 'default', props.scenarioId)
const busy = ref(false), loading = ref(true), ready = ref(false), message = ref('')
const editor = shallowRef<Readonly<{id: string | number; created: boolean; epoch: number}>>()
let epoch = 0

function view(key: string): DataView {
  const found = sparkConsume(PAGE_RUNTIME)?.resolveView(key)
  if (!found) throw new Error(`报表版本缺少正式视图 ${key}`)
  return found
}
const failure = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
async function guarded(action: () => Promise<void>): Promise<void> {
  if (busy.value) return
  busy.value = true; message.value = ''
  try { await action() } catch (cause) { message.value = failure(cause) } finally { busy.value = false }
}
function assertSettled(): void {
  const reason = reportPendingReason([view(versionKey), view(props.infoKey)])
  if (reason) throw new Error(reason)
}
async function loadVersions(): Promise<void> {
  const versions = view(versionKey)
  versions.queryContext = {reportId: String(props.infoId)}
  await versions.refresh()
  if (versions.loadingError) throw versions.loadingError
}
onMounted(() => void guarded(async () => {
  try {
    await loadVersions()
    ready.value = true
  } finally { loading.value = false }
}))

const col = (field: string, label: string, minWidth = 140): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, minWidth, sortable: false, showOverflowTooltip: true}})
const columns: SparkNode[] = [
  col('Version', '版本', 120),
  {type: 'r-select', props: {field: 'DataFormID', label: '模型', readonly: true, minWidth: 180, sortable: false, optionDataViewKey: dataSetKey}},
  {type: 'r-select', props: {field: 'createuser', label: '创建人', readonly: true, minWidth: 110, sortable: false, optionDataViewKey: creatorKey}},
  {type: 'r-text', props: {field: 'createtime', label: '创建时间', readonly: true, minWidth: 120, sortable: false, displayFormatter: formatDay}},
  {type: 'r-select', props: {field: 'State', label: '状态', readonly: true, minWidth: 80, sortable: false,
    options: [{value: 1, label: '启用'}, {value: 0, label: '未启用'}, {value: '1', label: '启用'}, {value: '0', label: '未启用'}]}},
]
const specs: readonly FeatureFieldSpec[] = [{field: 'Version', label: '版本名称', required: true}]
const actions = computed<RToolbarProps>(() => {
  const disabled = busy.value || !!editor.value
  const button = (label: string, run: (row: DataRow) => void): SparkNode => ({type: 'r-button', props: {label, disabled, onClick: run}})
  return {children: [button('编辑', row => edit(row)), button('删除', row => void remove(row)), button('启动', row => void activate(row))]}
})

function idOf(target: DataView, row: DataRow): string | number {
  const id = target.getPkKey(row)
  if (id === undefined) throw new Error('版本缺少原生身份')
  return id
}
const add = () => guarded(async () => {
  assertSettled()
  const versions = view(versionKey)
  const active = versions.rows.find(row => isOn(row['State']))
  const created = await versions.addRow({RptID: String(props.infoId), Version: '', State: '0',
    isMerg: isOn(active?.['isMerg']) ? '1' : '0', isDashboards: isOn(active?.['isDashboards']) ? '1' : '0'})
  editor.value = {id: idOf(versions, created), created: true, epoch: ++epoch}
})
function edit(row: DataRow): void {
  try { editor.value = {id: idOf(view(versionKey), row), created: false, epoch: ++epoch} } catch (cause) { message.value = failure(cause) }
}
async function closeEditor(): Promise<void> {
  editor.value = undefined
  await guarded(loadVersions)
}
const remove = (row: DataRow) => guarded(async () => {
  assertSettled()
  const versions = view(versionKey), id = idOf(versions, row)
  if (isOn(row['State'])) throw new Error('启用中的版本不能删除，请先启动其他版本')
  try {
    await versions.removeRow(id)
    await commitReportChanges({label: '删除版本', targets: [{view: versions, ids: [id]}]})
  } finally {
    if (!versions.hasUnconfirmedSave) {
      if (versions.dirtyTracking.hasPendingChanges()) versions.discardPendingChanges([id])
      await loadVersions()
    }
  }
  message.value = '删除成功'
})
const activate = (row: DataRow) => guarded(async () => {
  assertSettled()
  const versions = view(versionKey), info = view(props.infoKey), id = idOf(versions, row)
  const ids = [id]
  try {
    for (const other of versions.rows) {
      const otherId = versions.getPkKey(other)
      if (otherId !== undefined && otherId !== id && isOn(other['State'])) { versions.updateEditingValue(otherId, 'State', '0'); ids.push(otherId) }
    }
    versions.updateEditingValue(id, 'State', '1')
    info.updateEditingValue(props.infoId, 'version_id', String(id))
    info.updateEditingValue(props.infoId, 'version_dataid', textOf(row, 'DataFormID'))
    await commitReportChanges({label: '启动版本', targets: [{view: versions, ids}, {view: info, ids: [props.infoId]}]})
  } finally {
    if (![versions, info].some(item => item.hasUnconfirmedSave)) {
      if (versions.hasEditingChanges() || versions.dirtyTracking.hasPendingChanges()) versions.discardPendingChanges(ids)
      if (info.hasEditingChanges(props.infoId) || info.dirtyTracking.hasPendingChanges(props.infoId)) info.discardPendingChanges([props.infoId])
      await loadVersions()
    }
  }
  message.value = `已启动版本 ${textOf(row, 'Version')}`
})
function close(): void {
  if (!busy.value) emit('close')
}
</script>
