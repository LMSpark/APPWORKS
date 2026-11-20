/**
 * @module @spark-appworks/spark-ai:class-model/tools/class-model-tool-schema-recovery
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 class-model-tool-schema-recovery 能力，围绕 模块入口、副作用注册或内部组合逻辑 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/tools/class-model-tool-schema-recovery 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import { findClassModelToolSpec } from './class-model-tool-specs'

/** 从 DtsTypeDeclarationModel 工具闭集 schema 派生参数恢复提示，避免业务层硬编码协议字段名。 */
export function buildClassModelToolSchemaRecoveryHint(toolName: string): string | undefined {
  const spec = findClassModelToolSpec(toolName)
  if (spec === undefined) return undefined

  const required = new Set(spec.function.parameters.required ?? [])
  const properties = spec.function.parameters.properties ?? {}
  const parts: string[] = []

  for (const [name, schema] of Object.entries(properties)) {
    if (typeof schema !== 'object') continue
    const description = 'description' in schema && typeof schema.description === 'string'
      ? schema.description
      : ''
    const role = required.has(name) ? 'required' : 'optional'
    parts.push(description.length > 0 ? `${name} (${role}, ${description})` : `${name} (${role})`)
  }

  if (parts.length === 0) return `${toolName} 按工具 schema 重试。`
  return `${toolName} 按工具 schema 重试：{ ${parts.join('; ')} }`
}
