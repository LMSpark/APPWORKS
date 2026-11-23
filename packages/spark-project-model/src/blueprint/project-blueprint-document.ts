/**
 * @module @spark-appworks/spark-project-model:blueprint/project-blueprint-document
 * 职责：定义既有文档导出端点的请求选项与 submitted 回执。
 * 边界：覆盖仅 legacy-menu-scope，不表示文件生成完成或完整蓝图交付。
 * AI用途：准确解释文档任务提交结果，避免把 ACK 当生成成功。
 */

/** 可提交的 legacy 文档种类；对应 /api/File/export* 端点。 */
export type ProjectBlueprintDocumentKind =
  | 'requirements-specification'
  | 'functional-design'
  | 'system-detailed-design'

/** 文档覆盖范围；当前仅 legacy-menu-scope，表示按运行菜单候选节点导出。 */
type ProjectBlueprintDocumentCoverage = 'legacy-menu-scope'

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
