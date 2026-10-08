import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeNavigation } from '@spark-appworks/spark-app'
import type { LowcodeApplicationSelectionReceipt } from '@spark-appworks/spark-lowcode-api'
import { resetAppProjectWorkspace } from '@/services/project/project-shell'

type NavigationSyncState = {
  tree: RuntimeNavigation | null
  refreshCalls: number
  refresh: (() => Promise<RuntimeNavigation | null>) | null
}
const navTreeState = vi.hoisted((): NavigationSyncState => ({
  tree: null,
  refreshCalls: 0,
  refresh: null,
}))

vi.mock('@spark-appworks/spark-app', () => ({
  getNavTree: vi.fn(() => navTreeState.tree),
  refreshRoutes: vi.fn(async () => {
    navTreeState.refreshCalls += 1
    if (navTreeState.refresh !== null) return navTreeState.refresh()
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
    navTreeState.refresh = null
  })

  it('syncCommittedNavigation updates only the runtime shell', () => {
    const shellWrites: RuntimeNavigation[] = []
    const unregister = registerShellNavRootListener((nav) => {
      if (nav) shellWrites.push(nav)
    })

    syncCommittedNavigation(sampleNav)

    expect(shellWrites).toHaveLength(1)
    expect(shellWrites[0]?.items[0]?.id).toBe('alpha-node')
    expect(getAppProjectWorkspace().project.hasLoadedBlueprint).toBe(false)
    expect(getAppProjectBlueprintWorkspace().project.hasLoadedBlueprint).toBe(false)

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
    expect(getAppProjectWorkspace().project.hasLoadedBlueprint).toBe(false)
  })

  it('reloadAndSyncNavigation refreshes routes once then syncs', async () => {
    registerShellNavRootListener(() => {})

    await reloadAndSyncNavigation()

    expect(navTreeState.refreshCalls).toBe(1)
    expect(vi.mocked(refreshRoutes)).toHaveBeenCalledTimes(1)
    expect(getAppProjectWorkspace().project.hasLoadedBlueprint).toBe(false)
  })

  it('does not sync refreshed navigation after the supplied receipt becomes stale', async () => {
    const shellWrites: RuntimeNavigation[] = []
    registerShellNavRootListener((nav) => { if (nav) shellWrites.push(nav) })
    let current = true
    const receipt: LowcodeApplicationSelectionReceipt = {
      assertCurrent() { if (!current) throw new Error('selection stale') },
    }
    let resolveRefresh: (nav: RuntimeNavigation | null) => void = () => undefined
    navTreeState.refresh = () => new Promise(resolve => { resolveRefresh = resolve })

    const reload = reloadAndSyncNavigation(receipt)
    await vi.waitFor(() => expect(navTreeState.refreshCalls).toBe(1))
    current = false
    resolveRefresh({ ...sampleNav, title: 'stale nav' })

    await expect(reload).rejects.toThrow('selection stale')
    expect(shellWrites).toHaveLength(0)
  })

  it('rechecks a supplied receipt after a failed refresh and preserves a current error', async () => {
    const error = new Error('refresh failed')
    let current = true
    const receipt: LowcodeApplicationSelectionReceipt = {
      assertCurrent() { if (!current) throw new Error('selection stale') },
    }
    navTreeState.refresh = () => Promise.reject(error)
    await expect(reloadAndSyncNavigation(receipt)).rejects.toBe(error)

    let rejectRefresh: (reason: unknown) => void = () => undefined
    navTreeState.refresh = () => new Promise((_, reject) => { rejectRefresh = reject })
    const reload = reloadAndSyncNavigation(receipt)
    await vi.waitFor(() => expect(navTreeState.refreshCalls).toBe(2))
    current = false
    rejectRefresh(error)
    await expect(reload).rejects.toThrow('selection stale')
  })
})
