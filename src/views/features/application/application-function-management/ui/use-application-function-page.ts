import { computed, onBeforeUnmount, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router'
import { NativePageRuntimeSession, SYSTEM_PAGE_NAVIGATION_ID_QUERY, useSystemPageDirtySource } from '@spark-appworks/spark-app'
import { buildDataViewKey, DataViewFilter, ensureDataSetStaticInputTable, isDataRow, type DataRow, type DataSet, type DataView } from '@spark-appworks/spark-data'
import { PAGE_RUNTIME, useSparkComponent } from '@spark-appworks/spark-component'
import type { PageRuntime } from '@spark-appworks/spark-project-model'
import { LOWCODE_APPLICATION_CATALOG_FORM_KEY, RichTextImageUploadResource, type AiTurnDraftRunner } from '@spark-appworks/spark-lowcode-api'
import { loadLowcodeRuntimeScenario, readLowcodeExecutionProject } from '@/lowcode/data-space/lowcode-data-space-runtime'
import { LowcodeDataSpaceAssembler } from '@/lowcode/data-space/lowcode-data-space-assembler'
import { lowcodeApi, lowcodeDesignFileUpload, lowcodeHttp, readLowcodePrincipal } from '@/lowcode/lowcode-runtime'
import { AiDataEntryHost } from '@/lowcode/resources/shared/ai-data-entry-host'
import { DimensionSourceLedgerGuard } from '@/lowcode/resources/structured-config/dimension-source/ledger-guard'
import type { BlueprintWorkspaceDataView } from '@/services/project/blueprint-workspace-dataview'
import { BLUEPRINT_APPLICATION_MEMBER_SCENARIO_ID, BLUEPRINT_NODE_STATUS_SCENARIO_ID, useDevState } from '@/views/app/dev-system/useDevState'
import { resolveNavHostProjectBinding, resolveProjectCandidate } from '@/views/app/dev-system/nav-host-project-picker/nav-host-project-picker-contract'
import { blueprintEditingFields as editingFields } from './application-function-page-contract'
import { useApplicationFunctionAi } from './use-application-function-ai'
import { useApplicationFunctionDataSpace } from './use-application-function-data-space'
import { useApplicationFunctionDimensionSource } from './use-application-function-dimension-source'
import { useApplicationFunctionPrototype } from './use-application-function-prototype'

type BlueprintTab = 'basic' | 'dataSpace' | 'prototype'
type NodeOption = Readonly<{label: string; value: string}>
type CreatePosition = 'root' | 'sibling' | 'child'
/** 当前有效的蓝图树上下文：同一 PageRuntime、目标应用与 owner 的组合身份。 */
export type BlueprintTreeContext = Readonly<{
  key: string
  projectId: string
  owner: BlueprintWorkspaceDataView
  runtime: PageRuntime
}>
type DeleteTarget = Readonly<{
  contextKey: string
  projectId: string
  nodeId: string
  parentNodeId: string
}>

function readQueryString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`蓝图页面查询参数 ${name} 必须是非空字符串`)
  }
  return value.trim()
}

function readNodeId(row: unknown): string {
  if (!isDataRow(row)) return ''
  const nodeId = row['rowid']
  return typeof nodeId === 'string' || typeof nodeId === 'number' ? String(nodeId) : ''
}

/** 节点阶段候选视图：功能导航状态字典（val/txt），经蓝图 PageRuntime 按需空间解析，由 FieldSelect.optionDataViewKey 消费。 */
export const BLUEPRINT_STATUS_OPTION_VIEW_KEY = buildDataViewKey('功能导航状态字典', 'default', BLUEPRINT_NODE_STATUS_SCENARIO_ID)
/** 节点负责人候选视图：按当前应用成员过滤后的用户目录（rowid/UserName）。 */
export const BLUEPRINT_PERSON_OPTION_VIEW_KEY = buildDataViewKey('Base_UserInfo', 'default', BLUEPRINT_NODE_STATUS_SCENARIO_ID)
/** 蓝图页弹窗输入 DataView 的唯一输入行。 */
const BLUEPRINT_INPUT_ROW = 'INPUT'
/** 节点类型与 Base_NavigationInfo.conType 正式取值一致。 */
export const BLUEPRINT_NODE_TYPE_OPTIONS: readonly NodeOption[] = Object.freeze([
  {value: 'Model', label: '模块'},
  {value: 'Navitem', label: '页面'},
  {value: 'embedded', label: '嵌入内容'},
  {value: 'service', label: '服务'},
  {value: 'content', label: '内容'},
])

function isRootParent(value: unknown): boolean {
  const parent = String(value ?? '').trim()
  return parent === '' || parent === '000000' || parent === '0'
}

function readText(row: DataRow, field: string): string {
  const value = row[field]
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function sortedSiblings(view: DataView, parentId: string): DataRow[] {
  return view.rows.filter(row => isRootParent(parentId) ? isRootParent(row['prowid']) : readText(row, 'prowid') === parentId)
    .sort((a, b) => Number(a['FunOrderValue'] ?? 0) - Number(b['FunOrderValue'] ?? 0)
      || readText(a, 'rowid').localeCompare(readText(b, 'rowid')))
}

/** 同一 DataSet 复用一个草稿运行器与一个图片上传资源（它们在 DataSet 上注册固定命令表）。 */
const draftRunners = new WeakMap<DataSet, AiTurnDraftRunner>()
const imageUploaders = new WeakMap<DataSet, RichTextImageUploadResource>()

function draftRunnerFor(dataSet: DataSet): AiTurnDraftRunner {
  const cached = draftRunners.get(dataSet)
  if (cached) return cached
  const runner = new AiDataEntryHost({dataSet}).createDraftRunner()
  draftRunners.set(dataSet, runner)
  return runner
}

function imageUploaderFor(dataSet: DataSet): RichTextImageUploadResource {
  const cached = imageUploaders.get(dataSet)
  if (cached) return cached
  const readScope = () => lowcodeApi.readRequestScope()
  const resource = new RichTextImageUploadResource({dataSet, upload: lowcodeDesignFileUpload, readScope})
  imageUploaders.set(dataSet, resource)
  return resource
}

async function refreshComplete(view: DataView, label: string, assertCurrent: () => void): Promise<void> {
  await view.refresh()
  assertCurrent()
  if (view.loadingError) throw view.loadingError
  if (view.total !== view.rows.length) throw new Error(`${label}读取不完整`)
}

/**
 * 在蓝图 PageRuntime 中按需装配阶段字典与成员空间，并准备标准选项视图：字典读全量，用户目录按当前应用成员过滤。
 * @returns 当前应用是否存在负责人候选。
 */
async function prepareNodeOptionViews(input: Readonly<{
  runtime: PageRuntime
  projectId: string
  assertCurrent: () => void
}>): Promise<boolean> {
  const {runtime, assertCurrent} = input
  await runtime.ensureScenarioLoaded(BLUEPRINT_NODE_STATUS_SCENARIO_ID)
  assertCurrent()
  await runtime.ensureScenarioLoaded(BLUEPRINT_APPLICATION_MEMBER_SCENARIO_ID)
  assertCurrent()
  const statusView = requireView(runtime, BLUEPRINT_NODE_STATUS_SCENARIO_ID, '功能导航状态字典')
  statusView.queryConfig = {...statusView.queryConfig, allPages: true}
  await refreshComplete(statusView, '功能导航状态字典', assertCurrent)
  const members = requireView(runtime, BLUEPRINT_APPLICATION_MEMBER_SCENARIO_ID, 'Base_MainBody_RoleUser')
  members.queryConfig = {...members.queryConfig, allPages: true}
  members.filterExpression = DataViewFilter.condition({field: 'EntityPKValue', operator: 'eq', value: input.projectId}).toJSON()
  await refreshComplete(members, '应用成员关系', assertCurrent)
  const userIds = [...new Set(members.rows.flatMap(row => readText(row, 'UserIdField').split(','))
    .map(id => id.trim()).filter(id => id.length > 0))]
  if (userIds.length === 0) return false
  const users = requireView(runtime, BLUEPRINT_NODE_STATUS_SCENARIO_ID, 'Base_UserInfo')
  users.queryConfig = {...users.queryConfig, allPages: true}
  users.filterExpression = DataViewFilter.condition({field: 'rowid', operator: 'in', value: userIds}).toJSON()
  await refreshComplete(users, '应用成员用户目录', assertCurrent)
  return true
}

function readTab(value: unknown): BlueprintTab {
  if (value === undefined) return 'basic'
  if (value === 'basic' || value === 'dataSpace' || value === 'prototype') return value
  throw new Error(`蓝图页面不支持 blueprintTab=${String(value)}`)
}

function requireView(runtime: PageRuntime, scenarioId: string, modelName: string): DataView {
  const view = runtime.resolveView(buildDataViewKey(modelName, 'default', scenarioId))
  if (!view || view.dataSet?.scenarioId !== scenarioId
    || view.dataTable?.modelBinding?.modelName !== modelName || view.viewId !== 'default') {
    throw new Error(`蓝图入口缺少正式视图：${scenarioId}@${modelName}@default`)
  }
  return view
}

export function useApplicationFunctionPage() {
  const route = useRoute()
  const state = useDevState()
  const {sparkProvide, sparkRemove} = useSparkComponent({type: 'application-function-page'})
  const loading = ref(false)
  const error = ref('')
  const targetProjectId = ref('')
  const targetReady = ref(false)
  const deletingTarget = shallowRef<DeleteTarget>()
  const activeTab = ref<BlueprintTab>('basic')
  const requestedNodeId = ref('')
  const treeGeneration = ref(0)
  const expandedKeys = ref<string[]>([])
  const stageSaving = ref(false)
  const creating = ref(false)
  /** 已完成选项视图装配的蓝图 PageRuntime 实例；与当前树上下文实例一致时才渲染选项字段（resolveView 非响应式）。 */
  const optionsRuntimeId = ref('')
  const peopleAvailable = ref(false)
  const optionsError = ref('')
  const notice = ref('')
  const applicationLabel = ref('')
  let loadRevision = 0
  let releasePreflight = () => {}

  const treeContext = computed<BlueprintTreeContext | undefined>(() => {
    if (!targetReady.value) return undefined
    const owner = state.blueprintWorkspaceDataView.value
    const runtime = state.blueprintPageRuntime.value
    const projectId = targetProjectId.value
    const scenarioId = owner?.dataSet.scenarioId
    if (!owner || !runtime?.isLoaded || runtime.destroyed || owner.projectId !== projectId
      || typeof scenarioId !== 'string' || runtime.getDataSet(scenarioId) !== owner.dataSet) return undefined
    const key = owner.standardComponentBinding.dataViewKey
    if (!key || runtime.resolveView(key) !== owner.view) return undefined
    return { key: `${runtime.instanceId}:${projectId}:${key}:${treeGeneration.value}`, projectId, owner, runtime }
  })

  const treeDataViewKey = computed(() => treeContext.value?.owner.standardComponentBinding.dataViewKey ?? '')
  const optionsReady = computed(() =>
    optionsRuntimeId.value !== '' && treeContext.value?.runtime.instanceId === optionsRuntimeId.value)
  const treeBinding = computed(() => treeDataViewKey.value ? { dataViewKey: treeDataViewKey.value } : {})
  const selectedNodeId = computed(() => state.selectedNode.value?.nodeId === requestedNodeId.value
    ? requestedNodeId.value : '')
  const isSelectedNodeReady = computed(() => selectedNodeId.value !== '')
  const canAddRoot = computed(() => {
    void state.externalDataViewRevision.value
    const owner = treeContext.value?.owner
    return !!owner && !owner.isBusy && !owner.dirty && !state.blueprintSaving.value && !creating.value
      && !owner.hasPendingBlueprintCommand && owner.view.addActionState() === 'enabled'
  })
  /** 同级/子级新增：当前选中节点（或其父节点）在原 DataView 中允许新增子行。 */
  const canAddSibling = computed(() => canCreateAt('sibling'))
  const canAddChild = computed(() => canCreateAt('child'))
  const canSaveChanges = computed(() => {
    void state.externalDataViewRevision.value
    const owner = treeContext.value?.owner
    return !!owner && !owner.isBusy && !state.blueprintSaving.value && !stageSaving.value && (owner.dirty || owner.hasUnconfirmedSave)
      && !state.hasAnyFileDirty.value && state.editor.dirtyScenarioIds.length === 0
  })
  /** 名称单独保存：当前行编辑覆盖只含 FunName。 */
  const canSaveName = computed(() => {
    void state.externalDataViewRevision.value
    const owner = treeContext.value?.owner
    if (!owner || owner.isBusy || state.blueprintSaving.value || stageSaving.value || !isSelectedNodeReady.value) return false
    const fields = editingFields(owner)
    return fields?.length === 1 && fields[0] === 'FunName'
  })
  /** 阶段在线保存：其他字段有未保存修改或命令待核验时锁定，避免把它们一并提交。 */
  const stageLocked = computed(() => {
    void state.externalDataViewRevision.value
    const owner = treeContext.value?.owner
    if (!owner || owner.isBusy || state.blueprintSaving.value || stageSaving.value) return true
    const fields = editingFields(owner)
    return fields === undefined || fields.some(field => field !== 'status')
  })
  const canCancelChanges = computed(() => {
    void state.externalDataViewRevision.value
    const owner = treeContext.value?.owner
    return !!owner && owner.dirty && !owner.isBusy && !state.blueprintSaving.value && !owner.hasPendingBlueprintCommand
      && !state.hasAnyFileDirty.value && state.editor.dirtyScenarioIds.length === 0
  })

  watch(treeContext, context => {
    if (context) sparkProvide(PAGE_RUNTIME, context.runtime)
    else sparkRemove(PAGE_RUNTIME)
  }, {immediate: true})

  function isCurrentContext(key: string): boolean {
    return treeContext.value?.key === key
  }

  function isLive(context: BlueprintTreeContext, nodeId: string): boolean {
    return isCurrentContext(context.key) && selectedNodeId.value === nodeId
  }

  // 弹窗输入（AI 需求描述、版本描述）走同 DataSet 的 static-data 输入 DataView，由标准字段写入；不参与正式保存。
  let pageInput: Readonly<{dataSet: DataSet; tableName: string; view: DataView}> | undefined
  const inputViewKey = ref('')
  const inputRevision = ref(0)
  function releasePageInput(): void {
    const current = pageInput
    pageInput = undefined
    inputViewKey.value = ''
    if (current && !current.dataSet.destroyed && current.dataSet.getView(current.tableName, 'default') === current.view) {
      current.dataSet.removeTable(current.tableName)
    }
  }
  function mountPageInput(context: BlueprintTreeContext): void {
    const dataSet = context.owner.dataSet
    const tableName = `BlueprintPageInput${crypto.randomUUID().replaceAll('-', '')}`
    if (dataSet.getTable(tableName)) throw new Error('蓝图页输入临时表名称冲突')
    ensureDataSetStaticInputTable(dataSet, tableName, [{name: 'inputId', primary: true}, {name: 'requirement'}, {name: 'versionDescription'}])
    const view = dataSet.getView(tableName, 'default')
    if (!view) throw new Error('蓝图页输入 DataView 未装配')
    pageInput = {dataSet, tableName, view}
    view.commitMode = 'staged'
    view.appendRow({inputId: BLUEPRINT_INPUT_ROW, requirement: '', versionDescription: ''})
    view.setCurrentRowById(BLUEPRINT_INPUT_ROW)
    const key = buildDataViewKey(tableName, 'default', dataSet.scenarioId)
    if (context.runtime.resolveView(key) !== view) throw new Error('蓝图页输入 DataView 不属于当前运行时')
    inputViewKey.value = key
  }
  watch([() => treeContext.value?.runtime, () => treeContext.value?.owner.dataSet], () => {
    releasePageInput()
    const context = treeContext.value
    if (!context) return
    try {
      mountPageInput(context)
    } catch (cause) {
      releasePageInput()
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      inputRevision.value++
    }
  }, {immediate: true, flush: 'sync'})
  function readInput(field: string): string {
    void inputRevision.value
    const value = pageInput?.view.getEditingRow(BLUEPRINT_INPUT_ROW)?.[field]
    return typeof value === 'string' ? value : ''
  }
  function resetInput(field: string): void {
    if (pageInput) pageInput.view.updateEditingValue(BLUEPRINT_INPUT_ROW, field, '')
    inputRevision.value++
  }
  function touchInput(): void {
    inputRevision.value++
  }

  const ai = useApplicationFunctionAi({
    context: () => treeContext.value,
    selectedNodeId,
    isLive,
    applicationLabel: () => applicationLabel.value,
    createRunner: context => draftRunnerFor(context.owner.dataSet),
    createNode: (parentNodeId, fields) => state.addBlueprintModuleNode(parentNodeId, fields),
    expand: nodeId => { if (!expandedKeys.value.includes(nodeId)) expandedKeys.value = [...expandedKeys.value, nodeId] },
    notifyChanged: () => state.notifyExternalDataViewChanged(),
    readInput,
    resetInput,
    error,
    notice,
  })

  const prototype = useApplicationFunctionPrototype({
    context: () => treeContext.value,
    isLive,
    selectedNodeId,
    active: computed(() => activeTab.value === 'prototype'),
    createUploader: context => imageUploaderFor(context.owner.dataSet),
    saveOwner: () => saveBlueprintChanges(),
    notifyChanged: () => state.notifyExternalDataViewChanged(),
    revision: state.externalDataViewRevision,
    userName: () => {
      const principal = readLowcodePrincipal()
      return principal?.displayName ?? principal?.username ?? ''
    },
    readInput,
    resetInput,
    error,
    notice,
  })

  const dataSpace = useApplicationFunctionDataSpace({
    context: () => treeContext.value,
    isLive,
    selectedNodeId,
    persistedDataSpaceId: state.persistedDataSpaceId,
    bindingPending: state.sceneBindingPending,
    saveOwner: () => saveBlueprintChanges(),
    notifyChanged: () => state.notifyExternalDataViewChanged(),
    error,
    notice,
  })
  onScopeDispose(() => dataSpace.dispose())

  let ledgerGuard: DimensionSourceLedgerGuard | undefined
  const dimensionSource = useApplicationFunctionDimensionSource({
    context: () => treeContext.value,
    isLive,
    selectedNodeId,
    persistedDataSpaceId: state.persistedDataSpaceId,
    bindingPending: state.sceneBindingPending,
    readModels: request => lowcodeApi.dataSpace.design.readModels(request),
    hasLedgerRecords: (bindingId, assertCurrent) => {
      ledgerGuard ??= new DimensionSourceLedgerGuard(lowcodeApi.dataSpace.design, new LowcodeDataSpaceAssembler(lowcodeApi.dataSpace.runtime, lowcodeHttp))
      return ledgerGuard.hasRecords(bindingId, assertCurrent)
    },
    error,
    notice,
  })
  onScopeDispose(() => dimensionSource.dispose())

  /** 图片上传进行中时禁止切换节点或页签，避免上传结果插入到其他节点。 */
  function uploadsBlockSwitch(): boolean {
    if (prototype.uploadState.value.pending === 0) return false
    error.value = '图片正在上传，请等待完成后再切换'
    return true
  }

  /** 新增位置对应的父节点：root→null；sibling→选中节点的父级（根层同级即根模块）；child→选中节点。 */
  function createParent(position: CreatePosition, context: BlueprintTreeContext): string | null | undefined {
    if (position === 'root') return null
    const nodeId = selectedNodeId.value
    if (!nodeId) return undefined
    const row = context.owner.view.rows.find(candidate => readText(candidate, 'rowid') === nodeId && candidate['SysId'] === context.projectId)
    if (!row) return undefined
    if (position === 'child') return nodeId
    return isRootParent(row['prowid']) ? null : readText(row, 'prowid')
  }

  function canCreateAt(position: CreatePosition): boolean {
    void state.externalDataViewRevision.value
    const context = treeContext.value
    const owner = context?.owner
    if (!context || !owner || owner.isBusy || owner.dirty || owner.hasPendingBlueprintCommand
      || state.blueprintSaving.value || creating.value) return false
    const parent = createParent(position, context)
    if (parent === undefined) return false
    if (parent === null) return owner.view.addActionState() === 'enabled'
    return state.childCreateActionState(parent) === 'enabled'
  }

  async function createNode(position: CreatePosition, rowParentId?: string): Promise<void> {
    const context = treeContext.value
    if (!context || !isCurrentContext(context.key) || creating.value) return
    if (state.hasAnyDirty.value && !context.owner.hasPendingBlueprintCommand) {
      error.value = '当前蓝图存在未处理修改，先完成保存或取消后再新增节点'
      return
    }
    const parent = rowParentId ?? createParent(position, context)
    if (parent === undefined) {
      error.value = '请先选择当前应用蓝图中的节点'
      return
    }
    creating.value = true
    try {
      const nodeId = await state.addBlueprintModuleNode(parent)
      if (!isCurrentContext(context.key)) return
      if (parent !== null && !expandedKeys.value.includes(parent)) expandedKeys.value = [...expandedKeys.value, parent]
      error.value = ''
      await selectNode(nodeId, context)
    } catch (cause) {
      if (isCurrentContext(context.key)) error.value = String(cause)
    } finally {
      creating.value = false
    }
  }

  function addRootNode(): void { void createNode('root') }
  function addSiblingNode(): void { void createNode('sibling') }
  function addChildNode(): void { void createNode('child') }

  /** 展开时按父节点沿原 DataView 增量装载；结果所属树代次变化即丢弃。 */
  async function loadChildren(nodeId: string, context: BlueprintTreeContext): Promise<void> {
    if (!context.owner.isLazyTree) return
    try {
      await state.loadBlueprintChildrenFromDataView(nodeId)
    } catch (cause) {
      if (isCurrentContext(context.key)) error.value = String(cause)
    }
  }

  function onNodeExpand(...args: unknown[]): void {
    const context = treeContext.value
    const nodeId = readNodeId(args[0])
    if (!context || !isCurrentContext(context.key) || !nodeId) return
    if (!expandedKeys.value.includes(nodeId)) expandedKeys.value = [...expandedKeys.value, nodeId]
    void loadChildren(nodeId, context)
  }

  function onNodeCollapse(...args: unknown[]): void {
    const nodeId = readNodeId(args[0])
    if (nodeId) expandedKeys.value = expandedKeys.value.filter(key => key !== nodeId)
  }

  function canMove(row: DataRow | undefined, context: BlueprintTreeContext | undefined): boolean {
    const owner = context?.owner
    if (!owner || !row) return false
    const nodeId = readNodeId(row)
    const matches = owner.view.rows.filter(candidate => String(candidate['rowid']) === nodeId)
    const formalRow = matches[0]
    const rootNodeId = state.project.rootNode?.id
    return matches.length === 1 && !!formalRow
      && rootNodeId !== undefined && String(formalRow['rowid']) !== rootNodeId
      && owner.view.editActionState(formalRow) === 'enabled'
      && owner.view.fieldAccess(formalRow, 'prowid').write === 'allowed'
      && owner.view.fieldAccess(formalRow, 'FunOrderValue').write === 'allowed'
  }

  function onNodeClick(...args: unknown[]): void {
    const context = treeContext.value
    const control = args[3]
    if (control !== null && typeof control === 'object' && 'cancel' in control) control.cancel = true
    if (!context || !isCurrentContext(context.key)) return
    const nodeId = readNodeId(args[0])
    if (!nodeId) return
    void selectNode(nodeId, context).then(() => loadChildren(nodeId, context))
  }

  async function selectNode(nodeId: string, context: BlueprintTreeContext): Promise<void> {
    if (requestedNodeId.value !== nodeId && uploadsBlockSwitch()) return
    try {
      if (state.hasAnyDirty.value && state.selectedNode.value?.nodeId !== nodeId) {
        throw new Error('当前蓝图存在未处理修改，先完成原节点保存或核验后再切换')
      }
      await state.selectNodeById(nodeId)
      if (!isCurrentContext(context.key) || state.selectedNode.value?.nodeId !== nodeId) {
        throw new Error('蓝图节点选择期间项目或节点身份发生变化')
      }
      requestedNodeId.value = nodeId
    } catch (cause) {
      error.value = String(cause)
    }
  }

  function onNodeDrop(...args: unknown[]): void {
    const context = treeContext.value
    const control = args[1]
    if (control !== null && typeof control === 'object' && 'cancel' in control) control.cancel = true
    const event = args[0]
    if (!context || !isCurrentContext(context.key) || event === null || typeof event !== 'object') return
    const draggedKey: unknown = Reflect.get(event, 'draggedKey')
    const targetKey: unknown = Reflect.get(event, 'targetKey')
    const position: unknown = Reflect.get(event, 'dropType')
    if (typeof draggedKey !== 'string' || typeof targetKey !== 'string'
      || (position !== 'before' && position !== 'after' && position !== 'inner')) return
    if (state.hasAnyDirty.value) {
      error.value = '当前蓝图存在未处理修改，先完成原节点保存或核验后再移动节点'
      return
    }
    void state.moveBlueprintNodeRelative({ nodeId: draggedKey, targetNodeId: targetKey, position })
      .catch(cause => { error.value = String(cause) })
  }

  function addChildFromRow(...args: unknown[]): void {
    const context = treeContext.value
    if (!context || !isCurrentContext(context.key) || state.hasAnyDirty.value) return
    const nodeId = readNodeId(args[0])
    if (nodeId) void createNode('child', nodeId)
  }

  function beginDelete(...args: unknown[]): void {
    const context = treeContext.value
    const row = args[0]
    const nodeId = readNodeId(row)
    if (!context || !isCurrentContext(context.key) || !nodeId || state.hasAnyDirty.value) return
    const matches = context.owner.view.rows.filter(candidate => String(candidate['rowid']) === nodeId)
    const target = matches[0]
    if (matches.length !== 1 || !target) return
    if (target['SysId'] !== context.projectId
      || context.owner.view.deleteActionState(target) !== 'enabled') return
    if (context.owner.view.rows.some(candidate => String(candidate['prowid'] ?? '') === nodeId)) {
      error.value = '仅允许删除无子节点的蓝图叶子'
      return
    }
    deletingTarget.value = {
      contextKey: context.key,
      projectId: context.projectId,
      nodeId,
      parentNodeId: String(target['prowid'] ?? ''),
    }
  }

  function cancelDelete(): void {
    deletingTarget.value = undefined
  }

  function confirmDelete(): void {
    const target = deletingTarget.value
    const context = treeContext.value
    deletingTarget.value = undefined
    if (!target || !context) return
    if (target.contextKey !== context.key || target.projectId !== context.projectId) return
    const matches = context.owner.view.rows.filter(row => String(row['rowid']) === target.nodeId)
    const row = matches[0]
    if (matches.length !== 1 || !row) {
      error.value = '蓝图删除目标已变化或当前 DataView 不允许删除'
      return
    }
    if (row['SysId'] !== target.projectId || String(row['prowid'] ?? '') !== target.parentNodeId
      || context.owner.view.deleteActionState(row) !== 'enabled'
      || context.owner.view.rows.some(candidate => String(candidate['prowid'] ?? '') === target.nodeId)) {
      error.value = '蓝图删除目标已变化或当前 DataView 不允许删除'
      return
    }
    const siblings = sortedSiblings(context.owner.view, target.parentNodeId)
    const index = siblings.findIndex(candidate => readText(candidate, 'rowid') === target.nodeId)
    const fallback = siblings[index + 1] ?? siblings[index - 1]
    const fallbackId = fallback ? readText(fallback, 'rowid') : ''
    const wasSelected = selectedNodeId.value === target.nodeId
    void state.removeNodeByIdAndWait(target.nodeId).then(async removed => {
      if (!isCurrentContext(context.key)) return
      if (!removed) {
        error.value = state.statusMessages.value[0]?.text ?? '蓝图节点删除未完成'
        return
      }
      if (wasSelected) {
        requestedNodeId.value = ''
        if (fallbackId) await selectNode(fallbackId, context)
      }
    })
  }

  function assertNoPendingChanges(): void {
    if (state.hasAnyDirty.value) throw new Error('蓝图存在未处理修改，先完成保存或取消再切换入口目标')
  }

  async function loadTarget(): Promise<void> {
    const revision = ++loadRevision
    releasePreflight()
    targetReady.value = false
    loading.value = true
    error.value = ''
    const relationSession = new NativePageRuntimeSession()
    const candidateSession = new NativePageRuntimeSession()
    const dispose = () => {relationSession.dispose(); candidateSession.dispose()}
    releasePreflight = dispose
    try {
      const execution = readLowcodeExecutionProject()
      const navigationId = readQueryString(route.meta['nodeId'], 'navigationId')
      const query = route.query
      const assertCurrent = () => {
        execution.assertCurrent()
        if (revision !== loadRevision || route.query !== query
          || route.meta['systemPageIdentityState'] !== 'resolved' || route.meta['nodeId'] !== navigationId
          || route.params['projectId'] !== execution.projectId) throw new Error('蓝图入口目标查询或正式导航身份已失效')
      }
      assertCurrent()
      const marker = query[SYSTEM_PAGE_NAVIGATION_ID_QUERY]
      if (marker !== undefined && marker !== navigationId) throw new Error('蓝图入口导航标记与正式导航身份不匹配')
      const nodeId = query['nodeId'] === undefined ? '' : readQueryString(query['nodeId'], 'nodeId')
      readTab(route.query['blueprintTab'])
      assertNoPendingChanges()
      const loadScenario = (scenarioId: string) => {
        assertCurrent()
        return loadLowcodeRuntimeScenario({projectId: execution.projectId, scenarioId})
      }
      const relationRuntime = relationSession.acquire({pageId: navigationId,
        scenarioIds: [LOWCODE_APPLICATION_CATALOG_FORM_KEY], targetId: navigationId, loadScenario})
      await relationRuntime.load()
      assertCurrent()
      const relations = requireView(relationRuntime, LOWCODE_APPLICATION_CATALOG_FORM_KEY, 'Base_Navigation_DataRelation')
      relations.queryConfig = {...relations.queryConfig, allPages: true}
      relations.filterExpression = DataViewFilter.condition({field: 'prowid', operator: 'eq', value: navigationId}).toJSON()
      await relations.refresh()
      assertCurrent()
      if (relations.loadingError) throw relations.loadingError
      if (relations.total !== relations.rows.length) throw new Error('蓝图导航宿主关系读取不完整')
      const binding = resolveNavHostProjectBinding(relations, navigationId)
      const projectId = readQueryString(query[binding.valueParameter], binding.valueParameter)
      const candidates = candidateSession.acquire({pageId: navigationId,
        scenarioIds: [binding.scenarioId], targetId: projectId, loadScenario})
      await candidates.load()
      assertCurrent()
      const candidateView = requireView(candidates, binding.scenarioId, binding.modelName)
      candidateView.queryConfig = {...candidateView.queryConfig, allPages: true}
      candidateView.filterExpression = DataViewFilter.condition({field: binding.valueField, operator: 'eq', value: projectId}).toJSON()
      await candidateView.refresh()
      assertCurrent()
      if (candidateView.loadingError) throw candidateView.loadingError
      const candidate = candidateView.rows[0]
      if (candidateView.total !== 1 || candidateView.rows.length !== 1 || !candidate
        || resolveProjectCandidate(candidateView, candidate, binding) !== projectId) throw new Error('蓝图目标未通过正式宿主候选精确核验')
      const applications = requireView(relationRuntime, LOWCODE_APPLICATION_CATALOG_FORM_KEY, 'Base_AppSystemList')
      applications.filterExpression = DataViewFilter.condition({field: 'rowid', operator: 'eq', value: projectId}).toJSON()
      await applications.refresh()
      assertCurrent()
      if (applications.loadingError) throw applications.loadingError
      const application = applications.rows[0]
      if (applications.total !== 1 || applications.rows.length !== 1 || !application
        || resolveProjectCandidate(applications, application, {valueField: 'rowid', labelField: 'AppName'}) !== projectId) {
        throw new Error('当前租户正式应用目录未确认蓝图目标')
      }
      applicationLabel.value = readText(application, 'AppName')
      assertNoPendingChanges()
      if (!await state.openEditingProject({projectId})) throw new Error('当前工作区尚不能切换到被设计应用')
      assertCurrent()
      targetProjectId.value = projectId
      const owner = await state.loadBlueprintWorkspaceDataView()
      assertCurrent()
      if (owner.projectId !== projectId) throw new Error('蓝图 DataView 与宿主指定目标不匹配')
      activeTab.value = readTab(route.query['blueprintTab'])
      if (!owner.hasTreeProjection) await state.loadBlueprintLazyTreeFromDataView()
      assertCurrent()
      treeGeneration.value++
      expandedKeys.value = owner.view.rows.filter(row => isRootParent(row['prowid'])).map(row => readText(row, 'rowid'))
      const optionRuntime = state.blueprintPageRuntime.value
      if (!optionRuntime) throw new Error('蓝图 PageRuntime 尚未就绪')
      optionsError.value = ''
      void prepareNodeOptionViews({runtime: optionRuntime, projectId, assertCurrent: () => {
        assertCurrent()
        if (state.blueprintPageRuntime.value !== optionRuntime || optionRuntime.destroyed) throw new Error('蓝图 PageRuntime 已切换')
      }}).then(
        hasPeople => {
          if (revision !== loadRevision) return
          peopleAvailable.value = hasPeople
          optionsRuntimeId.value = optionRuntime.instanceId
          if (!hasPeople) optionsError.value = '当前应用尚无成员，负责人暂无候选'
        },
        cause => { if (revision === loadRevision) optionsError.value = `节点阶段或负责人候选读取失败：${String(cause)}` },
      )
      if (!nodeId) {
        requestedNodeId.value = state.selectedNode.value?.nodeId ?? ''
        targetReady.value = true
        return
      }
      requestedNodeId.value = nodeId
      const path = await state.locateBlueprintNodeFromDataView(nodeId)
      assertCurrent()
      expandedKeys.value = [...new Set([...expandedKeys.value, ...path.slice(0, -1)])]
      if (owner.dirty || owner.hasUnconfirmedSave) {
        if (owner.nodeId !== nodeId || state.selectedNode.value?.nodeId !== nodeId) {
          throw new Error('同项目蓝图 owner 存在未确认修改，仅允许在原 nodeId 下接管，不会自动保存或丢弃')
        }
      } else {
        await state.selectNodeById(nodeId)
      }
      assertCurrent()
      if (state.selectedNode.value?.nodeId !== nodeId) {
        throw new Error('蓝图 DataView 未能定位到查询参数指定的 nodeId')
      }
      targetReady.value = true
    } catch (cause) {
      if (revision === loadRevision) error.value = String(cause)
    } finally {
      dispose()
      if (revision === loadRevision) loading.value = false
    }
  }

  function selectTab(tab: BlueprintTab): void {
    if (tab !== activeTab.value && uploadsBlockSwitch()) return
    activeTab.value = tab
  }

  async function saveBlueprintChanges(): Promise<boolean> {
    const context = treeContext.value
    if (!context || !isCurrentContext(context.key) || state.blueprintSaving.value) return false
    if (stageSaving.value) {
      error.value = '节点阶段正在保存，完成后再保存基本信息'
      return false
    }
    if (prototype.uploadBlocked.value) {
      error.value = prototype.uploadState.value.pending > 0 ? '图片正在上传，请稍后保存' : '存在上传失败的图片，请重新上传后保存'
      return false
    }
    if (state.hasAnyFileDirty.value || state.editor.dirtyScenarioIds.length > 0) {
      error.value = '当前 owner 还包含工具文件或场景定义修改；本页不会替它们提交'
      return false
    }
    state.blueprintSaving.value = true
    try {
      await context.owner.save()
      if (!isCurrentContext(context.key)) throw new Error('保存期间蓝图项目或运行时身份已变化')
      state.refreshBlueprintTreeProjection()
      error.value = ''
      return true
    } catch (cause) {
      error.value = String(cause)
      return false
    } finally {
      state.blueprintSaving.value = false
      state.notifyExternalDataViewChanged()
    }
  }

  /** 名称单独保存：当前行编辑覆盖只含 FunName 时沿原 DataView 保存入口提交。 */
  async function saveNodeName(): Promise<void> {
    const context = treeContext.value
    if (!context || !isCurrentContext(context.key) || !canSaveName.value) return
    await saveBlueprintChanges()
  }

  /** 阶段在线保存：选择即沿原 DataView 保存 status；失败且无未知回执时回滚到正式值。 */
  async function onStageChange(): Promise<void> {
    state.notifyExternalDataViewChanged()
    const context = treeContext.value
    if (!context || !isCurrentContext(context.key) || stageSaving.value || state.blueprintSaving.value) return
    const fields = editingFields(context.owner)
    if (!fields?.includes('status')) return
    if (fields.length !== 1) {
      error.value = '阶段只能单独在线保存；请先保存或取消其他基本信息修改'
      return
    }
    stageSaving.value = true
    state.blueprintSaving.value = true
    try {
      await context.owner.save()
      if (!isCurrentContext(context.key)) throw new Error('阶段保存期间蓝图项目或运行时身份已变化')
      state.refreshBlueprintTreeProjection()
      error.value = ''
    } catch (cause) {
      error.value = `阶段保存失败：${String(cause)}`
      if (!context.owner.hasPendingBlueprintCommand && !context.owner.isBusy) {
        try {
          context.owner.cancel()
          state.refreshBlueprintTreeProjection()
        } catch (rollback) {
          error.value = `${error.value}；阶段回滚失败：${String(rollback)}`
        }
      }
    } finally {
      stageSaving.value = false
      state.blueprintSaving.value = false
      state.notifyExternalDataViewChanged()
    }
  }

  function cancelBlueprintChanges(): void {
    const context = treeContext.value
    if (!context || !canCancelChanges.value) return
    try {
      context.owner.cancel()
      state.refreshBlueprintTreeProjection()
      state.notifyExternalDataViewChanged()
      error.value = ''
    } catch (cause) {
      error.value = String(cause)
    }
  }

  useSystemPageDirtySource({ get isDirty() { return state.hasAnyDirty.value } })
  const guardPendingChanges = () => {
    if (!state.hasAnyDirty.value) return true
    error.value = '蓝图存在未保存修改或待核验提交，处理完成后才能离开'
    return false
  }
  onBeforeRouteLeave(guardPendingChanges)
  onBeforeRouteUpdate(guardPendingChanges)
  const stopTargetWatch = watch(
    () => [route.params['projectId'], route.query, route.meta['nodeId'], route.meta['systemPageIdentityState']],
    () => { void loadTarget() },
    { immediate: true },
  )
  onScopeDispose(() => {loadRevision++; releasePreflight(); releasePageInput(); sparkRemove(PAGE_RUNTIME)})
  onBeforeUnmount(stopTargetWatch)

  return {
    state,
    loading,
    error,
    activeTab,
    treeBinding,
    treeContext,
    selectedNodeId,
    isSelectedNodeReady,
    canAddRoot,
    canAddSibling,
    canAddChild,
    canSaveChanges,
    canSaveName,
    stageLocked,
    stageSaving,
    canCancelChanges,
    deletingTarget,
    expandedKeys,
    optionsReady,
    peopleAvailable,
    statusOptionViewKey: BLUEPRINT_STATUS_OPTION_VIEW_KEY,
    personOptionViewKey: BLUEPRINT_PERSON_OPTION_VIEW_KEY,
    optionsError,
    nodeTypeOptions: BLUEPRINT_NODE_TYPE_OPTIONS,
    isCurrentContext,
    canMove,
    onNodeClick,
    onNodeExpand,
    onNodeCollapse,
    onNodeDrop,
    addRootNode,
    addSiblingNode,
    addChildNode,
    addChildFromRow,
    beginDelete,
    cancelDelete,
    confirmDelete,
    selectTab,
    saveBlueprintChanges,
    saveNodeName,
    onStageChange,
    cancelBlueprintChanges,
    loadTarget,
    notice,
    inputViewKey,
    inputRowId: BLUEPRINT_INPUT_ROW,
    touchInput,
    ai,
    prototype,
    dataSpace,
    dimensionSource,
  }
}
