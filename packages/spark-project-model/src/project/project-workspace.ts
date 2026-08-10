/**
 * @module @spark-appworks/spark-project-model:project/project-workspace
 * 职责：提供项目模型和页面配置域中的 project workspace 能力，支撑 navigation、page content、project session 或远程 IO。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */
/**
 * ProjectWorkspace — 持有 ProjectModel 并提交 IO（设计即编辑）。
 * 领域状态、事件与投影属于 ProjectModel；谁 new 谁负责生命周期。
 */

import { PageFileApi, type ProjectPageFileGateway } from '../io/page-file-api'
import { PageContentLoader } from '../io/page-content-loader'
import type {
  ProjectBlueprintTreeData,
  ProjectBlueprintTreeNodeData,
} from '../blueprint/project-blueprint-node'
import { ProjectBlueprintClient, type ProjectBlueprintGateway } from '../io/project-blueprint-client'
import { replaceProjectBlueprintChildrenRemote } from '../io/project-blueprint-tree-sync'
import type { PageFileCreateOptions, PageNodeFileVersionSummary } from '../page/page-file'
import {
  assertNonEmptyPageId,
  PAGE_NODE_FILE_NAMES,
  pageFilePath,
  type PageNodeFileName,
} from '../page/page-file'
import type { ConfigPageNode, PageNodeLike } from '../page/config-page'
import { ProjectModel } from './project-model'
import {
  ProjectReferenceClient,
  type ProjectReferenceGateway,
  type ProjectPageReference,
  type ProjectSummary,
} from '../io/project-reference-client'
import {
  findConfigNodeByPageId,
  isConfigNodeKind,
  normalizeProjectBlueprintTreeNodeData,
  resolvePageNodePageId,
} from '../blueprint/project-blueprint-tree'
import {
  applyNodeKindPresetToDraft,
  createBlueprintNodeDraft,
  createBlueprintNodePatch,
  defaultNavIconByKind,
  type BlueprintNodeDraft,
  type BlueprintNodePatch,
} from '../blueprint/project-blueprint-edit'

/** Project Page Load Options 的调用配置。 */
export type ProjectPageLoadOptions = {
    /** force Reload 字段。 */
forceReload?: boolean
}

export type CreatePageForSelectedNodeParams = {
    /** page Id 标识。 */
pageId: string
    /** 显示标题。 */
title?: string
    /** icon 字段。 */
icon?: string
}

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

type RemoveMountedPageParams = {
    /** page Id 标识。 */
pageId: string
    /** node Id 标识。 */
nodeId?: string
    /** delete Files 字段。 */
deleteFiles?: boolean
}

/** Project Workspace Options 的调用配置。 */
export type ProjectWorkspaceOptions = {
    /** project Id 标识。 */
projectId: string
    /** 页面四文件语义网关。 */
pageFiles: ProjectPageFileGateway
    /** 项目蓝图语义网关。 */
blueprint: ProjectBlueprintGateway
    /** 跨项目引用语义网关。 */
projectReferences?: ProjectReferenceGateway
}

function isProjectPageLoadOptions(value: unknown): value is ProjectPageLoadOptions {
  return value !== null && typeof value === 'object'
}

/**
 * 项目 IO 编排层：将 ProjectModel 的操作委托到远端 API。
 */
export class ProjectWorkspace {
    /** project 字段。 */
readonly project: ProjectModel
  private readonly projectReferenceClient: ProjectReferenceClient | null
  private readonly blueprintClient: ProjectBlueprintClient
  private readonly fileApi: PageFileApi
  private readonly getContentLoader: () => PageContentLoader

constructor(options: ProjectWorkspaceOptions) {
    const fileApi = new PageFileApi(options.pageFiles)
    const blueprintClient = new ProjectBlueprintClient(options.blueprint)
    const projectReferenceClient = options.projectReferences === undefined
      ? undefined
      : new ProjectReferenceClient(options.projectReferences)
    const pageContentLoader = new PageContentLoader({
      projectId: options.projectId,
      readPageFile: options.pageFiles.readPageFile,
    })
    this.project = new ProjectModel({ projectId: options.projectId })
    this.blueprintClient = blueprintClient
    this.projectReferenceClient = projectReferenceClient ?? null
    this.fileApi = fileApi
    this.getContentLoader = () => pageContentLoader
  }

    /** 读取 Active Page Render Node。 */
getActivePageRenderNode(): PageNodeLike | null {
    const page = this.project.getActivePage()
    return page === null ? null : this.createRenderPageNode(page)
  }

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
    const { patch } = createBlueprintNodePatch(createBlueprintNodeDraft(root.toNodeData()))
    await this.blueprintClient.updateNode(root.id, patch)
    if (options?.skipReload === true) {
      this.project.markBlueprintClean('root')
      return
    }
    await this.reloadBlueprint({ selectedNodeId: this.project.session.session.selectedNodeId })
  }

async saveSelectedBlueprintNode(options?: { skipReload?: boolean }): Promise<void> {
    let nodeId: string
    let patch: BlueprintNodePatch & Pick<ProjectBlueprintTreeNodeData, 'title' | 'nodeKind'>

    const workingDto = this.project.blueprintDraft
    if (workingDto !== null) {
      const result = createBlueprintNodePatch(workingDto)
      nodeId = workingDto.node.id
      patch = result.patch
    } else {
      const node = this.requireSelectedNode('未选中蓝图节点，无法保存蓝图属性')
      const result = createBlueprintNodePatch(createBlueprintNodeDraft(node))
      nodeId = node.id
      patch = result.patch
    }

    await this.blueprintClient.updateNode(nodeId, patch)
    this.project.session.setBlueprintDraft(null)
    if (options?.skipReload === true) {
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
async loadPageFile(name: PageNodeFileName, options?: ProjectPageLoadOptions): Promise<void> {
    const page = this.requireActivePage('无活动页面，无法加载页面文件')
    await this.loadSinglePageFile(page, name, { forceReload: options?.forceReload === true })
    this.project.markPageFileChanged(page.pageId, name)
  }

    /** 保存 Page File。 */
async savePageFile(name: PageNodeFileName): Promise<void> {
    const page = this.requireActivePage('无活动页面，无法保存页面文件')
    await this.savePageFileFromModel(page, name)
    this.project.markPageFileChanged(page.pageId, name)
  }

    /** 保存 Dirty Page Files。 */
async saveDirtyPageFiles(): Promise<void> {
    const page = this.project.getActivePage()
    if (!page) return
    const dirtyNames = page.getDirtyFileNames()
    await Promise.all(dirtyNames.map(name => this.savePageFileFromModel(page, name)))
    for (const name of dirtyNames) this.project.markPageFileChanged(page.pageId, name)
  }

    /** 保存 All。 */
async saveAll(): Promise<void> {
    await this.saveDirtyPageFiles()
    await this.saveBlueprintFromSession()
  }

async addBlueprintNode(params: { parentId?: string | null; node: ProjectBlueprintTreeNodeData; index?: number }): Promise<ProjectBlueprintTreeNodeData> {
    const node = await this.blueprintClient.addNode(params)
    await this.reloadBlueprint({ selectedNodeId: node.id })
    return node
  }

    /** 删除 Node。 */
async deleteNode(nodeId: string): Promise<ProjectBlueprintTreeNodeData | null> {
    const normalized = nodeId.trim()
    if (!normalized) {
      throw new Error('nodeId 不能为空')
    }
    const result = await this.blueprintClient.deleteNode(normalized)
    const root = await this.blueprintClient.loadRoot()
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
      const nextEditDto: BlueprintNodeDraft = {
        ...previousEditDto,
        node: {
          ...applyNodeKindPresetToDraft(previousEditDto.node, 'page'),
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fall through to default
          title: params.title?.trim() || previousEditDto.node.title || pageId,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fall through to default
          icon: params.icon?.trim() || previousEditDto.node.icon,
          path: `/${pageId}`,
        },
      }
      this.project.applyBlueprintNodeEdit(nextEditDto)
      const node = this.project.design.findNodeById(nextEditDto.node.id)
      if (!node) throw new Error(`项目节点未找到: ${nextEditDto.node.id}`)
      await this.saveSelectedBlueprintNode()
      this.project.setActivePage(pageId)
      return { page, node: this.getSelectedNode() ?? node.toNodeData() }
    } catch (error) {
      this.project.applyBlueprintNodeEdit(previousEditDto)
      const node = this.project.design.findNodeById(previousEditDto.node.id)
      if (!node) throw new Error(`项目节点未找到: ${previousEditDto.node.id}`)
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
      await this.reloadBlueprint({ selectedNodeId: node.id })
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
    const result = await this.blueprintClient.moveNode(nodeId, newParentId, index)
    await this.reloadBlueprint({ selectedNodeId: nodeId })
    return result
  }

async listRemotePageVersions(filename: PageNodeFileName): Promise<PageNodeFileVersionSummary[]> {
    const page = this.project.getActivePage()
    if (!page) return []
    return this.fileApi.listVersions(page.pageId, filename)
  }

async restoreRemotePageVersion(version: number, filename: PageNodeFileName): Promise<void> {
    const page = this.requireActivePage('无活动页面，无法恢复版本')
    await this.fileApi.restoreVersion(page.pageId, filename, version)
    await this.loadSinglePageFile(page, filename, { forceReload: true })
    page.markFileSaved(filename)
    this.clearPageCache(page.pageId, filename)
    this.notifyPageFileChanged(page.pageId, filename)
  }

    /** 创建 Remote Page Version。 */
async createRemotePageVersion(filename: PageNodeFileName): Promise<void> {
    const page = this.project.getActivePage()
    if (!page) return
    await this.fileApi.createVersion(page.pageId, filename)
  }

    /** 删除 Remote Page Version。 */
async deleteRemotePageVersion(version: number, filename: PageNodeFileName): Promise<void> {
    const page = this.project.getActivePage()
    if (!page) return
    await this.fileApi.deleteVersion(page.pageId, filename, version)
  }

notifyPageFileChanged(
    pageId: string,
    filename: PageNodeFileName | '__created' | '__deleted' | '__bulk',
  ): void {
    if (filename === '__created' || filename === '__deleted' || filename === '__bulk') {
      this.project.markPageLoadedChanged(pageId, false)
      return
    }
    this.project.markPageFileChanged(pageId, filename)
  }

async probeLink(url: string): Promise<{ embeddable: boolean; reason: string }> {
    return this.blueprintClient.probeLink(url)
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
    return this.blueprintClient.addNode({
      ...(params.parentId === undefined ? {} : { parentId: params.parentId }),
      node: this.defaultMountedPageBlueprintNode(params),
      ...(params.index === undefined ? {} : { index: params.index }),
    })
  }

  private async unmountPageBlueprintNode(pageId: string, nodeId?: string): Promise<ProjectBlueprintTreeNodeData | null> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    const resolvedNodeId = await this.resolveBlueprintNodeId(normalizedPageId, nodeId)
    return this.blueprintClient.deleteNode(resolvedNodeId)
  }

  private defaultMountedPageBlueprintNode(params: CreateMountedPageParams): ProjectBlueprintTreeNodeData {
    const pageId = assertNonEmptyPageId(params.pageId)
    const title = params.title?.trim()
    const icon = params.icon?.trim()
    const node = params.node ?? {
      id: pageId,
      title: title !== undefined && title.length > 0 ? title : pageId,
      icon: icon !== undefined && icon.length > 0 ? icon : defaultNavIconByKind('page'),
      nodeKind: 'page' as const,
      path: `/${pageId}`,
    }
    return normalizeProjectBlueprintTreeNodeData(node)
  }

  private async resolveBlueprintNodeId(pageId: string, nodeId?: string): Promise<string> {
    const explicitNodeId = nodeId?.trim()
    if (explicitNodeId) return explicitNodeId

    const root = await this.blueprintClient.loadRoot()
    const found = findConfigNodeByPageId(root.children, assertNonEmptyPageId(pageId))
    if (found === null) {
      throw new Error(`project blueprint node not found for pageId: ${pageId}`)
    }
    return found.id
  }

  private resolveSelectedPageId(): string {
    const node = this.requireSelectedNode('未选中蓝图节点，无法加载页面')
    const kind = node.nodeKind ?? 'page'
    if (!isConfigNodeKind(kind)) {
      throw new Error(`当前选中节点不是可配置页面，类型: ${kind}`)
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
      const serverRoot = await this.blueprintClient.loadRoot()
      await replaceProjectBlueprintChildrenRemote(
        this.blueprintClient,
        serverRoot,
        this.project.toTree(),
      )
      await this.reloadBlueprint({ selectedNodeId: this.project.session.session.selectedNodeId })
      this.project.markBlueprintClean('root')
      return
    }
    await this.saveSelectedBlueprintNode()
    this.project.markBlueprintClean('node')
  }

  private async reloadBlueprint(options?: { selectedNodeId?: string | null }): Promise<ProjectBlueprintTreeData> {
    const root = await this.blueprintClient.loadRoot()
    return this.project.replaceBlueprintTree(root, {
      selectedNodeId: options?.selectedNodeId ?? null,
    })
  }

  private async loadPage(page: ConfigPageNode, options?: ProjectPageLoadOptions): Promise<void> {
    const forceReload = options?.forceReload === true
    if (page.isLoaded && !forceReload) return
    await Promise.all(
      PAGE_NODE_FILE_NAMES.map(name => this.loadSinglePageFile(page, name, { forceReload })),
    )
    page.markLoaded()
  }

  private async loadSinglePageFile(
    page: ConfigPageNode,
    name: PageNodeFileName,
    options?: ProjectPageLoadOptions,
  ): Promise<void> {
    const result = await this.getContentLoader().loadPageFileContent(page.pageId, name, {
      forceReload: options?.forceReload === true,
    })
    if (!result.success) {
      throw new Error(result.error ?? result.reason ?? `${name} 加载失败`)
    }
    page.hydrateFileText(name, result.data ?? '')
  }

  private async createPageFilesForModel(
    page: ConfigPageNode,
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

  private async deletePageFilesForModel(page: ConfigPageNode): Promise<void> {
    await this.fileApi.deleteFiles(page.pageId)
    this.clearPageCache(page.pageId)
  }

  private async savePageFileFromModel(page: ConfigPageNode, name: PageNodeFileName): Promise<void> {
    await this.fileApi.saveFileContent(page.pageId, name, page.getFileText(name))
    page.markFileSaved(name)
    this.clearPageCache(page.pageId, name)
  }

  private clearPageCache(pageId: string, filename?: PageNodeFileName): void {
    const normalized = pageId.trim()
    if (!normalized) return
    const loader = this.getContentLoader()
    if (filename !== undefined) {
      loader.clearCache(pageFilePath(normalized, filename))
      return
    }
    loader.clearPageCache(normalized)
  }

  private createRenderPageNode(page: ConfigPageNode): PageNodeLike {
    return {
      get pageId() { return page.pageId },
      get isLoaded() { return page.isLoaded },
      load: async (options?: ProjectPageLoadOptions) => {
        await this.loadPage(page, options)
        this.project.markPageLoadedChanged(page.pageId, true)
      },
      toRenderConfig: () => page.toRenderConfig(),
    }
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

  private requireActivePage(message: string): ConfigPageNode {
    const page = this.project.getActivePage()
    if (page) return page
    throw new Error(message)
  }

  private openPage(pageId: string): ConfigPageNode {
    const normalized = pageId.trim()
    if (!normalized) throw new Error('pageId 不能为空')
    return this.project.openPageDesign(normalized)
  }

  private requireProjectReferenceClient(): ProjectReferenceClient {
    if (this.projectReferenceClient !== null) return this.projectReferenceClient
    throw new Error('ProjectReferenceClient 未配置，无法读取跨项目引用')
  }
}
