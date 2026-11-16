/**
 * @module app:views/features/workflow/flow-runtime/run-page/ui/use-flow-run-page
 * 职责：办理页装配、办理侧栏与提交流程编排。
 */
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {useRouter} from 'vue-router'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, DataView, type DataRow, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, useDataViewState, useSparkComponent} from '@spark-appworks/spark-component'
import {isRecord} from '@spark-appworks/spark-utils'
import {
  FLOW_DESIGN_SCENARIO_ID,
  FLOW_WORKBENCH_SCENARIO_ID,
  buildAppendUserContext,
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
import {FlowRunApprovalInputWorkspace} from '@/lowcode/resources/system/workflow/manage/flow-run-page/input/approval-input-workspace'
import {flowRunInputFields, flowRunNodeFields} from '../model/flow-run-input-fields'
import {submitFlowBusinessPage} from '../model/flow-run-business-submit'
import {
  createFlowBusinessPageRegistry,
  createFlowBusinessTabBuilder,
} from '../model/flow-run-business-tab'
import {submitApprovalCommand, verifyApprovalCommand} from '@/lowcode/resources/system/workflow/manage/flow-run-page/command/submit'
import {getVuePageOptions} from '@/registries/vue-page-registry'

const STEP_MODEL = 'WFOBJ_FLOW_RELATIONLINE_STEP'

export function useFlowRunPage(routeQuery: () => ReturnType<typeof readFlowRuntimeRouteQuery>, runtimeReady: () => boolean) {
  const router = useRouter()
  const {sparkConsume} = useSparkComponent({type: 'flow-run-page'})
  const approvalWorkspace = shallowRef<FlowRunApprovalInputWorkspace>()
  function hasPendingApproval(): boolean {
    const view = sparkConsume(PAGE_RUNTIME)?.getDataSet(FLOW_WORKBENCH_SCENARIO_ID)?.getView('ApprovalCommand', 'default')
    return view !== undefined && (view.mutating || view.hasUnconfirmedSave || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())
  }
  useSystemPageDirtySource({get isDirty() {return hasPendingApproval() || approvalWorkspace.value?.dirty === true}})
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
  const inputViewKey = buildDataViewKey('ApprovalInput', 'default', FLOW_WORKBENCH_SCENARIO_ID)
  const nodeInputViewKey = buildDataViewKey('ApprovalNodeInput', 'default', FLOW_WORKBENCH_SCENARIO_ID)
  const commandView = computed(() => {
    runtimeReady(); prepared.value
    const view = sparkConsume(PAGE_RUNTIME)?.getDataSet(FLOW_WORKBENCH_SCENARIO_ID)?.getView('ApprovalCommand')
    return view instanceof DataView ? view : null
  })
  const commandState = useDataViewState(commandView)
  const inputLocked = computed(() => {commandState.mutating.value; commandState.requestState.value; return handleLoading.value || hasPendingApproval()})
  const inputFields = computed(() => flowRunInputFields({scope: FLOW_WORKBENCH_SCENARIO_ID, locked: inputLocked.value, force: allowForceBack.value && forceBackNodeOptions.value.length > 0}))
  const nodeFields = computed(() => flowRunNodeFields(inputLocked.value))
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

  function selectBusinessForm(value: string | number): void {
    const key = String(value)
    if (key === activeFormId.value) return
    if (handleLoading.value || hasPendingApproval() || approvalWorkspace.value?.active) {
      handleError.value = '请先确认、核验或取消原办理参数后切换业务表单'
      return
    }
    if (!businessTabs.value.some(tab => tab.tabKey === key)) {handleError.value = '未定位到目标业务表单'; return}
    activeFormId.value = key
    handleError.value = ''
  }

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
    if (approvalWorkspace.value?.dirty) {handleError.value = '请先确认或取消原办理参数'; return}
    if (approvalWorkspace.value?.active) approvalWorkspace.value.close()
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
    if (approvalWorkspace.value?.dirty) {handleError.value = '请先确认或取消原办理参数，不能重建运行实例'; return}
    await reload()
    await loadPage()
  }

  async function openHandlePanel(): Promise<void> {
    const own = generation
    handleLoading.value = true
    handleError.value = ''
    try {
      if (hasPendingApproval()) throw Error('请先处理或核验原审批命令')
      if (approvalWorkspace.value?.active) {handleOpen.value = true; return}
      const step = readCurrentStep(), prep = prepared.value
      if (!prep || !step) throw Error('未定位到当前办理步骤')
      const ds = sparkConsume(PAGE_RUNTIME)?.getDataSet(FLOW_WORKBENCH_SCENARIO_ID)
      if (!ds) throw Error('办理参数空间未装配')
      await queryHandleOptions(own)
      assertGeneration(own)
      const formid = activeTab.value?.tabKey ?? ''
      const originalQuery = routeQuery()
      let workspace = approvalWorkspace.value
      if (workspace?.inputs.dataSet !== ds) {
        workspace = new FlowRunApprovalInputWorkspace({dataSet: ds, assertCurrent: () => {
          if (sparkConsume(PAGE_RUNTIME)?.getDataSet(FLOW_WORKBENCH_SCENARIO_ID) !== ds || ds.destroyed) throw Error('原办理参数实例已失效')
        }})
        approvalWorkspace.value = workspace
      }
      await workspace.open({flowObjectId: prep.flowObjectId, modelId: prep.flowModelId, stepId: prep.stepId, busRowId: prep.busRowId, formid}, () => {
        assertGeneration(own)
        const currentQuery = routeQuery()
        if (!runtimeReady() || currentQuery.wfid !== originalQuery.wfid || currentQuery.flowid !== originalQuery.flowid || currentQuery.stepid !== originalQuery.stepid) throw Error('流程办理目标已变化，请取消原参数后重新加载')
        if ((activeTab.value?.tabKey ?? '') !== formid) throw Error('业务表单已变化，请取消原办理参数后重新打开')
      })
      assertGeneration(own)
      handleOpen.value = true
    } catch (error) {
      if (own === generation) handleError.value = error instanceof Error ? error.message : '加载办理选项失败'
    } finally {
      if (own === generation) handleLoading.value = false
    }
  }

  function closeHandlePanel(): void {
    if (handleLoading.value) return
    try {approvalWorkspace.value?.close(); handleOpen.value = false; handleError.value = ''}
    catch (error) {handleError.value = error instanceof Error ? error.message : '取消办理参数失败'}
  }

  async function runParameterAction(action: 'submit' | 'back' | 'forceBack' | 'toCreator'): Promise<void> {
    if (handleLoading.value) return
    const own = generation
    handleLoading.value = true
    handleError.value = ''
    const workspace = approvalWorkspace.value
    const submission = {confirmed: false}
    try {
      if (!workspace) throw Error('请先打开办理参数')
      if (action === 'submit') await workspace.refreshContinuation()
      const captured = workspace.capture(action)
      const ds = workspace.inputs.dataSet
      if (!ds) throw Error('原办理参数空间已失效')
      const activePage = activeTab.value?.tabKey ? businessRegistry.get(activeTab.value.tabKey) : null
      const submitted = await submitFlowBusinessPage({page: activePage, payload: captured.payload,
        assertCurrent: () => {assertGeneration(own); captured.assertCurrent()},
        isUnconfirmed: () => ds.getView('ApprovalCommand')?.hasUnconfirmedSave === true,
        submit: async () => {
          captured.assertCurrent()
          await submitApprovalCommand(ds, captured.input)
          submission.confirmed = true
        },
      })
      assertGeneration(own)
      if (!submitted) return
      workspace.close(); handleOpen.value = false; handleLoading.value = false
      await loadPage()
    } catch (error) {
      if (own === generation) {
        if (submission.confirmed && workspace) {workspace.close(); handleOpen.value = false}
        const message = error instanceof Error ? error.message : '办理失败'
        handleError.value = submission.confirmed && !message.includes('已确认') ? `审批提交已确认；请核对后续页面结果，不重复办理：${message}` : message
      }
    } finally {
      if (own === generation) handleLoading.value = false
    }
  }

  const submitFlow = () => runParameterAction('submit')
  const backByHistory = () => runParameterAction('back')
  const forceBack = () => runParameterAction('forceBack')
  const backToCreator = () => runParameterAction('toCreator')

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
      if (approvalWorkspace.value?.active) throw Error('请先确认或取消原办理参数后再撤回')
      const step = readCurrentStep()
      const prep = prepared.value
      if (!prep || !step) throw new Error('未定位到当前办理步骤')
      await executeApproval(own, 'revoke', {flowObjId: prep.flowObjectId, curStepId: String(step['rowid'] ?? '')})
      if (own !== generation) return
      handleOpen.value = false
      handleLoading.value = false
      await loadPage()
    } catch (error) {
      if (own === generation) handleError.value = error instanceof Error ? error.message : '撤回失败'
    } finally {
      if (own === generation) handleLoading.value = false
    }
  }

  async function openFlowChart(): Promise<void> {
    const own = generation
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

  watch(() => [runtimeReady(), routeQuery().wfid, routeQuery().flowid, routeQuery().stepid] as const, () => {
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
    inputViewKey,
    nodeInputViewKey,
    inputFields,
    nodeFields,
    backNodeOptions,
    forceBackNodeOptions,
    allowForceBack,
    businessTabs,
    activeFormId,
    selectBusinessForm,
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
    closeHandlePanel,
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
