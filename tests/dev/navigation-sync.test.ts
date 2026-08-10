import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeNavigation } from '@spark-appworks/spark-app'
import { resetAppProjectWorkspace } from '@/services/project/project-shell'

const navTreeState = vi.hoisted(() => ({
  tree: null as RuntimeNavigation | null,
  refreshCalls: 0,
}))

vi.mock('@spark-appworks/spark-app', () => ({
  getNavTree: vi.fn(() => navTreeState.tree),
  refreshRoutes: vi.fn(async () => {
    navTreeState.refreshCalls += 1
    return navTreeState.tree
  }),
}))

import { refreshRoutes } from '@spark-appworks/spark-app'
import {
  registerShellNavRootListener,
  reloadAndSyncNavigation,
  syncCommittedNavigation,
  syncCommittedNavigationFromRouter,
} from '@/services/project/project-shell'
import { getAppProjectWorkspace } from '@/services/project/project-shell'
import { getAppProjectBlueprintWorkspace } from '@/services/project/project-shell'

const sampleNav: RuntimeNavigation = {
  title: 'root',
  childPlacement: 'header',
  items: [
    { id: 'alpha-node', title: 'Alpha', itemKind: 'page', path: '/alpha' },
  ],
}

describe('navigation-sync', () => {
  beforeEach(() => {
    resetAppProjectWorkspace()
    navTreeState.tree = { ...sampleNav, items: [...sampleNav.items] }
    navTreeState.refreshCalls = 0
  })

  it('syncCommittedNavigation updates only the runtime shell', () => {
    const shellWrites: RuntimeNavigation[] = []
    const unregister = registerShellNavRootListener((nav) => {
      if (nav) shellWrites.push(nav)
    })

    syncCommittedNavigation(sampleNav)

    expect(shellWrites).toHaveLength(1)
    expect(shellWrites[0]?.items[0]?.id).toBe('alpha-node')
    expect(getAppProjectWorkspace().project.readBlueprintProjection().tree).toEqual([])
    expect(getAppProjectBlueprintWorkspace().project.readBlueprintProjection().tree).toEqual([])

    unregister()
  })

  it('syncCommittedNavigationFromRouter uses getNavTree without HTTP', () => {
    const shellWrites: RuntimeNavigation[] = []
    registerShellNavRootListener((nav) => {
      if (nav) shellWrites.push(nav)
    })

    syncCommittedNavigationFromRouter()

    expect(shellWrites).toHaveLength(1)
    expect(vi.mocked(refreshRoutes)).not.toHaveBeenCalled()
    expect(getAppProjectWorkspace().project.readBlueprintProjection().tree).toEqual([])
  })

  it('reloadAndSyncNavigation refreshes routes once then syncs', async () => {
    registerShellNavRootListener(() => {})

    await reloadAndSyncNavigation()

    expect(navTreeState.refreshCalls).toBe(1)
    expect(vi.mocked(refreshRoutes)).toHaveBeenCalledTimes(1)
    expect(getAppProjectWorkspace().project.readBlueprintProjection().tree).toEqual([])
  })
})
