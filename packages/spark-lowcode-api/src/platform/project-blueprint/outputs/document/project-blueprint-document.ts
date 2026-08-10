/**
 * 项目蓝图文档输出：描述 legacy 文档生成器的覆盖范围与节点包含/排除诊断。
 * coverage 固定为 legacy-menu-scope，与后端 IsShowAtNav=1 查询语义对齐。
 */
import type { ProjectBlueprintNode } from '../../project-blueprint.js'

/** 可提交的 legacy 文档种类；对应 /api/File/export* 端点。 */
export type ProjectBlueprintDocumentKind =
  | 'requirements-specification'
  | 'functional-design'
  | 'system-detailed-design'

/** 文档覆盖范围；当前仅 legacy-menu-scope，表示按运行菜单候选节点导出。 */
export type ProjectBlueprintDocumentCoverage = 'legacy-menu-scope'

/** 文档生成源描述；included/excluded 按 runtimeNavigationCandidate 划分，diagnostics 提示后端查询限制。 */
export type ProjectBlueprintDocumentSource = Readonly<{
  projectId: string
  kind: ProjectBlueprintDocumentKind
  coverage: ProjectBlueprintDocumentCoverage
  includedNodeIds: readonly string[]
  excludedNodeIds: readonly string[]
  diagnostics: readonly string[]
}>

/** 文档导出任务回执；status 恒为 submitted，不表示文件已生成完毕。 */
export type ProjectBlueprintDocumentTask = Readonly<{
  projectId: string
  kind: ProjectBlueprintDocumentKind
  status: 'submitted'
  coverage: ProjectBlueprintDocumentCoverage
  message: string
}>

/** functional-design 提交选项；level/includeText/includeHtml 映射 legacy exportDesignDoc 查询参数。 */
export type ProjectBlueprintDocumentSubmitOptions = Readonly<{
  level?: number
  includeText?: boolean
  includeHtml?: boolean
}>

/** 蓝图文档输出；source 只读描述 coverage=legacy-menu-scope 的节点范围，不触发导出。 */
export class ProjectBlueprintDocumentOutputs {
  public constructor(
    private readonly projectId: string,
    private readonly nodes: readonly ProjectBlueprintNode[],
  ) {}

  /** 返回指定 kind 的文档源描述；非运行菜单候选节点列入 excludedNodeIds 与 diagnostics。 */
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
