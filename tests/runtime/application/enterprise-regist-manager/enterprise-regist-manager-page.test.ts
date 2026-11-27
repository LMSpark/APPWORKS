import {afterEach, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import type {HttpResponse, RequestConfig} from '@spark-appworks/spark-utils'
import scenario from '../../../../config/pages/application/enterprise-regist-manager/pagedata.json'
import {withTestPageService} from '../../../support/helpers/page-service-host'
import {ApiBackend, createApiService, models, pagedata} from '../../page/api-provider/api-provider.fixture'

const api = createApiService()
const catalogScope = () => ({token: 'catalog', headers: {}})
const scenarioId = scenario.scenarioId

vi.mock('@/platform-adapters/lowcode-runtime', () => ({
  get lowcodeHttp() {return api.state.http},
  get lowcodeCatalogRuntimeDataSpace() {return {design: api.service, runtime: api.state.runtime}},
  readLowcodeCatalogRuntimeRequestScope: catalogScope,
  lowcodeApi: {design: {}, dataSpace: {}},
  lowcodeDesignFileUpload: {},
}))
vi.mock('@/platform-adapters/resources/repository/scenarios/resource', async importOriginal => ({
  ...await importOriginal<typeof import('@/platform-adapters/resources/repository/scenarios/resource')>(),
  readRepositoryScenarioText: async () => pagedata[scenarioId],
}))

const {default: EnterprisePage} = await import('@/views/features/application/enterprise-regist-manager/ui/enterprise-regist-manager-page.vue')
const originalStubs = {...config.global.stubs}
let wrapper: VueWrapper | undefined
afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
  delete pagedata[scenarioId]
  config.global.stubs = originalStubs
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

class EnterpriseBackend extends ApiBackend {
  readonly initializationRequests: unknown[] = []

  protected override executeRequest(request: RequestConfig): Promise<HttpResponse<unknown>> {
    if (request.url !== '/api/Enterprise/initEnt') return super.executeRequest(request)
    this.initializationRequests.push(request.params)
    return Promise.resolve({status: 200, statusText: 'OK', headers: {}, data: {Code: 200, Result: '任务已受理'}})
  }
}

async function mountEnterpriseWorkspace(mode?: 'module', existingBackend?: EnterpriseBackend) {
  const {Base_Enterprise_Info: enterpriseRows, Base_AppSystemList: applicationRows, ...other} = scenario.tables
  pagedata[scenarioId] = JSON.stringify({
    ...scenario, tables: {enterpriseRows, applicationRows, ...other},
    viewCascades: scenario.viewCascades.map(cascade => ({...cascade, parentTable: 'applicationRows'})),
  })
  api.reset({
    Base_Enterprise_Info: [
      {rowid: 'E-FIRST', CName: '甲企业', ShortName: 'FIRST', loginPolicy: 'OPEN', ent_config: '{}'},
      {rowid: 'E-SECOND', CName: '乙企业', ShortName: 'SECOND', CheckState: '0', loginPolicy: 'OPEN', ent_config: '{}'},
    ],
    Base_AppSystemList: [
      {rowid: 'APP-FIRST', EntShortName: 'FIRST', AppName: '甲企业应用'},
      {rowid: 'APP-SECOND', EntShortName: 'SECOND', AppName: '乙企业应用'},
    ],
    enterprise_app_auth: [{id:'AUTH-SECOND', enterprise_id:'E-SECOND', app_id:'APP-FIRST', authorized:mode==='module'?'1':'0'}],
    Base_NavigationInfo: [{rowid:'PARENT', SysId:'APP-FIRST', prowid:'000000', FunName:'夹具根模块'},
      {rowid:'CHILD', SysId:'APP-FIRST', prowid:'PARENT', FunName:'夹具子模块'}],
    enterprise_module_auth: [{id:'MODULE-SECOND',enterprise_id:'E-SECOND',nav_id:'CHILD',parent_nav_id:'PARENT',authorized:1},
      {id:'MODULE-OTHER',enterprise_id:'E-FIRST',nav_id:'CHILD',parent_nav_id:'PARENT',authorized:1}],
    entCheckState: [], login_policy: [{rowid: 'POLICY-1', val: 'OPEN', txt: '开放', ordIdx: 1}],
  })
  const backend = existingBackend ?? new EnterpriseBackend()
  if (!existingBackend) backend.records = api.state.http.records
  backend.primaryKeys['enterprise_app_auth'] = 'id'
  backend.primaryKeys['enterprise_module_auth'] = 'id'
  api.state.http = backend
  const computedColumns = new Map(Object.values(scenario.tables).flatMap(table => 'modelBinding' in table && 'columns' in table
    ? [[table.modelBinding.modelName, new Set(table.columns.map(column => column.name))] as const] : []))
  api.service.readModelBatch.mockImplementation(async ({dataSpaceId, metaNames}: {dataSpaceId: string; metaNames: string[]}) =>
    models(dataSpaceId).filter(model => metaNames.includes(model.metaName)).map(model => ({...model,
      primaryKey: backend.primaryKeys[model.metaName] ?? model.primaryKey, fields: model.fields.filter(field => !computedColumns.get(model.metaName)?.has(field.name)).map(field => ({...field,primaryKey:field.name===(backend.primaryKeys[model.metaName]??model.primaryKey)}))})))
  api.state.runtime = new DataSpaceRuntimeApi({http: api.state.http, readScope: catalogScope})
  const path = '/platform/features/application/enterprise-regist-manager/ui/enterprise-regist-manager-page'
  const router = createRouter({history: createMemoryHistory(), routes: [
    {path, component: EnterprisePage, meta: {blueprintScenarioId: scenarioId, nodeId: scenarioId, systemPageIdentityState: 'resolved'}},
  ]})
  let runtime: PageRuntime | undefined
  const load = PageRuntime.prototype.load
  vi.spyOn(PageRuntime.prototype, 'load').mockImplementation(function(this: PageRuntime) {
    runtime = this
    return load.call(this)
  })
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  await router.push(path)
  wrapper = mount(withTestPageService(RouterView, router), {
    attachTo: document.body, global: {stubs: {transition: false}, plugins: [router, ElementPlus, Spark.createPlugin()]},
  })
  await vi.waitFor(async () => {
    await flushPromises()
    expect(wrapper?.text()).toContain('乙企业')
  }, {timeout: 10000})
  const row = wrapper.findAll('.el-table__body tr').find(item => item.text().includes('乙企业'))
  if (!runtime || !row) throw Error('未打开入驻工作区')
  return {row, runtime, backend}
}

async function clickDialogAction(label: string): Promise<void> {
  await vi.waitFor(() => {
    const button = [...document.body.querySelectorAll('button')].find(item => item.textContent?.trim() === label)
    if (!button || button.disabled) throw Error(`弹窗动作未就绪 ${label}`)
    button.click()
  })
  await flushPromises()
}

it('opens configuration for the selected enterprise under separate scenario table keys', async () => {
  const {row, runtime} = await mountEnterpriseWorkspace()
  const configure = row?.findAll('button').find(item => item.text() === '配置')
  if (!configure) throw new Error('企业记录缺少配置操作')
  await configure.trigger('click')
  await flushPromises()
  expect(document.body.textContent).toContain('企业配置 - 乙企业')
  const enterprise = runtime?.resolveView(`${scenarioId}@Base_Enterprise_Info@currentEnterprise`)
  const applications = runtime?.resolveView(`${scenarioId}@Base_AppSystemList@enterpriseApplications`)
  expect(enterprise?.rows.map(item => item['rowid'])).toEqual(['E-SECOND'])
  expect(applications?.rows.map(item => item['rowid'])).toEqual(['APP-SECOND'])
  expect(api.state.http.saves).toHaveLength(0)
})

async function originalConfirmation(title: string): Promise<HTMLButtonElement> {
  return vi.waitFor(() => {
    const box = [...document.querySelectorAll('.el-message-box')].find(item =>
      item.querySelector('.el-message-box__title')?.textContent?.trim() === title)
    const confirm = [...box?.querySelectorAll('button') ?? []].find(button => button.textContent?.trim() === '确定')
    if (!confirm || confirm.disabled) throw Error(`未打开原确认框 ${title}`)
    return confirm
  })
}

it.each([
  {action: '通过', title: '审核通过确认'},
  {action: '不通过', title: '审核不通过确认'},
])('does not apply an old $action confirmation to the next enterprise read', async ({action, title}) => {
  const {row, runtime, backend} = await mountEnterpriseWorkspace()
  const enterprises = runtime.resolveView(`${scenarioId}@Base_Enterprise_Info@default`)
  const entry = row.findAll('button').find(button => button.text() === '审核')
  const original = enterprises?.rows.find(item => item['rowid'] === 'E-SECOND')
  if (!entry || !enterprises || !original) throw Error('Missing original enterprise audit row')
  const assertOriginal = enterprises.captureReadRow(original, ['rowid', 'CheckState'])
  await entry.trigger('click')
  await clickDialogAction(action)
  const confirm = await originalConfirmation(title)
  expect((await enterprises.requestRefresh({defer: false})).refreshStatus).toBe('read')
  const successor = enterprises.rows.find(item => item['rowid'] === 'E-SECOND')
  expect(successor?.['CheckState']).toBe('0')
  expect(assertOriginal).toThrow()
  const edit = vi.spyOn(enterprises, 'updateEditingValue')
  confirm.click()
  await flushPromises()
  expect.soft(edit).not.toHaveBeenCalled()
  expect.soft(enterprises.hasEditingChanges('E-SECOND')).toBe(false)
  expect.soft(backend.initializationRequests).toEqual([])
  expect(backend.saves).toEqual([])
})

it.each([
  {operation: 'grant', table: 'enterprise_app_auth', oldId: 'AUTH-SECOND', action: '授权', title: '应用授权确认'},
  {operation: 'remove', table: 'enterprise_module_auth', oldId: 'MODULE-SECOND', action: '取消授权', title: '取消模块授权'},
])('does not apply a pending $operation confirmation to a replacement relation', async ({operation, table, oldId, action, title}) => {
  const {row, runtime, backend} = await mountEnterpriseWorkspace(operation === 'remove' ? 'module' : undefined)
  const relations = runtime.resolveView(`${scenarioId}@${table}@default`)
  const entry = row.findAll('button').find(button => button.text() === '应用授权')
  if (!relations || !entry) throw Error('Missing relation authorization workspace')
  await entry.trigger('click')
  await vi.waitFor(() => expect(document.body.textContent).toContain('甲企业应用'))
  if (operation === 'remove') {
    const apps = runtime.resolveView(`${scenarioId}@Base_AppSystemList@default`)
    const selected = apps?.rows.find(item => item['rowid'] === 'APP-FIRST')
    if (!apps || !selected) throw Error('Missing selected application')
    apps.setCurrentRow(selected)
    await vi.waitFor(() => expect(document.body.textContent).toContain('夹具子模块'))
  }
  await clickDialogAction(action)
  const confirm = await originalConfirmation(title)
  const original = relations.rows.find(item => item['id'] === oldId)
  const records = backend.records[table]
  const stored = records?.find(item => item['id'] === oldId)
  if (!original || !records || !stored) throw Error('Missing original authorization relation')
  const assertOriginal = relations.captureReadRow(original, ['id', 'enterprise_id'])
  const replacement = {...stored, id: `${oldId}-REPLACED`}
  const expectedRows = records.map(item => item === stored ? replacement : item)
  backend.records[table] = structuredClone(expectedRows)
  expect((await relations.requestRefresh({defer: false})).refreshStatus).toBe('read')
  expect(relations.rows.some(item => item['id'] === replacement.id)).toBe(true)
  expect(assertOriginal).toThrow()
  const edit = vi.spyOn(relations, 'updateEditingValue')
  const remove = vi.spyOn(relations, 'removeRow')
  const add = vi.spyOn(relations, 'addRow')
  confirm.click()
  await flushPromises()
  expect.soft(edit).not.toHaveBeenCalled()
  expect.soft(remove).not.toHaveBeenCalled()
  expect.soft(add).not.toHaveBeenCalled()
  expect.soft(backend.saves).toEqual([])
  expect(backend.records[table]).toEqual(expectedRows)
})

it('keeps the selected enterprise audit open when SPARK Data returns a failed save result', async () => {
  const {row, runtime} = await mountEnterpriseWorkspace()
  const dataSet = runtime.resolveView(`${scenarioId}@EnterpriseInitializationRequest@default`)?.dataSet
  if (!dataSet) throw Error('缺少原初始化数据空间')
  const audit = row.findAll('button').find(button => button.text() === '审核')
  if (!audit) throw Error('缺少当前记录审核操作')
  const save = vi.spyOn(dataSet, 'saveChanges').mockResolvedValueOnce({success: false, message: '隔离回执拒绝'})
  await audit.trigger('click')
  await clickDialogAction('通过')
  await clickDialogAction('确定')
  expect(save, [...document.body.querySelectorAll('[role="alert"]')].map(alert => alert.textContent).join(' / ')).toHaveBeenCalledTimes(1)
  expect(document.body.textContent).toContain('企业审核 - 乙企业')
  expect(document.body.textContent).toContain('隔离回执拒绝')
  expect(document.body.textContent).not.toContain('企业初始化已完成')
  expect(api.state.http.saves).toEqual([])
})

it('checks the original initialization receipt after the target status changes without submitting again', async () => {
  const {row, runtime, backend} = await mountEnterpriseWorkspace()
  const dataSet = runtime.resolveView(`${scenarioId}@EnterpriseInitializationRequest@default`)?.dataSet
  if (!dataSet) throw Error('缺少原初始化数据空间')
  const audit = row.findAll('button').find(button => button.text() === '审核')
  if (!audit) throw Error('缺少当前记录审核操作')
  const save = vi.spyOn(dataSet, 'saveChanges')
  await audit.trigger('click')
  await clickDialogAction('通过')
  await clickDialogAction('确定')
  await vi.waitFor(() => expect(document.body.textContent).toContain('核验初始化结果'))
  expect(dataSet.saveJournal).toMatchObject({currentRecoverableAction: 'verify-original-receipt'})
  expect(backend.initializationRequests).toEqual([{entShortName: 'SECOND'}])
  const target = backend.records['Base_Enterprise_Info']?.find(item => item['rowid'] === 'E-SECOND')
  if (!target) throw Error('未找到夹具企业记录')
  target['CheckState'] = '1'
  await clickDialogAction('核验初始化结果')
  await vi.waitFor(() => expect(document.body.textContent).toContain('企业初始化已完成'))
  expect(dataSet.saveJournal).toMatchObject({completed: true, views: [{state: 'applied'}]})
  expect(save).toHaveBeenCalledTimes(1)
  expect(backend.initializationRequests).toEqual([{entShortName: 'SECOND'}])
})


it.each(['no-op', 'unknown', 'readback-failure'] as const)('uses only the original authorization receipt (%s)', async mode => {
  const {row, runtime, backend} = await mountEnterpriseWorkspace()
  const auth = runtime.resolveView(`${scenarioId}@enterprise_app_auth@default`)
  const dataSet = auth?.dataSet
  if (!auth || !dataSet) throw Error('Missing original authorization view')
  const entry = row.findAll('button').find(button => button.text() === '应用授权')
  if (!entry) throw Error('Missing authorization entry')
  await entry.trigger('click')
  const originalSave = dataSet.saveChanges.bind(dataSet)
  const save = vi.spyOn(dataSet, 'saveChanges')
  if (mode === 'no-op') save.mockImplementationOnce(options => {
    auth.discardPendingChanges(['AUTH-SECOND'])
    return originalSave(options)
  })
  else if (mode === 'unknown') backend.failAfterWrite = true
  else backend.beforeDefinitionRead = async table => {
    if (table === 'enterprise_app_auth' && backend.saves.length > 0) throw Error('隔离列表读取失败')
  }
  await clickDialogAction('授权')
  await clickDialogAction('确定')
  expect(save).toHaveBeenCalledTimes(1)
  if (mode === 'no-op') {
    expect(backend.saves).toEqual([])
    expect(document.body.textContent).not.toContain('应用授权成功')
    expect(document.body.textContent).toContain('没有已确认的保存回执')
    return
  }
  if (mode === 'readback-failure') {
    expect(dataSet.saveJournal).toMatchObject({completed:true,views:[{ids:['AUTH-SECOND'],state:'applied'}]})
    expect(document.body.textContent).toContain('应用授权成功')
    expect(document.body.textContent).toContain('保存已确认，授权列表读取失败')
    expect(backend.saves).toHaveLength(1)
    return
  }
  expect(backend.saves, document.body.querySelector('[role="alert"]')?.textContent ?? "").toHaveLength(1)
  expect(dataSet.saveJournal.currentRecoverableAction).toBe('verify-original-receipt')
  const originalReadCount = backend.reads.length
  await clickDialogAction('核验原授权结果')
  await vi.waitFor(() => expect(document.body.textContent).toContain('应用授权成功'))
  expect(save).toHaveBeenCalledTimes(1)
  expect(backend.saves, document.body.querySelector('[role="alert"]')?.textContent ?? "").toHaveLength(1)
  expect(backend.reads.slice(originalReadCount).some(read => read.table==='enterprise_app_auth'
    &&JSON.stringify(read.data).includes('AUTH-SECOND'))).toBe(true)
  expect(dataSet.saveJournal).toMatchObject({completed:true,views:[{ids:['AUTH-SECOND'],state:'applied'}]})
})

it.each(['no-op','unknown','readback-failure'] as const)('uses only the original module deletion receipt (%s)', async mode => {
  const {row, runtime, backend} = await mountEnterpriseWorkspace('module')
  const apps = runtime.resolveView(`${scenarioId}@Base_AppSystemList@default`)
  const modules = runtime.resolveView(`${scenarioId}@enterprise_module_auth@default`)
  const dataSet = modules?.dataSet
  if (!apps || !modules || !dataSet) throw Error('Missing original module authorization views')
  const entry = row.findAll('button').find(button => button.text() === '应用授权')
  if (!entry) throw Error('Missing authorization entry')
  await entry.trigger('click')
  await vi.waitFor(() => expect(document.body.textContent).toContain('甲企业应用'))
  const target = apps.rows.find(item => item['rowid'] === 'APP-FIRST')
  if (!target) throw Error('Missing first application')
  apps.setCurrentRow(target)
  await vi.waitFor(() => expect(document.body.textContent).toContain('夹具子模块'))
  const originalSave = dataSet.saveChanges.bind(dataSet)
  const save = vi.spyOn(dataSet, 'saveChanges')
  if (mode === 'no-op') save.mockImplementationOnce(options => {
    modules.discardPendingChanges(['MODULE-SECOND'])
    return originalSave(options)
  })
  else if (mode === 'unknown') backend.failAfterWrite = true
  else backend.beforeDefinitionRead = async table => {
    if (table === 'enterprise_module_auth' && backend.saves.length > 0) throw Error('模块列表读取失败')
  }
  await clickDialogAction('取消授权')
  await clickDialogAction('确定')
  expect(save).toHaveBeenCalledTimes(1)
  if (mode === 'no-op') {
    expect(backend.saves).toEqual([])
    expect(document.body.textContent).not.toContain('已取消模块授权')
    expect(document.body.textContent).toContain('没有已确认的保存回执')
    return
  }
  expect(backend.saves).toMatchObject([{table:'enterprise_module_auth',added:[],changed:[],deleted:[{id:'MODULE-SECOND'}]}])
  if (mode === 'readback-failure') {
    expect(dataSet.saveJournal).toMatchObject({completed:true,views:[{ids:['MODULE-SECOND'],state:'applied'}]})
    expect(document.body.textContent).toContain('已取消模块授权')
    expect(document.body.textContent).toContain('保存已确认，授权列表读取失败')
    return
  }
  expect(dataSet.saveJournal).toMatchObject({currentRecoverableAction:'verify-original-receipt',views:[{ids:['MODULE-SECOND'],state:'unknown'}]})
  const originalReadCount = backend.reads.length
  await clickDialogAction('核验原授权结果')
  await vi.waitFor(() => expect(document.body.textContent).toContain('已取消模块授权'))
  expect(save).toHaveBeenCalledTimes(1)
  expect(backend.saves).toHaveLength(1)
  expect(backend.reads.slice(originalReadCount).some(read => read.table==='enterprise_module_auth'
    &&JSON.stringify(read.data).includes('MODULE-SECOND'))).toBe(true)
  expect(dataSet.saveJournal).toMatchObject({completed:true,views:[{ids:['MODULE-SECOND'],state:'applied'}]})
  expect(backend.records['enterprise_module_auth']).toEqual([{id:'MODULE-OTHER',enterprise_id:'E-FIRST',nav_id:'CHILD',parent_nav_id:'PARENT',authorized:1}])
  await clickDialogAction('关闭')
  wrapper?.unmount()
  vi.mocked(PageRuntime.prototype.load).mockRestore()
  const reopened = await mountEnterpriseWorkspace('module', backend)
  const reopenedApps = reopened.runtime.resolveView(`${scenarioId}@Base_AppSystemList@default`)
  const reopenedModules = reopened.runtime.resolveView(`${scenarioId}@enterprise_module_auth@default`)
  expect(reopenedModules?.dataSet).not.toBe(dataSet)
  const reopenEntry = reopened.row.findAll('button').find(button => button.text() === '应用授权')
  if (!reopenEntry || !reopenedApps || !reopenedModules) throw Error('Missing independent authorization workspace')
  await reopenEntry.trigger('click')
  await vi.waitFor(() => expect(document.body.textContent).toContain('甲企业应用'))
  const reopenedApp = reopenedApps.rows.find(item => item['rowid'] === 'APP-FIRST')
  if (!reopenedApp) throw Error('Missing authorized application in independent workspace')
  reopenedApps.setCurrentRow(reopenedApp)
  await vi.waitFor(() => expect(document.body.textContent).toContain('夹具子模块'))
  expect(reopenedModules.rows).toEqual([])
  expect(backend.saves).toHaveLength(1)
})

it('retries an explicitly refused module removal after the original batch is settled', async () => {
  const {row, runtime, backend} = await mountEnterpriseWorkspace('module')
  const apps = runtime.resolveView(`${scenarioId}@Base_AppSystemList@default`)
  const modules = runtime.resolveView(`${scenarioId}@enterprise_module_auth@default`)
  const entry = row.findAll('button').find(button => button.text() === '应用授权')
  if (!apps || !modules || !entry) throw Error('Missing original authorization workspace')
  await entry.trigger('click')
  await vi.waitFor(() => expect(document.body.textContent).toContain('甲企业应用'))
  const target = apps.rows.find(item => item['rowid'] === 'APP-FIRST')
  if (!target) throw Error('Missing first application')
  apps.setCurrentRow(target)
  await vi.waitFor(() => expect(document.body.textContent).toContain('夹具子模块'))
  backend.rejectNextSave = true
  await clickDialogAction('取消授权')
  await clickDialogAction('确定')
  expect(backend.saves).toHaveLength(0)
  expect(modules.hasUnconfirmedSave).toBe(false)
  expect(document.body.textContent).toContain('保存失败')
  const recovered = modules.rows.find(item => item['id'] === 'MODULE-SECOND')
  if (!recovered) throw Error('Missing original authorized relation after rejection')
  expect(() => modules.captureReadRow(recovered, ['id', 'nav_id'])).not.toThrow()
  await clickDialogAction('取消授权')
  await clickDialogAction('确定')
  await vi.waitFor(() => expect(document.body.textContent).toContain('已取消模块授权'))
  expect(backend.saves).toMatchObject([{table:'enterprise_module_auth',added:[],changed:[],deleted:[{id:'MODULE-SECOND'}]}])
})
