/**
 * @module @spark-appworks/spark-project-model:page/instantiate-project-node
 * 职责：配置页节点实例化（page / sub-page 统一 ConfigPageNode）。
 * 边界：只根据运行交付 nodeKind 在 ConfigPageNode 与普通蓝图节点之间分流，不加载页面四文件。
 * AI用途：判断项目蓝图节点应实例化为配置页还是普通节点时，用本模块作为统一入口。
 */
import type { ProjectBlueprintNode } from '../blueprint/project-blueprint-node'
import { isConfigNodeKind } from '../blueprint/project-blueprint-tree'
import { instantiateBlueprintKindNode } from '../blueprint/project-blueprint-kinds'
import {
  ConfigPageNode,
  type ProjectConfigPageNodeModelOptions,
} from './config-page'

export function instantiateProjectNode(options: ProjectConfigPageNodeModelOptions): ProjectBlueprintNode {
  const nodeKind = options.node.nodeKind ?? 'page'
  if (isConfigNodeKind(nodeKind)) return new ConfigPageNode(options)
  return instantiateBlueprintKindNode(options)
}

export function isConfigPageNode(node: ProjectBlueprintNode | null | undefined): node is ConfigPageNode {
  return node instanceof ConfigPageNode
}

export function isConfigSubPageNode(node: ProjectBlueprintNode | null | undefined): node is ConfigPageNode {
  return node instanceof ConfigPageNode && node.isSubPage
}
