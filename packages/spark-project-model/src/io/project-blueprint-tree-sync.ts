/**
 * @module @spark-appworks/spark-project-model:io/project-blueprint-tree-sync
 * 职责：提供项目模型层 project-blueprint-tree-sync 能力，围绕 模块入口、副作用注册或内部组合逻辑 处理导航、页面文件、配置内容、工作区或远端 IO 契约。
 * 边界：只表达项目/页面配置领域模型，不直接渲染组件，也不绕过 pageDesign 四文件链路。
 * AI用途：规划导航、读写 page files 或理解 ProjectModel/ProjectWorkspace 行为时，用本模块定位 io/project-blueprint-tree-sync。
 */
import type { ProjectBlueprintTreeData, ProjectBlueprintTreeNodeData } from '../blueprint/project-blueprint-node'
import { buildBlueprintTree } from '../blueprint/project-blueprint-tree'
import { createBlueprintNodeDraft, createBlueprintNodePatch } from '../blueprint/project-blueprint-edit'
import type { ProjectBlueprintClient } from './project-blueprint-client'

type FlatNodeEntry = Readonly<{
  node: ProjectBlueprintTreeNodeData
  parentId: string | null
}>

function collectDescendantTreeNodes(
  nodes: readonly ProjectBlueprintTreeNodeData[],
  parentId: string | null,
  result: Map<string, FlatNodeEntry>,
): void {
  for (const node of nodes) {
    result.set(node.id, { node, parentId })
    if (Array.isArray(node.children) && node.children.length > 0) {
      collectDescendantTreeNodes(node.children, node.id, result)
    }
  }
}

function collectDesiredFlatNodes(children: readonly ProjectBlueprintTreeNodeData[], rootId: string): Map<string, FlatNodeEntry> {
  const result = new Map<string, FlatNodeEntry>()
  collectDescendantTreeNodes(children, rootId, result)
  return result
}

function collectServerFlatNodes(root: ProjectBlueprintTreeData): Map<string, FlatNodeEntry> {
  const rootId = root.id?.trim() ?? ''
  const result = new Map<string, FlatNodeEntry>()
  collectDescendantTreeNodes(root.children, rootId === '' ? null : rootId, result)
  return result
}

function patchChangedFields(
  previous: ProjectBlueprintTreeNodeData,
  next: ProjectBlueprintTreeNodeData,
): ReturnType<typeof createBlueprintNodePatch>['patch'] | null {
  const { patch } = createBlueprintNodePatch(createBlueprintNodeDraft(next))
  const before = createBlueprintNodePatch(createBlueprintNodeDraft(previous)).patch
  const changed = JSON.stringify(patch) !== JSON.stringify(before)
  return changed ? patch : null
}

async function deleteNodesInSafeOrder(
  client: ProjectBlueprintClient,
  idsToDelete: ReadonlySet<string>,
  serverFlat: ReadonlyMap<string, FlatNodeEntry>,
): Promise<void> {
  const pending = new Set(idsToDelete)
  while (pending.size > 0) {
    let progressed = false
    for (const id of [...pending]) {
      const hasPendingChild = [...serverFlat.entries()].some(
        ([childId, entry]) => pending.has(childId) && entry.parentId === id,
      )
      if (hasPendingChild) continue
      await client.deleteNode(id)
      pending.delete(id)
      progressed = true
    }
    if (!progressed) {
      throw new Error('project-blueprint-tree-sync: unable to resolve delete order')
    }
  }
}

function siblingIndex(
  flat: ReadonlyMap<string, FlatNodeEntry>,
  id: string,
  parentId: string | null,
): number {
  const siblings = [...flat.values()].filter((entry) => entry.parentId === parentId)
  const index = siblings.findIndex((entry) => entry.node.id === id)
  return index >= 0 ? index : siblings.length
}

/**
 * 将内存中的项目蓝图 children 树同步到远端（增量 add/update/delete）。
 */
export async function replaceProjectBlueprintChildrenRemote(
  client: ProjectBlueprintClient,
  serverRoot: ProjectBlueprintTreeData,
  children: readonly ProjectBlueprintTreeNodeData[],
): Promise<ProjectBlueprintTreeData> {
  const rootId = serverRoot.id?.trim()
  if (rootId === undefined || rootId === '') {
    throw new Error('replaceProjectBlueprintChildrenRemote: server root id is required')
  }

  const desiredFlat = collectDesiredFlatNodes(children, rootId)
  const serverFlat = collectServerFlatNodes(serverRoot)

  const idsToDelete = new Set<string>()
  for (const id of serverFlat.keys()) {
    if (!desiredFlat.has(id)) idsToDelete.add(id)
  }
  if (idsToDelete.size > 0) {
    await deleteNodesInSafeOrder(client, idsToDelete, serverFlat)
  }

  const refreshedRoot = await client.loadRoot()
  const refreshedFlat = collectServerFlatNodes(refreshedRoot)

  const pendingAdds = [...desiredFlat.keys()].filter((id) => !refreshedFlat.has(id))
  while (pendingAdds.length > 0) {
    let progressed = false
    for (let index = pendingAdds.length - 1; index >= 0; index -= 1) {
      const id = pendingAdds[index]
      if (id === undefined) continue
      const entry = desiredFlat.get(id)
      if (entry === undefined) continue
      const parentId = entry.parentId
      if (parentId !== null && !refreshedFlat.has(parentId) && pendingAdds.includes(parentId)) {
        continue
      }
      const effectiveParentId = parentId === rootId ? null : parentId
      await client.addNode({
        ...(effectiveParentId === null ? {} : { parentId: effectiveParentId }),
        node: entry.node,
        index: siblingIndex(desiredFlat, id, parentId),
      })
      refreshedFlat.set(id, entry)
      pendingAdds.splice(index, 1)
      progressed = true
    }
    if (!progressed) {
      throw new Error('project-blueprint-tree-sync: unable to resolve add order')
    }
  }

  const latestRoot = await client.loadRoot()
  const latestFlat = collectServerFlatNodes(latestRoot)
  for (const [id, entry] of desiredFlat) {
    const previous = latestFlat.get(id)?.node
    if (previous === undefined) continue
    const patch = patchChangedFields(previous, entry.node)
    if (patch !== null) {
      await client.updateNode(id, patch)
    }
  }

  return buildBlueprintTree([...children], latestRoot)
}
