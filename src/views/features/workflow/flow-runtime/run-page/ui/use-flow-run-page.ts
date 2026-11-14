/**
 * @module app:views/features/workflow/flow-runtime/run-page/ui/use-flow-run-page
 * 职责：办理页装配、办理侧栏与提交流程编排。
 */
import {computed, ref, shallowRef, watch} from 'vue'
import {useRouter} from 'vue-router'
import {buildDataViewKey} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'
import {isRecord} from '@spark-appworks/spark-utils'
import {lowcodeApi, lowcodeHttp} from '@/lowcode/lowcode-runtime'
import {
  FLOW_DESIGN_SCENARIO_ID,
  FLOW_MONITOR_SCENARIO_ID,
  buildAppendUserContext,
  createFlowRunPageClient,
  prepareFlowRunDetailPage,
  prepareFlowRunPage,
  readFlowRuntimeRouteQuery,
  type FlowAppendUserContext,
  type FlowRunPreparedPage,
} from '@/lowcode/resources/system/workflow/manage'
import {
  createFlowBusinessPageRegistry,
  createFlowBusinessTabBuilder,
} from '../model/flow-run-business-tab'
import {getVuePageOptions} from '@/registries/vue-page-registry'

const STEP_MODEL = 'WFOBJ_FLOW_RELATIONLINE_STEP'

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

  const stepViewKey = computed(() => buildDataViewKey(STEP_MODEL, 'default', FLOW_MONITOR_SCENARIO_ID))

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
      handleOpen.value = true
    } catch (error) {
      handleError.value = error instanceof Error ? error.message : '加载办理选项失败'
    } finally {
      handleLoading.value = false
    }
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
      const nextNode = selectedNodeId.value
        ? [{NodeId: selectedNodeId.value, ExecUserList: []}]
        : []
      await clientFor(own).submitOrStart({
        flowId: prep.flowModelId,
        flowObjId: prep.flowObjectId,
        curStepId: String(step['rowid'] ?? ''),
        busRowid: prep.busRowId,
        ...(activeTab.value?.tabKey ? {formKey: activeTab.value.tabKey} : {}),
        nextNode,
        idea: opinionText.value,
        type: String(optionData.value['type'] ?? optionData.value['Type'] ?? ''),
      })
      if (own !== generation) return
      handleOpen.value = false
      opinionText.value = ''
      await loadPage()
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

  const nextNodeOptions = computed(() => {
    const raw = optionData.value['NextNodeList'] ?? optionData.value['nextNodeList'] ?? optionData.value['nodes']
    if (!Array.isArray(raw)) return []
    return raw.filter(isRecord).map(row => ({
      id: String(row['NodeId'] ?? row['rowid'] ?? row['id'] ?? ''),
      title: String(row['TITLE'] ?? row['Title'] ?? row['nodeName'] ?? row['NodeId'] ?? ''),
    })).filter(item => item.id)
  })

  const backNodeOptions = computed(() => {
    const raw = optionData.value['BackNodeList'] ?? optionData.value['backNodeList']
      ?? optionData.value['historyNodes'] ?? optionData.value['BackNodes']
    if (!Array.isArray(raw)) return []
    return raw.filter(isRecord).map(row => ({
      id: String(row['NodeId'] ?? row['nodeId'] ?? row['rowid'] ?? row['id'] ?? ''),
      title: String(row['TITLE'] ?? row['Title'] ?? row['nodeName'] ?? row['NodeId'] ?? row['nodeId'] ?? ''),
    })).filter(item => item.id)
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
    nextNodeOptions,
    backNodeOptions,
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
    loadPage,
    openHandlePanel,
    submitFlow,
    backByHistory,
    backToCreator,
    openAppendDialog,
    openFlowChart,
  }
}