import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {config, DOMWrapper, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {registerAllRenderers, RendererTable, Spark} from '@spark-appworks/spark-component'
import {createMemoryHistory, createRouter} from 'vue-router'
import ServiceManagementPage from '@/views/features/data-platform/database-management/ui/service-management-page.vue'
import {LowcodeDatabaseServer} from '@/lowcode/resources/database/lowcode-database-server'
import {
  databaseServerCanCreate,
  requireDatabaseServerView,
} from '@/lowcode/resources/database/database-server-view-ops'
import {
  DATABASE_SERVER_SCENARIO_ID,
  DatabaseServerHttp,
  bootstrapDatabaseServerRuntime,
} from './database-server.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: DatabaseServerHttp, runtime: DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}},
}))

const sets: DataSet[] = []
const wrappers: VueWrapper[] = []
const originalStubs = {...config.global.stubs}

beforeEach(() => {
  http = new DatabaseServerHttp()
  runtime = bootstrapDatabaseServerRuntime(http, service)
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  sets.splice(0).forEach(dataSet => dataSet.destroy())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  config.global.stubs = originalStubs
})

async function open(scenarioId: string): Promise<VueWrapper> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{path: '/', component: ServiceManagementPage, meta: {blueprintScenarioId: scenarioId}}],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(ServiceManagementPage, {
    attachTo: document.body,
    global: {plugins: [router, ElementPlus, Spark.createPlugin()]},
  })
  wrappers.push(wrapper)
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('service-management-page', () => {
  it('loads the server catalog when blueprintScenarioId is bound', async () => {
    const wrapper = await open(DATABASE_SERVER_SCENARIO_ID)
    await flushPromises()
    expect(wrapper.text()).toContain('服务器管理')
    expect(http.requests.some(request => JSON.stringify(request.data).includes('Base_serverInfo'))).toBe(true)
    const table = wrapper.findComponent(RendererTable)
    expect(table.exists()).toBe(true)
    expect(table.findAll('.el-table__header-wrapper th').length).toBeGreaterThan(0)
    expect(table.findAll('.el-table__body-wrapper tbody tr').length).toBeGreaterThan(0)
    expect(table.findAll('.el-table__body-wrapper .cell').length).toBeGreaterThan(0)
  })

  it('reports missing navigation scenario identity before loading', async () => {
    const wrapper = await open('')
    expect(wrapper.text()).toContain('缺少导航绑定的数据空间ID')
  })

  it('allows register after catalog load in view-ops contract', async () => {
    const ds = await LowcodeDatabaseServer.loadCatalog(DATABASE_SERVER_SCENARIO_ID)
    sets.push(ds)
    const v = requireDatabaseServerView(ds)
    expect(databaseServerCanCreate(v, undefined)).toBe(true)
  })

  it('opens register server dialog from toolbar', async () => {
    const wrapper = await open(DATABASE_SERVER_SCENARIO_ID)
    const table = wrapper.findComponent(RendererTable)
    expect(table.findAll('.el-table__body-wrapper tbody tr').length).toBeGreaterThan(0)
    await flushPromises()
    const add = wrapper.findAll('button').find(button => button.text() === '注册服务器')
    expect(add).toBeTruthy()
    expect(add!.element.hasAttribute('disabled')).toBe(false)
    await add!.trigger('click')
    await flushPromises()
    await flushPromises()
    const body = new DOMWrapper(document.body)
    expect(body.text()).toContain('确定')
    expect(body.findAll('button').some(button => button.text() === '测试连接')).toBe(true)
  })
})
