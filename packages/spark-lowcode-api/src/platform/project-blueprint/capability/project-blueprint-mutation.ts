import { LowcodeApiError } from '../../../core/lowcode-api-error.js'
import type {
  ProjectBlueprintMutationCapability,
  ProjectBlueprintNode,
  ProjectBlueprintNodeSnapshot,
} from '../project-blueprint.js'

type ProjectBlueprintMutationBase = Readonly<{
  nodeId: string
  idempotencyKey: string
  preimage: ProjectBlueprintNodeSnapshot
}>

export type ProjectBlueprintMutationInput =
  | (ProjectBlueprintMutationBase & Readonly<{
      capability: 'update-planning-content'
      change: Readonly<{ title?: string; description?: string }>
    }>)
  | (ProjectBlueprintMutationBase & Readonly<{
      capability: 'move-node'
      change: Readonly<{ parentId: string; order: number }>
    }>)
  | (ProjectBlueprintMutationBase & Readonly<{
      capability: 'bind-data-space'
      change: Readonly<{ dataSpaceId: string; modelId: string }>
    }>)
  | (ProjectBlueprintMutationBase & Readonly<{
      capability: 'update-delivery'
      change: Readonly<{
        formKey: string
        componentKey: string
        routePath: string
        runtimeNavigationCandidate: boolean
      }>
    }>)
  | (ProjectBlueprintMutationBase & Readonly<{
      capability: 'update-feature-tags'
      change: Readonly<{ featureTagIds: readonly string[] }>
    }>)
  | (ProjectBlueprintMutationBase & Readonly<{
      capability: 'update-permission-design'
      change: Readonly<{ permissionDesignId: string }>
    }>)

export type ProjectBlueprintMutationRisk = 'low' | 'medium' | 'high'

export type ProjectBlueprintMutationCommand = Readonly<{
  kind: 'project-blueprint-mutation'
  projectId: string
  nodeId: string
  capability: ProjectBlueprintMutationCapability
  risk: ProjectBlueprintMutationRisk
  idempotencyKey: string
  preimage: ProjectBlueprintNodeSnapshot
  change: ProjectBlueprintMutationInput['change']
  journal: Readonly<{ required: true }>
  readback: Readonly<{ required: true; nodeId: string }>
  compensation: Readonly<{
    kind: 'restore-project-blueprint-node'
    preimage: ProjectBlueprintNodeSnapshot
  }>
}>

function requiredText(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) throw new LowcodeApiError(0, `${name} 不能为空`)
  return normalized
}

function risk(capability: ProjectBlueprintMutationCapability): ProjectBlueprintMutationRisk {
  if (capability === 'update-planning-content' || capability === 'move-node') return 'low'
  if (capability === 'update-permission-design') return 'high'
  return 'medium'
}

export class ProjectBlueprintMutationPlanner {
  private readonly nodesById: ReadonlyMap<string, ProjectBlueprintNode>

  public constructor(
    private readonly projectId: string,
    nodes: readonly ProjectBlueprintNode[],
  ) {
    this.nodesById = new Map(nodes.map((node) => [node.id, node]))
  }

  public prepare(input: ProjectBlueprintMutationInput): ProjectBlueprintMutationCommand {
    const nodeId = requiredText(input.nodeId, 'nodeId')
    const idempotencyKey = requiredText(input.idempotencyKey, 'idempotencyKey')
    const node = this.nodesById.get(nodeId)
    if (node === undefined) throw new LowcodeApiError(0, `蓝图节点不存在：${nodeId}`)
    if (!node.capabilities.includes(input.capability)) {
      throw new LowcodeApiError(0, `蓝图节点 ${nodeId} 未声明 capability ${input.capability}`)
    }
    if (JSON.stringify(node.toSnapshot()) !== JSON.stringify(input.preimage)) {
      throw new LowcodeApiError(0, `蓝图节点 ${nodeId} 的写前镜像已过期`)
    }
    return {
      kind: 'project-blueprint-mutation',
      projectId: this.projectId,
      nodeId,
      capability: input.capability,
      risk: risk(input.capability),
      idempotencyKey,
      preimage: input.preimage,
      change: input.change,
      journal: { required: true },
      readback: { required: true, nodeId },
      compensation: { kind: 'restore-project-blueprint-node', preimage: input.preimage },
    }
  }
}
