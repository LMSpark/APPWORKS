import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Router } from 'vue-router'
import type { RuntimeNavigation } from '@spark-appworks/spark-app'
import { useNavigation } from '../../packages/spark-app/src/navigation/useNavigation'
import { CROSS_PROJECT_REF_HOST_ROUTE_NAME } from '../../packages/spark-app/src/router/cross-project-ref-route'

type NavigateToPath = {
  (path: string): void}

const refreshRoutesMock = vi.hoisted(() => vi.fn<() => Promise<RuntimeNavigation | null>>())

vi.mock('../../packages/spark-app/src/navigation/nav-access', () => ({
  refreshRoutes: refreshRoutesMock,
}))

type MountedNavigationProbe = {
  router: Router
  navigateToPath: NavigateToPath
  setContextValue: ReturnType<typeof useNavigation>['setContextValue']
  navigateTo: ReturnType<typeof useNavigation>['navigateTo']}

const DummyPage = defineComponent({
  name: 'DummyPage',
  setup() {
    return () => h('div')
  },
})

const NAV_ROOT: RuntimeNavigation = {
  id: 'root',
  title: 'root',
  childPlacement: 'header',
  items: [],
}

async function mountNavigationProbe(initialPath: string, root: RuntimeNavigation = NAV_ROOT): Promise<MountedNavigationProbe> {
  let navigateToPath: NavigateToPath | null = null
  let navigateTo: ReturnType<typeof useNavigation>['navigateTo'] | null = null
  let setContextValue: ReturnType<typeof useNavigation>['setContextValue'] | null = null

  const ProbeRoot = defineComponent({
    name: 'ProbeRoot',
    setup() {
      const navigation = useNavigation(root)
      navigateToPath = navigation.navigateToPath
      navigateTo = navigation.navigateTo
      setContextValue = navigation.setContextValue
      return () => h('div')
    },
  })

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/demo/r-form-compare',
        name: 'demo-r-form-compare',
        component: DummyPage,
        meta: { type: 'system-page' },
      },
      {
        path: '/t/:tenantId/:projectId/home',
        name: 'tenant-home',
        component: DummyPage,
        meta: { type: 'system-page' },
      },
      {
        path: '/t/:tenantId/:projectId/dashboard',
        name: 'tenant-dashboard',
        component: DummyPage,
        meta: { type: 'system-page' },
      },
      {
        path: '/t/:tenantId/:projectId/homepage/dataset-demo',
        name: 'tenant-dataset-demo-config',
        component: DummyPage,
        meta: { type: 'config-page', pageId: '06c56d10-4ff6-4c4d-a6ce-772536592c75' },
      },
      {
        path: '/t/:tenantId/:projectId/homepage/dataset-demo',
        name: 'tenant-dataset-demo-ref',
        component: DummyPage,
        meta: {
          type: 'cross-project-ref',
          refProjectId: 'demo-project',
          refPath: '@app:demo-project/dataset-demo',
          refPageId: 'dataset-demo',
        },
      },
      {
        path: '/t/:tenantId/:projectId/__ref/:refNodeId',
        name: CROSS_PROJECT_REF_HOST_ROUTE_NAME,
        component: DummyPage,
        meta: {
          type: 'cross-project-ref',
          crossProjectRefHost: true,
        },
      },
    ],
  })

  await router.push(initialPath)
  await router.isReady()

  mount(ProbeRoot, {
    global: {
      plugins: [router],
    },
  })

  if (navigateToPath === null) {
    throw new Error('navigation probe did not expose navigateToPath')
  }
  if (navigateTo === null) {
    throw new Error('navigation probe did not expose navigateTo')
  }

  const resolvedNavigateToPath: NavigateToPath = navigateToPath
  const resolvedNavigateTo: ReturnType<typeof useNavigation>['navigateTo'] = navigateTo

  if (setContextValue === null) throw new Error('navigation probe did not expose setContextValue')
  return { router, navigateToPath: resolvedNavigateToPath, navigateTo: resolvedNavigateTo, setContextValue }
}

describe('useNavigation platform paths', () => {
  it('keeps repeated scenario arguments when a module context changes', async () => {
    const { router, setContextValue } = await mountNavigationProbe('/t/lmspark/homepage/home?additionalScenarioIds=S2&additionalScenarioIds=S3&bare&blank=', {
      ...NAV_ROOT, items: [{ id: 'module', title: 'Module', path: '/home', itemKind: 'system-page',
        context: { source: [{ id: 'D1', title: 'Department' }], paramName: 'dept' } }],
    })
    setContextValue('D1')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ additionalScenarioIds: ['S2', 'S3'], bare: null, blank: '', dept: 'D1' })
  })
  beforeEach(() => {
    refreshRoutesMock.mockReset()
    refreshRoutesMock.mockResolvedValue(null)
  })

  it('keeps platform system pages unprefixed when current route is tenant scoped', async () => {
    const { router, navigateToPath } = await mountNavigationProbe('/t/lmspark/homepage/home')

    navigateToPath('/demo/r-form-compare')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/demo/r-form-compare')
  })

  it('still prefixes tenant system pages from bare app paths', async () => {
    const { router, navigateToPath } = await mountNavigationProbe('/t/lmspark/homepage/home')

    navigateToPath('/dashboard?scenarioId=S1&additionalScenarioIds=S2&additionalScenarioIds=S3&bare&blank=#section')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/t/lmspark/homepage/dashboard')
    expect(router.currentRoute.value.query).toEqual({ scenarioId: 'S1', additionalScenarioIds: ['S2', 'S3'], bare: null, blank: '' })
    expect(router.currentRoute.value.hash).toBe('#section')
  })

  it('uses the named cross-project route when another route has the same path', async () => {
    const { router, navigateToPath } = await mountNavigationProbe('/t/lmspark/homepage/home')

    navigateToPath('/homepage/dataset-demo')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('tenant-dataset-demo-ref')
    expect(router.currentRoute.value.meta['refProjectId']).toBe('demo-project')
  })

  it('refreshes stale routes and opens ref nodes through the host route', async () => {
    const { router, navigateTo } = await mountNavigationProbe('/t/lmspark/homepage/home')

    navigateTo({
      id: '06c56d10-4ff6-4c4d-a6ce-772536592c75',
      title: 'project list ref',
      itemKind: 'ref',
      path: '/project-list',
      refPath: '@app:engineering-pm/project-list',
      refProjectId: 'engineering-pm',
      children: [],
    })
    await flushPromises()

    expect(refreshRoutesMock).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.name).toBe(CROSS_PROJECT_REF_HOST_ROUTE_NAME)
    expect(router.currentRoute.value.params['refNodeId']).toBe('06c56d10-4ff6-4c4d-a6ce-772536592c75')
    expect(router.hasRoute(CROSS_PROJECT_REF_HOST_ROUTE_NAME)).toBe(true)
  })
})
