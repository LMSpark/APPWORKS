/**
 * 项目蓝图 mutation 命令规划器：仅 prepare 命令，不发起 HTTP 写入。
 * 写前镜像 preimage 须与当前节点快照一致；命令含 journal/readback/compensation 约束供治理层执行。
 */
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

/** mutation 输入联合；capability 须与目标节点 kind 声明一致，否则 prepare fail-fast。 */
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

/** mutation 风险等级；update-permission-design 为 high，规划/移动为 low。 */
export type ProjectBlueprintMutationRisk = 'low' | 'medium' | 'high'

/** 待治理层执行的 mutation 命令；本模块不自动 journal、不自动 readback。 */
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

/** 基于当前蓝图快照规划 mutation 命令；prepare 校验 capability、idempotencyKey 与 preimage 新鲜度。 */
export class ProjectBlueprintMutationPlanner {
  private readonly nodesById: ReadonlyMap<string, ProjectBlueprintNode>

  public constructor(
    private readonly projectId: string,
    nodes: readonly ProjectBlueprintNode[],
  ) {
    this.nodesById = new Map(nodes.map((node) => [node.id, node]))
  }

  /** 生成 mutation 命令但不执行；preimage 过期或 capability 未声明时抛 LowcodeApiError。 */
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
