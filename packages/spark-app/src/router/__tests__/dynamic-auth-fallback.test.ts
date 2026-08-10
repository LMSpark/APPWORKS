import { describe, it, expect, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createDynamicRouter } from '../dynamic'
import { PageContentLoader } from '@spark-appworks/spark-project-model'
import type { RuntimeNavigation } from '../../navigation/runtime-navigation'

const DummyPage = defineComponent({
  name: 'DummyPage',
  template: '<div />',
})

const PRE_AUTH_NAV: RuntimeNavigation = {
  id: 'root',
  title: 'root',
  childPlacement: 'header',
  items: [
    {
      id: 'login-node',
      title: 'login',
      itemKind: 'system-page',
      path: '/login',
      children: [],
    },
    {
      id: 'demo-node',
      title: 'demo',
      itemKind: 'system-page',
      path: '/demo/template-dsl',
      children: [],
    },
  ],
}

const DUMMY_PAGE_CONTENT_LOADER = new PageContentLoader({ projectId: 'test' })

describe('DynamicRouter unauthorized fallback', () => {
  it('falls back to preAuthNavTree when loadNavigation returns 401', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const loadNavigation = vi.fn().mockRejectedValue({ status: 401 })

    const dynamicRouter = createDynamicRouter({
      router,
      pageContentLoader: DUMMY_PAGE_CONTENT_LOADER,
      pageComponent: DummyPage,
      loadNavigation,
      preAuthNavTree: PRE_AUTH_NAV,
      isAuthenticated: () => true,
      tenantPathPrefix: '/t/:tenantId/:projectId',
    })

    await expect(dynamicRouter.registerRoutes()).resolves.toBeUndefined()
    expect(loadNavigation).toHaveBeenCalledOnce()
    expect(dynamicRouter.getRegisteredRoutes()).toContain('/login')
    expect(dynamicRouter.getRegisteredRoutes()).toContain('/demo/template-dsl')
  })

  it('falls back to preAuthNavTree when loadNavigation returns 401 and user is not authenticated', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const loadNavigation = vi.fn().mockRejectedValue({ status: 401 })

    const dynamicRouter = createDynamicRouter({
      router,
      pageContentLoader: DUMMY_PAGE_CONTENT_LOADER,
      pageComponent: DummyPage,
      loadNavigation,
      preAuthNavTree: PRE_AUTH_NAV,
      isAuthenticated: () => false,
    })

    await expect(dynamicRouter.registerRoutes()).resolves.toBeUndefined()
    expect(loadNavigation).not.toHaveBeenCalled()
    expect(dynamicRouter.getRegisteredRoutes()).toContain('/login')
  })

  it('uses preAuthNavTree when not authenticated without calling loadNavigation', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const loadNavigation = vi.fn()

    const dynamicRouter = createDynamicRouter({
      router,
      pageContentLoader: DUMMY_PAGE_CONTENT_LOADER,
      pageComponent: DummyPage,
      loadNavigation,
      preAuthNavTree: PRE_AUTH_NAV,
      isAuthenticated: () => false,
    })

    await dynamicRouter.registerRoutes()
    expect(loadNavigation).not.toHaveBeenCalled()
    expect(dynamicRouter.getNavTree()).toEqual(PRE_AUTH_NAV)
  })
})
