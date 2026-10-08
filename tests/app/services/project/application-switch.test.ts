import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject, type Component } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { createDynamicRouter } from '../../../../packages/spark-app/src/router/dynamic'
import { setDynamicRouter } from '../../../../packages/spark-app/src/navigation/nav-access'
import { NAVIGATION_ACTION_REGISTRY_KEY, type NavigationActionRegistry } from '../../../../packages/spark-app/src/navigation/action-registry'
import { PROJECT_SWITCH_KEY, type ProjectSwitchService } from '@/services/project/project-shell'
import { activateLowcodeApplication } from '@/lowcode/lowcode-runtime'
import App from '@/App.vue'
import AppList from '@/views/tenant/AppList.vue'
import PlatformApps from '@/views/platform/PlatformApps.vue'
import PlatformTenantManagement from '@/views/platform/PlatformTenantManagement.vue'
import AppTabBar from '@/layout/AppTabBar.vue'

type LowcodeState = { applicationId: string | null; ownerIntent: number }
const lowcodeState = vi.hoisted((): LowcodeState => ({ applicationId: 'old', ownerIntent: 0 }))
const shellState = vi.hoisted(() => ({ reload: vi.fn(async () => null), resetWorkspace: vi.fn() }))

vi.mock('@/lowcode/lowcode-runtime', () => {
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
        listApplications: vi.fn(async () => [{ id: 'APP-A', name: 'App A', description: 'A' }]),
        getEnterpriseInfo: vi.fn(async () => ({ domainKey: 'acme', chineseName: 'Acme', administratorAccount: 'admin', checkState: 1 })),
      },
    },
    lowcodeEnterpriseDisplayName: () => 'Acme',
    lowcodeRequestHeaders: () => ({}),
    readLowcodePrincipal: () => ({ enterpriseName: 'acme', applicationId: lowcodeState.applicationId,
      username: 'tester', displayName: 'Tester' }),
  }
})

vi.mock('@/services/project/project-shell', () => ({
  PROJECT_SWITCH_KEY: Symbol('project-switch'),
  resetAppProjectWorkspace: shellState.resetWorkspace,
  registerShellNavRootListener: () => () => undefined,
  reloadAndSyncNavigation: shellState.reload,
  syncCommittedNavigationFromRouter: vi.fn(),
}))
vi.mock('@/services/sse-events', () => ({ onPageConfigChange: () => () => undefined }))
vi.mock('@/registries/vue-page-registry', () => ({ getPublicPaths: () => new Set(['/login', '/']) }))

const mountedWrappers: Array<{ exists: () => boolean; unmount: () => void }> = []
let mountedProjectSwitch: ProjectSwitchService | null = null
let mountedNavigationActions: NavigationActionRegistry | null = null

const AppLayoutProbe = defineComponent({
  setup(_, { slots }) {
    mountedProjectSwitch = inject(PROJECT_SWITCH_KEY, null)
    mountedNavigationActions = inject(NAVIGATION_ACTION_REGISTRY_KEY, null)
    return () => h('main', [slots['header']?.(), slots['default']?.()])
  },
})
const AppHeaderProbe = defineComponent({
  emits: ['user-command'],
  setup(_, { emit }) {
    return () => h('button', { onClick: () => emit('user-command', '@app:APP-A/reports') }, 'cross-app')
  },
})
const page = defineComponent({ setup: () => () => h('div', 'route page') })
const platformConsumerCases: Array<[string, Component]> = [
  ['PlatformApps', PlatformApps],
  ['PlatformTenantManagement', PlatformTenantManagement],
]
const TableColumnProbe = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots['default']?.({ row: {
      projectId: 'APP-A', name: 'App A', projectType: 'application', tenantId: 'acme', defaultProjectId: 'homepage',
      status: 'ACTIVE', tenantName: 'Acme', tenantCode: 'ACME', adminUserName: 'admin',
    } }))
  },
})

async function mountPlatformConsumer(component: Component, stale = false) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: page }] })
  await router.push('/platform')
  let current = true
  const receipt = { assertCurrent: vi.fn(() => { if (!current) throw new Error('selection was superseded') }) }
  const service: ProjectSwitchService = { switchAndReload: vi.fn(async () => {
    if (stale) queueMicrotask(() => { current = false })
    return receipt
  }) }
  const wrapper = mount(component, { global: {
    plugins: [router], provide: { [PROJECT_SWITCH_KEY]: service },
    stubs: { 'el-table-column': TableColumnProbe, TenantConfigPanel: true },
  } })
  mountedWrappers.push(wrapper)
  await flushPromises()
  return { router, receipt, service, wrapper }
}

async function mountRealApp() {
  const router = createRouter({ history: createMemoryHistory(), routes: [] })
  const dynamic = createDynamicRouter({
    router,
    pageComponent: page,
    tenantPathPrefix: '/t/:tenantId/:projectId',
    loadNavigation: async () => ({ id: 'root', title: 'Root', childPlacement: 'header', projectId: 'old',
      items: [{ id: 'dashboard', title: 'Dashboard', itemKind: 'system-page', path: '/dashboard' }] }),
    componentMap: { '/dashboard': page },
  })
  await dynamic.registerRoutes()
  setDynamicRouter(dynamic)
  await router.push('/t/acme/old/dashboard')
  const wrapper = mount(App, { global: {
    plugins: [router],
    stubs: {
      AppLayout: AppLayoutProbe, AppHeader: AppHeaderProbe, AppBreadcrumb: true, AppFooter: true, AppSidebar: true,
      AppTabBar: true, NavHeaderBar: true, NavContextSelector: true, ThemeConfigurator: true, AppPageUiHost: true,
    },
  } })
  mountedWrappers.push(wrapper)
  await flushPromises()
  return { router, dynamic, wrapper }
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) {
    if (wrapper.exists()) wrapper.unmount()
  }
  mountedProjectSwitch = null
  mountedNavigationActions = null
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

describe('App project selection owner', () => {
  it('returns one composite receipt and gives that same receipt to navigation refresh', async () => {
    const { dynamic } = await mountRealApp()
    const clean = vi.spyOn(dynamic, 'assertPageRuntimesClean')
    const reset = vi.spyOn(dynamic, 'resetSystemPageInstances')
    const dispose = vi.spyOn(dynamic, 'disposePageRuntimes')
    const service = mountedProjectSwitch
    if (!service) throw new Error('App did not provide project-switch service')

    const receipt = await service.switchAndReload('APP-A')

    expect(receipt).toEqual(expect.objectContaining({ assertCurrent: expect.any(Function) }))
    expect(clean).toHaveBeenCalledOnce()
    expect(reset).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce()
    expect(shellState.reload).toHaveBeenCalledOnce()
    expect(shellState.reload).toHaveBeenCalledWith(receipt)
    expect(() => receipt.assertCurrent()).not.toThrow()
  })

  it('keeps the current real system-page instance while activation is pending and rejected', async () => {
    const { router, dynamic } = await mountRealApp()
    const service = mountedProjectSwitch
    if (!service) throw new Error('App did not provide project-switch service')
    const initialRoute = router.currentRoute.value
    const initialInstance = dynamic.getSystemPageInstance(initialRoute)
    if (!initialInstance) throw new Error('The real current system-page instance was not registered')
    const activationError = new Error('application activation rejected')
    let rejectActivation: ((error: Error) => void) | undefined
    vi.mocked(activateLowcodeApplication).mockImplementation(() => new Promise((_, reject) => {
      rejectActivation = reject
    }))
    const reset = vi.spyOn(dynamic, 'resetSystemPageInstances')
    const dispose = vi.spyOn(dynamic, 'disposePageRuntimes')
    const reload = shellState.reload

    const switching = service.switchAndReload('APP-B')
    await vi.waitFor(() => expect(rejectActivation).toBeDefined())

    expect(dynamic.getSystemPageInstance(router.currentRoute.value)?.instanceId).toBe(initialInstance.instanceId)
    rejectActivation?.(activationError)
    await expect(switching).rejects.toBe(activationError)

    expect(router.currentRoute.value.fullPath).toBe('/t/acme/old/dashboard')
    expect(lowcodeState.applicationId).toBe('old')
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)?.instanceId).toBe(initialInstance.instanceId)
    expect(reset).not.toHaveBeenCalled()
    expect(dispose).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('runs the dirty guard before local reset or lowcode activation', async () => {
    const { dynamic } = await mountRealApp()
    const service = mountedProjectSwitch
    if (!service) throw new Error('App did not provide project-switch service')
    const dirty = vi.spyOn(dynamic, 'assertPageRuntimesClean').mockImplementation(() => { throw new Error('dirty page') })
    const reset = vi.spyOn(dynamic, 'resetSystemPageInstances')
    const activate = vi.mocked(activateLowcodeApplication)
    activate.mockClear()

    await expect(service.switchAndReload('APP-A')).rejects.toThrow('dirty page')

    expect(dirty).toHaveBeenCalledOnce()
    expect(reset).not.toHaveBeenCalled()
    expect(activate).not.toHaveBeenCalled()
  })

  it('does not commit an activation resumed after a later App switch owns the intent', async () => {
    const { dynamic } = await mountRealApp()
    const service = mountedProjectSwitch
    if (!service) throw new Error('App did not provide project-switch service')
    const activate = vi.mocked(activateLowcodeApplication)
    let resolveA: ((receipt: { assertCurrent(): void }) => void) | undefined
    activate.mockImplementation(async (applicationId) => {
      if (applicationId === 'APP-A') return await new Promise((resolve) => { resolveA = resolve })
      lowcodeState.ownerIntent++
      lowcodeState.applicationId = applicationId
      return { assertCurrent: () => undefined }
    })
    const dispose = vi.spyOn(dynamic, 'disposePageRuntimes')
    const first = service.switchAndReload('APP-A')
    await vi.waitFor(() => expect(resolveA).toBeDefined())
    await service.switchAndReload('APP-B')
    const disposeCountAfterB = dispose.mock.calls.length
    resolveA?.({ assertCurrent: () => undefined })

    await expect(first).rejects.toThrow('APP_PROJECT_SWITCH_STALE')
    expect(dispose).toHaveBeenCalledTimes(disposeCountAfterB)
    expect(shellState.reload).toHaveBeenCalledOnce()
    expect(lowcodeState.applicationId).toBe('APP-B')
  })

  it('rejects the original navigation refresh failure instead of reporting switch success', async () => {
    await mountRealApp()
    const service = mountedProjectSwitch
    if (!service) throw new Error('App did not provide project-switch service')
    const refreshError = new Error('navigation refresh failed')
    shellState.reload.mockRejectedValueOnce(refreshError)

    await expect(service.switchAndReload('APP-A')).rejects.toBe(refreshError)
  })

  it('does not let the real App home consumer navigate to a switch superseded before its await resumes', async () => {
    const { router } = await mountRealApp()
    const service = mountedProjectSwitch
    const actions = mountedNavigationActions
    if (!service || !actions) throw new Error('App did not provide project switch and actions')
    const originalSwitch = service.switchAndReload.bind(service)
    service.switchAndReload = async (projectId) => {
      const receipt = await originalSwitch(projectId)
      if (projectId === 'homepage') queueMicrotask(() => { void originalSwitch('APP-B') })
      return receipt
    }
    const push = vi.spyOn(router, 'push')
    const error = vi.spyOn(ElMessage, 'error')

    await actions.execute('home', { source: 'app-shell' })
    await flushPromises()

    expect(push).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
  })

  it('does not let the real App cross-app consumer push after its switch receipt becomes stale', async () => {
    const { router, wrapper } = await mountRealApp()
    const service = mountedProjectSwitch
    if (!service) throw new Error('App did not provide project-switch service')
    const originalSwitch = service.switchAndReload.bind(service)
    service.switchAndReload = async (projectId) => {
      const receipt = await originalSwitch(projectId)
      if (projectId === 'APP-A') queueMicrotask(() => { void originalSwitch('APP-B') })
      return receipt
    }
    const push = vi.spyOn(router, 'push')
    const error = vi.spyOn(ElMessage, 'error')

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(push).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
  })

  it.each(['home', 'cross-app'] as const)('navigates once through the real App %s consumer when its owner stays current', async (target) => {
    const { router, wrapper } = await mountRealApp()
    const actions = mountedNavigationActions
    if (!actions) throw new Error('App did not provide navigation actions')
    const push = vi.spyOn(router, 'push')
    const error = vi.spyOn(ElMessage, 'error')

    if (target === 'home') await actions.execute('home', { source: 'app-shell' })
    else await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(push).toHaveBeenCalledOnce()
    expect(error).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe(target === 'home'
      ? '/t/acme/homepage/app-list'
      : '/t/acme/APP-A/reports')
  })

  it('waits for a current receipt and successful router push before the real AppList success toast', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/t/:tenantId/:projectId/home', component: page },
    ] })
    const receipt = { assertCurrent: vi.fn() }
    const order: string[] = []
    const service: ProjectSwitchService = { switchAndReload: vi.fn(async () => { order.push('switch'); return receipt }) }
    const originalPush = router.push.bind(router)
    const push = vi.spyOn(router, 'push').mockImplementation(async (location) => {
      order.push('push')
      return await originalPush(location)
    })
    const success = vi.spyOn(ElMessage, 'success')
    const wrapper = mount(AppList, { global: {
      plugins: [router], provide: { [PROJECT_SWITCH_KEY]: service },
      stubs: { NavIcon: true, AppProjectSettingsDialog: true },
    } })
    mountedWrappers.push(wrapper)
    await flushPromises()

    const enter = wrapper.findAll('button').find((button) => button.text().includes('进入应用'))
    if (!enter) throw new Error('AppList did not render the application entry button')
    await enter.trigger('click')
    await flushPromises()

    expect(receipt.assertCurrent).toHaveBeenCalledTimes(2)
    expect(push).toHaveBeenCalledOnce()
    expect(order).toEqual(['switch', 'push'])
    expect(success).toHaveBeenCalledOnce()
  })

  it('does not toast or navigate when the real AppList receipt goes stale before caller continuation', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: page }] })
    await router.push('/t/acme/homepage/app-list')
    let current = true
    const receipt = { assertCurrent: vi.fn(() => { if (!current) throw new Error('selection was superseded') }) }
    const service: ProjectSwitchService = { switchAndReload: vi.fn(async () => {
      queueMicrotask(() => { current = false })
      return receipt
    }) }
    const wrapper = mount(AppList, { global: {
      plugins: [router], provide: { [PROJECT_SWITCH_KEY]: service }, stubs: { NavIcon: true, AppProjectSettingsDialog: true },
    } })
    mountedWrappers.push(wrapper)
    await flushPromises()
    const push = vi.spyOn(router, 'push')
    const success = vi.spyOn(ElMessage, 'success')
    const error = vi.spyOn(ElMessage, 'error')
    const enter = wrapper.findAll('button').find((button) => button.text().includes('进入应用'))
    if (!enter) throw new Error('AppList did not render the application entry button')

    await enter.trigger('click')
    await flushPromises()

    expect(push).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith('selection was superseded')
  })

  it('does not show AppList success when the actual Router cancels navigation', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: page }] })
    await router.push('/t/acme/homepage/app-list')
    const receipt = { assertCurrent: vi.fn() }
    const service: ProjectSwitchService = { switchAndReload: vi.fn(async () => receipt) }
    const cancel = router.beforeEach(() => false)
    const wrapper = mount(AppList, { global: {
      plugins: [router], provide: { [PROJECT_SWITCH_KEY]: service }, stubs: { NavIcon: true, AppProjectSettingsDialog: true },
    } })
    mountedWrappers.push(wrapper)
    await flushPromises()
    const success = vi.spyOn(ElMessage, 'success')
    const error = vi.spyOn(ElMessage, 'error')
    const enter = wrapper.findAll('button').find((button) => button.text().includes('进入应用'))
    if (!enter) throw new Error('AppList did not render the application entry button')

    await enter.trigger('click')
    await flushPromises()

    cancel()
    expect(success).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith('应用页面导航未完成')
    expect(router.currentRoute.value.path).toBe('/t/acme/homepage/app-list')
  })

  it.each(platformConsumerCases)('%s checks the real switch receipt before navigating', async (_name, component) => {
    const { router, receipt, service, wrapper } = await mountPlatformConsumer(component)
    const push = vi.spyOn(router, 'push')
    const error = vi.spyOn(ElMessage, 'error')
    const enter = wrapper.findAll('button').find((button) => button.text().includes('进入'))
    if (!enter) throw new Error('platform page did not render the tenant/application entry button')

    await enter.trigger('click')
    await flushPromises()

    expect(service.switchAndReload).toHaveBeenCalledOnce()
    expect(receipt.assertCurrent).toHaveBeenCalledOnce()
    expect(push).toHaveBeenCalledOnce()
    expect(error).not.toHaveBeenCalled()
  })

  it.each(platformConsumerCases)('%s rejects stale receipt delivery from the real entry event', async (_name, component) => {
    const { router, service, wrapper } = await mountPlatformConsumer(component, true)
    const push = vi.spyOn(router, 'push')
    const error = vi.spyOn(ElMessage, 'error')
    const enter = wrapper.findAll('button').find((button) => button.text().includes('进入'))
    if (!enter) throw new Error('platform page did not render the tenant/application entry button')

    await enter.trigger('click')
    await flushPromises()

    expect(service.switchAndReload).toHaveBeenCalledOnce()
    expect(push).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/platform')
  })

  it('checks the receipt in the real AppTabBar before switching owners', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/t/:tenantId/:projectId/dashboard', component: page, meta: { title: 'Current Page' } },
      { path: '/t/:tenantId/APP-A/dashboard', component: page, meta: { title: 'Page A' } },
    ] })
    const dynamic = createDynamicRouter({ router, pageComponent: page, tenantPathPrefix: '/t/:tenantId/:projectId',
      loadNavigation: async () => ({ id: 'root', title: 'Root', childPlacement: 'header', projectId: 'APP-A', items: [] }), componentMap: {} })
    await dynamic.registerRoutes()
    setDynamicRouter(dynamic)
    await router.push('/t/acme/APP-A/dashboard')
    const receipt = { assertCurrent: vi.fn() }
    const service: ProjectSwitchService = { switchAndReload: vi.fn(async () => receipt) }
    const tabWrapper = mount(AppTabBar, { global: {
      plugins: [router], provide: { [PROJECT_SWITCH_KEY]: service }, stubs: { NavIcon: true },
    } })
    mountedWrappers.push(tabWrapper)
    await router.push('/t/acme/APP-B/dashboard')
    await flushPromises()
    const push = vi.spyOn(router, 'push')
    const error = vi.spyOn(ElMessage, 'error')
    const target = tabWrapper.findAll('.app-tab-bar__tab').find((tab) => tab.text().includes('Page A'))
    if (!target) throw new Error('AppTabBar did not retain the other owner tab')

    await target.trigger('click')
    await flushPromises()

    expect(service.switchAndReload).toHaveBeenCalledWith('APP-A')
    expect(receipt.assertCurrent).toHaveBeenCalledOnce()
    expect(push).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.path).toBe('/t/acme/APP-A/dashboard')
    expect(error).not.toHaveBeenCalled()
  })

  it('keeps the active route and both tabs when a real AppTabBar selection goes stale', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/t/:tenantId/:projectId/dashboard', component: page, meta: { title: 'Current Page' } },
      { path: '/t/:tenantId/APP-A/dashboard', component: page, meta: { title: 'Page A' } },
    ] })
    const dynamic = createDynamicRouter({ router, pageComponent: page, tenantPathPrefix: '/t/:tenantId/:projectId',
      loadNavigation: async () => ({ id: 'root', title: 'Root', childPlacement: 'header', projectId: 'APP-A', items: [] }), componentMap: {} })
    await dynamic.registerRoutes()
    setDynamicRouter(dynamic)
    await router.push('/t/acme/APP-A/dashboard')
    let current = true
    const receipt = { assertCurrent: vi.fn(() => { if (!current) throw new Error('selection was superseded') }) }
    const service: ProjectSwitchService = { switchAndReload: vi.fn(async () => {
      queueMicrotask(() => { current = false })
      return receipt
    }) }
    const wrapper = mount(AppTabBar, { global: {
      plugins: [router], provide: { [PROJECT_SWITCH_KEY]: service }, stubs: { NavIcon: true },
    } })
    mountedWrappers.push(wrapper)
    await router.push('/t/acme/APP-B/dashboard')
    await flushPromises()
    const push = vi.spyOn(router, 'push')
    const error = vi.spyOn(ElMessage, 'error')
    const target = wrapper.findAll('.app-tab-bar__tab').find((tab) => tab.text().includes('Page A'))
    if (!target) throw new Error('AppTabBar did not retain the other owner tab')

    await target.trigger('click')
    await flushPromises()

    expect(push).not.toHaveBeenCalled()
    expect(router.currentRoute.value.params['projectId']).toBe('APP-B')
    expect(wrapper.findAll('.app-tab-bar__tab').some((tab) => tab.text().includes('Page A'))).toBe(true)
    expect(wrapper.findAll('.app-tab-bar__tab').some((tab) => tab.text().includes('Current Page'))).toBe(true)
    expect(error).toHaveBeenCalledWith('selection was superseded')
  })
})
