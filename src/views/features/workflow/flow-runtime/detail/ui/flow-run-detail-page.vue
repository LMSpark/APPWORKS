<!--
@module app:views/features/workflow/flow-runtime/detail/ui/flow-run-detail-page
职责：流程运行详情：实例摘要、只读运行图与节点/连线步骤钻取弹窗。
边界：消费监控场景与伙伴设计场景；不含强退与办理写入。
-->
<template>
  <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :host="host" :route-snapshot="routeSnapshot" :auto-load="false">
    <template #content="{children}">
      <RendererSection v-for="section in children.filter(node => nodeId(node) === 'runtimeDetail')" key="runtimeDetail"
        v-bind="section.props" :children="detailContent(section)"
        :status="loading || graphLoading ? '正在读取运行详情…' : ''"
        :error="error || graphError" :retryable="!loading && !graphLoading && (!ready || !graphReady)" @retry="retryLoad">
        <template v-if="ready && canOpenRun" #header-actions>
          <SparkComponentRenderer v-for="node in getSparkNodeChildren(section.children).filter(item => nodeId(item) === 'openRun')" key="openRun" :config="node" />
        </template>
        <RendererDialog v-for="dialog in drilldownDialogs(getSparkNodeChildren(section.children))" :key="dialog.id"
          v-bind="dialog.rule.props" :model-value="dialog.open.value" :title="dialog.title.value"
          @update:model-value="dialog.open.value = $event">
          <FieldCheckbox v-bind="dialog.checkbox.props" v-model="dialog.showVoided.value" />
          <RendererTabs v-bind="dialog.tabs.props" v-model="dialog.activeTab.value">
            <RendererTabPane v-for="(pane, index) in dialog.panes" :key="index" :index="index" v-bind="pane.props">
              <FlowRunDetailStepTable v-if="dialog.open.value && prepared" :rule="dialog.stepTable" :view-key="prepared.stepViewKey"
                v-bind="stepFilters(pane.props?.['name'])" :show-voided="dialog.showVoided.value" />
            </RendererTabPane>
          </RendererTabs>
        </RendererDialog>
      </RendererSection>
    </template>
  </SparkPageRenderer>
  <RendererSection v-else title="流程运行详情" :bordered="false" :status="loading ? '正在读取运行详情…' : ''"
    :error="error" :retryable="!loading" @retry="retryLoad" />
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {getSparkNodeChildren, nodeId, type SparkNode} from '@spark-appworks/spark-data'
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
  SparkComponentRenderer,
  SparkPageRenderer,
  RendererTabs,
  consumeRequiredPageService,
  useSparkComponent,
} = SparkComponent
import {
  FLOW_DESIGN_SCENARIO_ID,
  FLOW_MONITOR_SCENARIO_ID,
  FLOW_WORKBENCH_SCENARIO_ID,
  buildFlowRunPageRoute,
  readFlowRuntimeRouteQuery,
} from '@/lowcode/resources/system/workflow/manage'
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
    if (!session.isCurrent(current)) throw Error('流程运行详情实例已失效')
  }
  return {runtime: current, assertCurrent, invoke(command: string) {
    assertCurrent()
    if (command === 'workflow.openRun' && canOpenRun.value) openRunPage()
  }}
})

function detailContent(section: SparkNode): SparkNode[] {
  if (!ready.value) return []
  return getSparkNodeChildren(section.children).flatMap(node => {
    switch (nodeId(node)) {
      case 'instanceIdentity': return [{
        ...node,
        props: {...node.props, title: `实例 ${routeQuery.value.wfid} · 模型 ${routeQuery.value.flowid}`},
      }]
      case 'summary': return [node]
      case 'runTrace': return [traceSection(node)]
      default: return []
    }
  })
}

function traceSection(section: SparkNode): SparkNode {
  const graph = graphReady.value ? prepared.value : undefined
  const nodes = getSparkNodeChildren(section.children).flatMap(node => {
    switch (nodeId(node)) {
      case 'runGraph':
        return graph ? [{
          ...node,
          props: {
            ...node.props,
            dataViewKey: graph.nodeViewKey,
            edgeDataViewKey: graph.edgeViewKey,
            nodePositions: graph.graphLayout.nodePositions,
            edgePaths: graph.graphLayout.edgePaths,
            nodeBadgeRules,
            onSelect: onGraphSelect,
          },
        }] : []
      case 'runGraphUnavailable': return graph || graphLoading.value ? [] : [node]
      default: return [node]
    }
  })
  return {...section, children: nodes}
}

const drilldownState = [
  {id: 'nodeSteps', open: nodeDialogOpen, title: nodeDialogTitle, activeTab: nodeActiveTab, showVoided: nodeShowVoided},
  {id: 'edgeSteps', open: edgeDialogOpen, title: edgeDialogTitle, activeTab: edgeActiveTab, showVoided: edgeShowVoided},
]
function drilldownDialogs(children: readonly SparkNode[]) {
  const stepTable = children.find(node => nodeId(node) === 'stepTable' && node.type === 'r-table')
  if (!stepTable) return []
  return drilldownState.flatMap(state => {
    const rule = children.find(node => nodeId(node) === state.id)
    const [checkbox, tabs] = getSparkNodeChildren(rule?.children)
    return rule && checkbox && tabs
      ? [{...state, rule, checkbox, tabs, stepTable, panes: getSparkNodeChildren(tabs.children)}]
      : []
  })
}

function stepFilters(pane: unknown) {
  switch (pane) {
    case 'received': return {receivedNodeId: selectedNodeId.value}
    case 'sent': return {sentNodeId: selectedNodeId.value}
    case 'edge': return {sentNodeId: edgeSourceId.value, receivedNodeId: edgeTargetId.value}
    default: return {}
  }
}

async function retryLoad(): Promise<void> {
  await loadCurrentRoute()
  await reloadGraph()
}
</script>

<style scoped>
.flow-run-detail-page__voided {margin-bottom: 8px}
</style>
