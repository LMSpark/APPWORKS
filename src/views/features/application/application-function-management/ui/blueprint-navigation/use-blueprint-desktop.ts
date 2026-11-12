/**
 * @module app:views/features/application/application-function-management/ui/blueprint-navigation/use-blueprint-desktop
 * 职责：导航配置页签的“+桌面 / 取消桌面显示”：独立 PageRuntime 承载按注册名解析的桌面 DataSet，读取当前节点桌面记录，
 *   新增对话框与取消确认均经 BlueprintDesktopRecord 单独提交并回读。
 * 边界：桌面 DataSet 不并入蓝图 owner；切换节点、上下文或离开页签后旧结果丢弃；确认框只有显式“确定”才执行删除；
 *   保存结果未知时对话框不允许关闭或放弃，只能再次核验原提交。
 * AI用途：页面与对话框只消费本组合函数返回的状态与动作。
 */
import {computed, ref, shallowRef, watch, type Ref} from 'vue'
import {NativePageRuntimeSession} from '@spark-appworks/spark-app'
import {buildDataViewKey} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {BlueprintDesktopRecord, type BlueprintDesktopEditor} from '@/services/project/blueprint-navigation/blueprint-desktop-editor'
import type {BlueprintTreeContext} from '../use-application-function-page'
import {readBlueprintCurrentText} from '../application-function-page-contract'

/** 页面向桌面显示提供的上下文与编辑器工厂。 */
export type BlueprintDesktopInput = Readonly<{
  context: () => BlueprintTreeContext | undefined
  selectedNodeId: Readonly<Ref<string>>
  isLive: (context: BlueprintTreeContext, nodeId: string) => boolean
  /** 导航配置页签处于激活状态。 */
  active: () => boolean
  createEditor: () => BlueprintDesktopEditor
  notice: Ref<string>
}>

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** 桌面显示状态与动作。 */
export function useBlueprintDesktop(input: BlueprintDesktopInput) {
  const session = new NativePageRuntimeSession()
  const runtime = shallowRef<PageRuntime>()
  const record = shallowRef<BlueprintDesktopRecord>()
  const loading = ref(false)
  const busy = ref(false)
  const unavailable = ref('')
  const dialogOpen = ref(false)
  const confirmOpen = ref(false)
  const dialogError = ref('')
  const revision = ref(0)
  let generation = 0
  let runtimeContextKey = ''
  let scenarioId = ''
  let warnings: readonly string[] = []

  const viewKey = computed(() => record.value ? buildDataViewKey(record.value.view.tableName, record.value.view.viewId, scenarioId) : '')
  /** 字典候选视图键（同一桌面运行时）。 */
  const optionViewKey = (tableName: string): string => buildDataViewKey(tableName, 'default', scenarioId)
  const exists = computed(() => {void revision.value; return !!record.value?.record})
  const unknown = computed(() => {void revision.value; return record.value?.unknown === true})
  const layout = computed(() => record.value?.layout)

  function releaseRuntime(): void {
    runtime.value = undefined
    runtimeContextKey = ''
    session.dispose()
  }

  async function reload(): Promise<void> {
    const current = ++generation
    dialogOpen.value = false
    confirmOpen.value = false
    dialogError.value = ''
    unavailable.value = ''
    record.value = undefined
    const context = input.context(), nodeId = input.selectedNodeId.value
    if (!input.active() || !context || !nodeId) return
    const assertCurrent = (): void => {
      if (current !== generation || !input.isLive(context, nodeId)) throw new Error('桌面显示目标已因节点或上下文切换失效')
    }
    loading.value = true
    try {
      if (!runtime.value || runtimeContextKey !== context.key) {
        releaseRuntime()
        const editor = input.createEditor()
        scenarioId = editor.scenarioId
        const next = session.acquire({pageId: 'blueprint-desktop', scenarioIds: [scenarioId], targetId: `${context.projectId}:desktop`,
          loadScenario: async () => {
            const assembled = await editor.assemble(assertCurrent)
            warnings = assembled.warnings
            return assembled.dataSet
          }})
        await next.load()
        assertCurrent()
        runtime.value = next
        runtimeContextKey = context.key
      }
      const dataSet = runtime.value.getDataSet(scenarioId)
      if (!dataSet) throw new Error('桌面运行时缺少 DataSet')
      const next = new BlueprintDesktopRecord(dataSet, {nodeId, assertCurrent, warnings})
      await next.load()
      assertCurrent()
      record.value = next
    } catch (cause) {
      if (current === generation) {
        unavailable.value = `桌面显示不可用：${describe(cause)}`
        if (!runtime.value) releaseRuntime()
      }
    } finally {
      if (current === generation) loading.value = false
      revision.value++
    }
  }

  watch(() => [input.active(), input.context()?.key, input.selectedNodeId.value], () => { void reload() }, {immediate: true})

  /** “+桌面”打开新增对话框；“取消桌面显示”打开确认框。 */
  async function toggle(): Promise<void> {
    const target = record.value, context = input.context()
    if (!target || !context || busy.value) return
    dialogError.value = ''
    if (target.record) { confirmOpen.value = true; return }
    const read = (field: string) => readBlueprintCurrentText(context.owner, field)
    const order = Number(read('FunOrderValue'))
    try {
      await target.stageCreate({
        AppName: read('FunName') || read('name'),
        ShortCNName: read('FunName') || read('name'),
        AppOrdidx: Number.isInteger(order) && order >= 1 ? order : 1,
        AppUrl: read('NavigationUrl'),
        MobileUrl: read('MobileUrl'),
        AppSmallIconUrl: read('NavigationImageWxz'),
        IsDesktopShow: target.flag('IsDesktopShow', true),
        IsReqLogin: target.flag('IsReqLogin', false),
      })
      dialogOpen.value = true
    } catch (cause) {
      unavailable.value = describe(cause)
    } finally {
      revision.value++
    }
  }

  async function saveCreate(): Promise<void> {
    const target = record.value
    if (!target || busy.value) return
    busy.value = true
    dialogError.value = ''
    try {
      await target.saveCreate()
      if (record.value !== target) return
      dialogOpen.value = false
      input.notice.value = '桌面显示保存成功'
    } catch (cause) {
      if (record.value === target) dialogError.value = describe(cause)
    } finally {
      busy.value = false
      revision.value++
    }
  }

  function cancelCreate(value = false): void {
    if (value) return
    const target = record.value
    if (!target || busy.value) return
    try {
      target.discardCreate()
      dialogOpen.value = false
      dialogError.value = ''
    } catch (cause) {
      dialogError.value = describe(cause)
    } finally {
      revision.value++
    }
  }

  /** 仅在确认框显式点击“确定”时执行取消桌面显示。 */
  async function confirmRemove(): Promise<void> {
    const target = record.value
    if (!target || busy.value) return
    busy.value = true
    dialogError.value = ''
    try {
      await target.remove()
      if (record.value !== target) return
      confirmOpen.value = false
      input.notice.value = '取消桌面显示成功'
    } catch (cause) {
      if (record.value === target) dialogError.value = describe(cause)
    } finally {
      busy.value = false
      revision.value++
    }
  }

  function cancelRemove(value = false): void {
    if (value || busy.value || record.value?.unknown) return
    confirmOpen.value = false
    dialogError.value = ''
  }

  function dispose(): void {
    generation++
    record.value = undefined
    releaseRuntime()
  }

  return {
    runtime,
    record,
    viewKey,
    optionViewKey,
    layout,
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
