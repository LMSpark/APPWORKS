/**
 * @module @spark-appworks/spark-project-model:project/project-workspace
 * 职责：提供项目模型和页面配置域中的 project workspace 能力，支撑 navigation、page content、project session 或远程 IO。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */
/**
 * ProjectWorkspace — 持有 ProjectBlueprint 并提交 IO（设计即编辑）。
 * 领域状态、事件与投影属于 ProjectBlueprint；谁 new 谁负责生命周期。
 */

import { PageFileApi, type ProjectPageFileGateway } from '../io/page-file-api'
import { PageContentLoader } from '../io/page-content-loader'
import type {
  ProjectBlueprintTreeData,
  ProjectBlueprintTreeNodeData,
  ProjectBlueprintNodePatch,
} from '../blueprint/project-blueprint-node'
import type { ProjectBlueprintGateway } from '../io/project-blueprint-client'
import type { PageFileCreateOptions, PageToolFileVersionSummary } from '../page/page-file'
import {
  assertNonEmptyPageId,
  PAGE_TOOL_FILE_NAMES,
  pageFilePath,
  type PageToolFileName,
} from '../page/page-file'
import type { PageTool } from '../page/page-tool'
import { ProjectBlueprint } from './project-blueprint'
import { ScenarioViewFile } from '../scenario/scenario-view-file'
import {
  ProjectReferenceClient,
  type ProjectReferenceGateway,
  type ProjectPageReference,
  type ProjectSummary,
} from '../io/project-reference-client'
import {
  findConfigNodeByPageId,
  normalizeProjectBlueprintTreeNodeData,
  normalizeBlueprintTree,
  resolvePageNodePageId,
} from '../blueprint/project-blueprint-tree'
import {
  createBlueprintNodeDraft,
  createBlueprintNodePatch,
  type BlueprintNodeDraft,
} from '../blueprint/project-blueprint-edit'

/** Project Page Load Options 的调用配置。 */
export type ProjectPageLoadOptions = {
    /** force Reload 字段。 */
forceReload?: boolean
}

/** 为当前正式节点创建明确pageId工具并绑定cfg目标。 */
export type CreatePageForSelectedNodeParams = {
    /** page Id 标识。 */
pageId: string
    /** 显示标题。 */
title?: string
    /** icon 字段。 */
icon?: string
}

/** 工具创建与蓝图节点挂载命令；补偿删除仅在明确启用时执行。 */
type CreateMountedPageParams = {
    /** page Id 标识。 */
pageId: string
    /** 显示标题。 */
title?: string
    /** icon 字段。 */
icon?: string
    /** node 字段。 */
node?: ProjectBlueprintTreeNodeData
    /** parent Id 标识。 */
parentId?: string | null
    /** index 字段。 */
index?: number
    /** 蓝图节点挂载失败时是否补偿删除已创建的页面文件。 */
rollbackPageOnBlueprintFailure?: boolean
}

/** 明确工具身份的三文件创建请求。 */
type CreatePageFilesParams = PageFileCreateOptions & {
    /** page Id 标识。 */
pageId: string
}

/** Page Node Create Mounted Result 的返回结果。 */
export type PageNodeCreateMountedResult = {
    /** 当前页码。 */
page: Record<string, unknown>
    /** node 字段。 */
node: ProjectBlueprintTreeNodeData
}

/** Page Node Remove Mounted Result 的返回结果。 */
export type PageNodeRemoveMountedResult = {
    /** deleted Node 字段。 */
deletedNode: ProjectBlueprintTreeNodeData | null
    /** deleted Files 字段。 */
deletedFiles: boolean
}

/** 节点解绑及是否删除工具文件的明确命令。 */
type RemoveMountedPageParams = {
    /** page Id 标识。 */
pageId: string
    /** node Id 标识。 */
nodeId?: string
    /** delete Files 字段。 */
deleteFiles?: boolean
}

/** 按不透明请求scope读写共享场景文件；null仅表示宿主已确认文件不存在。 */
type ScenarioViewGateway = Readonly<{
  readScope: () => string
  readText: (scenarioId: string) => Promise<string | null>
  writeText?: (scenarioId: string, text: string) => Promise<void>
  listVersions?: (scenarioId: string) => Promise<PageToolFileVersionSummary[]>
  readVersion?: (scenarioId: string, version: number) => Promise<string>
  createVersion?: (scenarioId: string, text: string) => Promise<PageToolFileVersionSummary>
  restoreVersion?: (scenarioId: string, version: number) => Promise<void>
}>
/** 读取明确场景文件，强制重载不得覆盖dirty。 */
type ScenarioViewLoadCommand = Readonly<{ scenarioId: string; forceReload?: boolean }>
/** 用户显式新建的单场景合法文本，远端必须确认不存在。 */
type ScenarioViewCreateCommand = Readonly<{ scenarioId: string; text: string; assertCurrent?: () => void }>
/** 保存已持有场景owner，写前比较基线并写后真实读回。 */
type ScenarioViewSaveCommand = Readonly<{ scenarioId: string; assertCurrent?: () => void }>
type ScenarioViewAdoptCommand = Readonly<{ scenarioId: string; expectedRevision: number; previewText: string | null }>

/** 场景编号快照操作，版本为非负安全整数，不是工具发布VersionId。 */
type ScenarioViewVersionCommand = Readonly<{ scenarioId: string; version: number }>
/** 用户预览并明确选择的恢复动作，执行前必须再次确认快照原文。 */
type ScenarioViewRestoreCommand = ScenarioViewVersionCommand & Readonly<{ previewText: string }>
/** 版本操作捕获的场景owner、请求scope和工作文本基线。 */
type ScenarioViewVersionContext = Readonly<{ scenarioId: string; scope: string; file: ScenarioViewFile; text: string; key: string }>

/** Project Workspace Options 的调用配置。 */
export type ProjectWorkspaceOptions = {
    /** project Id 标识。 */
projectId: string
    /** 页面三文件语义网关。 */
pageFiles: ProjectPageFileGateway
    /** 项目蓝图语义网关。 */
blueprint: ProjectBlueprintGateway
    /** 跨项目引用语义网关。 */
projectReferences?: ProjectReferenceGateway
  /** 场景文件 IO 与不透明请求代次；缺少能力时明确拒绝，不回退页面文件。 */
  scenarioViews?: ScenarioViewGateway
}

function isProjectPageLoadOptions(value: unknown): value is ProjectPageLoadOptions {
  return value !== null && typeof value === 'object'
}

/**
 * 项目 IO 编排层：将 ProjectBlueprint 的操作委托到远端 API。
 */
export class ProjectWorkspace {
    /** project 字段。 */
readonly project: ProjectBlueprint
  private readonly projectReferenceClient: ProjectReferenceClient | null
  private readonly blueprintGateway: ProjectBlueprintGateway
  private readonly fileApi: PageFileApi
  private readonly getContentLoader: () => PageContentLoader
  private readonly scenarioGateway: ScenarioViewGateway | undefined
  private scenarioScope: string | undefined
  private readonly scenarioFiles = new Map<string, ScenarioViewFile>()
  private readonly scenarioLoads = new Map<string, Promise<ScenarioViewFile>>()
  private readonly scenarioSaves = new Set<string>()
  /** 固定项目身份与真实IO能力，持有场景scope缓存并编排可验证保存。 */

constructor(options: ProjectWorkspaceOptions) {
    const fileApi = new PageFileApi(options.pageFiles)
    const projectReferenceClient = options.projectReferences === undefined
      ? undefined
      : new ProjectReferenceClient(options.projectReferences)
    const pageContentLoader = new PageContentLoader({
      projectId: options.projectId,
      readPageFile: options.pageFiles.readPageFile,
    })
    this.project = new ProjectBlueprint({ projectId: options.projectId })
    this.blueprintGateway = options.blueprint
    this.projectReferenceClient = projectReferenceClient ?? null
    this.fileApi = fileApi
    this.getContentLoader = () => pageContentLoader
    this.scenarioGateway = options.scenarioViews
  }

  public getScenarioViews(scenarioId: string): ScenarioViewFile | null {
    this.currentScenarioScope()
    return this.scenarioFiles.get(this.requireScenarioId(scenarioId)) ?? null
  }

  public async loadScenarioViews(command: ScenarioViewLoadCommand): Promise<ScenarioViewFile> {
    const scenarioId = this.requireScenarioId(command.scenarioId)
    const scope = this.currentScenarioScope()
    const cached = this.scenarioFiles.get(scenarioId)
    if (cached !== undefined && command.forceReload !== true) {
      await Promise.resolve()
      this.assertScenarioScope(scope)
      return cached
    }
    if (this.scenarioSaves.has(JSON.stringify([scope, scenarioId]))) throw new Error('SCENARIO_VIEW_SAVE_PENDING: 该场景正在保存')
    if (cached?.isDirty === true) throw new Error('SCENARIO_VIEW_UNSAVED: 场景配置有未保存修改')
    const pending = this.scenarioLoads.get(scenarioId)
    if (pending !== undefined) {
      const file = await pending
      this.assertScenarioScope(scope)
      return file
    }
    const loading = this.readScenarioViews(scenarioId, scope).finally(() => {
      if (this.scenarioLoads.get(scenarioId) === loading) this.scenarioLoads.delete(scenarioId)
    })
    this.scenarioLoads.set(scenarioId, loading)
    const file = await loading
    this.assertScenarioScope(scope)
    return file
  }

  public async createScenarioViews(command: ScenarioViewCreateCommand): Promise<ScenarioViewFile> {
    const scenarioId = this.requireScenarioId(command.scenarioId)
    const scope = this.currentScenarioScope()
    const file = ScenarioViewFile.createDraft(scenarioId, command.text)
    if (this.scenarioFiles.has(scenarioId) || this.scenarioLoads.has(scenarioId)) throw new Error('SCENARIO_VIEW_EXISTS: 场景文件已加载或正在加载')
    const remote = await this.requireScenarioGateway().readText(scenarioId)
    this.assertScenarioScope(scope)
    command.assertCurrent?.()
    if (remote !== null || this.scenarioFiles.has(scenarioId) || this.scenarioLoads.has(scenarioId)) throw new Error('SCENARIO_VIEW_EXISTS: 场景文件已存在，请加载现有文件')
    this.scenarioFiles.set(scenarioId, file)
    return file
  }

  private async readScenarioViews(scenarioId: string, scope: string): Promise<ScenarioViewFile> {
    const text = await this.requireScenarioGateway().readText(scenarioId)
    this.assertScenarioScope(scope)
    if (text === null) throw new Error('SCENARIO_VIEW_FILE_MISSING: 场景视图文件不存在，请显式新建')
    const current = this.scenarioFiles.get(scenarioId)
    if (current?.isDirty === true) throw new Error('SCENARIO_VIEW_UNSAVED: 装载期间产生未保存修改')
    const file = current ?? new ScenarioViewFile(scenarioId, text)
    if (current !== undefined) file.loadText(text)
    this.scenarioFiles.set(scenarioId, file)
    return file
  }

  /** 写前比较与回读只能检测冲突；后端没有 CAS，不能承诺原子并发保护。 */
  public get dirtyScenarioIds(): string[] { return [...this.scenarioFiles.values()].filter(file=>file.isDirty).map(file=>file.scenarioId) }

  public async saveScenarioViews(command: ScenarioViewSaveCommand): Promise<void> {
    const scenarioId = this.requireScenarioId(command.scenarioId)
    const scope = this.currentScenarioScope()
    const file = this.scenarioFiles.get(scenarioId)
    if (file === undefined) throw new Error('场景视图文件尚未加载')
    const gateway = this.requireScenarioGateway()
    const write = gateway.writeText
    if (write === undefined) throw new Error('当前平台未提供场景视图文件保存能力')
    const key = JSON.stringify([scope, scenarioId])
    if (this.scenarioSaves.has(key)) throw new Error('SCENARIO_VIEW_SAVE_PENDING: 该场景正在保存')
    if (file.saveStatus !== 'idle') throw new Error('SCENARIO_VIEW_SAVE_PENDING: 须先核验上次保存')
    this.scenarioSaves.add(key)
    const submitted = file.getText()
    let dispatched = false
    try {
      const preimage = await gateway.readText(scenarioId)
      this.assertScenarioScope(scope)
      if (preimage !== (file.isPersisted ? file.savedText : null)) throw new Error('SCENARIO_VIEW_CONFLICT: 远端场景配置已改变')
      command.assertCurrent?.()
      file.beginSave(submitted, preimage)
      dispatched = true
      await write(scenarioId, submitted)
      this.assertScenarioScope(scope)
      const readback = await gateway.readText(scenarioId)
      this.assertScenarioScope(scope)
      if (readback !== submitted) throw new Error('SCENARIO_VIEW_SAVE_UNCONFIRMED: 写后原文回读不一致')
      file.confirmSubmitted()
    } catch (error) {
      if (dispatched) file.markSaveUnknownIfPending()
      throw error
    } finally {
      this.scenarioSaves.delete(key)
    }
  }

  public async verifyScenarioViews(command: ScenarioViewSaveCommand): Promise<'confirmed' | 'not-applied'> {
    const scenarioId = this.requireScenarioId(command.scenarioId)
    const scope = this.currentScenarioScope()
    const file = this.scenarioFiles.get(scenarioId)
    if (file?.saveStatus !== 'unknown' || !file.submission) throw new Error('SCENARIO_VIEW_SAVE_STATE: 无未知提交')
    if (this.scenarioSaves.has(JSON.stringify([scope, scenarioId]))) throw new Error('SCENARIO_VIEW_SAVE_PENDING: 场景正在写入')
    const submission = file.submission
    const remote = await this.requireScenarioGateway().readText(scenarioId)
    this.assertScenarioScope(scope)
    if (this.scenarioFiles.get(scenarioId) !== file || file.submission !== submission) throw new Error('SCENARIO_VIEW_SAVE_STATE: 核验目标已变化')
    if (remote === submission.text) { file.confirmSubmitted(); return 'confirmed' }
    if (remote === submission.baseline) { file.confirmNotApplied(); return 'not-applied' }
    throw new Error('SCENARIO_VIEW_CONFLICT: 远端与提交文本及写前基线均不一致')
  }

  public async previewScenarioViewsRemote(command: ScenarioViewSaveCommand): Promise<string | null> {
    const scenarioId = this.requireScenarioId(command.scenarioId)
    const scope = this.currentScenarioScope()
    const remote = await this.requireScenarioGateway().readText(scenarioId)
    this.assertScenarioScope(scope)
    if (remote !== null) new ScenarioViewFile(scenarioId, remote)
    return remote
  }

  public async adoptScenarioViews(command: ScenarioViewAdoptCommand): Promise<void> {
    const scenarioId = this.requireScenarioId(command.scenarioId)
    const scope = this.currentScenarioScope()
    const file = this.scenarioFiles.get(scenarioId)
    if (!file) throw new Error('SCENARIO_VIEW_FILE_MISSING: 场景文件尚未加载')
    if (file.saveStatus === 'pending' || this.scenarioSaves.has(JSON.stringify([scope, scenarioId]))) throw new Error('SCENARIO_VIEW_SAVE_PENDING: 场景正在写入')
    if (file.revision !== command.expectedRevision) throw new Error('SCENARIO_VIEW_DRAFT_STALE: 本地配置已改变')
    const remote = await this.requireScenarioGateway().readText(scenarioId)
    this.assertScenarioScope(scope)
    if (this.scenarioFiles.get(scenarioId) !== file || file.revision !== command.expectedRevision) throw new Error('SCENARIO_VIEW_DRAFT_STALE: 接受远端期间配置已改变')
    if (remote !== command.previewText) throw new Error('SCENARIO_VIEW_PREVIEW_CHANGED: 远端配置与已预览原文不一致')
    if (remote === null) { file.invalidate(); this.scenarioFiles.delete(scenarioId); return }
    file.loadText(remote)
  }

  /** 列出真实N__pagedata.json快照，编号不参与页面工具的发布引用。 */
  public async listScenarioVersions(command: ScenarioViewSaveCommand): Promise<PageToolFileVersionSummary[]> {
    const scenarioId = this.requireScenarioId(command.scenarioId)
    const scope = this.currentScenarioScope()
    const list = this.requireScenarioGateway().listVersions
    if (list === undefined) throw new Error('当前平台未提供场景版本读取能力')
    const versions = await list(scenarioId)
    this.assertScenarioScope(scope)
    return versions
  }

  /** 读取并校验用户将要恢复的单场景快照，不改变工作文件或本地owner。 */
  public async previewScenarioVersion(command: ScenarioViewVersionCommand): Promise<string> {
    this.assertScenarioVersion(command.version)
    const context = this.scenarioVersionContext(command.scenarioId)
    const read = this.requireScenarioGateway().readVersion
    if (read === undefined) throw new Error('当前平台未提供场景版本预览能力')
    const text = await read(context.scenarioId, command.version)
    this.assertScenarioVersionContext(context)
    new ScenarioViewFile(context.scenarioId, text)
    return text
  }

  /** 仅为真实已保存且干净的工作文件建立快照，并核对快照原文。 */
  public async createScenarioVersion(command: ScenarioViewSaveCommand): Promise<void> {
    const context = this.scenarioVersionContext(command.scenarioId)
    this.assertScenarioVersionContext(context, true)
    const gateway = this.requireScenarioGateway()
    const create = gateway.createVersion
    const read = gateway.readVersion
    if (create === undefined || read === undefined) throw new Error('当前平台未提供场景版本创建及确认能力')
    if (this.scenarioSaves.has(context.key)) throw new Error('SCENARIO_VIEW_SAVE_PENDING: 场景正在写入')
    this.scenarioSaves.add(context.key)
    try {
      const baseline = await gateway.readText(context.scenarioId)
      this.assertScenarioVersionContext(context, true)
      if (baseline !== context.text) throw new Error('SCENARIO_VIEW_CONFLICT: 工作文件已改变')
      const summary = await create(context.scenarioId, context.text)
      this.assertScenarioVersionContext(context, true)
      this.assertScenarioVersion(summary.version)
      if (summary.fileName !== `${summary.version}__pagedata.json`) throw new Error('SCENARIO_VIEW_VERSION_UNCONFIRMED: 快照身份错误')
      const snapshot = await read(context.scenarioId, summary.version)
      this.assertScenarioVersionContext(context, true)
      if (snapshot !== context.text) throw new Error('SCENARIO_VIEW_VERSION_UNCONFIRMED: 快照回读原文不一致')
    } finally { this.scenarioSaves.delete(context.key) }
  }

  /** 按已预览快照显式恢复；dirty或等待期间的新编辑均不得被远端回执覆盖。 */
  public async restoreScenarioVersion(command: ScenarioViewRestoreCommand): Promise<void> {
    this.assertScenarioVersion(command.version)
    const context = this.scenarioVersionContext(command.scenarioId)
    this.assertScenarioVersionContext(context, true)
    const gateway = this.requireScenarioGateway()
    const read = gateway.readVersion
    const restore = gateway.restoreVersion
    if (read === undefined || restore === undefined) throw new Error('当前平台未提供场景版本恢复及预览能力')
    if (this.scenarioSaves.has(context.key)) throw new Error('SCENARIO_VIEW_SAVE_PENDING: 场景正在写入')
    this.scenarioSaves.add(context.key)
    try {
      const snapshot = await read(context.scenarioId, command.version)
      this.assertScenarioVersionContext(context, true)
      new ScenarioViewFile(context.scenarioId, snapshot)
      if (snapshot !== command.previewText) throw new Error('SCENARIO_VIEW_PREVIEW_CHANGED: 快照与已预览原文不一致')
      const baseline = await gateway.readText(context.scenarioId)
      this.assertScenarioVersionContext(context, true)
      if (baseline !== context.text) throw new Error('SCENARIO_VIEW_CONFLICT: 工作文件已改变')
      await restore(context.scenarioId, command.version)
      this.assertScenarioVersionContext(context, true)
      const readback = await gateway.readText(context.scenarioId)
      this.assertScenarioVersionContext(context, true)
      if (readback !== snapshot) throw new Error('SCENARIO_VIEW_RESTORE_UNCONFIRMED: 恢复工作文件回读不一致')
      context.file.loadText(readback)
    } finally { this.scenarioSaves.delete(context.key) }
  }

  private scenarioVersionContext(value: string): ScenarioViewVersionContext {
    const scenarioId = this.requireScenarioId(value)
    const scope = this.currentScenarioScope()
    const file = this.scenarioFiles.get(scenarioId)
    if (file === undefined) throw new Error('场景视图文件尚未加载')
    return { scenarioId, scope, file, text: file.getText(), key: JSON.stringify([scope, scenarioId]) }
  }

  private assertScenarioVersionContext(context: ScenarioViewVersionContext, requireClean = false): void {
    this.assertScenarioScope(context.scope)
    if (this.scenarioFiles.get(context.scenarioId) !== context.file) throw new Error('SCENARIO_VIEW_OWNER_CHANGED: 场景owner已改变')
    if (context.file.getText() !== context.text) throw new Error('SCENARIO_VIEW_EDIT_DURING_VERSION: 版本操作期间已发生编辑')
    if (requireClean && (context.file.isDirty || !context.file.isPersisted)) throw new Error('SCENARIO_VIEW_UNSAVED: 场景文件未持久化或有未保存编辑')
  }

  private assertScenarioVersion(version: number): void {
    if (!Number.isSafeInteger(version) || version < 0) throw new Error('场景版本必须为非负安全整数')
  }

  private requireScenarioId(scenarioId: string): string {
    const id = scenarioId.trim()
    if (!id) throw new Error('scenarioId 不能为空')
    return id
  }

  private requireScenarioGateway(): ScenarioViewGateway {
    if (this.scenarioGateway === undefined) throw new Error('当前平台未提供场景视图文件 IO 能力')
    return this.scenarioGateway
  }

  private currentScenarioScope(): string {
    const scope = this.requireScenarioGateway().readScope()
    if (!scope.trim()) throw new Error('SCENARIO_VIEW_SCOPE_STALE: 场景文件缺少有效请求代次')
    if (this.scenarioScope !== scope) {
      this.scenarioFiles.clear()
      this.scenarioLoads.clear()
      this.scenarioScope = scope
    }
    return scope
  }

  private assertScenarioScope(scope: string): void {
    if (this.currentScenarioScope() !== scope) throw new Error('SCENARIO_VIEW_SCOPE_STALE: 场景文件所属请求代次已失效')
  }

  public getActivePageTool(): PageTool | null { return this.project.getActivePage() }
  public async loadPageTool(pageId: string, options?: ProjectPageLoadOptions): Promise<PageTool> { const tool=this.project.openPageDesign(pageId); await this.loadPage(tool,options); return tool }


    /** 加载项目蓝图。 */
async loadBlueprint(): Promise<ProjectBlueprintTreeData> {
    return this.reloadBlueprint()
  }

ingestBlueprintTree(
    root: ProjectBlueprintTreeData,
    options?: { selectedNodeId?: string | null },
  ): ProjectBlueprintTreeData {
    return this.project.replaceBlueprintTree(root, {
      selectedNodeId: options?.selectedNodeId ?? null,
    })
  }

  /** 按指定 pageId 选择并加载页面文件。 */
  async selectPage(pageId: string, options?: ProjectPageLoadOptions): Promise<void>
  /** 按当前项目蓝图选中节点选择并加载页面文件。 */
  async selectPage(options?: ProjectPageLoadOptions): Promise<void>
  async selectPage(
    pageIdOrOptions?: string | ProjectPageLoadOptions,
    maybeOptions?: ProjectPageLoadOptions,
  ): Promise<void> {
    const explicitPageId = typeof pageIdOrOptions === 'string'
      ? pageIdOrOptions.trim()
      : ''
    const options = typeof pageIdOrOptions === 'string'
      ? maybeOptions
      : (isProjectPageLoadOptions(pageIdOrOptions) ? pageIdOrOptions : undefined)
    const pageId = explicitPageId || this.resolveSelectedPageId()
    if (!pageId) {
      throw new Error('pageId 不能为空，无法加载页面')
    }

    const page = this.project.openPageDesign(pageId)
    this.project.setActivePage(pageId)
    const pageNodeOptions: { forceReload?: boolean } = {}
    if (options?.forceReload === true) pageNodeOptions.forceReload = true
    await this.loadPage(page, pageNodeOptions)
    this.project.markPageLoadedChanged(page.pageId, true)
  }

    /** 保存 Project Layout。 */
async saveProjectLayout(options?: { skipReload?: boolean }): Promise<void> {
    const root = this.project.rootNode
    if (!root) throw new Error('项目蓝图根节点未加载')
    if (root.id === `project-blueprint:${this.project.projectId}`) throw new Error('合成蓝图根仅供展示，不能作为持久资产保存')
    const { patch } = createBlueprintNodePatch(createBlueprintNodeDraft(root.toNodeData()))
    await this.requireBlueprintOperation('updateNode')(root.id, patch)
    if (options?.skipReload === true) {
      this.project.markBlueprintClean('root')
      return
    }
    await this.reloadBlueprint({ selectedNodeId: this.project.session.session.selectedNodeId })
  }

async saveSelectedBlueprintNode(options?: { skipReload?: boolean }): Promise<void> {
    let nodeId: string
    let patch: ProjectBlueprintNodePatch

    const workingDto = this.project.blueprintDraft
    if (workingDto !== null) {
      const result = createBlueprintNodePatch(workingDto)
      nodeId = workingDto.node.nodeId
      patch = result.patch
    } else {
      const node = this.requireSelectedNode('未选中蓝图节点，无法保存蓝图属性')
      const result = createBlueprintNodePatch(createBlueprintNodeDraft(node))
      nodeId = node.nodeId
      patch = result.patch
    }

    if (nodeId === `project-blueprint:${this.project.projectId}`) throw new Error('合成蓝图根仅供展示，不能作为持久资产保存')
    const treeKey = JSON.stringify(this.project.blueprintTree)
    const draftKey = JSON.stringify(this.project.blueprintDraft)
    const confirmed = await this.requireBlueprintOperation('updateNode')(nodeId, patch)
    if(confirmed.nodeId!==nodeId || this.blueprintGroupKey(createBlueprintNodePatch(createBlueprintNodeDraft(confirmed)).patch)!==this.blueprintGroupKey(patch))throw new Error('PROJECT_BLUEPRINT_SAVE_UNCONFIRMED: 节点保存回读不一致')
    if(JSON.stringify(this.project.blueprintTree)!==treeKey || JSON.stringify(this.project.blueprintDraft)!==draftKey)throw new Error('PROJECT_BLUEPRINT_EDIT_DURING_SAVE: 节点保存期间已发生编辑，保留当前草稿')
    if (options?.skipReload === true) {
      if(workingDto!==null)this.project.applyBlueprintNodeEdit(workingDto)
      this.project.markBlueprintClean('node')
      return
    }
    await this.reloadBlueprint({ selectedNodeId: nodeId })
  }

async ensureActivePageFilesLoaded(options?: ProjectPageLoadOptions): Promise<void> {
    const page = this.requireActivePage('无活动页面，无法加载页面文件')
    const loadOptions: { forceReload?: boolean } = {}
    if (options?.forceReload === true) loadOptions.forceReload = true
    await this.loadPage(page, loadOptions)
    this.project.markPageLoadedChanged(page.pageId, true)
  }

    /** 加载 Page File。 */
async loadPageFile(name: PageToolFileName, options?: ProjectPageLoadOptions): Promise<void> {
    const page = this.requireActivePage('无活动页面，无法加载页面文件')
    await this.loadSinglePageFile(page, name, { forceReload: options?.forceReload === true })
    this.project.markPageFileChanged(page.pageId, name)
  }

    /** 保存 Page File。 */
async savePageFile(name: PageToolFileName): Promise<void> {
    const page = this.requireActivePage('无活动页面，无法保存页面文件')
    await this.savePageFileFromModel(page, name)
    this.project.markPageFileChanged(page.pageId, name)
  }

    /** 保存 Dirty Page Files。 */
async saveDirtyPageFiles(): Promise<void> {
    for(const page of this.project.design.pages) {
      const names=page.getDirtyFileNames()
      await Promise.all(names.map(name=>this.savePageFileFromModel(page,name)))
      for(const name of names)this.project.markPageFileChanged(page.pageId,name)
    }
  }

    /** 保存 All。 */
async saveAll(): Promise<void> {
    await this.saveDirtyPageFiles()
    await this.saveBlueprintFromSession()
    for(const scenarioId of this.dirtyScenarioIds)await this.saveScenarioViews({scenarioId})
  }

async addBlueprintNode(params: { parentId?: string | null; node: ProjectBlueprintTreeNodeData; index?: number }): Promise<ProjectBlueprintTreeNodeData> {
    const node = await this.requireBlueprintOperation('addNode')(params)
    await this.reloadBlueprint({ selectedNodeId: node.nodeId })
    return node
  }

    /** 删除 Node。 */
async deleteNode(nodeId: string): Promise<ProjectBlueprintTreeNodeData | null> {
    const normalized = nodeId.trim()
    if (!normalized) {
      throw new Error('nodeId 不能为空')
    }
    const result = await this.requireBlueprintOperation('deleteNode')(normalized)
    const root = await this.loadBlueprintRoot()
    this.project.replaceBlueprintTree(root)
    return result
  }

    /** 创建 Page For Selected Node。 */
async createPageForSelectedNode(params: CreatePageForSelectedNodeParams): Promise<PageNodeCreateMountedResult> {
    const pageId = params.pageId.trim()
    if (!pageId) {
      throw new Error('pageId 不能为空')
    }
    const selected = this.requireSelectedNode('未选中蓝图节点，无法创建并绑定页面')
    const pageNode = this.openPage(pageId)
    const page = await this.createPageFilesForModel(pageNode, {
      ...(params.title === undefined ? {} : { title: params.title }),
      ...(params.icon === undefined ? {} : { icon: params.icon }),
    })

    const previousEditDto = createBlueprintNodeDraft(selected)
    try {
      const nextEditDto: BlueprintNodeDraft = { node: { ...previousEditDto.node, kind: 'page', navigation: { title: params.title?.trim() ? params.title.trim() : previousEditDto.node.capability.name, order: previousEditDto.node.navigation?.order ?? 0, publishInMenu: true, showChildren: true, beginGroup: false, ...previousEditDto.node.navigation, target: `cfg:${pageId}`, ...(params.icon ? { icon: params.icon } : {}) } } }
      this.project.applyBlueprintNodeEdit(nextEditDto)
      const node = this.project.design.findNodeById(nextEditDto.node.nodeId)
      if (!node) throw new Error(`项目节点未找到: ${nextEditDto.node.nodeId}`)
      await this.saveSelectedBlueprintNode()
      this.project.setActivePage(pageId)
      return { page, node: this.getSelectedNode() ?? node.toNodeData() }
    } catch (error) {
      this.project.applyBlueprintNodeEdit(previousEditDto)
      const node = this.project.design.findNodeById(previousEditDto.node.nodeId)
      if (!node) throw new Error(`项目节点未找到: ${previousEditDto.node.nodeId}`)
      this.project.markBlueprintClean('node')
      await this.deletePageFilesForModel(pageNode)
      throw error
    }
  }

    /** 创建 Mounted Page。 */
async createMountedPage(params: CreateMountedPageParams): Promise<PageNodeCreateMountedResult> {
    const { pageId, ...modelParams } = params
    const pageNode = this.openPage(pageId)
    const page = await this.createPageFilesForModel(pageNode, {
      ...(modelParams.title === undefined ? {} : { title: modelParams.title }),
      ...(modelParams.icon === undefined ? {} : { icon: modelParams.icon }),
    })
    try {
      const node = await this.mountPageBlueprintNode({ pageId, ...modelParams })
      await this.reloadBlueprint({ selectedNodeId: node.nodeId })
      return { page, node }
    } catch (error) {
      if (modelParams.rollbackPageOnBlueprintFailure === true) {
        await this.deletePageFilesForModel(pageNode)
      }
      throw error
    }
  }

    /** 创建 Page Files。 */
async createPageFiles(params: CreatePageFilesParams): Promise<Record<string, unknown>> {
    const { pageId, ...modelParams } = params
    const pageNode = this.openPage(pageId)
    const result = await this.createPageFilesForModel(pageNode, {
      ...(modelParams.title === undefined ? {} : { title: modelParams.title }),
      ...(modelParams.icon === undefined ? {} : { icon: modelParams.icon }),
    })
    this.project.markPageLoadedChanged(pageId, false)
    return result
  }

    /** 删除 Page Files。 */
async deletePageFiles(pageId: string): Promise<void> {
    const normalized = pageId.trim()
    const pageNode = this.project.openPageDesign(normalized)
    await this.deletePageFilesForModel(pageNode)
    if (this.project.getActivePage()?.pageId === normalized) {
      this.project.clearActivePage()
    }
    this.project.closePageDesign(normalized)
    this.project.markPageLoadedChanged(normalized, false)
  }

    /** 删除 Mounted Page。 */
async removeMountedPage(params: RemoveMountedPageParams): Promise<PageNodeRemoveMountedResult> {
    const deletedNode = await this.unmountPageBlueprintNode(params.pageId, params.nodeId)
    const shouldDeleteFiles = params.deleteFiles !== false
    if (shouldDeleteFiles) {
      const pageNode = this.project.openPageDesign(params.pageId)
      await this.deletePageFilesForModel(pageNode)
    }
    if (this.project.getActivePage()?.pageId === params.pageId) {
      this.project.clearActivePage()
    }
    await this.reloadBlueprint({ selectedNodeId: this.project.session.session.selectedNodeId })
    return { deletedNode, deletedFiles: shouldDeleteFiles }
  }

async moveMountedPage(nodeId: string, newParentId: string | null, index: number): Promise<ProjectBlueprintTreeNodeData> {
    if (nodeId.trim().length === 0) {
      throw new Error('nodeId must be a non-empty string')
    }
    const rootId = this.project.blueprintTree.nodeId
    const parentId = newParentId ?? rootId
    const wireParentId = parentId === `project-blueprint:${this.project.projectId}` ? null : parentId
    const result = await this.requireBlueprintOperation('moveNode')(nodeId, wireParentId, index)
    await this.reloadBlueprint({ selectedNodeId: nodeId })
    return result
  }

async listRemotePageVersions(filename: PageToolFileName): Promise<PageToolFileVersionSummary[]> {
    const page = this.project.getActivePage()
    if (!page) return []
    return this.fileApi.listVersions(page.pageId, filename)
  }

async restoreRemotePageVersion(version: number, filename: PageToolFileName): Promise<void> {
    const page = this.requireActivePage('无活动页面，无法恢复版本')
    if (page.getDirtyFileNames().includes(filename)) {
      throw new Error('文件有未保存修改，请先保存或放弃修改再恢复版本')
    }
    const previousText = page.getFileText(filename)
    await this.fileApi.restoreVersion(page.pageId, filename, version)
    if (this.project.getActivePage() !== page) throw new Error('PAGE_TOOL_IDENTITY_CHANGED: 恢复期间活动工具已改变')
    const restored = await this.getContentLoader().loadPageFileContent(page.pageId, filename, { forceReload: true })
    this.clearPageCache(page.pageId, filename)
    if (this.project.getActivePage() !== page || page.getFileText(filename) !== previousText) {
      throw new Error('恢复期间文件已修改，远端恢复已完成，请明确处理未保存修改')
    }
    if (!restored.success) throw new Error(restored.error ?? restored.reason ?? `${filename} 加载失败`)
    page.hydrateFileText(filename, restored.data ?? '')
    this.notifyPageFileChanged(page.pageId, filename)
  }

    /** 创建 Remote Page Version。 */
async createRemotePageVersion(filename: PageToolFileName): Promise<void> {
    const page = this.project.getActivePage()
    if (!page) return
    if (page.getDirtyFileNames().includes(filename)) throw new Error('文件有未保存修改，不能创建远端版本')
    await this.fileApi.createVersion(page.pageId, filename)
    if (this.project.getActivePage() !== page) throw new Error('PAGE_TOOL_IDENTITY_CHANGED: 创建版本期间活动工具已改变')
  }

    /** 删除 Remote Page Version。 */
async deleteRemotePageVersion(version: number, filename: PageToolFileName): Promise<void> {
    const page = this.project.getActivePage()
    if (!page) return
    await this.fileApi.deleteVersion(page.pageId, filename, version)
    if (this.project.getActivePage() !== page) throw new Error('PAGE_TOOL_IDENTITY_CHANGED: 删除版本期间活动工具已改变')
  }

notifyPageFileChanged(
    pageId: string,
    filename: PageToolFileName | '__created' | '__deleted' | '__bulk',
  ): void {
    if (filename === '__created' || filename === '__deleted' || filename === '__bulk') {
      this.project.markPageLoadedChanged(pageId, false)
      return
    }
    this.project.markPageFileChanged(pageId, filename)
  }

async probeLink(url: string): Promise<{ embeddable: boolean; reason: string }> {
    return this.requireBlueprintOperation('probeLink')(url)
  }

async listReferenceProjects(): Promise<ProjectSummary[]> {
    return this.requireProjectReferenceClient().listProjects({
      excludeProjectId: this.project.projectId,
    })
  }

async listReferenceProjectPages(projectId: string): Promise<ProjectPageReference[]> {
    return this.requireProjectReferenceClient().listProjectPages(projectId)
  }

  private async mountPageBlueprintNode(params: CreateMountedPageParams): Promise<ProjectBlueprintTreeNodeData> {
    assertNonEmptyPageId(params.pageId)
    return this.requireBlueprintOperation('addNode')({
      ...(params.parentId === undefined ? {} : { parentId: params.parentId }),
      node: this.defaultMountedPageBlueprintNode(params),
      ...(params.index === undefined ? {} : { index: params.index }),
    })
  }

  private async unmountPageBlueprintNode(pageId: string, nodeId?: string): Promise<ProjectBlueprintTreeNodeData | null> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    const resolvedNodeId = await this.resolveBlueprintNodeId(normalizedPageId, nodeId)
    return this.requireBlueprintOperation('deleteNode')(resolvedNodeId)
  }

  private defaultMountedPageBlueprintNode(params: CreateMountedPageParams): ProjectBlueprintTreeNodeData {
    const pageId = assertNonEmptyPageId(params.pageId)
    const title = params.title?.trim()
    const icon = params.icon?.trim()
    const node = params.node ?? {
      nodeId: crypto.randomUUID(), parentNodeId: params.parentId ?? this.project.rootNode?.id ?? '', projectId: this.project.projectId,
      kind: 'page' as const, capability: { name: title !== undefined && title.length > 0 ? title : pageId }, navigation: { title: title !== undefined && title.length > 0 ? title : pageId, icon: icon !== undefined && icon.length > 0 ? icon : 'Document', target: `cfg:${pageId}`, order: params.index ?? 0, publishInMenu: true, showChildren: true, beginGroup: false }, source: {},
    }
    return normalizeProjectBlueprintTreeNodeData(node)
  }

  private async resolveBlueprintNodeId(pageId: string, nodeId?: string): Promise<string> {
    const explicitNodeId = nodeId?.trim()
    if (explicitNodeId) return explicitNodeId

    const root = await this.loadBlueprintRoot()
    const found = findConfigNodeByPageId(root.children, assertNonEmptyPageId(pageId))
    if (found === null) {
      throw new Error(`project blueprint node not found for pageId: ${pageId}`)
    }
    return found.nodeId
  }

  private resolveSelectedPageId(): string {
    const node = this.requireSelectedNode('未选中蓝图节点，无法加载页面')
    if (!resolvePageNodePageId(node)) {
      throw new Error(`当前选中节点不是可配置页面，种类: ${node.kind}`)
    }
    const pageId = resolvePageNodePageId(node)
    if (!pageId) {
      throw new Error('无法从项目节点解析出 pageId')
    }
    return pageId
  }

  private async saveBlueprintFromSession(): Promise<void> {
    const blueprintDirty = this.project.session.blueprintDirty
    if (!blueprintDirty) return

    if (this.project.session.session.blueprintDirtyScope === 'root') {
      await this.saveBlueprintNodes()
      this.project.markBlueprintClean('root')
      return
    }
    await this.saveSelectedBlueprintNode()
    this.project.markBlueprintClean('node')
  }

  private async reloadBlueprint(options?: { selectedNodeId?: string | null }): Promise<ProjectBlueprintTreeData> {
    const root = await this.loadBlueprintRoot()
    return this.project.replaceBlueprintTree(root, {
      selectedNodeId: options?.selectedNodeId ?? null,
    })
  }

  private async loadPage(page: PageTool, options?: ProjectPageLoadOptions): Promise<void> {
    const forceReload = options?.forceReload === true
    if (page.isLoaded && !forceReload) return
    await Promise.all(
      PAGE_TOOL_FILE_NAMES.map(name => this.loadSinglePageFile(page, name, { forceReload })),
    )
    page.markLoaded()
  }

  private async loadSinglePageFile(
    page: PageTool,
    name: PageToolFileName,
    options?: ProjectPageLoadOptions,
  ): Promise<void> {
    if (page.getDirtyFileNames().includes(name)) throw new Error(`PAGE_TOOL_DIRTY: ${name} 有未保存编辑，不能重载`)
    const baseline = page.getFileText(name)
    const result = await this.getContentLoader().loadPageFileContent(page.pageId, name, {
      forceReload: options?.forceReload === true,
    })
    if (!result.success) {
      throw new Error(result.error ?? result.reason ?? `${name} 加载失败`)
    }
    if (page.getFileText(name) !== baseline || page.getDirtyFileNames().includes(name)) throw new Error(`PAGE_TOOL_EDIT_DURING_LOAD: ${name} 在装载期间发生编辑`)
    page.hydrateFileText(name, result.data ?? '')
  }

  private async createPageFilesForModel(
    page: PageTool,
    options: PageFileCreateOptions = {},
  ): Promise<Record<string, unknown>> {
    const result = await this.fileApi.createFiles({
      pageId: page.pageId,
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.icon === undefined ? {} : { icon: options.icon }),
    })
    this.clearPageCache(page.pageId)
    return result
  }

  private async deletePageFilesForModel(page: PageTool): Promise<void> {
    await this.fileApi.deleteFiles(page.pageId)
    this.clearPageCache(page.pageId)
  }

  private async savePageFileFromModel(page: PageTool, name: PageToolFileName): Promise<void> {
    const submittedText = page.getFileText(name)
    await this.fileApi.saveFileContent(page.pageId, name, submittedText)
    page.markFileSaved(name, submittedText)
    this.clearPageCache(page.pageId, name)
  }

  private clearPageCache(pageId: string, filename?: PageToolFileName): void {
    const normalized = pageId.trim()
    if (!normalized) return
    const loader = this.getContentLoader()
    if (filename !== undefined) {
      loader.clearCache(pageFilePath(normalized, filename))
      return
    }
    loader.clearPageCache(normalized)
  }

  private requireBlueprintOperation<K extends Exclude<keyof ProjectBlueprintGateway, 'loadRoot'>>(name: K): NonNullable<ProjectBlueprintGateway[K]> {
    const operation = this.blueprintGateway[name]
    if (!operation) throw new Error(`当前平台未提供蓝图 ${name} 能力`)
    return operation
  }
  private blueprintGroupKey(value:ProjectBlueprintNodePatch):string {
    const texts=(record:Record<string,unknown>,keys:readonly string[]):Record<string,string>=>{
      const result:Record<string,string>={}
      for(const key of keys){const text=record[key];if(typeof text==='string' && text.trim())result[key]=text.trim()}
      return result
    }
    const capability=texts(value.capability,['name','description','code','ownerId','deliveryStatus'])
    const nav=value.navigation
    const navigationTexts=nav ? texts(nav,['title','icon','target','mobileTarget','placement','openMode','displayMode','horizontalAlignment']) : {}
    const horizontal=navigationTexts['horizontalAlignment']
    if(horizontal)navigationTexts['horizontalAlignment']=horizontal.toLowerCase()
    const navigation=nav ? {...navigationTexts,title:nav.title.trim() || value.capability.name.trim(),order:nav.order,publishInMenu:nav.publishInMenu,showChildren:nav.showChildren,beginGroup:nav.beginGroup} : undefined
    const scenarioId=value.dataSpace?.scenarioId.trim()
    const htmlDescription=value.prototype?.htmlDescription?.trim()
    return JSON.stringify({kind:value.kind,capability,navigation,...(scenarioId ? {dataSpace:{scenarioId}} : {}),...(htmlDescription ? {prototype:{htmlDescription}} : {})})
  }
  private async loadBlueprintRoot(): Promise<ProjectBlueprintTreeData> { return normalizeBlueprintTree(await this.blueprintGateway.loadRoot()) }
  private async saveBlueprintNodes(): Promise<void> {
    const submitted = this.project.blueprintTree
    const submittedKey = JSON.stringify(submitted)
    const server = await this.loadBlueprintRoot()
    const flatten = (root: ProjectBlueprintTreeNodeData): ProjectBlueprintTreeNodeData[] => { const out:ProjectBlueprintTreeNodeData[]=[]; const visit=(node:ProjectBlueprintTreeNodeData,pid:string):void=>{ const {children,...data}=node;out.push({...data,parentNodeId:pid});for(const child of children ?? [])visit(child,node.nodeId) };if(root.nodeId===`project-blueprint:${this.project.projectId}`){for(const child of root.children ?? [])visit(child,'')}else visit(root,'');return out }
    const desired = flatten(submitted)
    const existing = flatten(server)
    const byId = new Map(existing.map(node=>[node.nodeId,node]))
    const desiredIds = new Set(desired.map(node=>node.nodeId))
    for(const node of [...existing].reverse()) if(!desiredIds.has(node.nodeId)) await this.requireBlueprintOperation('deleteNode')(node.nodeId)
    for(const node of desired) {
      const previous=byId.get(node.nodeId)
      const siblings=desired.filter(item=>item.parentNodeId===node.parentNodeId)
      const index=siblings.findIndex(item=>item.nodeId===node.nodeId)
      if(!previous) await this.requireBlueprintOperation('addNode')({parentId:node.parentNodeId || null,node,index})
      else {
        if(node.nodeId!==submitted.nodeId && (previous.parentNodeId!==node.parentNodeId || existing.filter(item=>item.parentNodeId===previous.parentNodeId).findIndex(item=>item.nodeId===node.nodeId)!==index)) await this.requireBlueprintOperation('moveNode')(node.nodeId,node.parentNodeId || null,index)
      }
    }
    const currentById = new Map(flatten(await this.loadBlueprintRoot()).map(node=>[node.nodeId,node]))
    for(const node of desired) {
      const previous=currentById.get(node.nodeId)
      if(!previous)throw new Error(`PROJECT_BLUEPRINT_SAVE_UNCONFIRMED: 节点未持久化 ${node.nodeId}`)
      const {patch}=createBlueprintNodePatch(createBlueprintNodeDraft(node))
      const before=createBlueprintNodePatch(createBlueprintNodeDraft(previous)).patch
      if(this.blueprintGroupKey(before)!==this.blueprintGroupKey(patch))await this.requireBlueprintOperation('updateNode')(node.nodeId,patch)
    }
    const confirmed=await this.loadBlueprintRoot()
    const semantic=(nodes:ProjectBlueprintTreeNodeData[]):string=>JSON.stringify(nodes.map(node=>({nodeId:node.nodeId,parentNodeId:node.parentNodeId,groups:this.blueprintGroupKey(createBlueprintNodePatch(createBlueprintNodeDraft(node)).patch)})))
    if(semantic(flatten(confirmed))!==semantic(desired))throw new Error('PROJECT_BLUEPRINT_SAVE_UNCONFIRMED: 保存后蓝图回读不一致')
    if(JSON.stringify(this.project.blueprintTree)!==submittedKey)throw new Error('PROJECT_BLUEPRINT_EDIT_DURING_SAVE: 保存期间蓝图已修改，保留当前草稿')
    this.project.replaceBlueprintTree(confirmed,{selectedNodeId:this.project.session.session.selectedNodeId})
  }

  private getSelectedNode(): ProjectBlueprintTreeNodeData | null {
    const selectedNodeId = this.project.session.session.selectedNodeId
    if (!selectedNodeId) return null
    return this.project.design.findNodeById(selectedNodeId)?.toNodeData() ?? null
  }

  private requireSelectedNode(message: string): ProjectBlueprintTreeNodeData {
    const node = this.getSelectedNode()
    if (node) return node
    throw new Error(message)
  }

  private requireActivePage(message: string): PageTool {
    const page = this.project.getActivePage()
    if (page) return page
    throw new Error(message)
  }

  private openPage(pageId: string): PageTool {
    const normalized = pageId.trim()
    if (!normalized) throw new Error('pageId 不能为空')
    return this.project.openPageDesign(normalized)
  }

  private requireProjectReferenceClient(): ProjectReferenceClient {
    if (this.projectReferenceClient !== null) return this.projectReferenceClient
    throw new Error('ProjectReferenceClient 未配置，无法读取跨项目引用')
  }
}
