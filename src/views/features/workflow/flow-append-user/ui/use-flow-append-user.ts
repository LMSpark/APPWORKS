/**
 * @module app:views/features/workflow/flow-append-user/ui/use-flow-append-user
 * 职责：列表与撤回复用原DataView和命令owner；添加及选人旧入口继续沿台账迁移。
 */
import {computed, onBeforeUnmount, reactive, ref, shallowRef, toRaw, watch} from 'vue'
import {buildDataViewKey, type DataView} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, useDataViewState, useSparkComponent} from '@spark-appworks/spark-component'
import {isRecord} from '@spark-appworks/spark-utils'
import {lowcodeApi, lowcodeHttp} from '@/lowcode/lowcode-runtime'
import {
  FLOW_MONITOR_SCENARIO_ID,
  createFlowAppendUserClient,
  normalizeFlowAppendUserContext,
  type FlowAppendUserContext,
  type FlowAppendUserExecUserCandidate,
} from '@/lowcode/resources/system/workflow/manage'
import {canRevokeFlowAppendRecord} from '@/lowcode/resources/system/workflow/manage/flow-append-user/flow-append-user-records'
import {captureFlowAppendStep, queryFlowAppendParticipants} from '@/lowcode/resources/system/workflow/manage/flow-append-user/flow-append-user-list'
import {submitApprovalCommand, verifyApprovalCommand} from '@/lowcode/resources/system/workflow/manage/flow-run-page/command/submit'
import {
  createFlowAppendReceiveUserList,
  validateFlowAppendSelection,
  type FlowAppendPersonValue,
} from '../model/flow-append-user-model'

const STEP_MODEL = 'WFOBJ_FLOW_RELATIONLINE_STEP'

export type UseFlowAppendUserOptions = Readonly<{
  context: () => FlowAppendUserContext | Partial<FlowAppendUserContext>
  embedded?: () => boolean
  userDirectoryViewKey?: () => string | undefined
  stepViewKey: () => string
}>

type AddDialogState = {
  visible: boolean
  loading: boolean
  submitting: boolean
  selectedIds: string[]
  maxNum: number
  minNum: number
  allowChange: string
  candidates: FlowAppendUserExecUserCandidate[]
}

function personFromCandidate(candidate: FlowAppendUserExecUserCandidate): FlowAppendPersonValue {
  return {UserId: candidate.UserId, UserName: candidate.UserName}
}

export function useFlowAppendUser(options: UseFlowAppendUserOptions) {
  const {sparkConsume} = useSparkComponent({type: 'flow-append-user'})
  const pageLoading = ref(false)
  const pageError = ref('')
  const listView = shallowRef<DataView>()
  const listViewKey = computed(() => listView.value?.dataSet?.scenarioId
    ? buildDataViewKey(STEP_MODEL, 'appendParticipants', listView.value.dataSet.scenarioId) : '')
  const revoking = ref(false)
  const commandView = computed(() => {listView.value; return stepView()?.dataSet?.getView('ApprovalCommand') ?? null})
  const commandState = useDataViewState(commandView)
  const commandLocked = computed(() => commandState.resultReplacementBlocked.value || commandState.mutating.value)
  const revokeUnconfirmed = computed(() => {
    commandState.mutating.value; commandState.mutatingError.value; commandState.resultReplacementBlocked.value
    return commandView.value?.hasUnconfirmedSave === true
  })
  const userOptions = ref<readonly FlowAppendPersonValue[]>([])
  let generation = 0

  const addDialog = reactive<AddDialogState>({
    visible: false,
    loading: false,
    submitting: false,
    selectedIds: [],
    maxNum: 0,
    minNum: 0,
    allowChange: '1',
    candidates: [],
  })

  const contextTitle = computed(() => normalizeFlowAppendUserContext(options.context()).TITLE || '-')
  const embedded = computed(() => options.embedded?.() === true)

  function clientFor(gen: number) {
    return createFlowAppendUserClient({
      http: lowcodeHttp,
      scenarioId: FLOW_MONITOR_SCENARIO_ID,
      readScope: () => lowcodeApi.readRequestScope(),
      assertCurrent: () => {
        if (gen !== generation) throw new Error('追加办理操作已过期')
      },
    })
  }

  const selectOptions = computed(() => {
    if (addDialog.allowChange === '1' && userOptions.value.length > 0) return userOptions.value
    return addDialog.candidates.map(personFromCandidate)
  })

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

  async function ensureUserDirectory(): Promise<void> {
    if (userOptions.value.length > 0) return
    const key = options.userDirectoryViewKey?.()
    const runtime = sparkConsume(PAGE_RUNTIME)
    if (!key || !runtime) return
    const view = runtime.resolveView(key)
    if (!view || view.destroyed) return
    if (view.rows.length === 0) await view.refresh()
    userOptions.value = view.rows
      .filter(isRecord)
      .map(row => ({UserId: String(row['rowid'] ?? '').trim(), UserName: String(row['UserName'] ?? '').trim()}))
      .filter(item => item.UserId)
  }

  async function loadPageData(): Promise<void> {
    if (commandLocked.value) {pageError.value = '请先处理或核验原撤回命令'; return}
    const own = ++generation
    pageLoading.value = true
    pageError.value = ''
    listView.value = undefined
    try {
      const context = normalizeFlowAppendUserContext(options.context())
      const view = stepView()
      if (!view) throw Error('追加参与人原步骤视图未装配')
      const result = await queryFlowAppendParticipants(view, context, () => {
        if (own !== generation || stepView() !== view) throw Error('追加参与人原步骤目标已变化')
      })
      if (own === generation) listView.value = result
    } catch (error) {
      if (own !== generation) return
      pageError.value = error instanceof Error ? error.message : '加载追加办理页失败'
    } finally {
      if (own === generation) pageLoading.value = false
    }
  }

  function resetAddDialog(): void {
    addDialog.visible = false
    addDialog.loading = false
    addDialog.submitting = false
    addDialog.selectedIds = []
    addDialog.maxNum = 0
    addDialog.minNum = 0
    addDialog.allowChange = '1'
    addDialog.candidates = []
  }

  async function openAddDialog(): Promise<void> {
    if (commandLocked.value) {pageError.value = '请先处理或核验原撤回命令'; return}
    addDialog.loading = true
    addDialog.visible = true
    try {
      assertListCurrent()
      const configs = await clientFor(generation).getExecutionUsers(options.context(), true)
      assertListCurrent()
      const config = configs[0]
      if (!config) {
        pageError.value = '未获取到可追加办理人配置'
        addDialog.visible = false
        return
      }
      addDialog.allowChange = config.allowChange
      addDialog.maxNum = config.maxNum
      addDialog.minNum = config.minNum
      addDialog.candidates = [...config.userList]
      if (config.allowChange === '1') await ensureUserDirectory()
      const view = listView.value
      const existing = new Set(view?.rows.filter(row => view.fieldAccess(row, 'ReceiveUserId').read === 'visible').map(row => row['ReceiveUserId']).filter(Boolean) ?? [])
      const defaults = selectOptions.value.filter(item => !existing.has(item.UserId)).map(item => item.UserId)
      addDialog.selectedIds = defaults.length <= config.maxNum ? defaults : []
    } catch (error) {
      pageError.value = error instanceof Error ? error.message : '加载可追加办理人失败'
      addDialog.visible = false
    } finally {
      addDialog.loading = false
    }
  }

  async function submitAddDialog(): Promise<void> {
    if (commandLocked.value) {pageError.value = '请先处理或核验原撤回命令'; return}
    try {assertListCurrent()} catch (error) {pageError.value = error instanceof Error ? error.message : '追加参与人列表已失效'; return}
    const validationMessage = validateFlowAppendSelection(addDialog.selectedIds.length, addDialog.minNum, addDialog.maxNum)
    if (validationMessage) {
      pageError.value = validationMessage
      return
    }
    const selected = selectOptions.value.filter(item => addDialog.selectedIds.includes(item.UserId))
    addDialog.submitting = true
    pageError.value = ''
    try {
      await clientFor(generation).addReceiveUsers(options.context(), createFlowAppendReceiveUserList(selected))
      resetAddDialog()
      await loadPageData()
    } catch (error) {
      pageError.value = error instanceof Error ? error.message : '添加办理人失败'
    } finally {
      addDialog.submitting = false
    }
  }

  async function revokeRecord(value: unknown): Promise<void> {
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
    try {await verifyApprovalCommand(dataSet); await loadPageData()}
    catch (error) {pageError.value = error instanceof Error ? error.message : '原撤回结果仍待核验'}
  }

  watch(() => {const value = normalizeFlowAppendUserContext(options.context()); return [options.stepViewKey(), value.rowid, value.WFOBJID, value.SendNodeModelId, value.ReceiveNodeModelId, value.LastStepID]}, () => {
    if (!addDialog.submitting) resetAddDialog()
    void loadPageData()
  }, {immediate: true})
  onBeforeUnmount(() => {generation++; listView.value = undefined})

  return {
    embedded,
    contextTitle,
    pageLoading,
    pageError,
    listViewKey,
    revoking,
    commandLocked,
    revokeUnconfirmed,
    verifyOriginalRevoke,
    addDialog,
    selectOptions,
    openAddDialog,
    submitAddDialog,
    resetAddDialog,
    revokeRecord,
    loadPageData,
  }
}
