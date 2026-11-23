/**
 * @module app:views/features/workflow/flow-runtime/detail/ui/use-flow-run-detail-page
 * 职责：运行详情只读图加载与节点/连线步骤钻取弹窗状态。
 */
import {onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import type {GraphSelection} from '@spark-appworks/spark-component'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {
  FLOW_RUN_GRAPH_NODE_BADGE_FIELD,
  prepareFlowRunDetailPage,
  type FlowRunDetailPreparedPage,
} from '@/platform-adapters/resources/system/workflow/manage'

export type FlowRunDetailRouteQuery = Readonly<{wfid: string; flowid: string}>

const NODE_BADGE_RULES = [
  {field: FLOW_RUN_GRAPH_NODE_BADGE_FIELD, value: 'waiting', label: '待办', tone: 'warning' as const},
  {field: FLOW_RUN_GRAPH_NODE_BADGE_FIELD, value: 'completed', label: '已完成', tone: 'success' as const},
]

export function useFlowRunDetailPage(routeQuery: () => FlowRunDetailRouteQuery, getRuntime: () => PageRuntime | undefined) {
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
  const selectedNodeId = ref(''), edgeSourceId = ref(''), edgeTargetId = ref('')
  let generation = 0
  const withdraw = () => {generation++; prepared.value = undefined; graphReady.value = false; graphLoading.value = false; graphError.value = ''; nodeDialogOpen.value = false; edgeDialogOpen.value = false}

  async function loadGraph(): Promise<void> {
    const own = ++generation
    nodeDialogOpen.value = false; edgeDialogOpen.value = false
    graphReady.value = false
    graphLoading.value = true
    graphError.value = ''
    prepared.value = undefined
    try {
      const runtime = getRuntime()
      if (!runtime) throw new Error('运行详情场景尚未就绪')
      const query = routeQuery()
      const next = await prepareFlowRunDetailPage({
        runtime,
        wfid: query.wfid,
        flowid: query.flowid,
        assertCurrent: () => {const current = routeQuery(); if (own !== generation || current.wfid !== query.wfid || current.flowid !== query.flowid || getRuntime() !== runtime) throw Error('原流程详情读取已失效')},
      })
      if (own !== generation) return
      prepared.value = next
      graphReady.value = true
    } catch (cause) {
      if (own === generation) graphError.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      if (own === generation) graphLoading.value = false
    }
  }

  function resolveNodeTitle(nodeId: string): string {
    const runtime = getRuntime()
    const view = prepared.value && runtime ? runtime.resolveView(prepared.value.nodeViewKey) : null
    const row = view?.rows.find(item => String(item['rowid'] ?? '') === nodeId)
    const title = row && view?.fieldAccess(row, 'TITLE').read === 'visible' ? row['TITLE'] : undefined
    return typeof title === 'string' && title.trim() ? title.trim() : nodeId
  }

  function onGraphSelect(event: GraphSelection): void {
    if (!prepared.value) return
    if (event.kind === 'node') {
      const nodeId = String(event.id)
      nodeDialogTitle.value = `${resolveNodeTitle(nodeId)} - 步骤信息`
      selectedNodeId.value = nodeId
      nodeActiveTab.value = 'received'
      nodeShowVoided.value = false
      nodeDialogOpen.value = true
      return
    }
    const runtime = getRuntime()
    const edgeView = runtime?.resolveView(prepared.value.edgeViewKey)
    const row = edgeView?.rows.find(item => String(item['rowid'] ?? item['ROWID'] ?? '') === String(event.id))
    if (!row || edgeView?.fieldAccess(row, 'UpNodeID').read !== 'visible' || edgeView.fieldAccess(row, 'NextNodeID').read !== 'visible') return
    const source = String(row['UpNodeID'] ?? '')
    const target = String(row['NextNodeID'] ?? '')
    edgeDialogTitle.value = `${resolveNodeTitle(source)} → ${resolveNodeTitle(target)} - 步骤信息`
    edgeSourceId.value = source; edgeTargetId.value = target
    edgeActiveTab.value = 'edge'
    edgeShowVoided.value = false
    edgeDialogOpen.value = true
  }

  watch(() => [getRuntime(), routeQuery().wfid, routeQuery().flowid] as const, () => {
    if (getRuntime()) void loadGraph()
    else withdraw()
  }, {immediate: true})
  onBeforeUnmount(withdraw)

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
    selectedNodeId, edgeSourceId, edgeTargetId,
    onGraphSelect,
    reloadGraph: loadGraph,
  }
}
