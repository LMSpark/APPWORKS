/**
 * @module @spark-appworks/spark-project-model:blueprint/project-blueprint-kinds
 * 职责：按运行交付 nodeKind 实例化非配置页蓝图节点（统一 `ProjectBlueprintNode`，family 由 nodeKind 派生）。
 * 边界：不处理 page 运行投影；配置页由 instantiate-project-node 路由到 ConfigPageNode。
 * AI用途：扩展运行交付 nodeKind 或排查非配置页蓝图节点实例化时，用本模块确认默认构造路径。
 */
import { isRuntimeNavigationItemKind } from '@spark-appworks/spark-utils'
import { ProjectBlueprintNode, type ProjectBlueprintNodeModelOptions } from './project-blueprint-node'

export function instantiateBlueprintKindNode(options: ProjectBlueprintNodeModelOptions): ProjectBlueprintNode {
  const kind = options.node.nodeKind ?? 'page'
  if (!isRuntimeNavigationItemKind(kind)) {
    throw new Error(`Unsupported runtime navigation item kind: ${String(kind)}`)
  }
  if (kind === 'page') {
    throw new Error(`instantiateBlueprintKindNode does not handle config page kind: ${kind}`)
  }
  return new ProjectBlueprintNode(options)
}
