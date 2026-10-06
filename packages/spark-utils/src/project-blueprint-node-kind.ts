/**
 * @module @spark-appworks/spark-utils:project-blueprint-node-kind
 * 职责：项目蓝图节点业务种类（ProjectBlueprintNodeKind）的唯一字面量 SSOT。
 * 边界：只放跨包共享的 kind 契约；不含编辑树、平台 wire 或运行导航投影。
 * AI用途：校验五种正式业务kind；未知值返回false，明确unknown仅用于读入草稿诊断。
 */

/** 项目蓝图节点业务种类字面量表；与运行导航 itemKind 严格分离。 */
export const PROJECT_BLUEPRINT_NODE_KINDS = [
  'module',
  'page',
  'embedded',
  'service',
  'content',
] as const

/** 项目蓝图节点的业务种类。 */
export type ProjectBlueprintNodeKind = (typeof PROJECT_BLUEPRINT_NODE_KINDS)[number]

const PROJECT_BLUEPRINT_NODE_KIND_SET: ReadonlySet<string> = new Set(PROJECT_BLUEPRINT_NODE_KINDS)

/** 运行时判定未知 BlueprintNodeKind。 */
export function isProjectBlueprintNodeKind(value: string): value is ProjectBlueprintNodeKind {
  return PROJECT_BLUEPRINT_NODE_KIND_SET.has(value)
}
