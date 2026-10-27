/**
 * @module @spark-appworks/spark-project-model:io/project-blueprint-client
 * 职责：正式蓝图根读取与链接可嵌入性检查网关。
 * 边界：蓝图 CRUD 由正式 DataView/DataSet 负责，不由 ProjectWorkspace 直写。
 * AI用途：确认Workspace蓝图读取和链接检查所需能力。
 */
import type { ProjectBlueprintTreeData } from '../blueprint/project-blueprint-node'

/** 真实链接嵌入检测结果及解释。 */
export type LinkProbeResult = Readonly<{ embeddable: boolean; reason: string }>

/** ProjectWorkspace 可读取正式树并检查链接；写入须由 DataView/DataSet 完成。 */
export type ProjectBlueprintGateway = Readonly<{
  loadRoot(): Promise<Partial<ProjectBlueprintTreeData>>
  probeLink?: (url: string) => Promise<LinkProbeResult>
}>
