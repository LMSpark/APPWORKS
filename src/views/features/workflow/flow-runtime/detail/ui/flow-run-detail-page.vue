<!--
@module app:views/features/workflow/flow-runtime/detail/ui/flow-run-detail-page
职责：流程运行详情：实例摘要、只读运行图与节点/连线步骤钻取弹窗。
边界：消费监控场景与伙伴设计场景；不含强退与办理写入。
-->
<template>
  <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :host="host" :route-snapshot="routeSnapshot" :auto-load="false" />
  <RendererSection v-else title="流程运行详情" :bordered="false" :status="loading ? '正在读取运行详情…' : ''"
    :error="error" :retryable="!loading" @retry="retryLoad" />
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {PageTool} from '@spark-appworks/spark-project-model'
import rule from './tool/rule.json?raw'
import script from './tool/script.js?raw'
import style from './tool/style.css?raw'
import * as SparkComponent from '@spark-appworks/spark-component'

const {
  FieldCheckbox,
  RendererDialog,
  RendererSection,
  RendererTabPane,
  SparkPageRenderer,
  RendererTabs,
  consumeRequiredPageService,
  useSparkComponent,
} = SparkComponent
import {
  FLOW_DESIGN_SCENARIO_ID,
  FLOW_MONITOR_SCENARIO_ID,
  FLOW_RELATION_EDGE_MARKERS,
  FLOW_WORKBENCH_SCENARIO_ID,
  buildFlowRunPageRoute,
  readFlowRuntimeRouteQuery,
} from '@/platform-adapters/resources/system/workflow/manage'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import {parseApplicationPathScope} from '@/services/application-scope'
import FlowRunDetailStepTable from './flow-run-detail-step-table.vue'
import {useFlowRunDetailPage} from './use-flow-run-detail-page'

const scenarioId = FLOW_MONITOR_SCENARIO_ID
const route = useRoute()
const router = useRouter()
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
const {sparkConsume} = useSparkComponent({type: 'flow-run-detail-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'flow-run-detail-page')
const routeQuery = computed(() => readFlowRuntimeRouteQuery(route.query))
const canOpenRun = computed(() => {
  try {
    readFlowRuntimeRouteQuery(route.query)
    return true
  } catch {
    return false
  }
})
function openRunPage(): void {
  try {
    const scope = parseApplicationPathScope(route.path)
    if (!scope) throw new Error('流程办理缺少应用路径作用域')
    void router.push(buildFlowRunPageRoute(route.query, scope))
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    void pageService.showMessage(message, 'warning')
  }
}
const {session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId,
  tool: pageId => {
    const tool = new PageTool({pageId})
    tool.hydrateFileText('rule.json', rule)
    tool.hydrateFileText('script.js', script)
    tool.hydrateFileText('style.css', style)
    tool.markLoaded()
    return tool
  },
  navigationId: FLOW_MONITOR_SCENARIO_ID,
  modelName: 'View_FlowObjList',
  componentType: 'flow-run-detail-page',
  title: '流程运行详情',
  optionModels: ['Dict_state'],
  peerScenarioIds: [FLOW_DESIGN_SCENARIO_ID, FLOW_WORKBENCH_SCENARIO_ID],
  queryContext: () => ({rowid: routeQuery.value.wfid, WFMID: routeQuery.value.flowid}),
})
const {
  prepared, graphLoading, graphError, graphReady, nodeBadgeRules, nodeDialogOpen, edgeDialogOpen,
  nodeShowVoided, edgeShowVoided, nodeDialogTitle, edgeDialogTitle, nodeActiveTab, edgeActiveTab,
  selectedNodeId, edgeSourceId, edgeTargetId, onGraphSelect, reloadGraph,
} = useFlowRunDetailPage(() => routeQuery.value, () => ready.value ? session.runtime : undefined)

const runtime = computed(() => ready.value ? session.runtime : undefined)
const host = computed(() => {
  const current = runtime.value
  if (!current) return undefined
  const assertCurrent = () => {
    if (runtime.value !== current || !session.isCurrent(current)) throw Error('流程运行详情实例已失效')
  }
  return {runtime: current, assertCurrent, invoke(command: string) {
    assertCurrent()
    if (command === 'workflow.openRun') {
      if (canOpenRun.value) openRunPage()
      return undefined
    }
    if (command === 'workflow.retryDetail') return retryLoad()
    if (command === 'workflow.connectDetail') return {
      controls: {dialog: RendererDialog, checkbox: FieldCheckbox, tabs: RendererTabs, tabPane: RendererTabPane, stepTable: FlowRunDetailStepTable},
      status: () => ({loading: loading.value || graphLoading.value, error: error.value || graphError.value, ready: graphReady.value}),
      identity: () => `实例 ${routeQuery.value.wfid} · 模型 ${routeQuery.value.flowid}`,
      canOpenRun: () => canOpenRun.value,
      graph: () => {
        const graph = graphReady.value ? prepared.value : undefined
        if (!graph) return undefined
        return {dataViewKey: graph.nodeViewKey, edgeDataViewKey: graph.edgeViewKey,
          nodePositions: graph.graphLayout.nodePositions, edgePaths: graph.graphLayout.edgePaths,
          edgeMarkers: FLOW_RELATION_EDGE_MARKERS, nodeBadgeRules, onSelect: onGraphSelect}
      },
      drilldown: () => ({
        node: {
          open: nodeDialogOpen.value, title: nodeDialogTitle.value, showVoided: nodeShowVoided.value,
          viewKey: prepared.value?.stepViewKey, tab: nodeActiveTab.value,
          setOpen: (open: boolean) => {nodeDialogOpen.value = open},
          setShowVoided: (show: boolean) => {nodeShowVoided.value = show},
          setTab: (tab: typeof nodeActiveTab.value) => {nodeActiveTab.value = tab},
          filters: (tab: string) => tab === 'received' ? {receivedNodeId: selectedNodeId.value}
            : tab === 'sent' ? {sentNodeId: selectedNodeId.value} : {},
        },
        edge: {
          open: edgeDialogOpen.value, title: edgeDialogTitle.value, showVoided: edgeShowVoided.value,
          viewKey: prepared.value?.stepViewKey, tab: edgeActiveTab.value,
          setOpen: (open: boolean) => {edgeDialogOpen.value = open},
          setShowVoided: (show: boolean) => {edgeShowVoided.value = show},
          setTab: (tab: typeof edgeActiveTab.value) => {edgeActiveTab.value = tab},
          filters: (tab: string) => tab === 'edge' ? {sentNodeId: edgeSourceId.value, receivedNodeId: edgeTargetId.value} : {},
        },
      }),
    }
    throw Error(`流程运行详情不支持命令 ${command}`)
  }}
})

async function retryLoad(): Promise<void> {
  await loadCurrentRoute()
  await reloadGraph()
}
</script>
