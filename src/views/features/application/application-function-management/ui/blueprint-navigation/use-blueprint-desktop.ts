/**
 * @module app:views/features/application/application-function-management/ui/blueprint-navigation/use-blueprint-desktop
 * 职责：导航配置页签的“+桌面 / 取消桌面显示”：读取当前节点的桌面记录（主键即节点 id），新增对话框与取消确认。
 * 边界：直接使用蓝图 DataSet 中 7AB 场景声明的 Base_Desktop_System@byNode；默认值只写入新行可写的字段；
 *   保存与删除只经 DataSet.saveChanges 提交本行并回读，结果未知时对话框不能关闭或放弃，再次提交只核验原捕获。
 * AI用途：页面与对话框只消费本组合函数返回的状态与动作。
 */
import {computed, ref, shallowRef, watch, type Ref} from 'vue'
import {buildDataViewKey, type DataView} from '@spark-appworks/spark-data'
import type {BlueprintTreeContext} from '../use-application-function-page'
import {readBlueprintCurrentText} from '../application-function-page-contract'

const DESKTOP_TABLE = 'Base_Desktop_System'
const DESKTOP_VIEW = 'byNode'

/** 页面向桌面显示提供的上下文。 */
export type BlueprintDesktopInput = Readonly<{
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

/** 桌面显示状态与动作。 */
export function useBlueprintDesktop(input: BlueprintDesktopInput) {
  const view = shallowRef<DataView>()
  const nodeId = ref('')
  const loading = ref(false)
  const busy = ref(false)
  const unavailable = ref('')
  const dialogOpen = ref(false)
  const confirmOpen = ref(false)
  const dialogError = ref('')
  const revision = ref(0)
  let generation = 0

  const viewKey = computed(() => {
    const scenarioId = view.value?.dataSet?.scenarioId
    return scenarioId ? buildDataViewKey(DESKTOP_TABLE, DESKTOP_VIEW, scenarioId) : ''
  })
  const exists = computed(() => {
    void revision.value
    const target = view.value
    return !!target && target.rows.some(row => row['rowid'] === nodeId.value && !target.dirtyTracking.isPendingCreate(nodeId.value))
  })
  const unknown = computed(() => {void revision.value; return view.value?.hasUnconfirmedSave === true})

  function release(): void {
    const current = view.value, id = nodeId.value
    view.value = undefined
    if (!current || current.hasUnconfirmedSave || !id) return
    if (current.hasEditingChanges(id) || current.dirtyTracking.hasPendingChanges(id)) current.discardPendingChanges([id])
  }

  async function reload(): Promise<void> {
    const current = ++generation
    release()
    dialogOpen.value = false
    confirmOpen.value = false
    dialogError.value = ''
    unavailable.value = ''
    const context = input.context(), id = input.selectedNodeId.value
    nodeId.value = id
    if (!input.active() || !context || !id) return
    loading.value = true
    try {
      const target = context.owner.dataSet.getView(DESKTOP_TABLE, DESKTOP_VIEW)
      if (!target) throw new Error('蓝图运行时缺少桌面视图')
      target.queryContext = {nodeId: id}
      await target.refresh()
      if (current !== generation || !input.isLive(context, id)) return
      if (target.loadingError) throw target.loadingError
      view.value = target
    } catch (cause) {
      if (current === generation) unavailable.value = `桌面显示不可用：${describe(cause)}`
    } finally {
      if (current === generation) loading.value = false
      revision.value++
    }
  }

  watch(() => [input.active(), input.context()?.key, input.selectedNodeId.value], () => { void reload() }, {immediate: true})

  /** 提交本行并回读；结果未知时保留原捕获，由下一次提交核验。 */
  async function commit(target: DataView): Promise<void> {
    const dataSet = target.dataSet
    if (!dataSet) throw new Error('桌面视图缺少 DataSet')
    const result = await dataSet.saveChanges({views: [{tableName: DESKTOP_TABLE, viewId: DESKTOP_VIEW, ids: [nodeId.value]}]})
    if (!result.success) throw result.error ?? new Error(result.message ?? '桌面显示提交失败')
    if (target.hasUnconfirmedSave) throw new Error('桌面显示提交结果未知，请核验')
    await target.refresh()
    if (target.loadingError) throw target.loadingError
  }

  /** “+桌面”打开新增对话框；“取消桌面显示”打开确认框。 */
  async function toggle(): Promise<void> {
    const target = view.value, context = input.context()
    if (!target || !context || busy.value) return
    dialogError.value = ''
    if (exists.value) { confirmOpen.value = true; return }
    try {
      if (target.addActionState() !== 'enabled') throw new Error('当前查询不允许新增桌面记录')
      const read = (field: string) => readBlueprintCurrentText(context.owner, field)
      const order = Number(read('FunOrderValue'))
      const defaults: Record<string, unknown> = {
        AppName: read('FunName') || read('name'),
        ShortCNName: read('FunName') || read('name'),
        AppOrdidx: Number.isInteger(order) && order >= 1 ? order : 1,
        AppUrl: read('NavigationUrl'),
        MobileUrl: read('MobileUrl'),
        AppSmallIconUrl: read('NavigationImageWxz'),
        IsDesktopShow: 1,
        IsReqLogin: 0,
      }
      const values = Object.fromEntries(Object.entries(defaults).filter(([field, value]) => value !== ''
        && target.columns.some(column => column.name === field) && target.newRowFieldAccess(field).write === 'allowed'))
      await target.addRowWithIdentity({field: 'rowid', value: nodeId.value}, values)
      if (!target.setCurrentRowById(nodeId.value)) throw new Error('桌面新增行未进入当前视图')
      dialogOpen.value = true
    } catch (cause) {
      unavailable.value = describe(cause)
    } finally {
      revision.value++
    }
  }

  async function run(action: (target: DataView) => Promise<void>): Promise<void> {
    const target = view.value
    if (!target || busy.value) return
    busy.value = true
    dialogError.value = ''
    try {
      await action(target)
    } catch (cause) {
      if (view.value === target) dialogError.value = describe(cause)
    } finally {
      busy.value = false
      revision.value++
    }
  }

  async function saveCreate(): Promise<void> {
    await run(async target => {
      await commit(target)
      if (view.value !== target) return
      dialogOpen.value = false
      input.notice.value = '桌面显示保存成功'
    })
  }

  function cancelCreate(value = false): void {
    const target = view.value, id = nodeId.value
    if (value || !target || busy.value || target.hasUnconfirmedSave) return
    if (target.dirtyTracking.isPendingCreate(id) || target.hasEditingChanges(id)) target.discardPendingChanges([id])
    dialogOpen.value = false
    dialogError.value = ''
    revision.value++
  }

  /** 仅在确认框显式点击“确定”时执行取消桌面显示。 */
  async function confirmRemove(): Promise<void> {
    await run(async target => {
      const id = nodeId.value
      if (!target.hasUnconfirmedSave && !target.dirtyTracking.pendingDeleteIds.has(id)) {
        const row = target.rows.find(item => item['rowid'] === id)
        if (!row || target.deleteActionState(row) !== 'enabled') throw new Error('当前查询不允许删除桌面记录')
        await target.removeRow(id)
      }
      await commit(target)
      if (view.value !== target) return
      confirmOpen.value = false
      input.notice.value = '取消桌面显示成功'
    })
  }

  function cancelRemove(value = false): void {
    const target = view.value, id = nodeId.value
    if (value || busy.value || target?.hasUnconfirmedSave) return
    if (target?.dirtyTracking.pendingDeleteIds.has(id)) target.discardPendingChanges([id])
    confirmOpen.value = false
    dialogError.value = ''
    revision.value++
  }

  function dispose(): void {
    generation++
    release()
  }

  return {
    view,
    viewKey,
    exists,
    unknown,
    loading,
    busy,
    unavailable,
    dialogOpen,
    confirmOpen,
    dialogError,
    toggle,
    saveCreate,
    cancelCreate,
    confirmRemove,
    cancelRemove,
    dispose,
  }
}
