import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, DOMWrapper, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import {registerAllRenderers, RendererTable, Spark} from '@spark-appworks/spark-component'
import TableAndViewPage from '@/views/features/data-platform/database-management/table-and-view/ui/table-and-view-page.vue'
import {DATABASE_CATALOG_FIELD_MODEL} from '@/lowcode/resources/database/lowcode-database-table-view'
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
  lowcodeApi: {readRequestScope: service.readRequestScope, application: {get: () => null}, dataSpace: {design: service, get runtime() {return runtime}}},
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

function enabledPageButton(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find(item => item.text() === label && !item.element.hasAttribute('disabled'))
  expect(button).toBeTruthy()
  return button!
}

async function selectDatabase(wrapper: VueWrapper): Promise<void> {
  const tables = wrapper.findAllComponents(RendererTable)
  expect(tables.length).toBeGreaterThan(0)
  await tables[0]!.find('.el-table__body-wrapper tbody tr').trigger('click')
  await flushPromises()
  await flushPromises()
}

async function selectPhysicalTableByName(wrapper: VueWrapper, name: string): Promise<void> {
  await selectDatabase(wrapper)
  const tables = wrapper.findAllComponents(RendererTable)
  const tableList = tables[1]!
  const row = tableList.findAll('.el-table__body-wrapper tbody tr').find(item => item.text().includes(name))
  expect(row).toBeTruthy()
  await row!.trigger('click')
  await flushPromises()
  await flushPromises()
}

async function openTableDesignOnTable(wrapper: VueWrapper, tableName: string): Promise<DOMWrapper<Element>> {
  await selectPhysicalTableByName(wrapper, tableName)
  await pageButton(wrapper, '表设计').trigger('click')
  await flushPromises()
  const body = new DOMWrapper(document.body)
  const designDialog = body.findAll('.el-dialog').find(dialog => dialog.text().includes('表设计') && dialog.text().includes(`物理表：${tableName}`))
  expect(designDialog).toBeTruthy()
  return designDialog!
}

async function openViewDesignOnView(wrapper: VueWrapper, viewName: string): Promise<DOMWrapper<Element>> {
  await selectDatabase(wrapper)
  const viewsTab = wrapper.findAll('.el-tabs__item').find(item => item.text() === '视图')
  await viewsTab!.trigger('click')
  await flushPromises()
  await flushPromises()
  const tables = wrapper.findAllComponents(RendererTable)
  const viewList = tables.find(table => table.find('.el-table__body-wrapper').text().includes(viewName))
  expect(viewList).toBeTruthy()
  await viewList!.find('.el-table__body-wrapper tbody tr').trigger('click')
  await flushPromises()
  await flushPromises()
  await pageButton(wrapper, '视图设计').trigger('click')
  await flushPromises()
  const body = new DOMWrapper(document.body)
  const designDialog = body.findAll('.el-dialog').find(dialog => dialog.text().includes('视图设计') && dialog.text().includes(`视图：${viewName}`))
  expect(designDialog).toBeTruthy()
  return designDialog!
}

function designSaveButton(wrapper: VueWrapper, designDialog: DOMWrapper<Element>) {
  const save = designDialog.findAll('button').find(button => button.text() === '保存' && !button.element.hasAttribute('disabled'))
    ?? wrapper.findAll('button').find(button => button.text() === '保存' && !button.element.hasAttribute('disabled'))
  expect(save).toBeTruthy()
  return save!
}

async function setDesignFieldCnname(
  designDialog: DOMWrapper<Element>,
  rowIncludes: string,
  value: string,
): Promise<DOMWrapper<Element>> {
  const fieldRow = designDialog.findAll('.el-table__body-wrapper tbody tr').find(row => row.text().includes(rowIncludes))
  expect(fieldRow).toBeTruthy()
  const fieldTable = new DOMWrapper(fieldRow!.element.closest('.el-table')!)
  const cnIndex = fieldTable.findAll('.el-table__header-wrapper th').findIndex(cell => cell.text().includes('中文名'))
  expect(cnIndex).toBeGreaterThanOrEqual(0)
  const cnCell = fieldRow!.findAll('td')[cnIndex]
  expect(cnCell).toBeTruthy()
  const cnInput = cnCell!.find('input')
  expect(cnInput.exists()).toBe(true)
  await cnInput.setValue(value)
  await cnInput.trigger('input')
  await cnInput.trigger('change')
  await flushPromises()
  return cnInput
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
    expect(table.find('.el-table__header-wrapper').text()).toContain('Name')
    expect(table.find('.el-table__body-wrapper').text()).toContain('业务库')
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

  it('opens register database dialog from toolbar with implicit server scope', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await pageButton(wrapper, '注册数据库').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('注册数据库')
    expect(wrapper.text()).toContain('服务器：主库')
  })

  it('opens table design dialog with field save toolbar after table selection', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await selectDatabase(wrapper)
    const tables = wrapper.findAllComponents(RendererTable)
    expect(tables.length).toBeGreaterThan(1)
    await tables[1]!.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    await flushPromises()
    await pageButton(wrapper, '表设计').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('表设计')
    expect(wrapper.text()).toContain('关系')
    expect(wrapper.text()).toContain('数据流')
    expect(wrapper.text()).toContain('数据')
    const flowTab = wrapper.findAll('.el-tabs__item').find(item => item.text() === '数据流')
    expect(flowTab).toBeTruthy()
    await flowTab!.trigger('click')
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('工作流编码')
    expect(wrapper.text()).toMatch(/设计/)
    expect(wrapper.text()).toContain('保存')
    expect(wrapper.text()).toContain('同步元数据')
    expect(wrapper.text()).toContain('复制')
    expect(wrapper.text()).toContain('双击单元格编辑字段')
  })

  it('loads unregistered physical table names into add-table dialog hint', async () => {
    http.unregisteredByDb = {DB1: ['StagingOrders', 'RawArchive']}
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await selectDatabase(wrapper)
    await pageButton(wrapper, '新增').trigger('click')
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

  it('inserts catalog table row through add-table dialog confirm', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await selectDatabase(wrapper)
    await pageButton(wrapper, '新增').trigger('click')
    await flushPromises()
    await flushPromises()
    const body = new DOMWrapper(document.body)
    const dialog = body.findAll('.el-dialog').at(-1)!
    expect(dialog.text()).toContain('新增数据表')
    const nameItem = dialog.findAll('.el-form-item').find(item => item.text().includes('tblname'))
    expect(nameItem).toBeTruthy()
    const nameInput = nameItem!.find('input')
    await nameInput.setValue('CustOrders')
    await nameInput.trigger('input')
    await flushPromises()
    const ok = dialog.findAll('button').find(button => button.text() === '确定')
    await ok!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('数据表已新增')
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    expect(wrapper.text()).toContain('CustOrders')
  })

  it('opens add-table dialog with save and unregistered actions enabled', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await selectDatabase(wrapper)
    await pageButton(wrapper, '新增').trigger('click')
    await flushPromises()
    await flushPromises()
    const body = new DOMWrapper(document.body)
    expect(body.text()).toContain('新增数据表')
    expect(body.text()).toContain('数据库：业务库')
    const save = body.findAll('button').find(button => button.text() === '确定')
    const refresh = body.findAll('button').find(button => button.text() === '刷新未登记表名')
    expect(save).toBeTruthy()
    expect(refresh).toBeTruthy()
    expect(save!.element.hasAttribute('disabled')).toBe(false)
    expect(refresh!.element.hasAttribute('disabled')).toBe(false)
  })

  it('opens register dialog and loads unregistered tables for write command', async () => {
    http.unregisteredByDb = {DB1: ['StagingOrders']}
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await selectDatabase(wrapper)
    await pageButton(wrapper, '注册').trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    const body = new DOMWrapper(document.body)
    expect(body.text()).toContain('注册')
    expect(body.text()).toContain('数据库：业务库')
    expect(body.text()).toContain('StagingOrders')
    expect(http.requests.some(request => request.url === '/api/Db/getUnregisteredTable/DB1')).toBe(true)
  })

  it('registers selected unregistered view through register dialog confirm', async () => {
    http.unregisteredViewsByDb = {DB1: ['RawView']}
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await selectDatabase(wrapper)
    const viewsTab = wrapper.findAll('.el-tabs__item').find(item => item.text() === '视图')
    await viewsTab!.trigger('click')
    await flushPromises()
    await flushPromises()
    const registerOnViews = wrapper.findAll('button').filter(button => button.text() === '注册' && !button.element.hasAttribute('disabled')).at(-1)
    expect(registerOnViews).toBeTruthy()
    await registerOnViews!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    await flushPromises()
    const body = new DOMWrapper(document.body)
    const dialog = body.findAll('.el-dialog').at(-1)!
    expect(dialog.text()).toContain('视图')
    expect(http.requests.some(request => request.url === '/api/View/getUnregisteredView/DB1')).toBe(true)
    expect(dialog.text()).toContain('RawView')
    const row = dialog.find('.el-table__body-wrapper tbody tr')
    await row.trigger('click')
    await flushPromises()
    const confirm = dialog.findAll('button').find(button => button.text() === '确认')
    await confirm!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('视图已注册')
    expect(http.requests.some(request => request.url === '/api/View/registerView/DB1')).toBe(true)
    expect(wrapper.text()).toContain('RawView')
  })

  it('registers selected unregistered table through register dialog confirm', async () => {
    http.unregisteredByDb = {DB1: ['StagingOrders']}
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await selectDatabase(wrapper)
    await pageButton(wrapper, '注册').trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    const body = new DOMWrapper(document.body)
    const dialog = body.findAll('.el-dialog').at(-1)!
    const row = dialog.find('.el-table__body-wrapper tbody tr')
    expect(row.exists()).toBe(true)
    await row.trigger('click')
    await flushPromises()
    const confirm = dialog.findAll('button').find(button => button.text() === '确认')
    expect(confirm).toBeTruthy()
    await confirm!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('表已注册')
    expect(http.requests.some(request => request.url === '/api/Table/registerTable/DB1')).toBe(true)
    expect(wrapper.text()).toContain('StagingOrders')
  })

  it('opens view design dialog with design output and data tabs', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await selectDatabase(wrapper)
    const viewsTab = wrapper.findAll('.el-tabs__item').find(item => item.text() === '视图')
    expect(viewsTab).toBeTruthy()
    await viewsTab!.trigger('click')
    await flushPromises()
    await flushPromises()
    const tables = wrapper.findAllComponents(RendererTable)
    const viewList = tables.find(table => table.find('.el-table__body-wrapper').text().includes('OrderView'))
    expect(viewList).toBeTruthy()
    await viewList!.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    await flushPromises()
    await pageButton(wrapper, '视图设计').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('视图设计')
    expect(wrapper.text()).toContain('设计')
    expect(wrapper.text()).toContain('输出模型')
    expect(wrapper.text()).toContain('视图sql')
    expect(wrapper.text()).toContain('应用选择')
    expect(wrapper.text()).toContain('保存')
  })

  it('saves table design header through design save toolbar', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    const designDialog = await openTableDesignOnTable(wrapper, 'Orders')
    const tbldescItem = designDialog.findAll('.el-form-item').find(item => item.text().includes('中文名'))
    expect(tbldescItem).toBeTruthy()
    const tbldescInput = tbldescItem!.find('input')
    await tbldescInput.setValue('订单维护')
    await tbldescInput.trigger('input')
    await flushPromises()
    await designSaveButton(wrapper, designDialog).trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('已保存')
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    expect(wrapper.text()).toContain('订单维护')
  })

  it('saves field grid cnname edit through design save toolbar', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    const designDialog = await openTableDesignOnTable(wrapper, 'Orders')
    const cnInput = await setDesignFieldCnname(designDialog, 'Name', '名称列')
    await designSaveButton(wrapper, designDialog).trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('已保存')
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    const stored = http.rows[DATABASE_CATALOG_FIELD_MODEL]!.find(row => row['rowid'] === 'F2')
    expect(stored?.['cnname']).toBe('名称列')
    expect((cnInput.element as HTMLInputElement).value).toBe('名称列')
  })

  it('saves view output field grid cnname through design save toolbar', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    const designDialog = await openViewDesignOnView(wrapper, 'OrderView')
    const outputTab = wrapper.findAll('.el-tabs__item').find(item => item.text() === '输出模型')
    await outputTab!.trigger('click')
    await flushPromises()
    await flushPromises()
    const cnInput = await setDesignFieldCnname(designDialog, 'Total', '合计列')
    await designSaveButton(wrapper, designDialog).trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('已保存')
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    const stored = http.rows[DATABASE_CATALOG_FIELD_MODEL]!.find(row => row['rowid'] === 'F3')
    expect(stored?.['cnname']).toBe('合计列')
    expect((cnInput.element as HTMLInputElement).value).toBe('合计列')
  })

  it('shows workflow design stub message from table design data flow tab', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    const designDialog = await openTableDesignOnTable(wrapper, 'Orders')
    const flowTab = wrapper.findAll('.el-tabs__item').find(item => item.text() === '数据流')
    await flowTab!.trigger('click')
    await flushPromises()
    await flushPromises()
    const design = designDialog.findAll('button').find(button => button.text() === '设计')
    expect(design).toBeTruthy()
    await design!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('暂未实现')
  })

  it('loads physical table preview when table design data tab opens', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await openTableDesignOnTable(wrapper, 'Orders')
    const dataTab = wrapper.findAll('.el-tabs__item').find(item => item.text() === '数据')
    expect(dataTab).toBeTruthy()
    await dataTab!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(http.requests.some(request => {
      if (request.url !== '/api/DataOperation/GetData') return false
      const data = request.data as {Table?: Array<Record<string, unknown>>}
      const table = data.Table?.[0]
      return table?.['Type'] === '数据库表' && table?.['Name'] === 'Orders'
    })).toBe(true)
    expect(wrapper.text()).toContain('预览行一')
  })

  it('loads view preview when view design data tab opens', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await openViewDesignOnView(wrapper, 'OrderView')
    const dataTab = wrapper.findAll('.el-tabs__item').find(item => item.text() === '数据')
    await dataTab!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(http.requests.some(request => {
      if (request.url !== '/api/DataOperation/GetData') return false
      const data = request.data as {Table?: Array<Record<string, unknown>>}
      const table = data.Table?.[0]
      return table?.['Type'] === '数据库视图' && table?.['Name'] === 'OrderView'
    })).toBe(true)
    expect(wrapper.text()).toContain('100.00')
  })

  it('picks application for view design through application option dialog', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    const designDialog = await openViewDesignOnView(wrapper, 'OrderView')
    const pick = designDialog.findAll('button').find(button => button.text() === '...')
    expect(pick).toBeTruthy()
    await pick!.trigger('click')
    await flushPromises()
    const body = new DOMWrapper(document.body)
    const appDialog = body.findAll('.el-dialog').find(dialog => dialog.text().includes('选择应用'))!
    const appRow = appDialog.findAll('.el-table__body-wrapper tbody tr').find(row => row.text().includes('MainApp'))
    expect(appRow).toBeTruthy()
    await appRow!.trigger('click')
    await flushPromises()
    const ok = appDialog.findAll('button').find(button => button.text() === '确定')
    await ok!.trigger('click')
    await flushPromises()
    await flushPromises()
    expect((designDialog.find('.view-design-app-row__input').element as HTMLInputElement).value).toBe('主应用[MainApp]')
    const outputTab = wrapper.findAll('.el-tabs__item').find(item => item.text() === '输出模型')
    await outputTab!.trigger('click')
    await flushPromises()
    await designSaveButton(wrapper, designDialog).trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('已保存')
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
  })

  it('syncs table metadata from table design toolbar write command', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await openTableDesignOnTable(wrapper, 'Orders')
    const sync = wrapper.findAll('button').find(button => button.text() === '同步元数据' && !button.element.hasAttribute('disabled'))
    expect(sync).toBeTruthy()
    await sync!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('元数据已同步')
    expect(http.requests.some(request => request.url?.startsWith('/api/Table/SyncMetaData/'))).toBe(true)
    expect(wrapper.text()).toContain('SyncedCol')
  })

  it('deletes table relation from table design relations tab', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    const designDialog = await openTableDesignOnTable(wrapper, 'Orders')
    const relationsTab = wrapper.findAll('.el-tabs__item').find(item => item.text() === '关系')
    expect(relationsTab).toBeTruthy()
    await relationsTab!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('Orders.Id=Other.OrderId')
    const relationTable = wrapper.findAllComponents(RendererTable).find(table =>
      table.find('.el-table__body-wrapper').text().includes('Orders.Id=Other.OrderId'))
    expect(relationTable).toBeTruthy()
    await relationTable!.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    const toolbarButtons = wrapper.findAll('button')
    const editIndex = toolbarButtons.findIndex(button => button.text() === '编辑' && !button.element.hasAttribute('disabled'))
    expect(editIndex).toBeGreaterThanOrEqual(0)
    const deleteRelation = toolbarButtons.slice(editIndex + 1).find(button => button.text() === '删除' && !button.element.hasAttribute('disabled'))
    expect(deleteRelation).toBeTruthy()
    await deleteRelation!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('关系已删除')
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    expect(designDialog.text()).not.toContain('Orders.Id=Other.OrderId')
  })

  it('creates table relation through table design relation tab and dialog', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await openTableDesignOnTable(wrapper, 'Orders')
    const relationsTab = wrapper.findAll('.el-tabs__item').find(item => item.text() === '关系')
    expect(relationsTab).toBeTruthy()
    await relationsTab!.trigger('click')
    await flushPromises()
    await flushPromises()
    const body = new DOMWrapper(document.body)
    const designDialog = body.findAll('.el-dialog').find(dialog => dialog.text().includes('表设计') && dialog.text().includes('物理表：Orders'))!
    const addRelation = designDialog.findAll('button').find(button => button.text() === '新增')
    expect(addRelation).toBeTruthy()
    await addRelation!.trigger('click')
    await flushPromises()
    const dialog = body.findAll('.el-dialog').at(-1)!
    expect(dialog.text()).toContain('新增表关系')
    const peerSelect = dialog.findAll('select').at(-1)!
    expect(peerSelect.findAll('option').some(option => option.element.getAttribute('value') === 'T3')).toBe(true)
    await peerSelect.setValue('T3')
    await peerSelect.trigger('change')
    await flushPromises()
    const expr = dialog.find('input[placeholder="例如 Orders.Id=Other.OrderId"]')
    await expr.setValue('Orders.Id=LineItems.OrderId')
    await expr.trigger('input')
    const save = dialog.findAll('button').find(button => button.text() === '保存')
    expect(save).toBeTruthy()
    await save!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('表关系已保存')
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    expect(wrapper.text()).toContain('Orders.Id=LineItems.OrderId')
  })

  it('registers database through register database dialog', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await pageButton(wrapper, '注册数据库').trigger('click')
    await flushPromises()
    await flushPromises()
    const body = new DOMWrapper(document.body)
    const dialog = body.findAll('.el-dialog').at(-1)!
    expect(dialog.text()).toContain('注册数据库')
    const nameItem = dialog.findAll('.el-form-item').find(item => /\bName\b/.test(item.text()))
    expect(nameItem).toBeTruthy()
    const nameInput = nameItem!.find('input')
    expect(nameInput.exists()).toBe(true)
    await nameInput.setValue('spark_crm')
    const register = dialog.findAll('button').find(button => button.text() === '注册')
    expect(register).toBeTruthy()
    await register!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('数据库已注册')
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    expect(wrapper.text()).toContain('spark_crm')
  })

  it('deletes selected table through confirm dialog and saveChanges', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await selectDatabase(wrapper)
    const tables = wrapper.findAllComponents(RendererTable)
    const tableList = tables[1]!
    const lineRow = tableList.findAll('.el-table__body-wrapper tbody tr').find(row => row.text().includes('LineItems'))
    expect(lineRow).toBeTruthy()
    await lineRow!.trigger('click')
    await flushPromises()
    await flushPromises()
    await pageButton(wrapper, '删除').trigger('click')
    await flushPromises()
    const body = new DOMWrapper(document.body)
    const dialog = body.findAll('.el-dialog').at(-1)!
    expect(dialog.text()).toContain('确认删除表')
    expect(dialog.text()).toContain('LineItems')
    const confirm = dialog.findAll('button').find(button => button.text() === '删除')
    expect(confirm).toBeTruthy()
    await confirm!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('已删除')
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    expect(tableList.find('.el-table__body-wrapper').text()).not.toContain('LineItems')
  })

  it('deletes selected view through confirm dialog and saveChanges', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await selectDatabase(wrapper)
    const viewsTab = wrapper.findAll('.el-tabs__item').find(item => item.text() === '视图')
    await viewsTab!.trigger('click')
    await flushPromises()
    await flushPromises()
    const tables = wrapper.findAllComponents(RendererTable)
    const viewList = tables.find(table => table.find('.el-table__body-wrapper').text().includes('OrderView'))
    expect(viewList).toBeTruthy()
    await viewList!.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    await flushPromises()
    await enabledPageButton(wrapper, '删除').trigger('click')
    await flushPromises()
    const body = new DOMWrapper(document.body)
    const dialog = body.findAll('.el-dialog').at(-1)!
    expect(dialog.text()).toContain('确认删除视图')
    expect(dialog.text()).toContain('OrderView')
    const confirm = dialog.findAll('button').find(button => button.text() === '删除')
    await confirm!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('已删除')
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    expect(viewList!.find('.el-table__body-wrapper').text()).not.toContain('OrderView')
  })

  it('copies selected table through copy dialog and saveChanges', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await selectDatabase(wrapper)
    const tables = wrapper.findAllComponents(RendererTable)
    await tables[1]!.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    await flushPromises()
    await pageButton(wrapper, '复制').trigger('click')
    await flushPromises()
    const body = new DOMWrapper(document.body)
    expect(body.text()).toContain('复制表')
    expect(body.text()).toContain('源表：Orders')
    const nameInput = body.find('input[placeholder="请输入新表名"]')
    await nameInput.setValue('OrdersCopy')
    const descInput = body.find('textarea[placeholder="请输入描述"]')
    await descInput.setValue('复制订单')
    const save = body.findAll('button').find(button => button.text() === '保存')
    expect(save).toBeTruthy()
    await save!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('表已复制')
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    expect(wrapper.text()).toContain('OrdersCopy')
  })
})
