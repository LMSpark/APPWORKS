import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus, {ElMessage} from 'element-plus'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_SERVICE, RendererTable, Spark, registerAllRenderers, useSparkComponent, type PageServiceCapability} from '@spark-appworks/spark-component'
import {getVuePageEntry} from '@/registries/vue-page-registry'
import {PROJECT_SWITCH_KEY} from '@/services/project/project-shell'
import * as Fixture from './application-manager.fixture'
import {pagedata} from '../../page/api-provider/api-provider.fixture'

const {api, APPLICATION_MANAGER_PATH, APPLICATION_MANAGER_SCENARIO: SCENARIO, OWNER_ROLE, resetApplicationManagerFixture} = Fixture
const confirmBox = vi.hoisted(() => vi.fn<(message: string, title: string) => Promise<string>>())
const pageUi = vi.hoisted(() => ({showMessage: vi.fn<(message: string, type?: string) => void>()}))
vi.mock('element-plus', async importOriginal => {
  const original = await importOriginal<typeof import('element-plus')>()
  return {...original, ElMessageBox: {...original.ElMessageBox, confirm: confirmBox}}
})
const pageMocks = vi.hoisted(() => ({submitDocument: vi.fn()}))
const defaultApp = vi.hoisted(() => {
  const state = {id: '', writable: true, destroyed: 0, save: vi.fn(async (id: string | null) => { state.id = id ?? '' })}
  return state
})
const session = vi.hoisted(() => ({identity: {userId: 'USER-1', enterpriseId: 'ENT-1'}, enterprise: {id: 'ENT-1', shortName: 'ME'}}))

vi.mock('@/services/project/enterprise-landing', () => ({EnterpriseDefaultApplication: {load: async () => ({
  get applicationId() {return defaultApp.id},
  get writable() {return defaultApp.writable},
  save: (id: string | null) => defaultApp.save(id),
  destroy: () => { defaultApp.destroyed++ },
})}}))

vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return api.state.http},
  lowcodeApi: {
    readRequestScope: (...args: unknown[]) => api.service.readRequestScope(...args),
    session: {get: () => session},
    blueprint: {submitDocument: (...args: unknown[]) => pageMocks.submitDocument(...args)},
    dataSpace: {get design() {return api.service}, get runtime() {return api.state.runtime}},
  },
  lowcodeDesignFileUpload: {
    uploadWorkingText: async () => {throw new Error('应用管理页不写场景文件')},
    uploadTextVersion: async () => {throw new Error('应用管理页不写场景版本')},
  },
  createLowcodeProjectGateways: () => ({scenarioViews: {
    readScope: () => 'scope',
    readText: async (id: string) => pagedata[id] ?? null,
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
  Object.assign(defaultApp, {id: '', writable: true, destroyed: 0})
  defaultApp.save.mockClear()
  confirmBox.mockReset().mockResolvedValue('confirm')
  pageMocks.submitDocument.mockReset()
  pageUi.showMessage.mockClear()
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
  document.body.innerHTML = ''
  vi.restoreAllMocks(); vi.unstubAllGlobals()
  config.global.stubs = originalStubs
})

async function settle(): Promise<void> {
  for (let index = 0; index < 6; index++) await flushPromises()
}

async function open(wait = true) {
  const observed = new Set<PageRuntime>()
  const load = PageRuntime.prototype.load
  vi.spyOn(PageRuntime.prototype, 'load').mockImplementation(function(this: PageRuntime) {
    observed.add(this)
    return load.call(this)
  })
  const router = createRouter({history: createMemoryHistory(), routes: [
    {path: `/apps/:projectId${APPLICATION_MANAGER_PATH}`, component: ApplicationManagerPage,
      meta: {blueprintScenarioId: SCENARIO, nodeId: SCENARIO, systemPageIdentityState: 'resolved'}},
    {path: '/:pathMatch(.*)*', component: defineComponent({setup: () => () => h('div')})},
  ]})
  await router.push(`/apps/APP${APPLICATION_MANAGER_PATH}`)
  await router.isReady()
  const switchAndReload = vi.fn(async () => ({assertCurrent: vi.fn()}))
  const pageService: PageServiceCapability = {
    copyText: async () => {},
    showMessage: (message, type = 'info') => { pageUi.showMessage(message, type); ElMessage({message, type}) },
    showConfirm: async (message, title) => confirmBox(message, title ?? '确认').then(() => true, () => false),
    showPrompt: async () => null,
    showAlert: async () => {},
    showDialog: async () => 'cancel',
    selectEntities: async () => [],
    browseFiles: async () => [],
    uploadFiles: async () => { throw new Error('应用管理页测试不模拟上传') },
    showLoading: () => {},
    navigate: () => {},
  }
  const wrapper = mount(defineComponent({
    setup() {
      const {sparkProvide} = useSparkComponent({type: 'application-manager-page-test'})
      sparkProvide(PAGE_SERVICE, pageService)
      return () => h(RouterView)
    },
  }), {
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
  }, {timeout: 10000})
  await settle()
  const dataSet = () => {
    const runtime = [...observed].find(item => !item.destroyed && item.getDataSet(SCENARIO))
    const found = runtime?.getDataSet(SCENARIO)
    if (!found) throw new Error('应用管理正式数据集未装配')
    return found
  }
  const view = (table: string, viewId = 'default') => {
    const found = dataSet().getView(table, viewId)
    if (!found) throw new Error(`应用管理缺少视图 ${table}@${viewId}`)
    return found
  }
  return {wrapper, router, observed, switchAndReload, dataSet, view}
}

function buttons(label: string): HTMLButtonElement[] {
  return [...document.body.querySelectorAll('button')].filter(item => item.textContent?.trim() === label)
}
function button(label: string, index = 0): HTMLButtonElement {
  const found = buttons(label)[index]
  if (!found) throw new Error(`按钮不存在: ${label}`)
  return found
}
async function click(label: string, index = 0): Promise<void> {
  button(label, index).click()
  await settle()
}
/** 列表行内按钮按行序出现；index 为该标签在可见行中的序号。 */
function rowButtonFor(wrapper: VueWrapper, rowText: string, label: string): HTMLButtonElement {
  const row = wrapper.findAll('.el-table__body tr').find(item => item.text().includes(rowText))
  const found = row?.findAll('button').find(item => item.text().trim() === label)
  if (!found) throw new Error(`行 ${rowText} 缺少按钮 ${label}`)
  return found.element
}
const bodyText = () => document.body.textContent ?? ''
const inputValues = () => [...document.body.querySelectorAll<HTMLInputElement>('.el-dialog input')].map(input => input.value)
async function pickDatabase(server: string): Promise<void> {
  const row = [...document.body.querySelectorAll('.el-dialog .el-table__body tr')].find(item => item.textContent?.includes(server))
  const confirm = [...row?.querySelectorAll('button') ?? []].find(item => item.textContent?.trim() === '确定')
  if (!confirm) throw new Error(`数据库候选缺少 ${server}`)
  confirm.click()
  await settle()
}

describe('application manager restored with standard components and formal DataViews', () => {
  it('declares the list, form, companion and navigation views with constant owner scope and no cascades', () => {
    const page = getVuePageEntry(APPLICATION_MANAGER_PATH)
    const text = readFileSync('config/pages/application/application-manager/pagedata.json', 'utf8')
    const scenario: {viewCascades: unknown[]; tables: Record<string, {views: Record<string, {commitMode?: string; scopeFilter?: unknown; queryConfig?: {fields?: string[]}}>}>} = JSON.parse(text)
    const views = (table: string) => scenario.tables[table]?.views ?? {}
    expect(page?.source).toBe('src/views/features/application/application-manager/ui/application-manager-page.vue')
    expect(views('Base_AppSystemList')['default']?.queryConfig?.fields)
      .toEqual(['rowid', 'AppDesc', 'AppName', 'WebUrl', 'DeveloperName', 'CreateTime', 'AppType'])
    expect(views('Base_AppSystemList')['form']?.commitMode).toBe('staged')
    expect(views('Base_AppAndSource_Relation')['cleanup']?.commitMode).toBe('staged')
    expect(JSON.stringify(views('Base_MainBody_RoleUser')['default']?.scopeFilter)).toContain(OWNER_ROLE)
    expect(views('Base_NavigationInfo')['default']?.commitMode).toBe('staged')
    expect(views('Base_NavigationInfo')['children']?.queryConfig?.fields).toEqual(['rowid'])
    expect(scenario.viewCascades).toEqual([])
    expect(text).not.toContain('_base_dbInfo')
    expect(text).not.toMatch(/Password|ConnString/i)
  })

  it('renders the standard section, list columns and paging without the old association section', async () => {
    const {wrapper, view} = await open()
    const table = wrapper.findAllComponents(RendererTable).find(item => item.props('dataViewKey') === `${SCENARIO}@Base_AppSystemList@default`)
    if (!table) throw new Error('应用目录表格未渲染')
    expect(wrapper.find('.renderer-section-title').text()).toBe('应用系统列表')
    expect(table.findAll('.el-table__header-wrapper th').map(header => header.text()))
      .toEqual(['#', '简称', '系统名称', 'WebUrl', '开发商名称', '创建时间', '状态', '操作'])
    expect(bodyText()).not.toContain('所选应用关联信息')
    expect(bodyText()).not.toContain('暂不可用')
    expect(table.text()).toContain('2025-01-01')
    expect(table.text()).not.toContain('2025-01-01 08:00:00')
    expect(table.text()).toContain('停用')
    expect(view('Base_AppSystemList').total).toBe(23)
    expect(view('Base_AppSystemList').rows).toHaveLength(10)
    await wrapper.get('.el-pagination .btn-next').trigger('click'); await settle()
    expect(view('Base_AppSystemList').page).toBe(2)
    await click('刷新')
    expect(view('Base_AppSystemList').page).toBe(2)
    expect(http.saves).toHaveLength(0)
  })

  it('reports export and quotation as not delivered', async () => {
    await open()
    await click('导出')
    await click('报价管理')
    expect(pageUi.showMessage.mock.calls).toEqual([['导出尚未交付', 'info'], ['报价管理尚未交付', 'info']])
    expect(http.saves).toHaveLength(0)
  })

  it('edits the main record and owner through their views and saves both in one phase', async () => {
    const {wrapper, view} = await open()
    wrapper.findAll('.field-table-action').find(item => item.text() === 'needle description')?.element.dispatchEvent(new MouseEvent('click', {bubbles: true}))
    await settle()
    expect(bodyText()).toContain('编辑应用系统')
    const main = view('Base_AppSystemList', 'form'), owner = view('Base_MainBody_RoleUser')
    expect(main.rows.map(row => row['rowid'])).toEqual(['APP-1'])
    expect(owner.currentRow?.['rowid']).toBe('OWNER-1')
    expect(inputValues()).toContain('database 1 / 数据库 1')
    expect(button('选择').disabled).toBe(true)
    main.updateEditingValue('APP-1', 'AppName', 'renamed')
    owner.updateEditingValue('OWNER-1', 'UserIdField', 'USER-2')
    await click('保存')
    expect(http.saves.map(save => save.table).sort()).toEqual(['Base_AppSystemList', 'Base_MainBody_RoleUser'])
    expect(http.saves.find(save => save.table === 'Base_AppSystemList')?.changed[0]).toMatchObject({rowid: 'APP-1', AppName: 'renamed'})
    expect(http.records['Base_MainBody_RoleUser']?.[0]).toMatchObject({rowid: 'OWNER-1', UserIdField: 'USER-2'})
    expect(bodyText()).not.toContain('编辑应用系统')
  })

  it('maps the tenant portal switch to the enterprise default application after the record is saved', async () => {
    const {wrapper} = await open()
    rowButtonFor(wrapper, 'needle description', '编辑').click(); await settle()
    const portal = [...document.body.querySelectorAll('.el-form-item')].find(item => item.textContent?.includes('租户门户'))
    portal?.querySelector<HTMLElement>('.el-switch')?.click(); await settle()
    await click('保存')
    expect(defaultApp.save).toHaveBeenCalledWith('APP-1')
  })

  it('creates the main record first, then the default database, owner and navigation root', async () => {
    const {view} = await open()
    await click('新增')
    expect(bodyText()).toContain('新增应用系统')
    const main = view('Base_AppSystemList', 'form'), owner = view('Base_MainBody_RoleUser')
    const appId = String(main.rows[0]?.['rowid'] ?? '')
    expect(appId).toMatch(/^[0-9A-F]{32}$/)
    main.updateEditingValue(appId, 'AppName', '新系统')
    main.updateEditingValue(appId, 'AppDesc', '新简称')
    main.updateEditingValue(appId, 'WebUrl', '/new-app')
    owner.updateEditingValue(owner.getPkKey(owner.currentRow!)!, 'UserIdField', 'USER-2')
    await click('保存')
    expect(bodyText()).toContain('请选择默认数据库')
    expect(http.saves).toHaveLength(0)

    await click('选择')
    expect(bodyText()).toContain('选择数据库')
    await click('确定', buttons('确定').length - 1)
    expect(bodyText()).toContain('请选择数据库')
    await pickDatabase('server 2')
    expect(inputValues()).toContain('database 2 / 数据库 2')
    await click('保存')

    const tables = http.saves.map(save => save.table)
    expect(tables[0]).toBe('Base_AppSystemList')
    expect(tables.slice(1).sort()).toEqual(['Base_AppAndSource_Relation', 'Base_MainBody_RoleUser', 'Base_NavigationInfo'])
    const added = (table: string) => http.saves.find(save => save.table === table)?.added[0]
    expect(added('Base_AppSystemList')).toMatchObject({rowid: appId, AppName: '新系统', AppDesc: '新简称', WebUrl: '/new-app', AppType: '1',
      CreateUser: 'USER-1', EntId: 'ENT-1', isdel: 0, IsSys: 1, isSass: 0})
    expect(String(added('Base_AppSystemList')?.['CreateTime'])).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(added('Base_AppAndSource_Relation')).toMatchObject({sysid: appId, type: 'database', isRef: 0, conid: 'DATABASE-2', conName: 'database 2', cnName: '数据库 2'})
    expect(added('Base_MainBody_RoleUser')).toMatchObject({EntityPKValue: appId, sysId: appId, UserIdField: 'USER-2', RoleIdField: OWNER_ROLE, CategoryID: '1'})
    expect(added('Base_NavigationInfo')).toMatchObject({rowid: appId, SysId: appId, prowid: '000000', modid: appId, FunName: '新简称', name: '新系统', conType: 'Model'})
    expect(bodyText()).not.toContain('新增应用系统')
  })

  async function fillCreate(view: Awaited<ReturnType<typeof open>>['view']): Promise<void> {
    await click('新增')
    const main = view('Base_AppSystemList', 'form'), owner = view('Base_MainBody_RoleUser')
    const appId = String(main.rows[0]?.['rowid'] ?? '')
    for (const [field, value] of [['AppName', 'n'], ['AppDesc', 'd'], ['WebUrl', '/n']]) main.updateEditingValue(appId, field!, value)
    owner.updateEditingValue(owner.getPkKey(owner.currentRow!)!, 'UserIdField', 'USER-1')
    await click('选择')
    await pickDatabase('server 1')
  }

  it('reports an unknown companion result after the main record is confirmed without claiming failure', async () => {
    const {view} = await open()
    await fillCreate(view)
    let calls = 0
    http.beforeSave = async () => { if (++calls === 2) throw new Error('companion lost') }
    await click('保存')
    expect(bodyText()).toContain('应用系统已创建，默认数据库、负责人或导航根保存结果未确认')
    expect(bodyText()).toContain('新增应用系统')
  })

  it('reports a confirmed main record with rejected companions and completes them on the next save', async () => {
    const {view} = await open()
    await fillCreate(view)
    let calls = 0
    http.beforeSave = async () => { if (++calls === 1) http.rejectNextSave = true }
    await click('保存')
    expect(bodyText()).toContain('应用系统已创建，默认数据库、负责人或导航根未写入')
    expect(http.saves.map(save => save.table)).toEqual(['Base_AppSystemList'])
    await click('保存')
    expect(http.saves.filter(save => save.table === 'Base_AppSystemList')).toHaveLength(1)
    expect(http.saves.map(save => save.table).slice(1).sort()).toEqual(['Base_AppAndSource_Relation', 'Base_MainBody_RoleUser', 'Base_NavigationInfo'])
    expect(bodyText()).not.toContain('新增应用系统')
  })

  it('offers delete only for stopped applications and removes companions before the main record', async () => {
    const {wrapper} = await open()
    expect(() => rowButtonFor(wrapper, 'needle description', '删除')).toThrow()
    rowButtonFor(wrapper, 'fixture record 6', '删除').click(); await settle()
    expect(confirmBox).toHaveBeenCalledWith('确认删除应用系统“fixture record 6”吗？', '删除确认')
    const tables = http.saves.map(save => save.table)
    expect(tables.at(-1)).toBe('Base_AppSystemList')
    expect(tables.slice(0, -1).sort()).toEqual(['Base_AppAndSource_Relation', 'Base_NavigationInfo'])
    expect(http.records['Base_AppSystemList']?.some(row => row['rowid'] === 'APP-6')).toBe(false)
    expect(http.records['Base_NavigationInfo']?.some(row => row['rowid'] === 'APP-6')).toBe(false)
    expect(http.records['Base_AppAndSource_Relation']?.some(row => row['sysid'] === 'APP-6')).toBe(false)
  })

  it('refuses to delete an application whose blueprint still has navigation children', async () => {
    const {wrapper} = await open()
    await wrapper.get('.el-pagination .btn-next').trigger('click'); await settle()
    rowButtonFor(wrapper, 'fixture record 12', '删除').click(); await settle()
    expect(bodyText()).toContain('该应用的项目蓝图下仍有节点，不能删除')
    expect(http.saves).toHaveLength(0)
  })

  it('opens the reused database relations content for the selected application in a dialog', async () => {
    const {wrapper} = await open()
    rowButtonFor(wrapper, 'needle description', '关联数据库').click(); await settle()
    expect(bodyText()).toContain('关联数据库 - needle description')
    await vi.waitFor(async () => { await settle(); expect(bodyText()).toContain('server 1') })
    expect(http.saves).toHaveLength(0)
  })

  it('enters the application and its project management page through the project switch', async () => {
    const {wrapper, router, switchAndReload} = await open()
    rowButtonFor(wrapper, 'needle description', '项目管理').click(); await settle()
    expect(switchAndReload).toHaveBeenCalledWith('APP-1')
    expect(router.currentRoute.value.path).toBe('/apps/APP-1/features/application/application-function-management/ui/application-function-page')
    expect(Object.values(router.currentRoute.value.query)).toContain('7AB874097A1E8711A42FD845939A6E05')
    expect(http.saves).toHaveLength(0)
  })

  it('marks, sets and clears the enterprise default application through its config member', async () => {
    const {wrapper} = await open()
    const labels = () => wrapper.findAll('button').map(item => item.text().trim())
    expect(labels()).not.toContain('默认')
    rowButtonFor(wrapper, 'needle description', '设为默认').click(); await settle()
    expect(defaultApp.save).toHaveBeenLastCalledWith('APP-1')
    await vi.waitFor(() => expect(labels()).toContain('取消默认'))
    expect(labels()).toContain('默认')
    rowButtonFor(wrapper, 'needle description', '取消默认').click(); await settle()
    expect(defaultApp.save).toHaveBeenLastCalledWith(null)
    expect(http.saves).toHaveLength(0)
    wrapper.unmount()
    expect(defaultApp.destroyed).toBe(1)
  })

  it.each([
    ['/apps/APP-1', `${window.location.origin}/apps/APP-1`],
    ['https://external.example/path?app=1#home', 'https://external.example/path?app=1#home'],
  ])('opens a valid WebUrl %s and treats the browser result as unknown', async (value, expected) => {
    const {wrapper, view} = await open()
    http.records['Base_AppSystemList']![0]!['WebUrl'] = value
    await view('Base_AppSystemList').refresh(); await settle()
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)
    rowButtonFor(wrapper, 'needle description', '应用链接').click(); await settle()
    expect(openWindow).toHaveBeenCalledWith(expected, '_blank', 'noopener,noreferrer')
    expect(pageUi.showMessage).toHaveBeenCalledWith('已请求打开应用链接；浏览器打开状态无法确认。', 'info')
  })

  it.each(['javascript:alert(1)', `${new URL(window.location.origin).protocol}//user:password@${window.location.host}/path`, ''])(
    'refuses an unsafe or invalid WebUrl: %s', async value => {
      const {wrapper, view} = await open()
      http.records['Base_AppSystemList']![0]!['WebUrl'] = value
      await view('Base_AppSystemList').refresh(); await settle()
      const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)
      rowButtonFor(wrapper, 'needle description', '应用链接').click(); await settle()
      expect(openWindow).not.toHaveBeenCalled()
      expect(pageUi.showMessage).toHaveBeenCalledWith(expect.stringContaining('应用链接不可用'), 'error')
    })

  it('submits documents with the readable application identity and never claims file generation', async () => {
    const {wrapper} = await open()
    rowButtonFor(wrapper, 'needle description', '需求说明书').click(); await settle()
    expect(pageMocks.submitDocument).toHaveBeenCalledWith('APP-1', 'requirements-specification')
    expect(pageUi.showMessage).toHaveBeenCalledWith('需求说明书请求已收到提交回执；文件生成状态未知。', 'info')
    rowButtonFor(wrapper, 'needle description', '功能设计说明书').click(); await settle()
    expect(pageMocks.submitDocument).toHaveBeenLastCalledWith('APP-1', 'system-detailed-design')
    expect(http.saves).toHaveLength(0)
  })

  it('hides identity-based actions when the row identity is unreadable', async () => {
    http.hiddenFields['Base_AppSystemList'] = ['rowid']
    const {wrapper} = await open()
    expect(wrapper.findComponent(RendererTable).exists()).toBe(true)
    for (const label of ['编辑', '进入应用', '项目管理', '关联数据库']) expect(buttons(label)).toHaveLength(0)
    expect(wrapper.findAll('.field-table-action')).toHaveLength(0)
  })

  it('reports an entry query failure and retries the same formal route', async () => {
    http.failNextTable = '应用系统状态'
    const {wrapper} = await open()
    expect(wrapper.get('[role="alert"]').text()).toContain('应用目录查询失败')
    expect(wrapper.findComponent(RendererTable).exists()).toBe(false)
    await click('重试')
    await vi.waitFor(() => expect(wrapper.findComponent(RendererTable).exists()).toBe(true))
    expect(http.saves).toHaveLength(0)
  })

  it('ignores a late result after the application identity changes', async () => {
    const release = http.holdNextRead('Base_AppSystemList')
    const {wrapper, router, observed} = await open(false)
    await vi.waitFor(() => expect(http.reads.map(read => read.table)).toContain('Base_AppSystemList'))
    const prior = [...observed][0]
    await router.push(`/apps/OTHER${APPLICATION_MANAGER_PATH}`); await settle()
    release(); await settle()
    expect(prior?.destroyed).toBe(true)
    expect(wrapper.findComponent(RendererTable).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('fixture record 1')
  })
})
