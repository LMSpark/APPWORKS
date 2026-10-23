import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import {registerAllRenderers, Spark} from '@spark-appworks/spark-component'
import DatabaseManagementHub from '@/views/features/data-platform/database-management/ui/database-management-hub.vue'
import {clearDatabaseCatalogResolveCache} from '@/lowcode/resources/database/database-catalog-scenario'
import {
  DATABASE_TABLE_VIEW_SCENARIO_ID,
  type DatabaseTableViewDesignMocks,
  DatabaseTableViewHttp,
  bootstrapDatabaseTableViewRuntime,
} from './database-table-view.fixture'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'

const service = vi.hoisted(() => ({
  readSpaceDefinition: vi.fn(),
  readModel: vi.fn(),
  readRequestScope: vi.fn(),
})) as DatabaseTableViewDesignMocks
let tableHttp: DatabaseTableViewHttp
let runtime: DataSpaceRuntimeApi

vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {
    return tableHttp
  },
  lowcodeApi: {
    readRequestScope: service.readRequestScope,
    application: {get: () => null},
    blueprint: {readRecords: async () => []},
    catalog: {getDatabaseCatalog: async () => ({sourceDataSpaces: {}})},
    dataSpace: {
      design: service,
      get runtime() {
        return runtime
      },
    },
  },
}))

const wrappers: VueWrapper[] = []
const originalStubs = {...config.global.stubs}

beforeEach(() => {
  clearDatabaseCatalogResolveCache()
  tableHttp = new DatabaseTableViewHttp()
  runtime = bootstrapDatabaseTableViewRuntime(tableHttp, service)
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  config.global.stubs = originalStubs
})

async function openHub(scenarioId: string): Promise<VueWrapper> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{path: '/', component: DatabaseManagementHub, meta: {blueprintScenarioId: scenarioId}}],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(DatabaseManagementHub, {
    attachTo: document.body,
    global: {plugins: [router, ElementPlus, Spark.createPlugin()]},
  })
  wrappers.push(wrapper)
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('database-management-hub', () => {
  it('does not duplicate readModelBatch before hub resolve completes', async () => {
    const batchCallsBefore = service.readModelBatch?.mock.calls.length ?? 0
    const wrapper = await openHub(DATABASE_TABLE_VIEW_SCENARIO_ID)
    const callsAfterMount = (service.readModelBatch?.mock.calls.length ?? 0) - batchCallsBefore
    expect(callsAfterMount).toBeLessThanOrEqual(1)
    expect(wrapper.text()).not.toContain('正式模型集合不完整')
    wrapper.unmount()
    await flushPromises()
  })

  it('serverOnly tier warns in header and skips catalog readSpaceDefinition on catalog tab', async () => {
    service.readSpaceDefinition.mockClear()
    service.readModelBatch!.mockImplementation(async (input: {metaNames: readonly string[]}) => {
      if (input.metaNames.length > 1) throw new Error('正式模型集合不完整')
      return Promise.all(input.metaNames.map(metaName => service.readModel({metaName})))
    })
    const wrapper = await openHub(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('未齐')
    expect(wrapper.find('.table-and-view-catalog-blocked').exists()).toBe(true)
    expect(service.readSpaceDefinition).not.toHaveBeenCalled()
    wrapper.unmount()
    await flushPromises()
  })

  it('serverOnly tier loads server tab without prior catalog readSpaceDefinition', async () => {
    service.readSpaceDefinition.mockClear()
    service.readModelBatch!.mockImplementation(async (input: {metaNames: readonly string[]}) => {
      if (input.metaNames.length > 1) throw new Error('正式模型集合不完整')
      return Promise.all(input.metaNames.map(metaName => service.readModel({metaName})))
    })
    const wrapper = await openHub(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await flushPromises()
    await flushPromises()
    expect(service.readSpaceDefinition).not.toHaveBeenCalled()
    const serverTab = wrapper.findAll('button').find(button => button.text() === '服务器')!
    await serverTab.trigger('click')
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('注册服务器')
    expect(service.readSpaceDefinition.mock.calls.length).toBe(1)
    wrapper.unmount()
    await flushPromises()
  })

  it('KeepAlive avoids extra readSpaceDefinition when returning to catalog tab', async () => {
    const wrapper = await openHub(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await flushPromises()
    await flushPromises()
    const afterCatalog = service.readSpaceDefinition.mock.calls.length
    const serverTab = wrapper.findAll('button').find(button => button.text() === '服务器')!
    await serverTab.trigger('click')
    await flushPromises()
    await flushPromises()
    const afterServer = service.readSpaceDefinition.mock.calls.length
    const catalogTab = wrapper.findAll('button').find(button => button.text() === '表和视图')!
    await catalogTab.trigger('click')
    await flushPromises()
    expect(service.readSpaceDefinition.mock.calls.length).toBe(afterServer)
    expect(afterCatalog).toBeGreaterThan(0)
    wrapper.unmount()
    await flushPromises()
  })

  it('shows full-tier ok status when five-model resolve succeeds', async () => {
    const wrapper = await openHub(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await flushPromises()
    expect(wrapper.text()).toContain('五表正式模型齐')
    wrapper.unmount()
    await flushPromises()
  })

  it('loads table-and-view catalog panel on default catalog tab when tier is full', async () => {
    const wrapper = await openHub(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('表和视图管理')
    expect(wrapper.text()).toContain('数据库列表')
    wrapper.unmount()
    await flushPromises()
  })

  it('defaults to catalog tab and loads server panel on tab switch with shared FormKey', async () => {
    const wrapper = await openHub(DATABASE_TABLE_VIEW_SCENARIO_ID)
    expect(wrapper.text()).toContain('表和视图')
    const serverTab = wrapper.findAll('button').find(button => button.text() === '服务器')!
    await serverTab.trigger('click')
    await flushPromises()
    await flushPromises()
    expect(serverTab.attributes('aria-selected')).toBe('true')
    expect(wrapper.text()).toContain('注册服务器')
  })
})
