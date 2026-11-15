<!--
@module app:views/features/workflow/flow-runtime/detail/ui/flow-run-detail-page
职责：流程运行详情：实例摘要、只读运行图与节点/连线步骤钻取弹窗。
边界：消费监控场景与伙伴设计场景；不含强退与办理写入。
-->
<template>
  <RendererSection class="flow-run-detail-page" title="流程运行详情" :bordered="false" :grid-columns="1" :grid-gap="12"
    :status="loading || graphLoading ? '正在读取运行详情…' : ''"
    :error="error || graphError" :retryable="!loading && !graphLoading && (!ready || !graphReady)" @retry="retryLoad">
    <template v-if="ready && canOpenRun" #header-actions>
      <RendererButton label="前往办理" button-type="primary" @click="openRunPage" />
    </template>
    <DisplayAlert v-if="ready" alert-type="info" :closable="false" :show-icon="true"
      :title="`实例 ${routeQuery.wfid} · 模型 ${routeQuery.flowid}`" />
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="columns" :stripe="true" :show-data-view-meta="false" />
    <RendererSection v-if="ready" title="运行轨迹" :bordered="true" :grid-columns="1" :grid-gap="8">
      <div class="flow-run-detail-page__legend">
        <DisplayText text="已完成（绿徽标）· 待办（橙徽标）· 只读预览" />
      </div>
      <RendererGraph v-if="graphReady && prepared" class="flow-run-detail-page__graph"
        :data-view-key="prepared.nodeViewKey" :edge-data-view-key="prepared.edgeViewKey"
        label-field="TITLE" description-field="MEMO" node-caption-field="NODETYPE"
        edge-source-field="PARENTID" edge-target-field="CHILDID"
        :node-positions="prepared.graphLayout.nodePositions" :edge-paths="prepared.graphLayout.edgePaths"
        :node-badge-rules="nodeBadgeRules" background-pattern="dots" node-appearance="card"
        :viewport-controls="true" :disabled="true" @select="onGraphSelect" />
      <DisplayAlert v-else-if="ready && !graphLoading" alert-type="info" :closable="false" :show-icon="true"
        title="运行图尚未加载。" />
    </RendererSection>
    <RendererDialog v-model="nodeDialogOpen" :title="nodeDialogTitle" :width="960" :append-to-body="true" :destroy-on-close="true">
      <el-checkbox v-model="nodeShowVoided" class="flow-run-detail-page__voided">显示作废信息</el-checkbox>
      <RendererTabs v-model="nodeActiveTab">
        <RendererTabPane name="received" label="提交到当前节点" :index="0">
          <FlowRunDetailStepTable :rows="nodeReceivedDisplay" />
        </RendererTabPane>
        <RendererTabPane name="sent" label="当前节点提交的" :index="1">
          <FlowRunDetailStepTable :rows="nodeSentDisplay" />
        </RendererTabPane>
        <RendererTabPane name="all" label="所有信息" :index="2">
          <FlowRunDetailStepTable :rows="nodeAllDisplay" />
        </RendererTabPane>
      </RendererTabs>
    </RendererDialog>
    <RendererDialog v-model="edgeDialogOpen" :title="edgeDialogTitle" :width="960" :append-to-body="true" :destroy-on-close="true">
      <el-checkbox v-model="edgeShowVoided" class="flow-run-detail-page__voided">显示作废信息</el-checkbox>
      <RendererTabs v-model="edgeActiveTab">
        <RendererTabPane name="edge" label="连线步骤" :index="0">
          <FlowRunDetailStepTable :rows="edgeDisplay" />
        </RendererTabPane>
        <RendererTabPane name="all" label="所有信息" :index="1">
          <FlowRunDetailStepTable :rows="edgeAllDisplay" />
        </RendererTabPane>
      </RendererTabs>
    </RendererDialog>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {buildDataViewKey, type SparkNode} from '@spark-appworks/spark-data'
import * as SparkComponent from '@spark-appworks/spark-component'

const {
  DisplayAlert,
  DisplayText,
  RendererButton,
  RendererDialog,
  RendererGraph,
  RendererSection,
  RendererTabPane,
  RendererTable,
  RendererTabs,
  consumeRequiredPageService,
  useSparkComponent,
} = SparkComponent
import {
  FLOW_DESIGN_SCENARIO_ID,
  buildFlowRunPageRoute,
  readFlowRuntimeRouteQuery,
} from '@/lowcode/resources/system/workflow/manage'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import FlowRunDetailStepTable from './flow-run-detail-step-table.vue'
import {useFlowRunDetailPage} from './use-flow-run-detail-page'

const scenarioId = 'E328FBBF518141973C575D612CD75151'
const route = useRoute()
const router = useRouter()
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
    const target = buildFlowRunPageRoute(route.query)
    void router.push(target)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    void pageService.showMessage(message, 'warning')
  }
}
const {viewKey, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId,
  modelName: 'View_FlowObjList',
  componentType: 'flow-run-detail-page',
  title: '流程运行详情',
  optionModels: ['Dict_state'],
  peerScenarioIds: [FLOW_DESIGN_SCENARIO_ID],
  queryContext: () => ({rowid: routeQuery.value.wfid, WFMID: routeQuery.value.flowid}),
})
const {
  prepared, graphLoading, graphError, graphReady, nodeBadgeRules, nodeDialogOpen, edgeDialogOpen,
  nodeShowVoided, edgeShowVoided, nodeDialogTitle, edgeDialogTitle, nodeActiveTab, edgeActiveTab,
  nodeReceivedDisplay, nodeSentDisplay, nodeAllDisplay, edgeDisplay, edgeAllDisplay, onGraphSelect, reloadGraph,
} = useFlowRunDetailPage(() => routeQuery.value, () => ready.value)

const stateKey = buildDataViewKey('Dict_state', 'default', scenarioId)
const columns: SparkNode[] = [
  {type: 'r-text', props: {field: 'TITLE', label: '流程标题', readonly: true, minWidth: 220}},
  {type: 'r-text', props: {field: 'AppDesc', label: '应用名称', readonly: true, minWidth: 160}},
  {type: 'r-select', props: {field: 'status', label: '状态', readonly: true, minWidth: 120, optionDataViewKey: stateKey}},
  {type: 'r-text', props: {field: 'handleInfo', label: '办理信息', readonly: true, minWidth: 200}},
]

async function retryLoad(): Promise<void> {
  await loadCurrentRoute()
  await reloadGraph()
}
</script>

<style scoped>
.flow-run-detail-page {padding: 8px}
.flow-run-detail-page__graph {min-height: 360px; height: 48vh}
.flow-run-detail-page__legend {margin-bottom: 4px}
.flow-run-detail-page__voided {margin-bottom: 8px}
</style>