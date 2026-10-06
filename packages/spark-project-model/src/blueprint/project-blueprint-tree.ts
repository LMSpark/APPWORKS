/**
 * @module @spark-appworks/spark-project-model:blueprint/project-blueprint-tree
 * 职责：正式节点树定位、校验与交付投影。
 * 边界：不按URL猜业务种类，不装载页面文件。
 * AI用途：从节点树解析明确cfg工具与位置。
 */
import { deepClone, isProjectBlueprintNodeKind } from '@spark-appworks/spark-utils'
import type { RuntimeNavigationItemKind } from '@spark-appworks/spark-utils'
import { ProjectBlueprintNode, projectNodeDeliveryKind, formatProjectDescriptionContext, readProjectNodeDescription } from './project-blueprint-node'
import type { ProjectPageSurface, ProjectDescriptionContext, ProjectBlueprintTreeData, ProjectBlueprintTreeNodeData, ProjectBlueprintTreeNodeLocation, ProjectPageNodeSummary } from './project-blueprint-node'

export function normalizePageIdFromPath(path: string | undefined | null): string { return path ? path.replace(/^cfg:/, '').replace(/^\/+/, '').split('?')[0]?.trim() ?? '' : '' }
export function normalizeConfigPageId(value: string | undefined | null): string { return value?.trim() ?? '' }
export function isConfigNodeKind(kind: RuntimeNavigationItemKind | undefined | null): boolean { return kind === 'page' }
export function resolveProjectPageSurface(node: ProjectBlueprintTreeNodeData): ProjectPageSurface {
  const kind = projectNodeDeliveryKind(node)
  return kind === 'page' ? 'config-files' : kind === 'system-page' ? 'system-page' : kind === 'link' ? 'link' : 'none'
}
export function isConfigFilesPageSurface(surface: ProjectPageSurface): boolean { return surface === 'config-files' }
export function normalizeProjectBlueprintTreeNodeData(node: ProjectBlueprintTreeNodeData): ProjectBlueprintTreeNodeData {
  if (!node.nodeId.trim() || !node.projectId.trim() || !node.capability.name.trim()) throw new Error('项目蓝图节点缺少正式身份或能力名称')
  if (node.kind !== 'unknown' && !isProjectBlueprintNodeKind(node.kind)) throw new Error(`项目蓝图节点种类无效: ${String(node.kind)}`)
  const result = deepClone(node)
  if (result.children) result.children = result.children.map(normalizeProjectBlueprintTreeNodeData)
  return result
}
export function normalizeBlueprintTree(config: Partial<ProjectBlueprintTreeData>): ProjectBlueprintTreeData {
  if (!config.nodeId || !config.projectId || !config.capability || !config.kind || !config.source) throw new Error('项目蓝图根缺少正式合同')
  return { ...normalizeProjectBlueprintTreeNodeData({ ...config, nodeId: config.nodeId, parentNodeId: config.parentNodeId ?? '', projectId: config.projectId, capability: config.capability, kind: config.kind, source: config.source }), children: (config.children ?? []).map(normalizeProjectBlueprintTreeNodeData) }
}
export function buildBlueprintTree(children: ProjectBlueprintTreeNodeData[], options?: Partial<Omit<ProjectBlueprintTreeData, 'children'>>): ProjectBlueprintTreeData { return normalizeBlueprintTree({ ...options, children }) }
export function findNodeById(nodes: readonly ProjectBlueprintTreeNodeData[], targetId: string): ProjectBlueprintTreeNodeData | null {
  for (const node of nodes) { if (node.nodeId === targetId) return node; const found = findNodeById(node.children ?? [], targetId); if (found) return found }
  return null
}
export function findNodeLocation(nodes: readonly ProjectBlueprintTreeNodeData[], targetId: string, parent: ProjectBlueprintTreeNodeData | null = null): ProjectBlueprintTreeNodeLocation | null {
  for (let index = 0; index < nodes.length; index += 1) { const node = nodes[index]; if (!node) continue; if (node.nodeId === targetId) return { node, parent, parentId: parent?.nodeId ?? null, index }; const found = findNodeLocation(node.children ?? [], targetId, node); if (found) return found }
  return null
}
export function resolvePageNodePageId(node: ProjectBlueprintTreeNodeData | null | undefined): string {
  if (!node || projectNodeDeliveryKind(node) !== 'page') return ''
  const target = node.navigation?.target
  return target?.startsWith('cfg:') === true ? normalizePageIdFromPath(target) : target?.startsWith('/__page/') === true ? normalizePageIdFromPath(target.slice('/__page/'.length)) : ''
}
export function resolveNavPageSummaryId(node: ProjectBlueprintTreeNodeData): string { return resolvePageNodePageId(node) || (projectNodeDeliveryKind(node) === 'system-page' ? normalizePageIdFromPath(node.navigation?.target) : '') }
export function findConfigNodeByPageId(nodes: readonly ProjectBlueprintTreeNodeData[], pageId: string): ProjectBlueprintTreeNodeData | null { return findPageNodeByPageId(nodes, pageId) }
export function findPageNodeByPageId(nodes: readonly ProjectBlueprintTreeNodeData[], pageId: string): ProjectBlueprintTreeNodeData | null {
  for (const node of nodes) { if (resolvePageNodePageId(node) === pageId) return node; const found = findPageNodeByPageId(node.children ?? [], pageId); if (found) return found }
  return null
}
export function appendProjectDescriptionContext(context: readonly ProjectDescriptionContext[], node: ProjectBlueprintTreeNodeData | null | undefined): ProjectDescriptionContext[] {
  const description = readProjectNodeDescription(node)
  return node && description ? [...context, { nodeId: node.nodeId, title: node.capability.name, nodeKind: node.kind, description }] : [...context]
}
/** 页面摘要的祖先策划说明上下文。 */
type SummaryOptions = { descriptionContext?: readonly ProjectDescriptionContext[] }
export function buildProjectPageSummaries(nodes: readonly ProjectBlueprintTreeNodeData[], options: SummaryOptions = {}): ProjectPageNodeSummary[] {
  const result: ProjectPageNodeSummary[] = []
  const visit = (list: readonly ProjectBlueprintTreeNodeData[], context: readonly ProjectDescriptionContext[]): void => {
    for (const node of list) {
      const next = appendProjectDescriptionContext(context, node)
      const pageId = resolveNavPageSummaryId(node)
      if (pageId) { const model = new ProjectBlueprintNode({ node, pid: node.parentNodeId, descriptionContext: next }); result.push({ pageId, path: model.path ?? '', title: model.title, nodeId: node.nodeId, nodeKind: model.nodeKind, designSurface: resolveProjectPageSurface(node), description: model.description, descriptionContext: next, effectiveDescription: formatProjectDescriptionContext(next), implGate: model.implGate, upstreamContractsSatisfied: model.upstreamContractsSatisfied, ...(model.icon ? { icon: model.icon } : {}), ...(model.planningAttachmentRef ? { planningAttachmentRef: model.planningAttachmentRef } : {}) }) }
      visit(node.children ?? [], next)
    }
  }
  visit(nodes, options.descriptionContext ?? [])
  return result
}
export function flattenProjectBlueprintTree(root: ProjectBlueprintTreeData): Array<{ node: ProjectBlueprintTreeNodeData; pid: string }> {
  const result: Array<{ node: ProjectBlueprintTreeNodeData; pid: string }> = []
  const seen = new Set<string>()
  const visit = (node: ProjectBlueprintTreeNodeData, pid: string): void => { if (seen.has(node.nodeId)) throw new Error(`项目蓝图节点重复或循环: ${node.nodeId}`); seen.add(node.nodeId); const copy = deepClone(node); delete copy.children; copy.parentNodeId = pid; result.push({ node: copy, pid }); for (const child of node.children ?? []) visit(child, node.nodeId) }
  visit(normalizeBlueprintTree(root), '')
  return result
}
/** 内存树重建所需节点身份、父身份与正式数据出口。 */
type TreeNodeLike = { readonly id: string; readonly pid: string; toNodeData(): ProjectBlueprintTreeNodeData }
export function buildProjectBlueprintTree(nodes: Iterable<TreeNodeLike>): ProjectBlueprintTreeNodeData[] {
  const byParent = new Map<string, ProjectBlueprintTreeNodeData[]>()
  for (const model of nodes) { const data = model.toNodeData(); const bucket = byParent.get(model.pid) ?? []; bucket.push(data); byParent.set(model.pid, bucket) }
  const attach = (pid: string): ProjectBlueprintTreeNodeData[] => (byParent.get(pid) ?? []).sort((a,b) => (a.navigation?.order ?? 0) - (b.navigation?.order ?? 0) || a.nodeId.localeCompare(b.nodeId)).map(node => { const children = attach(node.nodeId); return children.length ? { ...node, children } : node })
  return attach('')
}
export function findFlatNodeLocation<T extends TreeNodeLike>(nodesById: ReadonlyMap<string,T>, getChildren: (pid: string) => readonly T[], targetId: string): ProjectBlueprintTreeNodeLocation | null {
  const model = nodesById.get(targetId.trim()); if (!model) return null
  return { node: model.toNodeData(), parent: nodesById.get(model.pid)?.toNodeData() ?? null, parentId: model.pid || null, index: getChildren(model.pid).findIndex(sibling => sibling.id === model.id) }
}
