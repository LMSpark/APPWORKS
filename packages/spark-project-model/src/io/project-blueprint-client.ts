/**
 * @module @spark-appworks/spark-project-model:io/project-blueprint-client
 * 职责：项目工作区可用的平台链接可嵌入性检查命令。
 * 边界：蓝图 CRUD 由正式 DataView/DataSet 负责，不由 ProjectWorkspace 直写。
 * AI用途：确认Workspace的链接检查命令合同。
 */
/** 真实链接嵌入检测结果及解释。 */
export type LinkProbeResult = Readonly<{ embeddable: boolean; reason: string }>

/** ProjectWorkspace 仅使用平台链接检查命令；蓝图树读取与写入由 DataView/DataSet 负责。 */
export type ProjectBlueprintGateway = Readonly<{
  probeLink?: (url: string) => Promise<LinkProbeResult>
}>
