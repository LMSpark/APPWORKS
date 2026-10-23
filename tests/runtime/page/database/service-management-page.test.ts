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
  lowcodeApi: {readRequestScope: service.readRequestScope, application: {get: () => null}, dataSpace: {design: service, get runtime() {return runtime}}},
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
    const header = table.find('.el-table__header-wrapper').text()
    expect(header).toContain('服务器名称')
    expect(header).toContain('端口')
    expect(header).not.toMatch(/账号|密码|用户名/)
    expect(table.find('.el-table__body-wrapper').text()).toContain('主库')
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
    const dialog = body.findAll('.el-dialog').at(-1)!
    for (const label of ['类型', '服务器名称', '服务器IP地址', '端口', '账号', '密码', '描述']) expect(dialog.text()).toContain(label)
    expect(dialog.text()).not.toContain('rowid')
    expect(dialog.findAll('input[type="password"]')).toHaveLength(1)
    expect(dialog.findAll('input').length).toBeGreaterThan(0)
  })

  it('registers a server through register dialog confirm', async () => {
    const wrapper = await open(DATABASE_SERVER_SCENARIO_ID)
    await flushPromises()
    await pageButton(wrapper, '注册服务器').trigger('click')
    await flushPromises()
    await flushPromises()
    const body = new DOMWrapper(document.body)
    const dialog = body.findAll('.el-dialog').at(-1)!
    const setByLabel = async (label: string, value: string) => {
      const item = dialog.findAll('.el-form-item').find(row => row.text().includes(label))
      expect(item).toBeTruthy()
      const input = item!.find('input')
      expect(input.exists()).toBe(true)
      await input.setValue(value)
    }
    await setByLabel('服务器名称', '新库')
    await setByLabel('服务器IP地址', '127.0.0.1')
    await setByLabel('账号', 'root')
    await setByLabel('密码', 'secret')
    const ok = dialog.findAll('button').find(button => button.text() === '确定')
    expect(ok).toBeTruthy()
    await ok!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('服务器已注册')
    expect(http.requests.some(request => request.url === '/api/Db/registerServer')).toBe(true)
    expect(wrapper.text()).toContain('新库')
  })

  it('edits selected server description through edit dialog confirm', async () => {
    const wrapper = await open(DATABASE_SERVER_SCENARIO_ID)
    await flushPromises()
    const table = wrapper.findComponent(RendererTable)
    await table.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    await pageButton(wrapper, '编辑').trigger('click')
    await flushPromises()
    await flushPromises()
    const body = new DOMWrapper(document.body)
    const dialog = body.findAll('.el-dialog').at(-1)!
    expect(dialog.text()).toContain('编辑服务器')
    const setByLabel = async (label: string, value: string) => {
      const item = dialog.findAll('.el-form-item').find(row => row.text().includes(label))
      expect(item).toBeTruthy()
      const input = item!.find('input, textarea')
      expect(input.exists()).toBe(true)
      await input.setValue(value)
      await input.trigger('input')
    }
    await setByLabel('描述', '更新后的描述')
    const ok = dialog.findAll('button').find(button => button.text() === '确定')
    await ok!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('服务器已保存')
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    expect(wrapper.text()).toContain('更新后的描述')
  })

  it('tests connection from register server dialog', async () => {
    const wrapper = await open(DATABASE_SERVER_SCENARIO_ID)
    await flushPromises()
    await pageButton(wrapper, '注册服务器').trigger('click')
    await flushPromises()
    const body = new DOMWrapper(document.body)
    const dialog = body.findAll('.el-dialog').at(-1)!
    const setByLabel = async (label: string, value: string) => {
      const item = dialog.findAll('.el-form-item').find(row => row.text().includes(label))
      expect(item).toBeTruthy()
      const input = item!.find('input')
      await input.setValue(value)
      await input.trigger('input')
    }
    await setByLabel('服务器名称', '测连库')
    await setByLabel('服务器IP地址', '127.0.0.1')
    await setByLabel('账号', 'root')
    const test = dialog.findAll('button').find(button => button.text() === '测试连接')
    expect(test).toBeTruthy()
    await test!.trigger('click')
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('连接成功')
    expect(http.requests.some(request => request.url === '/api/Db/testConnection')).toBe(true)
  })

  it('deletes selected server through confirm dialog and saveChanges', async () => {
    const wrapper = await open(DATABASE_SERVER_SCENARIO_ID)
    await flushPromises()
    const table = wrapper.findComponent(RendererTable)
    await table.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    await pageButton(wrapper, '删除').trigger('click')
    await flushPromises()
    const body = new DOMWrapper(document.body)
    const dialog = body.findAll('.el-dialog').at(-1)!
    expect(dialog.text()).toContain('确认删除服务器')
    expect(dialog.text()).toContain('主库')
    const confirm = dialog.findAll('button').find(button => button.text() === '删除')
    expect(confirm).toBeTruthy()
    await confirm!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('服务器已删除')
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    expect(table.find('.el-table__body-wrapper').text()).not.toContain('主库')
  })
})

function pageButton(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find(item => item.text() === label)
  expect(button).toBeTruthy()
  return button!
}
