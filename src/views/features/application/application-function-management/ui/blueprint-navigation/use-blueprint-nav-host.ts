/**
 * @module app:views/features/application/application-function-management/ui/blueprint-navigation/use-blueprint-nav-host
 * 职责：导航配置页签的导航宿主关系列表、新增/编辑对话框、删除确认与“数据空间设计”入口。
 * 边界：直接使用蓝图 DataSet 中 7AB 场景的 byNode 视图；必填、候选成员、资源类型回填与字段级联由场景 pagedata 声明，
 *   跨字段约束由场景装配注册的模型规则执行；保存与删除只经 DataSet.saveChanges 提交本行，结果未知时再次提交只核验原捕获。
 * AI用途：页面与宿主对话框只消费本组合函数返回的状态与动作。
 */
import {computed, ref, shallowRef, watch, type Ref} from 'vue'
import {buildDataViewKey, type DataRow, type DataView} from '@spark-appworks/spark-data'
import type {BlueprintTreeContext} from '../use-application-function-page'
import {readBlueprintCurrentText} from '../application-function-page-contract'

const HOST_TABLE = 'Base_Navigation_DataRelation'
const HOST_VIEW = 'byNode'
type Id = string | number

/** 页面向导航宿主提供的上下文。 */
export type BlueprintNavHostInput = Readonly<{
  context: () => BlueprintTreeContext | undefined
  selectedNodeId: Readonly<Ref<string>>
  isLive: (context: BlueprintTreeContext, nodeId: string) => boolean
  /** 导航配置页签处于激活状态。 */
  active: () => boolean
  notice: Ref<string>
}>

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** 导航宿主状态与动作。 */
export function useBlueprintNavHost(input: BlueprintNavHostInput) {
  const view = shallowRef<DataView>()
  const loading = ref(false)
  const busy = ref(false)
  const error = ref('')
  const dialogError = ref('')
  const editingId = ref<Id>()
  const deleteId = ref<Id>()
  const designId = ref('')
  const revision = ref(0)
  let generation = 0

  const scenarioId = computed(() => view.value?.dataSet?.scenarioId ?? '')
  const viewKey = (tableName: string, viewId: string): string => scenarioId.value ? buildDataViewKey(tableName, viewId, scenarioId.value) : ''
  const listKey = computed(() => viewKey(HOST_TABLE, HOST_VIEW))
  const dataSetOptionKey = computed(() => viewKey('Base_DataSet', 'navHostDataSets'))
  const unknown = computed(() => {void revision.value; return view.value?.hasUnconfirmedSave === true})
  const created = computed(() => {
    void revision.value
    const id = editingId.value
    return id !== undefined && view.value?.dirtyTracking.isPendingCreate(id) === true
  })
  const canCreate = computed(() => {void revision.value; return view.value?.addActionState() === 'enabled'})

  function release(): void {
    const current = view.value
    view.value = undefined
    editingId.value = undefined
    deleteId.value = undefined
    if (!current || current.hasUnconfirmedSave) return
    const ids = current.rows.map(row => current.getPkKey(row)).filter((id): id is Id => id !== undefined)
    if (ids.length) current.discardPendingChanges(ids)
  }

  async function reload(): Promise<void> {
    const current = ++generation
    release()
    error.value = ''
    dialogError.value = ''
    designId.value = ''
    const context = input.context(), nodeId = input.selectedNodeId.value
    if (!input.active() || !context || !nodeId) return
    loading.value = true
    try {
      const dataSet = context.owner.dataSet
      const target = dataSet.getView(HOST_TABLE, HOST_VIEW), dataSets = dataSet.getView('Base_DataSet', 'navHostDataSets')
      if (!target || !dataSets) throw new Error('蓝图运行时缺少导航宿主视图')
      target.queryContext = {nodeId}
      dataSets.queryContext = {applicationId: context.projectId}
      await Promise.all([target.refresh(), dataSets.refresh()])
      if (current !== generation || !input.isLive(context, nodeId)) return
      const failure = target.loadingError ?? dataSets.loadingError
      if (failure) throw failure
      view.value = target
    } catch (cause) {
      if (current === generation) error.value = `导航宿主不可用：${describe(cause)}`
    } finally {
      if (current === generation) loading.value = false
      revision.value++
    }
  }

  watch(() => [input.active(), input.context()?.key, input.selectedNodeId.value], () => { void reload() }, {immediate: true})

  async function run(action: (target: DataView) => void | Promise<void>, onError: Ref<string>): Promise<void> {
    const target = view.value
    if (!target || busy.value) return
    busy.value = true
    onError.value = ''
    try {
      await action(target)
    } catch (cause) {
      if (view.value === target) onError.value = describe(cause)
    } finally {
      busy.value = false
      revision.value++
    }
  }

  /** 提交本行并回读；结果未知时保留原捕获，由下一次提交核验。 */
  async function commit(target: DataView, id: Id): Promise<void> {
    const dataSet = target.dataSet
    if (!dataSet) throw new Error('导航宿主视图缺少 DataSet')
    const result = await dataSet.saveChanges({views: [{tableName: HOST_TABLE, viewId: HOST_VIEW, ids: [id]}]})
    if (!result.success) throw result.error ?? new Error(result.message ?? '导航宿主提交失败')
    if (target.hasUnconfirmedSave) throw new Error('导航宿主提交结果未知，请核验')
    await target.refresh()
    if (target.loadingError) throw target.loadingError
  }

  async function openCreate(): Promise<void> {
    await run(async target => {
      const context = input.context()
      const hostName = context ? readBlueprintCurrentText(context.owner, 'FunName') || readBlueprintCurrentText(context.owner, 'name') : ''
      const values: Record<string, unknown> = {prowid: input.selectedNodeId.value}
      if (hostName && target.columns.some(column => column.name === 'pName') && target.newRowFieldAccess('pName').write === 'allowed') values['pName'] = hostName
      const id = target.getPkKey(await target.addRow(values))
      if (id === undefined || !target.setCurrentRowById(id)) throw new Error('导航宿主新增行未进入当前视图')
      editingId.value = id
    }, error)
  }

  async function openEdit(row: Readonly<DataRow>): Promise<void> {
    const id = view.value?.getPkKey(row)
    if (id === undefined) return
    await run(target => {
      if (target.editActionState(row) !== 'enabled') throw new Error('当前查询不允许编辑该导航宿主')
      if (!target.setCurrentRowById(id)) throw new Error('导航宿主行未进入当前视图')
      editingId.value = id
    }, error)
  }

  async function save(): Promise<void> {
    const id = editingId.value
    if (id === undefined) return
    await run(async target => {
      const wasCreate = target.dirtyTracking.isPendingCreate(id)
      await commit(target, id)
      if (view.value !== target) return
      editingId.value = undefined
      input.notice.value = wasCreate ? '新增导航宿主成功' : '修改导航宿主成功'
    }, dialogError)
  }

  function cancelEdit(value = false): void {
    const target = view.value, id = editingId.value
    if (value || busy.value || !target || id === undefined || target.hasUnconfirmedSave) return
    try {
      if (target.hasEditingChanges(id) || target.dirtyTracking.hasPendingChanges(id)) target.discardPendingChanges([id])
      editingId.value = undefined
      dialogError.value = ''
    } catch (cause) {
      dialogError.value = describe(cause)
    } finally {
      revision.value++
    }
  }

  function askRemove(row: Readonly<DataRow>): void {
    const id = view.value?.getPkKey(row)
    if (id === undefined || busy.value) return
    dialogError.value = ''
    deleteId.value = id
  }

  /** 仅在确认框显式点击“确定”时删除。 */
  async function confirmRemove(): Promise<void> {
    const id = deleteId.value
    if (id === undefined) return
    await run(async target => {
      if (!target.hasUnconfirmedSave && !target.dirtyTracking.pendingDeleteIds.has(id)) {
        const row = target.rows.find(item => target.getPkKey(item) === id)
        if (!row || target.deleteActionState(row) !== 'enabled') throw new Error('当前查询不允许删除该导航宿主')
        await target.removeRow(id)
      }
      await commit(target, id)
      if (view.value !== target) return
      deleteId.value = undefined
      input.notice.value = '删除导航宿主成功'
    }, dialogError)
  }

  function cancelRemove(value = false): void {
    const target = view.value, id = deleteId.value
    if (value || busy.value || target?.hasUnconfirmedSave) return
    if (target && id !== undefined && target.dirtyTracking.pendingDeleteIds.has(id)) target.discardPendingChanges([id])
    deleteId.value = undefined
    dialogError.value = ''
    revision.value++
  }

  function openDesign(row: Readonly<DataRow>): void {
    const id = String(row['dataSetId'] ?? '').trim()
    if (id) designId.value = id
    else error.value = '该导航宿主未关联数据空间，不能设计'
  }

  function dispose(): void {
    generation++
    release()
  }

  return {
    view,
    listKey,
    dataSetOptionKey,
    loading,
    busy,
    error,
    dialogError,
    editingId,
    deleteId,
    designId,
    created,
    unknown,
    canCreate,
    revision,
    openCreate,
    openEdit,
    save,
    cancelEdit,
    askRemove,
    confirmRemove,
    cancelRemove,
    openDesign,
    dispose,
  }
}
