/**
 * @module @spark-appworks/spark-project-model:blueprint/project-blueprint-node
 * 职责：正式五种节点身份、四组数据与节点实体。
 * 边界：持久组是唯一真源，导航表面只是读投影。
 * AI用途：读取节点能力、导航、场景或原型合同。
 */
import { deepClone, isRecord } from '@spark-appworks/spark-utils'
import type { ProjectBlueprintNodeKind, RuntimeNavigationItemKind } from '@spark-appworks/spark-utils'

/** 业务能力名称、说明与交付责任；不同于导航展示标题。 */
type BlueprintCapability = { name: string; description?: string; code?: string; ownerId?: string; deliveryStatus?: string }
/** 导航展示、目标与布局，不能反向决定正式业务kind。 */
type BlueprintNavigation = { title: string; icon?: string; order: number; placement?: 'top' | 'left' | 'right' | 'parent' | 'tabs' | 'popup'; target?: string; mobileTarget?: string; openMode?: 'subsystem' | 'current' | 'new-window' | 'modal' | 'embedded'; displayMode?: string; horizontalAlignment?: string; publishInMenu: boolean; showChildren: boolean; beginGroup: boolean }
/** 正式场景绑定；models是后端定义依赖的只读投影，不是导航可写字段。 */
type BlueprintDataSpace = { scenarioId: string; models: ReadonlyArray<{ metaName: string }> }
/** 节点原型的HTML说明，不承载运行页面定义。 */
type BlueprintPrototype = { htmlDescription?: string }
/** 后端原始元数据读投影，写入仅限实际API允许字段。 */
type BlueprintSource = Record<string, unknown>

/** SPARK 节点四组是唯一持久合同；children 仅为树投影。 */
export type ProjectBlueprintTreeNodeData = {
  nodeId: string
  parentNodeId: string
  projectId: string
  kind: ProjectBlueprintNodeKind | 'unknown'
  capability: BlueprintCapability
  navigation?: BlueprintNavigation
  dataSpace?: BlueprintDataSpace
  prototype?: BlueprintPrototype
  source: BlueprintSource
  children?: ProjectBlueprintTreeNodeData[]
}
/** 正式根节点及完整children树；合成展示根不得作为持久资产写入。 */
export type ProjectBlueprintTreeData = ProjectBlueprintTreeNodeData & { children: ProjectBlueprintTreeNodeData[] }
/** 仅包含业务kind和正式分组的节点更新载荷。 */
export type ProjectBlueprintNodePatch = Pick<ProjectBlueprintTreeNodeData, 'kind' | 'capability' | 'navigation' | 'dataSpace' | 'prototype' | 'source'>
/** 策划交付诊断使用的门禁状态；不能据此推断真实后端写能力。 */
export type ProjectBlueprintImplGate = 'closed' | 'open'
/** 祖先及当前节点能力说明的策划上下文读投影。 */
export type ProjectDescriptionContext = { nodeId: string; title: string; nodeKind: string; description: string }
/** 导航交付表面，用于选择工具、原生资源或链接消费者。 */
export type ProjectPageSurface = 'config-files' | 'system-page' | 'link' | 'none'
/** 由正式节点生成的交付摘要，不是独立可写节点真源。 */
export type ProjectPageNodeSummary = Record<string, unknown> & { pageId: string; path: string; title: string; nodeId: string; nodeKind: RuntimeNavigationItemKind; designSurface: ProjectPageSurface; description: string; planningAttachmentRef?: string; descriptionContext: ProjectDescriptionContext[]; effectiveDescription: string; implGate?: ProjectBlueprintImplGate; upstreamContractsSatisfied?: boolean; icon?: string }
/** 节点在树中的父节点和兄弟位置，移动由Workspace提交。 */
export type ProjectBlueprintTreeNodeLocation = { node: ProjectBlueprintTreeNodeData; parent: ProjectBlueprintTreeNodeData | null; parentId: string | null; index: number }
/** 构造节点的正式数据、明确父身份与策划说明上下文。 */
export type ProjectBlueprintNodeModelOptions = { node: ProjectBlueprintTreeNodeData; pid: string; descriptionContext?: readonly ProjectDescriptionContext[] }

export function normalizePid(value: string | null | undefined): string { return value?.trim() ?? '' }
export function readProjectNodeDescription(node: ProjectBlueprintTreeNodeData | null | undefined): string { return node?.capability.description?.trim() ?? '' }
export function formatProjectDescriptionContext(context: readonly ProjectDescriptionContext[]): string { return context.map(item => `${item.title}: ${item.description}`).join('\n') }
export function isProjectBlueprintTreeNodeData(value: unknown): value is ProjectBlueprintTreeNodeData {
  if (!isRecord(value) || typeof value['kind'] !== 'string' || typeof value['nodeId'] !== 'string' || typeof value['parentNodeId'] !== 'string' || typeof value['projectId'] !== 'string' || !isRecord(value['capability']) || typeof value['capability']['name'] !== 'string' || !isRecord(value['source'])) return false
  return value['children'] === undefined || (Array.isArray(value['children']) && value['children'].every(isProjectBlueprintTreeNodeData))
}
/** UI 导航表面从正式 kind/target 投影，不能再反向决定业务种类。 */
export function projectNodeDeliveryKind(node: ProjectBlueprintTreeNodeData): RuntimeNavigationItemKind {
  if (node.kind === 'module') return 'module'
  if (node.kind === 'embedded') return 'link'
  if (node.kind === 'service') return 'system-action'
  return node.navigation?.target?.startsWith('cfg:') === true || node.navigation?.target?.startsWith('/__page/') === true ? 'page' : 'system-page'
}
function snapshot(node: ProjectBlueprintTreeNodeData): ProjectBlueprintTreeNodeData { const result = deepClone(node); delete result.children; return result }
/** 正式节点四组数据的唯一内存owner；id/title等仅是UI读投影，不持页面工具。 */
export class ProjectBlueprintNode {
  #node: ProjectBlueprintTreeNodeData
  #descriptionContext: ProjectDescriptionContext[]
  /** 复制正式节点数据，绑定明确父身份及说明上下文。 */
  constructor(options: ProjectBlueprintNodeModelOptions) { this.#node = snapshot(options.node); this.#node.parentNodeId = normalizePid(options.pid); this.#descriptionContext = [...(options.descriptionContext ?? [])] }
  get id(): string { return this.#node.nodeId }
  get pid(): string { return this.#node.parentNodeId }
  get kind(): ProjectBlueprintTreeNodeData['kind'] { return this.#node.kind }
  get name(): string { return this.#node.capability.name }
  get title(): string { return this.#node.navigation?.title ?? this.name }
  get nodeKind(): RuntimeNavigationItemKind { return projectNodeDeliveryKind(this.#node) }
  get path(): string | undefined { return this.#node.navigation?.target }
  get icon(): string | undefined { return this.#node.navigation?.icon }
  get description(): string { return readProjectNodeDescription(this.#node) }
  get order(): number { return this.#node.navigation?.order ?? 0 }
  get version(): string | undefined { return typeof this.#node.source['VersionId'] === 'string' ? this.#node.source['VersionId'] : undefined }
  get planningAttachmentRef(): string | undefined { return typeof this.#node.source['planningAttachmentRef'] === 'string' ? this.#node.source['planningAttachmentRef'] : undefined }
  get implGate(): ProjectBlueprintImplGate { return this.#node.source['implGate'] === 'open' ? 'open' : 'closed' }
  get upstreamContractsSatisfied(): boolean { return this.#node.source['upstreamContractsSatisfied'] === true }
  protected get effectiveDescription(): string { return formatProjectDescriptionContext(this.#descriptionContext) }
  protected get descriptionContext(): ProjectDescriptionContext[] { return [...this.#descriptionContext] }
  toNodeData(): ProjectBlueprintTreeNodeData { return snapshot(this.#node) }
  applyBlueprintPatch(patch: ProjectBlueprintNodePatch): void { this.#node = snapshot({ nodeId: this.#node.nodeId, parentNodeId: this.#node.parentNodeId, projectId: this.#node.projectId, ...deepClone(patch) }) }
  rebindBlueprintNode(node: ProjectBlueprintTreeNodeData, pid: string, context: readonly ProjectDescriptionContext[]): void { this.#node = snapshot(node); this.#node.parentNodeId = normalizePid(pid); this.#descriptionContext = [...context] }
}
