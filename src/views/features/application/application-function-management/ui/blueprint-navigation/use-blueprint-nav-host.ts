/**
 * @module app:views/features/application/application-function-management/ui/blueprint-navigation/use-blueprint-nav-host
 * 职责：导航配置页签的导航宿主关系列表、新增/编辑对话框、删除确认与“数据空间设计”入口。
 * 边界：全部动作经 BlueprintNavHostEditor 在蓝图 DataSet 的 byNode 视图暂存并单独提交；切换节点、上下文或离开页签后旧结果丢弃；
 *   保存或删除结果未知时对话框不能关闭或放弃，只能再次核验原提交。
 * AI用途：页面与宿主对话框只消费本组合函数返回的状态与动作。
 */
import {computed, ref, shallowRef, watch, type Ref} from 'vue'
import type {DataRow} from '@spark-appworks/spark-data'
import {BlueprintNavHostEditor} from '@/services/project/blueprint-navigation/blueprint-nav-host-editor'
import type {Id} from '@/lowcode/resources/structured-config/dimension-source/view-support'
import type {BlueprintTreeContext} from '../use-application-function-page'
import {readBlueprintCurrentText} from '../application-function-page-contract'

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
  const editor = shallowRef<BlueprintNavHostEditor>()
  const loading = ref(false)
  const busy = ref(false)
  const error = ref('')
  const dialogError = ref('')
  const editingId = ref<Id>()
  const deleteId = ref<Id>()
  const designId = ref('')
  const revision = ref(0)
  let generation = 0

  const listKey = computed(() => editor.value ? editor.value.viewKey(editor.value.view) : '')
  const unknown = computed(() => {void revision.value; return editor.value?.unknown === true})
  const created = computed(() => {
    void revision.value
    const id = editingId.value
    return id !== undefined && editor.value?.view.dirtyTracking.isPendingCreate(id) === true
  })

  function releaseEditor(): void {
    const current = editor.value
    editor.value = undefined
    editingId.value = undefined
    deleteId.value = undefined
    if (!current) return
    const id = current.view.rows.map(row => current.view.getPkKey(row)).filter(item => item !== undefined)
    if (!current.unknown && id.length) current.view.discardPendingChanges(id)
    current.release()
  }

  async function reload(): Promise<void> {
    const current = ++generation
    releaseEditor()
    error.value = ''
    dialogError.value = ''
    designId.value = ''
    const context = input.context(), nodeId = input.selectedNodeId.value
    if (!input.active() || !context || !nodeId) return
    const assertCurrent = (): void => {
      if (current !== generation || !input.isLive(context, nodeId)) throw new Error('导航宿主目标已因节点或上下文切换失效')
    }
    loading.value = true
    try {
      const hostName = readBlueprintCurrentText(context.owner, 'FunName') || readBlueprintCurrentText(context.owner, 'name')
      const next = new BlueprintNavHostEditor(context.owner.dataSet, {applicationId: context.projectId, nodeId, hostName, assertCurrent})
      try {
        await next.load()
        assertCurrent()
      } catch (cause) {
        next.release()
        throw cause
      }
      editor.value = next
    } catch (cause) {
      if (current === generation) error.value = `导航宿主不可用：${describe(cause)}`
    } finally {
      if (current === generation) loading.value = false
      revision.value++
    }
  }

  watch(() => [input.active(), input.context()?.key, input.selectedNodeId.value], () => { void reload() }, {immediate: true})

  async function run(action: (target: BlueprintNavHostEditor) => Promise<void>, onError: Ref<string>): Promise<void> {
    const target = editor.value
    if (!target || busy.value) return
    busy.value = true
    onError.value = ''
    try {
      await action(target)
    } catch (cause) {
      if (editor.value === target) onError.value = describe(cause)
    } finally {
      busy.value = false
      revision.value++
    }
  }

  function follow(target: BlueprintNavHostEditor, id: Id): void {
    target.followCascade(id, cause => { if (editor.value === target) dialogError.value = describe(cause) })
  }

  async function openCreate(): Promise<void> {
    await run(async target => {
      const id = await target.stageCreate()
      editingId.value = id
      follow(target, id)
      await target.loadDataSets()
    }, error)
  }

  async function openEdit(row: Readonly<DataRow>): Promise<void> {
    const id = editor.value?.view.getPkKey(row)
    if (id === undefined) return
    await run(async target => {
      target.beginEdit(id)
      editingId.value = id
      await target.loadCandidates(id)
      follow(target, id)
    }, error)
  }

  async function save(): Promise<void> {
    const id = editingId.value
    if (id === undefined) return
    await run(async target => {
      const wasCreate = target.view.dirtyTracking.isPendingCreate(id)
      target.stopCascade()
      try {
        await target.save(id)
      } catch (cause) {
        if (!target.unknown && editor.value === target) follow(target, id)
        throw cause
      }
      if (editor.value !== target) return
      editingId.value = undefined
      input.notice.value = wasCreate ? '新增导航宿主成功' : '修改导航宿主成功'
    }, dialogError)
  }

  function cancelEdit(value = false): void {
    if (value || busy.value) return
    const target = editor.value, id = editingId.value
    if (!target || id === undefined) return
    try {
      target.stopCascade()
      target.discard(id)
      editingId.value = undefined
      dialogError.value = ''
    } catch (cause) {
      dialogError.value = describe(cause)
    } finally {
      revision.value++
    }
  }

  function askRemove(row: Readonly<DataRow>): void {
    const id = editor.value?.view.getPkKey(row)
    if (id === undefined || busy.value) return
    dialogError.value = ''
    deleteId.value = id
  }

  /** 仅在确认框显式点击“确定”时删除。 */
  async function confirmRemove(): Promise<void> {
    const id = deleteId.value
    if (id === undefined) return
    await run(async target => {
      await target.remove(id)
      if (editor.value !== target) return
      deleteId.value = undefined
      input.notice.value = '删除导航宿主成功'
    }, dialogError)
  }

  function cancelRemove(value = false): void {
    if (value || busy.value || editor.value?.unknown) return
    deleteId.value = undefined
    dialogError.value = ''
  }

  function openDesign(row: Readonly<DataRow>): void {
    const target = editor.value
    const id = target ? String(row[target.column('dataSetId')] ?? '').trim() : ''
    if (id) designId.value = id
    else error.value = '该导航宿主未关联数据空间，不能设计'
  }

  function dispose(): void {
    generation++
    releaseEditor()
  }

  return {
    editor,
    listKey,
    loading,
    busy,
    error,
    dialogError,
    editingId,
    deleteId,
    designId,
    created,
    unknown,
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
