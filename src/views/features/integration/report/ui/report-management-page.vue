<!--
@module app:views/features/integration/report/ui/report-management-page
职责：业务报表管理：按名称、描述、使用状态、应用系统查询报表，新增（报表头与初始版本同批提交）、编辑、删除，维护历史版本及版本绑定模型。
边界：列表、选项与编辑都绑定FB29数据空间的正式DataView，经DataSet提交；报表设计/预览依赖报表引擎，模板上传依赖设计文件区，均未在本页承接。
AI用途：迁移参考仓 integration/report 页面时，核对报表头与版本双表写入、启用版本切换及模型绑定。
-->
<template>
  <RendererSection title="报表列表" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取报表列表…' : reloadBlocked ? '当前仍显示原报表，请处理原操作后切换。' : ''" :error="error || message" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <RendererButton v-if="reloadBlocked" label="切换到当前导航" :disabled="hasPending()" @click="loadCurrentRoute" />
    <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :route-snapshot="routeSnapshot" :host="host" :auto-load="false">
      <template #content="{children}">
        <template v-for="(node, index) in children" :key="nodeId(node) ?? index">
          <template v-if="nodeId(node) === 'reportVersions'">
            <ReportVersionDialog v-if="ready && dialog?.kind === 'version'" ref="versionDialogs" :key="dialog.epoch" :info-key="viewKey"
              :info-id="dialog.infoId" :table-rule="node" :toolbar-rule="children.find(child => nodeId(child) === 'reportVersionToolbar')"
              :form-rule="children.find(child => nodeId(child) === 'reportVersionForm')" @close="closeDialog" />
          </template>
          <template v-else-if="nodeId(node) === 'reportModelPicker'">
            <ReportModelDialog v-if="ready && dialog?.kind === 'model'" ref="modelDialogs" :key="dialog.epoch" :info-key="viewKey"
              :report-key="reportKey" :info-id="dialog.infoId" :table-rule="node" :footer-rule="children.find(child => nodeId(child) === 'reportModelFooter')" @close="closeDialog" />
          </template>
          <template v-else-if="nodeId(node) === 'reportEditForm'">
            <FeatureRecordDialog v-if="ready && dialog?.kind === 'edit'" :key="dialog.epoch" :data-view-key="viewKey" :record-id="dialog.infoId"
              title="编辑报表" :form-rule="node" :validate="validateEdit" @close="closeDialog" />
          </template>
          <template v-else-if="nodeId(node) === 'reportCreateInfo'">
            <ReportCreateDialog v-if="ready && dialog?.kind === 'create' && dialog.reportId !== undefined" ref="createDialogs" :key="dialog.epoch"
              :info-key="viewKey" :report-key="reportKey" :app-key="appKey" :info-id="dialog.infoId" :report-id="dialog.reportId"
              :info-rule="node" :version-rule="children.find(child => nodeId(child) === 'reportCreateVersion')"
              :footer-rule="children.find(child => nodeId(child) === 'reportCreateFooter')" @close="closeDialog" />
          </template>
          <SparkComponentRenderer v-else-if="nodeId(node) !== 'reportVersionToolbar' && nodeId(node) !== 'reportModelFooter' && nodeId(node) !== 'reportVersionForm' && nodeId(node) !== 'reportCreateVersion' && nodeId(node) !== 'reportCreateFooter'" :config="node" />
        </template>
      </template>
    </SparkPageRenderer>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, ref, shallowRef, useTemplateRef} from 'vue'
import {onBeforeRouteLeave, onBeforeRouteUpdate, useRoute} from 'vue-router'
import {PageTool} from '@spark-appworks/spark-project-model'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, nodeId, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {RendererButton, RendererSection, SparkComponentRenderer, SparkPageRenderer, useSparkComponent, consumeRequiredPageService} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import FeatureRecordDialog from '@/views/features/shared/record/feature-record-dialog.vue'
import ReportCreateDialog from './report-create-dialog.vue'
import ReportVersionDialog from './report-version-dialog.vue'
import ReportModelDialog from './report-model-dialog.vue'
import {formatDay, syncAppName, textOf} from './report-format'
import {commitReportChanges, reportPendingReason, UNCONFIRMED_HINT, verifyReportSaves} from './report-save'

import rule from './tool/rule.json?raw'
import script from './tool/script.js?raw'
import style from './tool/style.css?raw'

const scenarioId = 'FB291E325272007AEED8921C28B93CFD'
const key = (model: string, view = 'default') => buildDataViewKey(model, view, scenarioId)
const {sparkConsume} = useSparkComponent({type: 'report-management-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'report-management-page')
const {viewKey, session, ready, loading, error, reloadBlocked, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: 'Base_ReportInfo', componentType: 'report-management-page', title: '业务报表管理',
  tool: pageId => {
    const tool = new PageTool({pageId})
    tool.hydrateFileText('rule.json', rule)
    tool.hydrateFileText('script.js', script)
    tool.hydrateFileText('style.css', style)
    tool.markLoaded()
    return tool
  },
  preserveRuntime: () => hasPending(),
  optionModels: ['Base_Report', 'Base_AppSystemList', 'Base_UserInfo', 'Base_DataSet', '功能导航状态字典'],
})
const reportKey = key('Base_Report'), appKey = key('Base_AppSystemList')

type Dialog = Readonly<{kind: 'create' | 'edit' | 'version' | 'model'; infoId: string | number; reportId?: string | number; epoch: number}>
const busy = ref(false), message = ref(''), revision = ref(0)
const dialog = shallowRef<Dialog>()
let epoch = 0

function hasPending(): boolean {
  return busy.value || dialog.value?.kind === 'create' || session.runtime?.isDirty === true
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
  return session.runtime && !session.runtime.destroyed ? [viewKey.value, reportKey, versionsKey].map(view) : []
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
    if (!views.some(item => item.hasUnconfirmedSave)) await Promise.all([view(viewKey.value).refresh(), view(reportKey).refresh()])
  }
})

const runtime = computed(() => ready.value ? session.runtime : undefined)
const route = useRoute()
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
const createDialogs = useTemplateRef<InstanceType<typeof ReportCreateDialog>[]>('createDialogs')
const versionDialogs = useTemplateRef<InstanceType<typeof ReportVersionDialog>[]>('versionDialogs')
const modelDialogs = useTemplateRef<InstanceType<typeof ReportModelDialog>[]>('modelDialogs')
const host = computed(() => {
  const current = runtime.value
  if (!current) return undefined
  const assertCurrent = () => {
    if (!session.isCurrent(current)) throw new Error('报表列表运行实例已失效')
  }
  return {runtime: current, assertCurrent, async invoke(command: string, input: unknown) {
    assertCurrent()
    if (command === 'reports.connect') return {
      locked: () => reloadBlocked.value || busy.value || !!dialog.value || unconfirmed.value,
      verification: () => ({visible: unconfirmed.value, disabled: busy.value}),
      formatDay,
    }
    if (command === 'reports.verify') {
      if (unconfirmed.value) await verify()
      return undefined
    }
    if (command === 'reports.create') {
      if (!reloadBlocked.value && !busy.value && !dialog.value && !unconfirmed.value) await create()
      return undefined
    }
    if (dialog.value?.kind === 'create' && command.startsWith('reports.create.')) {
      return createDialogs.value?.[0]?.invoke(command.slice('reports.create.'.length))
    }
    const actionRow = input && typeof input === 'object' ? input as DataRow : undefined
    if (dialog.value?.kind === 'version' && command.startsWith('reports.version.')) {
      return versionDialogs.value?.[0]?.invoke(command.slice('reports.version.'.length), actionRow)
    }
    if (dialog.value?.kind === 'model' && command.startsWith('reports.model.')) {
      return modelDialogs.value?.[0]?.invoke(command.slice('reports.model.'.length), actionRow)
    }
    if (reloadBlocked.value || busy.value || dialog.value || unconfirmed.value || !input || typeof input !== 'object') return undefined
    const row = input as DataRow
    if (!view(viewKey.value).rows.includes(row)) return undefined
    if (command === 'reports.remove') await remove(row)
    if (command === 'reports.edit') open('edit', row)
    if (command === 'reports.version') open('version', row)
    if (command === 'reports.model') open('model', row)
    return undefined
  }}
})
function idOf(target: DataView, row: DataRow): string | number {
  const id = target.getPkKey(row)
  if (id === undefined) throw new Error('记录缺少原生身份')
  return id
}
function open(kind: Dialog['kind'], row: DataRow): void {
  try {
    assertSettled()
    if (kind === 'model' && !textOf(row, 'version_id')) throw new Error('该报表没有启用版本，请先在历史版本中启动一个版本')
    dialog.value = {kind, infoId: idOf(view(viewKey.value), row), epoch: ++epoch}
  } catch (cause) { message.value = failure(cause) }
}
function validateEdit(row: Readonly<DataRow>): string | undefined {
  const id = dialog.value?.infoId
  return id === undefined ? '记录缺少原生身份' : syncAppName({info: view(viewKey.value), apps: view(appKey), id, row})
}
const create = () => guarded(async () => {
  const info = view(viewKey.value), report = view(reportKey)
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
    await Promise.all([view(viewKey.value).refresh(), view(reportKey).refresh()])
  })
  if (original) {
    const warning = `已放弃原新增核验，服务端可能已部分或全部生效；请核对报表ID ${String(original.infoId)}、版本ID ${String(original.reportId)}`
    message.value = message.value ? `${warning}；刷新失败：${message.value}` : warning
  }
}
const remove = (row: DataRow) => guarded(async () => {
  const info = view(viewKey.value), id = idOf(info, row)
  assertSettled()
  const nameReadable = info.fieldAccess(row, 'RptName').read === 'visible'
  const assertReport = info.captureReadRow(row, [...info.effectivePkFields, ...(nameReadable ? ['RptName'] : [])])
  const label = nameReadable ? textOf(row, 'RptName') || String(id) : String(id)
  if (!await pageService.showConfirm(`确定删除报表"${label}"及其全部版本吗？`, '删除确认', {type: 'warning'})) return
  assertReport()
  assertSettled()
  const versions = view(versionsKey)
  versions.queryContext = {reportId: String(id)}
  await versions.refresh()
  if (versions.loadingError) throw versions.loadingError
  assertReport()
  versions.captureReadResult()()
  if (versions.nextPageAvailable === true || versions.countReported === true && versions.total !== versions.rows.length) {
    throw new Error('报表版本未完整读取，不能删除报表')
  }
  const versionIds = versions.rows.map(version => {
    versions.captureReadRow(version, [...versions.effectivePkFields, 'RptID'])()
    if (textOf(version, 'RptID') !== String(id)) throw new Error('版本与当前报表不一致')
    return idOf(versions, version)
  })
  try {
    for (const versionId of versionIds) await versions.removeRow(versionId)
    assertReport()
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
