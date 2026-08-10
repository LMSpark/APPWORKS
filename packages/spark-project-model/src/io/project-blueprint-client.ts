import type { ProjectBlueprintTreeData, ProjectBlueprintTreeNodeData } from '../blueprint/project-blueprint-node'
import { normalizeBlueprintTree } from '../blueprint/project-blueprint-tree'
import type { BlueprintNodePatch } from '../blueprint/project-blueprint-edit'

export type LinkProbeResult = Readonly<{ embeddable: boolean; reason: string }>

export type ProjectBlueprintGateway = Readonly<{
  loadRoot(): Promise<Partial<ProjectBlueprintTreeData>>
  addNode?: (params: { parentId?: string | null; node: ProjectBlueprintTreeNodeData; index?: number }) => Promise<ProjectBlueprintTreeNodeData>
  updateNode?: (id: string, patch: BlueprintNodePatch) => Promise<ProjectBlueprintTreeNodeData>
  deleteNode?: (id: string) => Promise<ProjectBlueprintTreeNodeData | null>
  moveNode?: (id: string, newParentId: string | null, index: number) => Promise<ProjectBlueprintTreeNodeData>
  probeLink?: (url: string) => Promise<LinkProbeResult>
}>

function unavailable(capability: string): never {
  throw new Error(`当前平台未提供受治理的项目蓝图${capability}能力`)
}

export class ProjectBlueprintClient {
  public constructor(private readonly gateway: ProjectBlueprintGateway) {}

  public async loadRoot(): Promise<ProjectBlueprintTreeData> {
    return normalizeBlueprintTree(await this.gateway.loadRoot())
  }

  public async addNode(params: { parentId?: string | null; node: ProjectBlueprintTreeNodeData; index?: number }): Promise<ProjectBlueprintTreeNodeData> {
    const operation = this.gateway.addNode ?? unavailable('新增')
    return operation({
      ...(params.parentId === undefined ? {} : { parentId: params.parentId }),
      node: params.node,
      ...(params.index === undefined ? {} : { index: params.index }),
    })
  }

  public async updateNode(id: string, patch: BlueprintNodePatch): Promise<ProjectBlueprintTreeNodeData> {
    return (this.gateway.updateNode ?? unavailable('更新'))(id, patch)
  }

  public async deleteNode(id: string): Promise<ProjectBlueprintTreeNodeData | null> {
    return (this.gateway.deleteNode ?? unavailable('删除'))(id)
  }

  public async moveNode(id: string, newParentId: string | null, index: number): Promise<ProjectBlueprintTreeNodeData> {
    return (this.gateway.moveNode ?? unavailable('移动'))(id, newParentId, index)
  }

  public async probeLink(url: string): Promise<LinkProbeResult> {
    return (this.gateway.probeLink ?? unavailable('链接探测'))(url)
  }
}
