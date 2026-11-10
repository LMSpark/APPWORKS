import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createDynamicRouter } from '../../router/dynamic'
import type { RuntimeNavigation } from '../../navigation/runtime-navigation'

const DummyPage = defineComponent({ name: 'DummyPage', template: '<div />' })

const APP_NAV: RuntimeNavigation = {
  id: 'root',
  projectId: 'P1',
  title: 'app',
  childPlacement: 'header',
  items: [
    { id: 'untargeted', title: '未绑定', itemKind: 'page', path: '/legacy/form.html', children: [] },
    { id: 'targeted', title: '已绑定', itemKind: 'page', path: '/orders',
      tool: { projectId: 'P1', pageId: 'orders-tool' }, children: [] },
  ],
}

describe('DynamicRouter untargeted config page', () => {
  it('registers an explicit error route for the untargeted node without failing the navigation', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const dynamicRouter = createDynamicRouter({
      router,
      pageComponent: DummyPage,
      loadNavigation: vi.fn().mockResolvedValue(APP_NAV),
      preAuthNavTree: { id: 'pre', title: 'pre', childPlacement: 'header', items: [] },
      isAuthenticated: () => true,
    })

    await expect(dynamicRouter.registerRoutes()).resolves.toBeUndefined()

    const routes = router.getRoutes()
    const untargeted = routes.find(route => route.name === 'nav-untargeted')
    const targeted = routes.find(route => route.name === 'nav-targeted')
    expect(untargeted?.meta).toMatchObject({ type: 'invalid-config-page', pageId: 'untargeted', nodeId: 'untargeted' })
    expect(targeted?.meta).toMatchObject({ type: 'config-page', pageId: 'orders-tool' })
  })
})
