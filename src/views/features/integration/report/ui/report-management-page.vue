<!--
@module app:views/features/integration/report/ui/report-management-page
职责：业务报表管理：按名称、描述、使用状态、应用系统查询报表，新增（报表头与初始版本同批提交）、编辑、删除，维护历史版本及版本绑定模型。
边界：列表、选项与编辑都绑定FB29数据空间的正式DataView，经DataSet提交；报表设计/预览依赖报表引擎，模板上传依赖设计文件区，均未在本页承接。
AI用途：迁移参考仓 integration/report 页面时，核对报表头与版本双表写入、启用版本切换及模型绑定。
-->
<template>
  <section class="report-page">
    <header class="report-page__header">
      <h1>业务报表管理</h1>
      <div v-if="ready" class="report-page__actions">
        <RendererButton label="新增" button-type="primary" :disabled="busy || !!dialog" @click="create" />
        <RendererButton :data-view-key="viewKey" label="刷新" action="refresh" :disabled="busy || !!dialog" />
      </div>
    </header>
    <p v-if="loading" role="status">正在读取报表列表…</p>
    <p v-if="error || message" role="alert">{{ error || message }}</p>
    <RendererButton v-if="error && !loading && !ready" label="重试" @click="loadCurrentRoute" />
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="columns" :filter="filter" :actions="actions"
      :stripe="true" :show-row-index="true" :show-data-view-meta="false"
      :pagination="{pageSizes: [10, 20, 50], showJumper: true}" />
    <ReportCreateDialog v-if="ready && dialog?.kind === 'create' && dialog.reportId !== undefined" :key="dialog.epoch" :info-key="viewKey"
      :report-key="reportKey" :app-key="appKey" :info-id="dialog.infoId" :report-id="dialog.reportId" @close="closeDialog" />
    <FeatureRecordDialog v-if="ready && dialog?.kind === 'edit'" :key="dialog.epoch" :data-view-key="viewKey" :record-id="dialog.infoId"
      title="编辑报表" :specs="editSpecs" :validate="validateEdit" @close="closeDialog" />
    <ReportVersionDialog v-if="ready && dialog?.kind === 'version'" :key="dialog.epoch" :info-key="viewKey" :info-id="dialog.infoId"
      :scenario-id="scenarioId" @close="closeDialog" />
    <ReportModelDialog v-if="ready && dialog?.kind === 'model'" :key="dialog.epoch" :info-key="viewKey" :report-key="reportKey"
      :picker-key="pickerKey" :info-id="dialog.infoId" @close="closeDialog" />
  </section>
</template>

<script setup lang="ts">
import {computed, ref, shallowRef} from 'vue'
import {onBeforeRouteLeave, onBeforeRouteUpdate} from 'vue-router'
import {ElMessageBox} from 'element-plus'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {RendererButton, RendererTable, type RFilterProps, type RToolbarProps} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import FeatureRecordDialog from '@/views/features/shared/record/feature-record-dialog.vue'
import type {FeatureFieldSpec} from '@/views/features/shared/record/feature-field-spec'
import ReportCreateDialog from './report-create-dialog.vue'
import ReportVersionDialog from './report-version-dialog.vue'
import ReportModelDialog from './report-model-dialog.vue'
import {formatDay, syncAppName, textOf} from './report-format'

const scenarioId = 'FB291E325272007AEED8921C28B93CFD'
const key = (model: string, view = 'default') => buildDataViewKey(model, view, scenarioId)
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: 'Base_ReportInfo', componentType: 'report-management-page', title: '业务报表管理',
  optionModels: ['Base_Report', 'Base_AppSystemList', 'Base_UserInfo', 'Base_DataSet', '功能导航状态字典'],
})
const reportKey = key('Base_Report'), appKey = key('Base_AppSystemList'), userKey = key('Base_UserInfo')
const dataSetKey = key('Base_DataSet'), pickerKey = key('Base_DataSet', 'picker'), statusKey = key('功能导航状态字典')

type Dialog = Readonly<{kind: 'create' | 'edit' | 'version' | 'model'; infoId: string | number; reportId?: string | number; epoch: number}>
const busy = ref(false), message = ref('')
const dialog = shallowRef<Dialog>()
let epoch = 0

function hasPending(): boolean {
  const runtime = session.runtime
  if (busy.value || dialog.value?.kind === 'create' || runtime?.isDirty) return true
  if (!runtime || runtime.destroyed) return false
  return runtime.call.scenarioIds.some(id => {
    const dataSet = runtime.getDataSet(id)
    return dataSet && Object.values(dataSet.tables).some(table => table.viewList.some(item =>
      item.mutating || item.hasUnconfirmedSave || item.hasPendingSavedRowPermissions))
  })
}
useSystemPageDirtySource({get isDirty() {return hasPending()}})
onBeforeRouteLeave(() => !hasPending())
onBeforeRouteUpdate(() => !hasPending())

function view(target: string): DataView {
  const found = session.runtime?.resolveView(target)
  if (!found) throw new Error(`业务报表管理缺少正式视图 ${target}`)
  return found
}
const failure = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
async function guarded(action: () => Promise<void>): Promise<void> {
  if (busy.value) return
  busy.value = true; message.value = ''
  try { await action() } catch (cause) { message.value = failure(cause) } finally { busy.value = false }
}

const col = (field: string, label: string, minWidth = 140): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, minWidth, sortable: false, showOverflowTooltip: true}})
type LookupColumn = Readonly<{field: string; label: string; optionDataViewKey: string; minWidth?: number}>
const lookup = ({field, label, optionDataViewKey, minWidth = 140}: LookupColumn): SparkNode =>
  ({type: 'r-select', props: {field, label, readonly: true, minWidth, sortable: false, optionDataViewKey}})
const columns: SparkNode[] = [
  col('RptName', '报表名称', 180), lookup({field: 'modid', label: '应用系统', optionDataViewKey: appKey}), col('RptDesc', '报表描述', 200),
  {type: 'r-text', props: {field: 'CreateTime', label: '创建时间', readonly: true, minWidth: 120, sortable: false, displayFormatter: formatDay}},
  lookup({field: 'createuser', label: '创建人', optionDataViewKey: userKey, minWidth: 110}),
  lookup({field: 'version_id', label: '启用版本名称', optionDataViewKey: reportKey, minWidth: 120}),
  lookup({field: 'version_dataid', label: '当前版本模型', optionDataViewKey: dataSetKey, minWidth: 180}),
  lookup({field: 'useStatus', label: '使用状态', optionDataViewKey: statusKey, minWidth: 90}),
]
const filter: RFilterProps = {
  autoQuery: false, queryOnReset: true, firstPageOnSearch: true, showExpressionEditor: false, showDataViewMeta: false,
  children: [
    {type: 'r-text', props: {field: 'RptName', label: '报表名称', placeholder: '报表名称', filterTrim: true}},
    {type: 'r-text', props: {field: 'RptDesc', label: '报表描述', placeholder: '报表描述', filterTrim: true}},
    {type: 'r-select', props: {field: 'useStatus', label: '使用状态', placeholder: '使用状态', clearable: true, optionDataViewKey: statusKey}},
    {type: 'r-select', props: {field: 'modid', label: '应用系统', placeholder: '应用系统', clearable: true, filterable: true, optionDataViewKey: appKey}},
  ],
}
const actions = computed<RToolbarProps>(() => {
  const disabled = busy.value || !!dialog.value
  const button = (label: string, run: (row: DataRow) => void): SparkNode => ({type: 'r-button', props: {label, disabled, onClick: run}})
  return {children: [button('编辑', row => open('edit', row)), button('删除', row => void remove(row)),
    button('历史版本', row => open('version', row)), button('模型', row => open('model', row))]}
})
const editSpecs: readonly FeatureFieldSpec[] = [
  {field: 'RptName', label: '报表名称', required: true},
  {field: 'modid', label: '应用系统', kind: 'select', optionKey: appKey, required: true},
  {field: 'RptDesc', label: '报表描述', kind: 'textarea'},
  {field: 'useStatus', label: '使用状态', kind: 'radio', optionKey: statusKey},
  {field: 'modname', label: '应用名称', readonly: true, when: () => false},
]

function idOf(target: DataView, row: DataRow): string | number {
  const id = target.getPkKey(row)
  if (id === undefined) throw new Error('记录缺少原生身份')
  return id
}
function open(kind: Dialog['kind'], row: DataRow): void {
  try {
    if (kind === 'model' && !textOf(row, 'version_id')) throw new Error('该报表没有启用版本，请先在历史版本中启动一个版本')
    dialog.value = {kind, infoId: idOf(view(viewKey), row), epoch: ++epoch}
  } catch (cause) { message.value = failure(cause) }
}
function validateEdit(row: Readonly<DataRow>): string | undefined {
  const id = dialog.value?.infoId
  return id === undefined ? '记录缺少原生身份' : syncAppName({info: view(viewKey), apps: view(appKey), id, row})
}
const create = () => guarded(async () => {
  const info = view(viewKey), report = view(reportKey)
  if ([info, report].some(item => item.hasUnconfirmedSave || item.hasPendingSavedRowPermissions
    || item.hasEditingChanges() || item.dirtyTracking.hasPendingChanges())) {
    throw new Error('报表存在待处理修改或保存结果，请先处理原记录')
  }
  const infoId = idOf(info, await info.addRow({}))
  let reportId: string | number | undefined
  try {
    reportId = idOf(report, await report.addRow({RptID: String(infoId), State: '1', Version: '0', isMerg: '0', isDashboards: '0'}))
    info.updateEditingValue(infoId, 'version_id', String(reportId))
    dialog.value = {kind: 'create', infoId, reportId, epoch: ++epoch}
  } catch (cause) {
    if (reportId !== undefined) report.discardPendingChanges([reportId])
    info.discardPendingChanges([infoId])
    throw cause
  }
})
async function closeDialog(reason?: 'abandoned'): Promise<void> {
  const original = reason === 'abandoned' ? dialog.value : undefined
  dialog.value = undefined
  await guarded(async () => { await Promise.all([view(viewKey).refresh(), view(reportKey).refresh()]) })
  if (original) {
    const warning = `已放弃原新增核验，服务端可能已部分或全部生效；请核对报表ID ${String(original.infoId)}、版本ID ${String(original.reportId)}`
    message.value = message.value ? `${warning}；刷新失败：${message.value}` : warning
  }
}
const remove = (row: DataRow) => guarded(async () => {
  const info = view(viewKey), id = idOf(info, row)
  const confirmed = await ElMessageBox.confirm(`确定删除报表"${textOf(row, 'RptName') || String(id)}"吗？`, '删除确认', {type: 'warning'})
    .then(() => true, () => false)
  if (!confirmed) return
  const versions = view(key('Base_Report', 'byReport'))
  versions.queryContext = {reportId: String(id)}
  await versions.refresh()
  if (versions.loadingError) throw versions.loadingError
  const versionIds = versions.rows.map(version => idOf(versions, version))
  for (const versionId of versionIds) await versions.removeRow(versionId)
  await info.removeRow(id)
  const result = await info.dataSet?.saveChanges({views: [
    {tableName: versions.tableName, viewId: versions.viewId, ids: versionIds},
    {tableName: info.tableName, viewId: info.viewId, ids: [id]},
  ]})
  if (!result?.success) {
    if (!info.hasUnconfirmedSave) info.discardPendingChanges([id])
    if (!versions.hasUnconfirmedSave) versions.discardPendingChanges(versionIds)
    throw new Error(result?.error?.message ?? '删除结果未确认，请刷新核验')
  }
  message.value = '删除成功'
  await Promise.all([info.refresh(), view(reportKey).refresh()])
})
</script>

<style scoped>
.report-page {display: grid; gap: 16px; padding: 24px; color: var(--el-text-color-primary)}
.report-page__header {display: flex; align-items: center; justify-content: space-between; gap: 16px}
.report-page__header h1 {margin: 0; font-size: 20px}
.report-page__actions {display: flex; gap: 8px}
</style>
