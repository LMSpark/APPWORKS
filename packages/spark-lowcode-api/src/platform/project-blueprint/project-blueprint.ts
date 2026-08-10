import { LowcodeApiError } from '../../core/lowcode-api-error.js'
import type { RuntimeNavigationAuthorizationEvidence } from '../lowcode-navigation.js'
import {
  projectRuntimeNavigation,
  type RuntimeNavigation,
} from './outputs/runtime-navigation.js'
import { ProjectBlueprintDocumentOutputs } from './outputs/document/project-blueprint-document.js'
import {
  ProjectBlueprintAiOutputs,
  ProjectBlueprintGovernanceOutputs,
  ProjectBlueprintPlanningOutputs,
  pageRuntimeClosures,
  type ProjectBlueprintIdentityEvidence,
  type ProjectBlueprintPageRuntimeClosure,
} from './outputs/project-blueprint-output-groups.js'

export type ProjectBlueprintNodeSnapshot = Readonly<{
  id: string
  parentId: string
  projectId: string
  title: string
  kind: ProjectBlueprintNodeKind
  description: string
  legacyContentId: string
  legacyContentType: string
  runtimeTarget: string
  runtimeNavigationCandidate: boolean
  order: number
  source: Readonly<Record<string, unknown>>
}>

export type ProjectBlueprintNodeKind =
  | 'project'
  | 'module'
  | 'requirement'
  | 'prototype'
  | 'data-space'
  | 'page'
  | 'sub-page'
  | 'report'
  | 'workflow'
  | 'integration'
  | 'action'
  | 'external'
  | 'permission-management'
  | 'unresolved'

export type ProjectBlueprintMutationCapability =
  | 'update-planning-content'
  | 'move-node'
  | 'bind-data-space'
  | 'update-delivery'
  | 'update-feature-tags'
  | 'update-permission-design'

function nodeCapabilities(kind: ProjectBlueprintNodeKind): readonly ProjectBlueprintMutationCapability[] {
  if (kind === 'project') return ['update-planning-content']
  if (kind === 'module' || kind === 'requirement' || kind === 'prototype') {
    return ['update-planning-content', 'move-node']
  }
  if (kind === 'data-space') return ['move-node', 'bind-data-space']
  if (kind === 'page' || kind === 'sub-page' || kind === 'report') {
    return ['move-node', 'bind-data-space', 'update-delivery', 'update-feature-tags']
  }
  if (kind === 'permission-management') return ['move-node', 'update-permission-design']
  if (kind === 'workflow' || kind === 'integration' || kind === 'action' || kind === 'external') {
    return ['move-node', 'update-delivery', 'update-feature-tags']
  }
  return []
}

export type ProjectBlueprintTreeNode = Readonly<{
  node: ProjectBlueprintNode
  children: readonly ProjectBlueprintTreeNode[]
}>

export type ProjectBlueprintStructure = Readonly<{
  flat: readonly ProjectBlueprintNode[]
  hierarchy: readonly ProjectBlueprintTreeNode[]
  diagnostics: readonly ProjectBlueprintDiagnostic[]
}>

export type ProjectBlueprintDiagnostic = Readonly<{
  code: 'missing-parent' | 'missing-explicit-root'
  nodeId: string
  message: string
}>

function nonEmptyText(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) throw new LowcodeApiError(0, `${name} 不能为空`)
  return normalized
}

export class ProjectBlueprintNode {
  readonly #snapshot: ProjectBlueprintNodeSnapshot

  public constructor(snapshot: ProjectBlueprintNodeSnapshot) {
    this.#snapshot = Object.freeze({
      ...snapshot,
      id: nonEmptyText(snapshot.id, 'ProjectBlueprintNode.id'),
      projectId: nonEmptyText(snapshot.projectId, 'ProjectBlueprintNode.projectId'),
      source: Object.freeze({ ...snapshot.source }),
    })
  }

  public get id(): string { return this.#snapshot.id }
  public get parentId(): string { return this.#snapshot.parentId }
  public get projectId(): string { return this.#snapshot.projectId }
  public get title(): string { return this.#snapshot.title }
  public get kind(): ProjectBlueprintNodeKind { return this.#snapshot.kind }
  public get description(): string { return this.#snapshot.description }
  public get legacyContentId(): string { return this.#snapshot.legacyContentId }
  public get legacyContentType(): string { return this.#snapshot.legacyContentType }
  public get runtimeTarget(): string { return this.#snapshot.runtimeTarget }
  public get runtimeNavigationCandidate(): boolean { return this.#snapshot.runtimeNavigationCandidate }
  public get order(): number { return this.#snapshot.order }
  public get source(): Readonly<Record<string, unknown>> { return this.#snapshot.source }
  public get capabilities(): readonly ProjectBlueprintMutationCapability[] {
    return nodeCapabilities(this.kind)
  }

  public toSnapshot(): ProjectBlueprintNodeSnapshot {
    return this.#snapshot
  }
}

export class ProjectBlueprintOutputs {
  public readonly structure: ProjectBlueprintStructureOutputs
  public readonly planning: ProjectBlueprintPlanningOutputs
  public readonly delivery: ProjectBlueprintDeliveryOutputs
  public readonly document: ProjectBlueprintDocumentOutputs
  public readonly governance: ProjectBlueprintGovernanceOutputs
  public readonly ai: ProjectBlueprintAiOutputs

  public constructor(
    projectId: string,
    nodes: readonly ProjectBlueprintNode[],
    diagnostics: readonly ProjectBlueprintDiagnostic[],
  ) {
    this.structure = new ProjectBlueprintStructureOutputs(nodes, diagnostics)
    this.planning = new ProjectBlueprintPlanningOutputs(projectId, nodes)
    this.delivery = new ProjectBlueprintDeliveryOutputs(projectId, nodes)
    this.document = new ProjectBlueprintDocumentOutputs(projectId, nodes)
    this.governance = new ProjectBlueprintGovernanceOutputs(projectId, nodes)
    this.ai = new ProjectBlueprintAiOutputs(projectId, nodes)
  }
}

export class ProjectBlueprintStructureOutputs {
  public constructor(
    private readonly nodes: readonly ProjectBlueprintNode[],
    private readonly diagnostics: readonly ProjectBlueprintDiagnostic[],
  ) {}

  public snapshot(): ProjectBlueprintStructure {
    return {
      flat: this.nodes,
      hierarchy: buildHierarchy(this.nodes),
      diagnostics: this.diagnostics,
    }
  }
}

export class ProjectBlueprintDeliveryOutputs {
  public constructor(
    private readonly projectId: string,
    private readonly nodes: readonly ProjectBlueprintNode[],
  ) {}

  public runtimeNavigation(evidence: RuntimeNavigationAuthorizationEvidence): RuntimeNavigation {
    return projectRuntimeNavigation(this.projectId, this.nodes, evidence)
  }

  public pageRuntimeClosures(
    identityEvidence: readonly ProjectBlueprintIdentityEvidence[],
  ): readonly ProjectBlueprintPageRuntimeClosure[] {
    return pageRuntimeClosures(this.projectId, this.nodes, identityEvidence)
  }
}

export class ProjectBlueprint {
  readonly #nodes: readonly ProjectBlueprintNode[]
  public readonly outputs: ProjectBlueprintOutputs

  public constructor(projectId: string, nodes: readonly ProjectBlueprintNode[]) {
    this.projectId = nonEmptyText(projectId, 'ProjectBlueprint.projectId')
    const diagnostics = validateNodes(this.projectId, nodes)
    this.#nodes = Object.freeze([...nodes])
    this.outputs = new ProjectBlueprintOutputs(this.projectId, this.#nodes, diagnostics)
  }

  public readonly projectId: string

  public get nodes(): readonly ProjectBlueprintNode[] {
    return this.#nodes
  }

  public findNode(nodeId: string): ProjectBlueprintNode | null {
    const normalized = nonEmptyText(nodeId, 'nodeId')
    return this.#nodes.find(node => node.id === normalized) ?? null
  }
}

function isRootParent(parentId: string): boolean {
  return parentId === '' || parentId === '0' || parentId === '000000'
}

function sortNodes(nodes: readonly ProjectBlueprintNode[]): ProjectBlueprintNode[] {
  return [...nodes].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}

function validateNodes(
  projectId: string,
  nodes: readonly ProjectBlueprintNode[],
): readonly ProjectBlueprintDiagnostic[] {
  const byId = new Map<string, ProjectBlueprintNode>()
  for (const node of nodes) {
    if (node.projectId !== projectId) {
      throw new LowcodeApiError(0, `蓝图节点 ${node.id} 属于其他项目 ${node.projectId}`)
    }
    if (byId.has(node.id)) throw new LowcodeApiError(0, `蓝图节点 id 重复：${node.id}`)
    byId.set(node.id, node)
  }

  const diagnostics: ProjectBlueprintDiagnostic[] = []
  for (const node of nodes) {
    if (!isRootParent(node.parentId) && !byId.has(node.parentId)) {
      diagnostics.push({
        code: 'missing-parent',
        nodeId: node.id,
        message: `蓝图节点 ${node.id} 的父节点不存在：${node.parentId}`,
      })
    }
  }
  if (nodes.length > 0 && !nodes.some(node => isRootParent(node.parentId))) {
    diagnostics.push({
      code: 'missing-explicit-root',
      nodeId: '',
      message: '项目蓝图没有显式顶层节点，已按缺失父节点投影为顶层记录',
    })
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (node: ProjectBlueprintNode): void => {
    if (visiting.has(node.id)) throw new LowcodeApiError(0, `项目蓝图存在循环：${node.id}`)
    if (visited.has(node.id)) return
    visiting.add(node.id)
    if (!isRootParent(node.parentId)) {
      const parent = byId.get(node.parentId)
      if (parent !== undefined) visit(parent)
    }
    visiting.delete(node.id)
    visited.add(node.id)
  }
  for (const node of nodes) visit(node)
  return Object.freeze(diagnostics)
}

function buildHierarchy(nodes: readonly ProjectBlueprintNode[]): readonly ProjectBlueprintTreeNode[] {
  const childrenByParent = new Map<string, ProjectBlueprintNode[]>()
  for (const node of nodes) {
    const siblings = childrenByParent.get(node.parentId) ?? []
    siblings.push(node)
    childrenByParent.set(node.parentId, siblings)
  }

  const build = (node: ProjectBlueprintNode): ProjectBlueprintTreeNode => ({
    node,
    children: sortNodes(childrenByParent.get(node.id) ?? []).map(build),
  })
  const nodeIds = new Set(nodes.map(node => node.id))
  return sortNodes(nodes.filter(node => isRootParent(node.parentId) || !nodeIds.has(node.parentId))).map(build)
}
