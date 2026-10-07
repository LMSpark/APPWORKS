import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
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

describe('DynamicRouter formal routes and runtime calls', () => {
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
    expect(router.getRoutes().find(route => route.name === 'nav-dashboard')?.meta['type']).toBe('system-page')
    expect(router.getRoutes().find(route => route.name === 'nav-docs')?.meta['linkUrl']).toBe('https://example.com/docs')
    expect(dynamic.getPageRuntimeNames()).toEqual([])
  })
})
