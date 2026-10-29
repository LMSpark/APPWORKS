import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import {defineComponent, h, type Component} from 'vue'
import ElementPlus from 'element-plus'
import {Spark, registerAllRenderers, RendererForm} from '@spark-appworks/spark-component'
import {getVuePageEntry} from '@/registries/vue-page-registry'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'
import {createApiService, seed, NAV, pagedata} from './api-provider.fixture'

const api = vi.hoisted(() => ({current: undefined as unknown as ReturnType<typeof import('./api-provider.fixture')['createApiService']>}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return api.current.state.http},
  lowcodeApi: {readRequestScope: (...args: unknown[]) => api.current.service.readRequestScope(...args),
    dataSpace: {get design() {return api.current.service}, get runtime() {return api.current.state.runtime}}},
  lowcodeDesignFileUpload: {
    uploadWorkingText: async () => {throw new Error('API provider page fixture must not upload scenario files')},
    uploadTextVersion: async () => {throw new Error('API provider page fixture must not upload scenario versions')},
  },
  createLowcodeProjectGateways: () => ({scenarioViews: {readScope: () => 'scope', readText: async (id: string) => pagedata[id] ?? null,
    writeText: async () => {throw new Error('pages must not write scenario files')}}}),
}))
const {default: ManagementPage} = await import('@/views/features/integration/api-management/ui/api-management-page.vue')
const {default: ConfigPage} = await import('@/views/features/integration/api-management/ui/api-config-page.vue')
const {default: InterfacePage} = await import('@/views/features/integration/api-management/ui/api-interface-list-page.vue')

api.current = createApiService()
const wrappers: VueWrapper[] = []
const originalStubs = {...config.global.stubs}
beforeEach(() => {
  api.current.reset(seed)
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {wrappers.splice(0).forEach(w => w.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); config.global.stubs = originalStubs})

async function mountAt(component: Component, props: Record<string, unknown> = {}) {
  const page = defineComponent({setup: () => () => h(component, props)})
  const router = createRouter({history: createMemoryHistory(), routes: []})
  const dynamic = createDynamicRouter({router, pageComponent: page, componentMap: {'/providers': page}, applicationPathPrefix: '/apps/:projectId',
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header', items: [
      {id: 'providers', title: '外部服务管理', path: '/providers', itemKind: 'system-page', blueprintScenarioId: NAV}]})})
  await dynamic.registerRoutes(); await router.push('/apps/APP/providers'); await router.isReady()
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  wrappers.push(wrapper)
  await vi.waitFor(async () => {await flushPromises(); expect(wrapper.text()).not.toContain('正在读取')})
  await flushPromises()
  return wrapper
}
const button = (wrapper: VueWrapper, label: string) => wrapper.findAll('button').find(item => item.text() === label)
const records = (table: string) => api.current.state.http.records[table]!

describe('external API pages assembled through the standard scenario entry', () => {
  it('keeps the original business path', () => {
    const path = '/features/integration/api-management/ui/api-management-page'
    expect(getVuePageEntry(path)).toMatchObject({source: `src/views${path}.vue`, scope: 'app', shellTool: false})
  })

  it('lists providers and creates one through the create view with page events only', async () => {
    const wrapper = await mountAt(ManagementPage)
    expect(wrapper.text()).toContain('服务甲')
    expect(wrapper.text()).toContain('服务乙')
    await button(wrapper, '新增服务商')!.trigger('click')
    await vi.waitFor(async () => {await flushPromises(); expect(wrapper.findComponent(RendererForm).exists()).toBe(true)})
    const inputs = wrapper.findComponent(RendererForm).findAll('input')
    await inputs[0]!.setValue('新服务'); await inputs[1]!.setValue('https://new.test')
    await button(wrapper, '保存基础信息')!.trigger('click')
    await vi.waitFor(async () => {await flushPromises(); expect(records('Base_InterfaceProvider').some(row => row['Name'] === '新服务')).toBe(true)})
    expect(api.current.state.http.saves.at(-1)).toMatchObject({table: 'Base_InterfaceProvider', changed: [], deleted: []})
  })

  it('opens the request settings for one provider and saves the prefix verbatim', async () => {
    const wrapper = await mountAt(ConfigPage, {providerId: 'P1'})
    expect(wrapper.text()).toContain('access_token')
    expect(wrapper.text()).not.toContain('other')
    await wrapper.findAll('.el-tabs__item').find(item => item.text() === '公共请求头')!.trigger('click')
    await vi.waitFor(async () => {await flushPromises(); expect(wrapper.text()).toContain('令牌前缀')})
    const prefix = wrapper.findAllComponents(RendererForm).find(form => form.text().includes('令牌前缀'))
    expect(prefix).toBeDefined()
    await prefix!.get('input').setValue(' Token ')
    await button(wrapper, '保存令牌前缀')!.trigger('click')
    await vi.waitFor(async () => {await flushPromises(); expect(records('Base_InterfaceProvider')[0]!['TokenPrefix']).toBe(' Token ')})
  })

  it('opens the interface scheme for one provider with no child definition loaded before a selection', async () => {
    const wrapper = await mountAt(InterfacePage, {providerId: 'P1'})
    expect(wrapper.text()).toContain('取令牌')
    expect(wrapper.text()).not.toContain('其他')
    expect(wrapper.text()).toContain('从左侧选择接口')
    expect(api.current.state.http.reads.some(read => read.table === '_Base_ParamList')).toBe(false)
  })
})
