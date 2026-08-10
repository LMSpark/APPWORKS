/** lowcode legacy 文档导出端点的请求与任务回执合同。 */

/** 可提交的 legacy 文档种类；对应 /api/File/export* 端点。 */
export type LowcodeProjectBlueprintDocumentKind =
  | 'requirements-specification'
  | 'functional-design'
  | 'system-detailed-design'

/** 文档覆盖范围；当前仅 legacy-menu-scope，表示按运行菜单候选节点导出。 */
export type LowcodeProjectBlueprintDocumentCoverage = 'legacy-menu-scope'

/** 文档导出任务回执；status 恒为 submitted，不表示文件已生成完毕。 */
export type LowcodeProjectBlueprintDocumentTask = Readonly<{
  projectId: string
  kind: LowcodeProjectBlueprintDocumentKind
  status: 'submitted'
  coverage: LowcodeProjectBlueprintDocumentCoverage
  message: string
}>

/** functional-design 提交选项；level/includeText/includeHtml 映射 legacy exportDesignDoc 查询参数。 */
export type LowcodeProjectBlueprintDocumentSubmitOptions = Readonly<{
  level?: number
  includeText?: boolean
  includeHtml?: boolean
}>
