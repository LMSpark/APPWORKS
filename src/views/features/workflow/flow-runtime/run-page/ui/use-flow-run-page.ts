/**
 * @module app:views/features/workflow/flow-runtime/run-page/ui/use-flow-run-page
 * 职责：办理页装配、办理侧栏与提交流程编排。
 */
import {computed, ref, shallowRef, watch} from 'vue'
import {useRouter} from 'vue-router'
import {buildDataViewKey, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'
import {isRecord} from '@spark-appworks/spark-utils'
import {lowcodeApi, lowcodeHttp} from '@/lowcode/lowcode-runtime'
import {
  FLOW_DESIGN_SCENARIO_ID,
  FLOW_MONITOR_SCENARIO_ID,
  FLOW_WORKBENCH_SCENARIO_ID,
  buildAppendUserContext,
  createFlowRunPageClient,
  prepareFlowRunDetailPage,
  prepareFlowRunPage,
  type readFlowRuntimeRouteQuery,
  type FlowAppendUserContext,
  type FlowRunPreparedPage,
} from '@/lowcode/resources/system/workflow/manage'
import {
  parseFlowRunHandleNodeOptions,
  readFlowRunAllowForceBack,
} from '@/lowcode/resources/system/workflow/manage/flow-run-page/flow-run-handle-options'
import {readCanAutoSubmitAfter} from '@/lowcode/resources/system/workflow/manage/flow-run-page/flow-run-auto-submit'
import {
  createFlowBusinessPageRegistry,
  createFlowBusinessTabBuilder,
} from '../model/flow-run-business-tab'
import {getVuePageOptions} from '@/registries/vue-page-registry'

const STEP_MODEL = 'WFOBJ_FLOW_RELATIONLINE_STEP'
const AUTO_SUBMIT_MAX_DEPTH = 3

export function useFlowRunPage(routeQuery: () => ReturnType<typeof readFlowRuntimeRouteQuery>, runtimeReady: () => boolean) {
  const router = useRouter()
  const {sparkConsume} = useSparkComponent({type: 'flow-run-page'})
  const prepared = shallowRef<FlowRunPreparedPage>()
  const pageLoading = ref(false)
  const pageError = ref('')
  const handleOpen = ref(false)
  const handleLoading = ref(false)
  const handleError = ref('')
  const optionData = shallowRef<Record<string, unknown>>({})
  const opinionText = ref('')
  const selectedNodeId = ref('')
  const selectedBackNodeId = ref('')
  const selectedForceBackNodeId = ref('')
  const activeFormId = ref('')
  const appendOpen = ref(false)
  const appendContext = shallowRef<FlowAppendUserContext | null>(null)
  const chartOpen = ref(false)
  const chartLoading = ref(false)
  const chartError = ref('')
  const chartPrepared = shallowRef<Awaited<ReturnType<typeof prepareFlowRunDetailPage>> | null>(null)
  const businessRegistry = createFlowBusinessPageRegistry()
  const registeredPaths = computed(() => new Set(getVuePageOptions().map(item => item.path)))
  const buildTab = createFlowBusinessTabBuilder(() => registeredPaths.value)
  let generation = 0

  const businessTabs = computed(() => (prepared.value?.formTabs ?? []).map(tab => buildTab({
    tabKey: tab.tabKey,
    label: tab.label,
    sourcePath: tab.sourcePath,
    queryString: tab.queryString,
  }, router)))

  const activeTab = computed(() => businessTabs.value.find(tab => tab.tabKey === activeFormId.value) ?? businessTabs.value[0])

  const stepViewKey = computed(() => prepared.value?.stepHistoryViewKey
    ?? buildDataViewKey(STEP_MODEL, 'default', FLOW_WORKBENCH_SCENARIO_ID))

  const stepHistoryColumns: SparkNode[] = [
    {type: 'r-text', props: {field: 'description', label: '摘要', readonly: true, minWidth: 220, showOverflowTooltip: true}},
    {type: 'r-text', props: {field: 'ReceiveUserName', label: '办理人', readonly: true, minWidth: 120}},
    {type: 'r-text', props: {field: 'STARTTIME', label: '开始时间', readonly: true, minWidth: 160}},
    {type: 'r-text', props: {field: 'StepState', label: '状态', readonly: true, minWidth: 80}},
  ]

  function clientFor(gen: number) {
    return createFlowRunPageClient({
      http: lowcodeHttp,
      scenarioId: FLOW_MONITOR_SCENARIO_ID,
      readScope: () => lowcodeApi.readRequestScope(),
      assertCurrent: () => gen === generation,
    })
  }

  async function loadPage(): Promise<void> {
    const own = ++generation
    pageLoading.value = true
    pageError.value = ''
    prepared.value = undefined
    try {
      if (!runtimeReady()) throw new Error('办理页场景尚未就绪')
      const runtime = sparkConsume(PAGE_RUNTIME)
      if (!runtime) throw new Error('缺少页面运行实例')
      const query = routeQuery()
      prepared.value = await prepareFlowRunPage({
        runtime,
        wfid: query.wfid,
        flowid: query.flowid,
        assertCurrent: () => own === generation,
      })
      if (own !== generation) return
      activeFormId.value = prepared.value.formTabs[0]?.tabKey ?? ''
    } catch (error) {
      if (own === generation) pageError.value = error instanceof Error ? error.message : '加载办理页失败'
    } finally {
      if (own === generation) pageLoading.value = false
    }
  }

  async function openHandlePanel(): Promise<void> {
    const own = generation
    handleLoading.value = true
    handleError.value = ''
    try {
      const runtime = sparkConsume(PAGE_RUNTIME)
      const stepView = runtime?.resolveView(stepViewKey.value)
      const step = stepView?.rows.find(isRecord)
      const prep = prepared.value
      if (!prep || !step) throw new Error('未定位到当前办理步骤')
      const options = await clientFor(own).getHandleOptionData({
        modelId: prep.flowModelId,
        stepId: String(step['rowid'] ?? ''),
        busRowId: prep.busRowId,
        ...(activeTab.value?.tabKey ? {formid: activeTab.value.tabKey} : {}),
      })
      if (own !== generation) return
      optionData.value = options
      selectedNodeId.value = String(options['DefaultNodeId'] ?? options['defaultNodeId'] ?? '')
      const backList = backNodeOptions.value
      selectedBackNodeId.value = backList[0]?.id ?? ''
      const forceList = forceBackNodeOptions.value
      selectedForceBackNodeId.value = forceList[0]?.id ?? ''
      handleOpen.value = true
    } catch (error) {
      handleError.value = error instanceof Error ? error.message : '加载办理选项失败'
    } finally {
      handleLoading.value = false
    }
  }

  async function runSubmitWithCurrentStep(own: number, opinion: string, nextNodeId: string): Promise<void> {
    const runtime = sparkConsume(PAGE_RUNTIME)
    const stepView = runtime?.resolveView(stepViewKey.value)
    const step = stepView?.rows.find(isRecord)
    const prep = prepared.value
    if (!prep || !step) throw new Error('未定位到当前办理步骤')
    const nextNode = nextNodeId ? [{NodeId: nextNodeId, ExecUserList: []}] : []
    await clientFor(own).submitOrStart({
      flowId: prep.flowModelId,
      flowObjId: prep.flowObjectId,
      curStepId: String(step['rowid'] ?? ''),
      busRowid: prep.busRowId,
      ...(activeTab.value?.tabKey ? {formKey: activeTab.value.tabKey} : {}),
      nextNode,
      idea: opinion,
      type: String(optionData.value['type'] ?? optionData.value['Type'] ?? ''),
    })
  }

  async function tryAutoSubmitAfterReload(own: number, depth: number): Promise<void> {
    if (depth >= AUTO_SUBMIT_MAX_DEPTH) return
    const runtime = sparkConsume(PAGE_RUNTIME)
    const step = runtime?.resolveView(stepViewKey.value)?.rows.find(isRecord)
    const prep = prepared.value
    if (!prep || !step) return
    const curStepId = String(step['rowid'] ?? '')
    const can = await clientFor(own).canAutoSubmitAfter(curStepId)
    if (own !== generation) return
    if (!readCanAutoSubmitAfter(can)) return
    const options = await clientFor(own).getHandleOptionData({
      modelId: prep.flowModelId,
      stepId: curStepId,
      busRowId: prep.busRowId,
      ...(activeTab.value?.tabKey ? {formid: activeTab.value.tabKey} : {}),
    })
    if (own !== generation) return
    optionData.value = options
    const nodes = parseFlowRunHandleNodeOptions(options, ['NextNodeList', 'nextNodeList', 'nodes'])
    const nextId = String(options['DefaultNodeId'] ?? options['defaultNodeId'] ?? nodes[0]?.id ?? '')
    selectedNodeId.value = nextId
    await runSubmitWithCurrentStep(own, opinionText.value, nextId)
    if (own !== generation) return
    await loadPage()
    if (own !== generation) return
    await tryAutoSubmitAfterReload(own, depth + 1)
  }

  async function submitFlow(): Promise<void> {
    const own = generation
    handleLoading.value = true
    handleError.value = ''
    try {
      const runtime = sparkConsume(PAGE_RUNTIME)
      const stepView = runtime?.resolveView(stepViewKey.value)
      const step = stepView?.rows.find(isRecord)
      const prep = prepared.value
      if (!prep || !step) throw new Error('未定位到当前办理步骤')
      const activePage = activeTab.value?.tabKey ? businessRegistry.get(activeTab.value.tabKey) : null
      if (activePage?.flowSubmit) {
        const gate = await activePage.flowSubmit()
        if (gate === false || String(gate).toLowerCase() === 'cancel') return
      }
      await runSubmitWithCurrentStep(own, opinionText.value, selectedNodeId.value)
      if (own !== generation) return
      handleOpen.value = false
      opinionText.value = ''
      await loadPage()
      if (own !== generation) return
      await tryAutoSubmitAfterReload(own, 0)
    } catch (error) {
      handleError.value = error instanceof Error ? error.message : '提交失败'
    } finally {
      handleLoading.value = false
    }
  }

  async function backByHistory(): Promise<void> {
    const own = generation
    handleLoading.value = true
    handleError.value = ''
    try {
      const runtime = sparkConsume(PAGE_RUNTIME)
      const stepView = runtime?.resolveView(stepViewKey.value)
      const step = stepView?.rows.find(isRecord)
      const prep = prepared.value
      const nodeId = selectedBackNodeId.value
      if (!prep || !step) throw new Error('未定位到当前办理步骤')
      if (!nodeId) throw new Error('请选择退回目标节点')
      await clientFor(own).backByHistory({
        flowObjId: prep.flowObjectId,
        curStepId: String(step['rowid'] ?? ''),
        nodeId,
        idea: opinionText.value,
      })
      if (own !== generation) return
      handleOpen.value = false
      await loadPage()
    } catch (error) {
      handleError.value = error instanceof Error ? error.message : '退回上一节点失败'
    } finally {
      handleLoading.value = false
    }
  }

  async function forceBack(): Promise<void> {
    const own = generation
    handleLoading.value = true
    handleError.value = ''
    try {
      const runtime = sparkConsume(PAGE_RUNTIME)
      const stepView = runtime?.resolveView(stepViewKey.value)
      const step = stepView?.rows.find(isRecord)
      const prep = prepared.value
      const nodeId = selectedForceBackNodeId.value
      if (!prep || !step) throw new Error('未定位到当前办理步骤')
      if (!nodeId) throw new Error('请选择强制退回目标节点')
      await clientFor(own).forceBack({
        flowObjId: prep.flowObjectId,
        curStepId: String(step['rowid'] ?? ''),
        nodeId,
        idea: opinionText.value,
      })
      if (own !== generation) return
      handleOpen.value = false
      await loadPage()
    } catch (error) {
      handleError.value = error instanceof Error ? error.message : '强制退回失败'
    } finally {
      handleLoading.value = false
    }
  }

  async function backToCreator(): Promise<void> {
    const own = generation
    handleLoading.value = true
    handleError.value = ''
    try {
      const runtime = sparkConsume(PAGE_RUNTIME)
      const stepView = runtime?.resolveView(stepViewKey.value)
      const step = stepView?.rows.find(isRecord)
      const prep = prepared.value
      if (!prep || !step) throw new Error('未定位到当前办理步骤')
      await clientFor(own).rejectToCreator({
        flowObjId: prep.flowObjectId,
        curStepId: String(step['rowid'] ?? ''),
        idea: opinionText.value,
      })
      if (own !== generation) return
      await loadPage()
    } catch (error) {
      handleError.value = error instanceof Error ? error.message : '退回发起人失败'
    } finally {
      handleLoading.value = false
    }
  }

  function openAppendDialog(): void {
    const runtime = sparkConsume(PAGE_RUNTIME)
    const step = runtime?.resolveView(stepViewKey.value)?.rows.find(isRecord)
    appendContext.value = buildAppendUserContext(step)
    if (!appendContext.value) {
      pageError.value = '当前步骤不支持加签'
      return
    }
    appendOpen.value = true
  }

  async function revokeCurrentStep(): Promise<void> {
    const own = generation
    handleLoading.value = true
    handleError.value = ''
    try {
      const runtime = sparkConsume(PAGE_RUNTIME)
      const step = runtime?.resolveView(stepViewKey.value)?.rows.find(isRecord)
      const prep = prepared.value
      if (!prep || !step) throw new Error('未定位到当前办理步骤')
      await clientFor(own).revokeCurrentStep(prep.flowObjectId, String(step['rowid'] ?? ''))
      if (own !== generation) return
      handleOpen.value = false
      await loadPage()
    } catch (error) {
      if (own === generation) handleError.value = error instanceof Error ? error.message : '撤回失败'
    } finally {
      if (own === generation) handleLoading.value = false
    }
  }

  async function openFlowChart(): Promise<void> {
    const own = ++generation
    chartOpen.value = true
    chartLoading.value = true
    chartError.value = ''
    chartPrepared.value = null
    try {
      const runtime = sparkConsume(PAGE_RUNTIME)
      if (!runtime) throw new Error('缺少页面运行实例')
      const query = routeQuery()
      chartPrepared.value = await prepareFlowRunDetailPage({
        runtime,
        wfid: query.wfid,
        flowid: query.flowid,
        assertCurrent: () => own === generation,
      })
    } catch (error) {
      if (own === generation) chartError.value = error instanceof Error ? error.message : '加载流程图失败'
    } finally {
      if (own === generation) chartLoading.value = false
    }
  }

  const nextNodeOptions = computed(() => parseFlowRunHandleNodeOptions(optionData.value, [
    'NextNodeList', 'nextNodeList', 'nodes',
  ]))

  const backNodeOptions = computed(() => parseFlowRunHandleNodeOptions(optionData.value, [
    'BackNodeList', 'backNodeList', 'historyNodes', 'BackNodes',
  ]))

  const forceBackNodeOptions = computed(() => parseFlowRunHandleNodeOptions(optionData.value, [
    'ForceBackNodeList', 'forceBackNodeList', 'ForceBackNodes',
  ]))

  const allowForceBack = computed(() => {
    if (readFlowRunAllowForceBack(optionData.value)) return true
    return forceBackNodeOptions.value.length > 0
  })

  watch(() => [runtimeReady(), routeQuery().wfid, routeQuery().flowid] as const, () => {
    if (runtimeReady()) void loadPage()
  }, {immediate: true})

  return {
    FLOW_DESIGN_SCENARIO_ID,
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
    activeTab,
    businessRegistry,
    appendOpen,
    appendContext,
    chartOpen,
    chartLoading,
    chartError,
    chartPrepared,
    stepViewKey,
    stepHistoryColumns,
    loadPage,
    openHandlePanel,
    submitFlow,
    revokeCurrentStep,
    backByHistory,
    forceBack,
    backToCreator,
    openAppendDialog,
    openFlowChart,
  }
}
