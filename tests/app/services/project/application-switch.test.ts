import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject, type Component } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { PAGE_SERVICE, useSparkComponent, type PageServiceCapability } from '@spark-appworks/spark-component'
import { createDynamicRouter } from '../../../../packages/spark-app/src/router/dynamic'
import { setDynamicRouter } from '../../../../packages/spark-app/src/navigation/nav-access'
import { NAVIGATION_ACTION_REGISTRY_KEY, type NavigationActionRegistry } from '../../../../packages/spark-app/src/navigation/action-registry'
import { activateLowcodeApplication } from '@/platform-adapters/lowcode-runtime'
import { ProjectNavigationGuard } from '@/services/project/navigation/project-navigation-guard'
import type { RuntimeNavigation } from '@spark-appworks/spark-app'
import App from '@/App.vue'
import AppList from '@/views/app/AppList.vue'

type LowcodeState = { applicationId: string | null; ownerIntent: number }
const lowcodeState = vi.hoisted((): LowcodeState => ({ applicationId: 'old', ownerIntent: 0 }))
const shellState = vi.hoisted(() => ({ reload: vi.fn(async (_receipt?: { assertCurrent(): void }) => null), resetWorkspace: vi.fn() }))
const mixedNavigation: { rejectB?: (cause: unknown) => void; finishB?: (nav: RuntimeNavigation) => void; revokeOld?: boolean } = {}
const appListData = vi.hoisted(() => ({rows: [{rowid: 'APP-A', AppName: 'app-a', AppDesc: 'App A'}], refresh: vi.fn(async () => ({success: true}))}))

vi.mock('@/platform-adapters/lowcode-runtime', () => {
  const receipt = (intent: number) => ({
    assertCurrent() {
      if (intent !== lowcodeState.ownerIntent) throw new Error('platform selection stale')
    },
  })
  return {
    activateLowcodeApplication: vi.fn(async (applicationId: string) => {
      const intent = ++lowcodeState.ownerIntent
      lowcodeState.applicationId = applicationId
      return receipt(intent)
    }),
    enterLowcodeApplicationCatalog: vi.fn(() => {
      const intent = ++lowcodeState.ownerIntent
      lowcodeState.applicationId = null
      return receipt(intent)
    }),
    hasLowcodeSession: () => true,
    lowcodeApi: {
      application: { get: () => lowcodeState.applicationId ? ({ application: { id: lowcodeState.applicationId } }) : null },
      session: { get: () => ({ enterprise: { shortName: 'acme' }, identity: { account: 'admin' } }) },
      platform: {
        logout: vi.fn(async () => undefined),
        cancelPendingApplicationSelection: vi.fn(),
        captureAuthenticationScope: () => () => true,
      },
    },
    lowcodeEnterpriseDisplayName: () => 'Acme',
    lowcodeRealtime: { fetchOfflineMessages: async () => [], confirmMessages: async () => undefined },
    lowcodeRequestHeaders: () => ({}),
    readLowcodePrincipal: () => ({ enterpriseName: 'acme', applicationId: lowcodeState.applicationId,
      username: 'tester', displayName: 'Tester' }),
  }
})
vi.mock('@spark-appworks/spark-project-model', async importOriginal => {
  const actual = await importOriginal<typeof import('@spark-appworks/spark-project-model')>()
  return {...actual, PageRuntime: class {
    destroyed = false
    constructor(readonly options: {scenarioIds: string[]; loadScenario: (id: string) => Promise<unknown>}) {}
    async load() {for (const id of this.options.scenarioIds) await this.options.loadScenario(id)}
    getDataSet() {return {getView: () => ({primaryKey: 'rowid', queryConfig: {allPages: true, distinct: true},
      dataTable: {modelBinding: {modelName: 'Base_AppSystemList'}}, rows: appListData.rows,
      fieldAccess: () => ({read: 'visible'}), requestRefresh: appListData.refresh}), onAnyViewChange: () => () => undefined}}
    dispose() {this.destroyed = true}
  }}
})
vi.mock('@/platform-adapters/lowcode-application-catalog', () => ({
  loadLowcodeApplicationCatalog: vi.fn(async () => ({scenarioId: '7AB874097A1E8711A42FD845939A6E05'})),
  getFormalModelView: () => ({primaryKey: 'rowid', queryConfig: {allPages: true},
    dataTable: {modelBinding: {modelName: 'Base_AppSystemList'}}, rows: appListData.rows,
    fieldAccess: () => ({read: 'visible'}), requestRefresh: appListData.refresh}),
}))

vi.mock('@/services/project/project-shell', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/project/project-shell')>()),
  resetAppProjectWorkspace: shellState.resetWorkspace,
  registerShellNavRootListener: () => () => undefined,
  reloadAndSyncNavigation: shellState.reload,
  syncCommittedNavigationFromRouter: vi.fn(),
}))
vi.mock('@/platform-adapters/system-navigation', () => ({ lowcodePlatformNavigation: () => ({homePath: '/audit'}) }))
vi.mock('@/services/sse-events', () => ({ onPageConfigChange: () => () => undefined, onNotificationEvent: () => () => undefined }))
vi.mock('@/registries/vue-page-registry', () => ({ getPublicPaths: () => new Set(['/login', '/']) }))

const mountedWrappers: Array<{ exists: () => boolean; unmount: () => void }> = []
let mountedNavigationActions: NavigationActionRegistry | null = null
let mountedPageService: PageServiceCapability | null = null

const AppLayoutProbe = defineComponent({
  setup(_, { slots }) {
    mountedNavigationActions = inject(NAVIGATION_ACTION_REGISTRY_KEY, null)
    mountedPageService = useSparkComponent({ type: 'app-layout-probe' }).sparkConsume(PAGE_SERVICE)
    return () => h('main', [slots['header']?.(), slots['default']?.()])
  },
})
const AppHeaderProbe = defineComponent({
  emits: ['user-command'],
  setup(_, { emit }) {
    return () => h('button', { onClick: () => emit('user-command', '@app:APP-B/dashboard?attempt=b#entry') }, 'cross-app')
  },
})
const page = defineComponent({ setup: () => () => h('div', 'route page') })
const RendererListProbe = defineComponent({
  props: {children: {type: Array, default: () => []}},
  setup(props) {
    return () => {
      const row = appListData.rows[0]!
      const dataSource = {fieldAccess: () => ({read: 'visible'})}
      const nodes = props.children as Array<{type: string; props?: Record<string, unknown>; children?: Array<{type: string; props?: Record<string, unknown>}>}>
      const children = nodes.flatMap(child => child.type === 'r-toolbar' ? child.children ?? [] : [child]).filter(child => {
        const condition = child.props?.['onBeforeRender']
        return typeof condition !== 'function' || condition({row, dataSource})
      })
      return h('div', children.filter(child => child.type === 'r-button').map(child => h('button', {
        onClick: () => {
          const action = child.props?.['onClick']
          if (typeof action === 'function') action(row)
        },
      }, String(child.props?.['label'] ?? ''))))
    }
  },
})

type PageServiceHostMount = Readonly<{
  router: Router
  provide: Record<symbol, unknown>
  stubs: Record<string, boolean | Component>
}>

function mountWithPageService(component: Component, options: PageServiceHostMount) {
  const showMessage = vi.fn()
  const service: PageServiceCapability = {
    copyText: async () => {},
    showMessage,
    showConfirm: async () => true,
    showPrompt: async () => null,
    showAlert: async () => {},
    showDialog: async () => 'cancel',
    selectEntities: async () => [],
    browseFiles: async () => [],
    uploadFiles: async () => { throw new Error('application switch fixture must not upload') },
    showLoading: () => {},
    navigate: () => {},
  }
  const Host = defineComponent({
    setup() {
      useSparkComponent({ type: 'application-switch-test-host' }).sparkProvide(PAGE_SERVICE, service)
      return () => h(component)
    },
  })
  const wrapper = mount(Host, { global: { plugins: [options.router], provide: options.provide, stubs: options.stubs } })
  mountedWrappers.push(wrapper)
  return { wrapper, showMessage }
}

function appPageMessages() {
  if (!mountedPageService) throw new Error('App did not provide PAGE_SERVICE')
  return vi.spyOn(mountedPageService, 'showMessage')
}

function messagesOf(spy: { mock: { calls: unknown[][] } }, type: string) {
  return spy.mock.calls.filter(call => call[1] === type).map(call => call[0])
}

async function mountRealApp(mountShell = true) {
  const router = createRouter({ history: createMemoryHistory(), routes: [] })
  const dynamic = createDynamicRouter({
    router,
    pageComponent: page,
    applicationPathPrefix: '/apps/:projectId',
    preAuthNavTree: { id: 'public', title: 'Public', childPlacement: 'header', items: [] },
    loadNavigation: async () => {
      const projectId = lowcodeState.applicationId ?? 'homepage'
      if (projectId === 'APP-B') return await new Promise<RuntimeNavigation>((done, reject) => { mixedNavigation.rejectB = reject; mixedNavigation.finishB = done })
      if (projectId === 'old' && mixedNavigation.revokeOld) throw new Error('source application is no longer visible')
      const path = projectId === 'homepage' ? '/app-list' : '/dashboard'
      return { id: 'root', title: 'Root', childPlacement: 'header', projectId, homePath: path,
        items: [{ id: path.slice(1), title: 'Home', itemKind: 'system-page', path }] }
    },
    loadPlatformNavigation: async () => ({ id: 'platform', title: 'Platform', childPlacement: 'header',
      homePath: '/audit', items: [{ id: 'audit', title: 'Audit', itemKind: 'system-page', path: '/audit' }] }),
    isPlatformNavigationEnabled: () => true,
    componentMap: { '/dashboard': page, '/app-list': page, '/audit': page },
  })
  await dynamic.registerRoutes()
  setDynamicRouter(dynamic)
  await router.push('/apps/old/dashboard')
  const wrapper = mountShell ? mount(App, { global: {
    plugins: [router],
    stubs: {
      AppLayout: AppLayoutProbe, AppHeader: AppHeaderProbe, AppBreadcrumb: true, AppFooter: true, AppSidebar: true,
      AppTabBar: true, NavHeaderBar: true, NavContextSelector: true, ThemeConfigurator: true, AppPageUiHost: true,
    },
  } }) : null
  if (wrapper) mountedWrappers.push(wrapper)
  await flushPromises()
  return { router, dynamic, wrapper }
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) {
    if (wrapper.exists()) wrapper.unmount()
  }
  mountedNavigationActions = null
  mountedPageService = null
  delete mixedNavigation.rejectB
  delete mixedNavigation.finishB
  delete mixedNavigation.revokeOld
  lowcodeState.applicationId = 'old'
  lowcodeState.ownerIntent = 0
  vi.mocked(activateLowcodeApplication).mockReset().mockImplementation(async (applicationId) => {
    const intent = ++lowcodeState.ownerIntent
    lowcodeState.applicationId = applicationId
    return { assertCurrent() {
      if (intent !== lowcodeState.ownerIntent) throw new Error('platform selection stale')
    } }
  })
  shellState.reload.mockReset()
  shellState.reload.mockResolvedValue(null)
  shellState.resetWorkspace.mockReset()
  vi.restoreAllMocks()
})




async function mountMixedNavigation(mountShell = true) {
  const { router, dynamic, wrapper } = await mountRealApp(mountShell)
  const reportRecovery = vi.fn()
  const guard = new ProjectNavigationGuard({
    router,
    reportRecovery,
    publicPaths: new Set(['/login', '/']),
    publicHomePath: '/',
    isPlatformWorkspacePath: (path) => path.startsWith('/platform'),
  })
  router.beforeEach((to, from) => guard.resolve(to, from))
  router.beforeResolve(to => guard.commit(to))
  return { router, dynamic, wrapper, reportRecovery }
}


it('isolated navigation recovery keeps the newest project after the earlier shell destination fails', async () => {
  const { router, dynamic, wrapper, reportRecovery } = await mountMixedNavigation()
  const finished = vi.fn()
  router.afterEach((to, _from, failure) => finished(to.fullPath, failure))
  if (wrapper === null) throw new Error('missing shell fixture')
  await wrapper.get('button').trigger('click')
  await vi.waitFor(() => expect(mixedNavigation.rejectB).toBeDefined())
  expect(lowcodeState.applicationId).toBe('APP-B')
  await router.push('/apps/APP-C/dashboard?reference=active#target')
  const currentId = dynamic.getSystemPageInstance(router.currentRoute.value)?.instanceId
  expect(currentId).toBeDefined()
  expect(router.currentRoute.value.fullPath).toBe('/apps/APP-C/dashboard?reference=active#target')
  mixedNavigation.rejectB?.(new Error('target B navigation failed late'))
  await vi.waitFor(() => expect(finished.mock.calls.some(call => call[0] === '/apps/APP-B/dashboard?attempt=b#entry')).toBe(true))
  expect(vi.mocked(activateLowcodeApplication).mock.calls.map(call => call[0])).toEqual(['APP-B','APP-C'])
  expect(lowcodeState.applicationId).toBe('APP-C')
  expect(dynamic.getApplicationNavTree()?.projectId).toBe('APP-C')
  expect(dynamic.getSystemPageInstance(router.currentRoute.value)?.instanceId).toBe(currentId)
  expect(reportRecovery).not.toHaveBeenCalled()
})

it.each([false, true])('recovers after a newer selection fails before committing (source revoked: %s)', async revoked => {
  const { router, dynamic, reportRecovery } = await mountMixedNavigation()
  const original = router.currentRoute.value
  const originalId = dynamic.getSystemPageInstance(original)?.instanceId
  expect(originalId).toBeDefined()
  const pending = router.push('/apps/APP-B/dashboard')
  void pending.catch(() => undefined)
  await vi.waitFor(() => expect(mixedNavigation.rejectB).toBeDefined())
  expect(lowcodeState.applicationId).toBe('APP-B')
  mixedNavigation.revokeOld = revoked
  const activationError = new Error('target C selection failed before commit')
  vi.mocked(activateLowcodeApplication).mockRejectedValueOnce(activationError)
  const result = await router.push('/apps/APP-C/dashboard').then(() => null, (error: unknown) => error)
  mixedNavigation.rejectB?.(new Error('target B navigation failed late'))
  await pending

  expect(lowcodeState.applicationId).toBe(revoked ? null : 'old')
  expect(dynamic.getApplicationNavTree()?.projectId).toBe(revoked ? 'homepage' : 'old')
  expect(router.currentRoute.value.fullPath).toBe(revoked ? '/apps/homepage/app-list' : original.fullPath)
  expect(router.currentRoute.value.redirectedFrom?.fullPath).toBe('/apps/APP-C/dashboard')
  expect(result).toBeNull()
  expect(reportRecovery).toHaveBeenCalledExactlyOnceWith(activationError)
  const freshId = dynamic.getSystemPageInstance(router.currentRoute.value)?.instanceId
  expect(freshId).toBeDefined()
  expect(freshId).not.toBe(originalId)
})

it('isolated navigation recovery rematches source after a direct failure with preauth', async () => {
  const { router, dynamic, reportRecovery } = await mountMixedNavigation()
  const original = router.currentRoute.value
  const originalId = dynamic.getSystemPageInstance(original)?.instanceId
  expect(originalId).toBeDefined()
  const going = router.push('/apps/APP-B/dashboard?reference=active#target')
  void going.catch(() => undefined)
  await vi.waitFor(() => expect(mixedNavigation.rejectB).toBeDefined())
  const navigationError = new Error('target B navigation failed')
  mixedNavigation.rejectB?.(navigationError)
  await expect(going).resolves.toBeUndefined()
  const current = router.currentRoute.value
  expect(lowcodeState.applicationId).toBe('old')
  expect(dynamic.getApplicationNavTree()?.projectId).toBe('old')
  expect(current.fullPath).toBe(original.fullPath)
  expect(current.redirectedFrom?.fullPath).toBe('/apps/APP-B/dashboard?reference=active#target')
  expect(reportRecovery).toHaveBeenCalledExactlyOnceWith(navigationError)
  const freshId = dynamic.getSystemPageInstance(current)?.instanceId
  expect(freshId).toBeDefined()
  expect(freshId).not.toBe(originalId)
})

it('isolated navigation recovery uses the directory when the source is revoked', async () => {
  const { router, dynamic, reportRecovery } = await mountMixedNavigation()
  const going = router.push('/apps/APP-B/dashboard')
  void going.catch(() => undefined)
  await vi.waitFor(() => expect(mixedNavigation.rejectB).toBeDefined())
  mixedNavigation.revokeOld = true
  const navigationError = new Error('target B navigation failed')
  mixedNavigation.rejectB?.(navigationError)
  await expect(going).resolves.toBeUndefined()
  expect(lowcodeState.applicationId).toBeNull()
  expect(dynamic.getApplicationNavTree()?.projectId).toBe('homepage')
  expect(router.currentRoute.value.fullPath).toBe('/apps/homepage/app-list')
  expect(router.currentRoute.value.meta['nodeId']).toBe('app-list')
  expect(reportRecovery).toHaveBeenCalledExactlyOnceWith(navigationError)
})

it('isolated navigation recovery resolves the application root with formal home query', async () => {
  const { router } = await mountMixedNavigation()
  const going = router.push('/apps/APP-B?reference=active&fixed=from-caller#target')
  void going.catch(() => undefined)
  await vi.waitFor(() => expect(mixedNavigation.finishB).toBeDefined())
  mixedNavigation.finishB?.({
    id: 'root', title: 'Root', childPlacement: 'header', projectId: 'APP-B', homePath: '/dashboard?fixed=from-navigation',
    items: [{ id: 'dashboard', title: 'Dashboard', itemKind: 'system-page', path: '/dashboard?fixed=from-navigation' }],
  })
  await expect(going).resolves.toBeUndefined()
  expect(router.currentRoute.value.fullPath).toBe('/apps/APP-B/dashboard?reference=active&fixed=from-navigation#target')
  expect(router.currentRoute.value.meta['nodeId']).toBe('dashboard')
})

async function mountRealCatalog() {
  const { router, dynamic, reportRecovery } = await mountMixedNavigation(false)
  await router.push('/apps/homepage/app-list')
  vi.mocked(activateLowcodeApplication).mockClear()
  const { wrapper, showMessage } = mountWithPageService(AppList, {
    router, provide: {}, stubs: { DisplayIcon: true, RendererList: RendererListProbe, RendererPageHeader: true },
  })
  await flushPromises()
  const enter = wrapper.findAll('button').find(button => button.text().includes('进入应用'))
  if (enter === undefined) throw new Error('AppList did not render the entry')
  return { enter, router, dynamic, showMessage, reportRecovery }
}

it('isolated navigation recovery sends AppList entry to the formal root and verifies committed selection', async () => {
  const { enter, router, dynamic, showMessage } = await mountRealCatalog()
  const push = vi.spyOn(router, 'push')
  await enter.trigger('click')
  await flushPromises()
  expect(push).toHaveBeenCalledExactlyOnceWith('/apps/APP-A')
  expect(vi.mocked(activateLowcodeApplication).mock.calls.map(call => call[0])).toEqual(['APP-A'])
  expect(router.currentRoute.value.fullPath).toBe('/apps/APP-A/dashboard')
  expect(dynamic.getSystemPageInstance(router.currentRoute.value)?.instanceId).toBeDefined()
  expect(messagesOf(showMessage, 'success')).toEqual(['已切换到「App A」'])
})

it('isolated navigation recovery reports AppList failure without a success toast', async () => {
  const { enter, router, showMessage, reportRecovery } = await mountRealCatalog()
  const blocked = new Error('dirty page')
  vi.mocked(activateLowcodeApplication).mockRejectedValueOnce(blocked)
  await enter.trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/apps/homepage/app-list')
  expect(messagesOf(showMessage, 'success')).toEqual([])
  expect(messagesOf(showMessage, 'error')).toEqual(['dirty page'])
  expect(reportRecovery).not.toHaveBeenCalled()
})

it('isolated navigation recovery sends real platform and home toolbar actions through the same selection', async () => {
  const { router, dynamic } = await mountMixedNavigation()
  const actions = mountedNavigationActions
  if (!actions) throw new Error('missing actual shell navigation actions')
  const messages = appPageMessages()
  await actions.execute('platform', { source: 'app-shell' })
  expect(router.currentRoute.value.path).toBe('/platform/audit')
  expect(lowcodeState.applicationId).toBeNull()
  const catalogInstance = dynamic.getSystemPageInstance(router.currentRoute.value)
  if (!catalogInstance) throw new Error('platform system page did not open')
  await actions.execute('home', { source: 'app-shell' })
  expect(router.currentRoute.value.path).toBe('/apps/homepage/app-list')
  expect(dynamic.getApplicationNavTree()?.projectId).toBe('homepage')
  await router.push('/apps/APP-C/dashboard')
  expect(router.currentRoute.value.path).toBe('/apps/APP-C/dashboard')
  expect(dynamic.getSystemPageInstanceById(catalogInstance.instanceId)).toBeUndefined()
  await actions.execute('platform', { source: 'app-shell' })
  expect(router.currentRoute.value.path).toBe('/platform/audit')
  const reopened = dynamic.getSystemPageInstance(router.currentRoute.value)
  expect(reopened?.instanceId).toEqual(expect.any(String))
  expect(reopened?.instanceId).not.toBe(catalogInstance.instanceId)
  expect(messagesOf(messages, 'error')).toEqual([])
})
