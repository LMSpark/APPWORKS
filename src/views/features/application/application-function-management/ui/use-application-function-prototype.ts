/**
 * @module app:views/features/application/application-function-management/ui/use-application-function-prototype
 * 职责：项目蓝图页“需求原型”页签：htmlDesc 富文本保存（上传中/上传失败阻断、统一清洗）、清洗后预览，以及 Base_Navigation_Desc_Version 版本的列举、新增、应用与删除。
 * 边界：原型正文只经 owner 的 Base_NavigationInfo DataView 编辑与保存；版本只经同 PageRuntime 的版本 DataView（staged）+ DataSet.saveChanges 提交并回读核验。
 *   结果未知时只重提原命令，不新增第二条；切换节点或上下文后旧版本请求结果丢弃。
 * AI用途：修改需求原型或版本行为时，在此处保持“清洗→提交→回读核验”与代次校验，不得旁路 DataView。
 */
import {computed, ref, shallowRef, watch, type Ref} from 'vue'
import {buildDataViewKey, DataViewFilter, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {sanitizeRichTextHtml, type RichTextImageUploadState} from '@spark-appworks/spark-component'
import type {BlueprintTreeContext} from './use-application-function-page'
import {blueprintEditingFields, buildPrototypeVersionName, readBlueprintCurrentText} from './application-function-page-contract'

const VERSION_MODEL = 'Base_Navigation_Desc_Version'

type VersionTarget = Readonly<{contextKey: string; nodeId: string; versionId: string; versionName: string}>
type PendingVersionCommand = Readonly<{contextKey: string; nodeId: string; ids: ReadonlyArray<string | number>}>

/** 页面向原型流程提供的上下文与保存入口。 */
export type ApplicationFunctionPrototypeInput = Readonly<{
  context: () => BlueprintTreeContext | undefined
  /** 上下文仍是当前树且选中节点仍为 nodeId。 */
  isLive: (context: BlueprintTreeContext, nodeId: string) => boolean
  selectedNodeId: Readonly<Ref<string>>
  /** 当前页签是否为需求原型；仅在该页签装载版本列表。 */
  active: Readonly<Ref<boolean>>
  /** 当前 DataSet 的富文本图片上传资源（同一 DataSet 复用）。 */
  createUploader: (context: BlueprintTreeContext) => Readonly<{upload: (file: File) => Promise<string>}>
  /** 沿 owner 保存全部编辑覆盖；成功返回 true，失败已写入 error。 */
  saveOwner: () => Promise<boolean>
  notifyChanged: () => void
  /** 外部 DataView 修订号，供计算属性感知编辑状态变化。 */
  revision: Readonly<Ref<number>>
  userName: () => string
  /** 页面输入 DataView 当前值（requirement / versionDescription）。 */
  readInput: (field: string) => string
  /** 清空页面输入 DataView 的指定字段。 */
  resetInput: (field: string) => void
  error: Ref<string>
  notice: Ref<string>
}>

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function rowId(row: DataRow | undefined): string {
  const value = row?.['rowid']
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

/** 需求原型与版本状态及动作。 */
export function useApplicationFunctionPrototype(input: ApplicationFunctionPrototypeInput) {
  const uploadState = ref<RichTextImageUploadState>({pending: 0, error: ''})
  const previewHtml = ref<string>()
  const versionDialogOpen = ref(false)
  const selectedVersionId = ref('')
  const deletingVersion = shallowRef<VersionTarget>()
  const versionBusy = ref(false)
  const versionRevision = ref(0)
  let versionRequest = 0
  let pendingCommand: PendingVersionCommand | undefined

  const versionViewKey = computed(() => {
    const scenarioId = input.context()?.owner.dataSet.scenarioId
    return typeof scenarioId === 'string' ? buildDataViewKey(VERSION_MODEL, 'default', scenarioId) : ''
  })

  function versionView(context: BlueprintTreeContext): DataView {
    const scenarioId = context.owner.dataSet.scenarioId
    const view = typeof scenarioId === 'string' ? context.runtime.resolveView(buildDataViewKey(VERSION_MODEL, 'default', scenarioId)) : undefined
    if (view?.dataSet !== context.owner.dataSet || view.dataTable?.modelBinding?.modelName !== VERSION_MODEL) {
      throw new Error(`蓝图 PageRuntime 缺少正式视图 ${VERSION_MODEL}@default`)
    }
    if (view.commitMode !== 'staged') view.commitMode = 'staged'
    return view
  }

  const selectedVersion = computed(() => {
    void versionRevision.value
    const context = input.context()
    const scenarioId = context?.owner.dataSet.scenarioId
    if (!context || !selectedVersionId.value || typeof scenarioId !== 'string') return undefined
    // 视图缺失时由 loadVersions 报错且 selectedVersionId 已清空；此处只读取已装载行。
    return context.runtime.resolveView(buildDataViewKey(VERSION_MODEL, 'default', scenarioId))?.rows
      .find(row => rowId(row) === selectedVersionId.value)
  })

  const uploadBlocked = computed(() => uploadState.value.pending > 0 || uploadState.value.error !== '')

  const canSavePrototype = computed(() => {
    void input.revision.value
    const owner = input.context()?.owner
    if (!owner || owner.isBusy || !input.selectedNodeId.value) return false
    const fields = blueprintEditingFields(owner)
    return fields?.length === 1 && fields[0] === 'htmlDesc'
  })

  function onImageUploadState(state: RichTextImageUploadState): void {
    uploadState.value = state
  }

  function imageUploader(file: File): Promise<string> {
    const context = input.context()
    if (!context) return Promise.reject(new Error('蓝图上下文未就绪，不能上传图片'))
    return input.createUploader(context).upload(file)
  }

  function assertUploadsSettled(): boolean {
    if (uploadState.value.pending > 0) input.error.value = '图片正在上传，请稍后保存'
    else if (uploadState.value.error) input.error.value = '存在上传失败的图片，请重新上传后保存'
    return !uploadBlocked.value
  }

  /** 把当前 htmlDesc 编辑值统一清洗后写回编辑覆盖；值未变化不写。 */
  function normalizeCurrentHtml(context: BlueprintTreeContext): string {
    const raw = readBlueprintCurrentText(context.owner, 'htmlDesc')
    const clean = sanitizeRichTextHtml(raw)
    if (clean !== raw) context.owner.update('htmlDesc', clean)
    return clean
  }

  /** 保存原型：只允许当前行仅 htmlDesc 有编辑覆盖；上传未完成或失败时阻断。 */
  async function savePrototype(): Promise<boolean> {
    const context = input.context()
    if (!context || !canSavePrototype.value || !assertUploadsSettled()) return false
    try {
      normalizeCurrentHtml(context)
    } catch (cause) {
      input.error.value = `原型内容清洗失败：${describe(cause)}`
      return false
    }
    const saved = await input.saveOwner()
    if (saved) input.notice.value = '需求原型已保存'
    return saved
  }

  function openPreview(): void {
    const context = input.context()
    if (!context) return
    const version = selectedVersion.value
    const source = version ? version['desc'] : readBlueprintCurrentText(context.owner, 'htmlDesc')
    previewHtml.value = sanitizeRichTextHtml(source)
  }

  function closePreview(): void {
    previewHtml.value = undefined
  }

  /** 按当前节点读取全部版本；迟到结果（节点或上下文已变化、被更新请求取代）丢弃。 */
  async function loadVersions(): Promise<void> {
    const context = input.context()
    const nodeId = input.selectedNodeId.value
    const request = ++versionRequest
    selectedVersionId.value = ''
    if (!context || !nodeId) return
    try {
      const view = versionView(context)
      view.queryConfig = {...view.queryConfig, allPages: true}
      view.filterExpression = DataViewFilter.condition({field: 'prowid', operator: 'eq', value: nodeId}).toJSON()
      await view.refresh()
      if (request !== versionRequest || !input.isLive(context, nodeId)) return
      if (view.loadingError) throw view.loadingError
      if (view.total !== view.rows.length) throw new Error('需求原型版本读取不完整')
      if (view.rows.some(row => String(row['prowid'] ?? '') !== nodeId)) throw new Error('需求原型版本读取结果含其他节点')
    } catch (cause) {
      if (request === versionRequest && input.isLive(context, nodeId)) input.error.value = `需求原型版本读取失败：${describe(cause)}`
    } finally {
      if (request === versionRequest) versionRevision.value++
    }
  }

  function selectVersion(...args: unknown[]): void {
    const row = args[0]
    if (row === null || typeof row !== 'object') return
    const id: unknown = Reflect.get(row, 'rowid')
    selectedVersionId.value = typeof id === 'string' || typeof id === 'number' ? String(id) : ''
  }

  function isSelectedVersion(row: unknown): boolean {
    if (row === null || typeof row !== 'object' || !selectedVersionId.value) return false
    const id: unknown = Reflect.get(row, 'rowid')
    return (typeof id === 'string' || typeof id === 'number') && String(id) === selectedVersionId.value
  }

  function versionLabel(row: unknown): string {
    const name: unknown = row !== null && typeof row === 'object' ? Reflect.get(row, 'VersionName') : undefined
    return typeof name === 'string' ? name : ''
  }

  /** 提交版本命令行并回读；结果未知时保留原命令，下一次只重提原命令。 */
  async function commitVersion(context: BlueprintTreeContext, nodeId: string, ids: ReadonlyArray<string | number>): Promise<void> {
    const view = versionView(context)
    pendingCommand = {contextKey: context.key, nodeId, ids}
    let saved
    try {
      saved = await context.owner.dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId, ids: [...ids]}]})
    } catch (cause) {
      if (!view.hasUnconfirmedSave) {
        view.discardPendingChanges([...ids])
        pendingCommand = undefined
      }
      throw cause
    }
    if (!saved.success) {
      if (!view.hasUnconfirmedSave) {
        view.discardPendingChanges([...ids])
        pendingCommand = undefined
      }
      throw saved.error ?? new Error(saved.message ?? '需求原型版本提交未确认')
    }
    pendingCommand = undefined
  }

  /** 存在结果未知的原版本命令时先只核验它；返回 true 表示已处理（本次不再发新命令）。 */
  async function verifyPendingCommand(context: BlueprintTreeContext, nodeId: string): Promise<boolean> {
    const pending = pendingCommand
    if (!pending) return false
    if (pending.contextKey !== context.key || pending.nodeId !== nodeId) {
      throw new Error('另一节点的需求原型版本提交结果待核验，请回到原节点处理')
    }
    await commitVersion(context, nodeId, pending.ids)
    await loadVersions()
    input.notice.value = '已核验原需求原型版本提交'
    return true
  }

  function beginCreateVersion(): void {
    if (!input.context() || !input.selectedNodeId.value) return
    input.resetInput('versionDescription')
    versionDialogOpen.value = true
  }

  function cancelCreateVersion(): void {
    versionDialogOpen.value = false
  }

  /** 新增版本：先保存当前原型（仅 htmlDesc 待保存时），再以清洗后的正文新增版本行并回读核验。 */
  async function confirmCreateVersion(): Promise<void> {
    const context = input.context()
    const nodeId = input.selectedNodeId.value
    const description = input.readInput('versionDescription').trim()
    if (!context || !nodeId || versionBusy.value) return
    if (!description) {
      input.error.value = '请输入版本描述'
      return
    }
    if (!assertUploadsSettled()) return
    versionBusy.value = true
    try {
      if (await verifyPendingCommand(context, nodeId)) {
        versionDialogOpen.value = false
        return
      }
      const fields = blueprintEditingFields(context.owner)
      if (fields === undefined || fields.some(field => field !== 'htmlDesc')) throw new Error('请先保存或取消基本信息的其他修改')
      if (fields.length > 0) {
        normalizeCurrentHtml(context)
        if (!await input.saveOwner()) return
      }
      if (!input.isLive(context, nodeId)) return
      const view = versionView(context)
      const expected = {prowid: nodeId, VersionName: buildPrototypeVersionName({userName: input.userName(), description, now: new Date()}),
        desc: sanitizeRichTextHtml(readBlueprintCurrentText(context.owner, 'htmlDesc'))}
      if (view.addActionState() !== 'enabled') throw new Error('当前 DataView 不允许新增需求原型版本')
      const created = await view.addRow(expected)
      const id = view.getPkKey(created)
      if (id === undefined) throw new Error('需求原型版本未生成行身份')
      await commitVersion(context, nodeId, [id])
      await loadVersions()
      const confirmed = view.rows.find(row => view.getPkKey(row) === id)
      if (!confirmed || Object.entries(expected).some(([field, value]) => confirmed[field] !== value)) {
        throw new Error('需求原型版本新增后回读不一致')
      }
      versionDialogOpen.value = false
      input.error.value = ''
      input.notice.value = '历史版本保存成功'
    } catch (cause) {
      input.error.value = `保存历史版本失败：${describe(cause)}`
    } finally {
      versionBusy.value = false
    }
  }

  /** 应用选中版本：清洗后写入当前节点 htmlDesc 并保存；当前有其他未保存修改时拒绝。 */
  async function applySelectedVersion(): Promise<void> {
    const context = input.context()
    const version = selectedVersion.value
    if (!context || !version || versionBusy.value) return
    const fields = blueprintEditingFields(context.owner)
    if (fields === undefined || fields.length > 0) {
      input.error.value = '请先保存或取消当前修改后再设置版本'
      return
    }
    versionBusy.value = true
    try {
      context.owner.update('htmlDesc', sanitizeRichTextHtml(version['desc']))
      input.notifyChanged()
      if (await input.saveOwner()) input.notice.value = '设置当前版本成功'
    } catch (cause) {
      input.error.value = `设置当前版本失败：${describe(cause)}`
    } finally {
      versionBusy.value = false
    }
  }

  function beginDeleteVersion(): void {
    const context = input.context()
    const version = selectedVersion.value
    const nodeId = input.selectedNodeId.value
    if (!context || !version || !nodeId) return
    const name = version['VersionName']
    deletingVersion.value = {contextKey: context.key, nodeId, versionId: rowId(version), versionName: typeof name === 'string' ? name : ''}
  }

  function cancelDeleteVersion(): void {
    deletingVersion.value = undefined
  }

  async function confirmDeleteVersion(): Promise<void> {
    const target = deletingVersion.value
    const context = input.context()
    deletingVersion.value = undefined
    if (!target || !context || versionBusy.value) return
    if (target.contextKey !== context.key || !input.isLive(context, target.nodeId)) {
      input.error.value = '蓝图上下文或选中节点已变化，版本未删除'
      return
    }
    versionBusy.value = true
    try {
      if (await verifyPendingCommand(context, target.nodeId)) return
      const view = versionView(context)
      const row = view.rows.find(candidate => rowId(candidate) === target.versionId)
      const id = row ? view.getPkKey(row) : undefined
      if (!row || id === undefined || String(row['prowid'] ?? '') !== target.nodeId) throw new Error('未找到当前蓝图节点的唯一需求原型版本')
      if (view.deleteActionState(row) !== 'enabled') throw new Error('当前 DataView 不允许删除该版本')
      await view.removeRow(id)
      await commitVersion(context, target.nodeId, [id])
      await loadVersions()
      if (view.rows.some(candidate => view.getPkKey(candidate) === id)) throw new Error('需求原型版本删除后仍可读取')
      input.error.value = ''
      input.notice.value = '删除成功'
    } catch (cause) {
      input.error.value = `删除历史版本失败：${describe(cause)}`
    } finally {
      versionBusy.value = false
    }
  }

  watch(() => [input.active.value, input.selectedNodeId.value, input.context()?.key], () => {
    previewHtml.value = undefined
    versionDialogOpen.value = false
    deletingVersion.value = undefined
    uploadState.value = {pending: 0, error: ''}
    if (input.active.value) void loadVersions()
    else {
      versionRequest++
      selectedVersionId.value = ''
    }
  }, {immediate: true})

  return {
    uploadState,
    uploadBlocked,
    canSavePrototype,
    previewHtml,
    versionViewKey,
    versionDialogOpen,
    selectedVersionId,
    selectedVersion,
    deletingVersion,
    versionBusy,
    onImageUploadState,
    imageUploader,
    savePrototype,
    openPreview,
    closePreview,
    loadVersions,
    selectVersion,
    isSelectedVersion,
    versionLabel,
    beginCreateVersion,
    cancelCreateVersion,
    confirmCreateVersion,
    applySelectedVersion,
    beginDeleteVersion,
    cancelDeleteVersion,
    confirmDeleteVersion,
  }
}
