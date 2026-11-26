<!--
@module app:views/features/workflow/flow-runtime/bus-detail/ui/bus-flow-detail-page
职责：业务表单 + 流程摘要只读页，与办理页共用监控场景装配。
-->
<template>
  <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :host="host" :route-snapshot="routeSnapshot" :auto-load="false" />
  <RendererSection v-else title="业务流程详情" :bordered="false"
    :status="runtimeLoading ? '正在加载…' : ''" :error="runtimeError" :retryable="!runtimeLoading" @retry="loadCurrentRoute" />
</template>

<script setup lang="ts">
import {computed, ref, shallowRef, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {PageTool} from '@spark-appworks/spark-project-model'
import rule from './tool/rule.json?raw'
import script from './tool/script.js?raw'
import style from './tool/style.css?raw'
import {DisplayEmpty, RendererSection, SparkPageRenderer, RendererTabs, RendererTabPane} from '@spark-appworks/spark-component'
import {
  FLOW_DESIGN_SCENARIO_ID,
  FLOW_MONITOR_SCENARIO_ID,
  FLOW_WORKBENCH_SCENARIO_ID,
  buildFlowRunDetailRoute,
  buildFlowRunPageRoute,
  prepareFlowRunPage,
  readFlowRuntimeRouteQuery,
  type FlowRunPreparedPage,
} from '@/platform-adapters/resources/system/workflow/manage'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import {parseApplicationPathScope} from '@/services/application-scope'
import {
  createFlowBusinessPageRegistry,
  createFlowBusinessTabBuilder,
} from '../../run-page/model/flow-run-business-tab'
import {getVuePageOptions} from '@/registries/vue-page-registry'
import FlowRunRouteRenderer from '../../run-page/ui/flow-run-route-renderer.vue'

const scenarioId = FLOW_MONITOR_SCENARIO_ID
const route = useRoute()
const router = useRouter()
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
const routeQuery = () => readFlowRuntimeRouteQuery(route.query)
const prepared = shallowRef<FlowRunPreparedPage>()
const loading = ref(false)
const error = ref('')
const activeFormId = ref('')
const businessRegistry = createFlowBusinessPageRegistry()
const registeredPaths = computed(() => new Set(getVuePageOptions().map(item => item.path)))
const buildTab = createFlowBusinessTabBuilder(() => registeredPaths.value)
let generation = 0

const {ready: runtimeReady, session, loading: runtimeLoading, error: runtimeError, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId,
  tool: pageId => {
    const tool = new PageTool({pageId})
    tool.hydrateFileText('rule.json', rule)
    tool.hydrateFileText('script.js', script)
    tool.hydrateFileText('style.css', style)
    tool.markLoaded()
    return tool
  },
  modelName: 'View_FlowObjList',
  componentType: 'bus-flow-detail-page',
  title: '业务流程详情',
  peerScenarioIds: [FLOW_DESIGN_SCENARIO_ID, FLOW_WORKBENCH_SCENARIO_ID],
  queryContext: () => ({rowid: routeQuery().wfid, WFOBJID: routeQuery().wfid}),
})

const runtime = computed(() => runtimeReady.value ? session.runtime : undefined)
const currentPrepared = computed(() => {
  const source = prepared.value
  const query = routeQuery()
  return source?.flowObjectId === query.wfid && source.flowModelId === query.flowid ? source : undefined
})
const host = computed(() => {
  const current = runtime.value
  if (!current) return undefined
  const assertCurrent = () => {
    if (runtime.value !== current || !session.isCurrent(current)) throw Error('业务流程详情运行实例已失效')
  }
  return {runtime: current, assertCurrent, invoke(command: string) {
    assertCurrent()
    if (command === 'workflow.connectBusinessDetail') return {
      controls: {empty: DisplayEmpty, tabs: RendererTabs, pane: RendererTabPane, route: FlowRunRouteRenderer},
      registry: businessRegistry,
      status: () => ({loading: loading.value, error: error.value, ready: !!currentPrepared.value}),
      title: () => currentPrepared.value?.instanceTitle ?? '',
      forms: () => {
        const source = currentPrepared.value
        if (!source) return undefined
        return {instance: source.flowObjectId, items: businessTabs.value, active: activeFormId.value, select: (key: string) => {
          if (runtime.value === current && session.isCurrent(current) && currentPrepared.value === source
            && businessTabs.value.some(tab => tab.tabKey === key)) activeFormId.value = key
        }}
      },
    }
    if (command === 'workflow.retryBusinessDetail') return loadPage()
    if (command === 'workflow.openRun') {if (currentPrepared.value) openRun(); return undefined}
    if (command === 'workflow.openDetail') {if (currentPrepared.value) openDetail(); return undefined}
    throw Error(`业务流程详情不支持命令 ${command}`)
  }}
})
const businessTabs = computed(() => (currentPrepared.value?.formTabs ?? []).map(tab => buildTab({
  tabKey: tab.tabKey,
  label: tab.label,
  sourcePath: tab.sourcePath,
  queryString: tab.queryString,
}, router)))

async function loadPage(): Promise<void> {
  const own = ++generation
  loading.value = true
  error.value = ''
  prepared.value = undefined
  try {
    if (!runtimeReady.value) throw new Error('业务详情场景尚未就绪')
    const runtime = session.runtime
    if (!runtime) throw new Error('缺少页面运行实例')
    const query = routeQuery()
    const next = await prepareFlowRunPage({
      runtime,
      wfid: query.wfid,
      flowid: query.flowid,
      assertCurrent: () => {const current = routeQuery(); if (own !== generation || current.wfid !== query.wfid || current.flowid !== query.flowid || !session.isCurrent(runtime)) throw Error('原业务流程读取已失效')},
    })
    if (own !== generation) return
    prepared.value = next
    activeFormId.value = next.formTabs[0]?.tabKey ?? ''
  } catch (err) {
    if (own === generation) error.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    if (own === generation) loading.value = false
  }
}

function openRun(): void {
  const query = routeQuery()
  if (!query.wfid || !query.flowid) return
  const scope = parseApplicationPathScope(route.path)
  if (!scope) return
  void router.push(buildFlowRunPageRoute(query, scope))
}

function openDetail(): void {
  const query = routeQuery()
  if (!query.wfid || !query.flowid) return
  const scope = parseApplicationPathScope(route.path)
  if (!scope) return
  void router.push(buildFlowRunDetailRoute(query, scope))
}

watch(() => [runtimeReady.value, routeQuery().wfid, routeQuery().flowid] as const, () => {
  if (runtimeReady.value) void loadPage()
}, {immediate: true})
</script>
