<!--
@module app:views/features/application/enterprise-app-auth-application/ui/my-app-auth-request-page
职责：本企业发起的应用授权申请（47DA 场景常驻范围：REQUEST 且申请企业为本企业），支持状态筛选、内嵌申请、取消与重新申请。
边界：应用名称经同一运行实例内 C06D 应用主表、来源企业经 0221 企业表的选项视图查值显示；取消/重新申请只改本行 auth_status 与 operator 并按记录提交，
  可用性依据本行 auth_status 写权限及业务状态，不按身份放行。
-->
<template>
  <SparkPageRenderer v-if="rendererHost" :page-runtime="rendererHost.runtime" :route-snapshot="routeSnapshot" :host="rendererHost" :auto-load="false" />
  <RendererSection v-else class="my-app-auth" title="我的申请" :bordered="false" :grid-columns="1">
    <p v-if="loading" role="status">正在读取我的申请…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="error && !loading && !ready" label="重试" @click="loadCurrentRoute" />
  </RendererSection>
  <RendererDialog v-if="ready && applyOpen" :model-value="true" title="申请应用授权" :width="960" :append-to-body="true" @update:model-value="closeApply">
    <ApplyAppAuthContent :embedded="true" @applied="closeApply" />
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, ref, toRaw, watch} from 'vue'
import {useRoute} from 'vue-router'
import {buildDataViewKey, isDataRow, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {PageTool} from '@spark-appworks/spark-project-model'
import {RendererButton, RendererDialog, RendererSection, SparkPageRenderer, useSparkComponent, consumeRequiredPageService} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import {APP_AUTH_SCENARIOS, commitAppAuthRecord, confirmAppAuth, formatRequestedAt, readAppAuthSession} from '../model/enterprise-app-auth-application-model'
import ApplyAppAuthContent from './apply-app-auth-content.vue'
import rule from './request-tool/rule.json?raw'
import script from './request-tool/script.js?raw'
import style from './request-tool/style.css?raw'

const {sparkConsume} = useSparkComponent({type: 'my-app-auth-request-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'my-app-auth-request-page')
const scenarioId = APP_AUTH_SCENARIOS.myRequests
const modelName = 'enterprise_app_auth'
const appNamesKey = buildDataViewKey('Base_AppSystemList', 'default', APP_AUTH_SCENARIOS.review)
const enterpriseKey = buildDataViewKey('Base_Enterprise_Info', 'default', APP_AUTH_SCENARIOS.apply)
const route = useRoute()
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName, componentType: 'my-app-auth-request-page', title: '我的申请',
  tool: pageId => {
    const tool = new PageTool({pageId})
    tool.hydrateFileText('rule.json', rule)
    tool.hydrateFileText('script.js', script)
    tool.hydrateFileText('style.css', style)
    tool.markLoaded()
    return tool
  },
  optionModels: ['app_auth_status', 'app_request_type'], peerScenarioIds: [APP_AUTH_SCENARIOS.apply, APP_AUTH_SCENARIOS.review], optionViews: [appNamesKey, enterpriseKey],
  queryContext: () => ({entShortName: readAppAuthSession().entShortName}),
})
const applyOpen = ref(false), busy = ref(false), actionError = ref(''), revision = ref(0)
const REAPPLY_FROM = new Set(['REJECTED', 'CANCELLED', 'REVOKED', 'FAILED'])

const listView = computed(() => ready.value ? session.runtime?.resolveView(viewKey.value) : undefined)
watch(ready, value => {if (!value) applyOpen.value = false})

function status(view: DataView, row: DataRow): string {
  const value = row['auth_status']
  return view.fieldAccess(row, 'auth_status').read === 'visible' && typeof value === 'string' ? value.trim() : ''
}
const writable = (view: DataView, row: DataRow) => !view.hasUnconfirmedSave
  && view.fieldAccess(row, 'auth_status').write === 'allowed' && view.fieldAccess(row, 'operator').write === 'allowed'
const canCancel = ({row, dataSource}: {row?: DataRow | null; dataSource?: DataView | null}) =>
  Boolean(row && dataSource && writable(dataSource, row) && status(dataSource, row) === 'PENDING')
const canReapply = ({row, dataSource}: {row?: DataRow | null; dataSource?: DataView | null}) =>
  Boolean(row && dataSource && writable(dataSource, row) && REAPPLY_FROM.has(status(dataSource, row)))
type Operation = Readonly<{to: 'CANCELLED' | 'PENDING'; verb: string; title: string; success: string}>
const cancel: Operation = {to: 'CANCELLED', verb: '取消对「{name}」的申请', title: '取消申请确认', success: '已取消申请'}
const reapply: Operation = {to: 'PENDING', verb: '重新申请「{name}」', title: '重新申请确认', success: '已重新提交申请，等待审批'}
const rendererHost = computed(() => {
  const runtime = session.runtime, view = listView.value
  if (!view || !runtime) return undefined
  const assertCurrent = () => {
    if (!session.isCurrent(runtime) || listView.value !== view) throw new Error('我的申请运行实例已失效')
  }
  return {runtime, assertCurrent, async invoke(command: string, input: unknown) {
    assertCurrent()
    if (command === 'requests.connect') return {
      state: () => ({busy: busy.value, error: actionError.value}),
      canCancel: (row: unknown) => {revision.value; return isDataRow(row) && canCancel({row: toRaw(row), dataSource: view})},
      canReapply: (row: unknown) => {revision.value; return isDataRow(row) && canReapply({row: toRaw(row), dataSource: view})},
      formatRequestedAt,
    }
    if (command === 'requests.apply' && !busy.value) applyOpen.value = true
    if (command === 'requests.cancel' && isDataRow(input)) await operate(input, cancel)
    if (command === 'requests.reapply' && isDataRow(input)) await operate(input, reapply)
    return undefined
  }}
})
/** 显示名取 C06D 应用名称选项，查不到时用应用ID，再退为“该应用”。 */
function appLabel(view: DataView, row: DataRow): string {
  const appId = view.fieldAccess(row, 'app_id').read === 'visible' && typeof row['app_id'] === 'string' ? row['app_id'].trim() : ''
  const names = session.runtime?.resolveView(appNamesKey)
  const option = appId && names ? names.rows.find(item => names.fieldAccess(item, 'rowid').read === 'visible' && item['rowid'] === appId) : undefined
  const name = option && names?.fieldAccess(option, 'displayName').read === 'visible' ? option['displayName'] : undefined
  return typeof name === 'string' && name.trim() ? name.trim() : appId || '该应用'
}
async function operate(row: DataRow, operation: Operation): Promise<void> {
  const view = listView.value, runtime = session.runtime
  if (!view || !runtime || busy.value) return
  const original = toRaw(row)
  const allowed = operation.to === 'CANCELLED' ? canCancel : canReapply
  const action = {row: original, dataSource: view}
  actionError.value = ''
  busy.value = true
  try {
    const id = view.getPkKey(original)
    if (id === undefined || id === '') throw new Error('缺少申请记录')
    const assertOriginal = view.captureReadRow(original, [view.primaryKey, 'auth_status'])
    if (!allowed(action)) throw new Error('当前申请状态或权限不允许此操作')
    const {userId} = readAppAuthSession()
    if (!await confirmAppAuth(`确定要${operation.verb.replace('{name}', appLabel(view, original))}吗？`, operation.title, pageService)) return
    if (!session.isCurrent(runtime) || listView.value !== view) return
    assertOriginal()
    if (!allowed(action)) throw new Error('当前申请状态或权限不允许此操作')
    view.updateEditingValue(id, 'auth_status', operation.to)
    view.updateEditingValue(id, 'operator', userId)
    await commitAppAuthRecord(view, id)
    if (!session.isCurrent(runtime) || listView.value !== view) return
    pageService.showMessage(operation.success, 'success')
    await view.refresh()
  } catch (cause) {
    if (session.isCurrent(runtime)) actionError.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false; revision.value++
  }
}
function closeApply(): void {
  applyOpen.value = false
  void listView.value?.refresh()
}
</script>
