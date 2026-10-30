/**
 * @module app:views/app/dev-system/useDevState
 * 职责：提供 DevSystem 的 useDevState 能力，围绕 EditableProjectOption 等公开契约支撑配置调试、节点编辑、预览或开发态状态管理。
 * 边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
 * AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/useDevState。
 */
/**
 * DevSystem — 当前编辑 scope 的项目蓝图设计器状态。
 *
 * 本质：经 `ProjectBlueprint` 领域实例编辑由 `projectId` 指向的应用模型。
 * 它可以是当前运行应用，也可以是被委托编辑的其他应用。
 *
 * - `workspace` = `getAppProjectBlueprintWorkspace(scope)`；领域真源在 `workspace.project`
 * - `project` = `workspace.project`（ProjectBlueprint；API、事件、revision、projection）
 * - 项目蓝图树 / 节点表单 / dirty：经模型 API + 显式投影 API 到 Vue ref
 * - 配置页内容：写入走 `project.writePageFile()`，保存/版本走 ProjectWorkspace
 * - 本模块只编排：Vue ref、localStorage 活动页、autoSave、SSE、状态消息
 */
import { ref, shallowRef, reactive, computed, getCurrentScope, nextTick, onScopeDispose } from 'vue'
import { createAiRunAdapter, createAiToolApprovalBridge } from '@spark-appworks/spark-app'
import type { AiRunTimelineEvent } from '@spark-appworks/spark-app'
import type { AiToolApprovalRequest } from '@spark-appworks/spark-app'
import * as ProjectBlueprintDomain from '@spark-appworks/spark-project-model'

import type { ToolApprovalDisplayItem } from '@spark-appworks/spark-component'
import {
  runPageDesignAiSession,
  type PageDesignAiRunOptions,
} from '@/services/page-design/page-design-ai-runner'
import { runProjectPlanningAiSession } from '@/services/project-planning/project-planning-ai-runner'
import {
  isProjectPlanningDocumentFile,
  uploadProjectPlanningAttachment,
} from '@/services/project-planning/project-planning-attachments'
import { getAppProjectBlueprintWorkspace } from '@/services/project/project-shell'
import type { ProjectWorkspaceScope } from '@/services/project/project-shell'
import { reloadAndSyncNavigation } from '@/services/project/project-shell'
import type {DataView} from '@spark-appworks/spark-data'
import { lowcodeApi, readLowcodePrincipal } from '@/lowcode/lowcode-runtime'
import { APPLICATION_CATALOG_PROJECT_ID } from '@/services/application-scope'

const {
  isConfigFilesPageSurface,
  isConfigNodeKind,
  findNodeById,
  findPageNodeByPageId,
  findNodeLocation,
  resolvePageNodePageId,
  normalizePageIdFromPath,
  PAGE_TOOL_FILE_NAMES,
} = ProjectBlueprintDomain

/** Editable Project Option 的语义模型。 */
export type EditableProjectOption = ProjectBlueprintDomain.ProjectSummary

function createLiveTargetProxy<T extends object>(readTarget: () => T): T {
  const initial = readTarget()
  return new Proxy(initial, {
    get(_target, property) {
      const target = readTarget()
      const value: unknown = Reflect.get(target, property, target)
      if (typeof value !== 'function') return value
      const boundValue: unknown = value.bind(target)
      return boundValue
    },
    set(_target, property, value) {
      return Reflect.set(readTarget(), property, value)
    },
    deleteProperty(_target, property) {
      return Reflect.deleteProperty(readTarget(), property)
    },
    has(_target, property) {
      return property in readTarget()
    },
    ownKeys() {
      return Reflect.ownKeys(readTarget())
    },
    getOwnPropertyDescriptor(_target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(readTarget(), property)
      if (!descriptor) return undefined
      return { ...descriptor, configurable: true }
    },
  })
}

// ═══════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════

/** Status Message 的语义模型。 */
export type StatusMessage = {
    /** 展示文本。 */
text: string
    /** 类型标识。 */
type: 'success' | 'warning' | 'error' | 'info'
    /** time 字段。 */
time: string}

/** Dev Context Config 的配置结构。 */
export type DevContextConfig = {
    /** 占位提示文本。 */
placeholder: string
    /** default Value 字段。 */
defaultValue: string
    /** param Name 名称。 */
paramName: string}

/** Dev Workspace Tab 的语义模型。 */
export type DevWorkspaceTab = 'props' | 'preview' | ProjectBlueprintDomain.PageToolFileName

// ═══════════════════════════════════════════════════════════
// 共享状态工厂
// ═══════════════════════════════════════════════════════════

export function useDevState() {
  const initialPrincipal = readLowcodePrincipal()
  const initialScope: ProjectWorkspaceScope = {
    projectId: initialPrincipal?.applicationId ?? APPLICATION_CATALOG_PROJECT_ID,
  }
  const activeEditScope = ref<ProjectWorkspaceScope>(initialScope)
  const currentEditor = shallowRef<ProjectBlueprintDomain.ProjectWorkspace>(getAppProjectBlueprintWorkspace(initialScope))
  const editor = createLiveTargetProxy<ProjectBlueprintDomain.ProjectWorkspace>(() => currentEditor.value)
  const project = createLiveTargetProxy<ProjectBlueprintDomain.ProjectBlueprint>(() => currentEditor.value.project)
  const projectId = computed(() => activeEditScope.value.projectId)
  const projectPicker = reactive({
    projectId: initialScope.projectId,
  })
  const editableProjects = ref<EditableProjectOption[]>([])
  const projectOptionsLoading = ref(false)
  const pageFileNames = PAGE_TOOL_FILE_NAMES

  // ── 项目蓝图树（ProjectBlueprint 投影，非独立真源）──
  const blueprintLoading = ref(false)
  const blueprintSaving = ref(false)
  const blueprintDraftRevision = ref(0)
  const projectRevision = ref(project.revision)
  const loadedBlueprintScopeKeys = new Set<string>()

  function currentScopeKey(): string {
    return activeEditScope.value.projectId
  }

  function isDefaultUserProjectScope(): boolean {
    const principal = readLowcodePrincipal()
    const runtimeScope = principal === null
      ? initialScope
      : { projectId: principal.applicationId ?? APPLICATION_CATALOG_PROJECT_ID }
    return activeEditScope.value.projectId === runtimeScope.projectId
  }

  function readBlueprintProjection() {
    void projectRevision.value
    return project.hasLoadedBlueprint ? project.readBlueprintProjection() : { tree: [], selectedNode: null, selectedNodeId: null, blueprintLocation: null, blueprintDraft: null, pageDeliveries: [] }
  }

  const blueprintProjection = computed(() => readBlueprintProjection())
  const activePageProjection = computed(() => {
    void projectRevision.value
    return project.readActivePageProjection()
  })
  const dirtyProjection = computed(() => {
    void projectRevision.value
    return project.readDirtyProjection()
  })
  const treeData = computed(() => blueprintProjection.value.tree)
  const pageList = computed(() => blueprintProjection.value.pageDeliveries)
  const selectedNode = computed(() => blueprintProjection.value.selectedNode)
  const blueprintEmpty = computed(() => blueprintProjection.value.tree.length === 0)
  const activePageId = computed(() => activePageProjection.value.pageId)

  function handleProjectBlueprintEvent(): void {
    projectRevision.value = project.revision
    refreshBlueprintDraftBindings()
  }

  let unsubscribeProjectBlueprint = currentEditor.value.project.subscribe(handleProjectBlueprintEvent)

  function bindProjectBlueprintEvents(): void {
    unsubscribeProjectBlueprint()
    unsubscribeProjectBlueprint = currentEditor.value.project.subscribe(handleProjectBlueprintEvent)
    projectRevision.value = currentEditor.value.project.revision
    refreshBlueprintDraftBindings()
  }

  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => {
      unsubscribeProjectBlueprint()
      installScenarioDocument(null)
      cancelAutoSave()
    })
  }

  function normalizeEditScope(scope: Partial<ProjectWorkspaceScope>): ProjectWorkspaceScope {
    const scopedProjectId = scope.projectId?.trim()
    const pickerProjectId = projectPicker.projectId.trim()
    const normalizedProjectId = scopedProjectId && scopedProjectId.length > 0
      ? scopedProjectId
      : (pickerProjectId.length > 0 ? pickerProjectId : projectId.value)
    if (!normalizedProjectId) throw new Error('projectId 不能为空')
    return { projectId: normalizedProjectId }
  }

  function sameEditScope(scope: ProjectWorkspaceScope): boolean {
    return projectId.value === scope.projectId
  }

  async function loadEditableProjects(): Promise<void> {
    projectOptionsLoading.value = true
    try {
      const rows: ProjectBlueprintDomain.ProjectSummary[] = (await lowcodeApi.platform.listApplications()).map((application) => ({
        projectId: application.id,
        name: application.name,
        icon: '',
        description: application.description,
      }))
      editableProjects.value = rows
        .filter(row => row.projectId.trim() !== '')
        .map(row => ({ ...row }))
      if (!editableProjects.value.some(row => row.projectId === projectPicker.projectId)) {
        projectPicker.projectId = editableProjects.value[0]?.projectId ?? projectPicker.projectId
      }
    } catch (error) {
      editableProjects.value = []
      addStatus(`加载应用列表失败: ${String(error)}`, 'error')
    } finally {
      projectOptionsLoading.value = false
    }
  }

  async function openEditingProject(
    scope: Partial<ProjectWorkspaceScope>,
    options: { force?: boolean } = {},
  ): Promise<boolean> {
    const nextScope = normalizeEditScope(scope)
    if (sameEditScope(nextScope)) return true

    if ((project.readDirtyProjection().hasAnyDirty || editor.dirtyScenarioIds.length > 0) && options.force !== true) {
      addStatus('当前项目模型还有未保存改动，请先保存后再切换编辑项目', 'warning')
      projectPicker.projectId = projectId.value
      return false
    }

    cancelAutoSave()
    activeEditScope.value = nextScope
    projectPicker.projectId = nextScope.projectId
    installScenarioDocument(null)
    currentEditor.value = getAppProjectBlueprintWorkspace(nextScope)
    bindProjectBlueprintEvents()
    linkProbeInfo.value = null
    autoSaveStatus.value = 'idle'
    await loadBlueprint({ preserveActivePageId: readPersistedActivePageId() })
    return true
  }

  async function openProjectPickerScope(options?: { force?: boolean }): Promise<boolean> {
    return openEditingProject({
      projectId: projectPicker.projectId,
    }, options)
  }

  async function syncRuntimeNavigationIfDefaultProject(): Promise<void> {
    if (isDefaultUserProjectScope()) {
      await reloadAndSyncNavigation()
    }
  }

  function refreshBlueprintDraftBindings(): void {
    blueprintDraftRevision.value++
  }

  function readBlueprintDraft(): ProjectBlueprintDomain.BlueprintNodeDraft | null {
    void blueprintDraftRevision.value
    return project.blueprintDraft
  }

  const emptyDraft: ProjectBlueprintDomain.ProjectBlueprintTreeNodeData = { nodeId: '', parentNodeId: '', projectId: projectId.value, kind: 'unknown', capability: { name: '' }, source: {} }
  const blueprintDraft = reactive(createLiveTargetProxy(() => readBlueprintDraft()?.node ?? emptyDraft))

  // ── 页面文件状态（经 ProjectWorkspace 加载/保存）──
  const pageIoBusy = ref(false)
  const allSaving = ref(false)

  function bumpPageCache(
    pageId: string,
    filename: ProjectBlueprintDomain.PageToolFileName | '__created' | '__deleted' | '__bulk',
  ): void {
    editor.notifyPageFileChanged(pageId, filename)
  }

  // ── 状态消息 ──
  const statusMessages = ref<StatusMessage[]>([])
  const linkProbeLoading = ref(false)
  const linkProbeInfo = ref<{ embeddable: boolean; reason: string } | null>(null)

  // ── 自动保存 ──
  const autoSaveStatus = ref<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  const AUTO_SAVE_DELAY = 800

  // ── SPARK AI tool approval bridge + pageDesign entry ──
  const pageDesignAiAdapter = createAiRunAdapter()
  const pageDesignAiRunRevision = ref(0)
  const aiToolApprovals = createAiToolApprovalBridge()
  const aiToolApprovalRevision = ref(0)
  const pageDesignAiRunning = computed(() => {
    void pageDesignAiRunRevision.value
    return pageDesignAiAdapter.isRunning()
  })
  const aiToolApprovalPending = computed<readonly ToolApprovalDisplayItem[]>(() => {
    void aiToolApprovalRevision.value
    return aiToolApprovals.listPending().map(toToolApprovalDisplayItem)
  })

  aiToolApprovals.subscribe(() => {
    aiToolApprovalRevision.value += 1
  })

  // ── SPARK AI project planning document import ──
  const projectPlanningDocumentImportDialogVisible = ref(false)
  const projectPlanningDocumentUploading = ref(false)
  const projectPlanningAiRunning = ref(false)
  const projectPlanningDocumentFileName = ref('')
  const projectPlanningAttachmentRef = ref('')
  const projectPlanningAdapter = createAiRunAdapter()
  const projectPlanningAiRunRevision = ref(0)
  const projectPlanningAiTimeline = computed<readonly AiRunTimelineEvent[]>(() => {
    void projectPlanningAiRunRevision.value
    return projectPlanningAdapter.snapshot().timeline.slice(-8).reverse()
  })

  projectPlanningAdapter.subscribe(() => {
    projectPlanningAiRunRevision.value += 1
  })

  // ═══════════════════════════════════════════════════════════
  // 计算属性
  // ═══════════════════════════════════════════════════════════

  const hasAnyFileDirty = computed(() => {
    const dirty = dirtyProjection.value.dirtyFiles
    return pageFileNames.some((n) => dirty.has(n))
  })

  const blueprintDirty = computed(() => {
    return dirtyProjection.value.blueprintDirty
  })

  const hasAnyDirty = computed(() => {
    void scenarioDefinitionRevision.value
    return dirtyProjection.value.hasAnyDirty || editor.dirtyScenarioIds.length > 0 || editor.unconfirmedPageFiles.length > 0
  })

  const scenarioDefinitionDocument = shallowRef<ProjectBlueprintDomain.ScenarioDefinitionDocument | null>(null)
  const scenarioDefinitionRevision = ref(0)
  const pageDataDirty = computed(() => { void scenarioDefinitionRevision.value; return scenarioDefinitionDocument.value?.isDirty === true })
  let releaseScenarioDocument = () => {}
  let scenarioLoad = 0

  function installScenarioDocument(document: ProjectBlueprintDomain.ScenarioDefinitionDocument | null): void {
    releaseScenarioDocument()
    scenarioDefinitionDocument.value?.dispose()
    scenarioDefinitionDocument.value = document
    const views = document?.viewSelectors.map(item => document.dataSet.getView(item.tableName, item.viewId)).filter((view): view is DataView => view !== undefined) ?? []
    const changed = () => {scenarioDefinitionRevision.value++}
    const events = ['editingChanged', 'editingDiscarded', 'rowsChanged', 'mutatingChanged'] as const
    for (const view of views) for (const event of events) view.events.on(event, changed)
    releaseScenarioDocument = () => {for (const view of views) for (const event of events) view.events.off(event, changed)}
    changed()
  }

  function definitionViews(document: ProjectBlueprintDomain.ScenarioDefinitionDocument): DataView[] {
    return document.viewSelectors.map(item => {
      const view = document.dataSet.getView(item.tableName, item.viewId)
      if (!view) throw new Error('SCENARIO_DOCUMENT_IDENTITY: 定义视图已释放')
      return view
    })
  }
  const pageDataError = ref<string | null>(null)
  function selectedScenarioMatches(id: string): boolean { return selectedNode.value?.dataSpace?.scenarioId === id }
  async function loadSelectedScenarioViews(forceReload = false): Promise<void> {
    const scenarioId = selectedNode.value?.dataSpace?.scenarioId
    const generation = ++scenarioLoad
    pageDataError.value = null
    if (!scenarioId) {installScenarioDocument(null); return}
    const workspace = currentEditor.value
    const previous = scenarioDefinitionDocument.value
    if (!forceReload && previous?.scenarioId === scenarioId && workspace.getScenarioDefinitions(scenarioId) === previous.dataSet) return
    if (forceReload && previous?.isDirty) throw new Error('SCENARIO_VIEW_UNSAVED: 请先保存或撤销当前定义修改')
    installScenarioDocument(null)
    try {
      const dataSet = await workspace.loadScenarioDefinitions({scenarioId})
      if (generation !== scenarioLoad || currentEditor.value !== workspace || !selectedScenarioMatches(scenarioId)) return
      if (forceReload) {
        const source = dataSet.getView('DataViewDefinition')
        if (!source) throw new Error('SCENARIO_DOCUMENT_IDENTITY: 正式元数据缺少定义视图')
        const snapshot = await source.previewSource()
        if (snapshot.version !== null) await source.adoptSource(snapshot)
        for (const name of Object.keys(ProjectBlueprintDomain.ScenarioDefinitionRecords.resources)) {
          const view = dataSet.getView(name)
          if (!view) throw new Error('SCENARIO_DOCUMENT_IDENTITY: 正式元数据缺少定义视图')
          await view.refresh()
        }
      }
      const document = await ProjectBlueprintDomain.ScenarioDefinitionDocument.open(dataSet, scenarioId)
      if (generation !== scenarioLoad || currentEditor.value !== workspace || !selectedScenarioMatches(scenarioId)) {document.dispose(); return}
      installScenarioDocument(document)
    } catch(error) {
      if (generation === scenarioLoad && currentEditor.value === workspace && selectedScenarioMatches(scenarioId)) pageDataError.value = `场景 ${scenarioId} 视图配置加载失败: ${String(error)}`
      throw error
    }
  }
  async function createSelectedScenarioViews(): Promise<void> {
    const scenarioId = selectedNode.value?.dataSpace?.scenarioId
    const nodeId = selectedNode.value?.nodeId
    if (!scenarioId || !nodeId) throw new Error('请先绑定现有业务场景')
    const document = scenarioDefinitionDocument.value
    if (document?.scenarioId !== scenarioId || document.isPersisted || document.isDirty) throw new Error('请先加载尚无配置的正式场景')
    const modelView = document.dataSet.getView('Base_DataModel')
    if (!modelView) throw new Error('正式模型目录尚未加载')
    const models = modelView.rows
    if (models.length === 0) throw new Error('当前场景没有正式模型，不能创建视图草稿')
    const tables: Record<string, unknown> = {}
    for (const model of models) {
      const id = model['rowid'], name = model['Name']
      if (model['dataSetId'] !== scenarioId || modelView.fieldAccess(model, 'rowid').read !== 'visible' || modelView.fieldAccess(model, 'Name').read !== 'visible'
        || typeof id !== 'string' || !id.trim() || typeof name !== 'string' || !name.trim() || Object.hasOwn(tables, name)) throw new Error('正式模型标识或 Name 不可读、无效或重复')
      Object.defineProperty(tables, name, { enumerable: true, value: { modelBinding: { modelId: id, modelName: name }, views: { default: {} } } })
    }
    await document.setText(JSON.stringify({...JSON.parse(document.getText()), tables}))
    scenarioDefinitionRevision.value++
    pageDataError.value = null
    addStatus('已按正式模型新建场景视图草稿，请检查并保存', 'info')
  }

  async function writeScenarioViewText(text: string): Promise<void> {
    const target = captureScenarioVersionTarget()
    await target.document.setText(text)
    target.assertCurrent(); scenarioDefinitionRevision.value++; pageDataError.value = null
  }
  async function saveScenarioViewText(): Promise<void> {
    const target = captureScenarioVersionTarget()
    const result = await target.document.dataSet.saveChanges({views: target.document.viewSelectors})
    target.assertCurrent()
    if (!result.success) throw result.error ?? new Error(result.message ?? '场景定义保存失败')
    scenarioDefinitionRevision.value++
  }

  /** 版本请求绑定实际工作区、节点与共享文件，迟到结果不能落入新的选择。 */
  function captureScenarioVersionTarget() {
    const workspace = currentEditor.value
    const file = scenarioDefinitionDocument.value
    const nodeId = selectedNode.value?.nodeId
    const token = lowcodeApi.readRequestScope().token
    if (!file || !selectedScenarioMatches(file.scenarioId)) throw new Error('场景视图文件尚未加载或选择已切换')
    const assertCurrent = (): void => {
      if (currentEditor.value !== workspace || scenarioDefinitionDocument.value !== file || selectedNode.value?.nodeId !== nodeId
        || !selectedScenarioMatches(file.scenarioId) || lowcodeApi.readRequestScope().token !== token) {
        throw new Error('SCENARIO_VIEW_SCOPE_STALE: 场景版本目标已切换')
      }
    }
    const source = definitionViews(file).find(view => view.tableName === 'DataViewDefinition')
    if (!source) throw new Error('正式定义视图缺失')
    return { document: file, source, scenarioId: file.scenarioId, assertCurrent }
  }

  async function listScenarioVersions(): ReturnType<DataView['listSourceVersions']> {
    const target = captureScenarioVersionTarget()
    const versions = await target.source.listSourceVersions()
    target.assertCurrent()
    return versions
  }

  async function previewScenarioVersion(version: string | number): Promise<string> {
    const target = captureScenarioVersionTarget()
    const text = await target.source.previewSourceVersion(version)
    target.assertCurrent()
    return text
  }

  async function createScenarioVersion(): Promise<void> {
    const target = captureScenarioVersionTarget()
    await target.source.createSourceVersion()
    target.assertCurrent()
  }

  async function restoreScenarioVersion(version: string | number, previewText: string): Promise<void> {
    const target = captureScenarioVersionTarget()
    const hasChanges = () => target.document.isDirty
    if (hasChanges()) throw new Error('SCENARIO_VIEW_UNSAVED: 请先处理当前定义修改')
    const current = target.document.getText()
    const verified = await target.source.previewSourceVersion(version)
    target.assertCurrent()
    if (verified !== previewText) throw new Error('SCENARIO_VIEW_PREVIEW_CHANGED: 快照与预览不一致')
    if (hasChanges() || target.document.getText() !== current) throw new Error('SCENARIO_VIEW_UNSAVED: 预览期间定义已改变')
    await target.document.setText(verified)
    target.assertCurrent()
    await saveScenarioViewText()
  }

  // ═══════════════════════════════════════════════════════════
  // 工具：地址 / 持久化 pageId
  // ═══════════════════════════════════════════════════════════

  function buildActivePageStorageKey(): string {
    return `dev-system:active-page:${projectId.value}`
  }

  function readPersistedActivePageId(): string {
    if (typeof window === 'undefined') return ''
    try {
      return window.localStorage.getItem(buildActivePageStorageKey())?.trim() ?? ''
    } catch {
      return ''
    }
  }

  function persistActivePageId(pageId: string): void {
    if (typeof window === 'undefined') return
    const key = buildActivePageStorageKey()
    try {
      if (pageId) window.localStorage.setItem(key, pageId)
      else window.localStorage.removeItem(key)
    } catch {
      // ignore storage failures
    }
  }

  function isBackendConfigPage(pageId: string): boolean {
    const pageMeta = pageList.value.find((page: ProjectBlueprintDomain.ProjectPageNodeSummary) => page.pageId === pageId)
    if (!pageMeta) return treeData.value.length === 0
    return isConfigFilesPageSurface(pageMeta.designSurface)
  }

  // ═══════════════════════════════════════════════════════════
  // 页面上下文切换
  // ═══════════════════════════════════════════════════════════

  function setActivePageContext(pageId: string, forceReset = false): boolean {
    const normalizedPageId = pageId.trim()
    if (!normalizedPageId || !isBackendConfigPage(normalizedPageId)) {
      clearActivePageContext()
      return false
    }

    const shouldReset = forceReset || activePageId.value !== normalizedPageId
    project.setActivePage(normalizedPageId, { forceReset: shouldReset })
    persistActivePageId(normalizedPageId)
    return true
  }

  function clearActivePageContext(): void {
    project.clearActivePage()
    persistActivePageId('')
  }

  // ═══════════════════════════════════════════════════════════
  // 项目蓝图树工具
  // ═══════════════════════════════════════════════════════════

  function syncActivePageContextByPath(path: string): void {
    const pageId = normalizePageIdFromPath(path)
    if (pageId && isConfigNodeKind(ProjectBlueprintDomain.projectNodeDeliveryKind(blueprintDraft))) {
      setActivePageContext(pageId, activePageId.value !== pageId)
      return
    }
    clearActivePageContext()
  }

  // ═══════════════════════════════════════════════════════════
  // 状态消息
  // ═══════════════════════════════════════════════════════════

  function addStatus(text: string, type: StatusMessage['type'] = 'info'): void {
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
    statusMessages.value.unshift({ text, type, time })
    if (statusMessages.value.length > 80) {
      statusMessages.value = statusMessages.value.slice(0, 80)
    }
  }

  function previewApprovalArgs(args: AiToolApprovalRequest['args']): string {
    try {
      const text = JSON.stringify(args, null, 2)
      return text.length > 600 ? `${text.slice(0, 600)}...` : text
    } catch {
      return String(args)
    }
  }

  function toToolApprovalDisplayItem(request: AiToolApprovalRequest): ToolApprovalDisplayItem {
    return {
      id: request.id,
      toolName: request.toolName,
      moduleId: request.moduleId,
      argsPreview: previewApprovalArgs(request.args),
    }
  }

  function approveAiTool(requestId: string): void {
    if (!aiToolApprovals.decide(requestId, { status: 'allow' })) return
    addStatus('AI 工具调用已允许', 'info')
  }

  function rejectAiTool(requestId: string, reason: string): void {
    const normalizedReason = reason.trim()
    if (!aiToolApprovals.decide(requestId, {
      status: 'reject',
      reason: normalizedReason || '用户拒绝工具调用',
      fix: '请根据用户拒绝原因调整方案；必要时先询问用户。',
    })) return
    addStatus('AI 工具调用已拒绝', 'warning')
  }

  function abortAiTool(requestId: string, reason: string): void {
    const normalizedReason = reason.trim()
    if (!aiToolApprovals.decide(requestId, {
      status: 'abort',
      reason: normalizedReason || '用户中止工具调用',
    })) return
    addStatus('AI 工具调用已中止', 'warning')
  }

  async function runPageDesignAi(options: PageDesignAiRunOptions): Promise<void> {
    const pageId = activePageId.value.trim()
    const description = options.description.trim()
    if (!pageId) {
      addStatus('请先选择一个配置页面', 'warning')
      return
    }
    if (!description) {
      addStatus('请先输入 AI 编辑需求', 'warning')
      return
    }
    if (pageDesignAiAdapter.isRunning()) return

    pageDesignAiRunRevision.value += 1
    await nextTick()

    try {
      addStatus(`AI 开始编辑页面 ${pageId}`, 'info')
      const result = await runPageDesignAiSession({
        ...options,
        pageId,
        editor,
        adapter: pageDesignAiAdapter,
        beforeFunctionCall: aiToolApprovals.beforeFunctionCall,
        onAbort: aiToolApprovals.cancelPending,
        events: {
          onToolCall: (record) => {
            const type: StatusMessage['type'] = record.status === 'success' ? 'info' : 'warning'
            addStatus(`AI 工具 ${record.toolName} ${record.status === 'success' ? '完成' : '失败'}`, type)
          },
        },
      })
      addStatus(
        result.sawToolCall
          ? `AI 已修改页面 ${pageId}，请保存`
          : `AI 已完成页面 ${pageId} 的编辑会话`,
        result.sawToolCall ? 'success' : 'info',
      )
    } catch (error) {
      addStatus(`AI 编辑失败: ${String(error)}`, 'error')
    } finally {
      aiToolApprovals.cancelPending('AI 编辑会话已结束。')
      pageDesignAiRunRevision.value += 1
    }
  }

  // ── 项目策划文档导入 ──

  function openProjectPlanningDocumentImportDialog(): void {
    projectPlanningAttachmentRef.value = project.projectInfo.planningAttachmentRef ?? ''
    projectPlanningDocumentImportDialogVisible.value = true
  }

  function closeProjectPlanningDocumentImportDialog(): void {
    projectPlanningDocumentImportDialogVisible.value = false
    projectPlanningDocumentFileName.value = ''
  }

  function bindProjectPlanningAttachmentRef(attachmentRef: string): Promise<void> {
    void attachmentRef
    return Promise.reject(new Error('lowcode 项目附件绑定接口不满足写前镜像、journal、readback 与补偿门禁'))
  }

  async function handleProjectPlanningDocumentFileSelected(file: File): Promise<void> {
    if (!isProjectPlanningDocumentFile(file)) {
      addStatus('请选择 .docx 格式的项目策划文档', 'warning')
      return
    }
    projectPlanningDocumentUploading.value = true
    projectPlanningDocumentFileName.value = file.name
    try {
      const result = await uploadProjectPlanningAttachment({
        projectId: projectId.value,
        file,
      })
      projectPlanningAttachmentRef.value = result.planningAttachmentRef
      await bindProjectPlanningAttachmentRef(result.planningAttachmentRef)
      addStatus(`项目策划文档已上传并绑定: ${result.originalFilename}`, 'success')
    } catch (error) {
      projectPlanningAttachmentRef.value = project.projectInfo.planningAttachmentRef ?? ''
      addStatus(`项目策划文档上传失败: ${String(error)}`, 'error')
    } finally {
      projectPlanningDocumentUploading.value = false
    }
  }

  async function runProjectPlanningDocumentImportAi(): Promise<void> {
    const localAttachmentRef = projectPlanningAttachmentRef.value.trim()
    const modelAttachmentRef = project.projectInfo.planningAttachmentRef?.trim() ?? ''
    const attachmentRef = localAttachmentRef.length > 0 ? localAttachmentRef : modelAttachmentRef
    if (!attachmentRef) {
      addStatus('请先上传并绑定项目策划文档', 'warning')
      return
    }
    if (projectPlanningAdapter.isRunning()) return

    projectPlanningAiRunning.value = true
    projectPlanningAiRunRevision.value += 1
    await nextTick()

    try {
      addStatus('AI 开始读取项目策划附件并生成项目蓝图...', 'info')
      const result = await runProjectPlanningAiSession({
        planningAttachmentRef: attachmentRef,
        editor,
        adapter: projectPlanningAdapter,
        beforeFunctionCall: aiToolApprovals.beforeFunctionCall,
        onAbort: aiToolApprovals.cancelPending,
        saveBlueprintAfterRun: true,
        events: {
          onToolCall: (record) => {
            const type: StatusMessage['type'] = record.status === 'success' ? 'info' : 'warning'
            addStatus(`AI 工具 ${record.toolName} ${record.status === 'success' ? '完成' : '失败'}`, type)
          },
        },
      })
      addStatus(
        result.savedBlueprint
          ? '项目策划完成，项目蓝图已保存'
          : '项目策划完成，请手动保存项目蓝图',
        result.savedBlueprint ? 'success' : 'warning',
      )
      closeProjectPlanningDocumentImportDialog()
    } catch (error) {
      addStatus(`项目策划失败: ${String(error)}`, 'error')
    } finally {
      aiToolApprovals.cancelPending('项目策划会话已结束。')
      projectPlanningAiRunning.value = false
      projectPlanningAiRunRevision.value += 1
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 数据加载
  // ═══════════════════════════════════════════════════════════

  async function ensureCurrentProjectBlueprintLoaded(): Promise<void> {
    const scopeKey = currentScopeKey()
    if (loadedBlueprintScopeKeys.has(scopeKey)) return
    if (project.hasLoadedBlueprint) {
      loadedBlueprintScopeKeys.add(scopeKey)
      return
    }

    await editor.loadBlueprint()
    loadedBlueprintScopeKeys.add(scopeKey)
  }

  async function loadBlueprint(options?: { preserveSelectedNodeId?: string | null; preserveActivePageId?: string | null }): Promise<void> {
    const preservedSelectedNodeId = options?.preserveSelectedNodeId ?? selectedNode.value?.nodeId ?? null
    const preservedActivePageId = options?.preserveActivePageId?.trim() ?? ''
    blueprintLoading.value = true
    try {
      await ensureCurrentProjectBlueprintLoaded()
      refreshBlueprintDraftBindings()
      addStatus(`应用 ${projectId.value} 蓝图已就绪`, 'success')
    } catch (error) {
      addStatus(`项目蓝图加载失败: ${String(error)}`, 'error')
    } finally {
      blueprintLoading.value = false
    }

    const snapTree = readBlueprintProjection().tree

    if (preservedSelectedNodeId) {
      const matchedNode = findNodeById(snapTree, preservedSelectedNodeId)
      if (matchedNode) {
        await selectNode(matchedNode)
        return
      }
    }

    if (preservedActivePageId) {
      const matchedNode = findPageNodeByPageId(snapTree, preservedActivePageId)
      if (matchedNode) {
        await selectNode(matchedNode)
        return
      }

      if (setActivePageContext(preservedActivePageId, false)) {
        project.selectNode(null)
        linkProbeInfo.value = null
        return
      }
    }

    if (snapTree.length === 0) {
      project.selectNode(null)
      clearActivePageContext()
      return
    }

    const firstNode = snapTree[0]
    if (firstNode) {
      await selectNode(firstNode)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 节点表单
  // ═══════════════════════════════════════════════════════════

  function loadNodeToForm(node: ProjectBlueprintDomain.ProjectBlueprintTreeNodeData): void {
    const pageId = resolvePageNodePageId(node)
    if (pageId) project.setActivePage(pageId)
    else clearActivePageContext()
    project.selectNode(node.nodeId)
    project.beginBlueprintDraft()
    linkProbeInfo.value = null
  }

  function applyNavChanges(): void {
    if (!selectedNode.value) return
    const dto = project.blueprintDraft
    if (dto) {
      const result = project.applyBlueprintNodeEdit(dto)
      for (const warning of result.warnings) {
        addStatus(warning, 'warning')
      }
    }
  }

  function markBlueprintDirty(): void {
    applyNavChanges()
    scheduleAutoSave()
  }

  function scheduleAutoSave(): void {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveStatus.value = 'pending'
    autoSaveTimer = setTimeout(() => { void doAutoSave() }, AUTO_SAVE_DELAY)
  }

  function cancelAutoSave(): void {
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null }
    if (autoSaveStatus.value === 'pending') autoSaveStatus.value = 'idle'
  }

  async function doAutoSave(): Promise<void> {
    autoSaveTimer = null
    if (!project.readDirtyProjection().blueprintDirty) { autoSaveStatus.value = 'idle'; return }
    if (!selectedNode.value) { autoSaveStatus.value = 'idle'; return }
    autoSaveStatus.value = 'saving'
    try {
      autoSaveStatus.value = await saveNodeChanges() ? 'saved' : 'error'
    } catch {
      autoSaveStatus.value = 'error'
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 保存
  // ═══════════════════════════════════════════════════════════

  async function saveNodeChanges(): Promise<boolean> {
    applyNavChanges()
    if (!selectedNode.value) return false
    const node = selectedNode.value


    blueprintSaving.value = true
    try {
      project.selectNode(node.nodeId)
      await editor.saveSelectedBlueprintNode({ skipReload: true })
      await syncRuntimeNavigationIfDefaultProject()
      addStatus(`节点 ${node.navigation?.title ?? node.capability.name} 已保存`, 'success')
      return true
    } catch (e) {
      addStatus(`节点保存失败: ${String(e)}`, 'error')
      return false
    } finally {
      blueprintSaving.value = false
    }
  }

  function selectPage(pageId: string): void {
    if (!isBackendConfigPage(pageId)) {
      clearActivePageContext()
      addStatus(`页面 ${pageId} 为宿主页面，不提供后端配置文件编辑`, 'warning')
      return
    }
    setActivePageContext(pageId, activePageId.value !== pageId)
  }

  async function createPageForSelectedNode(params: { pageId: string; title: string; icon: string }): Promise<boolean> {
    const pageId = params.pageId.trim()
    if (!pageId || !selectedNode.value) return false

    pageIoBusy.value = true
    try {
      await editor.createPageForSelectedNode({
        pageId,
        title: params.title,
        icon: params.icon,
      })

      if (blueprintDraft.navigation) { blueprintDraft.navigation.target = `cfg:${pageId}`; blueprintDraft.navigation.title = params.title; blueprintDraft.navigation.icon = params.icon }
      handlePathChange(`/${pageId}`)

      bumpPageCache(pageId, '__created')
      await editor.selectPage(pageId)
      persistActivePageId(pageId)
      return true
    } catch (e) {
      addStatus(`创建页面失败: ${String(e)}`, 'error')
      return false
    } finally {
      pageIoBusy.value = false
    }
  }

  async function saveCurrentNavScope(): Promise<boolean> {
    if (selectedNode.value) {
      return saveNodeChanges()
    }
    addStatus('未选中节点，无需保存蓝图属性', 'info')
    return true
  }

  async function saveAll(): Promise<void> {
    if (allSaving.value || pageIoBusy.value || blueprintSaving.value) return
    const workspace = currentEditor.value, scope = currentScopeKey()
    const assertCurrent = () => {if (currentEditor.value !== workspace || currentScopeKey() !== scope) throw new Error('保存期间工作区已切换')}
    let stage = '蓝图属性'
    allSaving.value = true; cancelAutoSave()
    try {
      if ((blueprintDirty.value || !hasAnyDirty.value) && !await saveCurrentNavScope()) throw new Error('蓝图属性未保存；后续文件尚未提交')
      assertCurrent(); stage = '工具工作文件'
      const hadFiles = workspace.unconfirmedPageFiles.length > 0 || [...workspace.project.design.pages].some(page => page.getDirtyFileNames().length > 0)
      await workspace.saveDirtyPageFiles(); assertCurrent()
      if (hadFiles) addStatus('工具工作文件本轮提交已确认', 'success')
      stage = '场景定义'
      await workspace.saveDirtyScenarioDefinitions(); assertCurrent()
      scenarioDefinitionRevision.value++
      addStatus(hasAnyDirty.value ? '本轮提交已确认，仍有新修改待保存' : '全部保存已确认', hasAnyDirty.value ? 'info' : 'success')
    } catch (cause) {
      if (currentEditor.value === workspace && currentScopeKey() === scope) addStatus(
        `${stage}保存未完成：${String(cause)}。已确认部分保留，未确认修改仍待处理${stage === '场景定义' ? '' : '；后续场景定义尚未提交'}${workspace.unconfirmedPageFiles.length ? '；再次保存先核验原工具提交' : ''}`, 'error')
    } finally {allSaving.value = false; scenarioDefinitionRevision.value++}
  }

  // ═══════════════════════════════════════════════════════════
  // 节点选中
  // ═══════════════════════════════════════════════════════════

  async function selectNode(node: ProjectBlueprintDomain.ProjectBlueprintTreeNodeData): Promise<void> {
    cancelAutoSave()
    if (blueprintDirty.value && selectedNode.value) void saveNodeChanges()
    if (selectedNode.value?.nodeId !== node.nodeId || selectedNode.value.dataSpace?.scenarioId !== node.dataSpace?.scenarioId) {
      scenarioLoad++; installScenarioDocument(null); pageDataError.value = null
    }
    loadNodeToForm(node)
    const pageId = resolvePageNodePageId(node)
    if (pageId && isConfigNodeKind(ProjectBlueprintDomain.projectNodeDeliveryKind(node))) {
      try { await editor.selectPage(pageId); persistActivePageId(pageId) }
      catch(error) { addStatus(`工具 ${pageId} 文件加载失败: ${String(error)}`, 'error') }
    }
  }

  function handlePathChange(val: string): void {
    markBlueprintDirty()
    syncActivePageContextByPath(val)
  }

  // ═══════════════════════════════════════════════════════════
  // 链接探测
  // ═══════════════════════════════════════════════════════════

  function onLinkUrlChanged(): void {
    markBlueprintDirty()
    linkProbeInfo.value = null
  }

  async function probeLinkTarget(): Promise<void> {
    const url = (blueprintDraft.navigation?.target ?? '').trim()
    if (!url) {
      addStatus('请先输入超链接地址', 'warning')
      return
    }

    linkProbeLoading.value = true
    try {
      const result = await editor.probeLink(url)
      const embeddable = result.embeddable
      const reason = result.reason

      if (blueprintDraft.navigation) blueprintDraft.navigation.openMode = embeddable ? 'embedded' : 'new-window'
      linkProbeInfo.value = { embeddable, reason }
      markBlueprintDirty()

      addStatus(
        embeddable
          ? '链接检测通过：已标记为 iframe 渲染'
          : '链接检测提示禁止嵌入：已标记为新标签打开',
        embeddable ? 'success' : 'warning',
      )
    } catch (e) {
      addStatus(`链接检测失败: ${String(e)}`, 'warning')
    } finally {
      linkProbeLoading.value = false
    }
  }

  async function listReferenceProjects(): Promise<ProjectBlueprintDomain.ProjectSummary[]> {
    return editor.listReferenceProjects()
  }

  async function listReferenceProjectPages(targetProjectId: string): Promise<ProjectBlueprintDomain.ProjectPageReference[]> {
    return editor.listReferenceProjectPages(targetProjectId)
  }

  // ═══════════════════════════════════════════════════════════
  // 树增删
  // ═══════════════════════════════════════════════════════════

  function addRootNode(): void {
    const node: ProjectBlueprintDomain.ProjectBlueprintTreeNodeData = { nodeId: crypto.randomUUID(), parentNodeId: project.rootNode?.id ?? '', projectId: projectId.value, kind: 'module', capability: {name: '新模块'}, navigation: {title:'新模块',icon:'FolderOpened',order:0,placement:'left',publishInMenu:true,showChildren:true,beginGroup:false},source:{},children:[] }
    void editor.addBlueprintNode({ node }).then(
      async () => {
        await syncRuntimeNavigationIfDefaultProject()
        addStatus('已添加根模块', 'info')
      },
      (e: unknown) => {
        void editor.loadBlueprint()
        addStatus(`添加模块失败: ${String(e)}`, 'error')
      },
    )
  }

  async function addChildNode(parent: ProjectBlueprintDomain.ProjectBlueprintTreeNodeData): Promise<void> {
    const pageId = normalizePageIdFromPath(`/child-${crypto.randomUUID().slice(0, 8)}`)
    try {
      await editor.createMountedPage({
        pageId,
        parentId: parent.nodeId,
        rollbackPageOnBlueprintFailure: true,
      })
      await syncRuntimeNavigationIfDefaultProject()
      addStatus(`已在 ${parent.navigation?.title ?? parent.capability.name} 下添加子节点`, 'info')
    } catch (e) {
      addStatus(`添加节点失败: ${String(e)}`, 'error')
    }
  }

  function removeNodeFromTree(_node: { parent: { data: ProjectBlueprintDomain.ProjectBlueprintTreeNodeData } }, data: ProjectBlueprintDomain.ProjectBlueprintTreeNodeData): void {

    const pageId = resolvePageNodePageId(data)
    const shouldRemoveMountedPage = pageId.length > 0 && isConfigNodeKind(ProjectBlueprintDomain.projectNodeDeliveryKind(data))
    const deletePromise = shouldRemoveMountedPage
      ? editor.removeMountedPage({ pageId, nodeId: data.nodeId })
      : editor.deleteNode(data.nodeId)
    void deletePromise.then(
      () => {
        if (selectedNode.value?.nodeId === data.nodeId) {
          project.selectNode(null)
          clearActivePageContext()
        }
      if (shouldRemoveMountedPage) {
          bumpPageCache(pageId, '__deleted')
        }
        void syncRuntimeNavigationIfDefaultProject()
        addStatus(`已删除 ${data.navigation?.title ?? data.capability.name}`, 'info')
      },
      (e: unknown) => {
        addStatus(`删除节点失败: ${String(e)}`, 'error')
      },
    )
  }

  async function moveNodeInTree(data: ProjectBlueprintDomain.ProjectBlueprintTreeNodeData): Promise<void> {
    const location: ProjectBlueprintDomain.ProjectBlueprintTreeNodeLocation | null = findNodeLocation(treeData.value, data.nodeId)
    if (!location) return
    blueprintSaving.value = true
    try {
      await editor.moveMountedPage(data.nodeId, location.parentId, location.index)
      await syncRuntimeNavigationIfDefaultProject()
      addStatus(`节点 ${data.navigation?.title ?? data.capability.name} 已移动`, 'success')
    } catch (e) {
      addStatus(`节点移动失败: ${String(e)}`, 'error')
      await loadBlueprint({ preserveSelectedNodeId: data.nodeId, preserveActivePageId: activePageId.value })
    } finally {
      blueprintSaving.value = false
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 上下文编辑
  // ═══════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════════════════════

  async function initialize(): Promise<void> {
    await loadEditableProjects()
    const persistedActivePageId = readPersistedActivePageId()
    await loadBlueprint({ preserveActivePageId: persistedActivePageId })
  }

  return {
    // 项目蓝图树
    get projectId(): string { return projectId.value },
    projectPicker,
    editableProjects,
    projectOptionsLoading,
    treeData,
    blueprintLoading,
    blueprintSaving,
    blueprintDirty,
    selectedNode,

    // 编辑表单（blueprintDraft 代理到 project.blueprintDraft 工作副本）
    blueprintDraft,

    // 空蓝图状态
    blueprintEmpty,

    // 页面 4 文件
    pageFileNames,
    activePageId,
    pageIoBusy,
    allSaving,
    projectRevision,
    pageDataError,
    scenarioDefinitionDocument,
    scenarioDefinitionRevision,
    loadSelectedScenarioViews,
    createSelectedScenarioViews,
    writeScenarioViewText,
    saveScenarioViewText,
    listScenarioVersions,
    previewScenarioVersion,
    createScenarioVersion,
    restoreScenarioVersion,
    pageDataDirty,

    // 页面列表
    pageList,

    // 状态
    statusMessages,
    linkProbeLoading,
    linkProbeInfo,
    autoSaveStatus,
    pageDesignAiRunning,
    aiToolApprovalPending,

    // 项目策划文档导入
    projectPlanningDocumentImportDialogVisible,
    projectPlanningDocumentUploading,
    projectPlanningAiRunning,
    projectPlanningDocumentFileName,
    projectPlanningAttachmentRef,
    projectPlanningAiTimeline,

    // 计算属性
    hasAnyFileDirty,
    hasAnyDirty,

    editor,
    project,

    // 方法
    addStatus,
    loadEditableProjects,
    openEditingProject,
    openProjectPickerScope,
    loadBlueprint,
    clearActivePageContext,
    selectPage,
    createPageForSelectedNode,
    onLinkUrlChanged,
    probeLinkTarget,
    loadNodeToForm,
    markBlueprintDirty,
    saveNodeChanges,
    saveAll,
    runPageDesignAi,
    approveAiTool,
    rejectAiTool,
    abortAiTool,
    selectNode,
    handlePathChange,
    addRootNode,
    addChildNode,
    listReferenceProjects,
    listReferenceProjectPages,
    removeNodeFromTree,
    moveNodeInTree,
    openProjectPlanningDocumentImportDialog,
    closeProjectPlanningDocumentImportDialog,
    handleProjectPlanningDocumentFileSelected,
    runProjectPlanningDocumentImportAi,
    initialize,
  }
}

/** Dev State 的运行状态。 */
export type DevState = ReturnType<typeof useDevState>
