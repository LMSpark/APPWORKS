/**
 * @module @spark-appworks/spark-project-model:project/project-design
 * 职责：项目身份、节点索引和独立页面工具owner。
 * 边界：蓝图节点与工具不互相继承，工具dirty不随树重载丢弃。
 * AI用途：经ProjectBlueprint编辑节点或打开明确pageId工具。
 */
import { deepClone } from '@spark-appworks/spark-utils'
import { ProjectBlueprintNode } from '../blueprint/project-blueprint-node'
import type { ProjectDescriptionContext, ProjectBlueprintTreeData, ProjectBlueprintTreeNodeData, ProjectBlueprintTreeNodeLocation, ProjectPageNodeSummary } from '../blueprint/project-blueprint-node'
import type { BlueprintNodeDraftApplyResult, BlueprintNodeDraft } from '../blueprint/project-blueprint-edit'
import { applyBlueprintNodeDraftToNode } from '../blueprint/project-blueprint-edit'
import { PageTool } from '../page/page-tool'
import { appendProjectDescriptionContext, buildProjectPageSummaries, flattenProjectBlueprintTree, normalizeBlueprintTree } from '../blueprint/project-blueprint-tree'
import { ProjectBlueprintIndex } from '../blueprint/project-blueprint-index'
import type { ProjectInfo, ProjectInfoInput, ProjectBlueprintInitOptions } from './project-types'
export type { ProjectInfo, ProjectInfoInput } from './project-types'
/** 实际编辑节点实体及其分组补丁诊断。 */
export type ProjectBlueprintDesignNodeEditResult = { node: ProjectBlueprintNode; result: BlueprintNodeDraftApplyResult }

/** 固定项目身份下持有节点索引与独立PageTool集合，蓝图重载保留工具编辑态。 */
export class ProjectBlueprintDesign {
  readonly #projectId: string
  #info: ProjectInfo
  readonly #tools = new Map<string,PageTool>()
  readonly #nodes = new Map<string,ProjectBlueprintNode>()
  readonly #index = new ProjectBlueprintIndex(this.#nodes)
  /** 绑定明确项目身份，不捏造可保存蓝图根；节点由真实装载提供。 */
  constructor(options: ProjectBlueprintInitOptions) {
    const id = options.projectId.trim(); if (!id) throw new Error('projectId 不能为空')
    this.#projectId = id; this.#info = { projectId: id, name: id, projectType: 'app', description: '', order: 0 }; this.replaceProjectInfo(options.project ?? {})
  }
  get projectId(): string { return this.#projectId }
  get tenantId(): string | undefined { return this.#info.tenantId }
  get name(): string { return this.#info.name }
  get projectType(): string { return this.#info.projectType }
  get icon(): string | undefined { return this.#info.icon }
  get description(): string { return this.#info.description }
  get homeNodeId(): string | undefined { return this.#info.homeNodeId }
  get homeNode(): ProjectBlueprintNode | null { return this.homeNodeId ? this.findNodeById(this.homeNodeId) : null }
  get rootNode(): ProjectBlueprintNode | null { return this.getChildNodes('')[0] ?? null }
  get order(): number { return this.#info.order }
  get createdAt(): string | undefined { return this.#info.createdAt }
  get updatedAt(): string | undefined { return this.#info.updatedAt }
  get projectInfo(): ProjectInfo { return deepClone(this.#info) }
  get blueprintTree(): ProjectBlueprintTreeData {
    const root = this.#index.buildTree()[0]
    if (!root) throw new Error('项目蓝图根节点未加载')
    return { ...deepClone(root), children: deepClone(root.children ?? []) }
  }
  get pages(): Iterable<PageTool> { return this.#tools.values() }
  get flatRows(): ProjectBlueprintNode[] { return [...this.#nodes.values()] }
  getChildNodes(nodeId=''): ProjectBlueprintNode[] { return [...this.#index.getChildren(nodeId)] }
  forEachNode(callback: (node:ProjectBlueprintNode)=>void): void { this.#nodes.forEach(callback) }
  replaceProjectInfo(input: ProjectInfoInput): ProjectInfo { if (input.projectId && input.projectId !== this.projectId) throw new Error('项目ID不匹配'); this.#info = { ...this.#info, ...deepClone(input), projectId:this.projectId }; return this.projectInfo }
  replaceBlueprintTree(input: ProjectBlueprintTreeData): ProjectBlueprintTreeData {
    const root = normalizeBlueprintTree(input)
    if (root.projectId !== this.projectId) throw new Error('项目蓝图属于其他项目')
    const entries = flattenProjectBlueprintTree(root)
    for (const entry of entries) if (entry.node.projectId !== this.projectId) throw new Error(`蓝图节点属于其他项目: ${entry.node.nodeId}`)
    const previous = new Map(this.#nodes); this.#nodes.clear()
    for (const entry of entries) {
      if (entry.node.projectId !== this.projectId) throw new Error(`蓝图节点属于其他项目: ${entry.node.nodeId}`)
      const node = previous.get(entry.node.nodeId) ?? this.#instantiate(entry.node,entry.pid)
      node.rebindBlueprintNode(entry.node,entry.pid,[]); this.#nodes.set(node.id,node)
    }
    this.#index.rebuild(); this.refreshNavRefs(); return this.blueprintTree
  }
  replaceBlueprintChildren(children: ProjectBlueprintTreeNodeData[]): ProjectBlueprintTreeData { return this.replaceBlueprintTree({ ...this.blueprintTree, children }) }
  findNodeById(id:string): ProjectBlueprintNode|null { return this.#nodes.get(id.trim()) ?? null }
  findNodeLocation(id:string): ProjectBlueprintTreeNodeLocation|null { return this.#index.findNodeLocation(id) }
  findPageTool(pageId:string): PageTool|null { return this.#tools.get(pageId.trim()) ?? null }
  openPageDesign(pageId:string): PageTool { const id=pageId.trim(); if(!id) throw new Error('pageId不能为空'); const existing=this.#tools.get(id); if(existing)return existing; const tool=new PageTool({pageId:id}); this.#tools.set(id,tool); return tool }
  closePageDesign(pageId:string): void { const id=pageId.trim();if(this.#tools.get(id)?.isDirty())throw new Error('PAGE_TOOL_DIRTY: 页面工具仍有未保存编辑');this.#tools.delete(id) }
  applyBlueprintNodeEdit(input:BlueprintNodeDraft): ProjectBlueprintDesignNodeEditResult { const node=this.findNodeById(input.node.nodeId); if(!node)throw new Error(`项目节点未找到: ${input.node.nodeId}`); const result=applyBlueprintNodeDraftToNode(node,input); this.#index.rebuild(); this.refreshNavRefs(); return {node,result} }
  readPlanningProjection(): ProjectPageNodeSummary[] { return buildProjectPageSummaries(this.#index.buildTree(),{descriptionContext:this.#projectContext()}) }
  addRootModule(createId:()=>string): ProjectBlueprintTreeNodeData { return this.#add(createId(),'module','新模块',this.rootNode?.id ?? '') }
  addChildPage(createId:()=>string,parent:ProjectBlueprintTreeNodeData|null=null): ProjectBlueprintTreeNodeData { return this.#add(createId(),'page','新页面',parent?.nodeId ?? this.rootNode?.id ?? '') }
  removeNode(id:string): ProjectBlueprintTreeNodeData|null { const node=this.findNodeById(id); if(!node)throw new Error(`项目节点未找到: ${id}`); const data=node.toNodeData(); for(const child of this.#index.collectDescendants(id))this.#nodes.delete(child.id); this.#nodes.delete(id); this.#index.rebuild(); return data }
  refreshNavRefs():void {
    const visit=(pid:string,context:ProjectDescriptionContext[]):void=>{ for(const node of this.#index.getChildren(pid)){const data=node.toNodeData();const next=appendProjectDescriptionContext(context,data);node.rebindBlueprintNode(data,pid,next);visit(node.id,next)} }
    visit('',this.#projectContext());this.#index.invalidateTree()
  }
  toTree():ProjectBlueprintTreeNodeData[] { return deepClone(this.#index.buildTree()) }
  #projectContext():ProjectDescriptionContext[] { return this.description ? [{nodeId:this.projectId,title:this.name,nodeKind:'project',description:this.description}] : [] }
  #instantiate(data:ProjectBlueprintTreeNodeData,pid:string):ProjectBlueprintNode { return new ProjectBlueprintNode({node:data,pid}) }
  #add(nodeId:string,kind:'module'|'page',name:string,pid:string):ProjectBlueprintTreeNodeData { if(!pid)throw new Error('项目蓝图根节点未加载');if(this.#nodes.has(nodeId))throw new Error('节点ID重复');const data:ProjectBlueprintTreeNodeData={nodeId,parentNodeId:pid,projectId:this.projectId,kind,capability:{name},navigation:{title:name,order:this.#index.nextChildOrder(pid),publishInMenu:true,showChildren:true,beginGroup:false},source:{}};this.#nodes.set(nodeId,this.#instantiate(data,pid));this.#index.rebuild();this.refreshNavRefs();return data }
}