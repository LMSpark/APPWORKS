import { mount } from '@vue/test-utils'
import { defineComponent, reactive } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import type { NavigationContext } from '../navigation/nav-types'
import type { RuntimeNavigation, RuntimeNavigationItem } from '../navigation/runtime-navigation'
import { useNavigation } from '../navigation/useNavigation'
import { createNavigationActionRegistry } from '../navigation/action-registry'

describe('useNavigation system-action handling', () => {
  it('executes action commands without pushing unmatched routes', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    await router.isReady()

    const actionNode: RuntimeNavigationItem = {
      id: 'settings-action',
      title: 'Settings',
      itemKind: 'system-action',
      path: 'settings',
    }
    const navRoot = reactive<RuntimeNavigation>({
      title: '',
      childPlacement: 'header',
      items: [actionNode],
    })
    const registry = createNavigationActionRegistry()
    const handler = vi.fn()
    registry.register('settings', handler)

    const navigationContext: { value?: NavigationContext } = {}
    const Harness = defineComponent({
      setup() {
        navigationContext.value = useNavigation(navRoot, { actionRegistry: registry })
        return () => null
      },
    })

    const push = vi.spyOn(router, 'push')
    mount(Harness, { global: { plugins: [router] } })

    const nav = navigationContext.value
    if (nav === undefined) {
      throw new Error('Navigation context was not initialized')
    }
    nav.navigateTo(actionNode)
    await Promise.resolve()

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ command: 'settings', node: actionNode }))
    expect(push).not.toHaveBeenCalled()
  })

  it('keeps the first sidebar projection when a deeper active node also resolves to sidebar', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/dev', component: { template: '<div />' } },
        { path: '/dbms', component: { template: '<div />' } },
        { path: '/cache-manager', component: { template: '<div />' } },
        { path: '/settings', component: { template: '<div />' } },
        { path: '/page-manager', component: { template: '<div />' } },
      ],
    })
    await router.push('/settings')
    await router.isReady()

    const navRoot = reactive<RuntimeNavigation>({
      title: '',
      childPlacement: 'header',
      items: [
        {
          id: 'dev-center',
          itemKind: 'module',
          title: '开发中心',
          childPlacement: 'sidebar',
          children: [
            { id: 'dev', itemKind: 'system-page', title: '开发工作台', path: '/dev' },
            { id: 'dbms', itemKind: 'system-page', title: '数据库管理', path: '/dbms' },
            { id: 'cache', itemKind: 'system-page', title: '缓存管理', path: '/cache-manager' },
            {
              id: 'system-config',
              itemKind: 'module',
              title: '系统配置',
              childPlacement: 'sidebar',
              children: [
                { id: 'settings', itemKind: 'system-page', title: '系统设置', path: '/settings' },
                { id: 'page-manager', itemKind: 'system-page', title: '页面管理', path: '/page-manager' },
              ],
            },
          ],
        },
      ],
    })

    const navigationContext: { value?: NavigationContext } = {}
    const Harness = defineComponent({
      setup() {
        navigationContext.value = useNavigation(navRoot)
        return () => null
      },
    })

    mount(Harness, { global: { plugins: [router] } })

    const nav = navigationContext.value
    if (nav === undefined) {
      throw new Error('Navigation context was not initialized')
    }

    expect(nav.regionItems.value.sidebar.map((node) => node.title)).toEqual([
      '开发工作台',
      '数据库管理',
      '缓存管理',
      '系统配置',
    ])
  })
})
