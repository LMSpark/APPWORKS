import { describe, expect, it } from 'vitest'
import { resolveNavNodeRuntimeTarget } from '../navigation/runtime-target'
import { createNavigationActionRegistry } from '../navigation/action-registry'

describe('resolveNavNodeRuntimeTarget', () => {
  it('maps SPA route-like nodes to their runtime routes', () => {
    expect(resolveNavNodeRuntimeTarget({ id: 'page', title: 'Page', itemKind: 'page', path: '/orders' })).toMatchObject({
      kind: 'route',
      routeKind: 'page',
      path: '/orders',
    })
    expect(resolveNavNodeRuntimeTarget({ id: 'ref-node', title: 'Ref', itemKind: 'ref', refId: 'remote' })).toMatchObject({
      kind: 'route',
      routeKind: 'cross-project-ref',
      path: '/__ref/ref-node',
    })
    expect(resolveNavNodeRuntimeTarget({
      id: 'docs',
      title: 'Docs',
      itemKind: 'link',
      linkTarget: 'iframe',
      path: 'https://example.com/docs',
    })).toMatchObject({
      kind: 'route',
      routeKind: 'external-link',
      path: '/__link/docs',
    })
  })

  it('keeps external links and actions out of router targets while hidden pages remain routable', () => {
    expect(resolveNavNodeRuntimeTarget({
      id: 'docs-tab',
      title: 'Docs',
      itemKind: 'link',
      linkTarget: 'new-tab',
      path: 'https://example.com/docs',
    })).toMatchObject({ kind: 'external', mode: 'new-tab' })

    expect(resolveNavNodeRuntimeTarget({
      id: 'same-window',
      title: 'Same Window',
      itemKind: 'link',
      linkTarget: 'self',
      path: '/local',
    })).toMatchObject({ kind: 'external', mode: 'self' })

    expect(resolveNavNodeRuntimeTarget({
      id: 'settings-action',
      title: 'Settings',
      itemKind: 'system-action',
      path: 'settings',
    })).toEqual({ kind: 'action', command: 'settings' })

    expect(resolveNavNodeRuntimeTarget({
      id: 'sub',
      title: 'Sub',
      itemKind: 'page',
      path: '/sub',
      hidden: true,
    })).toEqual({ kind: 'route', routeKind: 'page', path: '/sub' })
  })
})

describe('NavigationActionRegistry', () => {
  it('executes registered commands and reports unknown commands as unhandled', async () => {
    const calls: string[] = []
    const registry = createNavigationActionRegistry()
    registry.register('settings', ({ command }) => {
      calls.push(command)
    })

    await expect(registry.execute('settings')).resolves.toBe(true)
    await expect(registry.execute('/settings')).resolves.toBe(false)
    await expect(registry.execute('missing')).resolves.toBe(false)
    expect(calls).toEqual(['settings'])
  })
})
