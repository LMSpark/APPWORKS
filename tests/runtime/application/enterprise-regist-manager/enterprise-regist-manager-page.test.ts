import {afterEach, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import scenario from '../../../../config/pages/application/enterprise-regist-manager/pagedata.json'
import {withTestPageService} from '../../../support/helpers/page-service-host'
import {createApiService, models, pagedata} from '../../page/api-provider/api-provider.fixture'

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

it('opens configuration for the selected enterprise under separate scenario table keys', async () => {
  const {Base_Enterprise_Info: enterpriseRows, Base_AppSystemList: applicationRows, ...other} = scenario.tables
  pagedata[scenarioId] = JSON.stringify({
    ...scenario, tables: {enterpriseRows, applicationRows, ...other},
    viewCascades: scenario.viewCascades.map(cascade => ({...cascade, parentTable: 'applicationRows'})),
  })
  api.reset({
    Base_Enterprise_Info: [
      {rowid: 'E-FIRST', CName: '甲企业', ShortName: 'FIRST', loginPolicy: 'OPEN', ent_config: '{}'},
      {rowid: 'E-SECOND', CName: '乙企业', ShortName: 'SECOND', loginPolicy: 'OPEN', ent_config: '{}'},
    ],
    Base_AppSystemList: [
      {rowid: 'APP-FIRST', EntShortName: 'FIRST', AppName: '甲企业应用'},
      {rowid: 'APP-SECOND', EntShortName: 'SECOND', AppName: '乙企业应用'},
    ],
    entCheckState: [], login_policy: [{rowid: 'POLICY-1', val: 'OPEN', txt: '开放', ordIdx: 1}],
  })
  const computedColumns = new Map(Object.values(scenario.tables).flatMap(table => 'modelBinding' in table && 'columns' in table
    ? [[table.modelBinding.modelName, new Set(table.columns.map(column => column.name))] as const] : []))
  api.service.readModelBatch.mockImplementation(async ({dataSpaceId, metaNames}: {dataSpaceId: string; metaNames: string[]}) =>
    models(dataSpaceId).filter(model => metaNames.includes(model.metaName)).map(model => ({...model,
      fields: model.fields.filter(field => !computedColumns.get(model.metaName)?.has(field.name))})))
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
