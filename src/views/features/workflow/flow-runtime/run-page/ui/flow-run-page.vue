<!--
@module app:views/features/workflow/flow-runtime/run-page/ui/flow-run-page
职责：流程办理桌面页：业务页签、办理侧栏、提交/退回与加签/流程图对话框。
-->
<template>
  <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :host="host" :route-snapshot="routeSnapshot" :auto-load="false" />
  <SparkComponent.RendererSection v-else title="流程办理" :bordered="false" :grid-columns="1"
    :status="shellStatus" :error="shellError" :retryable="!shellLoading" @retry="retryShell" />
</template>

<script setup lang="ts">
import {computed, shallowRef} from 'vue'
import {useRoute} from 'vue-router'
import * as SparkComponent from '@spark-appworks/spark-component'
import {
  FLOW_DESIGN_SCENARIO_ID,
  FLOW_MONITOR_SCENARIO_ID,
  FLOW_RELATION_EDGE_MARKERS,
  FLOW_WORKBENCH_SCENARIO_ID,
  readFlowRuntimeRouteQuery,
} from '@/platform-adapters/resources/system/workflow/manage'
import {PageTool} from '@spark-appworks/spark-project-model'
import {SparkComponentRenderer, SparkPageRenderer} from '@spark-appworks/spark-component'
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
const appendUser = shallowRef<Readonly<{context: NonNullable<typeof appendContext.value>; component: InstanceType<typeof FlowAppendUser>}>>()
const appendSession = computed(() => {
  const current = runtime.value, context = appendContext.value, source = prepared.value
  if (!current || !context || !source || !appendOpen.value) return undefined
  const isCurrent = () => runtime.value === current && session.isCurrent(current) && appendContext.value === context && appendOpen.value
  return {
    context, isCurrent, userDirectoryViewKey: source.userDirectoryViewKey, stepViewKey: stepViewKey.value,
    bind(component: InstanceType<typeof FlowAppendUser> | null) {
      if (component && isCurrent()) appendUser.value = {context, component}
      if (!component && appendUser.value?.context === context) appendUser.value = undefined
    },
  }
})

function actionState(id: string) {
  const action = Object.hasOwn(actions, id) ? actions[id] : undefined
  return {visible: !!action && action.visible?.() !== false, disabled: action?.blockedByNavigation === true && reloadBlocked.value,
    loading: action?.loading === true && handleLoading.value}
}

const host = computed(() => {
  const current = runtime.value
  if (!current) return undefined
  const assertCurrent = () => {
    if (runtime.value !== current || !session.isCurrent(current)) throw new Error('流程办理运行实例已失效')
  }
  return {runtime: current, assertCurrent, invoke(command: string, input: unknown) {
    assertCurrent()
    if (command === 'workflow.connect') return {
      controls: {render: SparkComponentRenderer, empty: SparkComponent.DisplayEmpty, alert: SparkComponent.DisplayAlert,
        tabs: SparkComponent.RendererTabs, pane: SparkComponent.RendererTabPane, dialog: SparkComponent.RendererDialog,
        route: FlowRunRouteRenderer, append: FlowAppendUser},
      shell: () => ({status: shellStatus.value, error: shellError.value, retryable: !shellLoading.value,
        reloadBlocked: reloadBlocked.value, ready: !!prepared.value}),
      hasPendingWork, actionState,
      business: () => ({source: prepared.value, error: handleError.value, tabs: businessTabs.value, mobile: props.mobile === true,
        active: activeFormId.value, registry: businessRegistry, select: selectBusinessForm}),
      approval: () => ({open: handleOpen.value, locked: inputLocked.value,
        showForceTarget: allowForceBack.value && forceBackNodeOptions.value.length > 0}),
      append: () => ({open: appendOpen.value, closeDisabled: appendCloseDisabled.value, child: appendSession.value,
        close: () => {
          if (runtime.value !== current || !session.isCurrent(current) || appendCloseDisabled.value) return
          appendOpen.value = false
          appendContext.value = null
          appendUser.value = undefined
        }}),
      chart: () => ({open: chartOpen.value, loading: chartLoading.value, error: chartError.value, graph: chartPrepared.value,
        markers: FLOW_RELATION_EDGE_MARKERS, close: () => {
          if (runtime.value === current && session.isCurrent(current)) chartOpen.value = false
        }}),
    }
    if (command === 'workflow.retry') return retryPage(reloadFeatureRuntime)
    const receiver = appendUser.value
    if (command.startsWith('append.') && appendOpen.value && receiver && receiver.context === appendContext.value) {
      return receiver.component.invoke(command.slice('append.'.length), input)
    }
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

</script>
