import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { PageContentLoader, type PageFileReadCommand } from '@spark-appworks/spark-project-model'
import { DataSet } from '@spark-appworks/spark-data'
import type { RuntimeNavigation } from '@spark-appworks/spark-app'
import { createDynamicRouter, type RuntimeScenarioLoadCommand } from '../../../packages/spark-app/src/router/dynamic'

const DummyPage = defineComponent({ name: 'DummyPage', template: '<div />' })
const PRE_AUTH_NAV: RuntimeNavigation = { id: 'public', title: 'Public', childPlacement: 'header', items: [
  { id: 'login', title: 'Login', itemKind: 'system-page', path: '/login' },
  { id: 'demo', title: 'Demo', itemKind: 'system-page', path: '/demo/template-dsl' },
] }
const TOOL_NAV: RuntimeNavigation = { id: 'root', projectId: 'APP', title: 'App', childPlacement: 'header', items: [
  { id: 'orders-node', title: 'Orders', itemKind: 'page', path: '/__page/orders-node?scenarioId=S1', tool: { projectId: 'APP', pageId: 'orders-tool', versionId: 'rule=2;script=1;style=3' } },
  { id: 'orders-node-2', title: 'Orders Again', itemKind: 'page', path: '/__page/orders-node-2', tool: { projectId: 'APP', pageId: 'orders-tool' } },
] }

async function setup(navigation: RuntimeNavigation = TOOL_NAV) {
  const requests: PageFileReadCommand[] = []
  const readPageFile = async (command: PageFileReadCommand) => { requests.push(command); return command.fileName === 'rule.json' ? '[]' : '' }
  const router = createRouter({ history: createMemoryHistory(), routes: [] })
  const loadScenario = vi.fn(async ({ scenarioId }: RuntimeScenarioLoadCommand) => DataSet.fromJson({ scenarioId, dataSetName: scenarioId, tables: {} }))
  const dynamic = createDynamicRouter({ router, readPageFile, pageComponent: DummyPage, tenantPathPrefix: '/t/:tenantId/:projectId', loadNavigation: async () => navigation, loadScenario })
  await dynamic.registerRoutes()
  return { router, dynamic, requests, loadScenario }
}

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = () => undefined
  let rejectPromise: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return { promise, resolve: resolvePromise, reject: rejectPromise }
}

function pageNavigation(id: string): RuntimeNavigation {
  return {
    id,
    title: id,
    childPlacement: 'header',
    items: [{ id, title: id, itemKind: 'page', path: `/${id}`, tool: { projectId: 'APP', pageId: `tool-${id}` } }],
  }
}

function navigationWithInvalidRoute(id: string): RuntimeNavigation {
  const navigation = pageNavigation(id)
  return {
    ...navigation,
    items: [...navigation.items,
      { id: 'malformed-node', title: 'Malformed', itemKind: 'page', path: '/broken/:id(', tool: { projectId: 'APP', pageId: 'tool-malformed' } }],
  }
}

type NavigationHarnessOptions = { preAuth?: RuntimeNavigation; platform?: boolean }

function navigationHarness(options: NavigationHarnessOptions = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [] })
  const loads: Deferred<RuntimeNavigation>[] = []
  const platformLoads: Deferred<RuntimeNavigation>[] = []
  let platformLoadCount = 0
  const dynamic = createDynamicRouter({ router, pageComponent: DummyPage,
    loadNavigation: () => {
      const next = loads.shift()
      if (!next) return Promise.reject(new Error('missing navigation fixture'))
      return next.promise
    },
    ...(options.platform === true ? {
      loadPlatformNavigation: () => {
        platformLoadCount++
        const next = platformLoads.shift()
        if (!next) return Promise.reject(new Error('missing platform fixture'))
        return next.promise
      },
      isPlatformNavigationEnabled: () => true,
    } : {}),
    ...(options.preAuth === undefined ? {} : { preAuthNavTree: options.preAuth }),
    tenantPathPrefix: '/t/:tenantId/:projectId' })
  return { router, dynamic, loads, platformLoads, platformLoadCount: () => platformLoadCount }
}

describe('DynamicRouter formal routes and runtime calls', () => {
  it('publishes only the newest completed refresh and removes routes from stale trees', async () => {
    const { router, dynamic, loads } = navigationHarness()
    const initial = deferred<RuntimeNavigation>()
    loads.push(initial)
    initial.resolve(pageNavigation('baseline'))
    await dynamic.registerRoutes()

    const older = deferred<RuntimeNavigation>()
    const newer = deferred<RuntimeNavigation>()
    loads.push(older, newer)
    const olderRefresh = dynamic.refreshRoutes()
    const newerRefresh = dynamic.refreshRoutes()
    newer.resolve(pageNavigation('newer'))
    const newerResult = await newerRefresh
    older.resolve(pageNavigation('older'))
    const olderResult = await olderRefresh

    expect(newerResult?.id).toBe('newer')
    expect(olderResult?.id).toBe('newer')
    expect(dynamic.getNavTree()?.id).toBe('newer')
    expect(router.getRoutes().find(route => route.name === 'nav-newer')?.meta['title']).toBe('newer')
    expect(router.getRoutes().some(route => route.name === 'nav-older')).toBe(false)
    expect(dynamic.getRegisteredRoutes()).toContain('/t/:tenantId/:projectId/newer')
    expect(dynamic.getRegisteredRoutes()).not.toContain('/t/:tenantId/:projectId/older')
    expect(dynamic.getRegisteredRoutes()).not.toContain('/t/:tenantId/:projectId/baseline')
  })

  it('does not publish an older success while a newer refresh is pending', async () => {
    const { router, dynamic, loads } = navigationHarness()
    const initial = deferred<RuntimeNavigation>()
    loads.push(initial)
    initial.resolve(pageNavigation('baseline'))
    await dynamic.registerRoutes()

    const older = deferred<RuntimeNavigation>()
    const newer = deferred<RuntimeNavigation>()
    loads.push(older, newer)
    const olderRefresh = dynamic.refreshRoutes()
    const newerRefresh = dynamic.refreshRoutes()
    older.resolve(pageNavigation('older'))
    expect(await olderRefresh).toEqual(pageNavigation('baseline'))
    expect(dynamic.getNavTree()?.id).toBe('baseline')
    expect(router.getRoutes().some(route => route.name === 'nav-older')).toBe(false)
    newer.resolve(pageNavigation('newer'))
    await newerRefresh
    expect(dynamic.getNavTree()?.id).toBe('newer')
  })

  it.each([{ status: 401 }, { status: 500 }])('does not let stale failure $status fall back over the latest tree', async failure => {
    const { router, dynamic, loads } = navigationHarness({ preAuth: PRE_AUTH_NAV })
    const initial = deferred<RuntimeNavigation>()
    loads.push(initial)
    initial.resolve(pageNavigation('baseline'))
    await dynamic.registerRoutes()
    const older = deferred<RuntimeNavigation>()
    const newer = deferred<RuntimeNavigation>()
    loads.push(older, newer)
    const olderRefresh = dynamic.refreshRoutes()
    const newerRefresh = dynamic.refreshRoutes()
    newer.resolve(pageNavigation('newer'))
    await newerRefresh
    const error = Object.assign(new Error(`failure ${failure.status}`), failure)
    older.reject(error)
    await expect(olderRefresh).rejects.toBe(error)
    expect(dynamic.getNavTree()?.id).toBe('newer')
    expect(router.getRoutes().some(route => route.name === 'nav-newer')).toBe(true)
    expect(router.getRoutes().some(route => route.name === 'nav-public-login')).toBe(false)
    expect(dynamic.getRegisteredRoutes()).toContain('/t/:tenantId/:projectId/newer')
    expect(dynamic.getRegisteredRoutes()).not.toContain('/login')
  })

  it('lets a refresh win over an initial pending register', async () => {
    const { router, dynamic, loads } = navigationHarness()
    const initial = deferred<RuntimeNavigation>()
    const refresh = deferred<RuntimeNavigation>()
    loads.push(initial, refresh)
    const initialRegister = dynamic.registerRoutes()
    const winningRefresh = dynamic.refreshRoutes()
    refresh.resolve(pageNavigation('winner'))
    expect((await winningRefresh)?.id).toBe('winner')
    initial.resolve(pageNavigation('stale-initial'))
    await initialRegister
    expect(dynamic.getNavTree()?.id).toBe('winner')
    expect(router.getRoutes().some(route => route.name === 'nav-stale-initial')).toBe(false)
  })

  it('waits for platform navigation before publishing a refresh', async () => {
    const { router, dynamic, loads, platformLoads } = navigationHarness({ platform: true })
    const initial = deferred<RuntimeNavigation>()
    const initialPlatform = deferred<RuntimeNavigation>()
    loads.push(initial)
    platformLoads.push(initialPlatform)
    initial.resolve(pageNavigation('baseline'))
    initialPlatform.resolve(pageNavigation('platform-baseline'))
    await dynamic.registerRoutes()

    const older = deferred<RuntimeNavigation>()
    const newer = deferred<RuntimeNavigation>()
    const olderPlatform = deferred<RuntimeNavigation>()
    const newerPlatform = deferred<RuntimeNavigation>()
    loads.push(older, newer)
    platformLoads.push(olderPlatform, newerPlatform)
    const olderRefresh = dynamic.refreshRoutes()
    older.resolve(pageNavigation('older'))
    await Promise.resolve()
    expect(dynamic.getNavTree()?.id).toBe('baseline')
    expect(router.getRoutes().some(route => route.name === 'nav-older')).toBe(false)

    const newerRefresh = dynamic.refreshRoutes()
    newer.resolve(pageNavigation('newer'))
    newerPlatform.resolve(pageNavigation('platform-newer'))
    await newerRefresh
    olderPlatform.resolve(pageNavigation('platform-older'))
    expect((await olderRefresh)?.id).toBe('newer')
    expect(dynamic.getNavTree()?.id).toBe('newer')
    expect(router.getRoutes().some(route => route.name === 'nav-platform-platform-newer')).toBe(true)
    expect(router.getRoutes().some(route => route.name === 'nav-platform-platform-older')).toBe(false)
  })

  it('skips stale platform loading when an older tenant load finishes after a newer commit', async () => {
    const { dynamic, loads, platformLoads, platformLoadCount } = navigationHarness({ platform: true })
    const initial = deferred<RuntimeNavigation>()
    const initialPlatform = deferred<RuntimeNavigation>()
    loads.push(initial)
    platformLoads.push(initialPlatform)
    initial.resolve(pageNavigation('baseline'))
    initialPlatform.resolve(pageNavigation('platform-baseline'))
    await dynamic.registerRoutes()

    const older = deferred<RuntimeNavigation>()
    const newer = deferred<RuntimeNavigation>()
    const newerPlatform = deferred<RuntimeNavigation>()
    loads.push(older, newer)
    platformLoads.push(newerPlatform)
    const olderRefresh = dynamic.refreshRoutes()
    const newerRefresh = dynamic.refreshRoutes()
    newer.resolve(pageNavigation('newer'))
    newerPlatform.resolve(pageNavigation('platform-newer'))
    await newerRefresh
    older.resolve(pageNavigation('older'))
    expect((await olderRefresh)?.id).toBe('newer')
    expect(platformLoadCount()).toBe(2)
    expect(dynamic.getNavTree()?.id).toBe('newer')
  })

  it.each([{ status: 401 }, { status: 500 }])('falls back to pre-auth on latest refresh failure $status and clears authorized routes', async failure => {
    const { router, dynamic, loads } = navigationHarness({ preAuth: PRE_AUTH_NAV })
    const initial = deferred<RuntimeNavigation>()
    loads.push(initial)
    initial.resolve(pageNavigation('authorized'))
    await dynamic.registerRoutes()
    const rejected = deferred<RuntimeNavigation>()
    loads.push(rejected)
    const refresh = dynamic.refreshRoutes()
    const error = Object.assign(new Error(`failure ${failure.status}`), failure)
    rejected.reject(error)
    if (failure.status === 401) await expect(refresh).resolves.toEqual(PRE_AUTH_NAV)
    else await expect(refresh).rejects.toBe(error)
    expect(dynamic.getNavTree()).toEqual(PRE_AUTH_NAV)
    expect(router.getRoutes().some(route => route.name === 'nav-authorized')).toBe(false)
    expect(dynamic.getRegisteredRoutes()).toContain('/login')
    expect(dynamic.getRegisteredRoutes()).not.toContain('/t/:tenantId/:projectId/authorized')
  })

  it('retains the committed tree when refresh or register fails without pre-auth navigation', async () => {
    const { router, dynamic, loads } = navigationHarness()
    const initial = deferred<RuntimeNavigation>()
    loads.push(initial)
    initial.resolve(pageNavigation('committed'))
    await dynamic.registerRoutes()

    const refreshFailure = deferred<RuntimeNavigation>()
    loads.push(refreshFailure)
    const refresh = dynamic.refreshRoutes()
    const refreshError = new Error('refresh failed')
    refreshFailure.reject(refreshError)
    await expect(refresh).rejects.toBe(refreshError)

    const registerFailure = deferred<RuntimeNavigation>()
    loads.push(registerFailure)
    const registration = dynamic.registerRoutes()
    const registerError = new Error('register failed')
    registerFailure.reject(registerError)
    await expect(registration).rejects.toBe(registerError)

    expect(dynamic.getNavTree()?.id).toBe('committed')
    expect(router.getRoutes().some(route => route.name === 'nav-committed')).toBe(true)
    expect(dynamic.getRegisteredRoutes()).toContain('/t/:tenantId/:projectId/committed')
  })

  it('restores managed route snapshots after a synchronous addRoute failure', async () => {
    const { router, dynamic, loads } = navigationHarness()
    router.addRoute({ path: '/external-static', name: 'external-static', component: DummyPage, meta: { marker: 'outside' } })
    const initial = deferred<RuntimeNavigation>()
    loads.push(initial)
    initial.resolve(pageNavigation('baseline'))
    await dynamic.registerRoutes()
    const baseline = router.getRoutes().find(route => route.name === 'nav-baseline')
    const baselineComponent = baseline?.components?.['default']
    const baselineProps = baseline?.props['default']
    const baselineMeta = baseline?.meta

    const refreshFailure = deferred<RuntimeNavigation>()
    loads.push(refreshFailure)
    const refresh = dynamic.refreshRoutes()
    refreshFailure.resolve(navigationWithInvalidRoute('refresh-candidate'))
    await expect(refresh).rejects.toThrow('Unfinished custom RegExp')

    expect(dynamic.getNavTree()?.id).toBe('baseline')
    expect(router.getRoutes().find(route => route.name === 'nav-baseline')?.components?.['default']).toBe(baselineComponent)
    expect(router.getRoutes().find(route => route.name === 'nav-baseline')?.props['default']).toBe(baselineProps)
    expect(router.getRoutes().find(route => route.name === 'nav-baseline')?.meta).toEqual(baselineMeta)
    expect(router.getRoutes().some(route => route.name === 'nav-refresh-candidate')).toBe(false)
    expect(router.getRoutes().some(route => route.name === 'nav-malformed-node')).toBe(false)
    expect(router.getRoutes().find(route => route.name === 'external-static')?.meta['marker']).toBe('outside')

    const registerFailure = deferred<RuntimeNavigation>()
    loads.push(registerFailure)
    const registration = dynamic.registerRoutes()
    registerFailure.resolve(navigationWithInvalidRoute('register-candidate'))
    await expect(registration).rejects.toThrow('Unfinished custom RegExp')
    expect(dynamic.getNavTree()?.id).toBe('baseline')
    expect(router.getRoutes().find(route => route.name === 'nav-baseline')?.components?.['default']).toBe(baselineComponent)
    expect(router.getRoutes().find(route => route.name === 'external-static')?.meta['marker']).toBe('outside')
    expect(router.getRoutes().some(route => route.name === 'nav-register-candidate')).toBe(false)
    expect(router.getRoutes().some(route => route.name === 'nav-malformed-node')).toBe(false)
  })

  it('falls back after restoring managed routes when refresh commit fails synchronously', async () => {
    const { router, dynamic, loads } = navigationHarness({ preAuth: PRE_AUTH_NAV })
    router.addRoute({ path: '/external-static', name: 'external-static', component: DummyPage, meta: { marker: 'outside' } })
    const initial = deferred<RuntimeNavigation>()
    loads.push(initial)
    initial.resolve(pageNavigation('authorized'))
    await dynamic.registerRoutes()

    const refreshFailure = deferred<RuntimeNavigation>()
    loads.push(refreshFailure)
    const refresh = dynamic.refreshRoutes()
    refreshFailure.resolve(navigationWithInvalidRoute('refresh-candidate'))
    await expect(refresh).rejects.toThrow('Unfinished custom RegExp')

    expect(dynamic.getNavTree()).toEqual(PRE_AUTH_NAV)
    expect(dynamic.getRegisteredRoutes()).toContain('/login')
    expect(dynamic.getRegisteredRoutes()).not.toContain('/t/:tenantId/:projectId/authorized')
    expect(router.getRoutes().some(route => route.name === 'nav-authorized')).toBe(false)
    expect(router.getRoutes().some(route => route.name === 'nav-refresh-candidate')).toBe(false)
    expect(router.getRoutes().some(route => route.name === 'nav-malformed-node')).toBe(false)
    expect(router.getRoutes().find(route => route.name === 'external-static')?.meta['marker']).toBe('outside')
  })

  it('retains the cross-project ref host on sequential refreshes', async () => {
    const { router, dynamic, loads } = navigationHarness()
    const initial = deferred<RuntimeNavigation>()
    const next = deferred<RuntimeNavigation>()
    loads.push(initial, next)
    initial.resolve(pageNavigation('first'))
    await dynamic.registerRoutes()
    next.resolve(pageNavigation('second'))
    await dynamic.refreshRoutes()
    expect(router.getRoutes().some(route => route.meta['crossProjectRefHost'] === true)).toBe(true)
    expect(dynamic.getRegisteredRoutes()).toContain('/t/:tenantId/:projectId/__ref/:refNodeId')
  })

  it('falls back to pre-auth only when navigation returns 401', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const dynamic = createDynamicRouter({ router, pageComponent: DummyPage,
      loadNavigation: async () => { throw Object.assign(new Error('Unauthorized'), { status: 401 }) }, preAuthNavTree: PRE_AUTH_NAV, tenantPathPrefix: '/t/:tenantId/:projectId', componentMap: { '/demo/template-dsl': DummyPage } })
    await dynamic.registerRoutes()
    expect(dynamic.getRegisteredRoutes()).toContain('/login')
    expect(dynamic.getRegisteredRoutes()).toContain('/demo/template-dsl')
    expect(dynamic.getNavTree()).toEqual(PRE_AUTH_NAV)
  })

  it('registers paths without query and creates no runtime during registration', async () => {
    const { router, dynamic, requests, loadScenario } = await setup()
    const route = router.getRoutes().find(item => item.name === 'nav-orders-node')
    expect(route?.path).toBe('/t/:tenantId/:projectId/__page/orders-node')
    expect(route?.meta['pageId']).toBe('orders-tool')
    expect(route?.meta).not.toHaveProperty('dataSpaceBinding')
    expect(dynamic.getPageRuntimeNames()).toEqual([])
    expect(requests).toEqual([])
    expect(loadScenario).not.toHaveBeenCalled()
  })

  it('loads independent scenarios and published files once per call; reordered query reactivates the instance', async () => {
    const { router, dynamic, requests, loadScenario } = await setup()
    await router.push('/t/T/APP/__page/orders-node?scenarioId=S1&additionalScenarioIds=S3&additionalScenarioIds=S2&zero=0&bare&blank=')
    const first = dynamic.getPageRuntime(router.currentRoute.value)
    if (!first) throw new Error('missing runtime')
    await first.load()
    expect(loadScenario.mock.calls.map(([command]) => command.scenarioId)).toEqual(['S1', 'S2', 'S3'])
    expect(requests).toHaveLength(3)
    expect(requests.every(command => command.versionId === 'rule=2;script=1;style=3' && command.pageId === 'orders-tool' && command.projectId === 'APP')).toBe(true)
    expect(first.getDataSet('S1')).not.toBe(first.getDataSet('S2'))
    await router.push('/t/T/APP/__page/orders-node?blank=&bare&zero=0&additionalScenarioIds=S2&additionalScenarioIds=S3&scenarioId=S1')
    expect(dynamic.getPageRuntime(router.currentRoute.value)).toBe(first)
    await router.push('/t/T/APP/__page/orders-node?scenarioId=S2')
    const second = dynamic.getPageRuntime(router.currentRoute.value)
    expect(second?.instanceId).not.toBe(first.instanceId)
    await router.push('/t/T/APP/__page/orders-node-2?scenarioId=S1')
    expect(dynamic.getPageRuntime(router.currentRoute.value)?.instanceId).not.toBe(first.instanceId)
    expect(dynamic.getPageRuntimeNames()).toHaveLength(3)
  })

  it.each(['scenarioId', 'scenarioId=', 'scenarioId=S1&scenarioId=S2', 'additionalScenarioIds=', 'additionalScenarioIds=S1&additionalScenarioIds=S1', 'scenarioId=S1&additionalScenarioIds=S1'])('rejects ambiguous call parameters %s', async query => {
    const { router, dynamic, loadScenario } = await setup()
    await router.push(`/t/T/APP/__page/orders-node?${query}`)
    expect(() => dynamic.getPageRuntime(router.currentRoute.value)).toThrow()
    expect(loadScenario).not.toHaveBeenCalled()
    expect(dynamic.getPageRuntimeNames()).toEqual([])
  })

  it('retains more than ten calls and refuses dirty closure before releasing any state', async () => {
    const { router, dynamic } = await setup()
    for (let index = 0; index < 12; index++) {
      await router.push(`/t/T/APP/__page/orders-node?scenarioId=S${index}`)
      dynamic.getPageRuntime(router.currentRoute.value)
    }
    expect(dynamic.getPageRuntimeNames()).toHaveLength(12)
    const current = dynamic.getPageRuntime(router.currentRoute.value)
    if (!current) throw new Error('missing runtime')
    const dirty = vi.spyOn(current, 'isDirty', 'get').mockReturnValue(true)
    expect(() => dynamic.closePageRuntime(current.instanceId)).toThrow('未保存')
    expect(current.destroyed).toBe(false)
    expect(dynamic.getPageRuntimeNames()).toHaveLength(12)
    dirty.mockRestore()
    dynamic.closePageRuntime(current.instanceId)
    expect(current.destroyed).toBe(true)
    expect(dynamic.getPageRuntimeNames()).toHaveLength(11)
    dynamic.disposePageRuntimes()
    expect(dynamic.getPageRuntimeNames()).toEqual([])
  })

  it('marks configuration changes without replacing or destroying the current instance', async () => {
    const { router, dynamic } = await setup()
    await router.push('/t/T/APP/__page/orders-node?scenarioId=S1')
    const current = dynamic.getPageRuntime(router.currentRoute.value)
    dynamic.markPageConfigPending('orders-tool')
    expect(dynamic.getPageRuntime(router.currentRoute.value)).toBe(current)
    expect(current?.destroyed).toBe(false)
  })

  it('reloads the latest published files in the retained instance and rejects changed tool identity', async () => {
    const navigation: RuntimeNavigation = { ...TOOL_NAV, items: [...TOOL_NAV.items] }
    const { router, dynamic, requests } = await setup(navigation)
    await router.push('/t/T/APP/__page/orders-node?scenarioId=S1')
    const current = dynamic.getPageRuntime(router.currentRoute.value)
    if (!current) throw new Error('missing runtime')
    await current.load()
    const before = current.getDataSet('S1')
    navigation.items = navigation.items.map(item => item.id === 'orders-node'
      ? { ...item, tool: { projectId: 'APP', pageId: 'orders-tool', versionId: 'rule=4;script=4;style=4' } } : item)
    dynamic.markPageConfigPending('orders-tool')
    await dynamic.refreshRoutes()
    await current.reload()
    expect(current.configPending).toBe(false)
    expect(current.getDataSet('S1')).not.toBe(before)
    expect(requests.slice(-3).every(command => command.versionId === 'rule=4;script=4;style=4')).toBe(true)
    navigation.items = navigation.items.filter(item => item.id !== 'orders-node')
    dynamic.markPageConfigPending('orders-tool')
    await dynamic.refreshRoutes()
    await expect(current.reload()).rejects.toThrow('蓝图工具绑定已改变')
    expect(current.configPending).toBe(true)
    expect(requests).toHaveLength(6)
  })

  it('keeps native and iframe routing separate from config assembly', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const navigation: RuntimeNavigation = { title: 'App', childPlacement: 'header', items: [
      { id: 'dashboard', title: 'Dashboard', itemKind: 'system-page', path: '/dashboard' },
      { id: 'docs', title: 'Docs', itemKind: 'link', linkTarget: 'iframe', path: 'https://example.com/docs' },
    ] }
    const dynamic = createDynamicRouter({ router, pageComponent: DummyPage, loadNavigation: async () => navigation,
      tenantPathPrefix: '/t/:tenantId/:projectId', componentMap: { '/dashboard': DummyPage } })
    await dynamic.registerRoutes()
    const host = router.getRoutes().find(route => route.path === '/t/:tenantId/:projectId/dashboard')
    expect(host?.meta['type']).toBe('system-page')
    expect(host?.meta).not.toHaveProperty('nodeId')
    await router.push('/t/T/APP/dashboard')
    expect(router.currentRoute.value.meta['nodeId']).toBe('dashboard')
    expect(router.getRoutes().find(route => route.name === 'nav-docs')?.meta['linkUrl']).toBe('https://example.com/docs')
    expect(dynamic.getPageRuntimeNames()).toEqual([])
  })

  it('uses one path host and resolves the selected same-path system-page owner per navigation', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const navigation: RuntimeNavigation = { id: 'root', projectId: 'APP', title: 'App', childPlacement: 'header', items: [
      { id: 'view-one', title: 'View One', description: 'First description', icon: 'first-icon', permissionMode: 'none',
        itemKind: 'system-page', path: '/shared?view=one', tool: { projectId: 'APP', pageId: 'page-one' } },
      { id: 'view-two', title: 'View Two', description: 'Second description', icon: 'second-icon', permissionMode: 'masked',
        itemKind: 'system-page', path: '/shared?view=two', tool: { projectId: 'APP', pageId: 'page-two' } },
    ] }
    const dynamic = createDynamicRouter({ router, pageComponent: DummyPage,
      loadNavigation: async () => navigation, tenantPathPrefix: '/t/:tenantId/:projectId',
      componentMap: { '/shared': DummyPage } })

    await dynamic.registerRoutes()
    const hosts = router.getRoutes().filter(route => route.path === '/t/:tenantId/:projectId/shared')
    await router.push('/t/T/APP/shared?view=two')

    expect(hosts).toHaveLength(1)
    expect(hosts[0]?.meta).not.toHaveProperty('nodeId')
    expect(hosts[0]?.meta).not.toHaveProperty('title')
    expect(router.currentRoute.value.meta['nodeId']).toBe('view-two')
    expect(router.currentRoute.value.meta['title']).toBe('View Two')
    expect(router.currentRoute.value.meta).toMatchObject({
      pageId: 'page-two',
      description: 'Second description',
      icon: 'second-icon',
      permissionMode: 'masked',
    })
  })

  it('uses identity hosts for mapped page-kind owners as well as system-page owners', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const navigation: RuntimeNavigation = { id: 'root', projectId: 'APP', title: 'App', childPlacement: 'header', items: [
      { id: 'page-one', title: 'Page One', itemKind: 'page', path: '/shared?view=one', tool: { projectId: 'APP', pageId: 'tool-one' } },
      { id: 'page-two', title: 'Page Two', itemKind: 'page', path: '/shared?view=two', tool: { projectId: 'APP', pageId: 'tool-two' } },
    ] }
    const dynamic = createDynamicRouter({ router, pageComponent: DummyPage,
      loadNavigation: async () => navigation, tenantPathPrefix: '/t/:tenantId/:projectId',
      componentMap: { '/shared': DummyPage } })

    await dynamic.registerRoutes()
    const hosts = router.getRoutes().filter(route => route.meta['systemPageIdentityHost'] === true)
    await router.push('/t/T/APP/shared?view=two&__sparkNavigationId=page-two')

    expect(hosts).toHaveLength(1)
    expect(router.currentRoute.value.meta['nodeId']).toBe('page-two')
    expect(router.currentRoute.value.meta['pageId']).toBe('tool-two')
  })

  it('requires every explicit target query value even when an owner marker is present', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const navigation: RuntimeNavigation = { id: 'root', projectId: 'APP', title: 'App', childPlacement: 'header', items: [
      { id: 'scenario-view', title: 'Scenario View', itemKind: 'system-page', path: '/shared?scenarioId=S1' },
    ] }
    const dynamic = createDynamicRouter({ router, pageComponent: DummyPage,
      loadNavigation: async () => navigation, tenantPathPrefix: '/t/:tenantId/:projectId',
      componentMap: { '/shared': DummyPage } })
    await dynamic.registerRoutes()

    await router.push('/t/T/APP/shared?__sparkNavigationId=scenario-view')

    expect(router.currentRoute.value.meta['systemPageIdentityState']).toBe('error')
    await router.push('/t/T/APP/shared')
    expect(router.currentRoute.value.meta['systemPageIdentityState']).toBe('error')
  })

  it('rejects a tenant marker when the route project differs from the committed navigation project', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const navigation: RuntimeNavigation = { id: 'root', projectId: 'APP-A', title: 'App A', childPlacement: 'header', items: [
      { id: 'tenant-view', title: 'Tenant View', itemKind: 'system-page', path: '/shared' },
    ] }
    const dynamic = createDynamicRouter({ router, pageComponent: DummyPage,
      loadNavigation: async () => navigation, tenantPathPrefix: '/t/:tenantId/:projectId',
      componentMap: { '/shared': DummyPage } })
    await dynamic.registerRoutes()

    await router.push('/t/T/APP-B/shared?__sparkNavigationId=tenant-view')
    expect(router.currentRoute.value.meta['systemPageIdentityState']).toBe('error')
    expect(router.currentRoute.value.meta).not.toHaveProperty('nodeId')

    await router.push('/t/T/APP-A/shared?__sparkNavigationId=tenant-view')
    expect(router.currentRoute.value.meta['systemPageIdentityState']).toBe('resolved')
    expect(router.currentRoute.value.meta['nodeId']).toBe('tenant-view')

    const unscopedRouter = createRouter({ history: createMemoryHistory(), routes: [] })
    const unscopedNavigation: RuntimeNavigation = { id: 'catalog', title: 'Catalog', childPlacement: 'header', items: [
      { id: 'catalog-view', title: 'Catalog View', itemKind: 'system-page', path: '/shared' },
    ] }
    const unscopedDynamic = createDynamicRouter({ router: unscopedRouter, pageComponent: DummyPage,
      loadNavigation: async () => unscopedNavigation, tenantPathPrefix: '/t/:tenantId/:projectId',
      componentMap: { '/shared': DummyPage } })
    await unscopedDynamic.registerRoutes()
    await unscopedRouter.push('/t/T/APP-B/shared?__sparkNavigationId=catalog-view')
    expect(unscopedRouter.currentRoute.value.meta['systemPageIdentityState']).toBe('resolved')
  })

  it('treats question marks after a target hash as hash text rather than configured query', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const navigation: RuntimeNavigation = { id: 'root', projectId: 'APP', title: 'App', childPlacement: 'header', items: [
      { id: 'hash-view', title: 'Hash View', itemKind: 'system-page', path: '/shared#details?mode=A' },
    ] }
    const dynamic = createDynamicRouter({ router, pageComponent: DummyPage,
      loadNavigation: async () => navigation, tenantPathPrefix: '/t/:tenantId/:projectId',
      componentMap: { '/shared': DummyPage } })
    await dynamic.registerRoutes()

    await router.push('/t/T/APP/shared?__sparkNavigationId=hash-view#details?mode=A')

    expect(router.currentRoute.value.meta['systemPageIdentityState']).toBe('resolved')
    expect(router.currentRoute.value.hash).toBe('#details?mode=A')
  })

  it('rejects system-page targets that already use the reserved identity query key', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const navigation: RuntimeNavigation = { id: 'root', projectId: 'APP', title: 'App', childPlacement: 'header', items: [
      { id: 'forged-view', title: 'Forged View', itemKind: 'system-page', path: '/shared?__sparkNavigationId=other' },
    ] }
    const dynamic = createDynamicRouter({ router, pageComponent: DummyPage,
      loadNavigation: async () => navigation, tenantPathPrefix: '/t/:tenantId/:projectId',
      componentMap: { '/shared': DummyPage } })

    await expect(dynamic.registerRoutes()).rejects.toThrow('系统页面目标使用保留身份参数：forged-view')
    expect(router.getRoutes().some(route => route.path === '/t/:tenantId/:projectId/shared')).toBe(false)
  })

  it('shows an identity error and mounts no business page for ambiguous or invalid markers', async () => {
    let businessMounts = 0
    const BusinessPage = defineComponent({
      name: 'BusinessPage',
      setup() {
        businessMounts++
        return () => h('div', 'business-page')
      },
    })
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const navigation: RuntimeNavigation = { id: 'root', projectId: 'APP', title: 'App', childPlacement: 'header', items: [
      { id: 'view-one', title: 'View One', itemKind: 'system-page', path: '/shared?view=one' },
      { id: 'view-two', title: 'View Two', itemKind: 'system-page', path: '/shared?view=two' },
    ] }
    const dynamic = createDynamicRouter({ router, pageComponent: DummyPage,
      loadNavigation: async () => navigation, tenantPathPrefix: '/t/:tenantId/:projectId',
      componentMap: { '/shared': BusinessPage } })
    const App = defineComponent({ setup: () => () => h(RouterView) })
    await dynamic.registerRoutes()
    await router.push('/t/T/APP/shared?__sparkNavigationId=missing')
    const wrapper = mount(App, { global: { plugins: [router] } })

    expect(router.currentRoute.value.meta['systemPageIdentityState']).toBe('error')
    expect(wrapper.text()).toContain('请从导航菜单重新选择')
    expect(wrapper.text()).not.toContain('business-page')
    expect(businessMounts).toBe(0)

    for (const path of [
      '/t/T/APP/shared?view=one&__sparkNavigationId=view-two',
      '/t/T/APP/shared?__sparkNavigationId=view-one&__sparkNavigationId=view-two',
      '/t/T/APP/shared?unrelated=value',
    ]) {
      await router.push(path)
      await nextTick()
      expect(router.currentRoute.value.meta['systemPageIdentityState']).toBe('error')
      expect(businessMounts).toBe(0)
    }
    wrapper.unmount()
  })
})
