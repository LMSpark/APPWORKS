<!--
@module app:views/features/workflow/flow-runtime/run-page/ui/flow-run-page
职责：流程办理桌面页：业务页签、办理侧栏、提交/退回与加签/流程图对话框。
-->
<template>
  <SparkComponent.RendererSection class="flow-run-page" title="流程办理" :bordered="false" :grid-columns="1"
    :status="shellStatus" :error="shellError" :retryable="!shellLoading" @retry="retryShell">
    <template v-if="prepared" #header-actions>
      <SparkComponent.RendererButton label="流程图" :disabled="reloadBlocked" @click="openFlowChart" />
      <SparkComponent.RendererButton label="加签" :disabled="reloadBlocked" @click="openAppendDialog" />
      <SparkComponent.RendererButton label="撤回" :disabled="reloadBlocked" :loading="handleLoading" @click="revokeCurrentStep" />
      <SparkComponent.RendererButton label="办理" :disabled="reloadBlocked" button-type="primary" :loading="handleLoading" @click="openHandlePanel" />
      <SparkComponent.RendererButton label="核验原办理结果" :loading="handleLoading" @click="verifyOriginalApproval" />
    </template>
    <SparkComponent.RendererButton v-if="reloadBlocked" label="切换到当前导航" :disabled="hasPendingWork()" @click="retryShell" />
    <div v-if="prepared" class="flow-run-page__layout">
      <section class="flow-run-page__business">
        <p class="flow-run-page__title">{{ prepared.instanceTitle }}</p>
        <SparkComponent.DisplayAlert v-if="handleError" alert-type="error" :closable="false" :show-icon="true" :title="handleError" />
        <SparkComponent.DisplayEmpty v-if="businessTabs.length === 0" description="未查询到业务页签" />
        <SparkComponent.RendererTabs v-else :model-value="activeFormId" @update:model-value="selectBusinessForm" class="flow-run-page__tabs">
          <SparkComponent.RendererTabPane v-for="(tab, index) in businessTabs" :index="index" :key="tab.tabKey" :label="tab.label" :name="tab.tabKey" lazy>
            <SparkComponent.DisplayEmpty v-if="!tab.routeFound" :description="tab.routeError" />
            <FlowRunRouteRenderer v-else-if="tab.routeLocation" :route="tab.routeLocation" :cache-key="tab.cacheKey"
              :tab-key="tab.tabKey" :registry="businessRegistry"
              :fallback-props="{flowid: prepared.flowModelId, flowobjid: prepared.flowObjectId, stepid: prepared.stepId,
                workFormId: tab.tabKey, pageParam: prepared.formTabs.find(form => form.tabKey === tab.tabKey)?.queryString ?? '', busRowid: prepared.busRowId}" />
          </SparkComponent.RendererTabPane>
        </SparkComponent.RendererTabs>
      </section>
      <SparkPageRenderer v-if="runtime" :page-runtime="runtime" :route-snapshot="routeSnapshot" :auto-load="false">
        <template #content="{children}">
          <SparkComponentRenderer v-for="(node, index) in children.filter(child => nodeId(child) === 'history')" :key="nodeId(node) ?? index" :config="node" />
        </template>
      </SparkPageRenderer>
      <aside v-if="handleOpen" class="flow-run-page__handle">
        <h3 class="flow-run-page__handle-title">办理</h3>
        <SparkComponent.RendererTable :data-view-key="nodeInputViewKey" :children="nodeFields" :auto-columns="false" :show-pagination="false" :show-data-view-meta="false" />
        <SparkComponentRenderer :config="approvalInputConfig" />
        <div class="flow-run-page__handle-actions">
          <SparkComponent.RendererButton label="提交" button-type="primary" :loading="handleLoading" @click="submitFlow" />
          <SparkComponent.RendererButton v-if="backNodeOptions.length > 0" label="普通退回" :loading="handleLoading" @click="backByHistory" />
          <SparkComponent.RendererButton v-if="allowForceBack && forceBackNodeOptions.length > 0" label="强制退回"
            :loading="handleLoading" @click="forceBack" />
          <SparkComponent.RendererButton label="退回发起人" :loading="handleLoading" @click="backToCreator" />
          <SparkComponent.RendererButton label="关闭" @click="closeHandlePanel" />
        </div>
      </aside>
    </div>

    <SparkComponent.RendererDialog v-model="appendOpen" title="追加办理人" width="92vw" :append-to-body="true" :destroy-on-close="true" :close-disabled="appendCloseDisabled">
      <FlowAppendUser v-if="appendContext && prepared" :context="appendContext" embedded
        :user-directory-view-key="prepared.userDirectoryViewKey" :step-view-key="stepViewKey" />
    </SparkComponent.RendererDialog>

    <SparkComponent.RendererDialog v-model="chartOpen" title="流程图" width="94vw" top="3vh" :append-to-body="true" :destroy-on-close="true">
      <SparkComponent.RendererSection :status="chartLoading ? '正在加载流程图…' : ''" :error="chartError" :bordered="false" :grid-columns="1">
        <SparkComponent.RendererGraph v-if="chartPrepared" class="flow-run-page__chart"
          :data-view-key="chartPrepared.nodeViewKey" :edge-data-view-key="chartPrepared.edgeViewKey"
          label-field="TITLE" edge-source-field="UpNodeID" edge-target-field="NextNodeID"
          :node-positions="chartPrepared.graphLayout.nodePositions" :edge-paths="chartPrepared.graphLayout.edgePaths"
          :node-badge-field="chartPrepared.nodeBadgeField" :node-badge-rules="chartBadgeRules"
          background-pattern="dots" :disabled="true" />
      </SparkComponent.RendererSection>
    </SparkComponent.RendererDialog>
  </SparkComponent.RendererSection>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import * as SparkComponent from '@spark-appworks/spark-component'
import {
  FLOW_DESIGN_SCENARIO_ID,
  FLOW_MONITOR_SCENARIO_ID,
  FLOW_WORKBENCH_SCENARIO_ID,
  FLOW_RUN_GRAPH_NODE_BADGE_FIELD,
  readFlowRuntimeRouteQuery,
} from '@/lowcode/resources/system/workflow/manage'
import {compileRule, PageTool} from '@spark-appworks/spark-project-model'
import {SparkComponentRenderer, SparkPageRenderer} from '@spark-appworks/spark-component'
import {buildDataViewKey, getSparkNodeChildren, nodeId} from '@spark-appworks/spark-data'
import rule from './tool/rule.json?raw'
import script from './tool/script.js?raw'
import style from './tool/style.css?raw'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import FlowAppendUser from '@/views/features/workflow/flow-append-user/ui/flow-append-user.vue'
import FlowRunRouteRenderer from './flow-run-route-renderer.vue'
import {useFlowRunPage} from './use-flow-run-page'

const props = defineProps<{mobile?: boolean}>()
const scenarioId = FLOW_MONITOR_SCENARIO_ID
const route = useRoute()
const routeQuery = () => readFlowRuntimeRouteQuery(route.query)
const {
  session,
  ready: runtimeReady,
  loading: runtimeLoading,
  error: runtimeError,
  reloadBlocked,
  loadCurrentRoute: reloadFeatureRuntime,
} = useFeaturePageRuntime({
  scenarioId,
  tool: pageId => {
    const tool = new PageTool({pageId})
    tool.hydrateFileText('rule.json', rule)
    tool.hydrateFileText('script.js', script)
    tool.hydrateFileText('style.css', style)
    tool.markLoaded()
    return tool
  },
  ...(!props.mobile ? {navigationId: FLOW_MONITOR_SCENARIO_ID} : {}),
  modelName: 'View_FlowObjList',
  componentType: 'flow-run-page',
  title: '流程办理',
  peerScenarioIds: [FLOW_DESIGN_SCENARIO_ID, FLOW_WORKBENCH_SCENARIO_ID],
  preserveRuntime: () => hasPendingWork(),
  queryContext: () => ({rowid: routeQuery().wfid, WFOBJID: routeQuery().wfid}),
})

const {
  prepared,
  pageLoading,
  pageError,
  handleOpen,
  handleLoading,
  handleError,
  nodeInputViewKey,
  inputLocked,
  nodeFields,
  backNodeOptions,
  forceBackNodeOptions,
  allowForceBack,
  businessTabs,
  activeFormId,
  selectBusinessForm,
  businessRegistry,
  appendOpen,
  appendCloseDisabled,
  appendContext,
  chartOpen,
  chartLoading,
  chartError,
  chartPrepared,
  retryPage,
  hasPendingWork,
  openHandlePanel,
  closeHandlePanel,
  submitFlow,
  verifyOriginalApproval,
  backByHistory,
  forceBack,
  backToCreator,
  openAppendDialog,
  openFlowChart,
  revokeCurrentStep,
  stepViewKey,
} = useFlowRunPage(routeQuery, () => runtimeReady.value, () => reloadBlocked.value)

const approvalInputRule = compileRule(rule).find(node => nodeId(node) === 'approvalInput')
if (!approvalInputRule) throw new Error('流程办理工具缺少办理参数表单')
const approvalInputConfig = computed(() => ({
  ...approvalInputRule,
  props: {...approvalInputRule.props, dataViewKey: buildDataViewKey('ApprovalInput', 'default', FLOW_WORKBENCH_SCENARIO_ID)},
  children: getSparkNodeChildren(approvalInputRule.children)
    .filter(field => field.props?.['field'] !== 'forceNodeId' || (allowForceBack.value && forceBackNodeOptions.value.length > 0))
    .map(field => ({...field, props: {...field.props, readonly: inputLocked.value,
      ...(field.props?.['field'] === 'forceNodeId'
        ? {optionDataViewKey: buildDataViewKey('ApprovalForceTargets', 'default', FLOW_WORKBENCH_SCENARIO_ID)}
        : {}),
    }})),
}))
const runtime = computed(() => runtimeReady.value ? session.runtime : undefined)
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
const shellLoading = computed(() => runtimeLoading.value || pageLoading.value)
const shellStatus = computed(() => shellLoading.value ? '正在加载办理页…'
  : reloadBlocked.value ? '当前仍显示原办理记录，请先处理原操作后重试。' : '')
const shellError = computed(() => runtimeError.value || pageError.value)

function retryShell(): void {
  void retryPage(reloadFeatureRuntime)
}

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
.flow-run-page__nodes {display: grid; gap: 8px}
.flow-run-page__node-option {display: flex; gap: 8px; align-items: center}
.flow-run-page__handle-actions {display: flex; flex-wrap: wrap; gap: 8px}
.flow-run-page__chart {min-height: 50vh}
@media (max-width: 960px) {
  .flow-run-page__layout {grid-template-columns: 1fr}
  .flow-run-page__handle {grid-column: 1}
}
</style>
