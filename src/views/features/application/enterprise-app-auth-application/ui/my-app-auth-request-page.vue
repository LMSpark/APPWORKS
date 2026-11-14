<!--
@module app:views/features/application/enterprise-app-auth-application/ui/my-app-auth-request-page
职责：本企业发起的应用授权申请（47DA 场景常驻范围：REQUEST 且申请企业为本企业），支持状态筛选、内嵌申请、取消与重新申请。
边界：应用名称经同一运行实例内 C06D 应用主表、来源企业经 0221 企业表的选项视图查值显示；取消/重新申请只改本行 auth_status 与 operator 并按记录提交，
  可用性依据本行 auth_status 写权限及业务状态，不按身份放行。
-->
<template>
  <RendererSection class="my-app-auth" title="我的申请" :bordered="false" :grid-columns="1">
    <template #header-actions>
      <RendererButton v-if="ready" label="申请应用授权" button-type="primary" :disabled="busy" @click="applyOpen = true" />
      <RendererButton v-if="ready" :data-view-key="viewKey" label="刷新" action="refresh" />
    </template>
    <p v-if="loading" role="status">正在读取我的申请…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="error && !loading && !ready" label="重试" @click="loadCurrentRoute" />
    <p v-if="actionError" role="alert">{{ actionError }}</p>
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="fields" :filter="filter" :actions="actions"
      :auto-columns="false" :stripe="true" :show-row-index="true" :highlight-current-row="true"
      :show-data-view-meta="false" :pagination="{pageSizes: [20], showJumper: true}" />
    <RendererDialog v-if="applyOpen" :model-value="true" title="申请应用授权" :width="960" :append-to-body="true" @update:model-value="closeApply">
      <ApplyAppAuthContent :embedded="true" @applied="closeApply" />
    </RendererDialog>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_SERVICE, RendererButton, RendererDialog, RendererSection, RendererTable, useSparkComponent, type RFilterProps, consumeRequiredPageService} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import {APP_AUTH_SCENARIOS, commitAppAuthRecord, confirmAppAuth, formatRequestedAt, readAppAuthSession} from '../model/enterprise-app-auth-application-model'
import ApplyAppAuthContent from './apply-app-auth-content.vue'

const {sparkConsume} = useSparkComponent({type: 'my-app-auth-request-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'my-app-auth-request-page')
const scenarioId = APP_AUTH_SCENARIOS.myRequests
const modelName = 'enterprise_app_auth'
const appNamesKey = buildDataViewKey('Base_AppSystemList', 'default', APP_AUTH_SCENARIOS.review)
const enterpriseKey = buildDataViewKey('Base_Enterprise_Info', 'default', APP_AUTH_SCENARIOS.apply)
const statusKey = buildDataViewKey('app_auth_status', 'default', scenarioId)
const requestTypeKey = buildDataViewKey('app_request_type', 'default', scenarioId)
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName, componentType: 'my-app-auth-request-page', title: '我的申请',
  optionModels: ['app_auth_status', 'app_request_type'], peerScenarioIds: [APP_AUTH_SCENARIOS.apply, APP_AUTH_SCENARIOS.review], optionViews: [appNamesKey, enterpriseKey],
  queryContext: () => ({entShortName: readAppAuthSession().entShortName}),
})
const applyOpen = ref(false), busy = ref(false), actionError = ref(''), revision = ref(0)
const REAPPLY_FROM = new Set(['REJECTED', 'CANCELLED', 'REVOKED', 'FAILED'])

const dictionary = (key: string) => ({optionDataViewKey: key, optionValueField: 'val', optionLabelField: 'txt'})
const fields: SparkNode[] = [
  {type: 'r-select', props: {field: 'app_id', label: '申请应用', readonly: true, minWidth: 220, sortable: false, showOverflowTooltip: true,
    optionDataViewKey: appNamesKey, optionValueField: 'rowid', optionLabelField: 'displayName', unmatchedText: '-', cellTitleField: 'app_id'}},
  {type: 'r-select', props: {field: 'source_ent', label: '来源企业', readonly: true, width: 160, showOverflowTooltip: true,
    optionDataViewKey: enterpriseKey, optionValueField: 'ShortName', optionLabelField: 'CName'}},
  {type: 'r-select', props: {field: 'request_type', label: '发起方式', readonly: true, width: 110, valueAlign: 'center', ...dictionary(requestTypeKey)}},
  {type: 'r-select', props: {field: 'auth_status', label: '状态', readonly: true, width: 120, valueAlign: 'center', ...dictionary(statusKey),
    valueTagTypes: {ACTIVE: 'success', PENDING: 'warning', FAILED: 'danger', REJECTED: 'danger'}}},
  {type: 'r-text', props: {field: 'requested_at', label: '申请时间', readonly: true, width: 160, valueAlign: 'center',
    emptyText: '-', displayFormatter: formatRequestedAt}},
  {type: 'r-text', props: {field: 'noteText', label: '说明/失败原因', readonly: true, minWidth: 180, sortable: false, showOverflowTooltip: true}},
]
const filter: RFilterProps = {
  autoQuery: false, queryOnReset: true, firstPageOnSearch: true, showExpressionEditor: false, showDataViewMeta: false,
  children: [{type: 'r-select', props: {field: 'auth_status', label: '状态', placeholder: '全部状态', clearable: true, width: 160, ...dictionary(statusKey)}}],
}
const listView = computed(() => ready.value ? session.runtime?.getDataSet(scenarioId)?.getView(modelName, 'default') : undefined)

function status(view: DataView, row: DataRow): string {
  const value = row['auth_status']
  return view.fieldAccess(row, 'auth_status').read === 'visible' && typeof value === 'string' ? value.trim() : ''
}
const writable = (view: DataView, row: DataRow) => !view.hasUnconfirmedSave && view.fieldAccess(row, 'auth_status').write === 'allowed'
const canCancel = ({row, dataSource}: {row?: DataRow | null; dataSource?: DataView | null}) =>
  Boolean(row && dataSource && writable(dataSource, row) && status(dataSource, row) === 'PENDING')
const canReapply = ({row, dataSource}: {row?: DataRow | null; dataSource?: DataView | null}) =>
  Boolean(row && dataSource && writable(dataSource, row) && REAPPLY_FROM.has(status(dataSource, row)))
const actions = computed(() => {
  revision.value
  return {wrap: false, gap: 4, children: [
    {type: 'r-button', props: {dataViewKey: viewKey, label: '取消申请', link: true, buttonType: 'danger', onBeforeRender: canCancel,
      onClick: (row: DataRow) => operate(row, {to: 'CANCELLED', verb: '取消对「{name}」的申请', title: '取消申请确认', success: '已取消申请'})}},
    {type: 'r-button', props: {dataViewKey: viewKey, label: '重新申请', link: true, buttonType: 'primary', onBeforeRender: canReapply,
      onClick: (row: DataRow) => operate(row, {to: 'PENDING', verb: '重新申请「{name}」', title: '重新申请确认', success: '已重新提交申请，等待审批'})}},
  ]}
})

type Operation = Readonly<{to: 'CANCELLED' | 'PENDING'; verb: string; title: string; success: string}>
/** 显示名取 C06D 应用名称选项，查不到时用应用ID，再退为“该应用”。 */
function appLabel(view: DataView, row: DataRow): string {
  const appId = view.fieldAccess(row, 'app_id').read === 'visible' && typeof row['app_id'] === 'string' ? row['app_id'].trim() : ''
  const names = session.runtime?.resolveView(appNamesKey)
  const option = appId && names ? names.rows.find(item => names.fieldAccess(item, 'rowid').read === 'visible' && item['rowid'] === appId) : undefined
  const name = option && names?.fieldAccess(option, 'displayName').read === 'visible' ? option['displayName'] : undefined
  return typeof name === 'string' && name.trim() ? name.trim() : appId || '该应用'
}
async function operate(row: DataRow, operation: Operation): Promise<void> {
  const view = listView.value
  if (!view || busy.value) return
  actionError.value = ''
  const id = view.getPkKey(row)
  if (id === undefined || id === '') {actionError.value = '缺少申请记录'; return}
  if (!await confirmAppAuth(`确定要${operation.verb.replace('{name}', appLabel(view, row))}吗？`, operation.title, pageService)) return
  busy.value = true
  try {
    const {userId} = readAppAuthSession()
    view.updateEditingValue(id, 'auth_status', operation.to)
    view.updateEditingValue(id, 'operator', userId)
    await commitAppAuthRecord(view, id)
    pageService.showMessage(operation.success, 'success')
    await view.refresh()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false; revision.value++
  }
}
function closeApply(): void {
  applyOpen.value = false
  void listView.value?.refresh()
}
</script>

<style scoped>
.my-app-auth {padding: 24px}
</style>
