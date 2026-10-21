import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, DOMWrapper, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import {registerAllRenderers, RendererTable, Spark} from '@spark-appworks/spark-component'
import TableAndViewPage from '@/views/features/data-platform/database-management/table-and-view/ui/table-and-view-page.vue'
import {
  DATABASE_TABLE_VIEW_SCENARIO_ID,
  DatabaseTableViewHttp,
  bootstrapDatabaseTableViewRuntime,
} from './database-table-view.fixture'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: DatabaseTableViewHttp, runtime: DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}},
}))

const wrappers: VueWrapper[] = []
const originalStubs = {...config.global.stubs}

beforeEach(() => {
  http = new DatabaseTableViewHttp()
  runtime = bootstrapDatabaseTableViewRuntime(http, service)
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

function pageButton(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find(item => item.text() === label)
  expect(button).toBeTruthy()
  return button!
}

async function selectServerAndDatabase(wrapper: VueWrapper): Promise<void> {
  let tables = wrapper.findAllComponents(RendererTable)
  await tables[0]!.find('.el-table__body-wrapper tbody tr').trigger('click')
  await flushPromises()
  await flushPromises()
  tables = wrapper.findAllComponents(RendererTable)
  expect(tables.length).toBeGreaterThan(1)
  await tables[1]!.find('.el-table__body-wrapper tbody tr').trigger('click')
  await flushPromises()
  await flushPromises()
}

async function open(scenarioId: string): Promise<VueWrapper> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{path: '/', component: TableAndViewPage, meta: {blueprintScenarioId: scenarioId}}],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(TableAndViewPage, {
    attachTo: document.body,
    global: {plugins: [router, ElementPlus, Spark.createPlugin()]},
  })
  wrappers.push(wrapper)
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('table-and-view-page', () => {
  it('loads catalog tables with autoColumns when blueprintScenarioId is bound', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    expect(wrapper.text()).toContain('表和视图')
    expect(http.requests.some(request => JSON.stringify(request.data).includes('_base_dbInfo'))).toBe(true)
    const table = wrapper.findComponent(RendererTable)
    expect(table.exists()).toBe(true)
    expect(table.findAll('.el-table__header-wrapper th').length).toBeGreaterThan(0)
  })

  it('scopes table list after database row selection (cascade)', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    const tables = wrapper.findAllComponents(RendererTable)
    expect(tables.length).toBeGreaterThan(0)
    const dbTable = tables[0]!
    const row = dbTable.find('.el-table__body-wrapper tbody tr')
    expect(row.exists()).toBe(true)
    await row.trigger('click')
    await flushPromises()
    await flushPromises()
    expect(http.requests.some(request => JSON.stringify(request.data).includes('_Base_TblList'))).toBe(true)
    const objectTables = wrapper.findAllComponents(RendererTable)
    expect(objectTables.length).toBeGreaterThan(1)
    const tblTable = objectTables[1]!
    expect(tblTable.findAll('.el-table__body-wrapper tbody tr').length).toBeGreaterThan(0)
  })

  it('opens register database dialog from toolbar after server selection', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await wrapper.findAllComponents(RendererTable)[0]!.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    await flushPromises()
    await pageButton(wrapper, '注册数据库').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('注册数据库')
    expect(wrapper.text()).toContain('服务器：主库')
  })

  it('opens table design dialog with field save toolbar after table selection', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await selectServerAndDatabase(wrapper)
    const tables = wrapper.findAllComponents(RendererTable)
    expect(tables.length).toBeGreaterThan(2)
    await tables[2]!.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    await flushPromises()
    await pageButton(wrapper, '表设计').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('表设计')
    expect(wrapper.text()).toContain('保存字段')
    expect(wrapper.text()).toContain('双击单元格编辑字段')
  })

  it('loads unregistered physical table names into add-table dialog hint', async () => {
    http.unregisteredByDb = {DB1: ['StagingOrders', 'RawArchive']}
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await selectServerAndDatabase(wrapper)
    await pageButton(wrapper, '注册数据表').trigger('click')
    await flushPromises()
    await flushPromises()
    const body = new DOMWrapper(document.body)
    const refresh = body.findAll('button').find(button => button.text() === '刷新未登记表名')
    expect(refresh).toBeTruthy()
    expect(refresh!.element.hasAttribute('disabled')).toBe(false)
    await refresh!.trigger('click')
    await flushPromises()
    await flushPromises()
    expect(body.text()).toContain('StagingOrders')
    expect(http.requests.some(request => request.url === '/api/Db/getUnregisteredTable/DB1')).toBe(true)
  })

  it('opens add-table dialog with register and unregistered actions enabled', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await selectServerAndDatabase(wrapper)
    await pageButton(wrapper, '注册数据表').trigger('click')
    await flushPromises()
    await flushPromises()
    const body = new DOMWrapper(document.body)
    expect(body.text()).toContain('注册数据表')
    expect(body.text()).toContain('数据库：业务库')
    const save = body.findAll('button').find(button => button.text() === '注册')
    const refresh = body.findAll('button').find(button => button.text() === '刷新未登记表名')
    expect(save).toBeTruthy()
    expect(refresh).toBeTruthy()
    expect(save!.element.hasAttribute('disabled')).toBe(false)
    expect(refresh!.element.hasAttribute('disabled')).toBe(false)
  })
})
