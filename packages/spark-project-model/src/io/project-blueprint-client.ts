/**
 * @module @spark-appworks/spark-project-model:io/project-blueprint-client
 * 职责：正式蓝图节点读取与增改删移动网关。
 * 边界：按节点身份提交真实操作，不进行整树伪同步。
 * AI用途：确认Workspace远端蓝图保存所需能力。
 */
import type { ProjectBlueprintTreeData, ProjectBlueprintTreeNodeData, ProjectBlueprintNodePatch } from '../blueprint/project-blueprint-node'

/** 真实链接嵌入检测结果及解释。 */
export type LinkProbeResult = Readonly<{ embeddable: boolean; reason: string }>

/** 按正式节点身份执行蓝图读取与CRUD，返回实际后端读回数据。 */
export type ProjectBlueprintGateway = Readonly<{
  loadRoot(): Promise<Partial<ProjectBlueprintTreeData>>
  addNode?: (params: { parentId?: string | null; node: ProjectBlueprintTreeNodeData; index?: number }) => Promise<ProjectBlueprintTreeNodeData>
  updateNode?: (id: string, patch: ProjectBlueprintNodePatch) => Promise<ProjectBlueprintTreeNodeData>
  deleteNode?: (id: string) => Promise<ProjectBlueprintTreeNodeData | null>
  moveNode?: (id: string, newParentId: string | null, index: number) => Promise<ProjectBlueprintTreeNodeData>
  probeLink?: (url: string) => Promise<LinkProbeResult>
}>
