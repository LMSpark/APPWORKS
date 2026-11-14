<!--
@module app:views/features/integration/report/ui/report-management-page
职责：业务报表管理：按名称、描述、使用状态、应用系统查询报表，新增（报表头与初始版本同批提交）、编辑、删除，维护历史版本及版本绑定模型。
边界：列表、选项与编辑都绑定FB29数据空间的正式DataView，经DataSet提交；报表设计/预览依赖报表引擎，模板上传依赖设计文件区，均未在本页承接。
AI用途：迁移参考仓 integration/report 页面时，核对报表头与版本双表写入、启用版本切换及模型绑定。
-->
<template>
  <RendererSection class="report-page" title="报表列表" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取报表列表…' : ''" :error="error || message" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <template v-if="ready" #header-actions>
      <RendererButton v-if="unconfirmed" label="核验原保存结果" button-type="warning" :disabled="busy" @click="verify" />
      <RendererButton :data-view-key="viewKey" label="新增" button-type="primary" icon="Plus" perm-action="create"
        :disabled="busy || !!dialog || unconfirmed" @click="create" />
    </template>
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="columns" :filter="filter" :actions="actions"
      :auto-columns="false" :stripe="true" :border="true" :show-data-view-meta="false"
      :action-column="{label: '操作', width: 420, fixed: true}" :pagination="{pageSizes: [10, 20, 50, 100], showJumper: true}" />
    <ReportCreateDialog v-if="ready && dialog?.kind === 'create' && dialog.reportId !== undefined" :key="dialog.epoch" :info-key="viewKey"
      :report-key="reportKey" :app-key="appKey" :info-id="dialog.infoId" :report-id="dialog.reportId" @close="closeDialog" />
    <FeatureRecordDialog v-if="ready && dialog?.kind === 'edit'" :key="dialog.epoch" :data-view-key="viewKey" :record-id="dialog.infoId"
      title="编辑报表" :specs="editSpecs" :validate="validateEdit" @close="closeDialog" />
    <ReportVersionDialog v-if="ready && dialog?.kind === 'version'" :key="dialog.epoch" :info-key="viewKey" :info-id="dialog.infoId"
      :scenario-id="scenarioId" @close="closeDialog" />
    <ReportModelDialog v-if="ready && dialog?.kind === 'model'" :key="dialog.epoch" :info-key="viewKey" :report-key="reportKey"
      :picker-key="pickerKey" :info-id="dialog.infoId" @close="closeDialog" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, ref, shallowRef} from 'vue'
import {onBeforeRouteLeave, onBeforeRouteUpdate} from 'vue-router'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_SERVICE, RendererButton, RendererSection, RendererTable, useSparkComponent, type RFilterProps, type RToolbarProps, consumeRequiredPageService} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import FeatureRecordDialog from '@/views/features/shared/record/feature-record-dialog.vue'
import type {FeatureFieldSpec} from '@/views/features/shared/record/feature-field-spec'
import ReportCreateDialog from './report-create-dialog.vue'
import ReportVersionDialog from './report-version-dialog.vue'
import ReportModelDialog from './report-model-dialog.vue'
import {formatDay, syncAppName, textOf} from './report-format'
import {commitReportChanges, reportPendingReason, UNCONFIRMED_HINT, verifyReportSaves} from './report-save'

const scenarioId = 'FB291E325272007AEED8921C28B93CFD'
const key = (model: string, view = 'default') => buildDataViewKey(model, view, scenarioId)
const {sparkConsume} = useSparkComponent({type: 'report-management-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'report-management-page')
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: 'Base_ReportInfo', componentType: 'report-management-page', title: '业务报表管理',
  optionModels: ['Base_Report', 'Base_AppSystemList', 'Base_UserInfo', 'Base_DataSet', '功能导航状态字典'],
})
const reportKey = key('Base_Report'), appKey = key('Base_AppSystemList'), userKey = key('Base_UserInfo')
const dataSetKey = key('Base_DataSet'), pickerKey = key('Base_DataSet', 'picker'), statusKey = key('功能导航状态字典')

type Dialog = Readonly<{kind: 'create' | 'edit' | 'version' | 'model'; infoId: string | number; reportId?: string | number; epoch: number}>
const busy = ref(false), message = ref(''), revision = ref(0)
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
  try { await action() } catch (cause) { message.value = failure(cause) } finally { busy.value = false; revision.value++ }
}
const versionsKey = key('Base_Report', 'byReport')
function reportViews(): DataView[] {
  return session.runtime && !session.runtime.destroyed ? [viewKey, reportKey, versionsKey].map(view) : []
}
const unconfirmed = computed(() => {void revision.value; return !dialog.value && reportViews().some(item => item.hasUnconfirmedSave)})
function assertSettled(): void {
  const reason = reportPendingReason(reportViews())
  if (reason) throw new Error(reason)
}
const verify = () => guarded(async () => {
  const views = reportViews()
  try {
    pageService.showMessage(await verifyReportSaves(views), 'success')
  } finally {
    if (!views.some(item => item.hasUnconfirmedSave)) await Promise.all([view(viewKey).refresh(), view(reportKey).refresh()])
  }
})

/** sortable=false 用于存不透明记录 ID、按标签显示的列：服务端按 ID 排序与所见名称次序无关。 */
type ReportColumn = Readonly<{field: string; label: string; width?: number; minWidth?: number; optionDataViewKey?: string; sortable?: false}>
const column = ({field, label, width, minWidth, optionDataViewKey, sortable}: ReportColumn): SparkNode =>
  ({type: optionDataViewKey ? 'r-select' : 'r-text', props: {field, label, readonly: true, showOverflowTooltip: true,
    ...(width ? {width, align: 'center'} : {minWidth}), ...(optionDataViewKey ? {optionDataViewKey} : {}),
    ...(sortable === false ? {sortable} : {})}})
const columns: SparkNode[] = [
  column({field: 'RptName', label: '报表名称', minWidth: 180}),
  column({field: 'modid', label: '应用系统', minWidth: 180, optionDataViewKey: appKey, sortable: false}),
  column({field: 'RptDesc', label: '报表描述', minWidth: 220}),
  {type: 'r-text', props: {field: 'CreateTime', label: '创建时间', readonly: true, width: 130, align: 'center', displayFormatter: formatDay}},
  {type: 'r-select', props: {field: 'createuser', label: '创建人', readonly: true, width: 120, sortable: false, optionDataViewKey: userKey}},
  column({field: 'version_id', label: '启用版本名称', width: 140, optionDataViewKey: reportKey, sortable: false}),
  column({field: 'version_dataid', label: '当前版本模型', minWidth: 180, optionDataViewKey: dataSetKey, sortable: false}),
  column({field: 'useStatus', label: '使用状态', width: 120, optionDataViewKey: statusKey}),
]
const filter: RFilterProps = {
  autoQuery: false, queryOnReset: true, firstPageOnSearch: true, showExpressionEditor: false, showDataViewMeta: false,
  children: [
    {type: 'r-select', props: {field: 'modid', label: '应用系统', placeholder: '请选择应用系统', clearable: true, filterable: true, optionDataViewKey: appKey}},
    {type: 'r-text', props: {field: 'RptName', label: '报表名称', placeholder: '请输入报表名称', clearable: true, filterTrim: true}},
    {type: 'r-text', props: {field: 'RptDesc', label: '报表描述', placeholder: '请输入报表描述', clearable: true, filterTrim: true}},
    {type: 'r-select', props: {field: 'useStatus', label: '使用状态', placeholder: '请选择状态', clearable: true, optionDataViewKey: statusKey}},
  ],
}
const actions = computed<RToolbarProps>(() => {
  const disabled = busy.value || !!dialog.value || unconfirmed.value
  type RowAction = Readonly<{label: string; run: (row: DataRow) => void; danger?: boolean; permAction?: 'edit' | 'delete'}>
  const button = ({label, run, danger, permAction}: RowAction): SparkNode => ({type: 'r-button', props: {dataViewKey: viewKey, label, link: true,
    buttonType: danger ? 'danger' : 'primary', disabled, onClick: run, ...(permAction ? {permAction} : {})}})
  return {gap: 4, children: [button({label: '编辑', run: row => open('edit', row), permAction: 'edit'}),
    button({label: '删除', run: row => void remove(row), danger: true, permAction: 'delete'}),
    button({label: '历史版本', run: row => open('version', row)}), button({label: '模型', run: row => open('model', row)})]}
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
    assertSettled()
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
  assertSettled()
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
  await guarded(async () => {
    if (reportViews().some(item => item.hasUnconfirmedSave)) throw new Error(`存在${UNCONFIRMED_HINT}`)
    await Promise.all([view(viewKey).refresh(), view(reportKey).refresh()])
  })
  if (original) {
    const warning = `已放弃原新增核验，服务端可能已部分或全部生效；请核对报表ID ${String(original.infoId)}、版本ID ${String(original.reportId)}`
    message.value = message.value ? `${warning}；刷新失败：${message.value}` : warning
  }
}
const remove = (row: DataRow) => guarded(async () => {
  const info = view(viewKey), id = idOf(info, row)
  assertSettled()
  if (!await pageService.showConfirm(`确定删除报表"${textOf(row, 'RptName') || String(id)}"及其全部版本吗？`, '删除确认', {type: 'warning'})) return
  assertSettled()
  const versions = view(versionsKey)
  versions.queryContext = {reportId: String(id)}
  await versions.refresh()
  if (versions.loadingError) throw versions.loadingError
  const versionIds = versions.rows.map(version => idOf(versions, version))
  try {
    for (const versionId of versionIds) await versions.removeRow(versionId)
    await info.removeRow(id)
    await commitReportChanges({label: '删除报表', targets: [{view: versions, ids: versionIds}, {view: info, ids: [id]}]})
  } finally {
    if (![info, versions].some(item => item.hasUnconfirmedSave)) {
      if (info.dirtyTracking.hasPendingChanges()) info.discardPendingChanges([id])
      if (versions.dirtyTracking.hasPendingChanges()) versions.discardPendingChanges(versionIds)
      await Promise.all([info.refresh(), view(reportKey).refresh()])
    }
  }
  pageService.showMessage('删除成功', 'success')
})
</script>

<style scoped>
.report-page {padding: 8px}
</style>
