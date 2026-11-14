/**
 * @module app:views/features/workflow/flow-append-user/ui/use-flow-append-user
 * 职责：追加办理列表、加人对话框与撤回；列表来自步骤 DataView，写操作经 lowcode 客户端。
 */
import {computed, reactive, ref, watch} from 'vue'
import {buildDataViewKey, type DataView} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'
import {isRecord} from '@spark-appworks/spark-utils'
import {lowcodeApi, lowcodeHttp} from '@/lowcode/lowcode-runtime'
import {
  FLOW_MONITOR_SCENARIO_ID,
  createFlowAppendUserClient,
  filterFlowAppendUserList,
  normalizeFlowAppendUserContext,
  type FlowAppendUserContext,
  type FlowAppendUserExecUserCandidate,
  type FlowAppendUserListRecord,
} from '@/lowcode/resources/system/workflow/manage'
import {
  canRevokeFlowAppendRecord,
  createFlowAppendReceiveUserList,
  validateFlowAppendSelection,
  type FlowAppendPersonValue,
} from '../model/flow-append-user-model'

const STEP_MODEL = 'WFOBJ_FLOW_RELATIONLINE_STEP'

export type UseFlowAppendUserOptions = Readonly<{
  context: () => FlowAppendUserContext | Partial<FlowAppendUserContext>
  embedded?: () => boolean
  userDirectoryViewKey?: () => string | undefined
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
  const appendList = ref<readonly FlowAppendUserListRecord[]>([])
  const revokeRowId = ref('')
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
    const key = buildDataViewKey(STEP_MODEL, 'default', FLOW_MONITOR_SCENARIO_ID)
    return runtime.resolveView(key)
  }

  function reloadListFromView(): void {
    const view = stepView()
    const rows = view && !view.destroyed ? view.rows.filter(isRecord) : []
    appendList.value = filterFlowAppendUserList(rows, options.context())
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
    const own = ++generation
    pageLoading.value = true
    pageError.value = ''
    try {
      const context = normalizeFlowAppendUserContext(options.context())
      const view = stepView()
      if (view && !view.destroyed && context.WFOBJID) {
        view.queryContext = {...view.queryContext, WFOBJID: context.WFOBJID}
        if (context.WFOBJID) await view.refresh()
      }
      if (own !== generation) return
      reloadListFromView()
    } catch (error) {
      if (own !== generation) return
      pageError.value = error instanceof Error ? error.message : '加载追加办理页失败'
      appendList.value = []
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
    addDialog.loading = true
    addDialog.visible = true
    try {
      const configs = await clientFor(generation).getExecutionUsers(options.context(), true)
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
      const existing = new Set(appendList.value.map(item => item.ReceiveUserId).filter(Boolean))
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

  async function revokeRecord(record: FlowAppendUserListRecord): Promise<void> {
    if (!canRevokeFlowAppendRecord(record)) return
    revokeRowId.value = record.rowid
    pageError.value = ''
    try {
      await clientFor(generation).revokeAppendStep(record.rowid, record.WFOBJID)
      await loadPageData()
    } catch (error) {
      pageError.value = error instanceof Error ? error.message : '撤回失败'
    } finally {
      revokeRowId.value = ''
    }
  }

  watch(() => normalizeFlowAppendUserContext(options.context()).rowid, () => {
    void loadPageData()
  }, {immediate: true})

  return {
    embedded,
    contextTitle,
    pageLoading,
    pageError,
    appendList,
    revokeRowId,
    addDialog,
    selectOptions,
    canRevoke: canRevokeFlowAppendRecord,
    openAddDialog,
    submitAddDialog,
    resetAddDialog,
    revokeRecord,
    reloadListFromView,
    loadPageData,
  }
}