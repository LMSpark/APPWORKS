/**
 * @module app:lowcode/resources/application/project-blueprint-document
 * 职责：承接蓝图 legacy 文档导出提交，供应用管理/蓝图工作台消费。
 * 边界：只返回 submitted 回执，不表示文件已生成；HTTP 留在 lowcode 网关内。
 */
import type {
  LowcodeProjectBlueprintDocumentKind,
  LowcodeProjectBlueprintDocumentSubmitOptions,
  LowcodeProjectBlueprintDocumentTask,
} from '@spark-appworks/spark-lowcode-api'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'

export type BlueprintDocumentKind = LowcodeProjectBlueprintDocumentKind

export async function submitBlueprintDocument(
  projectId: string,
  kind: BlueprintDocumentKind,
  options: LowcodeProjectBlueprintDocumentSubmitOptions = {},
): Promise<LowcodeProjectBlueprintDocumentTask> {
  return lowcodeApi.blueprint.submitDocument(projectId, kind, options)
}