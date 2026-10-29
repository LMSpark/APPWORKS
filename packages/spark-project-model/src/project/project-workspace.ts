/**
 * @module @spark-appworks/spark-project-model:project/project-workspace
 * 职责：提供项目模型和页面配置域中的 project workspace 能力，支撑 navigation、page content、project session 或远程 IO。
 * 边界：不渲染 Vue 组件；定义数据空间由宿主正式装配，业务运行数据不在工作区维护。
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
} from '../blueprint/project-blueprint-node'
import type { ProjectBlueprintGateway } from '../io/project-blueprint-client'
import type { PageToolFileVersionSummary } from '../page/page-file'
import {
  assertNonEmptyPageId,
  type PageToolFileName,
} from '../page/page-file'
import { PageTool } from '../page/page-tool'
import { ProjectBlueprint } from './project-blueprint'
import {ScenarioViewFile, ScenarioViewWriteNotAppliedError, type ScenarioViewSubmission} from '../scenario/scenario-view-file'
import { ScenarioViewConfig } from '../scenario/scenario-view-config'
import type {DataSet} from '@spark-appworks/spark-data'
import {
  ProjectReferenceClient,
  type ProjectReferenceGateway,
  type ProjectPageReference,
  type ProjectSummary,
} from '../io/project-reference-client'

/** 按不透明请求scope读写共享场景文件；null仅表示宿主已确认文件不存在。 */
/** 宿主在任何可能写请求发出前交付的不可变快照身份。 */
export type ScenarioViewVersionAttempt = Readonly<{
  scenarioId: string
  resourceId: string
  scope: string
  version: number
  fileName: string
  text: string
}>

/** 页面可见的快照状态；原文本、scope和owner身份留在工作区。 */
export type ScenarioViewVersionAttemptStatus = Readonly<{
  state: 'idle' | 'pending' | 'unknown' | 'confirmed' | 'not-applied'
  version: number | null
  fileName: string | null
  message: string | null
}>

/** 资源适配只在可证明本次固定N未应用时抛出。 */
export class ScenarioViewVersionNotAppliedError extends Error {
  constructor(readonly resourceId: string, readonly scope: string, readonly version: number,
    message = '该编号的场景快照未应用') {
    super(message)
    this.name = 'ScenarioViewVersionNotAppliedError'
  }
}

type ScenarioViewGateway = Readonly<{
  readScope: () => string
  readText: (scenarioId: string) => Promise<string | null>
  /**
   * 写入已加载场景；expectedText 是 ProjectWorkspace 刚捕获并核对的原文，未持久化草稿时为 null。
   * 仅资源适配器明确证明本次提交尚未应用且资源身份匹配时，才可抛 ScenarioViewWriteNotAppliedError；回读失败或超时必须保持未知。
   */
  writeText?: (scenarioId: string, text: string, expectedText?: string | null) => Promise<void>
  listVersions?: (scenarioId: string) => Promise<PageToolFileVersionSummary[]>
  readVersion?: (scenarioId: string, version: number) => Promise<string>
  createVersion?: (command: ScenarioViewVersionCreateCommand) => Promise<PageToolFileVersionSummary>
}>
/**
 * 给场景文件适配器的一次显式快照创建命令。版本由调用方按当前真实历史列表分配；适配器不得自行换号重试。
 */
export type ScenarioViewVersionCreateCommand = Readonly<{
  /** 本次快照所属的场景文件身份。 */
  scenarioId: string
  /** 调用方预先分配并需原样回执的快照编号。 */
  version: number
  /** 与已保存活动文件一致的精确快照原文。 */
  text: string
  /** 适配器在首次可能写入前同步捕获原attempt。 */
  onAttempt: (attempt: ScenarioViewVersionAttempt) => void
  /** 检查调用期间原工作区、scope和视图身份仍有效。 */
  assertCurrent?: () => void
}>
/** 读取明确场景文件，强制重载不得覆盖dirty。 */
type ScenarioViewLoadCommand = Readonly<{ scenarioId: string; forceReload?: boolean }>
/** 用户显式新建的单场景合法文本，远端必须确认不存在。 */
type ScenarioViewCreateCommand = Readonly<{ scenarioId: string; text: string; assertCurrent?: () => void }>
/** 保存已持有场景owner，写前比较基线并写后真实读回。 */
type ScenarioViewSaveCommand = Readonly<{ scenarioId: string; assertCurrent?: () => void
  onAttempt?: (attempt: Readonly<{version: number; fileName: string}>) => void }>
/** 接纳已展示的远端原文；异步读取前后核对调用方，失效时保留本地文件。 */
type ScenarioViewAdoptCommand = Readonly<{ scenarioId: string; expectedRevision: number; previewText: string | null; assertCurrent?: () => void
  /** 远端原文、格式、作用域与修订均确认后，紧邻替换同步执行；用于取消明确批准的原生视图修改。失败时不接纳远端。 */
  beforeApply?: () => void
}>

/** 场景编号快照操作，版本为非负安全整数，不是工具发布VersionId。 */
type ScenarioViewVersionCommand = Readonly<{ scenarioId: string; version: number }>
/**
 * 单个工具文件的明确原文更新。
 * pageId — 正式工具身份；fileName — 三文件中的目标文件；expectedText — 调用方已预览的远端原文；
 * text — 本次提交的完整新原文；assertCurrent — 每次异步边界核验调用身份及操作仍有效。
 */
type ProjectWorkspacePageFileChange = Readonly<{
  pageId: string
  fileName: PageToolFileName
  expectedText: string
  text: string
  assertCurrent?: () => void
}>
/** 版本操作捕获的场景owner、请求scope和工作文本基线。 */
type ScenarioViewVersionContext = Readonly<{ scenarioId: string; scope: string; file: ScenarioViewFile; text: string; revision: number; key: string }>
type ScenarioVersionAttemptRecord = Readonly<{
  context: ScenarioViewVersionContext
  status: ScenarioViewVersionAttemptStatus
  attempt?: ScenarioViewVersionAttempt
}>
const emptyScenarioVersionStatus: ScenarioViewVersionAttemptStatus = Object.freeze({
  state: 'idle', version: null, fileName: null, message: null,
})

function scenarioVersionStatus(state: ScenarioViewVersionAttemptStatus['state'], attempt: ScenarioViewVersionAttempt,
  message: string): ScenarioViewVersionAttemptStatus {
  return Object.freeze({state, version: attempt.version, fileName: attempt.fileName, message})
}

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
  /** 按目标空间装配正式元数据DataSet；模型与资源身份由宿主核验，工作区不创建替代表。 */
  scenarioDefinitions?: (workspace: ProjectWorkspace, scenarioId: string, assertCurrent: () => void) => Promise<DataSet>
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
  private readonly definitionLoader: ProjectWorkspaceOptions['scenarioDefinitions']
  private readonly definitionDataSets = new Map<string, DataSet>()
  private readonly definitionLoads = new Map<string, Promise<DataSet>>()
  private disposed = false
  private scenarioScope: string | undefined
  private readonly scenarioFiles = new Map<string, ScenarioViewFile>()
  private readonly scenarioLoads = new Map<string, Promise<ScenarioViewFile>>()
  private readonly scenarioSaves = new Set<string>()
  private readonly scenarioVersionAttempts = new Map<string, ScenarioVersionAttemptRecord>()
  private readonly pageFileSaves = new Set<string>()
  private readonly unconfirmedToolSaves = new Map<string, {page: PageTool; name: PageToolFileName; text: string; baseline: string}>()

  /** 原工作文件提交尚未回读确认的目标；撤销本地文本不会把未知写入变成已取消。 */
  get unconfirmedPageFiles(): ReadonlyArray<{pageId: string; fileName: PageToolFileName}> {
    return [...this.unconfirmedToolSaves.values()].map(item => ({pageId: item.page.pageId, fileName: item.name}))
  }
  /** 原场景owner仍持有待提交或结果未知的快照attempt时，宿主不得释放该工作区。 */
  get hasPendingScenarioVersionAttempt(): boolean {
    let scope: string
    try {scope = this.scenarioGateway?.readScope() ?? ''} catch {return false}
    if (!scope.trim()) return false
    return [...this.scenarioVersionAttempts.values()].some(record => record.context.scope === scope
      && this.scenarioFiles.get(record.context.scenarioId) === record.context.file
      && (record.status.state === 'pending' || record.status.state === 'unknown'))
  }
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
    this.definitionLoader = options.scenarioDefinitions
  }

  /** 取得本工作区为目标空间持有的正式定义DataSet；编辑真源是其中的DataView。 */
  public getScenarioDefinitions(scenarioId: string): DataSet | null {
    this.currentScenarioScope()
    const dataSet = this.definitionDataSets.get(this.requireScenarioId(scenarioId))
    return dataSet && !dataSet.destroyed ? dataSet : null
  }

  /**
   * 按显式目标空间加载正式元数据DataSet，同工作区与请求代次复用同一实例。
   * @param command scenarioId为被设计空间T；返回DataSet的身份是正式元数据空间C，二者不能互换。
   * @returns 定义视图按消费需要loadFromServer，使用DataView编辑/取消及DataSet.saveChanges提交。
   */
  public async loadScenarioDefinitions(command: Readonly<{scenarioId: string}>): Promise<DataSet> {
    const id = this.requireScenarioId(command.scenarioId), scope = this.currentScenarioScope()
    const cached = this.getScenarioDefinitions(id)
    if (cached) {await Promise.resolve(); this.assertScenarioScope(scope); return cached}
    const pending = this.definitionLoads.get(id)
    if (pending) {const dataSet = await pending; this.assertScenarioScope(scope); return dataSet}
    const loader = this.definitionLoader
    if (!loader) throw new Error('SCENARIO_DEFINITION_UNAVAILABLE: 宿主未提供正式元数据空间装配能力')
    const loading = Promise.resolve().then(() => loader(this, id, () => this.assertScenarioScope(scope))).then(dataSet => {
      try {
        this.assertScenarioScope(scope)
        if (dataSet.destroyed || !dataSet.scenarioId) throw new Error('SCENARIO_DEFINITION_IDENTITY: 元数据空间身份无效')
        this.definitionDataSets.set(id, dataSet)
        return dataSet
      } catch (error) {dataSet.destroy(); throw error}
    }).finally(() => {if (this.definitionLoads.get(id) === loading) this.definitionLoads.delete(id)})
    this.definitionLoads.set(id, loading)
    return loading
  }

  /** 保存工作区已经修改的正式元数据视图；不加载未读视图，不经文件owner另行提交。 */
  public async saveDirtyScenarioDefinitions(): Promise<void> {
    for (const scenarioId of this.dirtyScenarioIds) {
      const dataSet = this.getScenarioDefinitions(scenarioId)
      if (!dataSet || !Object.values(dataSet.tables).some(table => table.viewList.some(view => view.hasUnconfirmedSave || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()))) {
        throw new Error('SCENARIO_DEFINITION_UNAVAILABLE: 场景修改尚未接入正式定义DataSet，保留原草稿')
      }
      const result = await dataSet.saveChanges()
      if (!result.success) throw result.error ?? new Error(result.message ?? '场景定义保存失败')
    }
  }

  /** 宿主释放工作区时销毁所属定义DataSet；未决快照attempt必须先核验，不能随owner释放。 */
  /** @throws 原快照仍pending或unknown时拒绝释放owner。 */
  public dispose(): void {
    if (this.hasPendingScenarioVersionAttempt) throw new Error('SCENARIO_VIEW_VERSION_UNKNOWN: 原场景快照结果未核验，不能释放其工作区owner')
    this.disposed = true
    for (const dataSet of this.definitionDataSets.values()) dataSet.destroy()
    this.definitionDataSets.clear(); this.definitionLoads.clear()
    this.scenarioFiles.clear(); this.scenarioLoads.clear()
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
  public get dirtyScenarioIds(): string[] {
    if (this.scenarioGateway) this.currentScenarioScope()
    return [...new Set([...this.scenarioFiles.values()].filter(file => file.isDirty).map(file => file.scenarioId)
      .concat([...this.definitionDataSets].filter(([, dataSet]) => !dataSet.destroyed && Object.values(dataSet.tables)
        .some(table => table.viewList.some(view => view.hasUnconfirmedSave || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()))).map(([id]) => id)))]
  }

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
    if (!file.isDirty) return
    this.scenarioSaves.add(key)
    const rejection: {submission?: ScenarioViewSubmission; error?: ScenarioViewWriteNotAppliedError} = {}
    try {
      await file.saveChanges(async submitted => {
        const preimage = await gateway.readText(scenarioId)
        this.assertScenarioScope(scope)
        if (preimage !== (file.isPersisted ? file.savedText : null)) throw new Error('SCENARIO_VIEW_CONFLICT: 远端场景配置已改变')
        command.assertCurrent?.()
        file.beginSave(submitted, preimage)
        const submission = file.submission
        if (!submission) throw new Error('SCENARIO_VIEW_SAVE_STATE: 缺少当前提交身份')
        try { await write(scenarioId, submitted, preimage) }
        catch (error) {
          if (error instanceof ScenarioViewWriteNotAppliedError) {
            rejection.submission = submission
            rejection.error = error
          }
          throw error
        }
        this.assertScenarioScope(scope)
        const readback = await gateway.readText(scenarioId)
        this.assertScenarioScope(scope)
        if (readback !== submitted) throw new Error('SCENARIO_VIEW_SAVE_UNCONFIRMED: 写后原文回读不一致')
      })
      file.confirmSubmitted()
    } catch (error) {
      if (error instanceof ScenarioViewWriteNotAppliedError && rejection.error === error
        && rejection.submission !== undefined && file.submission === rejection.submission) {
        file.rejectSaveBeforeApply(rejection.submission)
      } else file.markSaveUnknownIfPending()
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
    command.assertCurrent?.()
    const remote = await this.requireScenarioGateway().readText(scenarioId)
    this.assertScenarioScope(scope)
    if (this.scenarioFiles.get(scenarioId) !== file || file.revision !== command.expectedRevision) throw new Error('SCENARIO_VIEW_DRAFT_STALE: 接受远端期间配置已改变')
    if (remote !== command.previewText) throw new Error('SCENARIO_VIEW_PREVIEW_CHANGED: 远端配置与已预览原文不一致')
    if (remote !== null) new ScenarioViewConfig(scenarioId, remote)
    command.assertCurrent?.()
    command.beforeApply?.()
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

  /** 当前相同scenario/scope/file owner的历史快照提交状态。 */
  public getScenarioVersionStatus(command: ScenarioViewSaveCommand): ScenarioViewVersionAttemptStatus {
    const scenarioId = this.requireScenarioId(command.scenarioId), scope = this.currentScenarioScope()
    const key = JSON.stringify([scope, scenarioId]), record = this.scenarioVersionAttempts.get(key)
    const file = this.scenarioFiles.get(scenarioId)
    if (!file) {
      command.assertCurrent?.()
      return emptyScenarioVersionStatus
    }
    if (record && record.context.file !== file) {
      command.assertCurrent?.()
      return emptyScenarioVersionStatus
    }
    command.assertCurrent?.()
    return record?.status ?? emptyScenarioVersionStatus
  }

  /** 只读核验Workspace捕获的原编号和原文本；允许当前定义视图有后续草稿。 */
  public async verifyScenarioVersionAttempt(command: ScenarioViewSaveCommand): Promise<ScenarioViewVersionAttemptStatus> {
    const scenarioId = this.requireScenarioId(command.scenarioId), scope = this.currentScenarioScope()
    const key = JSON.stringify([scope, scenarioId]), record = this.scenarioVersionAttempts.get(key)
    const file = this.scenarioFiles.get(scenarioId)
    if (!record?.attempt) throw new Error('SCENARIO_VIEW_VERSION_ATTEMPT_NONE: 没有待核验的场景快照')
    if (!file || record.context.file !== file) {
      if (record.status.state === 'pending' || record.status.state === 'unknown') {
        throw new Error('SCENARIO_VIEW_OWNER_CHANGED: 原快照attempt属于已释放的场景owner')
      }
      throw new Error('SCENARIO_VIEW_VERSION_ATTEMPT_NONE: 没有待核验的场景快照')
    }
    const context: ScenarioViewVersionContext = {scenarioId, scope, file, text: file.getText(), revision: file.revision, key}
    if (record.context.file !== context.file) throw new Error('SCENARIO_VIEW_OWNER_CHANGED: 原快照attempt属于已释放的场景owner')
    if (record.status.state === 'pending') throw new Error('SCENARIO_VIEW_VERSION_PENDING: 场景快照仍在提交')
    if (record.status.state !== 'unknown') return record.status
    const attempt = record.attempt
    const gateway = this.requireScenarioGateway(), list = gateway.listVersions, read = gateway.readVersion
    if (list === undefined || read === undefined) throw new Error('当前平台未提供场景版本核验能力')
    const assertCurrent = (): void => {
      this.assertScenarioVersionContext(context, false)
      command.assertCurrent?.()
      if (this.scenarioVersionAttempts.get(context.key) !== record) throw new Error('SCENARIO_VIEW_VERSION_ATTEMPT_STALE: 原快照attempt已改变')
    }
    assertCurrent()
    try {
      const versions = await list(context.scenarioId)
      assertCurrent()
      const matches = versions.filter(item => item.version === attempt.version && item.fileName === attempt.fileName)
      if (matches.length !== 1) return record.status
      const text = await read(context.scenarioId, attempt.version)
      assertCurrent()
      if (text !== attempt.text) return record.status
      new ScenarioViewFile(context.scenarioId, text)
      const confirmed = scenarioVersionStatus('confirmed', attempt, '快照原编号及原文已核验')
      this.scenarioVersionAttempts.set(context.key, {...record, status: confirmed})
      return confirmed
    } catch (error) {
      if (error instanceof Error && (error.message.includes('SCOPE_STALE') || error.message.includes('OWNER_CHANGED')
        || error.message.includes('ATTEMPT_STALE') || error.message.includes('DISPOSED'))) throw error
      return record.status
    }
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

  /** 为真实已保存且干净的工作文件建立下一编号快照，捕获原attempt并核对精确原文。 */
  public async createScenarioVersion(command: ScenarioViewSaveCommand): Promise<void> {
    const context = this.scenarioVersionContext(command.scenarioId)
    if (this.scenarioSaves.has(context.key)) throw new Error('SCENARIO_VIEW_VERSION_PENDING: 场景快照或保存仍在提交')
    const previous = this.scenarioVersionAttempts.get(context.key)
    if (previous?.status.state === 'pending') throw new Error('SCENARIO_VIEW_VERSION_PENDING: 场景快照仍在提交')
    if (previous?.status.state === 'unknown') throw new Error('SCENARIO_VIEW_VERSION_UNKNOWN: 请先只读核验原快照attempt')
    this.scenarioSaves.add(context.key)
    const pending: ScenarioVersionAttemptRecord = {context,
      status: {state: 'pending', version: null, fileName: null, message: '正在创建场景快照'}}
    this.scenarioVersionAttempts.set(context.key, pending)
    let attemptCaptured = false
    let gatewayCreateReturned = false
    const didCaptureAttempt = (): boolean => attemptCaptured
    const assertCurrent = () => {this.assertScenarioVersionContext(context, !attemptCaptured); command.assertCurrent?.()}
    try {
      assertCurrent()
      const gateway = this.requireScenarioGateway()
      const create = gateway.createVersion, list = gateway.listVersions, read = gateway.readVersion
      if (create === undefined || list === undefined || read === undefined) throw new Error('当前平台未提供场景版本创建及确认能力')
      const baseline = await gateway.readText(context.scenarioId)
      assertCurrent()
      if (baseline !== context.text) throw new Error('SCENARIO_VIEW_CONFLICT: 工作文件已改变')
      const versions = await list(context.scenarioId)
      assertCurrent()
      const seen = new Set<number>()
      for (const item of versions) {
        this.assertScenarioVersion(item.version)
        if (item.fileName !== `${item.version}__pagedata.json` || seen.has(item.version)) {
          throw new Error('SCENARIO_VIEW_HISTORY_INVALID: 场景历史列表编号无效或重复')
        }
        seen.add(item.version)
      }
      const version = Math.max(0, ...seen) + 1
      this.assertScenarioVersion(version)
      const onAttempt = (attempt: ScenarioViewVersionAttempt): void => {
        assertCurrent()
        if (attemptCaptured || attempt.scenarioId !== context.scenarioId || attempt.scope !== context.scope
          || attempt.version !== version || attempt.fileName !== `${version}__pagedata.json`
          || attempt.text !== context.text || typeof attempt.resourceId !== 'string' || !attempt.resourceId.trim()) {
          throw new Error('SCENARIO_VIEW_VERSION_ATTEMPT_INVALID: 快照attempt与原工作区不匹配')
        }
        command.onAttempt?.({version: attempt.version, fileName: attempt.fileName})
        attemptCaptured = true
        const captured = Object.freeze({...attempt})
        this.scenarioVersionAttempts.set(context.key, {context,
          status: scenarioVersionStatus('pending', captured, '原快照attempt已捕获'), attempt: captured})
      }
      const summary = await create({scenarioId: context.scenarioId, version, text: context.text, onAttempt, assertCurrent})
      gatewayCreateReturned = true
      if (!didCaptureAttempt()) throw new Error('SCENARIO_VIEW_VERSION_ATTEMPT_MISSING: 写入网关未捕获快照attempt')
      assertCurrent()
      if (summary.version !== version || summary.fileName !== `${version}__pagedata.json`) throw new Error('SCENARIO_VIEW_VERSION_UNCONFIRMED: 快照身份错误')
      const snapshot = await read(context.scenarioId, version)
      assertCurrent()
      if (snapshot !== context.text) throw new Error('SCENARIO_VIEW_VERSION_UNCONFIRMED: 快照回读原文不一致')
      const current = this.scenarioVersionAttempts.get(context.key)
      if (current?.attempt) this.scenarioVersionAttempts.set(context.key,
        {...current, status: scenarioVersionStatus('confirmed', current.attempt, '场景快照已回读确认')})
    } catch (error) {
      const current = this.scenarioVersionAttempts.get(context.key)
      if (didCaptureAttempt() && current?.attempt) {
        const typed = !gatewayCreateReturned && error instanceof ScenarioViewVersionNotAppliedError
          && error.resourceId === current.attempt.resourceId && error.scope === current.attempt.scope
          && error.version === current.attempt.version
        this.scenarioVersionAttempts.set(context.key, {...current, status: typed
          ? scenarioVersionStatus('not-applied', current.attempt, error.message)
          : scenarioVersionStatus('unknown', current.attempt, error instanceof Error ? error.message : '场景快照结果未知')})
      } else if (current === pending) this.scenarioVersionAttempts.delete(context.key)
      throw error
    } finally { this.scenarioSaves.delete(context.key) }
  }

  private scenarioVersionContext(value: string): ScenarioViewVersionContext {
    const scenarioId = this.requireScenarioId(value)
    const scope = this.currentScenarioScope()
    const file = this.scenarioFiles.get(scenarioId)
    if (file === undefined) throw new Error('场景视图文件尚未加载')
    return { scenarioId, scope, file, text: file.getText(), revision: file.revision, key: JSON.stringify([scope, scenarioId]) }
  }

  private assertScenarioVersionContext(context: ScenarioViewVersionContext, requireClean = false): void {
    this.assertScenarioScope(context.scope)
    if (this.scenarioFiles.get(context.scenarioId) !== context.file) throw new Error('SCENARIO_VIEW_OWNER_CHANGED: 场景owner已改变')
    if (requireClean && (context.file.getText() !== context.text || context.file.revision !== context.revision)) {
      throw new Error('SCENARIO_VIEW_EDIT_DURING_VERSION: 版本操作期间已发生编辑')
    }
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
    if (this.disposed) throw new Error('PROJECT_WORKSPACE_DISPOSED: 工作区已释放')
    const scope = this.requireScenarioGateway().readScope()
    if (!scope.trim()) throw new Error('SCENARIO_VIEW_SCOPE_STALE: 场景文件缺少有效请求代次')
    if (this.scenarioScope !== scope) {
      for (const dataSet of this.definitionDataSets.values()) dataSet.destroy()
      this.definitionDataSets.clear()
      this.definitionLoads.clear()
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

  /** 只读远端正式蓝图，不覆盖本地策划草稿或活动页。 */
  /** 读取工具原文；省略versionId为工作文件，显式发布指针沿原reader读取快照，不覆盖PageTool或工作缓存。 */
  public async previewPageFileRemote(pageId: string, fileName: PageToolFileName, versionId?: string): Promise<string> {
    if (versionId !== undefined) {
      if (!versionId.trim()) throw new Error('发布版本指针不能为空')
      const reader = this.getContentLoader().getPageFileReader()
      if (!reader) throw new Error('未提供工具文件读取能力')
      return reader({projectId: this.project.projectId, pageId: assertNonEmptyPageId(pageId), fileName, versionId})
    }
    const result = await this.getContentLoader().loadPageFileContent(assertNonEmptyPageId(pageId), fileName, {forceReload: true})
    if (!result.success || result.data === undefined) throw new Error(result.error ?? `${fileName} 读取失败`)
    return result.data
  }

  /** 按明确原文更新单个工具文件并精确回读；已是目标原文时只确认，不重放写入。无后端CAS，不能保证原子并发。 */
  public async savePageFileChange(command: ProjectWorkspacePageFileChange): Promise<void> {
    const {fileName, expectedText, text} = command, pageId = assertNonEmptyPageId(command.pageId)
    const key = JSON.stringify([pageId, fileName]), page = this.project.findPageTool(pageId)
    if (this.unconfirmedToolSaves.has(key)) throw new Error('PAGE_TOOL_SAVE_UNCONFIRMED: 请先核验原工具编辑提交')
    const local = page?.getFileText(fileName)
    const next = new PageTool({pageId}); next.hydrateFileText(fileName, text)
    const check = () => {
      command.assertCurrent?.()
      if (this.project.findPageTool(pageId) !== page || page && (page.getDirtyFileNames().includes(fileName)
        || page.getFileText(fileName) !== local)) {
        throw new Error('PAGE_TOOL_CONFLICT: 工具文件有本地编辑或已变化，不能覆盖')
      }
    }
    check()
    if (this.pageFileSaves.has(key)) throw new Error('PAGE_TOOL_SAVE_PENDING: 工具文件正在保存')
    this.pageFileSaves.add(key)
    try {
      const remote = await this.previewPageFileRemote(pageId, fileName); check()
      if (remote !== text) {
        if (remote !== expectedText) throw new Error('PAGE_TOOL_CONFLICT: 工具文件远端原文已变化')
        await this.fileApi.saveFileContent(pageId, fileName, text); check()
        const confirmed = await this.previewPageFileRemote(pageId, fileName); check()
        if (confirmed !== text) throw new Error('PAGE_TOOL_SAVE_UNCONFIRMED: 工具文件回读未确认，请核验')
      }
      page?.hydrateFileText(fileName, text)
      this.notifyPageFileChanged(pageId, fileName)
    } finally {this.pageFileSaves.delete(key)}
  }


    /** 加载项目蓝图。 */
ingestBlueprintTree(
    root: ProjectBlueprintTreeData,
    options?: { selectedNodeId?: string | null },
  ): ProjectBlueprintTreeData {
    return this.project.replaceBlueprintTree(root, {
      selectedNodeId: options?.selectedNodeId ?? null,
    })
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

probeLink(url: string): Promise<{ embeddable: boolean; reason: string }> {
    const probe = this.blueprintGateway.probeLink
    if (!probe) throw new Error('当前平台未提供蓝图 probeLink 能力')
    return probe(url)
  }

async listReferenceProjects(): Promise<ProjectSummary[]> {
    return this.requireProjectReferenceClient().listProjects({
      excludeProjectId: this.project.projectId,
    })
  }

async listReferenceProjectPages(projectId: string): Promise<ProjectPageReference[]> {
    return this.requireProjectReferenceClient().listProjectPages(projectId)
  }

  private requireProjectReferenceClient(): ProjectReferenceClient {
    if (this.projectReferenceClient !== null) return this.projectReferenceClient
    throw new Error('ProjectReferenceClient 未配置，无法读取跨项目引用')
  }
}
