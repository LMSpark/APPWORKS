/**
 * @module @spark-appworks/spark-project-model:blueprint/project-blueprint-tree
 * 职责：蓝图树/扁平转换、pageId 解析与配置页判定纯函数。
 * 边界：只表达项目/页面配置领域模型；不渲染组件，不绕过 pageDesign 四文件链路。
 * AI用途：树操作、页面摘要或 legacy `sub-page` 迁移判定时使用本模块。
 */
import { deepClone } from '@spark-appworks/spark-utils'
import type {
  ProjectBlueprintDeliveryKind,
  ProjectPageSurface,
  ProjectDescriptionContext,
  ProjectBlueprintTreeData,
  ProjectBlueprintTreeNodeData,
  ProjectBlueprintTreeNodeLocation,
  ProjectPageNodeSummary,
} from './project-blueprint-node'
import {
  formatProjectDescriptionContext,
  readProjectNodeDescription,
} from './project-blueprint-node'

export function normalizePageIdFromPath(path: string | undefined | null): string {
  return path ? path.replace(/^\/+/, '').trim() : ''
}

export function isConfigNodeKind(kind: string | undefined | null): boolean {
  const normalized = kind ?? 'page'
  return normalized === 'page' || normalized === 'sub-page'
}

/** 嵌套配置页：无独立路由（legacy `sub-page` 在 normalize 时迁移为 page + hidden）。 */
export function isNestedConfigPageNode(
  node: Pick<ProjectBlueprintTreeNodeData, 'path' | 'hidden'> & Readonly<{ nodeKind?: string | null | undefined }>,
): boolean {
  const kind = node.nodeKind ?? 'page'
  if (isLegacySubPageKind(kind)) return true
  return kind === 'page' && node.hidden === true && normalizePageIdFromPath(node.path) === ''
}

/** 按 nodeKind 解析模型侧页面表面（不依赖应用路由表）。 */
export function resolveProjectPageSurface(node: ProjectBlueprintTreeNodeData): ProjectPageSurface {
  const kind = node.nodeKind ?? 'page'
  if (isConfigNodeKind(kind)) return 'config-files'
  if (kind === 'system-page') return 'system-page'
  if (kind === 'link') return 'link'
  if (kind === 'ref') return 'ref'
  return 'none'
}

export function isConfigFilesPageSurface(surface: ProjectPageSurface): boolean {
  return surface === 'config-files'
}
const SYSTEM_CHILD_PLACEMENTS = new Set(['toolbar', 'user-menu'])

function inferBlueprintNodeDeliveryKind(node: ProjectBlueprintTreeNodeData, parentPlacement?: string): ProjectBlueprintDeliveryKind {
  if (node.nodeKind !== undefined) return node.nodeKind
  if (parentPlacement !== undefined && SYSTEM_CHILD_PLACEMENTS.has(parentPlacement)) return 'system-action'
  if (node.childPlacement === 'toolbar' || node.childPlacement === 'user-menu') return 'system-directory'
  if (node.linkTarget === 'iframe' || node.linkTarget === 'new-tab' || node.linkTarget === 'self') return 'link'
  return 'page'
}

export function normalizeProjectBlueprintTreeNodeData(node: ProjectBlueprintTreeNodeData, parentPlacement?: string): ProjectBlueprintTreeNodeData {
  const cloned = deepClone(node)
  cloned.nodeKind = inferBlueprintNodeDeliveryKind(cloned, parentPlacement)
  if (isLegacySubPageKind(cloned.nodeKind)) {
    cloned.nodeKind = 'page'
    cloned.hidden = true
    delete cloned.path
    delete cloned.linkTarget
  } else if (cloned.nodeKind === 'link') {
    if (cloned.linkTarget !== 'iframe' && cloned.linkTarget !== 'new-tab' && cloned.linkTarget !== 'self') {
      cloned.linkTarget = 'iframe'
    }
  } else {
    delete cloned.linkTarget
  }
  if (Array.isArray(cloned.children)) {
    cloned.children = cloned.children.map(child => normalizeProjectBlueprintTreeNodeData(child, cloned.childPlacement))
  }
  Reflect.deleteProperty(cloned, 'planningStatus')
  return cloned
}

function isLegacySubPageKind(kind: unknown): boolean {
  return kind === 'sub-page'
}

function normalizeRootChildPlacement(value: unknown): 'header' | 'sidebar' {
  const normalized = String(value ?? '').trim()
  return normalized === 'header' || normalized === 'sidebar' ? normalized : 'header'
}

/** Normalize Nav Root Input 的输入数据。 */
type NormalizeNavRootInput = {
    /** 唯一标识。 */
id?: string | undefined
    /** 显示标题。 */
title?: string | undefined
    /** child Placement 字段。 */
childPlacement?: string | undefined
    /** 子节点集合。 */
children?: ProjectBlueprintTreeNodeData[] | undefined
    /** icon 字段。 */
icon?: string | undefined
    /** description 字段。 */
description?: string | undefined
    /** planning Attachment Ref 字段。 */
planningAttachmentRef?: string | undefined
    /** version 字段。 */
version?: string | undefined
  /** node Kind 字段。 */
nodeKind?: 'module' | 'system-directory' | undefined
    /** 项目根蓝图业务类型。 */
blueprintKind?: ProjectBlueprintTreeData['blueprintKind']
    /** home Path 路径。 */
homePath?: string | undefined
}

export function normalizeBlueprintTree(config: NormalizeNavRootInput): ProjectBlueprintTreeData {
  const promoted = promotePersistedRoot(config)
  const root: ProjectBlueprintTreeData = {
    ...(promoted.id === undefined || promoted.id.trim() === '' ? {} : { id: promoted.id.trim() }),
    title: promoted.title ?? '',
    ...(promoted.icon === undefined || promoted.icon.trim() === '' ? {} : { icon: promoted.icon.trim() }),
    ...(promoted.description === undefined || promoted.description.trim() === '' ? {} : { description: promoted.description }),
    ...(promoted.planningAttachmentRef === undefined || promoted.planningAttachmentRef.trim() === ''
      ? {}
      : { planningAttachmentRef: promoted.planningAttachmentRef.trim() }),
    ...(promoted.version === undefined || promoted.version.trim() === '' ? {} : { version: promoted.version.trim() }),
    ...(promoted.homePath === undefined || promoted.homePath.trim() === '' ? {} : { homePath: promoted.homePath.trim() }),
    nodeKind: promoted.nodeKind ?? 'module',
    ...(promoted.blueprintKind === undefined ? {} : { blueprintKind: promoted.blueprintKind }),
    childPlacement: normalizeRootChildPlacement(promoted.childPlacement),
    children: (promoted.children ?? []).map(node => normalizeProjectBlueprintTreeNodeData(node)),
  }
  return root
}

function promotePersistedRoot(config: NormalizeNavRootInput): NormalizeNavRootInput {
  const rootId = config.id?.trim()
  const children = config.children ?? []
  if (rootId || children.length === 0) return config

  const candidate = findPersistedRootCandidate(children)
  if (!isPersistedRootCandidate(candidate)) return config

  const nestedChildren = candidate.children ?? []
  const siblingChildren = children.filter(node => node.id !== candidate.id)
  return {
    ...config,
    id: candidate.id,
    title: candidate.title,
    icon: candidate.icon,
    description: candidate.description,
    version: candidate.version,
    nodeKind: candidate.nodeKind === 'system-directory' ? 'system-directory' : 'module',
    blueprintKind: candidate.blueprintKind,
    childPlacement: candidate.childPlacement ?? config.childPlacement,
    children: [...nestedChildren, ...siblingChildren],
  }
}

function findPersistedRootCandidate(children: readonly ProjectBlueprintTreeNodeData[]): ProjectBlueprintTreeNodeData | undefined {
  const candidates = children.filter(isPersistedRootCandidate)
  return candidates.find(node => node.childPlacement === 'header' || node.childPlacement === 'sidebar')
    ?? candidates.find(node => !node.path && !node.linkTarget)
    ?? candidates[0]
}

function isPersistedRootCandidate(node: ProjectBlueprintTreeNodeData | undefined): node is ProjectBlueprintTreeNodeData {
  if (!node) return false
  if (node.nodeKind !== 'module' && node.nodeKind !== 'system-directory') return false
  if (node.childPlacement === 'toolbar' || node.childPlacement === 'user-menu') return false
  return true
}

export function buildBlueprintTree(children: ProjectBlueprintTreeNodeData[], options?: Partial<Omit<ProjectBlueprintTreeData, 'children'>>): ProjectBlueprintTreeData {
  return normalizeBlueprintTree({
    id: options?.id,
    title: options?.title ?? '',
    icon: options?.icon,
    description: options?.description,
    planningAttachmentRef: options?.planningAttachmentRef,
    version: options?.version,
    nodeKind: options?.nodeKind,
    blueprintKind: options?.blueprintKind,
    homePath: options?.homePath,
    childPlacement: options?.childPlacement ?? 'header',
    children,
  })
}

function isPageLikeKind(kind: ProjectBlueprintDeliveryKind | 'sub-page'): boolean {
  return kind === 'page'
    || kind === 'system-page'
    || kind === 'system-action'
    || kind === 'link'
    || kind === 'sub-page'
}

export function findNodeById(nodes: readonly ProjectBlueprintTreeNodeData[], targetId: string): ProjectBlueprintTreeNodeData | null {
  for (const node of nodes) {
    if (node.id === targetId) return node
    if (Array.isArray(node.children)) {
      const found = findNodeById(node.children, targetId)
      if (found) return found
    }
  }
  return null
}

function findParentNodeById(nodes: readonly ProjectBlueprintTreeNodeData[], targetId: string, parent: ProjectBlueprintTreeNodeData | null = null): ProjectBlueprintTreeNodeData | null {
  for (const node of nodes) {
    if (node.id === targetId) return parent
    if (Array.isArray(node.children)) {
      const found = findParentNodeById(node.children, targetId, node)
      if (found) return found
    }
  }
  return null
}

export function findNodeLocation(nodes: readonly ProjectBlueprintTreeNodeData[], targetId: string, parent: ProjectBlueprintTreeNodeData | null = null): ProjectBlueprintTreeNodeLocation | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (node === undefined) continue
    if (node.id === targetId) {
      return { node, parent, parentId: parent?.id ?? null, index }
    }
    if (Array.isArray(node.children)) {
      const found = findNodeLocation(node.children, targetId, node)
      if (found) return found
    }
  }
  return null
}

export function findConfigNodeByPageId(nodes: readonly ProjectBlueprintTreeNodeData[], pageId: string): ProjectBlueprintTreeNodeData | null {
  for (const node of nodes) {
    if (isConfigNodeKind(node.nodeKind ?? 'page') && normalizePageIdFromPath(node.path) === pageId) {
      return node
    }
    if (Array.isArray(node.children)) {
      const found = findConfigNodeByPageId(node.children, pageId)
      if (found) return found
    }
  }
  return null
}

export function findPageNodeByPageId(nodes: readonly ProjectBlueprintTreeNodeData[], pageId: string): ProjectBlueprintTreeNodeData | null {
  const normalized = pageId.trim()
  if (!normalized) return null
  for (const node of nodes) {
    if (resolvePageNodePageId(node) === normalized) return node
    const found = findPageNodeByPageId(node.children ?? [], normalized)
    if (found !== null) return found
  }
  return null
}

export function isSystemRootDirectory(node: ProjectBlueprintTreeNodeData | null | undefined, rootNodes: readonly ProjectBlueprintTreeNodeData[]): boolean {
  return Boolean(node?.nodeKind === 'system-directory' && rootNodes.some(rootNode => rootNode.id === node.id))
}

export function canUseModuleNodeKind(node: ProjectBlueprintTreeNodeData | null | undefined, rootNodes: readonly ProjectBlueprintTreeNodeData[]): boolean {
  if (!node) return true
  const parent = findParentNodeById(rootNodes, node.id)
  if (!parent) return true
  return !isPageLikeKind(parent.nodeKind ?? 'module')
}

export function normalizeConfigPageId(v: string | undefined | null): string { return (v ?? '').trim() }

export function resolvePageNodePageId(node: ProjectBlueprintTreeNodeData | null | undefined): string {
  if (!node || !isConfigNodeKind(node.nodeKind ?? 'page')) return ''
  const pid = normalizePageIdFromPath(node.path)
  return pid || node.id.trim()
}

/** 导航树页面摘要用的 pageId（含配置页与 system-page）。 */
export function resolveNavPageSummaryId(node: ProjectBlueprintTreeNodeData): string {
  const configPageId = resolvePageNodePageId(node)
  if (configPageId !== '') return configPageId
  if (node.nodeKind === 'system-page') {
    return normalizePageIdFromPath(node.path) || node.id.trim()
  }
  return ''
}

function createProjectDescriptionContext(node: ProjectBlueprintTreeNodeData | null | undefined): ProjectDescriptionContext | null {
  const d = readProjectNodeDescription(node)
  if (!node || !d) return null
  return { nodeId: node.id, title: node.title, nodeKind: node.nodeKind ?? 'page', description: d }
}

export function appendProjectDescriptionContext(c: readonly ProjectDescriptionContext[], node: ProjectBlueprintTreeNodeData | null | undefined): ProjectDescriptionContext[] {
  const n = createProjectDescriptionContext(node)
  return n === null ? [...c] : [...c, n]
}

/** Build Project Page Summaries Options 的调用配置。 */
type BuildProjectPageSummariesOptions = {
    /** description Context 字段。 */
descriptionContext?: readonly ProjectDescriptionContext[]
}

export function buildProjectPageSummaries(
  nodes: readonly ProjectBlueprintTreeNodeData[],
  options: BuildProjectPageSummariesOptions = {},
): ProjectPageNodeSummary[] {
  const pages: ProjectPageNodeSummary[] = []
  const seen = new Set<string>()

  const visit = (
    list: readonly ProjectBlueprintTreeNodeData[],
    context: readonly ProjectDescriptionContext[],
  ): void => {
    for (const node of list) {
      const nextContext = appendProjectDescriptionContext(context, node)
      const surface = resolveProjectPageSurface(node)
      const pageId = resolveNavPageSummaryId(node)
      if (pageId !== '' && (surface === 'config-files' || surface === 'system-page') && !seen.has(pageId)) {
        const description = readProjectNodeDescription(node)
        seen.add(pageId)
        pages.push({
          pageId,
          path: node.path ?? `/${pageId}`,
          title: node.title,
          nodeId: node.id,
          nodeKind: node.nodeKind ?? 'page',
          designSurface: surface,
          description,
          ...(node.planningAttachmentRef?.trim()
            ? { planningAttachmentRef: node.planningAttachmentRef.trim() }
            : {}),
          descriptionContext: nextContext,
          effectiveDescription: formatProjectDescriptionContext(nextContext),
          ...(node.icon !== undefined ? { icon: node.icon } : {}),
          ...(node.implGate !== undefined ? { implGate: node.implGate } : {}),
          ...(node.upstreamContractsSatisfied !== undefined
            ? { upstreamContractsSatisfied: node.upstreamContractsSatisfied }
            : {}),
        })
      }
      visit(node.children ?? [], nextContext)
    }
  }

  visit(nodes, options.descriptionContext ?? [])
  return pages
}

export function flattenProjectBlueprintTree(root: ProjectBlueprintTreeData): Array<{ node: ProjectBlueprintTreeNodeData; pid: string }> {
  const normalizedRoot = normalizeBlueprintTree(root)
  const rootId = normalizedRoot.id?.trim()
  if (!rootId) {
    throw new Error('项目蓝图根节点 id 不能为空')
  }
  const r: Array<{ node: ProjectBlueprintTreeNodeData; pid: string }> = []
  const visit = (nodes: readonly ProjectBlueprintTreeNodeData[], pid: string): void => {
    for (const n of nodes) { r.push({ node: n, pid }); visit(Array.isArray(n.children) ? n.children : [], n.id); delete n.children }
  }
  const rootNode: ProjectBlueprintTreeNodeData = { ...normalizedRoot, id: rootId, nodeKind: normalizedRoot.nodeKind ?? 'module' }
  r.push({ node: rootNode, pid: '' })
  visit(rootNode.children ?? [], rootId)
  delete rootNode.children
  return r
}

/** 树节点最小接口——避免循环依赖 */
type TreeNodeLike = {
    /** 唯一标识。 */
readonly id: string
    /** pid 字段。 */
readonly pid: string
  /** 将索引节点转回完整 ProjectBlueprintTreeNodeData；用于从扁平索引重建树结构或输出持久化格式 */
  toNodeData(): ProjectBlueprintTreeNodeData
}

export function buildProjectBlueprintTree(nodes: Iterable<TreeNodeLike>): ProjectBlueprintTreeNodeData[] {
  const byParent = new Map<string, ProjectBlueprintTreeNodeData[]>()
  for (const model of nodes) {
    const data = { ...model.toNodeData() }
    delete data.children
    const bucket = byParent.get(model.pid) ?? []
    bucket.push(data)
    byParent.set(model.pid, bucket)
  }
  for (const bucket of byParent.values()) {
    sortNavNodes(bucket)
  }
  const attachChildren = (node: ProjectBlueprintTreeNodeData): void => {
    const children = byParent.get(node.id) ?? []
    if (children.length === 0) return
    node.children = children
    for (const child of children) attachChildren(child)
  }
  const roots = byParent.get('') ?? []
  sortNavNodes(roots)
  for (const root of roots) attachChildren(root)
  return roots
}

export function findFlatNodeLocation<T extends TreeNodeLike>(
  nodesById: ReadonlyMap<string, T>,
  getChildren: (pid: string) => readonly T[],
  targetId: string,
): ProjectBlueprintTreeNodeLocation | null {
  const normalized = targetId.trim()
  const model = nodesById.get(normalized)
  if (!model) return null
  const node = model.toNodeData()
  const pid = model.pid.trim()
  const parentModel = pid ? nodesById.get(pid) : undefined
  const parent = parentModel?.toNodeData() ?? null
  const siblings = getChildren(pid)
  const index = siblings.findIndex((sibling) => sibling.id === normalized)
  return {
    node,
    parent,
    parentId: parent?.id ?? null,
    index: index >= 0 ? index : 0,
  }
}

function sortNavNodes(nodes: ProjectBlueprintTreeNodeData[]): ProjectBlueprintTreeNodeData[] {
  return nodes.sort((a, b) => { const oa = typeof a.order === 'number' ? a.order : 0; const ob = typeof b.order === 'number' ? b.order : 0; return oa !== ob ? oa - ob : a.id.localeCompare(b.id) })
}
