/**
 * @module app:views/features/workflow/flow-append-user/ui/use-flow-append-user
 * 职责：列表、参数及追加/撤回均复用原DataView与命令owner。
 */
import {computed, onBeforeUnmount, reactive, ref, shallowRef, toRaw, watch} from 'vue'
import {buildDataViewKey, type DataView} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, useDataViewState, useSparkComponent} from '@spark-appworks/spark-component'
import {normalizeFlowAppendUserContext, type FlowAppendUserContext} from '@/lowcode/resources/system/workflow/manage'
import {FlowAppendInputWorkspace} from '@/lowcode/resources/system/workflow/manage/flow-append-user/input-workspace'
import {canRevokeFlowAppendRecord} from '@/lowcode/resources/system/workflow/manage/flow-append-user/flow-append-user-records'
import {captureFlowAppendStep, queryFlowAppendParticipants} from '@/lowcode/resources/system/workflow/manage/flow-append-user/flow-append-user-list'
import {submitApprovalCommand, verifyApprovalCommand} from '@/lowcode/resources/system/workflow/manage/flow-run-page/command/submit'
const STEP_MODEL = 'WFOBJ_FLOW_RELATIONLINE_STEP'

export type UseFlowAppendUserOptions = Readonly<{
  context: () => FlowAppendUserContext | Partial<FlowAppendUserContext>
  embedded?: () => boolean
  userDirectoryViewKey?: () => string | undefined
  stepViewKey: () => string
}>

export function useFlowAppendUser(options: UseFlowAppendUserOptions) {
  const {sparkConsume} = useSparkComponent({type: 'flow-append-user'})
  const pageLoading = ref(false)
  const pageError = ref('')
  const listView = shallowRef<DataView>()
  const listViewKey = computed(() => listView.value?.dataSet?.scenarioId
    ? buildDataViewKey(STEP_MODEL, 'appendParticipants', listView.value.dataSet.scenarioId) : '')
  const stepStateViewKey = computed(() => listView.value?.dataSet?.scenarioId ? buildDataViewKey('AppendStepStates', 'default', listView.value.dataSet.scenarioId) : '')
  const handleStateViewKey = computed(() => listView.value?.dataSet?.scenarioId ? buildDataViewKey('AppendHandleStates', 'default', listView.value.dataSet.scenarioId) : '')
  const revoking = ref(false)
  const commandView = computed(() => {listView.value; return stepView()?.dataSet?.getView('ApprovalCommand') ?? null})
  const commandState = useDataViewState(commandView)
  const commandLocked = computed(() => commandState.resultReplacementBlocked.value || commandState.mutating.value)
  const revokeUnconfirmed = computed(() => {
    commandState.mutating.value; commandState.mutatingError.value; commandState.resultReplacementBlocked.value
    return commandView.value?.hasUnconfirmedSave === true
  })
  const workspace = shallowRef<FlowAppendInputWorkspace>()
  let generation = 0
  let active = true
  const addDialog = reactive({visible: false, loading: false, submitting: false})
  const parameterView = computed(() => workspace.value?.parameters ?? null)
  const parameterState = useDataViewState(parameterView)
  const addCloseDisabled = computed(() => addDialog.loading || addDialog.submitting || commandLocked.value || parameterState.resultReplacementBlocked.value)
  const parameterViewKey = computed(() => workspace.value?.parameters.dataSet?.scenarioId
    ? buildDataViewKey('AppendInput', 'default', workspace.value.parameters.dataSet.scenarioId) : '')
  const optionsViewKey = computed(() => workspace.value?.parameters.dataSet?.scenarioId
    ? buildDataViewKey('AppendOptions', 'default', workspace.value.parameters.dataSet.scenarioId) : '')
  const candidateViewKey = computed(() => {addDialog.loading; addDialog.visible; return workspace.value?.candidateKey ?? ''})
  const contextTitle = computed(() => {addDialog.visible; addDialog.loading; return workspace.value?.active ? workspace.value.title : normalizeFlowAppendUserContext(options.context()).TITLE || '-'})
  const embedded = computed(() => options.embedded?.() === true)

  function stepView(): DataView | undefined {
    const runtime = sparkConsume(PAGE_RUNTIME)
    if (!runtime) return undefined
    const key = options.stepViewKey()
    if (!key) throw Error('追加参与人缺少宿主原步骤完整键')
    return runtime.resolveView(key)
  }
  function assertListCurrent(): DataView {
    const view = listView.value, context = normalizeFlowAppendUserContext(options.context())
    if (!view || pageLoading.value || view.loadingError || (['WFOBJID', 'SendNodeModelId', 'ReceiveNodeModelId', 'LastStepID'] as const).some(field => view.queryContext[field] !== context[field])) throw Error('请先重新查询当前追加参与人列表')
    view.captureReadResult()()
    return view
  }

  async function loadPageData(): Promise<void> {
    if (commandLocked.value || workspace.value?.active || addDialog.loading) {pageError.value = '请先处理或核验原追加/撤回操作'; return}
    const own = ++generation
    pageLoading.value = true
    pageError.value = ''
    listView.value = undefined
    try {
      const context = normalizeFlowAppendUserContext(options.context())
      const view = stepView()
      if (!view) throw Error('追加参与人原步骤视图未装配')
      const stateViews = ['AppendStepStates', 'AppendHandleStates'].map(name => {
        const state = view.dataSet?.getView(name)
        if (!state) throw Error(`追加参与人缺少正式字典视图:${name}`)
        return state
      })
      const [result] = await Promise.all([queryFlowAppendParticipants(view, context, () => {
        if (own !== generation || stepView() !== view) throw Error('追加参与人原步骤目标已变化')
      }), ...stateViews.map(async state => {await state.refresh(); if (state.loadingError) throw state.loadingError; state.captureReadResult()()})])
      if (!active || own !== generation || stepView() !== view) throw Error('原追加列表已失效')
      if (own === generation) listView.value = result
    } catch (error) {
      if (own !== generation) return
      pageError.value = error instanceof Error ? error.message : '加载追加办理页失败'
    } finally {
      if (own === generation) pageLoading.value = false
    }
  }

  function resetAddDialog(): void {
    if (addDialog.loading || addDialog.submitting || commandLocked.value) return
    try {
      const hadInput = workspace.value?.active === true
      workspace.value?.close(); addDialog.visible = false
      if (hadInput) {try {assertListCurrent()} catch {void loadPageData()}}
    }
    catch (error) {pageError.value = error instanceof Error ? error.message : '原追加参数尚未释放'}
  }

  async function openAddDialog(): Promise<void> {
    if (commandLocked.value || addDialog.loading || workspace.value?.active) return
    pageError.value = ''
    try {
      assertListCurrent()
      const source = stepView(), ds = source?.dataSet, own = generation
      if (!ds) throw Error('追加参数缺少原数据空间')
      workspace.value ??= new FlowAppendInputWorkspace({dataSet: ds, stepView, listView: () => listView.value,
        context: options.context, assertCurrent: () => {if (!active || stepView()?.dataSet !== ds) throw Error('原追加数据空间已释放')},
        userDirectory: () => {
          const key = options.userDirectoryViewKey?.(), runtime = sparkConsume(PAGE_RUNTIME)
          const view = key && runtime ? runtime.resolveView(key) : undefined
          if (!view) throw Error('缺少宿主正式人员目录完整键')
          return view
        }})
      addDialog.loading = true; addDialog.visible = true
      await workspace.value.open(() => {if (!active || own !== generation) throw Error('原追加输入已过期')})
    } catch (error) {
      pageError.value = error instanceof Error ? error.message : '加载可追加办理人失败'
      addDialog.visible = false
    } finally {addDialog.loading = false}
  }

  async function submitAddDialog(): Promise<void> {
    if (commandLocked.value || addDialog.loading || addDialog.submitting) return
    addDialog.submitting = true; pageError.value = ''
    try {
      assertListCurrent()
      const owner = workspace.value, ds = owner?.parameters.dataSet
      if (!owner || !ds) throw Error('原追加参数未装配')
      const captured = owner.capture()
      await submitApprovalCommand(ds, captured.input, captured.assertCurrent)
      owner.close(); addDialog.visible = false
      await loadPageData()
    } catch (error) {pageError.value = error instanceof Error ? error.message : '添加办理人失败'}
    finally {addDialog.submitting = false}
  }

  async function revokeRecord(value: unknown): Promise<void> {
    if (workspace.value?.active || addDialog.loading || commandLocked.value) return
    const view = listView.value, original = view?.rows.find(row => row === toRaw(value))
    if (!view || !original) return
    revoking.value = true
    pageError.value = ''
    try {
      assertListCurrent()
      const dataSet = view.dataSet, source = stepView(), own = generation, context = normalizeFlowAppendUserContext(options.context())
      if (!dataSet || source?.dataSet !== dataSet) throw Error('撤回追加行缺少原数据空间')
      const assertParent = captureFlowAppendStep(source, context), assertList = view.captureReadResult()
      const assertRow = view.captureReadRow(original, ['rowid', 'WFOBJID', 'STATUS', 'StepState', 'SendNodeModelId', 'ReceiveNodeModelId', 'LastStepID'])
      if (!canRevokeFlowAppendRecord({STATUS: original['STATUS'], StepState: original['StepState']})) return
      const assertInput = () => {
        if (generation !== own || listView.value !== view || stepView() !== source || view.dataSet !== dataSet
          || normalizeFlowAppendUserContext(options.context()).rowid !== context.rowid) throw Error('原撤回追加目标已变化')
        assertListCurrent(); assertParent(); assertList(); assertRow()
      }
      await submitApprovalCommand(dataSet, {action: 'revoke', flowObjectId: original['WFOBJID'], stepId: original['rowid'], targetStepViewKey: listViewKey.value}, assertInput)
      await loadPageData()
    } catch (error) {
      pageError.value = error instanceof Error ? error.message : '撤回失败'
    } finally {
      revoking.value = false
    }
  }

  async function verifyOriginalRevoke(): Promise<void> {
    const dataSet = commandView.value?.dataSet
    if (!dataSet || commandState.mutating.value) return
    pageError.value = ''
    try {await verifyApprovalCommand(dataSet); if (workspace.value?.active) {workspace.value.close(); addDialog.visible = false}; await loadPageData()}
    catch (error) {pageError.value = error instanceof Error ? error.message : '原撤回结果仍待核验'}
  }

  watch(() => {const value = normalizeFlowAppendUserContext(options.context()); return [options.stepViewKey(), value.rowid, value.WFOBJID, value.SendNodeModelId, value.ReceiveNodeModelId, value.LastStepID]}, () => {
    if (!workspace.value?.active && !addDialog.loading && !addDialog.submitting) void loadPageData()
  }, {immediate: true})
  onBeforeUnmount(() => {active = false; generation++; if (!commandLocked.value && !addDialog.loading) workspace.value?.close(); listView.value = undefined})

  return {
    embedded,
    contextTitle,
    pageLoading,
    pageError,
    listViewKey,
    stepStateViewKey,
    handleStateViewKey,
    revoking,
    commandLocked,
    revokeUnconfirmed,
    verifyOriginalRevoke,
    addDialog,
    parameterViewKey,
    optionsViewKey,
    candidateViewKey,
    addCloseDisabled,
    openAddDialog,
    submitAddDialog,
    resetAddDialog,
    revokeRecord,
    loadPageData,
  }
}
