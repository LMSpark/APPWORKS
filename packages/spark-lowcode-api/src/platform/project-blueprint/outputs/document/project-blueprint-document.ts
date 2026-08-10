import type { ProjectBlueprintNode } from '../../project-blueprint.js'

export type ProjectBlueprintDocumentKind =
  | 'requirements-specification'
  | 'functional-design'
  | 'system-detailed-design'

export type ProjectBlueprintDocumentCoverage = 'legacy-menu-scope'

export type ProjectBlueprintDocumentSource = Readonly<{
  projectId: string
  kind: ProjectBlueprintDocumentKind
  coverage: ProjectBlueprintDocumentCoverage
  includedNodeIds: readonly string[]
  excludedNodeIds: readonly string[]
  diagnostics: readonly string[]
}>

export type ProjectBlueprintDocumentTask = Readonly<{
  projectId: string
  kind: ProjectBlueprintDocumentKind
  status: 'submitted'
  coverage: ProjectBlueprintDocumentCoverage
  message: string
}>

export type ProjectBlueprintDocumentSubmitOptions = Readonly<{
  level?: number
  includeText?: boolean
  includeHtml?: boolean
}>

export class ProjectBlueprintDocumentOutputs {
  public constructor(
    private readonly projectId: string,
    private readonly nodes: readonly ProjectBlueprintNode[],
  ) {}

  public source(kind: ProjectBlueprintDocumentKind): ProjectBlueprintDocumentSource {
    const includedNodeIds = this.nodes
      .filter((node) => node.runtimeNavigationCandidate)
      .map((node) => node.id)
    const excludedNodeIds = this.nodes
      .filter((node) => !node.runtimeNavigationCandidate)
      .map((node) => node.id)
    return {
      projectId: this.projectId,
      kind,
      coverage: 'legacy-menu-scope',
      includedNodeIds,
      excludedNodeIds,
      diagnostics: excludedNodeIds.length === 0
        ? ['lowcode 文档生成器仍按 IsShowAtNav=1 查询，当前蓝图未发现显式排除节点']
        : [`lowcode 文档生成器不会覆盖 ${excludedNodeIds.length} 个非运行菜单候选蓝图节点`],
    }
  }
}
