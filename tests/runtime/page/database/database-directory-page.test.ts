import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView, useRoute} from 'vue-router'
import {defineComponent, h} from 'vue'
import ElementPlus from 'element-plus'
import {RendererDialog, RendererForm, RendererTable, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {NAV_KEY, useNavigation, type NavigationContext, type RuntimeNavigationItem} from '@spark-appworks/spark-app'
import type {DataRow, DataView as SparkDataView} from '@spark-appworks/spark-data'
import DatabaseDirectoryPage from '@/views/DataBaseManage/DataBaseManage/index.vue'
import {DATABASE_TABLE_VIEW_SCENARIO_ID, DatabaseTableViewHttp, bootstrapDatabaseTableViewRuntime} from './database-table-view.fixture'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {DATABASE_CATALOG_DB_MODEL} from '@/lowcode/resources/database/lowcode-database-table-view'
import {LowcodeDatabaseDirectory} from '@/lowcode/resources/database/lowcode-database-directory'
import {databaseTableViewModels} from './database-table-view.fixture'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'

const mocks = vi.hoisted(() => ({
  readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn(),
  dirtySources: [] as Array<{isDirty: boolean}>, navItems: [] as RuntimeNavigationItem[],
  activePath: [] as RuntimeNavigationItem[],
}))
let http: DatabaseTableViewHttp, runtime: DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: mocks.readRequestScope, application: {get: () => null}, dataSpace: {design: mocks, get runtime() {return runtime}}},
}))
vi.mock('@spark-appworks/spark-app', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  getNavTree: () => ({items: mocks.navItems}),
  useSystemPageDirtySource: (source: {isDirty: boolean}) => {mocks.dirtySources.push(source)},
}))

const wrappers: VueWrapper[] = []
const dynamicHosts: Array<ReturnType<typeof createDynamicRouter>> = []
const originalStubs = {...config.global.stubs}
const targetPath = '/features/data-platform/database-management/table-and-view/ui/table-and-view-page'
const navigateTo = vi.fn()
const navigateToPath = vi.fn()
const navigation = {activePath: {value: mocks.activePath}, navigateTo, navigateToPath} as unknown as NavigationContext
const directoryModule: RuntimeNavigationItem = {id: 'directory-module', title: '数据库管理模块', itemKind: 'module'}
const directoryNode: RuntimeNavigationItem = {id: 'directory-source', title: '数据库目录', path: '/DataBaseManage/DataBaseManage/index', itemKind: 'system-page'}
const tableViewNode: RuntimeNavigationItem = {id: 'table-view-target', title: '表和视图管理', path: `${targetPath}?view=main#top`, itemKind: 'system-page'}

beforeEach(() => {
  http = new DatabaseTableViewHttp()
  runtime = bootstrapDatabaseTableViewRuntime(http, mocks)
  mocks.dirtySources.splice(0)
  mocks.navItems.splice(0, mocks.navItems.length, {...directoryModule, children: [directoryNode, tableViewNode]})
  mocks.activePath.splice(0, mocks.activePath.length, mocks.navItems[0]!, directoryNode)
  directoryNode.hidden = false
  directoryNode.disabled = false
  navigateTo.mockClear()
  navigateToPath.mockClear()
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  dynamicHosts.splice(0).forEach(dynamic => dynamic.resetSystemPageInstances())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  config.global.stubs = originalStubs
})

async function open(identity: Record<string, unknown> = {systemPageIdentityHost: true, systemPageIdentityState: 'resolved', nodeId: directoryNode.id}): Promise<VueWrapper> {
  const router = createRouter({history: createMemoryHistory(), routes: [
    {path: '/', component: DatabaseDirectoryPage, meta: {blueprintScenarioId: DATABASE_TABLE_VIEW_SCENARIO_ID, ...identity}},
  ]})
  await router.push('/')
  await router.isReady()
  const wrapper = mount(DatabaseDirectoryPage, {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()], provide: {[NAV_KEY as symbol]: navigation}}})
  wrappers.push(wrapper)
  await flushPromises()
  await flushPromises()
  return wrapper
}

function pageButton(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find(item => item.text() === label)
  expect(button).toBeTruthy()
  return button!
}

async function selectRow(table: VueWrapper): Promise<void> {
  await table.find('.el-table__body-wrapper tbody tr').trigger('click')
  await flushPromises()
}

describe('database directory page', () => {
  it('renders both formal DataViews without implicit server filtering and guards dirty DataView state', async () => {
    const wrapper = await open()
    expect(wrapper.findAllComponents(RendererTable)).toHaveLength(2)
    expect(wrapper.text()).toContain('选择服务器后可新增数据库')
    expect(wrapper.text()).not.toContain('按服务器筛选数据库')
    const requests = http.requests.filter(request => request.url === '/api/DataOperation/GetData')
    const dbRequest = requests.find(request => JSON.stringify(request.data).includes('_base_dbInfo'))
    expect(dbRequest).toBeTruthy()
    expect(JSON.stringify(dbRequest?.data)).toContain('PageParam')
    expect((dbRequest?.data as {Table: Array<{Filter: unknown}>}).Table[0]?.Filter).toBeNull()
    expect(mocks.dirtySources.at(-1)?.isDirty).toBe(false)
    await selectRow(wrapper.findAllComponents(RendererTable)[0]!)
    await pageButton(wrapper, '新增数据库').trigger('click')
    await flushPromises()
    expect(mocks.dirtySources.at(-1)?.isDirty).toBe(true)
    const dialog = wrapper.findAll('.el-dialog').at(-1)!
    await dialog.findAll('button').find(button => button.text() === '取消')!.trigger('click')
    await flushPromises()
    expect(mocks.dirtySources.at(-1)?.isDirty).toBe(false)
  })

  it('includes standard DataView edits in the native page dirty guard', async () => {
    const load = vi.spyOn(LowcodeDatabaseDirectory, 'loadCatalog')
    const wrapper = await open()
    const dataSet = await load.mock.results[0]?.value
    const databaseView = dataSet?.getView('_base_dbInfo', 'default')
    const row = databaseView?.rows[0]
    expect(databaseView && row).toBeTruthy()
    databaseView!.updateEditingValue(databaseView!.getPkKey(row!), 'Remark', '尚未保存')
    expect(mocks.dirtySources.at(-1)?.isDirty).toBe(true)
  })

  it('opens an edit form for the selected existing database and saves only its editable fields', async () => {
    const load = vi.spyOn(LowcodeDatabaseDirectory, 'loadCatalog')
    const wrapper = await open()
    const dataSet = await load.mock.results[0]?.value
    const dbView = dataSet?.getView(DATABASE_CATALOG_DB_MODEL, 'default')
    expect(dbView?.rows[0]).toBeTruthy()
    const save = vi.spyOn(dataSet!, 'saveChanges')

    await selectRow(wrapper.findAllComponents(RendererTable)[1]!)
    const editButton = wrapper.findAll('button').find(button => button.text() === '编辑数据库')
    expect(editButton, '选中既有数据库行后应提供编辑入口').toBeTruthy()
    await editButton!.trigger('click')
    await flushPromises()

    const dialog = wrapper.findAll('.el-dialog').at(-1)!
    expect(dialog.exists()).toBe(true)
    const form = dialog.findComponent(RendererForm)
    expect(form.exists()).toBe(true)
    const editName = dialog.findAll('.el-form-item').find(item => item.find('label').text() === '数据库名称')
    expect(editName).toBeTruthy()
    expect(dialog.text()).not.toContain('类型')
    await editName!.get('input').setValue('业务库-修改')
    const remark = dialog.findAll('.el-form-item').find(item => item.find('label').text() === '备注')
    expect(remark).toBeTruthy()
    await remark!.get('input').setValue('来自页面编辑')
    await pageButton(wrapper, '保存').trigger('click')
    await flushPromises()
    await flushPromises()

    const id = dbView!.getPkKey(dbView!.rows[0]!)
    expect(save).toHaveBeenCalledWith({views: [{tableName: DATABASE_CATALOG_DB_MODEL, viewId: 'default', ids: [id]}]})
    const request = http.requests.find(item => item.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')
    const payload = request?.data as Array<{TableName?: string; CrudModel?: {Changed?: Record<string, unknown>[]; Added?: unknown[]; Deleted?: unknown[]}}>
    expect(payload).toHaveLength(1)
    expect(payload[0]).toMatchObject({TableName: DATABASE_CATALOG_DB_MODEL,
      CrudModel: {Changed: [expect.objectContaining({rowid: id, Name: '业务库-修改', Remark: '来自页面编辑'})]}})
    expect(payload[0]?.CrudModel?.Added ?? []).toHaveLength(0)
    expect(payload[0]?.CrudModel?.Deleted ?? []).toHaveLength(0)
  })

  it('cancels edits to an existing database row and restores the bound DataView values', async () => {
    const load = vi.spyOn(LowcodeDatabaseDirectory, 'loadCatalog')
    const wrapper = await open()
    const dataSet = await load.mock.results[0]?.value
    const dbView = dataSet?.getView(DATABASE_CATALOG_DB_MODEL, 'default')
    const row = dbView?.rows[0]
    expect(row).toBeTruthy()
    const before = {Name: row!['Name'], SchemaName: row!['SchemaName'], Remark: row!['Remark']}

    await selectRow(wrapper.findAllComponents(RendererTable)[1]!)
    const editButton = wrapper.findAll('button').find(button => button.text() === '编辑数据库')
    expect(editButton, '选中既有数据库行后应提供编辑入口').toBeTruthy()
    await editButton!.trigger('click')
    await flushPromises()
    const dialog = wrapper.findAll('.el-dialog').at(-1)!
    const name = dialog.findAll('.el-form-item').find(item => item.find('label').text() === '数据库名称')!
    await name.get('input').setValue('应取消')
    const cancel = dialog.findAll('button').find(button => button.text() === '取消')
    expect(cancel).toBeTruthy()
    await cancel!.trigger('click')
    await flushPromises()

    expect(row).toMatchObject(before)
    expect(dbView!.hasEditingChanges(dbView!.getPkKey(row!))).toBe(false)
    expect(http.requests.some(item => item.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(false)
  })

  it('confirms deletion by database name and deletes only the row captured when confirmation opened', async () => {
    http.rows[DATABASE_CATALOG_DB_MODEL]!.push({rowid: 'DB2', serverId: 'S1', Name: '归档库', ServerName: '主库', SchemaName: 'dbo', Remark: ''})
    http.allowDeleteByModel.add(DATABASE_CATALOG_DB_MODEL)
    const load = vi.spyOn(LowcodeDatabaseDirectory, 'loadCatalog')
    const wrapper = await open()
    const dataSet = await load.mock.results[0]?.value
    const dbView = dataSet?.getView(DATABASE_CATALOG_DB_MODEL, 'default')
    expect(dbView?.rows.length).toBeGreaterThan(1)
    const captured = dbView!.rows[0]!
    const other = dbView!.rows[1]!
    const capturedId = dbView!.getPkKey(captured)!
    const otherId = dbView!.getPkKey(other)!
    const name = String(captured['Name'])
    const save = vi.spyOn(dataSet!, 'saveChanges')

    const table = wrapper.findAllComponents(RendererTable)[1]!
    await table.findAll('.el-table__body-wrapper tbody tr')[0]!.trigger('click')
    await flushPromises()
    const deleteButton = wrapper.findAll('button').find(button => button.text() === '删除')
    expect(deleteButton, '选中目录行后应有删除入口').toBeTruthy()
    await deleteButton!.trigger('click')
    await flushPromises()
    let dialog = wrapper.findAll('.el-dialog').at(-1)!
    const rendererDialog = wrapper.findAllComponents(RendererDialog).find(item => item.props('modelValue') === true)
    expect(rendererDialog?.props('dataViewKey')).toBe(`${dataSet!.scenarioId}@${DATABASE_CATALOG_DB_MODEL}@default`)
    expect(dialog.text()).toContain(name)
    expect(dialog.text()).toContain('确认删除')
    const cancel = dialog.findAll('button').find(button => button.text() === '取消')
    expect(cancel).toBeTruthy()
    await cancel!.trigger('click')
    await flushPromises()
    expect(save).not.toHaveBeenCalled()
    expect(dbView!.rows.some((row: DataRow) => dbView!.getPkKey(row) === capturedId)).toBe(true)

    await deleteButton!.trigger('click')
    await flushPromises()
    dialog = wrapper.findAll('.el-dialog').at(-1)!
    const rows = table.findAll('.el-table__body-wrapper tbody tr')
    await rows[1]!.trigger('click')
    await flushPromises()
    const confirm = dialog.findAll('button').find(button => button.text() === '确认删除')
    expect(confirm).toBeTruthy()
    await confirm!.trigger('click')
    await flushPromises()
    await flushPromises()
    expect(save).toHaveBeenCalledWith({views: [{tableName: DATABASE_CATALOG_DB_MODEL, viewId: 'default', ids: [capturedId]}]})
    expect(dbView!.rows.some((row: DataRow) => dbView!.getPkKey(row) === capturedId)).toBe(false)
    expect(dbView!.rows.some((row: DataRow) => dbView!.getPkKey(row) === otherId)).toBe(true)
  })

  it('keeps the confirmation open after an unknown delete and exposes the original DataSet verification action', async () => {
    http.allowDeleteByModel.add(DATABASE_CATALOG_DB_MODEL)
    const load = vi.spyOn(LowcodeDatabaseDirectory, 'loadCatalog')
    const wrapper = await open()
    const dataSet = await load.mock.results[0]?.value
    expect(dataSet).toBeTruthy()
    const dbView = dataSet!.getView(DATABASE_CATALOG_DB_MODEL, 'default')!
    const row = dbView.rows[0]!
    const id = dbView.getPkKey(row)!
    await selectRow(wrapper.findAllComponents(RendererTable)[1]!)
    const ops = await import('@/lowcode/resources/database/database-catalog-db-view-ops')
    let unconfirmed = false
    const deletion = vi.spyOn(ops, 'databaseCatalogDbDelete').mockImplementation(async () => {
      if (!unconfirmed) {
        unconfirmed = true
        Object.defineProperty(dbView, 'hasUnconfirmedSave', {configurable: true, get: () => unconfirmed})
        throw new Error('删除结果尚未确认，请核验')
      }
      unconfirmed = false
      return undefined
    })

    await wrapper.findAll('button').find(button => button.text() === '删除')!.trigger('click')
    await flushPromises()
    let dialog = wrapper.findAll('.el-dialog').at(-1)!
    await dialog.findAll('button').find(button => button.text() === '确认删除')!.trigger('click')
    await flushPromises()
    dialog = wrapper.findAll('.el-dialog').at(-1)!
    expect(dialog.text()).toContain('核验只确认原提交')
    const verify = dialog.findAll('button').find(button => button.text() === '核验删除结果')
    expect(verify).toBeTruthy()
    expect(dialog.findAll('button').find(button => button.text() === '取消')?.attributes('disabled')).toBeDefined()

    await verify!.trigger('click')
    await flushPromises()
    expect(deletion).toHaveBeenCalledTimes(2)
    expect(deletion).toHaveBeenNthCalledWith(1, dataSet, dbView, id)
    expect(deletion).toHaveBeenNthCalledWith(2, dataSet, dbView, id)
    expect(wrapper.findAll('.el-dialog')).toHaveLength(0)
  })

  it('keeps the native page dirty while a DataView save result is unconfirmed', async () => {
    const load = vi.spyOn(LowcodeDatabaseDirectory, 'loadCatalog')
    await open()
    const dataSet = await load.mock.results[0]?.value
    const databaseView = dataSet?.getView('_base_dbInfo', 'default')
    expect(databaseView).toBeTruthy()
    Object.defineProperty(databaseView!, 'hasUnconfirmedSave', {configurable: true, get: () => true})
    expect(mocks.dirtySources.at(-1)?.isDirty).toBe(true)
  })

  it('discards a late create result after the old page instance is replaced', async () => {
    let releaseCreate!: () => void
    const gate = new Promise<void>(resolve => {releaseCreate = resolve})
    const ops = await import('@/lowcode/resources/database/database-catalog-db-view-ops')
    const original = ops.databaseCatalogDbBeginCreate
    const pending = vi.spyOn(ops, 'databaseCatalogDbBeginCreate').mockImplementation(async (...args) => {
      const edit = await original(...args)
      await gate
      return edit
    })
    const wrapper = await open()
    await selectRow(wrapper.findAllComponents(RendererTable)[0]!)
    await pageButton(wrapper, '新增数据库').trigger('click')
    await flushPromises()
    expect(pending).toHaveBeenCalledOnce()
    wrapper.unmount()
    const replacement = await open()
    await flushPromises()
    releaseCreate()
    await flushPromises()
    expect(replacement.text()).toContain('数据库管理')
    expect(replacement.findAll('.el-dialog')).toHaveLength(0)
  })

  it('does not publish a late unregistered-name result into the replacement page instance', async () => {
    let releaseQuery!: (names: readonly string[]) => void
    const gate = new Promise<readonly string[]>(resolve => {releaseQuery = resolve})
    const ops = await import('@/lowcode/resources/database/database-catalog-db-view-ops')
    const pending = vi.spyOn(ops, 'databaseCatalogQueryUnregisteredDbNames').mockReturnValue(gate)
    const wrapper = await open()
    await selectRow(wrapper.findAllComponents(RendererTable)[0]!)
    await pageButton(wrapper, '新增数据库').trigger('click')
    await flushPromises()
    const refresh = wrapper.findAll('button').find(button => button.text() === '刷新未登记库名')
    expect(refresh).toBeTruthy()
    await refresh!.trigger('click')
    await flushPromises()
    expect(pending).toHaveBeenCalledOnce()
    wrapper.unmount()
    const replacement = await open()
    await flushPromises()
    releaseQuery(['迟到物理库'])
    await flushPromises()
    expect(replacement.text()).not.toContain('迟到物理库')
  })

  it('uses the injected navigation context and preserves explicit target query and hash', async () => {
    const wrapper = await open()
    const tables = wrapper.findAllComponents(RendererTable)
    await selectRow(tables[1]!)
    await pageButton(wrapper, '管理').trigger('click')
    expect(navigateTo).toHaveBeenCalledWith(expect.objectContaining({id: tableViewNode.id,
      path: `${targetPath}?view=main&databaseId=DB1#top`}))
    expect(navigateToPath).not.toHaveBeenCalled()
  })

  it('resolves a cross-module duplicate only within the current host branch', async () => {
    const otherTarget: RuntimeNavigationItem = {id: 'other-module-target', title: 'duplicate', path: targetPath, itemKind: 'system-page'}
    mocks.navItems.push({id: 'other-module', title: '其他模块', itemKind: 'module', children: [otherTarget]})
    const wrapper = await open()
    await selectRow(wrapper.findAllComponents(RendererTable)[1]!)
    await pageButton(wrapper, '管理').trigger('click')
    expect(navigateTo).toHaveBeenCalledWith(expect.objectContaining({id: tableViewNode.id,
      path: `${targetPath}?view=main&databaseId=DB1#top`}))
  })

  it('navigates through real useNavigation and DynamicRouter with node identity and databaseId', async () => {
    const source = {...directoryNode, blueprintScenarioId: DATABASE_TABLE_VIEW_SCENARIO_ID}
    const selectedTarget = {...tableViewNode, blueprintScenarioId: 'target-selected-space'}
    const otherTarget: RuntimeNavigationItem = {id: 'duplicate-other-module', title: '重复路径节点', path: targetPath, itemKind: 'system-page'}
    const items = [
      {...directoryModule, children: [source, selectedTarget]},
      {id: 'other-module', title: '另一模块', itemKind: 'module', children: [otherTarget]},
    ] as RuntimeNavigationItem[]
    mocks.navItems.splice(0, mocks.navItems.length, ...items)
    const navRoot = {title: 'Root', childPlacement: 'sidebar' as const, items}
    const targetPage = defineComponent({setup() {
      const targetRoute = useRoute()
      return () => h('div', {id: 'database-target'}, String(targetRoute.meta['blueprintScenarioId'] ?? ''))
    }})
    const router = createRouter({history: createMemoryHistory(), routes: []})
    const dynamic = createDynamicRouter({router, pageComponent: DatabaseDirectoryPage, componentMap: {
      '/DataBaseManage/DataBaseManage/index': DatabaseDirectoryPage,
      [targetPath]: targetPage,
    }, loadNavigation: async () => navRoot})
    dynamicHosts.push(dynamic)
    await dynamic.registerRoutes()
    let navigationContext: NavigationContext | undefined
    const root = defineComponent({setup() {
      navigationContext = useNavigation(dynamic.getNavTree()!)
      return () => h(RouterView)
    }})
    const wrapper = mount(root, {attachTo: document.body,
      global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
    wrappers.push(wrapper)
    navigationContext!.navigateTo(source)
    await flushPromises()
    await flushPromises()
    const directoryRoute = router.currentRoute.value
    const directoryInstance = dynamic.getSystemPageInstance(directoryRoute)
    expect(directoryRoute.meta['nodeId']).toBe(source.id)
    expect(directoryInstance).toBeTruthy()
    const page = wrapper.findComponent(DatabaseDirectoryPage)
    expect(page.exists()).toBe(true)
    await selectRow(page.findAllComponents(RendererTable)[1]!)
    await pageButton(page, '管理').trigger('click')
    await flushPromises()
    await flushPromises()
    const targetRoute = router.currentRoute.value
    const targetInstance = dynamic.getSystemPageInstance(targetRoute)
    expect(targetRoute.query['__sparkNavigationId']).toBe(selectedTarget.id)
    expect(targetRoute.query['databaseId']).toBe('DB1')
    expect(targetRoute.meta['nodeId']).toBe(selectedTarget.id)
    expect(targetRoute.meta['blueprintScenarioId']).toBe('target-selected-space')
    expect(targetInstance).toBeTruthy()
    expect(targetInstance?.instanceId).not.toBe(directoryInstance?.instanceId)
    expect(wrapper.find('#database-target').text()).toBe('target-selected-space')
  })

  it('refuses duplicate targets within the current host branch', async () => {
    mocks.navItems[0]!['children']!.push({id: 'duplicate-target', title: '重复目标', path: targetPath, itemKind: 'system-page'})
    const wrapper = await open()
    await selectRow(wrapper.findAllComponents(RendererTable)[1]!)
    await pageButton(wrapper, '管理').trigger('click')
    expect(wrapper.text()).toContain('表和视图管理导航节点缺失、重复或不可用')
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('refuses navigation when the active source node no longer belongs to its current branch', async () => {
    mocks.navItems[0]!['children']!.splice(0, 1)
    const wrapper = await open()
    await selectRow(wrapper.findAllComponents(RendererTable)[1]!)
    await pageButton(wrapper, '管理').trigger('click')
    expect(wrapper.text()).toContain('表和视图管理导航节点缺失、重复或不可用')
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it.each([
    ['unresolved route identity', {systemPageIdentityHost: true, systemPageIdentityState: 'unresolved', nodeId: directoryNode.id}],
    ['active path identity mismatch', {systemPageIdentityHost: true, systemPageIdentityState: 'resolved', nodeId: 'different-source'}],
  ])('refuses navigation for %s', async (_label, identity) => {
    const wrapper = await open(identity)
    await selectRow(wrapper.findAllComponents(RendererTable)[1]!)
    await pageButton(wrapper, '管理').trigger('click')
    expect(wrapper.text()).toContain('当前数据库目录导航身份尚未解析')
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it.each(['hidden', 'disabled'] as const)('refuses navigation from a %s current source node', async state => {
    if (state === 'hidden') directoryNode.hidden = true
    else directoryNode.disabled = true
    const wrapper = await open()
    await selectRow(wrapper.findAllComponents(RendererTable)[1]!)
    await pageButton(wrapper, '管理').trigger('click')
    expect(wrapper.text()).toContain('表和视图管理导航节点缺失、重复或不可用')
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('passes the formal database primary key when rowid is not the model key', async () => {
    http.databasePrimaryKey = 'Id'
    http.rows[DATABASE_CATALOG_DB_MODEL]![0]!['Id'] = 'DB-PK-1'
    const dbModel = databaseTableViewModels[DATABASE_CATALOG_DB_MODEL]
    mocks.readModel.mockImplementation(({metaName}: {metaName: string}) => Promise.resolve(metaName === DATABASE_CATALOG_DB_MODEL
      ? {...dbModel, primaryKey: 'Id', fields: dbModel.fields.map(field => ({...field, primaryKey: field.name === 'Id'}))}
      : databaseTableViewModels[metaName as keyof typeof databaseTableViewModels]))
    const wrapper = await open()
    await selectRow(wrapper.findAllComponents(RendererTable)[1]!)
    await pageButton(wrapper, '管理').trigger('click')
    expect(navigateTo).toHaveBeenCalledWith(expect.objectContaining({id: tableViewNode.id,
      path: `${targetPath}?view=main&databaseId=DB-PK-1#top`}))
  })

  it('saves a database entered through the bound RendererForm and closes only after the DataSet receipt', async () => {
    const snapshot = (view: SparkDataView) => ({filterExpression: view.filterExpression, sortExpression: view.sortExpression,
      queryConfig: view.queryConfig, queryContext: view.queryContext, page: view.page, pageSize: view.pageSize,
      requestState: view.requestState, newRowNameAccess: view.newRowFieldAccess('Name')})
    let afterLoad: ReturnType<typeof snapshot> | undefined
    const originalLoad = LowcodeDatabaseDirectory.loadCatalog
    const load = vi.spyOn(LowcodeDatabaseDirectory, 'loadCatalog').mockImplementation(async id => {
      const ds = await originalLoad.call(LowcodeDatabaseDirectory, id)
      afterLoad = snapshot(ds.getView(DATABASE_CATALOG_DB_MODEL, 'default')!)
      return ds
    })
    const wrapper = await open()
    const dataSet = await load.mock.results[0]?.value
    expect(dataSet).toBeTruthy()
    const dbView = dataSet!.getView(DATABASE_CATALOG_DB_MODEL, 'default')!
    expect(afterLoad?.queryConfig).toMatchObject({allPages: false, autoQuery: true})
    expect(snapshot(dbView).queryConfig).toEqual(afterLoad?.queryConfig)
    const save = vi.spyOn(dataSet!, 'saveChanges')
    await selectRow(wrapper.findAllComponents(RendererTable)[0]!)
    await pageButton(wrapper, '新增数据库').trigger('click')
    await flushPromises()
    const form = wrapper.findComponent(RendererForm)
    expect(form.exists()).toBe(true)
    const nameField = form.findAll('.el-form-item').find(item => item.find('label').text() === '数据库名称')
    expect(nameField).toBeTruthy()
    const id = dbView.dirtyTracking.pendingCreateIds.values().next().value
    expect(id).toBeDefined()
    const nameInput = nameField!.get('input')
    expect(dbView.fieldAccess(dbView.getEditingRow(id!)!, 'Name')).toMatchObject({write: 'allowed'})
    expect(nameInput.attributes('disabled'), wrapper.html()).toBeUndefined()
    await nameInput.setValue('RendererForm库')
    await nameInput.trigger('input')
    await nameInput.trigger('change')
    await flushPromises()
    expect(dbView.getEditingRow(id!)?.['Name']).toBe('RendererForm库')
    await pageButton(wrapper, '新增').trigger('click')
    await flushPromises()
    await flushPromises()
    expect(save).toHaveBeenCalledWith({views: [{tableName: DATABASE_CATALOG_DB_MODEL, viewId: 'default', ids: [id]}]})
    const request = http.requests.find(item => item.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')
    const payload = request?.data as Array<{TableName?: string; CrudModel?: {Added?: Record<string, unknown>[]}}>
    expect(payload).toHaveLength(1)
    expect(payload[0]).toMatchObject({TableName: DATABASE_CATALOG_DB_MODEL, CrudModel: {Added: [expect.objectContaining({Name: 'RendererForm库', serverId: 'S1'})]}})
    expect(wrapper.findAll('.el-dialog')).toHaveLength(0)
    expect(dbView.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  const unavailableTargets: Array<[string, RuntimeNavigationItem[]]> = [
    ['missing', []],
    ['duplicate', [
      {id: 'duplicate-a', title: 'duplicate-a', path: targetPath, itemKind: 'system-page'},
      {id: 'duplicate-b', title: 'duplicate-b', path: targetPath, itemKind: 'system-page'},
    ]],
    ['disabled ancestor', [{id: 'disabled-parent', title: 'disabled-parent', disabled: true,
      children: [{id: 'nested-target', title: 'nested-target', path: targetPath, itemKind: 'system-page'}]}]],
  ]
  it.each(unavailableTargets)('refuses a %s table management target', async (_label, nodes) => {
    mocks.navItems[0]!['children']!.splice(1, 1, ...nodes)
    const wrapper = await open()
    await selectRow(wrapper.findAllComponents(RendererTable)[1]!)
    await pageButton(wrapper, '管理').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('表和视图管理导航节点缺失、重复或不可用')
    expect(navigateTo).not.toHaveBeenCalled()
  })
})
