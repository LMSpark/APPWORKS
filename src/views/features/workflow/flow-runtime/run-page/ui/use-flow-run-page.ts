/**
 * @module app:views/features/workflow/flow-runtime/run-page/ui/use-flow-run-page
 * 职责：办理页装配、办理侧栏与提交流程编排。
 */
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {useRouter} from 'vue-router'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, type DataRow, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, useDataViewState, useSparkComponent} from '@spark-appworks/spark-component'
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
import {submitApprovalCommand, verifyApprovalCommand} from '@/lowcode/resources/system/workflow/manage/flow-run-page/command/submit'
import {getVuePageOptions} from '@/registries/vue-page-registry'

const STEP_MODEL = 'WFOBJ_FLOW_RELATIONLINE_STEP'
const AUTO_SUBMIT_MAX_DEPTH = 3

export function useFlowRunPage(routeQuery: () => ReturnType<typeof readFlowRuntimeRouteQuery>, runtimeReady: () => boolean) {
  const router = useRouter()
  const {sparkConsume} = useSparkComponent({type: 'flow-run-page'})
  function hasPendingApproval(): boolean {
    const view = sparkConsume(PAGE_RUNTIME)?.getDataSet(FLOW_WORKBENCH_SCENARIO_ID)?.getView('ApprovalCommand', 'default')
    return view !== undefined && (view.mutating || view.hasUnconfirmedSave || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())
  }
  useSystemPageDirtySource({get isDirty() {return hasPendingApproval()}})
  const prepared = shallowRef<FlowRunPreparedPage>()
  const pageLoading = ref(false)
  const pageError = ref('')
  const handleOpen = ref(false)
  const handleLoading = ref(false)
  const handleError = ref('')
  const optionsView = computed(() => {
    runtimeReady(); prepared.value
    return sparkConsume(PAGE_RUNTIME)?.getDataSet(FLOW_WORKBENCH_SCENARIO_ID)?.getView('ApprovalOptions', 'default') ?? null
  })
  const optionsState = useDataViewState(optionsView)
  const optionData = computed<Record<string, unknown>>(() => {
    const rows = optionsState.rows.value
    optionsState.requestState.value
    const view = optionsView.value
    if (!view || view.loadingError || rows.length !== 1) return {}
    const row = rows[0]
    if (!row) return {}
    try {view.captureReadRow(row, ['payload'])(); return isRecord(row['payload']) ? row['payload'] : {}}
    catch {return {}}
  })
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
  onBeforeUnmount(() => {
    generation += 1
    businessRegistry.clear()
  })

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

  function readCurrentStep() {
    const stepId = prepared.value?.stepId
    if (!stepId) return undefined
    const runtime = sparkConsume(PAGE_RUNTIME)
    return runtime?.resolveView(stepViewKey.value)?.rows.find(row => isRecord(row) && String(row['rowid'] ?? '') === stepId && String(row['WFOBJID'] ?? '') === prepared.value?.flowObjectId)
  }

  function assertGeneration(value: number): void {
    if (value !== generation) throw new Error('流程办理目标已失效')
  }

  async function executeApproval(own: number, action: string, params: Readonly<DataRow>): Promise<void> {
    assertGeneration(own)
    const runtime = sparkConsume(PAGE_RUNTIME)
    const ds = runtime?.getDataSet(FLOW_WORKBENCH_SCENARIO_ID)
    if (!ds) throw new Error('审批命令空间未装配')
    const {flowObjId, curStepId, ...fields} = params
    await submitApprovalCommand(ds, {...fields, action, flowObjectId: flowObjId, stepId: curStepId})
    assertGeneration(own)
  }

  function clientFor(gen: number) {
    return createFlowRunPageClient({
      http: lowcodeHttp,
      scenarioId: FLOW_MONITOR_SCENARIO_ID,
      readScope: () => lowcodeApi.readRequestScope(),
      assertCurrent: () => assertGeneration(gen),
    })
  }

  async function queryHandleOptions(own: number): Promise<Record<string, unknown>> {
    assertGeneration(own)
    const prep = prepared.value, step = readCurrentStep(), view = optionsView.value
    if (!prep || !step || !view) throw Error('办理选项视图或当前步骤尚未装配')
    Object.assign(view.queryContext, {modelId: prep.flowModelId, stepId: String(step['rowid'] ?? ''), busRowId: prep.busRowId, formid: activeTab.value?.tabKey ?? ''})
    await view.refresh()
    assertGeneration(own)
    if (view !== optionsView.value || view.loadingError) throw view.loadingError ?? Error('办理选项视图已变化')
    const row = view.rows[0]
    if (view.rows.length !== 1 || !row) throw Error('办理选项缺少唯一查询结果')
    view.captureReadRow(row, ['payload'])()
    if (!isRecord(row['payload'])) throw Error('办理选项响应结构无效')
    return row['payload']
  }

  async function verifyOriginalApproval(): Promise<void> {
    const own = generation
    handleLoading.value = true
    handleError.value = ''
    try {
      const ds = sparkConsume(PAGE_RUNTIME)?.getDataSet(FLOW_WORKBENCH_SCENARIO_ID)
      if (!ds) throw Error('原审批命令空间未装配')
      await verifyApprovalCommand(ds)
      assertGeneration(own)
    } catch (error) {
      if (own === generation) handleError.value = error instanceof Error ? error.message : '原审批结果核验失败'
    } finally {
      if (own === generation) handleLoading.value = false
    }
  }

  async function loadPage(): Promise<void> {
    if (hasPendingApproval()) {handleError.value = '原审批命令尚有待提交或待核验状态，请先处理原命令'; return}
    const own = ++generation
    pageLoading.value = true
    pageError.value = ''
    prepared.value = undefined
    try {
      if (!runtimeReady()) throw new Error('办理页场景尚未就绪')
      const runtime = sparkConsume(PAGE_RUNTIME)
      if (!runtime) throw new Error('缺少页面运行实例')
      const query = routeQuery()
      const result = await prepareFlowRunPage({
        runtime,
        wfid: query.wfid,
        flowid: query.flowid,
        ...(query.stepid ? {stepId: query.stepid} : {}),
        assertCurrent: () => assertGeneration(own),
      })
      if (own !== generation) return
      prepared.value = result
      activeFormId.value = prepared.value.formTabs[0]?.tabKey ?? ''
    } catch (error) {
      if (own === generation) pageError.value = error instanceof Error ? error.message : '加载办理页失败'
    } finally {
      if (own === generation) pageLoading.value = false
    }
  }

  async function retryPage(reload: () => Promise<void>): Promise<void> {
    if (hasPendingApproval()) {handleError.value = '原审批命令尚有待提交或待核验状态，不能重建运行实例'; return}
    await reload()
    await loadPage()
  }

  async function openHandlePanel(): Promise<void> {
    const own = generation
    handleLoading.value = true
    handleError.value = ''
    try {
      const step = readCurrentStep()
      const prep = prepared.value
      if (!prep || !step) throw new Error('未定位到当前办理步骤')
      const options = await queryHandleOptions(own)
      if (own !== generation) return
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
    const step = readCurrentStep()
    const prep = prepared.value
    if (!prep || !step) throw new Error('未定位到当前办理步骤')
    const nextNode = nextNodeId ? [{NodeId: nextNodeId, ExecUserList: []}] : []
    await executeApproval(own, 'submit', {
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
    const step = readCurrentStep()
    const prep = prepared.value
    if (!prep || !step) return
    const curStepId = String(step['rowid'] ?? '')
    const can = await clientFor(own).canAutoSubmitAfter(curStepId)
    if (own !== generation) return
    if (!readCanAutoSubmitAfter(can)) return
    const options = await queryHandleOptions(own)
    if (own !== generation) return
    const nodes = parseFlowRunHandleNodeOptions(options, ['nextNodes', 'NextNodeList', 'nextNodeList', 'nodes'])
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
      const step = readCurrentStep()
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
      const step = readCurrentStep()
      const prep = prepared.value
      const nodeId = selectedBackNodeId.value
      if (!prep || !step) throw new Error('未定位到当前办理步骤')
      if (!nodeId) throw new Error('请选择退回目标节点')
      await executeApproval(own, 'back', {
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
      const step = readCurrentStep()
      const prep = prepared.value
      const nodeId = selectedForceBackNodeId.value
      if (!prep || !step) throw new Error('未定位到当前办理步骤')
      if (!nodeId) throw new Error('请选择强制退回目标节点')
      await executeApproval(own, 'forceBack', {
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
      const step = readCurrentStep()
      const prep = prepared.value
      if (!prep || !step) throw new Error('未定位到当前办理步骤')
      await executeApproval(own, 'toCreator', {
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
    const step = readCurrentStep()
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
      const step = readCurrentStep()
      const prep = prepared.value
      if (!prep || !step) throw new Error('未定位到当前办理步骤')
      await executeApproval(own, 'revoke', {flowObjId: prep.flowObjectId, curStepId: String(step['rowid'] ?? '')})
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
        assertCurrent: () => assertGeneration(own),
      })
    } catch (error) {
      if (own === generation) chartError.value = error instanceof Error ? error.message : '加载流程图失败'
    } finally {
      if (own === generation) chartLoading.value = false
    }
  }

  const nextNodeOptions = computed(() => parseFlowRunHandleNodeOptions(optionData.value, [
    'nextNodes', 'NextNodeList', 'nextNodeList', 'nodes',
  ]))

  const backNodeOptions = computed(() => parseFlowRunHandleNodeOptions(optionData.value, [
    'allowToBackSteps', 'BackNodeList', 'backNodeList', 'historyNodes', 'BackNodes',
  ]))

  const forceBackNodeOptions = computed(() => parseFlowRunHandleNodeOptions(optionData.value, [
    'forceBackNodes', 'ForceBackNodeList', 'forceBackNodeList', 'ForceBackNodes',
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
    retryPage,
    openHandlePanel,
    submitFlow,
    verifyOriginalApproval,
    revokeCurrentStep,
    backByHistory,
    forceBack,
    backToCreator,
    openAppendDialog,
    openFlowChart,
  }
}
