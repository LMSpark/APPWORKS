<!--
@module app:views/features/workflow/flow-runtime/run-page/ui/flow-run-page
职责：流程办理桌面页：业务页签、办理侧栏、提交/退回与加签/流程图对话框。
-->
<template>
  <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :host="host" :route-snapshot="routeSnapshot" :auto-load="false">
    <template #content="{children}">
      <SparkComponent.RendererSection class="flow-run-page" title="流程办理" :bordered="false" :grid-columns="1"
        :status="shellStatus" :error="shellError" :retryable="!shellLoading" @retry="retryShell">
        <template v-if="prepared" #header-actions>
          <SparkComponentRenderer v-for="node in actionToolbars(children, 'pageActions')" key="pageActions" :config="node" />
        </template>
        <SparkComponent.RendererButton v-if="reloadBlocked" label="切换到当前导航" :disabled="hasPendingWork()" @click="retryShell" />
        <div v-if="prepared" class="flow-run-page__layout">
          <section class="flow-run-page__business">
            <p class="flow-run-page__title">{{ prepared.instanceTitle }}</p>
            <SparkComponent.DisplayAlert v-if="handleError" alert-type="error" :closable="false" :show-icon="true" :title="handleError" />
            <SparkComponent.DisplayEmpty v-if="businessTabs.length === 0" description="未查询到业务页签" />
            <SparkComponent.RendererTabs v-else v-bind="businessTabsRule(children)?.props" :model-value="activeFormId" @update:model-value="selectBusinessForm">
              <SparkComponent.RendererTabPane v-for="(tab, index) in businessTabs" :index="index" :key="tab.tabKey" v-bind="getSparkNodeChildren(businessTabsRule(children)?.children)[0]?.props" :label="tab.label" :name="tab.tabKey">
                <SparkComponent.DisplayEmpty v-if="!tab.routeFound" :description="tab.routeError" />
                <FlowRunRouteRenderer v-else-if="tab.routeLocation" :route="tab.routeLocation" :cache-key="tab.cacheKey"
                  :tab-key="tab.tabKey" :registry="businessRegistry"
                  :fallback-props="{flowid: prepared.flowModelId, flowobjid: prepared.flowObjectId, stepid: prepared.stepId,
                    workFormId: tab.tabKey, pageParam: prepared.formTabs.find(form => form.tabKey === tab.tabKey)?.queryString ?? '', busRowid: prepared.busRowId}" />
              </SparkComponent.RendererTabPane>
            </SparkComponent.RendererTabs>
          </section>
          <SparkComponentRenderer v-for="(node, index) in children.filter(child => nodeId(child) === 'history')" :key="nodeId(node) ?? index" :config="node" />
          <aside v-if="handleOpen" class="flow-run-page__handle">
            <SparkComponentRenderer v-for="node in approvalSections(children)" key="approvalSection" :config="node" />
          </aside>
        </div>

        <SparkComponent.RendererDialog v-model="appendOpen" v-bind="dialogRule(children, 'appendDialog')?.props" :close-disabled="appendCloseDisabled">
          <FlowAppendUser v-if="appendContext && prepared" ref="appendUser" :context="appendContext" :tool-rules="children" embedded
            :user-directory-view-key="prepared.userDirectoryViewKey" :step-view-key="stepViewKey" />
        </SparkComponent.RendererDialog>

        <SparkComponentRenderer v-for="node in chartDialogs(children)" key="chartDialog" :config="node" />
      </SparkComponent.RendererSection>
    </template>
  </SparkPageRenderer>
  <SparkComponent.RendererSection v-else title="流程办理" :bordered="false" :grid-columns="1"
    :status="shellStatus" :error="shellError" :retryable="!shellLoading" @retry="retryShell" />
</template>

<script setup lang="ts">
import {computed, useTemplateRef} from 'vue'
import {useRoute} from 'vue-router'
import * as SparkComponent from '@spark-appworks/spark-component'
import {
  FLOW_DESIGN_SCENARIO_ID,
  FLOW_MONITOR_SCENARIO_ID,
  FLOW_WORKBENCH_SCENARIO_ID,
  readFlowRuntimeRouteQuery,
} from '@/platform-adapters/resources/system/workflow/manage'
import {PageTool} from '@spark-appworks/spark-project-model'
import {SparkComponentRenderer, SparkPageRenderer} from '@spark-appworks/spark-component'
import {getSparkNodeChildren, nodeId, type SparkNode} from '@spark-appworks/spark-data'
import rule from './tool/rule.json?raw'
import script from './tool/script.js?raw'
import style from './tool/style.css?raw'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import FlowAppendUser from '@/views/features/workflow/flow-append-user/ui/flow-append-user.vue'
import FlowRunRouteRenderer from './flow-run-route-renderer.vue'
import {ensureFlowRunApprovalViews} from '@/platform-adapters/resources/system/workflow/manage/flow-run-page/input/approval-input-workspace'
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

const runtime = computed(() => {
  const current = runtimeReady.value ? session.runtime : undefined
  const workbench = current?.getDataSet(FLOW_WORKBENCH_SCENARIO_ID)
  if (workbench) ensureFlowRunApprovalViews(workbench)
  return current
})
const {
  prepared,
  pageLoading,
  pageError,
  handleOpen,
  handleLoading,
  handleError,
  inputLocked,
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
} = useFlowRunPage(routeQuery, () => runtime.value, () => reloadBlocked.value)

function bindApprovalInput(approvalInputRule: SparkNode): SparkNode {
  return {
    ...approvalInputRule,
    children: getSparkNodeChildren(approvalInputRule.children)
      .filter(field => field.props?.['field'] !== 'forceNodeId' || (allowForceBack.value && forceBackNodeOptions.value.length > 0))
      .map(field => ({...field, props: {...field.props, readonly: inputLocked.value}})),
  }
}
function bindApprovalNodes(approvalNodesRule: SparkNode): SparkNode {
  return {
    ...approvalNodesRule,
    children: getSparkNodeChildren(approvalNodesRule.children).map(column => {
      if (column.type !== 'r-column-group') return column
      return {...column, children: getSparkNodeChildren(column.children).map(field => ({
        ...field,
        props: {...field.props, readonly: inputLocked.value || field.props?.['readonly'] || false,
          ...(field.type === 'r-user-picker' ? {optionDataViewKey: '$[candidateViewKey]'} : {}),
        },
      }))}
    }),
  }
}
const actions: Record<string, {run: () => void | Promise<void>; loading?: true; blockedByNavigation?: true; visible?: () => boolean}> = {
  chart: {run: openFlowChart, blockedByNavigation: true},
  append: {run: openAppendDialog, blockedByNavigation: true},
  revoke: {run: revokeCurrentStep, loading: true, blockedByNavigation: true},
  handle: {run: openHandlePanel, loading: true, blockedByNavigation: true},
  verify: {run: verifyOriginalApproval, loading: true},
  submit: {run: submitFlow, loading: true},
  back: {run: backByHistory, loading: true, visible: () => backNodeOptions.value.length > 0},
  forceBack: {run: forceBack, loading: true, visible: () => allowForceBack.value && forceBackNodeOptions.value.length > 0},
  backToCreator: {run: backToCreator, loading: true},
  close: {run: closeHandlePanel},
}
function bindActions(toolbar: SparkNode): SparkNode {
  const children = getSparkNodeChildren(toolbar.children).flatMap(button => {
    const action = actions[nodeId(button) ?? '']
    if (!action || action.visible?.() === false) return []
    return [{...button, props: {...button.props,
      disabled: action.blockedByNavigation === true && reloadBlocked.value,
      loading: action.loading === true && handleLoading.value,
    }}]
  })
  return {...toolbar, children}
}
function approvalSections(children: readonly SparkNode[]): SparkNode[] {
  const section = children.find(node => nodeId(node) === 'approvalSection')
  if (!section) return []
  return [{...section, children: getSparkNodeChildren(section.children).map(node => {
    switch (nodeId(node)) {
      case 'approvalNodes': return bindApprovalNodes(node)
      case 'approvalInput': return bindApprovalInput(node)
      case 'approvalActions': return bindActions(node)
      default: return node
    }
  })}]
}
function actionToolbars(children: SparkNode[], id: string): SparkNode[] {
  const toolbar = children.find(node => nodeId(node) === id)
  return toolbar ? [bindActions(toolbar)] : []
}
const appendUser = useTemplateRef<InstanceType<typeof FlowAppendUser>>('appendUser')
const host = computed(() => {
  const current = runtime.value
  if (!current) return undefined
  const assertCurrent = () => {
    if (!session.isCurrent(current)) throw new Error('流程办理运行实例已失效')
  }
  return {runtime: current, assertCurrent, invoke(command: string, input: unknown) {
    assertCurrent()
    if (command.startsWith('append.') && appendOpen.value) return appendUser.value?.invoke(command.slice('append.'.length), input)
    if (!command.startsWith('workflow.')) return
    const id = command.slice('workflow.'.length)
    if (!Object.hasOwn(actions, id)) return
    const action = actions[id]
    if (!action || (action.loading && handleLoading.value) || (action.blockedByNavigation && reloadBlocked.value)
      || action.visible?.() === false) return
    return action.run()
  }}
})
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

function businessTabsRule(children: readonly SparkNode[]): SparkNode | undefined {
  return children.find(node => nodeId(node) === 'businessFormTabs' && node.type === 'r-tabs')
}

function dialogRule(children: readonly SparkNode[], id: string): SparkNode | undefined {
  return children.find(node => nodeId(node) === id && node.type === 'r-dialog')
}

function chartDialogs(children: readonly SparkNode[]): SparkNode[] {
  const dialog = dialogRule(children, 'chartDialog')
  const section = getSparkNodeChildren(dialog?.children)[0]
  if (!dialog || !section) return []
  const graph = chartPrepared.value
  const nodes = graph ? getSparkNodeChildren(section.children).map(node => ({
    ...node,
    props: {
      ...node.props,
      dataViewKey: graph.nodeViewKey,
      edgeDataViewKey: graph.edgeViewKey,
      nodePositions: graph.graphLayout.nodePositions,
      edgePaths: graph.graphLayout.edgePaths,
      nodeBadgeField: graph.nodeBadgeField,
    },
  })) : []
  return [{
    ...dialog,
    props: {
      ...dialog.props,
      modelValue: chartOpen.value,
      'onUpdate:modelValue': (visible: boolean) => { chartOpen.value = visible },
    },
    children: [{
      ...section,
      props: {...section.props, status: chartLoading.value ? '正在加载流程图…' : '', error: chartError.value},
      children: nodes,
    }],
  }]
}
</script>

<style scoped>
.flow-run-page__layout {display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start}
.flow-run-page__title {margin: 0 0 12px; font-weight: 600}
.flow-run-page__business {min-width: 0}
.flow-run-page__handle {border: 1px solid var(--el-border-color); border-radius: 8px; padding: 12px; display: grid; gap: 12px}
.flow-run-page__chart {min-height: 50vh}
@media (max-width: 960px) {
  .flow-run-page__layout {grid-template-columns: 1fr}
  .flow-run-page__handle {grid-column: 1}
}
</style>
