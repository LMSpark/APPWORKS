/**
 * @module app:views/features/workflow/flow-runtime/detail/ui/use-flow-run-detail-page
 * 职责：运行详情只读图加载与节点/连线步骤钻取弹窗状态。
 */
import {computed, ref, shallowRef, watch} from 'vue'
import type {GraphSelection} from '@spark-appworks/spark-component'
import {PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'
import {isRecord} from '@spark-appworks/spark-utils'
import {
  FLOW_RUN_GRAPH_NODE_BADGE_FIELD,
  buildWaitingStepIdSet,
  filterVoidedSteps,
  isWaitingStep,
  prepareFlowRunDetailPage,
  stepsOnEdge,
  stepsReceivedAtNode,
  stepsSentFromNode,
  type FlowRunDetailPreparedPage,
} from '@/lowcode/resources/system/workflow/manage'

export type FlowRunDetailRouteQuery = Readonly<{wfid: string; flowid: string}>

const NODE_BADGE_RULES = [
  {field: FLOW_RUN_GRAPH_NODE_BADGE_FIELD, value: 'waiting', label: '待办', tone: 'warning' as const},
  {field: FLOW_RUN_GRAPH_NODE_BADGE_FIELD, value: 'completed', label: '已完成', tone: 'success' as const},
]

export function useFlowRunDetailPage(routeQuery: () => FlowRunDetailRouteQuery, runtimeReady: () => boolean) {
  const {sparkConsume} = useSparkComponent({type: 'flow-run-detail-page'})
  const prepared = shallowRef<FlowRunDetailPreparedPage>()
  const graphLoading = ref(false)
  const graphError = ref('')
  const graphReady = ref(false)
  const nodeDialogOpen = ref(false)
  const edgeDialogOpen = ref(false)
  const nodeShowVoided = ref(false)
  const edgeShowVoided = ref(false)
  const nodeDialogTitle = ref('')
  const edgeDialogTitle = ref('')
  const nodeActiveTab = ref<'received' | 'sent' | 'all'>('received')
  const edgeActiveTab = ref<'edge' | 'all'>('edge')
  const nodeReceivedRows = ref<ReadonlyArray<Record<string, unknown>>>([])
  const nodeSentRows = ref<ReadonlyArray<Record<string, unknown>>>([])
  const edgeRows = ref<ReadonlyArray<Record<string, unknown>>>([])
  const stepRows = ref<ReadonlyArray<Record<string, unknown>>>([])
  const waitingStepIds = ref<ReadonlySet<string>>(new Set())
  let generation = 0

  const nodeReceivedDisplay = computed(() => filterVoidedSteps(nodeReceivedRows.value, nodeShowVoided.value))
  const nodeSentDisplay = computed(() => filterVoidedSteps(nodeSentRows.value, nodeShowVoided.value))
  const nodeAllDisplay = computed(() => filterVoidedSteps(stepRows.value, nodeShowVoided.value))
  const edgeDisplay = computed(() => filterVoidedSteps(edgeRows.value, edgeShowVoided.value))
  const edgeAllDisplay = computed(() => filterVoidedSteps(stepRows.value, edgeShowVoided.value))

  async function loadGraph(): Promise<void> {
    const own = ++generation
    graphReady.value = false
    graphLoading.value = true
    graphError.value = ''
    prepared.value = undefined
    try {
      if (!runtimeReady()) throw new Error('运行详情场景尚未就绪')
      const runtime = sparkConsume(PAGE_RUNTIME)
      if (!runtime) throw new Error('缺少页面运行实例')
      const query = routeQuery()
      const next = await prepareFlowRunDetailPage({
        runtime,
        wfid: query.wfid,
        flowid: query.flowid,
        assertCurrent: () => {const current = routeQuery(); if (own !== generation || current.wfid !== query.wfid || current.flowid !== query.flowid || sparkConsume(PAGE_RUNTIME) !== runtime) throw Error('原流程详情读取已失效')},
      })
      if (own !== generation) return
      prepared.value = next
      const stepView = runtime.resolveView(next.stepViewKey)
      stepRows.value = stepView && !stepView.destroyed ? stepView.rows.filter(isRecord) : []
      const waitingView = runtime.resolveView(next.waitingViewKey)
      waitingStepIds.value = buildWaitingStepIdSet(
        waitingView && !waitingView.destroyed ? waitingView.rows.filter(isRecord) : [],
      )
      graphReady.value = true
    } catch (cause) {
      if (own === generation) graphError.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      if (own === generation) graphLoading.value = false
    }
  }

  function resolveNodeTitle(nodeId: string): string {
    const runtime = sparkConsume(PAGE_RUNTIME)
    const view = prepared.value && runtime ? runtime.resolveView(prepared.value.nodeViewKey) : null
    const row = view?.rows.find(item => String(item['rowid'] ?? '') === nodeId)
    const title = row?.['TITLE']
    return typeof title === 'string' && title.trim() ? title.trim() : nodeId
  }

  function onGraphSelect(event: GraphSelection): void {
    if (!prepared.value) return
    if (event.kind === 'node') {
      const nodeId = String(event.id)
      nodeDialogTitle.value = `${resolveNodeTitle(nodeId)} - 步骤信息`
      nodeReceivedRows.value = stepsReceivedAtNode(stepRows.value, nodeId)
      nodeSentRows.value = stepsSentFromNode(stepRows.value, nodeId)
      nodeActiveTab.value = 'received'
      nodeShowVoided.value = false
      nodeDialogOpen.value = true
      return
    }
    const runtime = sparkConsume(PAGE_RUNTIME)
    const edgeView = runtime?.resolveView(prepared.value.edgeViewKey)
    const row = edgeView?.rows.find(item => String(item['rowid'] ?? item['ROWID'] ?? '') === String(event.id))
    const source = String(row?.['PARENTID'] ?? '')
    const target = String(row?.['CHILDID'] ?? '')
    edgeDialogTitle.value = `${resolveNodeTitle(source)} → ${resolveNodeTitle(target)} - 步骤信息`
    edgeRows.value = stepsOnEdge(stepRows.value, source, target)
    edgeActiveTab.value = 'edge'
    edgeShowVoided.value = false
    edgeDialogOpen.value = true
  }

  watch(() => [runtimeReady(), routeQuery().wfid, routeQuery().flowid] as const, () => {
    if (runtimeReady()) void loadGraph()
  }, {immediate: true})

  return {
    prepared,
    graphLoading,
    graphError,
    graphReady,
    nodeBadgeRules: NODE_BADGE_RULES,
    nodeDialogOpen,
    edgeDialogOpen,
    nodeShowVoided,
    edgeShowVoided,
    nodeDialogTitle,
    edgeDialogTitle,
    nodeActiveTab,
    edgeActiveTab,
    nodeReceivedDisplay,
    nodeSentDisplay,
    nodeAllDisplay,
    edgeDisplay,
    edgeAllDisplay,
    onGraphSelect,
    isWaitingStep: (rowid: unknown) => isWaitingStep(rowid, waitingStepIds.value),
    reloadGraph: loadGraph,
  }
}
