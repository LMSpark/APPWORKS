/**
 * @module @spark-appworks/spark-project-model:project/project-model
 * 职责：提供项目蓝图和页面配置域的 ProjectModel 门面，支撑 blueprint、page content、project session 与远程 IO。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */
/**
 * ProjectModel — 软件项目根 class。
 *
 * 组合 design（设计内容 class 树）与 session（编辑状态）。
 */
import type { NavigationRootPlacement, ProjectBlueprintNodeKind, RuntimeNavigationItemKind } from '@spark-appworks/spark-utils'
import type { DataSetCrudTool, SparkNodeTree as SparkNodeTreeModel } from '@spark-appworks/spark-data'
import type { ProjectBlueprintNode } from '../blueprint/project-blueprint-node'
import { ProjectBlueprintDesign } from './project-design'
import {
  applyNodeKindPresetToDraft,
  applyNestedConfigPagePresetToDraft,
  createBlueprintNodeDraft,
  blueprintDraftContentKey,
  type BlueprintNodeDraft,
  type BlueprintNodeDraftApplyResult,
} from '../blueprint/project-blueprint-edit'
import {
  readProjectNodeDescription,
} from '../blueprint/project-blueprint-node'
import type {
  ProjectBlueprintTreeData,
  ProjectBlueprintTreeNodeData,
  ProjectBlueprintTreeNodeLocation,
  ProjectPageNodeSummary,
} from '../blueprint/project-blueprint-node'
import type { ConfigPageNode } from '../page/config-page'
import type { PageNodeFileName } from '../page/page-file'
import { tryParsePageDataTextError, tryParseRuleTextError } from '../page/page-file'
import { ProjectSession } from './project-session'
import type {
  ProjectInfo,
  ProjectInfoInput,
  ProjectModelEventListener,
  ProjectModelInitOptions,
  ProjectActivePageProjection,
  ProjectDirtyProjection,
  ProjectBlueprintProjection,
  ProjectPageFileWriteCommand,
  BlueprintPlanningInput,
  ProjectPlanningInput,
  ProjectPlanningCompletionInput,
  ProjectPlanningCompletionResult,
} from './project-types'

export type {
  ProjectInfo,
  ProjectInfoInput,
  ProjectModelEvent,
  ProjectModelEventListener,
  ProjectModelInitOptions,
  ProjectActivePageProjection,
  ProjectDirtyProjection,
  ProjectBlueprintProjection,
  ProjectBlueprintDirtyScope,
} from './project-types'

/**
 * 项目模型根。
 *
 */
export class ProjectModel<TNode extends ProjectBlueprintNode = ProjectBlueprintNode> {
    /** design 字段。 */
readonly design: ProjectBlueprintDesign<TNode>
    /** session 字段。 */
readonly session: ProjectSession

  private revisionCounter = 0
  private readonly listeners = new Set<ProjectModelEventListener>()

  /**
   * 创建项目根模型实例。
   *
   * @param options 项目蓝图、页面四文件与会话初始化参数。
   */
  constructor(options: ProjectModelInitOptions) {
    this.design = new ProjectBlueprintDesign<TNode>(options)
    this.session = new ProjectSession({
      findNodeById: (nodeId) => this.design.findNodeById(nodeId),
      findConfigPageByPageId: (pageId) => this.design.findConfigPageByPageId(pageId),
    })
  }

  get family(): 'project' { return 'project' }
  get revision(): number { return this.revisionCounter }
  /** 项目唯一标识，与租户内存储锚点一致。 */
  get projectId(): string { return this.design.projectId }
  get id(): string { return this.projectId }
  get tenantId(): string | undefined { return this.design.tenantId }
  get name(): string { return this.design.name }
  get title(): string { return this.design.name }
  get projectType(): string { return this.design.projectType }
  get icon(): string | undefined { return this.design.icon }
  get description(): string { return this.design.description }
  get homeNodeId(): string | undefined { return this.design.homeNodeId }
  get homeNode(): TNode | null { return this.design.homeNode }
  get rootNode(): TNode | null { return this.design.rootNode }
  get order(): number { return this.design.order }
  get createdAt(): string | undefined { return this.design.createdAt }
  get updatedAt(): string | undefined { return this.design.updatedAt }
  get projectInfo(): ProjectInfo { return this.design.projectInfo }

  /** 项目蓝图根 DTO，含子节点树与输出布局元数据。
   *
   */
  get blueprintTree(): ProjectBlueprintTreeData { return this.design.blueprintTree }
  get blueprintDraft(): BlueprintNodeDraft | null { return this.session.blueprintDraft }
  get isBlueprintEditing(): boolean { return this.session.isBlueprintEditing }
  get blueprintDirty(): boolean { return this.session.blueprintDirty }

subscribe(listener: ProjectModelEventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

    /** 读取 Child Nodes。 */
getChildNodes(nodeId?: string): TNode[] { return this.design.getChildNodes(nodeId) }
  /** 项目蓝图扁平节点列表，按遍历顺序排列。 */
  get flatRows(): TNode[] { return this.design.flatRows }

  /**
   * 当前活动配置页；需先 openPageDesign(pageId) 才有值。
   *
   */
  get activePage(): ConfigPageNode | null {
    return this.getActivePage()
  }
forEachNode(callback: (node: TNode) => void): void { this.design.forEachNode(callback) }

replaceProjectInfo(project: ProjectInfoInput): ProjectInfo { return this.design.replaceProjectInfo(project) }

  /**
   * 替换项目蓝图根节点的 children，返回更新后的蓝图根数据。
   *
   * @param input 新的蓝图 children 树，或 `{ children }` 命令对象（与 ClassModel script 对齐）。
   */
  replaceBlueprintChildren(
    input: ProjectBlueprintTreeNodeData[] | Readonly<{ children: ProjectBlueprintTreeNodeData[] }>,
  ): ProjectBlueprintTreeData {
    const children = Array.isArray(input) ? input : input.children
    const root = this.design.replaceBlueprintChildren(children)
    this.session.markBlueprintDirty('root')
    this.emitBlueprintChanged({ scope: 'root' })
    return root
  }

findNodeById(nodeId: string): TNode | null { return this.design.findNodeById(nodeId) }
findNodeLocation(nodeId: string): ProjectBlueprintTreeNodeLocation | null { return this.design.findNodeLocation(nodeId) }
findConfigPageByPageId(pageId: string): ConfigPageNode | null {
    return this.design.findConfigPageByPageId(pageId)
  }

  /**
   * 按 pageId 打开配置页设计上下文，返回 ConfigPageNode 四文件子模型。
   *
   * @param pageId 目标配置页 pageId，必须来自输入。
   */
  openPageDesign(pageId: string): ConfigPageNode { return this.design.openPageDesign(pageId) }
closePageDesign(pageId: string): void { this.design.closePageDesign(pageId) }

  /**
   * 读取策划轴投影：各 page/sub-page 的 description 与 descriptionContext。
   */
  readPlanningProjection(): ProjectPageNodeSummary[] { return this.design.readPlanningProjection() }

  /**
   * 读取项目级策划输入：项目蓝图根 description（短需求）+ 可选策划附件引用。
   *
   */
  readProjectPlanningInput(): ProjectPlanningInput {
    const blueprintTree = toBlueprintTreeNodeData(this.blueprintTree)
    const rootRequirement = readProjectNodeDescription(blueprintTree)
    const requirement = rootRequirement.length > 0 ? rootRequirement : this.description
    const planningAttachmentRef = resolvePlanningAttachmentRef(
      blueprintTree?.planningAttachmentRef,
      this.projectInfo.planningAttachmentRef,
    )
    return {
      requirement,
      ...(planningAttachmentRef === undefined ? {} : { planningAttachmentRef }),
    }
  }

  /**
   * 读取单个项目蓝图节点策划输入。
   *
   * @param nodeId 目标蓝图节点 id。
   */
  readBlueprintNodePlanningInput(nodeId: string): BlueprintPlanningInput {
    const model = this.findNodeById(nodeId)
    if (model === null) throw new Error(`项目节点未找到: ${nodeId}`)
    return toBlueprintPlanningInput(model.toNodeData())
  }

  /**
   * 读取全部项目蓝图节点策划输入（扁平遍历顺序）。
   *
   */
  readBlueprintPlanningInputs(): readonly BlueprintPlanningInput[] {
    return this.flatRows.map(model => toBlueprintPlanningInput(model.toNodeData()))
  }

  /**
   * 项目策划完成动作；agent_complete 会调用它，而不是只在协议层标记结束。
   */
  completeProjectPlanning(
    input: ProjectPlanningCompletionInput = {},
  ): ProjectPlanningCompletionResult {
    const blueprintTree = this.blueprintTree
    const children = blueprintTree.children
    if (!this.blueprintDirty) {
      return {
        ok: false,
        code: 'PROJECT_PLANNING_BLUEPRINT_NOT_WRITTEN',
        msg: 'projectPlanning: blueprint children 尚未写入，不能完成。',
        fix: '需要先读取项目策划输入和蓝图策划输入，再写入具有明确 blueprintKind 的项目蓝图节点。',
        requiredCapabilities: [
          'readProjectPlanningInput',
          'readBlueprintPlanningInputs',
          'replaceBlueprintChildren',
        ],
        missingFacts: ['blueprintTree.children'],
        nextStep: '补齐项目蓝图 children，并为每个节点声明真实 blueprintKind。',
      }
    }

    const nodes = flattenProjectBlueprintNodes(children)
    if (nodes.length === 0) {
      return {
        ok: false,
        code: 'PROJECT_PLANNING_BLUEPRINT_NODES_MISSING',
        msg: 'projectPlanning: 项目蓝图没有业务节点。',
        fix: '需要写入至少一个真实业务节点；节点可以是需求、原型、数据空间、页面、报表、流程或其他已定义蓝图类型。',
        requiredCapabilities: [
          'replaceBlueprintChildren',
        ],
        missingFacts: ['blueprintTree.children'],
        nextStep: '补齐蓝图节点后再次请求完成。',
      }
    }

    const unresolvedNodeIds = nodes
      .filter(node => node.blueprintKind === undefined || node.blueprintKind === 'unresolved')
      .map(node => node.id)
    if (unresolvedNodeIds.length > 0) {
      return {
        ok: false,
        code: 'PROJECT_PLANNING_BLUEPRINT_KIND_UNRESOLVED',
        msg: 'projectPlanning: 项目蓝图包含未解析业务类型的节点。',
        fix: '根据真实产品语义为节点声明 blueprintKind；不得按 URL、层级或是否有 children 猜测。',
        requiredCapabilities: ['replaceBlueprintChildren'],
        missingFacts: unresolvedNodeIds.map(nodeId => `blueprintKind:${nodeId}`),
        nextStep: '补齐节点 blueprintKind 后再次请求完成。',
      }
    }

    const blueprintKinds = [...new Set(nodes.map(readResolvedProjectBlueprintKind))]
    const summary = input.summary?.trim()
    return {
      ok: true,
      completed: true,
      summary: summary !== undefined && summary.length > 0 ? summary : '项目策划已完成。',
      nodeCount: nodes.length,
      blueprintKinds,
    }
  }

  /**
   * 更新根模块 childPlacement（项目级 header / sidebar 布局）。
   *
   */
  applyProjectLayoutEdit(childPlacement: NavigationRootPlacement): BlueprintNodeDraftApplyResult {
    const root = this.design.rootNode
    if (!root) throw new Error('项目蓝图根节点未加载')
    const beforeKey = blueprintDraftContentKey(createBlueprintNodeDraft(root.toNodeData()))
    const draft = createBlueprintNodeDraft(root.toNodeData())
    draft.node.childPlacement = childPlacement
    const { node, result } = this.design.applyBlueprintNodeEdit(draft)
    const nextDraft = createBlueprintNodeDraft(node.toNodeData())
    if (blueprintDraftContentKey(nextDraft) !== beforeKey) {
      this.session.markBlueprintDirty('root')
    }
    this.emitBlueprintChanged({ scope: 'root', nodeId: node.id })
    return result
  }

addRootModule(createId: () => string): ProjectBlueprintTreeNodeData {
    const node = this.design.addRootModule(createId)
    this.session.markBlueprintDirty('root')
    this.emitBlueprintChanged({ scope: 'root', nodeId: node.id })
    return node
  }
addChildPage(createId: () => string, parent?: ProjectBlueprintTreeNodeData | null): ProjectBlueprintTreeNodeData {
    const node = this.design.addChildPage(createId, parent ?? null)
    this.session.markBlueprintDirty('root')
    this.emitBlueprintChanged({ scope: 'root', nodeId: node.id })
    return node
  }
    /** 删除 Node。 */
removeNode(nodeId: string): ProjectBlueprintTreeNodeData | null {
    const removed = this.design.removeNode(nodeId)
    this.session.syncWithModel()
    this.session.markBlueprintDirty('root')
    this.emitBlueprintChanged({ scope: 'root', nodeId })
    return removed
  }
refreshNavRefs(): void { this.design.refreshNavRefs() }
toTree(): ProjectBlueprintTreeNodeData[] { return this.design.toTree() }

replaceBlueprintTree(
    root: ProjectBlueprintTreeData,
    options: { selectedNodeId?: string | null; dirty?: boolean } = {},
  ): ProjectBlueprintTreeData {
    const result = this.design.replaceBlueprintTree(root)
    const selectedNodeId = options.selectedNodeId ?? null
    if (selectedNodeId && this.design.findNodeById(selectedNodeId)) {
      this.session.setSelectedNodeId(selectedNodeId)
    } else {
      this.session.setSelectedNodeId(null)
    }
    this.session.syncWithModel()
    if (options.dirty === true) this.session.markBlueprintDirty('root')
    else this.session.markBlueprintClean()
    this.design.refreshNavRefs()
    this.emitBlueprintChanged({ scope: 'root' })
    this.emitSelectionChanged()
    return result
  }

selectNode(nodeId: string | null): void {
    this.session.setSelectedNodeId(nodeId)
    this.session.setBlueprintDraft(null)
    this.emitSelectionChanged()
  }

    /** 设置 Active Page。 */
setActivePage(pageId: string, options: { forceReset?: boolean } = {}): void {
    const normalizedPageId = pageId.trim()
    if (!normalizedPageId) {
      this.clearActivePage()
      return
    }
    if (options.forceReset === true && this.getActivePage()?.pageId === normalizedPageId) {
      this.closePageDesign(normalizedPageId)
    }
    this.openPageDesign(normalizedPageId)
    this.session.setActivePageId(normalizedPageId)
    const mountedNode = this.design.findConfigPageByPageId(normalizedPageId)?.toNodeData() ?? null
    if (mountedNode) {
      this.session.setSelectedNodeId(mountedNode.id, { silentIfMissing: true })
    }
    this.emitSelectionChanged()
  }

    /** 清空 Active Page。 */
clearActivePage(): void {
    const activePageId = this.session.session.activePageId
    this.session.setActivePageId(null)
    if (activePageId) this.closePageDesign(activePageId)
    this.emitSelectionChanged()
  }

    /** 读取 Active Page。 */
getActivePage(): ConfigPageNode | null {
    const activePageId = this.session.session.activePageId
    if (!activePageId) return null
    return this.design.findConfigPageByPageId(activePageId)
  }

beginBlueprintDraft(): BlueprintNodeDraft {
    const node = this.requireSelectedNode('未选中蓝图节点，无法开始蓝图编辑')
    return this.session.beginBlueprintDraft(createBlueprintNodeDraft(node))
  }

discardBlueprintDraft(): void {
    this.session.discardBlueprintDraft()
    this.emitBlueprintChanged({ scope: 'node' })
  }

markBlueprintClean(scope: 'root' | 'node' = 'node'): void {
    this.session.markBlueprintClean()
    this.emitBlueprintChanged({ scope })
  }

applyBlueprintNodeEdit(draft: BlueprintNodeDraft): BlueprintNodeDraftApplyResult {
    const selected = this.requireSelectedNode('未选中蓝图节点，无法编辑蓝图属性')
    if (selected.id !== draft.node.id) {
      throw new Error(`蓝图编辑节点不匹配: ${draft.node.id} != ${selected.id}`)
    }
    const beforeKey = blueprintDraftContentKey(createBlueprintNodeDraft(selected))
    const { node, result } = this.design.applyBlueprintNodeEdit(draft)
    this.session.setSelectedNodeId(node.id)
    const nextDraft = createBlueprintNodeDraft(node.toNodeData())
    this.session.setBlueprintDraft(nextDraft)
    if (blueprintDraftContentKey(nextDraft) !== beforeKey) {
      this.session.markBlueprintDirty('node')
    }
    this.emitBlueprintChanged({ scope: 'node', nodeId: node.id })
    return result
  }

applyNodeKindPreset(kind: RuntimeNavigationItemKind): void {
    const node = this.requireSelectedNode('未选中蓝图节点，无法修改运行交付投影')
    const draft = this.session.blueprintDraft ?? createBlueprintNodeDraft(node)
    const nextDraft: BlueprintNodeDraft = {
      ...draft,
      node: applyNodeKindPresetToDraft(draft.node, kind),
    }
    this.applyBlueprintNodeEdit(nextDraft)
  }

    /** 嵌套配置页 preset：page + hidden + 无 path。 */
applyNestedConfigPagePreset(): void {
    const node = this.requireSelectedNode('未选中蓝图节点，无法修改运行交付投影')
    const draft = this.session.blueprintDraft ?? createBlueprintNodeDraft(node)
    const nextDraft: BlueprintNodeDraft = {
      ...draft,
      node: applyNestedConfigPagePresetToDraft(draft.node),
    }
    this.applyBlueprintNodeEdit(nextDraft)
  }

  /**
   * 写入指定配置页四文件文本到内存模型。
   *
   * @param command 页面文件写入命令，包含目标 pageId、文件名和新文本。
   */
  writePageFile(command: ProjectPageFileWriteCommand): void {
    const page = this.requirePageDesign(command.pageId)
    page.setFileText(command.fileName, command.text)
    this.emitPageFileChanged(page.pageId, command.fileName)
  }

  /**
   * 读取指定配置页四文件文本。
   *
   * @param fileName 四文件名。
   * @param pageId 可选 pageId；省略时使用当前 activePage。
   */
  readPageFileText(fileName: PageNodeFileName, pageId?: string): string {
    return this.findPageDesign(pageId)?.getFileText(fileName) ?? ''
  }

    /** 是否 is Active Page Loaded。 */
isActivePageLoaded(): boolean {
    return this.getActivePage()?.isLoaded === true
  }

    /** 是否 can Undo Page File。 */
canUndoPageFile(fileName: PageNodeFileName): boolean {
    return this.getActivePage()?.canUndoFile(fileName) ?? false
  }

    /** 是否 can Redo Page File。 */
canRedoPageFile(fileName: PageNodeFileName): boolean {
    return this.getActivePage()?.canRedoFile(fileName) ?? false
  }

undoPageFile(fileName: PageNodeFileName): boolean {
    const page = this.getActivePage()
    if (!page) return false
    const ok = page.undoFile(fileName)
    if (ok) this.emitPageFileChanged(page.pageId, fileName)
    return ok
  }

redoPageFile(fileName: PageNodeFileName): boolean {
    const page = this.getActivePage()
    if (!page) return false
    const ok = page.redoFile(fileName)
    if (ok) this.emitPageFileChanged(page.pageId, fileName)
    return ok
  }

    /** 读取 Data Set Tool。 */
getDataSetTool(): DataSetCrudTool | null {
    return this.getActivePage()?.getDataSetTool() ?? null
  }

  /**
   * 通过 DataSetCrudTool 修改当前 active 页的 pagedata.json 内存模型。
   *
   */
  async editDataSet(run: (tool: DataSetCrudTool) => void | Promise<void>): Promise<void> {
    const page = this.requireActivePageDesign()
    await page.editDataSet(run)
    this.emitPageFileChanged(page.pageId, 'pagedata.json')
  }

    /** 读取 Node Tree。 */
getNodeTree(): SparkNodeTreeModel | null {
    return this.getActivePage()?.getNodeTree() ?? null
  }

  /**
   * 通过 SparkNodeTree 修改当前 active 页的 rule.json 节点树。
   *
   */
  async editNodeTree(run: (tree: SparkNodeTreeModel) => void | Promise<void>): Promise<void> {
    const page = this.requireActivePageDesign()
    await page.editNodeTree(run)
    this.emitPageFileChanged(page.pageId, 'rule.json')
  }

markPageFileChanged(pageId: string, fileName: PageNodeFileName): void {
    this.emitPageFileChanged(pageId, fileName)
  }

markPageLoadedChanged(pageId: string, loaded: boolean): void {
    const page = this.design.findConfigPageByPageId(pageId)
    if (page) {
      if (loaded) page.markLoaded()
      else page.markUnloaded()
    }
    this.emitRuntimeChanged({ pageId })
  }

  /**
   * 读取承载轴投影：项目蓝图、选中节点与 pageDeliveries。
   *
   */
  readBlueprintProjection(): ProjectBlueprintProjection {
    const blueprintTree = this.design.blueprintTree
    const tree = blueprintTree.children
    const selectedNodeId = this.session.session.selectedNodeId
    const selectedNode = selectedNodeId
      ? this.design.findNodeById(selectedNodeId)?.toNodeData() ?? null
      : null
    const blueprintLocation = selectedNode
      ? this.design.findNodeLocation(selectedNode.id)
      : null
    const blueprintDraft = selectedNode
      ? this.session.blueprintDraft ?? createBlueprintNodeDraft(selectedNode)
      : null
    const pageDeliveries = this.design.readPlanningProjection()

    return {
      blueprint: blueprintTree,
      tree,
      selectedNode,
      selectedNodeId,
      blueprintLocation,
      blueprintDraft,
      pageDeliveries,
    }
  }

readActivePageProjection(): ProjectActivePageProjection {
    const activePage = this.getActivePage()
    const pageId = activePage?.pageId ?? ''
    const parseErrors: Record<PageNodeFileName, string | null> = {
      'rule.json': null,
      'pagedata.json': null,
      'script.js': null,
      'style.css': null,
    }

    if (activePage) {
      parseErrors['rule.json'] = tryParseRuleTextError(activePage.getFileText('rule.json'))
      parseErrors['pagedata.json'] = tryParsePageDataTextError(
        activePage.getFileText('pagedata.json'),
        activePage.pageId,
      )
    }

    return {
      pageId,
      ruleJson: activePage?.getFileText('rule.json') ?? '',
      pageDataJson: activePage?.getFileText('pagedata.json') ?? '',
      script: activePage?.getFileText('script.js') ?? '',
      style: activePage?.getFileText('style.css') ?? '',
      parseErrors,
      isLoaded: activePage?.isLoaded === true,
    }
  }

readDirtyProjection(): ProjectDirtyProjection {
    const activePage = this.getActivePage()
    const dirtyFiles = new Set<PageNodeFileName>()
    if (activePage) {
      for (const name of activePage.getDirtyFileNames()) dirtyFiles.add(name)
    }
    const hasAnyFileDirty = dirtyFiles.size > 0
    const blueprintDirty = this.session.blueprintDirty
    return {
      dirtyFiles,
      hasAnyFileDirty,
      blueprintDirty,
      hasAnyDirty: hasAnyFileDirty || blueprintDirty,
    }
  }

  private requireSelectedNode(message: string): ProjectBlueprintTreeNodeData {
    const selectedNodeId = this.session.session.selectedNodeId
    if (!selectedNodeId) throw new Error(message)
    const node = this.design.findNodeById(selectedNodeId)?.toNodeData() ?? null
    if (!node) throw new Error(message)
    return node
  }

  private requirePageDesign(pageId: string | undefined): ConfigPageNode {
    const normalized = pageId?.trim() ?? this.session.session.activePageId ?? ''
    if (!normalized) throw new Error('无活动页面')
    return this.openPageDesign(normalized)
  }

  private requireActivePageDesign(): ConfigPageNode {
    const page = this.getActivePage()
    if (!page) throw new Error('无活动页面')
    return page
  }

  private findPageDesign(pageId?: string): ConfigPageNode | null {
    const normalized = pageId?.trim() ?? ''
    return normalized ? this.design.findConfigPageByPageId(normalized) : this.getActivePage()
  }

  private emitBlueprintChanged(event: { scope: 'root' | 'node'; nodeId?: string }): void {
    const revision = this.nextRevision()
    const modelEvent = {
      type: 'blueprint.changed' as const,
      projectId: this.projectId,
      revision,
      scope: event.scope,
      ...(event.nodeId === undefined ? {} : { nodeId: event.nodeId }),
    }
    this.publish(modelEvent)
  }

  private emitSelectionChanged(): void {
    const revision = this.nextRevision()
    this.publish({
      type: 'selection.changed',
      projectId: this.projectId,
      revision,
      nodeId: this.session.session.selectedNodeId,
      pageId: this.session.session.activePageId,
    })
  }

  private emitPageFileChanged(pageId: string, fileName: PageNodeFileName): void {
    const revision = this.nextRevision()
    this.publish({
      type: 'page.file.changed',
      projectId: this.projectId,
      revision,
      pageId,
      fileName,
    })
  }

  private emitRuntimeChanged(event: { pageId?: string }): void {
    const revision = this.nextRevision()
    this.publish({
      type: 'runtime.changed',
      projectId: this.projectId,
      revision,
      ...(event.pageId === undefined ? {} : { pageId: event.pageId }),
    })
  }

  private nextRevision(): number {
    this.revisionCounter += 1
    return this.revisionCounter
  }

  private publish(event: Parameters<ProjectModelEventListener>[0]): void {
    for (const listener of this.listeners) listener(event)
  }
}

function toBlueprintTreeNodeData(root: ProjectBlueprintTreeData): ProjectBlueprintTreeNodeData | null {
  const id = root.id?.trim()
  if (id === undefined || id.length === 0) return null
  return {
    ...root,
    id,
    title: root.title,
    nodeKind: root.nodeKind ?? 'module',
  }
}

function flattenProjectBlueprintNodes(
  nodes: readonly ProjectBlueprintTreeNodeData[],
): ProjectBlueprintTreeNodeData[] {
  const flattened: ProjectBlueprintTreeNodeData[] = []
  for (const node of nodes) {
    flattened.push(node)
    if (Array.isArray(node.children)) {
      flattened.push(...flattenProjectBlueprintNodes(node.children))
    }
  }
  return flattened
}

function readResolvedProjectBlueprintKind(node: ProjectBlueprintTreeNodeData): ProjectBlueprintNodeKind {
  const kind = node.blueprintKind
  if (kind === undefined || kind === 'unresolved') {
    throw new Error(`项目蓝图节点业务类型未解析: ${node.id}`)
  }
  return kind
}

function resolvePlanningAttachmentRef(
  primaryRef: string | undefined,
  fallbackRef: string | undefined,
): string | undefined {
  const primary = primaryRef?.trim()
  if (primary !== undefined && primary.length > 0) return primary
  const fallback = fallbackRef?.trim()
  return fallback === undefined || fallback.length === 0 ? undefined : fallback
}

function toBlueprintPlanningInput(node: ProjectBlueprintTreeNodeData): BlueprintPlanningInput {
  const requirement = readProjectNodeDescription(node)
  const planningAttachmentRef = resolvePlanningAttachmentRef(node.planningAttachmentRef, undefined)
  return {
    nodeId: node.id,
    title: node.title,
    blueprintKind: node.blueprintKind ?? 'unresolved',
    nodeKind: node.nodeKind ?? 'page',
    requirement,
    ...(planningAttachmentRef === undefined ? {} : { planningAttachmentRef }),
  }
}
