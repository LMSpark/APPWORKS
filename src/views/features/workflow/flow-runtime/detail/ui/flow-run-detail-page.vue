<!--
@module app:views/features/workflow/flow-runtime/detail/ui/flow-run-detail-page
职责：流程运行详情：实例摘要、只读运行图与节点/连线步骤钻取弹窗。
边界：消费监控场景与伙伴设计场景；不含强退与办理写入。
-->
<template>
  <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :host="host" :route-snapshot="routeSnapshot" :auto-load="false">
    <template #content="{children}">
      <RendererSection class="flow-run-detail-page" title="流程运行详情" :bordered="false" :grid-columns="1" :grid-gap="12"
        :status="loading || graphLoading ? '正在读取运行详情…' : ''"
        :error="error || graphError" :retryable="!loading && !graphLoading && (!ready || !graphReady)" @retry="retryLoad">
        <template v-if="ready && canOpenRun" #header-actions>
          <SparkComponentRenderer v-for="node in children.filter(item => nodeId(item) === 'openRun')" key="openRun" :config="node" />
        </template>
        <DisplayAlert v-if="ready" alert-type="info" :closable="false" :show-icon="true"
          :title="`实例 ${routeQuery.wfid} · 模型 ${routeQuery.flowid}`" />
        <template v-if="ready">
          <SparkComponentRenderer v-for="node in children.filter(item => nodeId(item) === 'summary')" key="summary" :config="node" />
        </template>
        <RendererSection v-if="ready" title="运行轨迹" :bordered="true" :grid-columns="1" :grid-gap="8">
          <div class="flow-run-detail-page__legend">
            <DisplayText text="已完成（绿徽标）· 待办（橙徽标）· 只读预览" />
          </div>
          <template v-if="graphReady && prepared">
            <SparkComponentRenderer v-for="node in graphNodes(children)" key="runGraph" :config="node" />
          </template>
          <DisplayAlert v-else-if="ready && !graphLoading" alert-type="info" :closable="false" :show-icon="true"
            title="运行图尚未加载。" />
        </RendererSection>
        <RendererDialog v-model="nodeDialogOpen" :title="nodeDialogTitle" :width="960" :append-to-body="true" :destroy-on-close="true">
          <FieldCheckbox v-model="nodeShowVoided" checkbox-text="显示作废信息" class="flow-run-detail-page__voided" />
          <RendererTabs v-model="nodeActiveTab">
            <RendererTabPane name="received" label="提交到当前节点" :index="0" lazy>
              <FlowRunDetailStepTable v-if="nodeDialogOpen && prepared" :view-key="prepared.stepViewKey" :received-node-id="selectedNodeId" :show-voided="nodeShowVoided" />
            </RendererTabPane>
            <RendererTabPane name="sent" label="当前节点提交的" :index="1" lazy>
              <FlowRunDetailStepTable v-if="nodeDialogOpen && prepared" :view-key="prepared.stepViewKey" :sent-node-id="selectedNodeId" :show-voided="nodeShowVoided" />
            </RendererTabPane>
            <RendererTabPane name="all" label="所有信息" :index="2" lazy>
              <FlowRunDetailStepTable v-if="nodeDialogOpen && prepared" :view-key="prepared.stepViewKey" :show-voided="nodeShowVoided" />
            </RendererTabPane>
          </RendererTabs>
        </RendererDialog>
        <RendererDialog v-model="edgeDialogOpen" :title="edgeDialogTitle" :width="960" :append-to-body="true" :destroy-on-close="true">
          <FieldCheckbox v-model="edgeShowVoided" checkbox-text="显示作废信息" class="flow-run-detail-page__voided" />
          <RendererTabs v-model="edgeActiveTab">
            <RendererTabPane name="edge" label="连线步骤" :index="0" lazy>
              <FlowRunDetailStepTable v-if="edgeDialogOpen && prepared" :view-key="prepared.stepViewKey" :sent-node-id="edgeSourceId" :received-node-id="edgeTargetId" :show-voided="edgeShowVoided" />
            </RendererTabPane>
            <RendererTabPane name="all" label="所有信息" :index="1" lazy>
              <FlowRunDetailStepTable v-if="edgeDialogOpen && prepared" :view-key="prepared.stepViewKey" :show-voided="edgeShowVoided" />
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
import {nodeId, type SparkNode} from '@spark-appworks/spark-data'
import {PageTool} from '@spark-appworks/spark-project-model'
import rule from './tool/rule.json?raw'
import script from './tool/script.js?raw'
import style from './tool/style.css?raw'
import * as SparkComponent from '@spark-appworks/spark-component'

const {
  DisplayAlert,
  DisplayText,
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

function graphNodes(children: readonly SparkNode[]): SparkNode[] {
  const graph = prepared.value
  if (!graph) return []
  return children.filter(node => nodeId(node) === 'runGraph').map(node => ({
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
  }))
}

async function retryLoad(): Promise<void> {
  await loadCurrentRoute()
  await reloadGraph()
}
</script>

<style scoped>
.flow-run-detail-page {padding: 8px}
.flow-run-detail-page__legend {margin-bottom: 4px}
.flow-run-detail-page__voided {margin-bottom: 8px}
</style>
