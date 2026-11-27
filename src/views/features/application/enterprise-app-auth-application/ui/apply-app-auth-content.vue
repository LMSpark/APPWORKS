<!--
@module app:views/features/application/enterprise-app-auth-application/ui/apply-app-auth-content
职责：独立页和内嵌页共用申请工具，在本次调用读取已发布应用和提交申请。
边界：导航仍校验 47DA，候选归 C06D，新增申请归本调用的 0221。关闭仅撤销尚未提交的原草稿。
AI用途：复用同一个申请宿主接入入口，保存和核验均保留原 DataView 和原记录键。
-->
<template>
  <div class="apply-app-auth" :class="{'apply-app-auth--embedded': embedded}">
    <SparkPageRenderer v-if="rendererHost" :page-runtime="rendererHost.runtime" :route-snapshot="routeSnapshot" :host="rendererHost" :auto-load="false" />
    <template v-else>
      <p v-if="loading" role="status">正在读取已发布应用…</p>
      <p v-if="loadError" role="alert">{{ loadError }}</p>
      <RendererButton v-if="loadError && !loading" label="重试" @click="loadCurrentRoute" />
    </template>
  </div>
</template>

<script setup lang="ts">
import {computed, ref, toRaw, watch, watchEffect} from 'vue'
import {useRoute} from 'vue-router'
import {buildDataViewKey, isDataRow, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {RendererButton, SparkPageRenderer, consumeRequiredPageService, useSparkComponent} from '@spark-appworks/spark-component'
import {PageTool} from '@spark-appworks/spark-project-model'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import {APP_AUTH_SCENARIOS, commitAppAuthRecord, readAppAuthSession} from '../model/enterprise-app-auth-application-model'
import rule from './apply-tool/rule.json?raw'
import script from './apply-tool/script.js?raw'
import style from './apply-tool/style.css?raw'

const props = defineProps<{
  /** Enables the embedded container size and delegates success to the parent request list. */
  embedded?: boolean
}>()
const emit = defineEmits<{applied: []; busyChange: [value: boolean]}>()
const {sparkConsume} = useSparkComponent({type: 'apply-app-auth-content'})
const pageService = consumeRequiredPageService(sparkConsume, 'apply-app-auth-content')
const publishedKey = buildDataViewKey('Base_AppSystemList', 'published', APP_AUTH_SCENARIOS.review)
const authKey = buildDataViewKey('enterprise_app_auth', 'default', APP_AUTH_SCENARIOS.apply)
const route = useRoute()
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
const tool = new PageTool({pageId: 'apply-app-auth-page'})
tool.hydrateFileText('rule.json', rule)
tool.hydrateFileText('script.js', script)
tool.hydrateFileText('style.css', style)
tool.markLoaded()
const {session, ready, loading, error: loadError, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId: APP_AUTH_SCENARIOS.myRequests,
  modelName: 'enterprise_app_auth',
  componentType: 'apply-app-auth-content',
  title: '申请应用授权',
  tool,
  peerScenarioIds: [APP_AUTH_SCENARIOS.apply, APP_AUTH_SCENARIOS.review],
  optionViews: [publishedKey, authKey],
  queryContext: () => ({entShortName: readAppAuthSession().entShortName}),
})

const applyId = ref<string | number>(), appName = ref(''), revision = ref(0)
const busy = ref(false), error = ref(''), applyError = ref('')
const published = computed(() => ready.value ? session.runtime?.resolveView(publishedKey) : undefined)
const auths = computed(() => ready.value ? session.runtime?.resolveView(authKey) : undefined)
const bump = () => {revision.value++}
watch(busy, value => emit('busyChange', value), {flush: 'sync'})
watchEffect(onCleanup => {
  const view = auths.value
  if (!view) return
  const events = ['rowsChanged', 'editingChanged', 'requestStateChanged'] as const
  for (const event of events) view.events.on(event, bump)
  onCleanup(() => {
    for (const event of events) view.events.off(event, bump)
  })
})

const rendererHost = computed(() => {
  const runtime = ready.value ? session.runtime : undefined
  if (!runtime) return undefined
  const assertCurrent = () => {
    if (!ready.value || !session.isCurrent(runtime)) throw new Error('申请应用授权运行实例已失效')
  }
  return {runtime, assertCurrent, invoke(command: string) {
    assertCurrent()
    return command === 'apply.connect' ? {state, canApply, open, cancel, submit} : undefined
  }}
})
function state() {
  return {id: applyId.value, appName: appName.value, busy: busy.value, error: error.value,
    applyError: applyError.value, unconfirmed: unconfirmed()}
}
function unconfirmed(): boolean {
  revision.value
  return auths.value?.hasUnconfirmedSave === true
}
function readText(view: DataView, row: DataRow, field: string): string {
  const value = row[field]
  if (view.fieldAccess(row, field).read !== 'visible' || (typeof value !== 'string' && typeof value !== 'number')) return ''
  return String(value).trim()
}
function canApply(row: unknown): boolean {
  const view = published.value
  return Boolean(view && isDataRow(row) && readText(view, toRaw(row), 'rowid') && !unconfirmed()
    && auths.value?.addActionState() === 'enabled')
}
async function open(row: unknown): Promise<void> {
  const runtime = session.runtime, source = published.value, view = auths.value
  if (!runtime || !source || !view || !isDataRow(row) || busy.value || applyId.value !== undefined) return
  busy.value = true
  error.value = ''
  applyError.value = ''
  try {
    const original = toRaw(row)
    source.captureReadRow(original, ['rowid'])()
    if (!canApply(original)) throw new Error('当前应用不可申请')
    const appId = readText(source, original, 'rowid')
    const {userId} = readAppAuthSession()
    const label = readText(source, original, 'displayName') || appId
    const added = await view.addRow({app_id: appId, operator: userId})
    if (!session.isCurrent(runtime)) return
    const id = view.getPkKey(added)
    if (id === undefined || id === '') throw new Error('新增申请缺少原生身份')
    appName.value = label
    applyId.value = id
  } catch (cause) {
    if (session.isCurrent(runtime)) error.value = `申请无法打开：${cause instanceof Error ? cause.message : String(cause)}`
  } finally {
    busy.value = false
  }
}
function cancel(): boolean {
  if (busy.value) return false
  const id = applyId.value
  const view = auths.value
  if (id === undefined || !view) return true
  if (view.hasUnconfirmedSaveFor([id])) error.value = applyError.value
  else view.discardPendingChanges([id])
  applyId.value = undefined
  applyError.value = ''
  return true
}
async function submit(): Promise<void> {
  const runtime = session.runtime, view = auths.value, id = applyId.value
  if (!runtime || !view || id === undefined || busy.value || unconfirmed()) return
  busy.value = true
  applyError.value = ''
  try {
    await commitAppAuthRecord(view, id)
    if (!session.isCurrent(runtime)) return
    pageService.showMessage('已提交申请，等待审批', 'success')
    applyId.value = undefined
    await view.refresh()
    if (!session.isCurrent(runtime)) return
    emit('applied')
    if (!props.embedded) await published.value?.refresh()
  } catch (cause) {
    if (!session.isCurrent(runtime)) return
    const message = cause instanceof Error ? cause.message : String(cause)
    if (view.hasUnconfirmedSaveFor([id])) applyError.value = message
    else {
      applyId.value = undefined
      error.value = message
    }
  } finally {
    busy.value = false
    bump()
  }
}
/** Close the embedded window without replacing the original runtime or its unsettled save. */
defineExpose({closeDraft: cancel})
</script>

<style scoped>
.apply-app-auth--embedded {min-height: 480px}
</style>
