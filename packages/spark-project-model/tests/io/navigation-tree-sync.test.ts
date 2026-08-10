import { describe, expect, it, vi } from 'vitest'
import type { ProjectBlueprintClient } from '../../src/io/project-blueprint-client'
import type { ProjectBlueprintTreeData, ProjectBlueprintTreeNodeData } from '../../src/blueprint/project-blueprint-node'
import { replaceProjectBlueprintChildrenRemote } from '../../src/io/project-blueprint-tree-sync'

const serverRoot: ProjectBlueprintTreeData = {
  id: 'demo',
  title: 'Demo',
  nodeKind: 'module',
  childPlacement: 'header',
  children: [
    {
      id: 'legacy-module',
      title: 'Legacy',
      nodeKind: 'module',
      children: [
        {
          id: 'legacy-page',
          title: 'Legacy Page',
          nodeKind: 'page',
          path: '/legacy',
        },
      ],
    },
  ],
}

function createMockClient(): ProjectBlueprintClient {
  const root = structuredClone(serverRoot)
  return {
    loadRoot: vi.fn(async () => structuredClone(root)),
    addNode: vi.fn(async (params) => {
      const topLevel = params.parentId === null || params.parentId === undefined || params.parentId === root.id
      let parentChildren = root.children ?? (root.children = [])
      if (!topLevel) {
        const parent = findNode(parentChildren, params.parentId ?? '')
        if (parent === undefined) throw new Error(`parent missing: ${String(params.parentId)}`)
        parent.children ??= []
        parentChildren = parent.children
      }
      const node = { ...params.node }
      parentChildren.splice(params.index ?? parentChildren.length, 0, node)
      return node
    }),
    updateNode: vi.fn(async (id, patch) => {
      const node = findNode(root.children ?? [], id)
      if (node === undefined) throw new Error(`missing ${id}`)
      Object.assign(node, patch)
      return node
    }),
    deleteNode: vi.fn(async (id) => {
      removeNode(root.children ?? [], id)
      return null
    }),
    moveNode: vi.fn(),
    probeLink: vi.fn(),
  } as unknown as ProjectBlueprintClient
}

function findNode(nodes: ProjectBlueprintTreeData['children'], id: string): ProjectBlueprintTreeNodeData | undefined {
  if (!Array.isArray(nodes)) return undefined
  for (const node of nodes) {
    if (node.id === id) return node
    const nested = findNode(node.children ?? [], id)
    if (nested !== undefined) return nested
  }
  return undefined
}

function removeNode(nodes: ProjectBlueprintTreeData['children'], id: string): boolean {
  if (!Array.isArray(nodes)) return false
  const index = nodes.findIndex((node) => node.id === id)
  if (index >= 0) {
    nodes.splice(index, 1)
    return true
  }
  for (const node of nodes) {
    if (removeNode(node.children ?? [], id)) return true
  }
  return false
}

describe('replaceProjectBlueprintChildrenRemote', () => {
  it('adds new module/page tree and removes legacy nodes', async () => {
    const client = createMockClient()
    const result = await replaceProjectBlueprintChildrenRemote(client, serverRoot, [
      {
        id: 'core-module',
        title: 'Core',
        nodeKind: 'module',
        children: [
          {
            id: 'core-home',
            title: 'Home',
            nodeKind: 'page',
            path: '/core/home',
          },
        ],
      },
    ])

    expect(client.deleteNode).toHaveBeenCalled()
    expect(client.addNode).toHaveBeenCalled()
    expect(result.children?.some((node) => node.id === 'core-module')).toBe(true)
    const reloaded = await client.loadRoot()
    expect(findNode(reloaded.children, 'legacy-page')).toBeUndefined()
    expect(findNode(reloaded.children, 'core-home')?.title).toBe('Home')
  })
})
