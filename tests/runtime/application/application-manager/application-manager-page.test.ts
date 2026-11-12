import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus, {ElMessage} from 'element-plus'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {RequestState} from '@spark-appworks/spark-data'
import {RendererFilter, RendererTable, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {getVuePageEntry} from '@/registries/vue-page-registry'
import {getSystemScenarioResource, resolveSystemScenarioResource} from '@/registries/system-scenario-registry'
import {PROJECT_SWITCH_KEY} from '@/services/project/project-shell'
import {api, APPLICATION_MANAGER_PATH, APPLICATION_MANAGER_SCENARIO, resetApplicationManagerFixture} from './application-manager.fixture'
import {pagedata} from '../../page/api-provider/api-provider.fixture'

const pageMocks = vi.hoisted(() => ({submitDocument: vi.fn()}))

vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return api.state.http},
  lowcodeApi: {
    readRequestScope: (...args: unknown[]) => api.service.readRequestScope(...args),
    blueprint: {submitDocument: (...args: unknown[]) => pageMocks.submitDocument(...args)},
    dataSpace: {get design() {return api.service}, get runtime() {return api.state.runtime}},
  },
  lowcodeDesignFileUpload: {
    uploadWorkingText: async () => {throw new Error('应用管理页不写场景文件')},
    uploadTextVersion: async () => {throw new Error('应用管理页不写场景版本')},
  },
  createLowcodeProjectGateways: () => ({scenarioViews: {
    readScope: () => 'scope',
    readText: async (id: string) => id === APPLICATION_MANAGER_SCENARIO ? pagedata[id] ?? null : null,
    writeText: async () => {throw new Error('应用管理页不写场景文件')},
  }}),
  readLowcodePrincipal: () => ({applicationId: 'APP'}),
}))

const {default: ApplicationManagerPage} = await import('@/views/features/application/application-manager/ui/application-manager-page.vue')
const wrappers: VueWrapper[] = []
const originalStubs = {...config.global.stubs}
let http: ReturnType<typeof resetApplicationManagerFixture>
beforeEach(() => {
  http = resetApplicationManagerFixture()
  pageMocks.submitDocument.mockReset()
  pageMocks.submitDocument.mockResolvedValue({
    projectId: 'APP-1', kind: 'requirements-specification', status: 'submitted',
    coverage: 'legacy-menu-scope', message: '提交回执格式未知；文档生成状态未知',
  })
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  vi.restoreAllMocks(); vi.unstubAllGlobals()
  config.global.stubs = originalStubs
})

async function open(wait = true) {
  const observed = new Set<PageRuntime>()
  const load = PageRuntime.prototype.load
  vi.spyOn(PageRuntime.prototype, 'load').mockImplementation(function(this: PageRuntime) {
    observed.add(this)
    return load.call(this)
  })
  const router = createRouter({history: createMemoryHistory(), routes: [
    {path: `/apps/:projectId${APPLICATION_MANAGER_PATH}`, component: ApplicationManagerPage,
      meta: {blueprintScenarioId: APPLICATION_MANAGER_SCENARIO, nodeId: APPLICATION_MANAGER_SCENARIO, systemPageIdentityState: 'resolved'}},
    {path: '/:pathMatch(.*)*', component: defineComponent({setup: () => () => h('div')})},
  ]})
  await router.push(`/apps/APP${APPLICATION_MANAGER_PATH}`)
  await router.isReady()
  const switchAndReload = vi.fn(async () => ({assertCurrent: vi.fn()}))
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {
    attachTo: document.body,
    global: {
      stubs: {transition: false},
      plugins: [router, ElementPlus, Spark.createPlugin()],
      provide: {[PROJECT_SWITCH_KEY]: {switchAndReload}},
    },
  })
  wrappers.push(wrapper)
  if (wait) await vi.waitFor(async () => {
    await flushPromises()
    expect(wrapper.text()).not.toContain('正在读取应用目录')
    expect(wrapper.text()).not.toContain('正在读取状态选项')
  }, {timeout: 10000})
  await flushPromises()
  return {wrapper, router, observed, switchAndReload}
}

function getButton(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find(item => item.text().trim() === label)
  if (!button) throw new Error(`按钮不存在: ${label}`)
  return button
}

function currentView(observed: Set<PageRuntime>) {
  const runtime = [...observed].find(item => !item.destroyed && item.getDataSet(APPLICATION_MANAGER_SCENARIO))
  const dataSet = runtime?.getDataSet(APPLICATION_MANAGER_SCENARIO)
  if (!dataSet) throw new Error('应用管理正式数据集未装配')
  const view = dataSet?.getView('Base_AppSystemList', 'default')
  if (!view) throw new Error('应用管理正式视图未装配')
  const statusView = dataSet?.getView('应用系统状态', 'default')
  if (!statusView) throw new Error('应用管理正式状态字典视图未装配')
  const databaseRelationView = dataSet?.getView('Base_AppAndSource_Relation', 'default')
  const databaseView = dataSet?.getView('_base_dbInfo', 'default')
  const ownerView = dataSet?.getView('Base_MainBody_RoleUser', 'default')
  if (!databaseRelationView || !databaseView || !ownerView) throw new Error('应用管理正式关联视图未装配')
  return {runtime, dataSet, view, statusView, databaseRelationView, databaseView, ownerView}
}

describe('application manager restored through the formal DataView', () => {
  it('registers confirmed application, status, database relation, database and owner models', () => {
    const resource = getSystemScenarioResource('applicationManager')
    const page = getVuePageEntry(APPLICATION_MANAGER_PATH)
    const configText = readFileSync('config/pages/application/application-manager/pagedata.json', 'utf8')
    const scenario = JSON.parse(configText) as {scenarioId: string; tables: Record<string, {modelBinding: {modelId: string; modelName: string}; views: Record<string, {queryConfig?: {fields?: string[]}}>}>}
    expect(resolveSystemScenarioResource(APPLICATION_MANAGER_SCENARIO)).toEqual(resource)
    expect(resource.path).toBe('config/pages/application/application-manager/pagedata.json')
    expect(page?.source).toBe('src/views/features/application/application-manager/ui/application-manager-page.vue')
    expect(scenario.scenarioId).toBe(APPLICATION_MANAGER_SCENARIO)
    expect(scenario.tables['Base_AppSystemList']?.modelBinding).toEqual({
      modelId: `${APPLICATION_MANAGER_SCENARIO}p000`, modelName: 'Base_AppSystemList',
    })
    expect(scenario.tables['Base_AppSystemList']?.views['default']?.queryConfig?.fields)
      .toEqual(['rowid', 'AppDesc', 'AppName', 'WebUrl', 'DeveloperName', 'CreateTime', 'AppType'])
    expect(scenario.tables['应用系统状态']?.modelBinding).toEqual({
      modelId: `${APPLICATION_MANAGER_SCENARIO}p002`, modelName: '应用系统状态',
    })
    expect(scenario.tables['应用系统状态']?.views['default']?.queryConfig?.fields)
      .toEqual(['rowid', 'val', 'txt', 'ordIdx'])
    expect(scenario.tables['Base_AppAndSource_Relation']?.modelBinding).toEqual({
      modelId: `${APPLICATION_MANAGER_SCENARIO}p003`, modelName: 'Base_AppAndSource_Relation',
    })
    expect(scenario.tables['Base_AppAndSource_Relation']?.views['default']?.queryConfig?.fields)
      .toEqual(['rowid', 'sysid', 'type', 'conid', 'conName', 'isRef'])
    expect(scenario.tables['_base_dbInfo']?.modelBinding).toEqual({
      modelId: `${APPLICATION_MANAGER_SCENARIO}p004`, modelName: '_base_dbInfo',
    })
    expect(scenario.tables['_base_dbInfo']?.views['default']?.queryConfig?.fields).toEqual(['Id', 'Name'])
    expect(scenario.tables['Base_MainBody_RoleUser']?.modelBinding).toEqual({
      modelId: `${APPLICATION_MANAGER_SCENARIO}p007`, modelName: 'Base_MainBody_RoleUser',
    })
    expect(scenario.tables['Base_MainBody_RoleUser']?.views['default']?.queryConfig?.fields)
      .toEqual(['rowid', 'EntityPKValue', 'UserIdField'])
    expect(configText).not.toContain('app_status')
    expect(configText).not.toMatch(/db_relation_(show|sel)|Password|ConnString/i)
  })

  it('renders official fields, loads the status dictionary and pages the real DataView without writes', async () => {
    const {wrapper, observed} = await open()
    const table = wrapper.findAllComponents(RendererTable).find(item =>
      item.props('dataViewKey') === `${APPLICATION_MANAGER_SCENARIO}@Base_AppSystemList@default`)
    if (!table) throw new Error('应用目录表格未渲染')
    const {view, statusView} = currentView(observed)
    const children = table.props('children') as Array<{props?: {field?: string}}>
    const filter = table.props('filter') as {showExpressionEditor?: boolean; children?: Array<{props?: {
      field?: string; optionDataViewKey?: string; filterAlternatives?: Array<{field: string; operator: string}>
    }}>}
    expect(table.props('dataViewKey')).toBe(`${APPLICATION_MANAGER_SCENARIO}@Base_AppSystemList@default`)
    expect(table.props('autoColumns')).toBe(false)
    expect(children.map(field => field.props?.field))
      .toEqual(['AppDesc', 'AppName', 'WebUrl', 'DeveloperName', 'CreateTime', 'AppType'])
    expect(filter.showExpressionEditor).toBe(false)
    expect(filter.children?.map(field => field.props?.field))
      .toEqual(['AppDesc'])
    expect(filter.children?.[0]?.props?.filterAlternatives)
      .toEqual([{field: 'AppDesc', operator: 'contains'}, {field: 'AppName', operator: 'contains'}])
    expect(filter.children?.some(field => field.props?.field === 'AppType')).toBe(false)
    expect(table.findComponent(RendererFilter).exists()).toBe(true)
    expect(table.findAll('.el-table__header-wrapper th').map(header => header.text()))
      .toEqual(['#', '简称', '系统名称', 'WebUrl', '开发商名称', '创建时间', '状态', '操作'])
    expect(wrapper.findAll('button').filter(button => button.text().trim() === '刷新')).toHaveLength(1)
    expect(wrapper.text()).toContain('删除与项目管理因缺少完整服务合同暂不可用')
    for (const label of ['新增', '导出', '编辑', '删除', '项目管理', '报价管理']) {
      expect(getButton(wrapper, label).attributes('disabled')).toBeDefined()
    }
    expect(view.primaryKey).toBe('rowid')
    expect(view.getColumn('lingma_sys_ent')).toBeUndefined()
    expect(view.rows[0]).not.toHaveProperty('lingma_sys_ent')
    expect(view.fieldAccess(view.rows[0]!, 'rowid').read).toBe('visible')
    expect(view.fieldAccess(view.rows[0]!, 'WebUrl').read).toBe('visible')
    expect(view.fieldAccess(view.rows[0]!, 'AppName')).toMatchObject({read: 'visible', write: 'allowed'})
    expect(view.fieldAccess(view.rows[0]!, 'AppDesc')).toMatchObject({read: 'visible', write: 'allowed'})
    expect(view.fieldAccess(view.rows[0]!, 'WebUrl')).toMatchObject({read: 'visible', write: 'allowed'})
    expect(view.total).toBe(23)
    expect(view.rows).toHaveLength(10)
    expect(statusView.total).toBe(6)
    expect(statusView.rows.map(row => row['txt'])).toEqual(['策划', '开发', '测试', '运行', '维护', '停用'])

    await wrapper.get('.el-pagination .btn-next').trigger('click'); await flushPromises()
    expect(view.page).toBe(2)
    expect(view.rows).toHaveLength(10)
    await getButton(wrapper, '刷新').trigger('click'); await flushPromises()
    expect(view.page).toBe(2)
    expect(view.rows).toHaveLength(10)
    expect(http.saves).toHaveLength(0)
  })

  it('loads default database and owner relationship status through formal DataView cascades', async () => {
    const {wrapper, observed} = await open()
    const {dataSet, view, databaseRelationView, databaseView, ownerView} = currentView(observed)
    await vi.waitFor(async () => {
      await flushPromises()
      expect(databaseRelationView.requestState).toBe(RequestState.Loaded)
      expect(databaseView.requestState).toBe(RequestState.Loaded)
      expect(ownerView.requestState).toBe(RequestState.Loaded)
    })
    expect(view.currentRow?.['rowid']).toBe('APP-1')
    expect(databaseRelationView.rows.map(row => row['sysid'])).toEqual(['APP-1'])
    expect(databaseRelationView.rows.map(row => row['type'])).toEqual(['database'])
    expect(databaseRelationView.rows.map(row => row['isRef'])).toEqual([0])
    expect(databaseView.rows.map(row => row['Name'])).toEqual(['database name 1'])
    expect(ownerView.rows.map(row => row['EntityPKValue'])).toEqual(['APP-1'])
    expect(wrapper.text()).toContain('负责人关系：存在人员关联，负责人身份尚未确认')
    expect(wrapper.text()).toContain('数据库名称已读取')
    expect(wrapper.text()).not.toContain('UserIdField')
    expect(wrapper.text()).not.toContain('OWNER-1')
    expect(wrapper.findAllComponents(RendererTable).map(table => table.props('dataViewKey')))
      .toEqual([
        `${APPLICATION_MANAGER_SCENARIO}@Base_AppSystemList@default`,
        `${APPLICATION_MANAGER_SCENARIO}@Base_AppAndSource_Relation@default`,
        `${APPLICATION_MANAGER_SCENARIO}@_base_dbInfo@default`,
      ])
    expect(dataSet.getParentCascades('Base_AppAndSource_Relation', 'default')[0]?.filterBindings)
      .toEqual([{sourceField: 'rowid', targetField: 'sysid', operator: 'eq'}])
    expect(dataSet.getParentCascades('Base_MainBody_RoleUser', 'default')[0]?.filterBindings)
      .toEqual([{sourceField: 'rowid', targetField: 'EntityPKValue', operator: 'eq'}])

    view.setCurrentRow(view.rows[1]!)
    await vi.waitFor(async () => {
      await flushPromises()
      expect(databaseRelationView.rows.map(row => row['sysid'])).toEqual(['APP-2'])
      expect(databaseView.rows.map(row => row['Name'])).toEqual(['database name 2'])
      expect(ownerView.requestState).toBe(RequestState.Loaded)
    })
    expect(wrapper.text()).toContain('负责人关系：当前查询未返回人员关联')
    expect(http.saves).toHaveLength(0)
  })

  it('does not present an arbitrary database when multiple defaults exist', async () => {
    http.records['Base_AppAndSource_Relation']!.push({
      rowid: 'RELATION-DUPLICATE', sysid: 'APP-1', type: 'database',
      conid: 'DATABASE-2', conName: 'other database', isRef: 0,
    })
    const {wrapper, observed} = await open()
    const {databaseRelationView} = currentView(observed)
    await vi.waitFor(() => expect(databaseRelationView.total).toBe(2))
    expect(wrapper.text()).toContain('存在多条默认数据库关联，无法确定')
    expect(wrapper.text()).not.toContain('database name 1')
    expect(wrapper.findAllComponents(RendererTable)).toHaveLength(2)
    expect(http.saves).toHaveLength(0)
  })

  it.each(['hidden', 'masked'] as const)('does not claim to read a %s database name', async mode => {
    const permissions = mode === 'hidden' ? http.hiddenFields : http.maskedFields
    permissions['_base_dbInfo'] = ['Name']
    const {wrapper, observed} = await open()
    const {databaseView} = currentView(observed)
    await vi.waitFor(() => expect(databaseView.requestState).toBe(RequestState.Loaded))
    expect(wrapper.text()).toContain('关联已记录，但无权限读取数据库名称')
    expect(wrapper.text()).not.toContain('数据库名称已读取')
    expect(wrapper.text()).not.toContain('database name 1')
    expect(http.saves).toHaveLength(0)
  })

  it('reports a database result with a missing name', async () => {
    http.records['_base_dbInfo']![0]!['Name'] = ''
    const {wrapper, observed} = await open()
    const {databaseView} = currentView(observed)
    await vi.waitFor(() => expect(databaseView.requestState).toBe(RequestState.Loaded))
    expect(wrapper.text()).toContain('关联已记录，但数据库名称缺失')
    expect(wrapper.text()).not.toContain('数据库名称已读取')
    expect(http.saves).toHaveLength(0)
  })

  it('reports an ambiguous owner relationship without choosing a row', async () => {
    http.records['Base_MainBody_RoleUser']!.push({
      rowid: 'OWNER-2', EntityPKValue: 'APP-1', UserIdField: 'USER-2',
    })
    const {wrapper, observed} = await open()
    const {ownerView} = currentView(observed)
    await vi.waitFor(() => expect(ownerView.total).toBe(2))
    expect(wrapper.text()).toContain('存在多条人员关联，无法确认负责人')
    expect(wrapper.text()).not.toContain('USER-1')
    expect(wrapper.text()).not.toContain('USER-2')
    expect(http.saves).toHaveLength(0)
  })

  it('distinguishes an unreadable owner identity from an absent relationship', async () => {
    http.hiddenFields['Base_MainBody_RoleUser'] = ['UserIdField']
    const {wrapper, observed} = await open()
    const {ownerView} = currentView(observed)
    await vi.waitFor(() => expect(ownerView.requestState).toBe(RequestState.Loaded))
    expect(wrapper.text()).toContain('无权限读取人员身份，无法确认负责人')
    expect(wrapper.text()).not.toContain('负责人关系：当前查询未返回人员关联')
    expect(http.saves).toHaveLength(0)
  })

  it('reports an owner relation with a missing identity', async () => {
    http.records['Base_MainBody_RoleUser']![0]!['UserIdField'] = ''
    const {wrapper, observed} = await open()
    const {ownerView} = currentView(observed)
    await vi.waitFor(() => expect(ownerView.requestState).toBe(RequestState.Loaded))
    expect(wrapper.text()).toContain('关联缺少人员身份，无法确认负责人')
    expect(http.saves).toHaveLength(0)
  })

  it('applies an official AppName filter and keeps paging on the same DataView', async () => {
    const {wrapper, observed} = await open()
    const {view} = currentView(observed)
    await view.executeFilter({field: 'AppName', operator: 'eq', value: 'alpha'}, true)
    await flushPromises()
    expect(view.filterExpression).toEqual({field: 'AppName', operator: 'eq', value: 'alpha'})
    expect(view.total).toBe(12)
    expect(view.rows).toHaveLength(10)
    await wrapper.get('.el-pagination .btn-next').trigger('click'); await flushPromises()
    expect(view.page).toBe(2)
    expect(view.rows).toHaveLength(2)
    expect(view.rows.every(row => row['AppName'] === 'alpha')).toBe(true)
    await view.executeFilter(undefined, true)
    await flushPromises()
    expect(view.total).toBe(23)
    expect(view.page).toBe(1)
    expect(http.saves).toHaveLength(0)
  })

  it('applies one keyword as AppDesc OR AppName contains and keeps the existing DataView', async () => {
    const {wrapper, observed} = await open()
    const {view} = currentView(observed)
    const table = wrapper.findAllComponents(RendererTable).find(item =>
      item.props('dataViewKey') === `${APPLICATION_MANAGER_SCENARIO}@Base_AppSystemList@default`)
    if (!table) throw new Error('应用目录表格未渲染')
    const filter = table.findComponent(RendererFilter)
    const filterApi = filter.vm as unknown as {filterModel: Record<string, unknown>; search: () => Promise<void>}
    filterApi.filterModel['AppDesc'] = 'needle'
    await filterApi.search()
    await flushPromises()
    expect(view.filterExpression).toEqual({logic: 'or', filters: [
      {field: 'AppDesc', operator: 'contains', value: 'needle'},
      {field: 'AppName', operator: 'contains', value: 'needle'},
    ]})
    expect(view.rows.map(row => row['rowid'])).toEqual(['APP-1', 'APP-2'])
    expect(view.total).toBe(2)
    expect(http.saves).toHaveLength(0)
  })

  it('switches only through a readable row identity and the project navigation service', async () => {
    const {wrapper, router, switchAndReload} = await open()
    await getButton(wrapper, '进入应用').trigger('click'); await flushPromises()
    expect(switchAndReload).toHaveBeenCalledWith('APP-1')
    expect(router.currentRoute.value.path).toContain('/apps/APP-1/')
    expect(http.saves).toHaveLength(0)
  })

  it.each([
    ['应用链接', '/apps/APP-1', `${window.location.origin}/apps/APP-1`],
    ['打开应用', `${window.location.origin}/apps/APP-1`, `${window.location.origin}/apps/APP-1`],
    ['应用链接', 'https://external.example/path?app=1#home', 'https://external.example/path?app=1#home'],
    ['打开应用', '//external.example/path?app=1#home', `${new URL(window.location.origin).protocol}//external.example/path?app=1#home`],
    ['应用链接', '  relative/path?app=1#home  ', `${window.location.origin}/relative/path?app=1#home`],
    ['打开应用', '/path/../target', `${window.location.origin}/target`],
    ['应用链接', '/path/%2e%2e/target', `${window.location.origin}/target`],
    ['打开应用', '/path/%2Fchild', `${window.location.origin}/path/%2Fchild`],
  ])('opens a valid WebUrl from %s and treats a null window handle as unknown: %s', async (label, value, expected) => {
    const {wrapper, observed} = await open()
    const {view} = currentView(observed)
    http.records['Base_AppSystemList']![0]!['WebUrl'] = value
    await view.refresh(); await flushPromises()
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)
    const info = vi.spyOn(ElMessage, 'info')
    const failure = vi.spyOn(ElMessage, 'error')
    await getButton(wrapper, label).trigger('click'); await flushPromises()
    expect(openWindow).toHaveBeenCalledWith(expected, '_blank', 'noopener,noreferrer')
    expect(info).toHaveBeenCalledWith('已请求打开应用链接；浏览器打开状态无法确认。')
    expect(failure).not.toHaveBeenCalled()
    expect(http.saves).toHaveLength(0)
  })

  it('reports a browser error without claiming that the application opened', async () => {
    const {wrapper} = await open()
    vi.spyOn(window, 'open').mockImplementation(() => {throw new Error('browser denied')})
    const warning = vi.spyOn(ElMessage, 'warning')
    const info = vi.spyOn(ElMessage, 'info')
    await getButton(wrapper, '应用链接').trigger('click'); await flushPromises()
    expect(warning).toHaveBeenCalledWith('请求打开应用链接时浏览器报错：browser denied；打开状态无法确认。')
    expect(info).not.toHaveBeenCalled()
    expect(http.saves).toHaveLength(0)
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,unsafe',
    'mailto:unsafe@example.test',
    'ftp://external.example/path',
    `${new URL(window.location.origin).protocol}//user:password@${window.location.host}/path`,
    'https://external.example/\u0001path',
    'http://',
    '',
    '  ',
  ])('refuses an unsafe or invalid WebUrl: %s', async value => {
    const {wrapper, observed} = await open()
    const {view} = currentView(observed)
    http.records['Base_AppSystemList']![0]!['WebUrl'] = value
    await view.refresh(); await flushPromises()
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)
    const failure = vi.spyOn(ElMessage, 'error')
    await getButton(wrapper, '应用链接').trigger('click'); await flushPromises()
    expect(openWindow).not.toHaveBeenCalled()
    expect(failure).toHaveBeenCalledWith(expect.stringContaining('应用链接不可用'))
    expect(http.saves).toHaveLength(0)
  })

  it.each(['hidden', 'masked'] as const)('does not open a %s WebUrl field', async mode => {
    const permissions = mode === 'hidden' ? http.hiddenFields : http.maskedFields
    permissions['Base_AppSystemList'] = ['WebUrl']
    const {wrapper, observed} = await open()
    const {view} = currentView(observed)
    expect(view.fieldAccess(view.rows[0]!, 'WebUrl').read).toBe(mode === 'hidden' ? 'invisible' : 'masked')
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)
    const failure = vi.spyOn(ElMessage, 'error')
    await getButton(wrapper, '应用链接').trigger('click'); await flushPromises()
    expect(openWindow).not.toHaveBeenCalled()
    expect(failure).toHaveBeenCalledWith(expect.stringContaining('无可读权限'))
    expect(http.saves).toHaveLength(0)
  })

  it('submits a document with the readable application identity and never claims file generation', async () => {
    const {wrapper} = await open()
    const info = vi.spyOn(ElMessage, 'info')
    const failure = vi.spyOn(ElMessage, 'error')
    await getButton(wrapper, '需求说明书').trigger('click'); await flushPromises()
    expect(pageMocks.submitDocument).toHaveBeenCalledWith('APP-1', 'requirements-specification')
    expect(info).toHaveBeenCalledWith('需求说明书请求已收到提交回执；文件生成状态未知。')
    expect(info.mock.calls.flat().join(' ')).not.toMatch(/导出成功|生成成功/)
    expect(failure).not.toHaveBeenCalled()
    expect(http.saves).toHaveLength(0)
  })

  it('reports rejected document submissions without a success message', async () => {
    pageMocks.submitDocument.mockRejectedValue(new Error('Code 500: document refused'))
    const {wrapper} = await open()
    const info = vi.spyOn(ElMessage, 'info')
    const failure = vi.spyOn(ElMessage, 'error')
    await getButton(wrapper, '功能设计说明书').trigger('click'); await flushPromises()
    expect(pageMocks.submitDocument).toHaveBeenCalledWith('APP-1', 'system-detailed-design')
    expect(failure).toHaveBeenCalledWith(expect.stringContaining('提交结果未确认'))
    expect(info).not.toHaveBeenCalled()
    expect(http.saves).toHaveLength(0)
  })

  it('uses the detailed-design endpoint for the reference design-document action', async () => {
    const {wrapper} = await open()
    const info = vi.spyOn(ElMessage, 'info')
    await getButton(wrapper, '功能设计说明书').trigger('click'); await flushPromises()
    expect(pageMocks.submitDocument).toHaveBeenCalledWith('APP-1', 'system-detailed-design')
    expect(info).toHaveBeenCalledWith('功能设计说明书请求已收到提交回执；文件生成状态未知。')
    expect(http.saves).toHaveLength(0)
  })

  it('prevents another document submission until the current request settles', async () => {
    let resolveReceipt: ((receipt: unknown) => void) | undefined
    pageMocks.submitDocument.mockImplementation(() => new Promise(resolve => {resolveReceipt = resolve}))
    const {wrapper} = await open()
    await getButton(wrapper, '需求说明书').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('正在提交文档任务，请勿重复操作')
    expect(getButton(wrapper, '需求说明书').attributes('disabled')).toBeDefined()
    expect(getButton(wrapper, '功能设计说明书').attributes('disabled')).toBeDefined()
    await getButton(wrapper, '功能设计说明书').trigger('click'); await flushPromises()
    expect(pageMocks.submitDocument).toHaveBeenCalledOnce()
    resolveReceipt?.({
      projectId: 'APP-1', kind: 'requirements-specification', status: 'submitted',
      coverage: 'legacy-menu-scope', message: 'submitted',
    })
    await flushPromises()
    expect(getButton(wrapper, '需求说明书').attributes('disabled')).toBeUndefined()
    expect(getButton(wrapper, '功能设计说明书').attributes('disabled')).toBeUndefined()
    expect(http.saves).toHaveLength(0)
  })

  it('ignores a late document receipt after the application identity changes', async () => {
    let resolveReceipt: ((receipt: unknown) => void) | undefined
    pageMocks.submitDocument.mockImplementation(() => new Promise(resolve => {resolveReceipt = resolve}))
    const {wrapper, router} = await open()
    const info = vi.spyOn(ElMessage, 'info')
    const click = getButton(wrapper, '需求说明书').trigger('click')
    await flushPromises()
    await router.push(`/apps/OTHER${APPLICATION_MANAGER_PATH}`); await flushPromises()
    resolveReceipt?.({
      projectId: 'APP-1', kind: 'requirements-specification', status: 'submitted',
      coverage: 'legacy-menu-scope', message: 'submitted',
    })
    await click; await flushPromises()
    expect(info).not.toHaveBeenCalled()
    expect(http.saves).toHaveLength(0)
  })

  it('keeps the list visible but hides app navigation when row identity is unreadable', async () => {
    http.hiddenFields['Base_AppSystemList'] = ['rowid']
    const {wrapper} = await open()
    expect(wrapper.findComponent(RendererTable).exists()).toBe(true)
    expect(wrapper.findAll('button').some(button => button.text().trim() === '进入应用')).toBe(false)
    expect(http.saves).toHaveLength(0)
  })

  it('reports an initial query failure and retries the same formal route', async () => {
    http.failNextTable = 'Base_AppSystemList'
    const {wrapper} = await open()
    expect(wrapper.get('[role="alert"]').text()).toContain('应用目录查询失败')
    expect(wrapper.findComponent(RendererTable).exists()).toBe(false)
    await getButton(wrapper, '重试').trigger('click'); await flushPromises()
    await vi.waitFor(() => expect(wrapper.findComponent(RendererTable).exists()).toBe(true))
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(http.saves).toHaveLength(0)
  })

  it('keeps the app list available and reports a status dictionary failure', async () => {
    http.failNextTable = '应用系统状态'
    const {wrapper} = await open()
    expect(wrapper.findComponent(RendererTable).exists()).toBe(true)
    expect(wrapper.get('[role="alert"]').text()).toContain('状态选项读取失败')
    await getButton(wrapper, '重试状态选项').trigger('click'); await flushPromises()
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(false))
    expect(wrapper.findComponent(RendererTable).exists()).toBe(true)
    expect(http.saves).toHaveLength(0)
  })

  it('keeps the application list and relation visible when the database-name query fails', async () => {
    http.failNextTable = '_base_dbInfo'
    const {wrapper, observed} = await open()
    const {databaseRelationView, databaseView} = currentView(observed)
    await vi.waitFor(() => expect(databaseView.requestState).toBe(RequestState.Failed))
    expect(databaseRelationView.total).toBe(1)
    expect(wrapper.text()).toContain('关联已记录，但数据库名称查询失败')
    expect(wrapper.findAllComponents(RendererTable)).toHaveLength(3)
    expect(http.saves).toHaveLength(0)
  })

  it('ignores a late result after the application identity changes', async () => {
    const release = http.holdNextRead('Base_AppSystemList')
    const {wrapper, router, observed} = await open(false)
    await vi.waitFor(() => expect(http.reads.map(read => read.table)).toContain('Base_AppSystemList'))
    const prior = [...observed][0]
    await router.push(`/apps/OTHER${APPLICATION_MANAGER_PATH}`); await flushPromises()
    release(); await flushPromises()
    expect(prior?.destroyed).toBe(true)
    expect(wrapper.text()).toContain('SPARK_EXECUTION_SCOPE_STALE')
    expect(wrapper.findComponent(RendererTable).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('fixture record 1')
    expect(http.saves).toHaveLength(0)
  })
})
