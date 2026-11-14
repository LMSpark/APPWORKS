<!--
@module app:views/features/workflow/flow-runtime/run-page/ui/flow-run-page
职责：流程办理桌面页：业务页签、办理侧栏、提交/退回与加签/流程图对话框。
-->
<template>
  <RendererSection class="flow-run-page" title="流程办理" :bordered="false" :grid-columns="1"
    :status="pageLoading ? '正在加载办理页…' : ''" :error="pageError" :retryable="!pageLoading" @retry="loadPage">
    <template v-if="prepared" #header-actions>
      <RendererButton label="流程图" @click="openFlowChart" />
      <RendererButton label="加签" @click="openAppendDialog" />
      <RendererButton label="办理" button-type="primary" :loading="handleLoading" @click="openHandlePanel" />
    </template>
    <div v-if="prepared" class="flow-run-page__layout">
      <section class="flow-run-page__business">
        <p class="flow-run-page__title">{{ prepared.instanceTitle }}</p>
        <DisplayAlert v-if="handleError" alert-type="error" :closable="false" :show-icon="true" :title="handleError" />
        <el-empty v-if="businessTabs.length === 0" description="未查询到业务页签" />
        <el-tabs v-else v-model="activeFormId" class="flow-run-page__tabs">
          <el-tab-pane v-for="tab in businessTabs" :key="tab.tabKey" :label="tab.label" :name="tab.tabKey" lazy>
            <el-empty v-if="!tab.routeFound" :description="tab.routeError" />
            <FlowRunRouteRenderer v-else-if="tab.routeLocation" :route="tab.routeLocation" :cache-key="tab.cacheKey"
              :tab-key="tab.tabKey" :registry="businessRegistry" />
          </el-tab-pane>
        </el-tabs>
      </section>
      <aside v-if="handleOpen" class="flow-run-page__handle">
        <h3 class="flow-run-page__handle-title">办理</h3>
        <p v-if="nextNodeOptions.length > 0" class="flow-run-page__section-label">下一节点</p>
        <div v-if="nextNodeOptions.length > 0" class="flow-run-page__nodes">
          <label v-for="item in nextNodeOptions" :key="item.id" class="flow-run-page__node-option">
            <input v-model="selectedNodeId" type="radio" name="flow-run-next-node" :value="item.id">
            <span>{{ item.title || item.id }}</span>
          </label>
        </div>
        <template v-if="backNodeOptions.length > 0">
          <p class="flow-run-page__section-label">退回目标</p>
          <div class="flow-run-page__nodes">
            <label v-for="item in backNodeOptions" :key="`back-${item.id}`" class="flow-run-page__node-option">
              <input v-model="selectedBackNodeId" type="radio" name="flow-run-back-node" :value="item.id">
              <span>{{ item.title || item.id }}</span>
            </label>
          </div>
        </template>
        <template v-if="allowForceBack && forceBackNodeOptions.length > 0">
          <p class="flow-run-page__section-label">强制退回目标</p>
          <div class="flow-run-page__nodes">
            <label v-for="item in forceBackNodeOptions" :key="`force-${item.id}`" class="flow-run-page__node-option">
              <input v-model="selectedForceBackNodeId" type="radio" name="flow-run-force-back-node" :value="item.id">
              <span>{{ item.title || item.id }}</span>
            </label>
          </div>
        </template>
        <el-empty v-else-if="nextNodeOptions.length === 0" description="未返回办理或退回选项" />
        <el-input v-model="opinionText" type="textarea" :rows="4" placeholder="办理意见" />
        <div class="flow-run-page__handle-actions">
          <RendererButton label="提交" button-type="primary" :loading="handleLoading" @click="submitFlow" />
          <RendererButton v-if="backNodeOptions.length > 0" label="退回上一节点" :loading="handleLoading" @click="backByHistory" />
          <RendererButton v-if="allowForceBack && forceBackNodeOptions.length > 0" label="强制退回"
            :loading="handleLoading" @click="forceBack" />
          <RendererButton label="退回发起人" :loading="handleLoading" @click="backToCreator" />
          <RendererButton label="关闭" @click="handleOpen = false" />
        </div>
      </aside>
    </div>

    <RendererDialog v-model="appendOpen" title="追加办理人" width="92vw" :append-to-body="true" :destroy-on-close="true">
      <FlowAppendUser v-if="appendContext && prepared" :context="appendContext" embedded
        :user-directory-view-key="prepared.userDirectoryViewKey" />
    </RendererDialog>

    <RendererDialog v-model="chartOpen" title="流程图" width="94vw" top="3vh" :append-to-body="true" :destroy-on-close="true">
      <RendererSection :status="chartLoading ? '正在加载流程图…' : ''" :error="chartError" :bordered="false" :grid-columns="1">
        <RendererGraph v-if="chartPrepared" class="flow-run-page__chart"
          :data-view-key="chartPrepared.nodeViewKey" :edge-data-view-key="chartPrepared.edgeViewKey"
          label-field="TITLE" edge-source-field="PARENTID" edge-target-field="CHILDID"
          :node-positions="chartPrepared.graphLayout.nodePositions" :edge-paths="chartPrepared.graphLayout.edgePaths"
          :node-badge-field="chartPrepared.nodeBadgeField" :node-badge-rules="chartBadgeRules"
          background-pattern="dots" :disabled="true" />
      </RendererSection>
    </RendererDialog>
  </RendererSection>
</template>

<script setup lang="ts">
import {useRoute} from 'vue-router'
import {DisplayAlert, RendererButton, RendererDialog, RendererGraph, RendererSection} from '@spark-appworks/spark-component'
import {
  FLOW_DESIGN_SCENARIO_ID,
  FLOW_RUN_GRAPH_NODE_BADGE_FIELD,
  readFlowRuntimeRouteQuery,
} from '@/lowcode/resources/system/workflow/manage'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import FlowAppendUser from '@/views/features/workflow/flow-append-user/ui/flow-append-user.vue'
import FlowRunRouteRenderer from './flow-run-route-renderer.vue'
import {useFlowRunPage} from './use-flow-run-page'

const scenarioId = 'E328FBBF518141973C575D612CD75151'
const route = useRoute()
const routeQuery = () => readFlowRuntimeRouteQuery(route.query)
const {ready: runtimeReady} = useFeaturePageRuntime({
  scenarioId,
  modelName: 'View_FlowObjList',
  componentType: 'flow-run-page',
  title: '流程办理',
  peerScenarioIds: [FLOW_DESIGN_SCENARIO_ID],
  queryContext: () => ({rowid: routeQuery().wfid, WFOBJID: routeQuery().wfid}),
})

const {
  prepared,
  pageLoading,
  pageError,
  handleOpen,
  handleLoading,
  handleError,
  opinionText,
  selectedNodeId,
  selectedBackNodeId,
  selectedForceBackNodeId,
  nextNodeOptions,
  backNodeOptions,
  forceBackNodeOptions,
  allowForceBack,
  businessTabs,
  activeFormId,
  businessRegistry,
  appendOpen,
  appendContext,
  chartOpen,
  chartLoading,
  chartError,
  chartPrepared,
  loadPage,
  openHandlePanel,
  submitFlow,
  backByHistory,
  forceBack,
  backToCreator,
  openAppendDialog,
  openFlowChart,
} = useFlowRunPage(routeQuery, () => runtimeReady.value)

const chartBadgeRules = [
  {field: FLOW_RUN_GRAPH_NODE_BADGE_FIELD, value: 'waiting', label: '待办', tone: 'warning' as const},
  {field: FLOW_RUN_GRAPH_NODE_BADGE_FIELD, value: 'completed', label: '已完成', tone: 'success' as const},
]
</script>

<style scoped>
.flow-run-page__layout {display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start}
.flow-run-page__title {margin: 0 0 12px; font-weight: 600}
.flow-run-page__business {min-width: 0}
.flow-run-page__handle {border: 1px solid var(--el-border-color); border-radius: 8px; padding: 12px; display: grid; gap: 12px}
.flow-run-page__handle-title {margin: 0; font-size: 16px}
.flow-run-page__section-label {margin: 8px 0 4px; font-size: 13px; color: var(--el-text-color-secondary)}
.flow-run-page__nodes {display: grid; gap: 8px}
.flow-run-page__node-option {display: flex; gap: 8px; align-items: center}
.flow-run-page__handle-actions {display: flex; flex-wrap: wrap; gap: 8px}
.flow-run-page__chart {min-height: 50vh}
@media (max-width: 960px) {
  .flow-run-page__layout {grid-template-columns: 1fr}
}
</style>