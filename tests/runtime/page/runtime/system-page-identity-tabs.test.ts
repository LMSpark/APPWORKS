import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject, nextTick, onUnmounted, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, useRoute, useRouter } from 'vue-router'
import type { RuntimeNavigation } from '@spark-appworks/spark-app'
import type { LowcodeApplicationSelectionReceipt } from '@spark-appworks/spark-lowcode-api'
import { createDynamicRouter } from '../../../../packages/spark-app/src/router/dynamic'
import { SystemPageIdentityResolver } from '../../../../packages/spark-app/src/router/system-page-identity/system-page-identity-resolver'
import { setDynamicRouter } from '../../../../packages/spark-app/src/navigation/nav-access'
import { NAVIGATION_ACTION_REGISTRY_KEY, type NavigationActionRegistry } from '../../../../packages/spark-app/src/navigation/action-registry'
import { activateLowcodeApplication } from '@/lowcode/lowcode-runtime'
import { PROJECT_SWITCH_KEY, type ProjectSwitchService } from '@/services/project/project-shell'
import App from '../../../../src/App.vue'

const ThemeConfiguratorModeProbe = defineComponent({
  emits: ['update:mode'],
  setup(_, { emit }) {
    return () => h('div', [
      h('button', { 'data-mode-switch': true, onClick: () => emit('update:mode', 'single') }, 'single'),
    ])
  },
})
const mountedWrappers: Array<{ exists: () => boolean; unmount: () => void }> = []

function deferred<T>(): Readonly<{
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}> {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function mountApp(options: Parameters<typeof mount>[1]) {
  const wrapper = mount(App, options)
  mountedWrappers.push(wrapper)
  return wrapper
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) {
    if (wrapper.exists()) wrapper.unmount()
  }
  vi.restoreAllMocks()
  vi.mocked(activateLowcodeApplication).mockReset()
})

vi.mock('@/lowcode/lowcode-runtime', () => ({
  activateLowcodeApplication: vi.fn(), enterLowcodeApplicationCatalog: vi.fn(), hasLowcodeSession: () => true,
  lowcodeApi: { platform: { logout: vi.fn(() => new Promise<void>(() => undefined)) } }, lowcodeRequestHeaders: () => ({}),
  readLowcodePrincipal: () => ({ enterpriseName: 'acme', applicationId: 'project', username: 'tester' }),
}))
vi.mock('@/services/project/project-shell', () => ({
  PROJECT_SWITCH_KEY: Symbol('project-switch'), NAVIGATION_ACTION_REGISTRY_KEY: Symbol('navigation-actions'),
  registerShellNavRootListener: () => () => undefined, reloadAndSyncNavigation: vi.fn(),
  syncCommittedNavigationFromRouter: vi.fn(), resetAppProjectWorkspace: vi.fn(),
}))
vi.mock('@/services/sse-events', () => ({ onPageConfigChange: () => () => undefined }))
vi.mock('@/registries/vue-page-registry', () => ({ getPublicPaths: () => new Set(['/login', '/']) }))

let mountedProjectSwitch: ProjectSwitchService | null = null
let mountedNavigationActions: NavigationActionRegistry | null = null
let nativeUnmounts = 0

const AppLayoutProbe = defineComponent({
  setup(_, { slots }) {
    mountedProjectSwitch = inject(PROJECT_SWITCH_KEY, null)
    return () => h('main', Object.values(slots).flatMap(slot => slot?.() ?? []))
  },
})

const AppHeaderProbe = defineComponent({
  setup(_, { slots }) {
    mountedNavigationActions = inject(NAVIGATION_ACTION_REGISTRY_KEY, null)
    return () => h('header', slots['nav']?.())
  },
})

const page = defineComponent({
  name: 'NativeFixture',
  setup() {
    const route = useRoute()
    const router = useRouter()
    const count = ref(0)
    onUnmounted(() => { nativeUnmounts++ })
    const queryValues = route.query['a']
    return () => h('button', {
      'data-node': route.meta['nodeId'], 'data-full-path': route.fullPath,
      'data-router': typeof router.push, 'data-query-values': Array.isArray(queryValues) ? queryValues.join(',') : String(queryValues),
      'data-query-frozen': Object.isFrozen(route.query),
      'data-query-array-frozen': Object.isFrozen(queryValues),
      'data-matched-frozen': Object.isFrozen(route.matched),
      'data-record-frozen': Object.isFrozen(route.matched[0]),
      onClick: () => count.value++,
    }, `${String(route.meta['nodeId'])}:${count.value}`)
  },
})

async function setupIdentity(component = page) {
  const router = createRouter({ history: createMemoryHistory(), routes: [] })
  let failNavigationLoad = false
  let navigation = {
    id: 'root', title: 'Root', childPlacement: 'header' as const, projectId: 'project',
    items: [
        { id: 'system-node', title: 'Dashboard', path: '/dashboard' },
      { id: 'system-node-two', title: 'Dashboard Two', itemKind: 'system-page' as const, path: '/dashboard' },
    ],
  }
  const dynamic = createDynamicRouter({
    router,
    pageComponent: page,
    tenantPathPrefix: '/t/:tenantId/:projectId',
    loadNavigation: async () => { if (failNavigationLoad) throw new Error('navigation load failed'); return navigation },
    componentMap: { '/dashboard': component },
  })
  await dynamic.registerRoutes()
  return { router, dynamic, setNavigation: (next: typeof navigation) => { navigation = next },
    setFailNavigationLoad: (next: boolean) => { failNavigationLoad = next } }
}

describe('system page identity pool', () => {
  it.each(['old-success', 'old-failure'] as const)(
    'does not let a pre-reset %s navigation refresh unlock native owner registration', async (outcome) => {
      const router = createRouter({ history: createMemoryHistory(), routes: [] })
      const oldLoad = deferred<RuntimeNavigation>()
      const pageNavigation: RuntimeNavigation = {
        id: 'root', title: 'Root', childPlacement: 'header', projectId: 'project',
        items: [{ id: 'system-node', title: 'Dashboard', itemKind: 'system-page', path: '/dashboard' }],
      }
      const preAuthNavigation: RuntimeNavigation = { ...pageNavigation, projectId: 'public' }
      let loadCount = 0
      const dynamic = createDynamicRouter({
        router, pageComponent: page, tenantPathPrefix: '/t/:tenantId/:projectId',
        preAuthNavTree: preAuthNavigation,
        loadNavigation: () => {
          loadCount += 1
          if (loadCount === 2) return oldLoad.promise
          return Promise.resolve(pageNavigation)
        },
        componentMap: { '/dashboard': page },
      })
      await dynamic.registerRoutes()
      await router.push('/t/acme/project/dashboard?__sparkNavigationId=system-node')
      expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeDefined()

      const oldRefresh = dynamic.refreshRoutes()
      await vi.waitFor(() => expect(loadCount).toBe(2))
      dynamic.resetSystemPageInstances()
      if (outcome === 'old-success') oldLoad.resolve(pageNavigation)
      else oldLoad.reject(new Error('old navigation failed'))
      if (outcome === 'old-success') await expect(oldRefresh).resolves.toBeDefined()
      else await expect(oldRefresh).rejects.toThrow('old navigation failed')

      if (outcome === 'old-failure') {
        expect(router.resolve('/dashboard?__sparkNavigationId=system-node').matched).toHaveLength(0)
      }
      await router.push('/t/acme/project/dashboard?after-reset=1&__sparkNavigationId=system-node')
      expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeUndefined()
      if (outcome === 'old-success') {
        expect(router.currentRoute.value.meta['systemPageIdentityState']).toBe('error')
      }

      await dynamic.refreshRoutes()
      await router.push('/t/acme/project/dashboard?after-recovery=1&__sparkNavigationId=system-node')
      expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeDefined()
      expect(loadCount).toBe(3)
    },
  )

  it('reuses selected owners for query key reordering and snapshots their route', async () => {
    const { router, dynamic } = await setupIdentity()
    await router.push('/t/acme/project/dashboard?a=1&a=2&b=&__sparkNavigationId=system-node#x')
    const firstRoute = router.currentRoute.value
    const first = dynamic.getSystemPageInstance(firstRoute)
    expect(first).toBeDefined()
    if (!first) throw new Error('selected owner instance missing')
    expect(SystemPageIdentityResolver.forRouter(router).resolveComponent(firstRoute)).toBe(first?.view)
    const snapshotView = mount(first.view, { global: { plugins: [router] } })
    expect(snapshotView.get('button').attributes('data-full-path')).toBe(firstRoute.fullPath)
    expect(snapshotView.get('button').attributes('data-query-frozen')).toBe('true')
    expect(snapshotView.get('button').attributes('data-query-array-frozen')).toBe('true')
    expect(snapshotView.get('button').attributes('data-matched-frozen')).toBe('false')
    expect(snapshotView.get('button').attributes('data-record-frozen')).toBe('false')
    const originalArray = firstRoute.query['a']
    if (!Array.isArray(originalArray)) throw new Error('expected repeated query values')
    expect(Object.isFrozen(originalArray)).toBe(false)
    originalArray.push('three')
    expect(snapshotView.get('button').attributes('data-query-values')).toBe('1,2')
    snapshotView.unmount()
    await router.push('/t/acme/project/dashboard?b=&a=1&a=2&__sparkNavigationId=system-node#x')
    const reordered = dynamic.getSystemPageInstance(router.currentRoute.value)
    expect(reordered?.instanceId).toBe(first?.instanceId)
    expect(Object.keys(reordered ?? {}).sort()).toEqual(['componentName', 'instanceId', 'view'])
    expect(first?.view).toBeDefined()
  })

  it('separates query arrays, null, empty values, hashes, and scope identities', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const dynamic = createDynamicRouter({
      router, pageComponent: page, tenantPathPrefix: '/t/:tenantId/:projectId',
      loadNavigation: async () => ({ id: 'root', title: 'Root', childPlacement: 'header', projectId: 'project',
        items: [{ id: 'system-node', title: 'Dashboard', path: '/dashboard' }] }),
      loadPlatformNavigation: async () => ({ id: 'platform', title: 'Platform', childPlacement: 'header',
        items: [{ id: 'system-node', title: 'Dashboard', path: '/dashboard' }] }),
      isPlatformNavigationEnabled: () => true,
      componentMap: { '/dashboard': page },
    })
    await dynamic.registerRoutes()
    const read = async (path: string) => {
      await router.push(path)
      return dynamic.getSystemPageInstance(router.currentRoute.value)?.instanceId
    }
    const base = await read('/t/acme/project/dashboard?values=one&values=two&empty=&blank&__sparkNavigationId=system-node#section')
    expect(await read('/t/acme/project/dashboard?blank&values=one&values=two&empty=&__sparkNavigationId=system-node#section')).toBe(base)
    expect(await read('/t/acme/project/dashboard?values=two&values=one&empty=&blank&__sparkNavigationId=system-node#section')).not.toBe(base)
    expect(await read('/t/acme/project/dashboard?values=one&values=two&empty=&blank&__sparkNavigationId=system-node#other')).not.toBe(base)
    expect(await read('/t/acme/project/dashboard?values=one&values=two&empty&blank&__sparkNavigationId=system-node#section')).not.toBe(base)
    expect(await read('/t/other/project/dashboard?values=one&values=two&empty=&blank&__sparkNavigationId=system-node#section')).not.toBe(base)
    expect(await read('/platform/dashboard?values=one&values=two&empty=&blank&__sparkNavigationId=system-node#section')).not.toBe(base)
  })

  it('keeps native state in the real App KeepAlive and releases a closed instance once', async () => {
    nativeUnmounts = 0
    const { router, dynamic } = await setupIdentity()
    setDynamicRouter(dynamic)
    await router.push('/t/acme/project/dashboard?view=one&__sparkNavigationId=system-node')
    const wrapper = mountApp({ global: {
      plugins: [router],
      stubs: {
        AppLayout: AppLayoutProbe,
        AppHeader: AppHeaderProbe, AppBreadcrumb: true, AppFooter: true, AppSidebar: true,
        NavHeaderBar: true, NavContextSelector: true, ThemeConfigurator: true, AppPageUiHost: true,
      },
    } })
    await flushPromises()
    const original = dynamic.getSystemPageInstance(router.currentRoute.value)
    expect(wrapper.get('button').attributes('data-router')).toBe('function')
    await wrapper.get('button').trigger('click')
    await router.push('/t/acme/project/dashboard?view=two&__sparkNavigationId=system-node-two')
    await flushPromises()
    expect(wrapper.get('button').text()).toBe('system-node-two:0')
    await router.push('/t/acme/project/dashboard?view=one&__sparkNavigationId=system-node')
    await flushPromises()
    expect(wrapper.get('button').text()).toBe('system-node:1')
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)?.instanceId).toBe(original?.instanceId)
    if (!original) throw new Error('native page instance missing')
    expect(wrapper.get('button').attributes('data-full-path')).toContain('view=one')
    const cancel = router.beforeEach(() => false)
    const activeTab = wrapper.findAll('.app-tab-bar__tab').find(tab => tab.text().startsWith('Dashboard×'))
    if (!activeTab) throw new Error('active native tab missing')
    await activeTab.find('.app-tab-bar__tab-close').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.meta['nodeId']).toBe('system-node')
    expect(dynamic.getSystemPageInstanceById(original.instanceId)).toBeDefined()
    cancel()
    const closableTab = wrapper.findAll('.app-tab-bar__tab').find(tab => tab.text().startsWith('Dashboard×'))
    if (!closableTab) throw new Error('native tab missing after cancelled close')
    await closableTab.find('.app-tab-bar__tab-close').trigger('click')
    await flushPromises()
    await nextTick()
    await flushPromises()
    expect(router.currentRoute.value.meta['nodeId']).toBe('system-node-two')
    expect(dynamic.getSystemPageInstanceById(original.instanceId)).toBeUndefined()
    expect(nativeUnmounts).toBe(1)
    await router.push('/t/acme/project/dashboard?view=one&__sparkNavigationId=system-node')
    await flushPromises()
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)?.instanceId).not.toBe(original.instanceId)
    expect(wrapper.get('button').text()).toBe('system-node:0')
    wrapper.unmount()
  })

  it('reconciles revoked owners in the mounted App and preserves unchanged owner state', async () => {
    nativeUnmounts = 0
    const { router, dynamic, setNavigation } = await setupIdentity()
    setDynamicRouter(dynamic)
    await router.push('/t/acme/project/dashboard?__sparkNavigationId=system-node')
    const wrapper = mountApp({ global: {
      plugins: [router],
      stubs: {
        AppLayout: AppLayoutProbe,
        AppHeader: AppHeaderProbe, AppBreadcrumb: true, AppFooter: true, AppSidebar: true, AppTabBar: true,
        NavHeaderBar: true, NavContextSelector: true, ThemeConfigurator: true, AppPageUiHost: true,
      },
    } })
    await flushPromises()
    const original = dynamic.getSystemPageInstance(router.currentRoute.value)
    await wrapper.get('button').trigger('click')
    setNavigation({
      id: 'root', title: 'Root', childPlacement: 'header', projectId: 'project',
      items: [
        { id: 'system-node', title: 'Dashboard renamed', itemKind: 'system-page', path: '/dashboard' },
        { id: 'system-node-two', title: 'Dashboard Two', itemKind: 'system-page', path: '/dashboard' },
      ],
    })
    await dynamic.refreshRoutes()
    await flushPromises()
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)?.instanceId).toBe(original?.instanceId)
    expect(wrapper.get('button').text()).toBe('system-node:1')
    setNavigation({ id: 'root', title: 'Root', childPlacement: 'header', projectId: 'project', items: [] })
    await dynamic.refreshRoutes()
    await flushPromises()
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeUndefined()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('button').exists()).toBe(false)
    expect(nativeUnmounts).toBe(1)
    wrapper.unmount()
  })

  it('keeps a markerless selected owner fixed when a same-path candidate remains', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    let navigation = {
      id: 'root', title: 'Root', childPlacement: 'header' as const, projectId: 'project',
      items: [
        { id: 'selected', title: 'Selected', path: '/dashboard?view=one&detail=full' },
        { id: 'fallback', title: 'Fallback', path: '/dashboard?view=one' },
      ],
    }
    const dynamic = createDynamicRouter({ router, pageComponent: page, tenantPathPrefix: '/t/:tenantId/:projectId',
      loadNavigation: async () => navigation, componentMap: { '/dashboard': page } })
    await dynamic.registerRoutes()
    await router.push('/t/acme/project/dashboard?view=one&detail=full')
    expect(router.currentRoute.value.meta['nodeId']).toBe('selected')
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeDefined()
    const fallback = navigation.items[1]
    if (!fallback) throw new Error('fallback owner missing')
    navigation = { ...navigation, items: [fallback] }
    await dynamic.refreshRoutes()
    expect(router.currentRoute.value.meta['systemPageIdentityState']).toBe('error')
    expect(router.currentRoute.value.meta['nodeId']).toBeUndefined()
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeUndefined()
  })

  it('invalidates a current owner when its component binding changes to a same-name component', async () => {
    const { router, dynamic } = await setupIdentity()
    await router.push('/t/acme/project/dashboard?__sparkNavigationId=system-node')
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeDefined()
    const replacement = defineComponent({ name: 'NativeFixture', setup() { return () => h('button', 'replacement') } })
    const replacementDynamic = createDynamicRouter({ router, pageComponent: page,
      tenantPathPrefix: '/t/:tenantId/:projectId',
      loadNavigation: async () => ({ id: 'root', title: 'Root', childPlacement: 'header', projectId: 'project',
        items: [{ id: 'system-node', title: 'Dashboard', itemKind: 'system-page', path: '/dashboard' }] }),
      componentMap: { '/dashboard': replacement },
    })
    await replacementDynamic.registerRoutes()
    expect(router.currentRoute.value.meta['systemPageIdentityState']).toBe('error')
    expect(replacementDynamic.getSystemPageInstance(router.currentRoute.value)).toBeUndefined()
  })

  it('checks cfg cleanliness before project reset and resets native pages on logout without that guard', async () => {
    const { router, dynamic } = await setupIdentity()
    setDynamicRouter(dynamic)
    await router.push('/t/acme/project/dashboard?__sparkNavigationId=system-node')
    const wrapper = mountApp({ global: {
      plugins: [router],
      stubs: {
        AppLayout: AppLayoutProbe, AppHeader: AppHeaderProbe, AppBreadcrumb: true, AppFooter: true,
        AppSidebar: true, AppTabBar: true, NavHeaderBar: true, NavContextSelector: true,
        ThemeConfigurator: true, AppPageUiHost: true,
      },
    } })
    await flushPromises()
    const assertClean = vi.spyOn(dynamic, 'assertPageRuntimesClean').mockImplementation(() => { throw new Error('dirty cfg page') })
    const resetNative = vi.spyOn(dynamic, 'resetSystemPageInstances')
    const switchService = mountedProjectSwitch
    if (!switchService) throw new Error('project switch service was not provided')
    await expect(switchService.switchAndReload('other')).rejects.toThrow('dirty cfg page')
    expect(resetNative).not.toHaveBeenCalled()
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeDefined()
    const actions = mountedNavigationActions
    if (!actions) throw new Error('navigation action registry was not provided')
    await actions.execute('logout')
    expect(resetNative).toHaveBeenCalledOnce()
    expect(assertClean).toHaveBeenCalledOnce()
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeUndefined()
    wrapper.unmount()
  })

  it('uses the resolved home identity while allowing another owner at the same path to close', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const dynamic = createDynamicRouter({ router, pageComponent: page,
      tenantPathPrefix: '/t/:tenantId/:projectId',
      loadNavigation: async () => ({ id: 'root', title: 'Root', childPlacement: 'header', projectId: 'project',
        homePath: '/dashboard?__sparkNavigationId=report', items: [
          { id: 'landing', title: 'Landing', path: '/dashboard' },
          { id: 'report', title: 'Report', path: '/dashboard' },
        ] }),
      componentMap: { '/dashboard': page },
    })
    await dynamic.registerRoutes()
    setDynamicRouter(dynamic)
    await router.push('/t/acme/project/dashboard?__sparkNavigationId=landing')
    const wrapper = mountApp({ global: {
      plugins: [router],
      stubs: {
        AppLayout: AppLayoutProbe, AppHeader: AppHeaderProbe, AppBreadcrumb: true, AppFooter: true,
        AppSidebar: true, NavHeaderBar: true, NavContextSelector: true, ThemeConfigurator: true, AppPageUiHost: true,
      },
    } })
    await flushPromises()
    const landingTab = wrapper.findAll('.app-tab-bar__tab').find(tab => tab.text().includes('Landing'))
    expect(landingTab?.find('.app-tab-bar__tab-close').exists()).toBe(true)
    await router.push('/t/acme/project/dashboard?__sparkNavigationId=report')
    await flushPromises()
    const reportTab = wrapper.findAll('.app-tab-bar__tab').find(tab => tab.text().includes('Report'))
    expect(reportTab?.find('.app-tab-bar__tab-close').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps reset scope locked until a new owner table commits', async () => {
    const { router, dynamic, setNavigation, setFailNavigationLoad } = await setupIdentity()
    await router.push('/t/acme/project/dashboard?__sparkNavigationId=system-node')
    setDynamicRouter(dynamic)
    const wrapper = mountApp({ global: {
      plugins: [router],
      stubs: {
        AppLayout: AppLayoutProbe, AppHeader: AppHeaderProbe, AppBreadcrumb: true, AppFooter: true,
        AppSidebar: true, NavContextSelector: true,
        ThemeConfigurator: ThemeConfiguratorModeProbe, AppPageUiHost: true,
      },
    } })
    await flushPromises()
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeDefined()
    dynamic.resetSystemPageInstances()
    await flushPromises()
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeUndefined()
    expect(router.currentRoute.value.meta['nodeId']).toBeUndefined()
    expect(wrapper.find('.app-tab-bar__tab').exists()).toBe(false)
    expect(wrapper.find('.nav-header-bar__item--active').exists()).toBe(false)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    setFailNavigationLoad(true)
    await expect(dynamic.refreshRoutes()).rejects.toThrow('navigation load failed')
    await router.push('/t/acme/project/dashboard?view=after-reset&__sparkNavigationId=system-node')
    await flushPromises()
    expect(router.currentRoute.value.meta['systemPageIdentityState']).toBe('error')
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeUndefined()
    expect(wrapper.find('.app-tab-bar__tab').exists()).toBe(false)
    expect(wrapper.find('.nav-header-bar__item--active').exists()).toBe(false)
    setFailNavigationLoad(false)
    setNavigation({
      id: 'root', title: 'Root', childPlacement: 'header', projectId: 'other',
      items: [{ id: 'system-node', title: 'Dashboard', itemKind: 'system-page', path: '/dashboard' }],
    })
    await dynamic.refreshRoutes()
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeUndefined()
    await router.push('/t/acme/other/dashboard?__sparkNavigationId=system-node')
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeDefined()
    wrapper.unmount()
  })

  it('unmounts inactive native instances in single mode and preserves them on failed owner refresh', async () => {
    nativeUnmounts = 0
    let failLoad = false
    const navigation = {
      id: 'root', title: 'Root', childPlacement: 'header' as const, projectId: 'project',
      items: [
        { id: 'one', title: 'One', path: '/dashboard' },
        { id: 'two', title: 'Two', path: '/dashboard' },
      ],
    }
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const dynamic = createDynamicRouter({ router, pageComponent: page, tenantPathPrefix: '/t/:tenantId/:projectId',
      loadNavigation: async () => { if (failLoad) throw new Error('refresh failed'); return navigation },
      componentMap: { '/dashboard': page },
    })
    await dynamic.registerRoutes()
    setDynamicRouter(dynamic)
    await router.push('/t/acme/project/dashboard?__sparkNavigationId=one')
    const wrapper = mountApp({ global: {
      plugins: [router],
      stubs: {
        AppLayout: AppLayoutProbe, AppHeader: AppHeaderProbe, AppBreadcrumb: true, AppFooter: true,
        AppSidebar: true, NavHeaderBar: true, NavContextSelector: true, AppPageUiHost: true,
        ThemeConfigurator: ThemeConfiguratorModeProbe,
      },
    } })
    await flushPromises()
    const first = dynamic.getSystemPageInstance(router.currentRoute.value)
    await router.push('/t/acme/project/dashboard?__sparkNavigationId=two')
    await flushPromises()
    expect(first).toBeDefined()
    expect(dynamic.getSystemPageInstanceById(first?.instanceId ?? '')).toBeDefined()
    failLoad = true
    await expect(dynamic.refreshRoutes()).rejects.toThrow('refresh failed')
    expect(dynamic.getSystemPageInstanceById(first?.instanceId ?? '')).toBeDefined()
    failLoad = false
    await wrapper.get('[data-mode-switch]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.app-tab-bar__tab')).toHaveLength(1)
    expect(dynamic.getSystemPageInstanceById(first?.instanceId ?? '')).toBeUndefined()
    expect(nativeUnmounts).toBe(1)
    wrapper.unmount()
  })

  it('preserves native instances and reset locks when malformed routes fail the navigation commit', async () => {
    const { router, dynamic, setNavigation } = await setupIdentity()
    await router.push('/t/acme/project/dashboard?__sparkNavigationId=system-node')
    const current = router.currentRoute.value
    const instance = dynamic.getSystemPageInstance(current)
    expect(instance).toBeDefined()
    setNavigation({
      id: 'root', title: 'Root', childPlacement: 'header', projectId: 'project',
      items: [{ id: 'system-node', title: 'Dashboard', path: '/broken/:id(' }],
    })
    await expect(dynamic.refreshRoutes()).rejects.toThrow('Unfinished custom RegExp')
    expect(dynamic.getSystemPageInstanceById(instance?.instanceId ?? '')).toBeDefined()
    expect(dynamic.getSystemPageInstance(current)?.instanceId).toBe(instance?.instanceId)

    dynamic.resetSystemPageInstances()
    await expect(dynamic.refreshRoutes()).rejects.toThrow('Unfinished custom RegExp')
    await router.push('/t/acme/project/dashboard?afterCommitFailure=1&__sparkNavigationId=system-node')
    expect(router.currentRoute.value.meta['systemPageIdentityState']).toBe('error')
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeUndefined()
  })
})

