import { LowcodeApiError } from '../../../core/lowcode-api-error.js'
import type { ProjectBlueprintNode } from '../project-blueprint.js'
import {
  ProjectBlueprintMutationPlanner,
} from '../capability/project-blueprint-mutation.js'

export type ProjectBlueprintPlanningContext = Readonly<{
  projectId: string
  nodes: ReadonlyArray<Readonly<{
    nodeId: string
    parentId: string
    title: string
    description: string
    legacyContentType: string
  }>>
}>

export type ProjectBlueprintIdentityEvidence = Readonly<{
  nodeId: string
  formKey: string
  dataSpaceId: string
  modelId: string
  componentKey: string
  routePath: string
}>

export type ProjectBlueprintPageRuntimeClosure = ProjectBlueprintIdentityEvidence & Readonly<{
  projectId: string
  title: string
}>

export type ProjectBlueprintGovernanceReport = Readonly<{
  projectId: string
  valid: boolean
  diagnostics: readonly string[]
  unresolvedNodeIds: readonly string[]
}>

export type ProjectBlueprintAiPlanningInput = Readonly<{
  kind: 'project-blueprint-planning-input'
  projectId: string
  nodes: ReadonlyArray<Readonly<{
    id: string
    parentId: string
    title: string
    requirement: string
  }>>
}>

function requiredText(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) throw new LowcodeApiError(0, `${name} 不能为空`)
  return normalized
}

export class ProjectBlueprintPlanningOutputs {
  public constructor(
    private readonly projectId: string,
    private readonly nodes: readonly ProjectBlueprintNode[],
  ) {}

  public context(): ProjectBlueprintPlanningContext {
    return {
      projectId: this.projectId,
      nodes: this.nodes.map((node) => ({
        nodeId: node.id,
        parentId: node.parentId,
        title: node.title,
        description: node.description,
        legacyContentType: node.legacyContentType,
      })),
    }
  }
}

export class ProjectBlueprintGovernanceOutputs {
  public constructor(
    private readonly projectId: string,
    private readonly nodes: readonly ProjectBlueprintNode[],
  ) {}

  public audit(identityEvidence: readonly ProjectBlueprintIdentityEvidence[] = []): ProjectBlueprintGovernanceReport {
    const evidenceByNode = new Map(identityEvidence.map((evidence) => [evidence.nodeId, evidence]))
    const unresolvedNodeIds: string[] = []
    const diagnostics: string[] = []
    for (const node of this.nodes) {
      if (!node.legacyContentId) continue
      const evidence = evidenceByNode.get(node.id)
      if (evidence === undefined) {
        unresolvedNodeIds.push(node.id)
        diagnostics.push(`节点 ${node.id} 的 legacy conid 尚未由 FormKey、数据空间和前端模型读回证据解析`)
      }
    }
    for (const evidence of identityEvidence) {
      if (!this.nodes.some((node) => node.id === evidence.nodeId)) {
        diagnostics.push(`身份闭包引用了蓝图中不存在的节点 ${evidence.nodeId}`)
      }
    }
    return {
      projectId: this.projectId,
      valid: diagnostics.length === 0,
      diagnostics,
      unresolvedNodeIds,
    }
  }

  public mutationPlanner(): ProjectBlueprintMutationPlanner {
    return new ProjectBlueprintMutationPlanner(this.projectId, this.nodes)
  }
}

export class ProjectBlueprintAiOutputs {
  public constructor(
    private readonly projectId: string,
    private readonly nodes: readonly ProjectBlueprintNode[],
  ) {}

  public planningInput(): ProjectBlueprintAiPlanningInput {
    return {
      kind: 'project-blueprint-planning-input',
      projectId: this.projectId,
      nodes: this.nodes.map((node) => ({
        id: node.id,
        parentId: node.parentId,
        title: node.title,
        requirement: node.description,
      })),
    }
  }
}

export function pageRuntimeClosures(
  projectId: string,
  nodes: readonly ProjectBlueprintNode[],
  identityEvidence: readonly ProjectBlueprintIdentityEvidence[],
): readonly ProjectBlueprintPageRuntimeClosure[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return identityEvidence.map((evidence) => {
    const node = byId.get(requiredText(evidence.nodeId, 'nodeId'))
    if (node === undefined) throw new LowcodeApiError(0, `页面运行闭包引用了蓝图中不存在的节点 ${evidence.nodeId}`)
    return {
      projectId,
      nodeId: node.id,
      title: node.title,
      formKey: requiredText(evidence.formKey, 'formKey'),
      dataSpaceId: requiredText(evidence.dataSpaceId, 'dataSpaceId'),
      modelId: requiredText(evidence.modelId, 'modelId'),
      componentKey: requiredText(evidence.componentKey, 'componentKey'),
      routePath: requiredText(evidence.routePath, 'routePath'),
    }
  })
}
