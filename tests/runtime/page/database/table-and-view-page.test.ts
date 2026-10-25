import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, DOMWrapper, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus, {ElSelect} from 'element-plus'
import {FieldCheckbox, FieldSelect, RendererFilterExpression, RendererForm, registerAllRenderers, RendererTable, Spark} from '@spark-appworks/spark-component'
import {buildDataViewKey, DataView, DataViewFilter, DataViewFilterCodec, RequestState, type DataRow} from '@spark-appworks/spark-data'
import TableAndViewPage from '@/views/features/data-platform/database-management/table-and-view/ui/table-and-view-page.vue'
import TableRelationDialog from '@/views/features/data-platform/database-management/table-and-view/ui/table-relation-dialog.vue'
import {DATABASE_CATALOG_COMMAND_INPUT_TABLE, DATABASE_CATALOG_FIELD_MODEL} from '@/lowcode/resources/database/lowcode-database-table-view'
import {DATABASE_CATALOG_DB_MODEL} from '@/lowcode/resources/database/lowcode-database-table-view'
import {
  DATABASE_TABLE_VIEW_SCENARIO_ID,
  DatabaseTableViewHttp,
  bootstrapDatabaseTableViewRuntime,
  databaseTableViewModels,
} from './database-table-view.fixture'
import {
  DATABASE_CATALOG_RELATION_MODEL,
  DATABASE_CATALOG_RELATION_TABLE_VIEW,
  DATABASE_CATALOG_TABLE_MODEL,
} from '@/lowcode/resources/database/lowcode-database-table-view'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import type {HttpResponse, RequestConfig} from '@spark-appworks/spark-utils'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'
import {LowcodeDatabaseTableView} from '@/lowcode/resources/database/lowcode-database-table-view'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: DatabaseTableViewHttp, runtime: DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, application: {get: () => null}, dataSpace: {design: service, get runtime() {return runtime}}},
}))

const wrappers: VueWrapper[] = []
const systemHosts: Array<ReturnType<typeof createDynamicRouter>> = []
const originalStubs = {...config.global.stubs}
// Build a formal SPARK relation expression and store it using the same codec contract
// verified against the non-null service readback (JSON string with Type/Filters nodes).
const relationFilter = (marker: string) => DataViewFilterCodec.serializeStored(DataViewFilter.group({logic: 'and', filters: [
  {field: 'LineItems.Id', operator: 'eq', value: {Type: 'GetTableField', Field: 'Orders.Id'}},
  {field: 'LineItems.Name', operator: 'eq', value: marker},
]}))
const genericJsonPayload = (marker: string) => ({fixture: 'generic-json-save-path', marker})

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
  systemHosts.splice(0).forEach(dynamic => dynamic.resetSystemPageInstances())
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

async function open(scenarioId: string, query: Record<string, string | string[]> = {}): Promise<VueWrapper> {
  return (await openAsSystemPage(scenarioId, query)).wrapper
}

async function openAsSystemPage(scenarioId: string, query: Record<string, string | string[]> = {}): Promise<Readonly<{wrapper: VueWrapper; dynamic: ReturnType<typeof createDynamicRouter>}>> {
  const router = createRouter({history: createMemoryHistory(), routes: []})
  const dynamic = createDynamicRouter({router, pageComponent: TableAndViewPage, componentMap: {
    '/features/data-platform/database-management/table-and-view/ui/table-and-view-page': TableAndViewPage,
  }, loadNavigation: async () => ({title: 'Root', childPlacement: 'sidebar', items: [{
    id: 'table-view', title: '表和视图管理', path: '/features/data-platform/database-management/table-and-view/ui/table-and-view-page',
    itemKind: 'system-page', blueprintScenarioId: scenarioId,
  }]})})
  systemHosts.push(dynamic)
  await dynamic.registerRoutes()
  await router.push({path: '/features/data-platform/database-management/table-and-view/ui/table-and-view-page', query})
  await router.isReady()
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {
    attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]},
  })
  wrappers.push(wrapper)
  await flushPromises()
  await flushPromises()
  return {wrapper, dynamic}
}

async function openRelationWorkspace(tableName = 'Orders') {
  const load = vi.spyOn(LowcodeDatabaseTableView, 'loadCatalog')
  const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
  const dataSet = await load.mock.results[0]?.value
  if (!dataSet) throw new Error('真实页面未装配目录 DataSet')
  const designDialog = await openTableDesignOnTable(wrapper, tableName)
  const relationsTab = wrapper.findAll('.el-tabs__item').find(item => item.text() === '关系')
  if (!relationsTab) throw new Error('表设计缺少关系页签')
  await relationsTab.trigger('click')
  await flushPromises()
  await flushPromises()
  const relationView = dataSet.getView(DATABASE_CATALOG_RELATION_MODEL, DATABASE_CATALOG_RELATION_TABLE_VIEW)
  if (!relationView) throw new Error('真实 DataSet 缺少 Base_TblRln@forTable')
  return {wrapper, dataSet, designDialog, relationView}
}

async function fillNewRelationDialog(dialog: DOMWrapper<Element>, name: string, peerId = 'T3'): Promise<void> {
  const peerField = dialog.findComponent(FieldSelect)
  expect(peerField.exists()).toBe(true)
  peerField.getComponent(ElSelect).vm.$emit('update:modelValue', peerId)
  await flushPromises()
  const nameInput = dialog.findAll('input').find(input => input.element.getAttribute('placeholder') === '请输入关系名称')
  expect(nameInput).toBeTruthy()
  await nameInput!.setValue(name)
  await flushPromises()
}

describe('table-and-view-page', () => {
  it('uses only formally output fields in field-view sorting when ordIdx is unavailable', async () => {
    service.readModel.mockImplementation(({metaName}: {metaName: string}) => {
      const found = databaseTableViewModels[metaName as keyof typeof databaseTableViewModels]
      if (!found) throw new Error(`unexpected model ${metaName}`)
      if (metaName !== DATABASE_CATALOG_FIELD_MODEL) return Promise.resolve(found)
      return Promise.resolve({...found, fields: found.fields.map(field => field.name === 'ordIdx'
        ? {...field, output: false}
        : field)})
    })
    const dataSet = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    try {
      const fieldView = dataSet.getView(DATABASE_CATALOG_FIELD_MODEL, 'tableFields')
      const outputFields = databaseTableViewModels[DATABASE_CATALOG_FIELD_MODEL].fields
        .filter(field => field.name !== 'ordIdx').map(field => field.name)
      expect(fieldView?.sortExpression?.every(item => outputFields.includes(item.field))).toBe(true)
    } finally {
      dataSet.destroy()
    }
  })

  it('uses canonical output names and the formal primary key when sorting field views', async () => {
    service.readModel.mockImplementation(({metaName}: {metaName: string}) => {
      const found = databaseTableViewModels[metaName as keyof typeof databaseTableViewModels]
      if (!found) throw new Error(`unexpected model ${metaName}`)
      if (metaName !== DATABASE_CATALOG_FIELD_MODEL) return Promise.resolve(found)
      return Promise.resolve({...found, fields: found.fields.map(field => field.name === 'ordIdx'
        ? {...field, canonicalName: 'sortPosition'}
        : field)})
    })
    const dataSet = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    try {
      const fieldView = dataSet.getView(DATABASE_CATALOG_FIELD_MODEL, 'tableFields')
      expect(fieldView?.sortExpression).toEqual([
        {field: 'sortPosition', direction: 'asc'},
        {field: 'rowid', direction: 'asc'},
      ])
    } finally {
      dataSet.destroy()
    }
  })

  it('registers its DataView draft with the actual system-page host before allowing close', async () => {
    const load = vi.spyOn(LowcodeDatabaseTableView, 'loadCatalog')
    const {wrapper, dynamic} = await openAsSystemPage(DATABASE_TABLE_VIEW_SCENARIO_ID)
    const dataSet = await load.mock.results[0]?.value
    const route = wrapper.vm.$router.currentRoute.value
    const instance = dynamic.getSystemPageInstance(route)
    const databaseView = dataSet?.getView(DATABASE_CATALOG_DB_MODEL, 'default')
    const row = databaseView?.rows[0]
    expect(instance).toBeTruthy()
    expect(databaseView && row).toBeTruthy()
    const id = databaseView!.getPkKey(row!)
    databaseView!.updateEditingValue(id, 'Remark', '待清理草稿')
    expect(dynamic.getSystemPageInstanceById(instance!.instanceId)?.isDirty).toBe(true)
    expect(() => dynamic.closeSystemPageInstance(instance!.instanceId)).toThrow('未保存')
    databaseView!.discardEditingRows([id])
    expect(dynamic.getSystemPageInstanceById(instance!.instanceId)?.isDirty).toBe(false)
    dynamic.closeSystemPageInstance(instance!.instanceId)
    expect(dynamic.getSystemPageInstanceById(instance!.instanceId)).toBeUndefined()
  })

  it('loads catalog tables with autoColumns when blueprintScenarioId is bound', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    expect(wrapper.text()).toContain('表和视图')
    expect(http.requests.some(request => JSON.stringify(request.data).includes('_base_dbInfo'))).toBe(true)
    const table = wrapper.findComponent(RendererTable)
    expect(table.exists()).toBe(true)
    expect(table.find('.el-table__header-wrapper').text()).toContain('Name')
    expect(table.find('.el-table__body-wrapper').text()).toContain('业务库')
  })

  it('starts the database DataView with the same autoQuery identity used by the standard filter', async () => {
    let queryConfigAtLoad: unknown
    const originalLoad = LowcodeDatabaseTableView.loadCatalog
    const load = vi.spyOn(LowcodeDatabaseTableView, 'loadCatalog').mockImplementation(async (...args) => {
      const dataSet = await originalLoad.call(LowcodeDatabaseTableView, ...args)
      queryConfigAtLoad = dataSet.getView(DATABASE_CATALOG_DB_MODEL, 'default')?.queryConfig
      return dataSet
    })
    await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    const dataSet = await load.mock.results[0]?.value
    const databaseView = dataSet?.getView(DATABASE_CATALOG_DB_MODEL, 'default')
    expect(queryConfigAtLoad).toMatchObject({allPages: false, autoQuery: true})
    expect(databaseView?.queryConfig).toEqual(queryConfigAtLoad)
  })

  it('uses the directory single-database selection contract without rendering a multi-select checkbox column', async () => {
    const load = vi.spyOn(LowcodeDatabaseTableView, 'loadCatalog')
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    const dataSet = await load.mock.results[0]?.value
    const databaseView = dataSet?.getView(DATABASE_CATALOG_DB_MODEL, 'default')
    expect(databaseView?.selectionDelimiter).toBe('')
    expect(databaseView?.isMultiSelect).toBe(false)
    expect(wrapper.findAllComponents(RendererTable)[0]!.find('.el-table-column--selection').exists()).toBe(false)
  })

  it('queries and selects a specified database through the DataView primary-key filter', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID, {databaseId: 'DB1'})
    expect(wrapper.find('.el-alert').exists() ? wrapper.find('.el-alert').text() : wrapper.text()).not.toContain('唯一命中')
    const dbRequest = http.requests.find(request => request.url === '/api/DataOperation/GetData'
      && JSON.stringify(request.data).includes('_base_dbInfo'))
    expect(dbRequest).toBeTruthy()
    expect(JSON.stringify((dbRequest?.data as {Table: unknown[]}).Table[0])).toContain('DB1')
    expect(wrapper.findAllComponents(RendererTable)[0]?.find('.el-table__body-wrapper').text()).toContain('业务库')
  })

  it('loads table and view DataViews for the databaseId target on first page entry', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID, {databaseId: 'DB1'})
    await flushPromises()
    const childRequest = http.requests.find(request => request.url === '/api/DataOperation/GetData'
      && (request.data as {Table?: Array<{Name?: string}>}).Table?.some(table => table.Name === DATABASE_CATALOG_TABLE_MODEL))
    expect(childRequest, 'databaseId entry must query the formal table DataView owner').toBeTruthy()
    const requestTable = (childRequest?.data as {Table: Array<{Name?: string; Filter?: unknown}>}).Table
      .find(table => table.Name === DATABASE_CATALOG_TABLE_MODEL)
    expect(JSON.stringify(requestTable?.Filter)).toContain('DB1')
    const tableList = wrapper.findAllComponents(RendererTable)[1]
    expect(tableList?.find('.el-table__body-wrapper').text()).toContain('Orders')
    expect(tableList?.find('.el-table__body-wrapper').text()).toContain('LineItems')
    expect(tableList?.find('.el-table__body-wrapper').text()).not.toContain('Other')
  })

  it('requeries the formal child DataView owner when the databaseId route parameter changes', async () => {
    http.rows[DATABASE_CATALOG_DB_MODEL]!.push({rowid: 'DB2', serverId: 'S1', Name: '次库', ServerName: '主库', SchemaName: 'dbo', Remark: ''})
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID, {databaseId: 'DB1'})
    await wrapper.vm.$router.replace({query: {databaseId: 'DB2'}})
    await flushPromises()
    await flushPromises()
    const childRequests = http.requests.filter(request => request.url === '/api/DataOperation/GetData'
      && (request.data as {Table?: Array<{Name?: string}>}).Table?.some(table => table.Name === DATABASE_CATALOG_TABLE_MODEL))
    const tableFilters = childRequests.map(request => (request.data as {Table: Array<{Name?: string; Filter?: unknown}>}).Table
      .find(table => table.Name === DATABASE_CATALOG_TABLE_MODEL)?.Filter)
    expect(tableFilters).toHaveLength(2)
    expect(JSON.stringify(tableFilters[0])).toContain('DB1')
    expect(JSON.stringify(tableFilters[1])).toContain('DB2')
    const tableList = wrapper.findAllComponents(RendererTable)[1]
    expect(tableList?.find('.el-table__body-wrapper').text()).toContain('Other')
    expect(tableList?.find('.el-table__body-wrapper').text()).not.toContain('Orders')
  })

  it('does not query fields without a selected table and clears the old field result on database switch', async () => {
    http.rows[DATABASE_CATALOG_DB_MODEL]!.push({rowid: 'DB2', serverId: 'S1', Name: '次库', ServerName: '主库', SchemaName: 'dbo', Remark: ''})
    const load = vi.spyOn(LowcodeDatabaseTableView, 'loadCatalog')
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    const dataSet = await load.mock.results[0]?.value
    const fields = dataSet?.getView(DATABASE_CATALOG_FIELD_MODEL, 'tableFields')
    const tables = dataSet?.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')
    expect(fields && tables).toBeTruthy()
    const queryCount = (modelName: string) => http.requests.filter(request => request.url === '/api/DataOperation/GetData'
      && (request.data as {Table?: Array<{Name?: string}>}).Table?.some(table => table.Name === modelName)).length
    const databaseList = wrapper.findAllComponents(RendererTable)[0]!
    const dbRows = databaseList.findAll('.el-table__body-wrapper tbody tr')
    expect(dbRows).toHaveLength(2)
    await dbRows[0]!.trigger('click')
    await flushPromises()
    await flushPromises()
    const fieldsAfterDatabaseSelection = queryCount(DATABASE_CATALOG_FIELD_MODEL)
    const tableList = wrapper.findAllComponents(RendererTable)[1]!
    const ordersRow = tableList.findAll('.el-table__body-wrapper tbody tr').find(row => row.text().includes('Orders'))
    expect(ordersRow).toBeTruthy()
    await ordersRow!.trigger('click')
    await flushPromises()
    await flushPromises()
    expect(fields!.rows.some((row: DataRow) => row['enname'] === 'Name')).toBe(true)
    const fieldsBeforeDatabaseSwitch = queryCount(DATABASE_CATALOG_FIELD_MODEL)
    const refreshedDatabaseRows = wrapper.findAllComponents(RendererTable)[0]!.findAll('.el-table__body-wrapper tbody tr')
    await refreshedDatabaseRows[1]!.trigger('click')
    await flushPromises()
    await flushPromises()
    const fieldsAfterDatabaseSwitch = queryCount(DATABASE_CATALOG_FIELD_MODEL)
    expect(queryCount(DATABASE_CATALOG_TABLE_MODEL)).toBeGreaterThanOrEqual(2)
    expect.soft(fieldsAfterDatabaseSelection, 'database selection without a table must not issue a field query').toBe(0)
    expect(fieldsBeforeDatabaseSwitch).toBeGreaterThan(0)
    expect.soft(fieldsAfterDatabaseSwitch, 'switching to another database without a selected table must not issue a parentless field query')
      .toBe(fieldsBeforeDatabaseSwitch)
    expect(tables!.getSelectedValues()).toEqual([])
    expect(fields!.rows).toEqual([])
    expect(wrapper.text()).toContain('选择一张表或视图以查看字段目录。')
  })

  it('does not show or refresh the view-field DataView when changing tabs without a selected view', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID, {databaseId: 'DB1'})
    const tableList = wrapper.findAllComponents(RendererTable)[1]!
    const ordersRow = tableList.findAll('.el-table__body-wrapper tbody tr').find(row => row.text().includes('Orders'))
    expect(ordersRow).toBeTruthy()
    await ordersRow!.trigger('click')
    await flushPromises()
    await flushPromises()
    const fieldRequestCount = http.requests.filter(request => request.url === '/api/DataOperation/GetData'
      && (request.data as {Table?: Array<{Name?: string}>}).Table?.some(table => table.Name === DATABASE_CATALOG_FIELD_MODEL)).length

    const viewsTab = wrapper.findAll('.el-tabs__item').find(item => item.text() === '视图')
    expect(viewsTab).toBeTruthy()
    await viewsTab!.trigger('click')
    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('选择一张表或视图以查看字段目录。')
    expect(wrapper.findAllComponents(RendererTable)).toHaveLength(3)
    expect(http.requests.filter(request => request.url === '/api/DataOperation/GetData'
      && (request.data as {Table?: Array<{Name?: string}>}).Table?.some(table => table.Name === DATABASE_CATALOG_FIELD_MODEL))).toHaveLength(fieldRequestCount)
  })

  it('keeps current database/table selection and the field draft when a real row click cannot replace dirty results', async () => {
      http.rows[DATABASE_CATALOG_DB_MODEL]!.push({rowid: 'DB2', serverId: 'S1', Name: '次库', ServerName: '主库', SchemaName: 'dbo', Remark: ''})
      const load = vi.spyOn(LowcodeDatabaseTableView, 'loadCatalog')
      const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
      const dataSet = await load.mock.results[0]?.value
      const dbView = dataSet?.getView(DATABASE_CATALOG_DB_MODEL, 'default')
      const tableView = dataSet?.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')
      const fields = dataSet?.getView(DATABASE_CATALOG_FIELD_MODEL, 'tableFields')
      expect(dbView && tableView && fields).toBeTruthy()

      const initialDatabaseRows = wrapper.findAllComponents(RendererTable)[0]!.findAll('.el-table__body-wrapper tbody tr')
      await initialDatabaseRows[0]!.trigger('click')
      await flushPromises()
      await flushPromises()
      await flushPromises()
      const ordersRow = wrapper.findAllComponents(RendererTable)[1]!.findAll('.el-table__body-wrapper tbody tr')
        .find(row => row.text().includes('Orders'))
      expect(ordersRow).toBeTruthy()
      await ordersRow!.trigger('click')
      await flushPromises()
      await flushPromises()
      const fieldRow = fields!.rows.find((row: DataRow) => row['enname'] === 'Name')
      expect(fieldRow).toBeTruthy()
      fields!.updateEditingValue(fields!.getPkKey(fieldRow!), 'cnname', '保留的字段草稿')
      const previousDbCurrent = dbView!.currentRow
      const previousTableCurrent = tableView!.currentRow
      const previousFieldRows = [...fields!.rows]
      const databaseQueriesBefore = http.requests.filter(request => request.url === '/api/DataOperation/GetData'
        && (request.data as {Table?: Array<{Name?: string}>}).Table?.some(table => table.Name === DATABASE_CATALOG_DB_MODEL)).length
      const databaseTable = wrapper.findAllComponents(RendererTable)[0]!
      const databaseRows = databaseTable.findAll('.el-table__body-wrapper tbody tr')
      expect(databaseRows[0]!.classes()).toContain('current-row')
      const nextDatabaseRow = databaseRows[1]!
      await nextDatabaseRow.trigger('click')
      await flushPromises()
      await flushPromises()

      expect(dbView!.currentRow?.['rowid']).toBe(previousDbCurrent?.['rowid'])
      expect(dbView!.getSelectedValues()).toEqual(['DB1'])
      expect(tableView!.currentRow?.['rowid']).toBe(previousTableCurrent?.['rowid'])
      expect(tableView!.getSelectedValues()).toEqual(['T1'])
      expect(fields!.rows).toEqual(previousFieldRows)
      expect(fields!.getEditingRow(fields!.getPkKey(fieldRow!))?.['cnname']).toBe('保留的字段草稿')
      expect(databaseTable.findAll('.el-table__body-wrapper tbody tr')[0]!.classes()).toContain('current-row')
      expect(databaseTable.findAll('.el-table__body-wrapper tbody tr')[1]!.classes()).not.toContain('current-row')
      expect(http.requests.filter(request => request.url === '/api/DataOperation/GetData'
        && (request.data as {Table?: Array<{Name?: string}>}).Table?.some(table => table.Name === DATABASE_CATALOG_DB_MODEL))).toHaveLength(databaseQueriesBefore)
  })

  it('preserves the selected database after an unknown field save and verifies the original capture without resubmitting', async () => {
    http.rows[DATABASE_CATALOG_DB_MODEL]!.push({rowid: 'DB2', serverId: 'S1', Name: '次库', ServerName: '主库', SchemaName: 'dbo', Remark: ''})
    const load = vi.spyOn(LowcodeDatabaseTableView, 'loadCatalog')
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    const dataSet = await load.mock.results[0]?.value
    const dbView = dataSet?.getView(DATABASE_CATALOG_DB_MODEL, 'default')
    const tableView = dataSet?.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')
    const fields = dataSet?.getView(DATABASE_CATALOG_FIELD_MODEL, 'tableFields')
    expect(dbView && tableView && fields).toBeTruthy()
    await selectDatabase(wrapper)
    await selectPhysicalTableByName(wrapper, 'Orders')
    const fieldRow = fields!.rows.find((row: DataRow) => row['enname'] === 'Name')
    expect(fieldRow).toBeTruthy()
    fields!.updateEditingValue(fields!.getPkKey(fieldRow!), 'cnname', '由原查询捕获核验')

    const requestOwner = http as unknown as {executeRequest: (config: RequestConfig) => Promise<HttpResponse<unknown>>}
    const originalExecute = requestOwner.executeRequest.bind(http)
    requestOwner.executeRequest = async config => {
      const response = await originalExecute(config)
      if (config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
        throw new Error('保存请求发出后连接中断')
      }
      return response
    }
    await expect(dataSet!.saveChanges({views: [{tableName: DATABASE_CATALOG_FIELD_MODEL, viewId: 'tableFields'}]}))
      .rejects.toThrow('保存请求发出后连接中断')
    expect(fields!.hasUnconfirmedSave).toBe(true)
    const writeCountBeforeSwitch = http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD').length
    const databaseRows = wrapper.findAllComponents(RendererTable)[0]!.findAll('.el-table__body-wrapper tbody tr')
    await databaseRows[1]!.trigger('click')
    await flushPromises()
    await flushPromises()

    expect.soft(dbView!.getSelectedValues()).toEqual(['DB1'])
    expect.soft(tableView!.getSelectedValues()).toEqual(['T1'])
    expect.soft(fields!.hasUnconfirmedSave).toBe(true)
    expect.soft(http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(writeCountBeforeSwitch)
    expect(fields!.rows.find((row: DataRow) => row['rowid'] === fields!.getPkKey(fieldRow!))?.['cnname']).toBe('由原查询捕获核验')

    requestOwner.executeRequest = originalExecute
    await expect(dataSet!.saveChanges({views: [{tableName: DATABASE_CATALOG_FIELD_MODEL, viewId: 'tableFields'}]})).resolves.toMatchObject({success: true})
    expect(fields!.hasUnconfirmedSave).toBe(false)
    expect(http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(writeCountBeforeSwitch)
  })

  it('drops a late child query from the previous database after a real database switch', async () => {
    http.rows[DATABASE_CATALOG_DB_MODEL]!.push({rowid: 'DB2', serverId: 'S1', Name: '次库', ServerName: '主库', SchemaName: 'dbo', Remark: ''})
    const load = vi.spyOn(LowcodeDatabaseTableView, 'loadCatalog')
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    const dataSet = await load.mock.results[0]?.value
    const dbView = dataSet?.getView(DATABASE_CATALOG_DB_MODEL, 'default')
    const tableView = dataSet?.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')
    expect(dbView && tableView).toBeTruthy()

    let markFirstRequestStarted!: () => void
    let releaseFirstRequest!: () => void
    const firstRequestStarted = new Promise<void>(resolve => {markFirstRequestStarted = resolve})
    const firstRequestGate = new Promise<void>(resolve => {releaseFirstRequest = resolve})
    const requestOwner = http as unknown as {executeRequest: (config: RequestConfig) => Promise<HttpResponse<unknown>>}
    const originalExecute = requestOwner.executeRequest.bind(http)
    let heldFirstDatabaseQuery = false
    requestOwner.executeRequest = async config => {
      const response = await originalExecute(config)
      const request = config as {url?: string; data?: {Table?: Array<{Name?: string; Filter?: unknown}>}}
      const table = request.data?.Table?.find(item => item.Name === DATABASE_CATALOG_TABLE_MODEL)
      if (!heldFirstDatabaseQuery && request.url === '/api/DataOperation/GetData' && (JSON.stringify(table?.Filter) ?? '').includes('DB1')) {
        heldFirstDatabaseQuery = true
        markFirstRequestStarted()
        await firstRequestGate
      }
      return response
    }

    const databaseRows = wrapper.findAllComponents(RendererTable)[0]!.findAll('.el-table__body-wrapper tbody tr')
    const pendingSelection = databaseRows[0]!.trigger('click')
    await firstRequestStarted
    const nextDatabaseRow = wrapper.findAllComponents(RendererTable)[0]!.findAll('.el-table__body-wrapper tbody tr')
      .find(row => row.text().includes('次库'))
    expect(nextDatabaseRow).toBeTruthy()
    await nextDatabaseRow!.trigger('click')
    await flushPromises()
    await flushPromises()
    expect(http.requests.some(request => request.url === '/api/DataOperation/GetData'
      && (JSON.stringify((request.data as {Table?: Array<{Name?: string; Filter?: unknown}>}).Table?.find(table => table.Name === DATABASE_CATALOG_TABLE_MODEL)?.Filter) ?? '').includes('DB2')))
      .toBe(true)
    releaseFirstRequest()
    await pendingSelection
    await flushPromises()
    await flushPromises()

    expect(dbView!.getSelectedValues()).toEqual(['DB2'])
    expect(tableView!.rows.map((row: DataRow) => row['dbid'])).toEqual(['DB2'])
    expect(tableView!.rows.map((row: DataRow) => row['tblname'])).toEqual(['Other'])
    expect(wrapper.findAllComponents(RendererTable)[1]!.find('.el-table__body-wrapper').text()).toContain('Other')
    expect(wrapper.findAllComponents(RendererTable)[1]!.find('.el-table__body-wrapper').text()).not.toContain('Orders')
  })

  it('does not publish a late field query after a real database switch clears the selected table', async () => {
    http.rows[DATABASE_CATALOG_DB_MODEL]!.push({rowid: 'DB2', serverId: 'S1', Name: '次库', ServerName: '主库', SchemaName: 'dbo', Remark: ''})
    const load = vi.spyOn(LowcodeDatabaseTableView, 'loadCatalog')
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    const dataSet = await load.mock.results[0]?.value
    const dbView = dataSet?.getView(DATABASE_CATALOG_DB_MODEL, 'default')
    const tableView = dataSet?.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')
    const fields = dataSet?.getView(DATABASE_CATALOG_FIELD_MODEL, 'tableFields')
    expect(fields).toBeTruthy()

    let markFieldRequestStarted!: () => void
    let releaseFieldRequest!: () => void
    const fieldRequestStarted = new Promise<void>(resolve => {markFieldRequestStarted = resolve})
    const fieldRequestGate = new Promise<void>(resolve => {releaseFieldRequest = resolve})
    const requestOwner = http as unknown as {executeRequest: (config: RequestConfig) => Promise<HttpResponse<unknown>>}
    const originalExecute = requestOwner.executeRequest.bind(http)
    let heldFieldRequest = false
    requestOwner.executeRequest = async config => {
      const response = await originalExecute(config)
      const request = config as {url?: string; data?: {Table?: Array<{Name?: string; Filter?: unknown}>}}
      const table = request.data?.Table?.find(item => item.Name === DATABASE_CATALOG_FIELD_MODEL)
      if (!heldFieldRequest && request.url === '/api/DataOperation/GetData' && (JSON.stringify(table?.Filter) ?? '').includes('T1')) {
        heldFieldRequest = true
        markFieldRequestStarted()
        await fieldRequestGate
      }
      return response
    }

    const databaseRows = wrapper.findAllComponents(RendererTable)[0]!.findAll('.el-table__body-wrapper tbody tr')
    await databaseRows[0]!.trigger('click')
    await flushPromises()
    await flushPromises()
    const ordersRow = wrapper.findAllComponents(RendererTable)[1]!.findAll('.el-table__body-wrapper tbody tr')
      .find(row => row.text().includes('Orders'))
    expect(ordersRow).toBeTruthy()
    const pendingFieldSelection = ordersRow!.trigger('click')
    await fieldRequestStarted
    const nextDatabaseRow = wrapper.findAllComponents(RendererTable)[0]!.findAll('.el-table__body-wrapper tbody tr')
      .find(row => row.text().includes('次库'))
    expect(nextDatabaseRow).toBeTruthy()
    await nextDatabaseRow!.trigger('click')
    await flushPromises()
    await flushPromises()
    releaseFieldRequest()
    await pendingFieldSelection
    await flushPromises()
    await flushPromises()

    expect(dbView?.getSelectedValues()).toEqual(['DB2'])
    expect(tableView?.getSelectedValues()).toEqual([])
    expect(fields!.rows).toEqual([])
    expect(wrapper.text()).toContain('选择一张表或视图以查看字段目录。')
  })

  it('fails when the requested database primary key does not resolve uniquely', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID, {databaseId: 'MISSING-DB'})
    expect(wrapper.text()).toContain('指定 databaseId 未在当前数据库目录中唯一命中')
    const dbRequest = http.requests.find(request => request.url === '/api/DataOperation/GetData'
      && JSON.stringify(request.data).includes('_base_dbInfo'))
    expect(JSON.stringify((dbRequest?.data as {Table: Array<{Filter: unknown}>}).Table[0]?.Filter)).toContain('MISSING-DB')
  })

  it('uses the formal database primary key for the server query when it is not rowid', async () => {
    http.databasePrimaryKey = 'Id'
    http.rows[DATABASE_CATALOG_DB_MODEL]![0]!['Id'] = 'DB-PK-1'
    const dbModel = databaseTableViewModels[DATABASE_CATALOG_DB_MODEL]
    service.readModel.mockImplementation(({metaName}: {metaName: string}) => Promise.resolve(metaName === DATABASE_CATALOG_DB_MODEL
      ? {...dbModel, primaryKey: 'Id', fields: dbModel.fields.map(field => ({...field, primaryKey: field.name === 'Id'}))}
      : databaseTableViewModels[metaName as keyof typeof databaseTableViewModels]))
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID, {databaseId: 'DB-PK-1'})
    const dbRequest = http.requests.find(request => request.url === '/api/DataOperation/GetData'
      && JSON.stringify(request.data).includes('_base_dbInfo'))
    expect(JSON.stringify((dbRequest?.data as {Table: Array<{Filter: unknown}>}).Table[0]?.Filter)).toContain('DB-PK-1')
    expect(wrapper.findAllComponents(RendererTable)[0]?.find('.el-table__body-wrapper').text()).toContain('业务库')
  })

  it.each([
    ['empty databaseId', ''],
    ['repeated databaseId', ['DB1', 'DB1']],
  ])('rejects %s before loading a catalog', async (_label, databaseId) => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID, {databaseId})
    expect(wrapper.text()).toContain('databaseId 参数必须是唯一的非空数据库主键')
    expect(http.requests.some(request => request.url === '/api/DataOperation/GetData')).toBe(false)
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
    expect(((http.requests.find(request => request.url === '/api/Table/registerTable/DB1')?.data as Array<{hasDefaultFields: number}>)[0]?.hasDefaultFields)).toBe(1)
    expect(wrapper.text()).toContain('StagingOrders')
  })

  it('keeps an unknown batch open and exposes explicit verification without allowing close or replay', async () => {
    http.unregisteredByDb = {DB1: ['UnknownAfterSubmit']}
    http.applyThenFailRegisterTableNames.add('UnknownAfterSubmit')
    http.failCatalogReadAfterRegisterNames.add('UnknownAfterSubmit')
    const load = vi.spyOn(LowcodeDatabaseTableView, 'loadCatalog')
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await selectDatabase(wrapper)
    await pageButton(wrapper, '注册').trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    const body = new DOMWrapper(document.body)
    let dialog = body.findAll('.el-dialog').at(-1)!
    const defaultFieldsField = dialog.findComponent(FieldCheckbox)
    expect(defaultFieldsField.exists()).toBe(true)
    expect(defaultFieldsField.find('.el-checkbox').classes()).toContain('is-checked')
    expect(defaultFieldsField.find('.el-checkbox').classes()).not.toContain('is-disabled')
    await defaultFieldsField.find('.el-checkbox').trigger('click')
    await flushPromises()
    expect(defaultFieldsField.find('.el-checkbox').classes()).not.toContain('is-checked')
    await dialog.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    await dialog.findAll('button').find(button => button.text() === '确认')!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    dialog = body.findAll('.el-dialog').at(-1)!

    expect(dialog.exists()).toBe(true)
    expect.soft(dialog.findAll('button').find(button => button.text() === '核验保存结果'), 'unknown batch must expose explicit recovery').toBeTruthy()
    expect.soft(dialog.findAll('button').find(button => button.text() === '取消'), 'unknown batch must not expose a close action').toBeUndefined()
    expect.soft(dialog.findAll('button').find(button => button.text() === '刷新列表')?.element.hasAttribute('disabled'), 'unknown batch must not replace the selected list').toBe(true)
    expect.soft(dialog.findComponent(FieldCheckbox).find('.el-checkbox').classes(), 'unknown batch must freeze its captured option').toContain('is-disabled')
    expect.soft(http.requests.filter(request => request.url === '/api/Table/registerTable/DB1'), 'verification must not replay the POST').toHaveLength(1)

    await dialog.findAll('button').find(button => button.text() === '核验保存结果')!.trigger('click')
    await flushPromises()
    await flushPromises()
    await dialog.findAll('button').find(button => button.text() === '核验保存结果')!.trigger('click')
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('已核验当前注册结果')
    expect(http.requests.filter(request => request.url === '/api/Table/registerTable/DB1')).toHaveLength(1)
    expect((http.requests.find(request => request.url === '/api/Table/registerTable/DB1')?.data as Array<{hasDefaultFields: number}>)[0]?.hasDefaultFields).toBe(0)
    const dataSet = await load.mock.results[0]?.value
    const commandInput = dataSet?.getView(DATABASE_CATALOG_COMMAND_INPUT_TABLE, 'default')
    expect(commandInput?.hasEditingChanges()).toBe(true)
    await dialog.findAll('button').find(button => button.text() === '取消')!.trigger('click')
    await flushPromises()
    expect(commandInput?.rows[0]?.['addDefaultFields']).toBe('0')
    expect(commandInput?.hasEditingChanges()).toBe(false)
    expect(commandInput?.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('freezes the captured option while a known-failed batch awaits retry or cancel', async () => {
    http.unregisteredByDb = {DB1: ['RejectedRegistration']}
    http.registerTableResult = {RejectedRegistration: '表不存在'}
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await selectDatabase(wrapper)
    await pageButton(wrapper, '注册').trigger('click')
    await flushPromises()
    await flushPromises()
    const body = new DOMWrapper(document.body)
    let dialog = body.findAll('.el-dialog').at(-1)!
    const option = dialog.findComponent(FieldCheckbox)
    await option.find('.el-checkbox').trigger('click')
    await flushPromises()
    await dialog.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    await dialog.findAll('button').find(button => button.text() === '确认')!.trigger('click')
    await flushPromises()
    await flushPromises()
    dialog = body.findAll('.el-dialog').at(-1)!

    expect(wrapper.text()).toContain('明确失败，可重试')
    expect(dialog.findComponent(FieldCheckbox).find('.el-checkbox').classes()).not.toContain('is-checked')
    expect(dialog.findComponent(FieldCheckbox).find('.el-checkbox').classes()).toContain('is-disabled')
    expect(dialog.findAll('button').find(button => button.text() === '继续未完成项')).toBeTruthy()
    expect(dialog.findAll('button').find(button => button.text() === '取消未完成项')).toBeTruthy()
  })

  it('requires cancellation instead of reposting an already-registered true command, then allows a fresh false batch', async () => {
    http.unregisteredByDb = {DB1: ['AlreadyRegisteredWithDefaults']}
    http.rows[DATABASE_CATALOG_TABLE_MODEL]!.push({
      rowid: 'T-ALREADY-DEFAULT-UI', dbid: 'DB1', tblname: 'AlreadyRegisteredWithDefaults', schemaName: 'dbo',
    })
    http.registerTableResult = {AlreadyRegisteredWithDefaults: '表已注册'}
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await selectDatabase(wrapper)
    await pageButton(wrapper, '注册').trigger('click')
    await flushPromises()
    await flushPromises()
    const body = new DOMWrapper(document.body)
    let dialog = body.findAll('.el-dialog').at(-1)!
    expect(dialog.text()).toContain('默认字段')
    expect(dialog.text()).not.toContain('addDefaultFields')
    await dialog.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    await dialog.findAll('button').find(button => button.text() === '确认')!.trigger('click')
    await flushPromises()
    await flushPromises()
    dialog = body.findAll('.el-dialog').at(-1)!

    const requests = () => http.requests.filter(request => request.url === '/api/Table/registerTable/DB1')
    expect(requests()).toHaveLength(1)
    expect((requests()[0]?.data as Array<{hasDefaultFields: number}>)[0]?.hasDefaultFields).toBe(1)
    expect(wrapper.text()).toContain('默认字段补齐未执行')
    expect(dialog.findAll('button').find(button => button.text() === '继续未完成项')).toBeUndefined()
    expect(dialog.findAll('button').find(button => button.text() === '取消此项并结束批次')).toBeTruthy()

    await dialog.findAll('button').find(button => button.text() === '取消此项并结束批次')!.trigger('click')
    await flushPromises()
    await flushPromises()
    expect(body.findAll('.el-dialog')).toHaveLength(0)
    expect(requests()).toHaveLength(1)

    await pageButton(wrapper, '注册').trigger('click')
    await flushPromises()
    await flushPromises()
    dialog = body.findAll('.el-dialog').at(-1)!
    await dialog.findComponent(FieldCheckbox).find('.el-checkbox').trigger('click')
    await flushPromises()
    await dialog.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    await dialog.findAll('button').find(button => button.text() === '确认')!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()

    expect(requests()).toHaveLength(2)
    expect((requests()[1]?.data as Array<{hasDefaultFields: number}>)[0]?.hasDefaultFields).toBe(0)
  })

  it('starts a fresh batch after close and reopen when the same unregistered name reappears', async () => {
    http.unregisteredByDb = {DB1: ['RepeatAcrossBatches']}
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await selectDatabase(wrapper)
    const register = async () => {
      await pageButton(wrapper, '注册').trigger('click')
      await flushPromises()
      await flushPromises()
      const dialog = new DOMWrapper(document.body).findAll('.el-dialog').at(-1)!
      return dialog
    }
    let dialog = await register()
    await dialog.findComponent(FieldCheckbox).find('.el-checkbox').trigger('click')
    await flushPromises()
    await dialog.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    await dialog.findAll('button').find(button => button.text() === '确认')!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(http.requests.filter(request => request.url === '/api/Table/registerTable/DB1')).toHaveLength(1)

    http.registerTableResult = {RepeatAcrossBatches: '表已注册'}
    dialog = await register()
    await dialog.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    await dialog.findAll('button').find(button => button.text() === '确认')!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()

    expect(http.requests.filter(request => request.url === '/api/Table/registerTable/DB1')).toHaveLength(2)
    expect(wrapper.text()).not.toContain('batchId')
    expect(wrapper.text()).not.toContain('batchKey')
  })

  it('does not refresh or close a replacement page when a registration response resolves after release', async () => {
    http.unregisteredByDb = {DB1: ['DelayedRegistration']}
    const load = vi.spyOn(LowcodeDatabaseTableView, 'loadCatalog')
    const oldWrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    await selectDatabase(oldWrapper)
    await pageButton(oldWrapper, '注册').trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.body).findAll('.el-dialog').at(-1)!
    await dialog.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()

    let release!: () => void, markStarted!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    const started = new Promise<void>(resolve => {markStarted = resolve})
    const owner = http as unknown as {executeRequest: (config: RequestConfig) => Promise<HttpResponse<unknown>>}
    const originalExecute = owner.executeRequest.bind(http)
    owner.executeRequest = async config => {
      const response = await originalExecute(config)
      if (config.url === '/api/Table/registerTable/DB1') {
        markStarted()
        await gate
      }
      return response
    }
    try {
      const confirm = dialog.findAll('button').find(button => button.text() === '确认')!
      const pending = confirm.trigger('click')
      await started
      oldWrapper.unmount()
      const newWrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
      const oldSet = await load.mock.results[0]?.value
      const newSet = await load.mock.results[1]?.value
      expect(oldSet).toBeTruthy()
      expect(newSet).toBeTruthy()
      release()
      await pending
      await flushPromises()
      await flushPromises()

      expect(newWrapper.text()).not.toContain('表已注册')
      expect(newWrapper.text()).not.toContain('DelayedRegistration')
      expect(http.requests.filter(request => request.url === '/api/Table/registerTable/DB1')).toHaveLength(1)
    } finally {
      release()
      owner.executeRequest = originalExecute
    }
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
    expect(wrapper.text()).toContain('Orders to Other')
    const relationTable = wrapper.findAllComponents(RendererTable).find(table =>
      table.find('.el-table__body-wrapper').text().includes('Orders to Other'))
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
    expect(designDialog.text()).not.toContain('Orders to Other')
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
    const peerSelect = dialog.findComponent(FieldSelect)
    expect(peerSelect.exists()).toBe(true)
    peerSelect.getComponent(ElSelect).vm.$emit('update:modelValue', 'T3')
    await flushPromises()
    const name = dialog.findAll('input').find(input => !(input.element as HTMLInputElement).value)
    expect(name).toBeTruthy()
    await name!.setValue('Orders to LineItems')
    await name!.trigger('input')
    const save = dialog.findAll('button').find(button => button.text() === '保存')
    expect(save).toBeTruthy()
    await save!.trigger('click')
    await flushPromises()
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('表关系已保存')
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    expect(wrapper.text()).toContain('Orders to LineItems')
  })

  it('binds relation fields and peer choices to the original SPARK DataViews instead of a copied dialog draft', async () => {
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
    const relationDialog = body.findAll('.el-dialog').at(-1)!

    const relationForm = relationDialog.findComponent(RendererForm)
    expect(relationForm.exists()).toBe(true)
    expect(relationForm.props('dataViewKey')).toBe(buildDataViewKey(
      DATABASE_CATALOG_RELATION_MODEL,
      DATABASE_CATALOG_RELATION_TABLE_VIEW,
      DATABASE_TABLE_VIEW_SCENARIO_ID,
    ))
    const peerField = relationDialog.findComponent(FieldSelect)
    expect(peerField.exists()).toBe(true)
    expect(peerField.props('field')).toBe('pktbid')
    expect(peerField.props('optionDataViewKey')).toBe(buildDataViewKey(
      DATABASE_CATALOG_TABLE_MODEL,
      'relationPeers',
      DATABASE_TABLE_VIEW_SCENARIO_ID,
    ))
    expect(peerField.props('optionDataMember')).toBe('rows')
    expect(peerField.props('optionLabelField')).toBe('tblname')
    expect(peerField.props('optionValueField')).toBe('rowid')
  })

  it('opens existing relation edits from its DataView editing overlay and restores only this interaction on cancel', async () => {
    const relationRefresh = vi.spyOn(DataView.prototype, 'refresh')
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    http.rows[DATABASE_CATALOG_RELATION_MODEL]!.push({
      rowid: 'RL3', pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders', fkdbid: 'DB1', fktbid: 'T3',
      fktable: 'LineItems', rlname: 'Orders to LineItems', RelshipExp: relationFilter('LineItems.OrderId'), IsCascadeDeletion: 0,
    })
    const designDialog = await openTableDesignOnTable(wrapper, 'Orders')
    const relationsTab = wrapper.findAll('.el-tabs__item').find(item => item.text() === '关系')
    expect(relationsTab).toBeTruthy()
    await relationsTab!.trigger('click')
    await flushPromises()
    await flushPromises()

    const relationView = relationRefresh.mock.contexts.find(view =>
      view instanceof DataView
      && view.tableName === DATABASE_CATALOG_RELATION_MODEL
      && view.viewId === DATABASE_CATALOG_RELATION_TABLE_VIEW)
    if (!(relationView instanceof DataView)) throw new Error('真实页面未刷新 Base_TblRln@forTable DataView')
    const row = relationView.rows.find(item => relationView.getPkKey(item) === 'RL1')
    expect(row?.['rlname']).toBe('Orders to Other')
    relationView.updateEditingValue('RL3', 'rlname', '另一关系名称')
    expect(relationView.getEditingRow('RL3')?.['rlname']).toBe('另一关系名称')

    const relationTable = designDialog.findAllComponents(RendererTable).find((table: VueWrapper) =>
      table.find('.el-table__body-wrapper').text().includes('Orders to Other'))
    expect(relationTable).toBeTruthy()
    await relationTable!.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    const edit = designDialog.findAll('button').find(button => button.text() === '编辑' && !button.element.hasAttribute('disabled'))
    expect(edit).toBeTruthy()
    await edit!.trigger('click')
    await flushPromises()

    const body = new DOMWrapper(document.body)
    const relationEditor = body.findAll('.el-dialog').at(-1)!
    const nameInput = relationEditor.findAll('input').find(input => (input.element as HTMLInputElement).value === 'Orders to Other')
    expect(nameInput).toBeTruthy()
    await nameInput!.setValue('Orders to Other renamed')
    await nameInput!.trigger('input')
    await flushPromises()
    expect(relationView.getEditingRow('RL1')?.['rlname']).toBe('Orders to Other renamed')

    const cancel = relationEditor.findAll('button').find(button => button.text() === '取消')
    expect(cancel).toBeTruthy()
    await cancel!.trigger('click')
    await flushPromises()
    expect(relationView.getEditingRow('RL1')?.['rlname']).toBe('Orders to Other')
    expect(relationView.getEditingRow('RL3')?.['rlname']).toBe('另一关系名称')
  })

  it('opens the relation editor with the target relation name from its DataView overlay', async () => {
    const relationRefresh = vi.spyOn(DataView.prototype, 'refresh')
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    const designDialog = await openTableDesignOnTable(wrapper, 'Orders')
    const relationsTab = wrapper.findAll('.el-tabs__item').find(item => item.text() === '关系')
    expect(relationsTab).toBeTruthy()
    await relationsTab!.trigger('click')
    await flushPromises()
    await flushPromises()

    const relationView = relationRefresh.mock.contexts.find(view =>
      view instanceof DataView
      && view.tableName === DATABASE_CATALOG_RELATION_MODEL
      && view.viewId === DATABASE_CATALOG_RELATION_TABLE_VIEW)
    if (!(relationView instanceof DataView)) throw new Error('真实页面未刷新 Base_TblRln@forTable DataView')
    relationView.updateEditingValue('RL1', 'rlname', '尚未提交的关系名称')
    expect(relationView.getEditingRow('RL1')?.['rlname']).toBe('尚未提交的关系名称')

    const relationTable = designDialog.findAllComponents(RendererTable).find((table: VueWrapper) =>
      table.find('.el-table__body-wrapper').text().includes('Orders to Other'))
    expect(relationTable).toBeTruthy()
    await relationTable!.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    const edit = designDialog.findAll('button').find(button => button.text() === '编辑' && !button.element.hasAttribute('disabled'))
    expect(edit).toBeTruthy()
    await edit!.trigger('click')
    await flushPromises()

    const body = new DOMWrapper(document.body)
    const relationEditor = body.findAll('.el-dialog').at(-1)!
    const nameInput = relationEditor.findAll('input').find(input => (input.element as HTMLInputElement).value === '尚未提交的关系名称')
    expect(nameInput).toBeTruthy()
  })

  it('infers the current relation role from a pre-existing endpoint overlay before editing', async () => {
    const {designDialog, relationView} = await openRelationWorkspace()
    relationView.updateEditingValue('RL1', 'pkdbid', 'DB2')
    relationView.updateEditingValue('RL1', 'pktbid', 'T2')
    relationView.updateEditingValue('RL1', 'pktable', 'Other')
    relationView.updateEditingValue('RL1', 'fkdbid', 'DB1')
    relationView.updateEditingValue('RL1', 'fktbid', 'T1')
    relationView.updateEditingValue('RL1', 'fktable', 'Orders')
    const target = designDialog.findAll('.el-table__body-wrapper tbody tr').find(row => row.text().includes('Orders to Other'))
    expect(target).toBeTruthy()
    await target!.trigger('click')
    await flushPromises()
    const edit = designDialog.findAll('button').find(button => button.text() === '编辑' && !button.element.hasAttribute('disabled'))
    expect(edit).toBeTruthy()
    await edit!.trigger('click')
    await flushPromises()
    const editor = new DOMWrapper(document.body).findAll('.el-dialog').at(-1)!
    expect(editor.text()).toContain('当前作为从表')
    expect(editor.findComponent(FieldSelect).props('field')).toBe('pktbid')
    const switchToMaster = editor.findAll('button').find(button => button.text() === '当前作为主表')
    expect(switchToMaster?.element.hasAttribute('disabled')).toBe(false)
    await switchToMaster!.trigger('click')
    await flushPromises()
    expect(relationView.getEditingRow('RL1')).toMatchObject({
      pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders', fkdbid: 'DB2', fktbid: 'T2', fktable: 'Other',
    })
  })

  it('restores only the nine relation checkpoint fields and preserves other overlays and rows on cancel', async () => {
    http.rows[DATABASE_CATALOG_RELATION_MODEL]!.push({
      rowid: 'RL3', pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders', fkdbid: 'DB1', fktbid: 'T3',
      fktable: 'LineItems', rlname: 'Other relation', RelshipExp: '', IsCascadeDeletion: 0,
    })
    const {wrapper, designDialog, relationView} = await openRelationWorkspace()
    const ownedFields = ['pkdbid', 'pktbid', 'pktable', 'fkdbid', 'fktbid', 'fktable', 'rlname', 'RelshipExp', 'IsCascadeDeletion']
    const original = relationView.getEditingRow('RL1')
    expect(original).toBeTruthy()
    const beforeValues: Record<string, unknown> = {
      pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders', fkdbid: 'DB1', fktbid: 'T2', fktable: 'Other',
      rlname: '已有关系名称 overlay', RelshipExp: relationFilter('before'), IsCascadeDeletion: 1,
    }
    for (const field of ownedFields) {
      relationView.updateEditingValue('RL1', field, beforeValues[field])
    }
    relationView.updateEditingValue('RL1', 'createuser', '弹窗外字段-打开前')
    relationView.updateEditingValue('RL3', 'rlname', '另一行-打开前')
    const beforeCheckpoint = relationView.getEditingRow('RL1')!

    const relationTable = designDialog.findAllComponents(RendererTable).find((table: VueWrapper) =>
      table.find('.el-table__body-wrapper').text().includes('Orders to Other'))
    expect(relationTable).toBeTruthy()
    await relationTable!.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    const edit = designDialog.findAll('button').find(button => button.text() === '编辑' && !button.element.hasAttribute('disabled'))
    expect(edit).toBeTruthy()
    await edit!.trigger('click')
    await flushPromises()
    const relationEditor = new DOMWrapper(document.body).findAll('.el-dialog').at(-1)!
    for (const field of ownedFields) {
      const value = field === 'IsCascadeDeletion' ? 0 : field === 'RelshipExp' ? relationFilter('during') : `弹窗编辑-${field}`
      relationView.updateEditingValue('RL1', field, value)
    }
    relationView.updateEditingValue('RL1', 'createuser', '弹窗外字段-本次变更')
    relationView.updateEditingValue('RL3', 'rlname', '另一行-本次变更')
    await relationEditor.findAll('button').find(button => button.text() === '取消')!.trigger('click')
    await flushPromises()

    const afterCancel = relationView.getEditingRow('RL1')!
    for (const field of ownedFields) expect(afterCancel[field]).toBe(beforeCheckpoint[field])
    expect(relationView.getEditingRow('RL1')?.['createuser']).toBe('弹窗外字段-本次变更')
    expect(relationView.getEditingRow('RL3')?.['rlname']).toBe('另一行-本次变更')
    await vi.waitFor(() => expect(wrapper.findComponent(TableRelationDialog).exists()).toBe(false))
    void wrapper
  })

  it('binds stored RelshipExp as a SPARK JSON string through the standard filter field on the relation DataView', async () => {
    const {designDialog, relationView} = await openRelationWorkspace()
    const relationTable = designDialog.findAllComponents(RendererTable).find((table: VueWrapper) =>
      table.find('.el-table__body-wrapper').text().includes('Orders to Other'))
    expect(relationTable).toBeTruthy()
    await relationTable!.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    const edit = designDialog.findAll('button').find(button => button.text() === '编辑' && !button.element.hasAttribute('disabled'))
    expect(edit).toBeTruthy()
    await edit!.trigger('click')
    await flushPromises()
    const relationEditor = new DOMWrapper(document.body).findAll('.el-dialog').at(-1)!
    const expressionEditor = relationEditor.findComponent(RendererFilterExpression)
    expect(expressionEditor.exists()).toBe(true)
    expect(expressionEditor.props('field')).toBe('RelshipExp')
    expect(expressionEditor.props('dataViewKey')).toBe(buildDataViewKey(
      DATABASE_CATALOG_RELATION_MODEL, DATABASE_CATALOG_RELATION_TABLE_VIEW, DATABASE_TABLE_VIEW_SCENARIO_ID,
    ))
    expect(expressionEditor.props('format')).toBe('spark-json')
    expect((expressionEditor.props('columns') as Array<{name: string; type: string}>).find(column => column.name === 'Other.Id')?.type).toBe('number')
    const source = relationView.rows.find((row: DataRow) => relationView.getPkKey(row) === 'RL1')
    expect(typeof source?.['RelshipExp']).toBe('string')
    expect(DataViewFilterCodec.parseStored(String(source?.['RelshipExp']))?.toJSON()).toEqual(
      {field: 'Other.Id', operator: 'eq', value: {Type: 'GetTableField', Field: 'Orders.Id'}},
    )
    expect(relationView.getEditingRow('RL1')?.['RelshipExp']).toEqual(source?.['RelshipExp'])
  })

  it('keeps a valid expression editable when the formal endpoint response also contains an unknown field type', async () => {
    const originalExpression = DataViewFilterCodec.serializeStored(
      DataViewFilter.condition({field: 'Other.Id', operator: 'eq', value: 7}),
    )
    http.rows[DATABASE_CATALOG_RELATION_MODEL]!.find((row: Record<string, unknown>) => row['rowid'] === 'RL1')!['RelshipExp'] = originalExpression
    http.rows[DATABASE_CATALOG_FIELD_MODEL]!.push({rowid: 'F-T2-UNKNOWN', tblid: 'T2', enname: 'UnknownPayload',
      cnname: '未知类型字段', DataType: 'UNMAPPED_SERVICE_TYPE', DataTypeName: '未知', DataLen: '0', IsPKey: 0, ordIdx: 99})
    const {designDialog, relationView} = await openRelationWorkspace()
    const target = designDialog.findAll('.el-table__body-wrapper tbody tr').find((row: DOMWrapper<Element>) => row.text().includes('Orders to Other'))
    expect(target).toBeTruthy()
    await target!.trigger('click')
    await flushPromises()
    await designDialog.findAll('button').find(button => button.text() === '编辑' && !button.element.hasAttribute('disabled'))!.trigger('click')
    await flushPromises()
    const editor = new DOMWrapper(document.body).findAll('.el-dialog').at(-1)!
    expect(editor.text()).toContain('部分端点字段的正式 DataType 未映射')
    const expression = editor.findComponent(RendererFilterExpression)
    expect(expression.exists()).toBe(true)
    expect((expression.props('columns') as readonly {name: string}[]).map(column => column.name)).toContain('Other.Id')
    expect((expression.props('columns') as readonly {name: string}[]).map(column => column.name)).not.toContain('Other.UnknownPayload')
    await expression.find('[data-action="open"]').trigger('click')
    await flushPromises()
    const candidate = new DOMWrapper(document.body).find('input[aria-label="数字常量"]')
    expect(candidate.exists()).toBe(true)
    await candidate.setValue('8')
    await flushPromises()
    expect(relationView.hasEditingChanges()).toBe(false)
    await new DOMWrapper(document.body).find('[data-action="apply"]').trigger('click')
    await flushPromises()
    expect(relationView.getEditingRow('RL1')?.['RelshipExp']).toBe(DataViewFilterCodec.serializeStored(
      DataViewFilter.condition({field: 'Other.Id', operator: 'eq', value: 8}),
    ))
  })

  it('identifies an existing expression reference whose formal field type is unmapped', async () => {
    const originalExpression = DataViewFilterCodec.serializeStored(
      DataViewFilter.condition({field: 'Other.UnknownPayload', operator: 'eq', value: 'original'}),
    )
    http.rows[DATABASE_CATALOG_RELATION_MODEL]!.find((row: Record<string, unknown>) => row['rowid'] === 'RL1')!['RelshipExp'] = originalExpression
    http.rows[DATABASE_CATALOG_FIELD_MODEL]!.push({rowid: 'F-T2-UNKNOWN', tblid: 'T2', enname: 'UnknownPayload',
      cnname: '未知类型字段', DataType: 'UNMAPPED_SERVICE_TYPE', DataTypeName: '未知', DataLen: '0', IsPKey: 0, ordIdx: 99})
    const {designDialog, relationView} = await openRelationWorkspace()
    const target = designDialog.findAll('.el-table__body-wrapper tbody tr').find((row: DOMWrapper<Element>) => row.text().includes('Orders to Other'))
    expect(target).toBeTruthy()
    await target!.trigger('click')
    await flushPromises()
    await designDialog.findAll('button').find(button => button.text() === '编辑' && !button.element.hasAttribute('disabled'))!.trigger('click')
    await flushPromises()
    const editor = new DOMWrapper(document.body).findAll('.el-dialog').at(-1)!
    expect(editor.text()).toContain('字段类型未映射')
    expect(editor.text()).not.toContain('字段不属于当前端点')
    expect(relationView.getEditingRow('RL1')?.['RelshipExp']).toBe(originalExpression)
    expect(relationView.hasEditingChanges()).toBe(false)
  })

  it('protects a clean relation from system-page close while a standard expression candidate is uncommitted', async () => {
    http.rows[DATABASE_CATALOG_RELATION_MODEL]!.find(row => row['rowid'] === 'RL1')!['RelshipExp'] = DataViewFilterCodec.serializeStored(
      DataViewFilter.condition({field: 'Other.Id', operator: 'eq', value: 7}),
    )
    const load = vi.spyOn(LowcodeDatabaseTableView, 'loadCatalog')
    const {wrapper, dynamic} = await openAsSystemPage(DATABASE_TABLE_VIEW_SCENARIO_ID)
    const dataSet = await load.mock.results[0]?.value
    if (!dataSet) throw new Error('真实页面未装配目录 DataSet')
    const designDialog = await openTableDesignOnTable(wrapper, 'Orders')
    const relationsTab = wrapper.findAll('.el-tabs__item').find(item => item.text() === '关系')
    await relationsTab!.trigger('click')
    await flushPromises()
    await flushPromises()
    const relationView = dataSet.getView(DATABASE_CATALOG_RELATION_MODEL, DATABASE_CATALOG_RELATION_TABLE_VIEW)!
    expect(relationView.hasEditingChanges()).toBe(false)
    const row = designDialog.findAll('.el-table__body-wrapper tbody tr').find(item => item.text().includes('Orders to Other'))
    await row!.trigger('click')
    await flushPromises()
    await designDialog.findAll('button').find(button => button.text() === '编辑' && !button.element.hasAttribute('disabled'))!.trigger('click')
    await flushPromises()
    const body = new DOMWrapper(document.body)
    const relationEditor = body.findAll('.el-dialog').at(-1)!
    const expressionField = relationEditor.findComponent(RendererFilterExpression)
    expect(expressionField.exists()).toBe(true)
    const openExpression = expressionField.find('[data-action="open"]')
    expect(openExpression.exists()).toBe(true)
    await openExpression.trigger('click')
    await flushPromises()
    const constant = body.find('input[aria-label="数字常量"]')
    expect(constant.exists()).toBe(true)
    await constant.setValue('8')
    await flushPromises()
    expect(relationView.hasEditingChanges()).toBe(false)
    const instance = dynamic.getSystemPageInstance(wrapper.vm.$router.currentRoute.value)
    if (!instance) throw new Error('真实系统页实例未注册')
    expect(() => dynamic.closeSystemPageInstance(instance.instanceId)).toThrow('未保存')
    await body.find('[data-action="cancel"]').trigger('click')
    await flushPromises()
    expect(relationView.hasEditingChanges()).toBe(false)
    expect(() => dynamic.closeSystemPageInstance(instance.instanceId)).not.toThrow()
  })

  it('does not query Base_TblRln without a captured table filter during initialization or tab entry', async () => {
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    const relationQueries = () => http.requests.filter(request => request.url === '/api/DataOperation/GetData'
      && (request.data as {Table?: Array<{Name?: string}>}).Table?.some(table => table.Name === DATABASE_CATALOG_RELATION_MODEL))
    expect(relationQueries()).toHaveLength(0)
    await openTableDesignOnTable(wrapper, 'Orders')
    const relationsTab = wrapper.findAll('.el-tabs__item').find(item => item.text() === '关系')
    expect(relationsTab).toBeTruthy()
    await relationsTab!.trigger('click')
    await flushPromises()
    await flushPromises()
    const requests = relationQueries()
    expect(requests.length).toBeGreaterThan(0)
    expect(requests.every(request => {
      const data = request.data as {Table?: Array<{Name?: string; Filter?: unknown}>}
      const filter = data.Table?.find(table => table.Name === DATABASE_CATALOG_RELATION_MODEL)?.Filter
      const text = JSON.stringify(filter)
      return filter !== null && filter !== undefined && text.includes('pktbid') && text.includes('fktbid') && text.includes('T1')
    })).toBe(true)
  })

  it('cancels only the new relation row and leaves an unrelated pending row intact', async () => {
    const {wrapper, designDialog, relationView} = await openRelationWorkspace()
    await relationView.addRow({rowid: 'UNRELATED-PENDING', pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders',
      fkdbid: 'DB1', fktbid: 'T3', fktable: 'LineItems', rlname: 'unrelated', IsCascadeDeletion: 0})
    const writesBefore = http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD').length
    const addRelation = designDialog.findAll('button').find(button => button.text() === '新增')
    expect(addRelation).toBeTruthy()
    await addRelation!.trigger('click')
    await flushPromises()
    const targetId = relationView.getSelectedValues()[0]
    expect(targetId).toBeTruthy()
    const dialog = new DOMWrapper(document.body).findAll('.el-dialog').at(-1)!
    await dialog.findAll('button').find(button => button.text() === '取消')!.trigger('click')
    await flushPromises()

    expect([...relationView.dirtyTracking.pendingCreateIds]).toEqual(['UNRELATED-PENDING'])
    expect(relationView.getEditingRow('UNRELATED-PENDING')).toBeTruthy()
    expect(relationView.dirtyTracking.isPendingCreate(String(targetId))).toBe(false)
    expect(http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(writesBefore)
    expect(wrapper.text()).not.toContain('新增表关系')
  })

  it('moves all six relation endpoints and clears the stored expression in both role-switch directions', async () => {
    const {designDialog, relationView} = await openRelationWorkspace()
    const addRelation = designDialog.findAll('button').find(button => button.text() === '新增')
    await addRelation!.trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.body).findAll('.el-dialog').at(-1)!
    const relationId = relationView.getSelectedValues()[0]
    expect(relationId).toBeTruthy()
    relationView.updateEditingValue(relationId!, 'pkdbid', 'DB1')
    relationView.updateEditingValue(relationId!, 'pktbid', 'T3')
    relationView.updateEditingValue(relationId!, 'pktable', 'LineItems')
    relationView.updateEditingValue(relationId!, 'rlname', 'Orders to LineItems')
    relationView.updateEditingValue(relationId!, 'RelshipExp', relationFilter('must-be-cleared'))
    const masterRole = dialog.findAll('button').find(button => button.text() === '当前作为主表')
    expect(masterRole).toBeTruthy()

    await masterRole!.trigger('click')
    await flushPromises()
    let current = relationView.getEditingRow(relationId!)!
    expect.soft(current).toMatchObject({pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders',
      fkdbid: 'DB1', fktbid: 'T3', fktable: 'LineItems', RelshipExp: ''})

    await dialog.findAll('button').find(button => button.text() === '当前作为从表')!.trigger('click')
    await flushPromises()
    current = relationView.getEditingRow(relationId!)!
    expect(current).toMatchObject({pkdbid: 'DB1', pktbid: 'T3', pktable: 'LineItems',
      fkdbid: 'DB1', fktbid: 'T1', fktable: 'Orders', RelshipExp: ''})
  })

  it('allows role switching on an existing relation and clears only its stored expression', async () => {
    http.rows[DATABASE_CATALOG_RELATION_MODEL]!.push({
      rowid: 'RL3', pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders', fkdbid: 'DB1', fktbid: 'T3',
      fktable: 'LineItems', rlname: 'Orders to LineItems', RelshipExp: relationFilter('existing'), IsCascadeDeletion: 0,
    })
    const {designDialog, relationView} = await openRelationWorkspace()
    const relationTable = designDialog.findAllComponents(RendererTable).find((table: VueWrapper) =>
      table.find('.el-table__body-wrapper').text().includes('Orders to LineItems'))
    expect(relationTable).toBeTruthy()
    const targetRow = relationTable!.findAll('.el-table__body-wrapper tbody tr').find((row: DOMWrapper<Element>) => row.text().includes('Orders to LineItems'))
    expect(targetRow).toBeTruthy()
    await targetRow!.trigger('click')
    await flushPromises()
    const edit = designDialog.findAll('button').find(button => button.text() === '编辑' && !button.element.hasAttribute('disabled'))
    expect(edit).toBeTruthy()
    await edit!.trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.body).findAll('.el-dialog').at(-1)!
    const role = dialog.findAll('button').find(button => button.text() === '当前作为从表')
    expect(role).toBeTruthy()
    expect(role!.element.hasAttribute('disabled')).toBe(false)
    await role!.trigger('click')
    await flushPromises()
    expect(relationView.getEditingRow('RL3')).toMatchObject({
      pkdbid: 'DB1', pktbid: 'T3', pktable: 'LineItems',
      fkdbid: 'DB1', fktbid: 'T1', fktable: 'Orders', RelshipExp: '',
    })
  })

  it('preflights every role endpoint field before changing any field when the final expression field is denied', async () => {
    http.deniedFieldsByModel[DATABASE_CATALOG_RELATION_MODEL] = ['RelshipExp']
    const {designDialog, relationView} = await openRelationWorkspace()
    const relationTable = designDialog.findAllComponents(RendererTable).find((table: VueWrapper) =>
      table.find('.el-table__body-wrapper').text().includes('Orders to Other'))
    expect(relationTable).toBeTruthy()
    await relationTable!.find('.el-table__body-wrapper tbody tr').trigger('click')
    await flushPromises()
    const edit = designDialog.findAll('button').find(button => button.text() === '编辑' && !button.element.hasAttribute('disabled'))
    expect(edit).toBeTruthy()
    await edit!.trigger('click')
    await flushPromises()
    const before = relationView.getEditingRow('RL1')
    const editor = new DOMWrapper(document.body).findAll('.el-dialog').at(-1)!
    await editor.findAll('button').find(button => button.text() === '当前作为从表')!.trigger('click')
    await flushPromises()
    expect(relationView.getEditingRow('RL1')).toMatchObject({
      pkdbid: before?.['pkdbid'], pktbid: before?.['pktbid'], pktable: before?.['pktable'],
      fkdbid: before?.['fkdbid'], fktbid: before?.['fktbid'], fktable: before?.['fktable'],
      RelshipExp: before?.['RelshipExp'],
    })
    expect(relationView.getEditingPatch('RL1')).toBeUndefined()
    expect(editor.text()).toContain('RelshipExp')
  })

  it('cancels peer-field default when a later endpoint field is denied', async () => {
    http.deniedFieldsByModel[DATABASE_CATALOG_RELATION_MODEL] = ['fktable']
    http.rows[DATABASE_CATALOG_TABLE_MODEL]!.push({rowid: 'T4', dbid: 'DB1', tblname: 'PeerFour', tbldesc: '', schemaName: 'dbo', status: 1})
    http.rows[DATABASE_CATALOG_RELATION_MODEL]!.push({
      rowid: 'RL3', pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders', fkdbid: 'DB1', fktbid: 'T3',
      fktable: 'LineItems', rlname: 'Orders to LineItems', RelshipExp: '', IsCascadeDeletion: 0,
    })
    const {designDialog, relationView} = await openRelationWorkspace()
    const relationTable = designDialog.findAllComponents(RendererTable).find((table: VueWrapper) =>
      table.find('.el-table__body-wrapper').text().includes('Orders to LineItems'))
    const targetRow = relationTable?.findAll('.el-table__body-wrapper tbody tr').find((row: DOMWrapper<Element>) => row.text().includes('Orders to LineItems'))
    expect(targetRow).toBeTruthy()
    await targetRow!.trigger('click')
    await flushPromises()
    await designDialog.findAll('button').find(button => button.text() === '编辑' && !button.element.hasAttribute('disabled'))!.trigger('click')
    await flushPromises()
    const editor = new DOMWrapper(document.body).findAll('.el-dialog').at(-1)!
    const before = relationView.getEditingRow('RL3')
    const peerField = editor.findComponent(FieldSelect)
    expect(peerField.props('field')).toBe('fktbid')
    peerField.getComponent(ElSelect).vm.$emit('update:modelValue', 'T4')
    await flushPromises()
    expect(relationView.getEditingRow('RL3')).toMatchObject({
      fkdbid: before?.['fkdbid'], fktbid: before?.['fktbid'], fktable: before?.['fktable'],
      RelshipExp: before?.['RelshipExp'],
    })
    expect(relationView.getEditingPatch('RL3')).toBeUndefined()
    expect(editor.text()).toContain('fktable')
  })

  it('keeps the page dialog and staged relation after query-owner save refusal', async () => {
    const {wrapper, designDialog, relationView} = await openRelationWorkspace()
    await designDialog.findAll('button').find(button => button.text() === '新增')!.trigger('click')
    await flushPromises()
    const body = new DOMWrapper(document.body)
    let editor = body.findAll('.el-dialog').at(-1)!
    await fillNewRelationDialog(editor, 'Refused relation')
    await vi.waitFor(() => expect(editor.findAll('button').find(button => button.text() === '保存')?.element.hasAttribute('disabled')).toBe(false))
    const rowId = String(relationView.getSelectedValues()[0])
    http.rejectNextRelationSave = true
    await editor.findAll('button').find(button => button.text() === '保存')!.trigger('click')
    await flushPromises()
    await flushPromises()
    editor = body.findAll('.el-dialog').at(-1)!
    expect(wrapper.findComponent(TableRelationDialog).exists()).toBe(true)
    expect(relationView.dirtyTracking.isPendingCreate(rowId)).toBe(true)
    expect(relationView.getEditingRow(rowId)?.['rlname']).toBe('Refused relation')
    expect(editor.text()).toContain('服务器拒绝关系保存')
    expect(http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1)
  })

  it('rejects a staged relation with only one endpoint before issuing a write', async () => {
    const {designDialog, relationView} = await openRelationWorkspace()
    await designDialog.findAll('button').find(button => button.text() === '新增')!.trigger('click')
    await flushPromises()
    const editor = new DOMWrapper(document.body).findAll('.el-dialog').at(-1)!
    const rowId = String(relationView.getSelectedValues()[0])
    const nameInput = editor.find('input[placeholder="请输入关系名称"]')
    await nameInput.setValue('Incomplete relation')
    await flushPromises()
    await editor.findAll('button').find(button => button.text() === '保存')!.trigger('click')
    await flushPromises()
    expect(relationView.dirtyTracking.isPendingCreate(rowId)).toBe(true)
    expect(relationView.getEditingRow(rowId)).toMatchObject({fktbid: 'T1', pktbid: ''})
    expect(editor.text()).toContain('两个不同且完整的物理表端点')
    expect(http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(0)
  })

  it('preserves a legacy cross-database expression when only the relation name changes', async () => {
    http.rows[DATABASE_CATALOG_RELATION_MODEL]!.push({
      rowid: 'RL3', pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders', fkdbid: 'DB2', fktbid: 'T2',
      fktable: 'Other', rlname: 'Legacy relation', RelshipExp: 'legacy expression payload', IsCascadeDeletion: 0,
    })
    const {designDialog, relationView} = await openRelationWorkspace()
    const target = designDialog.findAll('.el-table__body-wrapper tbody tr').find(row => row.text().includes('Legacy relation'))
    await target!.trigger('click')
    await flushPromises()
    await designDialog.findAll('button').find(button => button.text() === '编辑' && !button.element.hasAttribute('disabled'))!.trigger('click')
    await flushPromises()
    const editor = new DOMWrapper(document.body).findAll('.el-dialog').at(-1)!
    expect(editor.text()).toContain('原值保留')
    const nameInput = editor.find('input[placeholder="请输入关系名称"]')
    await nameInput.setValue('Legacy relation renamed')
    await flushPromises()
    await editor.findAll('button').find(button => button.text() === '保存')!.trigger('click')
    await flushPromises()
    await flushPromises()
    expect(relationView.getEditingRow('RL3')?.['rlname']).toBe('Legacy relation renamed')
    expect(relationView.getEditingRow('RL3')).toMatchObject({pkdbid: 'DB1', pktbid: 'T1', fkdbid: 'DB2', fktbid: 'T2', RelshipExp: 'legacy expression payload'})
    expect(http.rows[DATABASE_CATALOG_RELATION_MODEL]?.find(row => row['rowid'] === 'RL3'))
      .toMatchObject({pkdbid: 'DB1', pktbid: 'T1', fkdbid: 'DB2', fktbid: 'T2', RelshipExp: 'legacy expression payload'})
    const writes = http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')
    expect(writes).toHaveLength(1)
    const payload = writes[0]!.data as Array<{TableName?: string; CrudModel?: {Changed?: Array<Record<string, unknown>>}}>
    const changed = payload.find(item => item.TableName === DATABASE_CATALOG_RELATION_MODEL)?.CrudModel?.Changed
    expect(changed).toHaveLength(1)
    expect(changed?.[0]).toMatchObject({rowid: 'RL3', rlname: 'Legacy relation renamed'})
    expect(Object.keys(changed?.[0] ?? {}).filter(field => !['rowid', 'lingma_sys_key'].includes(field))).toEqual(['rlname'])
  })

  it('refuses a structural change whose existing physical endpoint is absent from the formal directory', async () => {
    http.rows[DATABASE_CATALOG_RELATION_MODEL]!.push({
      rowid: 'RL3', pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders', fkdbid: 'DB1', fktbid: 'T-DELETED',
      fktable: 'DeletedTable', rlname: 'Orphaned endpoint', RelshipExp: '', IsCascadeDeletion: 0,
    })
    const {designDialog, relationView} = await openRelationWorkspace()
    const target = designDialog.findAll('.el-table__body-wrapper tbody tr').find(row => row.text().includes('Orphaned endpoint'))
    await target!.trigger('click')
    await flushPromises()
    await designDialog.findAll('button').find(button => button.text() === '编辑' && !button.element.hasAttribute('disabled'))!.trigger('click')
    await flushPromises()
    const editor = new DOMWrapper(document.body).findAll('.el-dialog').at(-1)!
    const cascade = editor.findAllComponents(FieldSelect).at(-1)
    expect(cascade).toBeTruthy()
    cascade!.getComponent(ElSelect).vm.$emit('update:modelValue', 1)
    await flushPromises()
    await editor.findAll('button').find(button => button.text() === '保存')!.trigger('click')
    await flushPromises()
    expect(relationView.getEditingPatch('RL3')).toBeTruthy()
    expect(relationView.getEditingRow('RL3')?.['IsCascadeDeletion']).toBe(1)
    expect(editor.text()).toContain('关系端点目录缺失')
    expect(http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(0)
  })

  it('rejects a structural save when the formal endpoint directory is already Loading', async () => {
    const {wrapper, designDialog, dataSet, relationView} = await openRelationWorkspace()
    await designDialog.findAll('button').find(button => button.text() === '新增')!.trigger('click')
    await flushPromises()
    const body = new DOMWrapper(document.body)
    let editor = body.findAll('.el-dialog').at(-1)!
    await fillNewRelationDialog(editor, 'Loading endpoint check')
    await vi.waitFor(() => expect(editor.findAll('button').find(button => button.text() === '保存')?.element.hasAttribute('disabled')).toBe(false))
    const rowId = String(relationView.getSelectedValues()[0])
    const endpoints = dataSet.getView(DATABASE_CATALOG_TABLE_MODEL, 'relationEndpoints')!
    const owner = http as unknown as {executeRequest: (config: RequestConfig) => Promise<HttpResponse<unknown>>}
    const originalExecute = owner.executeRequest.bind(http)
    let release!: () => void, markStarted!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    const started = new Promise<void>(resolve => {markStarted = resolve})
    let hold = true
    owner.executeRequest = async config => {
      const response = await originalExecute(config)
      const request = config as {url?: string; data?: {Table?: Array<{Name?: string; Filter?: unknown}>}}
      const filter = request.data?.Table?.find(table => table.Name === DATABASE_CATALOG_TABLE_MODEL)?.Filter
      if (hold && request.url === '/api/DataOperation/GetData' && JSON.stringify(filter).includes('T1') && JSON.stringify(filter).includes('T3')) {
        hold = false
        markStarted()
        await gate
      }
      return response
    }
    try {
      const pendingDirectory = endpoints.setFilter(DataViewFilter.condition({field: endpoints.primaryKey, operator: 'in', value: ['T1', 'T3']}).toJSON())
      await started
      expect(endpoints.requestState).toBe(RequestState.Loading)
      await editor.findAll('button').find(button => button.text() === '保存')!.trigger('click')
      await flushPromises()
      editor = body.findAll('.el-dialog').at(-1)!
      expect(endpoints.requestState).toBe(RequestState.Loading)
      expect(relationView.dirtyTracking.isPendingCreate(rowId)).toBe(true)
      expect(editor.text()).toContain('关系端点目录正在读取')
      expect(http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(0)
      release()
      await pendingDirectory
    } finally {
      release()
      owner.executeRequest = originalExecute
      expect(wrapper.findComponent(TableRelationDialog).exists()).toBe(true)
    }
  })

  it('rejects a structural save when a formally returned endpoint field is unreadable', async () => {
    const load = vi.spyOn(LowcodeDatabaseTableView, 'loadCatalog')
    const wrapper = await open(DATABASE_TABLE_VIEW_SCENARIO_ID)
    const dataSet = await load.mock.results[0]?.value
    if (!dataSet) throw new Error('真实页面未装配目录 DataSet')
    const designDialog = await openTableDesignOnTable(wrapper, 'Orders')
    http.hiddenFieldsByModel[DATABASE_CATALOG_FIELD_MODEL] = ['enname']
    const relationsTab = wrapper.findAll('.el-tabs__item').find(item => item.text() === '关系')
    expect(relationsTab).toBeTruthy()
    await relationsTab!.trigger('click')
    await flushPromises()
    await flushPromises()
    const relationView = dataSet.getView(DATABASE_CATALOG_RELATION_MODEL, DATABASE_CATALOG_RELATION_TABLE_VIEW)!
    await designDialog.findAll('button').find(button => button.text() === '新增')!.trigger('click')
    await flushPromises()
    const editor = new DOMWrapper(document.body).findAll('.el-dialog').at(-1)!
    await fillNewRelationDialog(editor, 'Unreadable endpoint field')
    await vi.waitFor(() => expect(editor.findAll('button').find(button => button.text() === '保存')?.element.hasAttribute('disabled')).toBe(false))
    const rowId = String(relationView.getSelectedValues()[0])
    await editor.findAll('button').find(button => button.text() === '保存')!.trigger('click')
    await flushPromises()
    expect(relationView.dirtyTracking.isPendingCreate(rowId)).toBe(true)
    expect(editor.text()).toContain('关系端点字段目录不可读')
    expect(http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(0)
  })

  it('refuses to save when relation structure changes while the endpoint query is pending', async () => {
    http.rows[DATABASE_CATALOG_RELATION_MODEL]!.push({
      rowid: 'RL-RACE', pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders', fkdbid: 'DB2', fktbid: 'T2',
      fktable: 'Other', rlname: 'Race relation',
      RelshipExp: DataViewFilterCodec.serializeStored(DataViewFilter.condition({
        field: 'Other.Id', operator: 'eq', value: {Type: 'GetTableField', Field: 'Orders.Id'},
      })), IsCascadeDeletion: 0,
    })
    const {wrapper, designDialog, dataSet, relationView} = await openRelationWorkspace()
    const target = designDialog.findAll('.el-table__body-wrapper tbody tr').find(row => row.text().includes('Race relation'))
    expect(target).toBeTruthy()
    await target!.trigger('click')
    await flushPromises()
    await designDialog.findAll('button').find(button => button.text() === '编辑' && !button.element.hasAttribute('disabled'))!.trigger('click')
    await flushPromises()
    const editor = new DOMWrapper(document.body).findAll('.el-dialog').at(-1)!
    const cascade = editor.findAllComponents(FieldSelect).at(-1)
    expect(cascade).toBeTruthy()
    cascade!.getComponent(ElSelect).vm.$emit('update:modelValue', 1)
    await flushPromises()

    const endpointView = dataSet.getView(DATABASE_CATALOG_TABLE_MODEL, 'relationEndpoints')!
    const owner = http as unknown as {executeRequest: (config: RequestConfig) => Promise<HttpResponse<unknown>>}
    const originalExecute = owner.executeRequest.bind(http)
    let release!: () => void, markStarted!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    const started = new Promise<void>(resolve => {markStarted = resolve})
    let hold = true
    owner.executeRequest = async config => {
      const response = await originalExecute(config)
      const request = config as {url?: string; data?: {Table?: Array<{Name?: string; Filter?: unknown}>}}
      const filter = request.data?.Table?.find(table => table.Name === DATABASE_CATALOG_TABLE_MODEL)?.Filter
      if (hold && request.url === '/api/DataOperation/GetData' && JSON.stringify(filter).includes('T1') && JSON.stringify(filter).includes('T2')) {
        hold = false
        markStarted()
        await gate
      }
      return response
    }
    try {
      await editor.findAll('button').find(button => button.text() === '保存')!.trigger('click')
      await started
      expect(endpointView.requestState).toBe(RequestState.Loading)
      const lateExpression = '{"late":"overlay changed during endpoint query"}'
      relationView.updateEditingValue('RL-RACE', 'RelshipExp', lateExpression)
      release()
      await flushPromises()
      await flushPromises()
      expect(relationView.getEditingRow('RL-RACE')?.['RelshipExp']).toBe(lateExpression)
      expect(relationView.getEditingRow('RL-RACE')?.['IsCascadeDeletion']).toBe(1)
      expect(relationView.getEditingPatch('RL-RACE')).toBeTruthy()
      expect(wrapper.findComponent(TableRelationDialog).exists()).toBe(true)
      expect(new DOMWrapper(document.body).findAll('.el-dialog').at(-1)?.text()).toContain('关系端点或表达式在校验期间已变化')
      expect(http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(0)
    } finally {
      release()
      owner.executeRequest = originalExecute
    }
  })

  it('does not let a name-only save submit structure added across its async boundary', async () => {
    http.rows[DATABASE_CATALOG_RELATION_MODEL]!.push({
      rowid: 'RL-NAME-RACE', pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders', fkdbid: 'DB2', fktbid: 'T2',
      fktable: 'Other', rlname: 'Legacy cross-database', RelshipExp: 'legacy expression payload', IsCascadeDeletion: 0,
    })
    const {designDialog, relationView} = await openRelationWorkspace()
    const target = designDialog.findAll('.el-table__body-wrapper tbody tr').find(row => row.text().includes('Legacy cross-database'))
    expect(target).toBeTruthy()
    await target!.trigger('click')
    await flushPromises()
    await designDialog.findAll('button').find(button => button.text() === '编辑' && !button.element.hasAttribute('disabled'))!.trigger('click')
    await flushPromises()
    const editor = new DOMWrapper(document.body).findAll('.el-dialog').at(-1)!
    await editor.find('input[placeholder="请输入关系名称"]').setValue('Renamed only')
    await flushPromises()
    const saveClick = editor.findAll('button').find(button => button.text() === '保存')!.trigger('click')
    const lateExpression = '{"late":"structure added after name-only validation"}'
    relationView.updateEditingValue('RL-NAME-RACE', 'RelshipExp', lateExpression)
    await saveClick
    await flushPromises()
    expect(relationView.getEditingRow('RL-NAME-RACE')?.['rlname']).toBe('Renamed only')
    expect(relationView.getEditingRow('RL-NAME-RACE')?.['RelshipExp']).toBe(lateExpression)
    expect(relationView.getEditingPatch('RL-NAME-RACE')).toBeTruthy()
    expect(http.rows[DATABASE_CATALOG_RELATION_MODEL]?.find(row => row['rowid'] === 'RL-NAME-RACE'))
      .toMatchObject({rlname: 'Legacy cross-database', RelshipExp: 'legacy expression payload'})
    expect(http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(0)
  })

  it('keeps the page dialog locked after an unknown write and verifies the capture without a second POST', async () => {
    const {wrapper, designDialog, relationView} = await openRelationWorkspace()
    await designDialog.findAll('button').find(button => button.text() === '新增')!.trigger('click')
    await flushPromises()
    const body = new DOMWrapper(document.body)
    let editor = body.findAll('.el-dialog').at(-1)!
    await fillNewRelationDialog(editor, 'Unknown relation')
    await vi.waitFor(() => expect(editor.findAll('button').find(button => button.text() === '保存')?.element.hasAttribute('disabled')).toBe(false))
    const rowId = String(relationView.getSelectedValues()[0])
    const requestOwner = http as unknown as {executeRequest: (config: RequestConfig) => Promise<HttpResponse<unknown>>}
    const originalExecute = requestOwner.executeRequest.bind(http)
    let loseReceipt = true
    requestOwner.executeRequest = async config => {
      const response = await originalExecute(config)
      const request = config as {url?: string}
      if (loseReceipt && request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
        loseReceipt = false
        throw new Error('关系提交已到达服务，但客户端未收到回执')
      }
      return response
    }
    try {
      await editor.findAll('button').find(button => button.text() === '保存')!.trigger('click')
      await flushPromises()
      await flushPromises()
      editor = body.findAll('.el-dialog').at(-1)!
      expect(relationView.hasUnconfirmedSave).toBe(true)
      expect(relationView.dirtyTracking.isPendingCreate(rowId)).toBe(true)
      expect(editor.text()).toContain('核验保存结果')
      expect(editor.findAll('button').find(button => button.text() === '取消')?.element.hasAttribute('disabled')).toBe(true)
      const postsBeforeVerify = http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD').length
      await editor.findAll('button').find(button => button.text() === '核验保存结果')!.trigger('click')
      await flushPromises()
      await flushPromises()
      expect(http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(postsBeforeVerify)
      expect(relationView.hasUnconfirmedSave).toBe(false)
      expect(relationView.dirtyTracking.isPendingCreate(rowId)).toBe(false)
      expect(wrapper.findComponent(TableRelationDialog).exists()).toBe(false)
    } finally {
      requestOwner.executeRequest = originalExecute
    }
  })

  it('loads endpoint field denial from the actual relation query permission response', async () => {
    http.deniedFieldsByModel[DATABASE_CATALOG_RELATION_MODEL] = ['pktable']
    http.rows[DATABASE_CATALOG_RELATION_MODEL]!.push({
      rowid: 'RL3', pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders', fkdbid: 'DB1', fktbid: 'T3',
      fktable: 'LineItems', rlname: 'Orders to LineItems', RelshipExp: relationFilter('existing'), IsCascadeDeletion: 0,
    })
    const {relationView} = await openRelationWorkspace()
    expect(relationView.requestState).toBe(RequestState.Loaded)
    const original = relationView.rows.find((row: DataRow) => relationView.getPkKey(row) === 'RL3')!
    expect(relationView.fieldAccess(original, 'pktable').write).toBe('denied')
    expect(relationView.getEditingPatch('RL3')).toBeUndefined()
    expect(relationView.getEditingRow('RL3')).toMatchObject({pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders',
      fkdbid: 'DB1', fktbid: 'T3', fktable: 'LineItems'})
  })

  it('binds peer selection to a paged same-database DataView that excludes the current table', async () => {
    for (let index = 1; index <= 24; index++) http.rows[DATABASE_CATALOG_TABLE_MODEL]!.push({
      rowid: `T-PEER-${index}`, dbid: 'DB1', tblname: `Peer${index}`, tbldesc: '', schemaName: 'dbo', status: 1,
    })
    const {designDialog, dataSet, relationView} = await openRelationWorkspace()
    const addRelation = designDialog.findAll('button').find(button => button.text() === '新增')
    await addRelation!.trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.body).findAll('.el-dialog').at(-1)!
    const peerField = dialog.findComponent(FieldSelect)
    expect.soft(peerField.exists()).toBe(true)
    const peers = dataSet.getView(DATABASE_CATALOG_TABLE_MODEL, 'relationPeers')
    expect.soft(peers).toBeTruthy()
    if (!peers) return
    expect.soft(peerField.props('field')).toBe('pktbid')
    expect.soft(peerField.props('optionDataViewKey')).toBe(buildDataViewKey(
      DATABASE_CATALOG_TABLE_MODEL, 'relationPeers', DATABASE_TABLE_VIEW_SCENARIO_ID,
    ))
    expect.soft(peerField.props('optionDataMember')).toBe('rows')
    expect.soft(peerField.props('options')).toBeUndefined()
    expect(peers.queryConfig.allPages).toBe(false)
    expect(peers.total).toBeGreaterThan(peers.rows.length)
    expect(peers.rows.length).toBeLessThanOrEqual(peers.pageSize)
    expect(peers.rows.every((row: DataRow) => row['dbid'] === 'DB1' && peers.getPkKey(row) !== 'T1')).toBe(true)
    const request = http.requests.filter(item => item.url === '/api/DataOperation/GetData').find(item => {
      const data = item.data as {Table?: Array<{Name?: string; Filter?: unknown}>}
      return data.Table?.some(table => table.Name === DATABASE_CATALOG_TABLE_MODEL && JSON.stringify(table.Filter).includes('T1'))
    })
    expect(request).toBeTruthy()
    peers.page = 2
    await peers.refresh()
    expect(peers.rows.every((row: DataRow) => row['dbid'] === 'DB1' && peers.getPkKey(row) !== 'T1')).toBe(true)
    expect(relationView.getSelectedValues()).toHaveLength(1)
  })

  it('does not open a relation editor while its owning query is Loading', async () => {
    const {designDialog, relationView} = await openRelationWorkspace()
    const row = designDialog.findAll('.el-table__body-wrapper tbody tr').find(item => item.text().includes('Orders to Other'))
    expect(row).toBeTruthy()
    await row!.trigger('click')
    await flushPromises()
    const requestOwner = http as unknown as {executeRequest: (config: RequestConfig) => Promise<HttpResponse<unknown>>}
    const originalExecute = requestOwner.executeRequest.bind(http)
    let markStarted!: () => void
    let release!: () => void
    const started = new Promise<void>(resolve => {markStarted = resolve})
    const gate = new Promise<void>(resolve => {release = resolve})
    let holding = false
    requestOwner.executeRequest = async config => {
      const response = await originalExecute(config)
      const request = config as {url?: string; data?: {Table?: Array<{Name?: string}>}}
      if (!holding && request.url === '/api/DataOperation/GetData'
        && request.data?.Table?.some(table => table.Name === DATABASE_CATALOG_RELATION_MODEL)) {
        holding = true
        markStarted()
        await gate
      }
      return response
    }
    const pendingRefresh = relationView.refresh()
    await started
    try {
      expect(relationView.requestState).toBe(RequestState.Loading)
      const relationEditorOpen = () => new DOMWrapper(document.body).findAll('.el-dialog').some(dialog =>
        dialog.text().includes('新增表关系') || dialog.text().includes('编辑表关系'))
      const edit = designDialog.findAll('button').find(button => button.text() === '编辑')
      expect(edit).toBeTruthy()
      if (!edit!.element.hasAttribute('disabled')) {
        await edit!.trigger('click')
        await flushPromises()
      }
      expect(relationEditorOpen()).toBe(false)
      expect(relationView.hasEditingChanges()).toBe(false)
    } finally {
      release()
      await pendingRefresh
      requestOwner.executeRequest = originalExecute
    }
  })

  it('submits only the requested relation row through the real DataSet owner and preserves a JSON payload', async () => {
    const {dataSet, relationView} = await openRelationWorkspace()
    await relationView.addRow({rowid: 'REL-TARGET', pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders',
      fkdbid: 'DB1', fktbid: 'T3', fktable: 'LineItems', rlname: 'Orders to LineItems',
      RelshipExp: genericJsonPayload('target'), IsCascadeDeletion: 0})
    await relationView.addRow({rowid: 'REL-OTHER', pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders',
      fkdbid: 'DB1', fktbid: 'T3', fktable: 'LineItems', rlname: 'unrelated',
      RelshipExp: genericJsonPayload('other'), IsCascadeDeletion: 0})
    await dataSet.saveChanges({views: [{tableName: DATABASE_CATALOG_RELATION_MODEL,
      viewId: DATABASE_CATALOG_RELATION_TABLE_VIEW, ids: ['REL-TARGET']}]})

    const write = http.requests.find(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')
    const payload = write?.data as Array<{TableName?: string; CrudModel?: {Added?: Array<Record<string, unknown>>; Changed?: Array<Record<string, unknown>>}}>
    const relationAction = payload?.find(item => item.TableName === DATABASE_CATALOG_RELATION_MODEL)
    expect(relationAction?.CrudModel?.Added?.map(row => row['rowid'])).toEqual(['REL-TARGET'])
    expect(relationAction?.CrudModel?.Added?.[0]?.['RelshipExp']).toEqual(genericJsonPayload('target'))
    expect(relationView.dirtyTracking.isPendingCreate('REL-OTHER')).toBe(true)
  })

  it('preserves a relation pending row and generic JSON payload after a real query owner refusal', async () => {
    const {dataSet, relationView} = await openRelationWorkspace()
    await relationView.addRow({rowid: 'REL-REFUSED', pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders',
      fkdbid: 'DB1', fktbid: 'T3', fktable: 'LineItems', rlname: 'Orders to LineItems',
      RelshipExp: genericJsonPayload('preserve-on-refusal'), IsCascadeDeletion: 0})
    http.rejectNextRelationSave = true
    await expect(dataSet.saveChanges({views: [{tableName: DATABASE_CATALOG_RELATION_MODEL,
      viewId: DATABASE_CATALOG_RELATION_TABLE_VIEW, ids: ['REL-REFUSED']}]})).rejects.toThrow('服务器拒绝关系保存')
    expect(relationView.dirtyTracking.isPendingCreate('REL-REFUSED')).toBe(true)
    expect(relationView.getEditingRow('REL-REFUSED')?.['RelshipExp']).toEqual(genericJsonPayload('preserve-on-refusal'))
    expect(http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1)
  })

  it('keeps an unknown relation save capture for a generic JSON payload and does not send a second POST', async () => {
    const {dataSet, relationView} = await openRelationWorkspace()
    await relationView.addRow({rowid: 'REL-UNKNOWN', pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders',
      fkdbid: 'DB1', fktbid: 'T3', fktable: 'LineItems', rlname: 'Orders to LineItems',
      RelshipExp: genericJsonPayload('unknown'), IsCascadeDeletion: 0})
    const requestOwner = http as unknown as {executeRequest: (config: RequestConfig) => Promise<HttpResponse<unknown>>}
    const originalExecute = requestOwner.executeRequest.bind(http)
    let loseResponse = true
    requestOwner.executeRequest = async config => {
      const response = await originalExecute(config)
      if (loseResponse && config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
        loseResponse = false
        throw new Error('关系保存服务已受理但客户端未收到回执')
      }
      return response
    }
    await expect(dataSet.saveChanges({views: [{tableName: DATABASE_CATALOG_RELATION_MODEL,
      viewId: DATABASE_CATALOG_RELATION_TABLE_VIEW, ids: ['REL-UNKNOWN']}]})).rejects.toThrow('关系保存服务已受理但客户端未收到回执')
    const writesAfterUnknown = http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD').length
    expect(relationView.hasUnconfirmedSave).toBe(true)
    await dataSet.saveChanges({views: [{tableName: DATABASE_CATALOG_RELATION_MODEL,
      viewId: DATABASE_CATALOG_RELATION_TABLE_VIEW, ids: ['REL-UNKNOWN']}]})
    expect(http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(writesAfterUnknown)
    expect(relationView.hasUnconfirmedSave).toBe(false)
    expect(relationView.dirtyTracking.isPendingCreate('REL-UNKNOWN')).toBe(false)
    expect(http.rows[DATABASE_CATALOG_RELATION_MODEL]?.find(row => row['rowid'] === 'REL-UNKNOWN')?.['RelshipExp'])
      .toEqual(genericJsonPayload('unknown'))
    requestOwner.executeRequest = originalExecute
  })

  it('isolates a late relation query after switching the selected table', async () => {
    http.rows[DATABASE_CATALOG_RELATION_MODEL]!.push({
      rowid: 'RL3', pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders', fkdbid: 'DB1', fktbid: 'T3',
      fktable: 'LineItems', rlname: 'Orders.Id=LineItems.OrderId', IsCascadeDeletion: 0,
    })
    const {wrapper, designDialog, relationView} = await openRelationWorkspace()
    const requestOwner = http as unknown as {executeRequest: (config: RequestConfig) => Promise<HttpResponse<unknown>>}
    const originalExecute = requestOwner.executeRequest.bind(http)
    let markStarted!: () => void
    let release!: () => void
    const started = new Promise<void>(resolve => {markStarted = resolve})
    const gate = new Promise<void>(resolve => {release = resolve})
    let holding = false
    requestOwner.executeRequest = async config => {
      const response = await originalExecute(config)
      const request = config as {url?: string; data?: {Table?: Array<{Name?: string; Filter?: unknown}>}}
      const filter = JSON.stringify(request.data?.Table?.find(table => table.Name === DATABASE_CATALOG_RELATION_MODEL)?.Filter ?? '')
      if (!holding && request.url === '/api/DataOperation/GetData' && filter.includes('T1')) {
        holding = true
        markStarted()
        await gate
      }
      return response
    }
    const pendingOldQuery = relationView.refresh()
    await started
    try {
      const tableList = wrapper.findAllComponents(RendererTable).find(table => table.find('.el-table__body-wrapper').text().includes('LineItems'))
      const target = tableList?.findAll('.el-table__body-wrapper tbody tr').find(row => row.text().includes('LineItems'))
      expect(target).toBeTruthy()
      await target!.trigger('click')
      await flushPromises()
      await flushPromises()
      expect(relationView.rows.map((row: DataRow) => relationView.getPkKey(row))).toEqual(['RL3'])
      release()
      await pendingOldQuery
      await flushPromises()
      expect(relationView.rows.map((row: DataRow) => relationView.getPkKey(row))).toEqual(['RL3'])
    } finally {
      release()
      await pendingOldQuery
      requestOwner.executeRequest = originalExecute
    }
    expect(designDialog.text()).toContain('物理表：LineItems')
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
