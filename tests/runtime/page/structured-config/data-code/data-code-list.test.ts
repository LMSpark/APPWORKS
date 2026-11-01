import catalogText from '../../../../../config/pages/structured-config/data-code-catalog/pagedata.json?raw'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {config, flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus, {ElSelect} from 'element-plus'
import {Spark, registerAllRenderers, RendererTable, FieldSelect} from '@spark-appworks/spark-component'
import {RequestState, type DataSet} from '@spark-appworks/spark-data'
import {defineComponent, h} from 'vue'
import DataCodeList from '@/views/features/data-platform/structured-config/data-code/ui/data-code-list-page.vue'
import {LowcodeDataCode} from '@/lowcode/resources/structured-config/data-code/resource'
import {createDynamicRouter} from '../../../../../packages/spark-app/src/router/dynamic'
import {buildFormalModels, StructuredCatalogHttp} from '../catalog/structured-config-catalog.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: StructuredCatalogHttp, runtime: DataSpaceRuntimeApi
const models = buildFormalModels({
  Base_CodeDesign: ['rowid', 'AppID', 'Name', 'CodeDescription', 'CodeExample', 'createuser', 'createtime'],
  Base_AppSystemList: ['rowid', 'AppName'],
  Base_UserInfo: ['ID', 'ROWID', 'UserName'],
  Base_StructureType: ['rowid', 'Mrowid', 'Name'],
}).map(model => ({...model, id: `${LowcodeDataCode.navigationScenarioId}p${({Base_CodeDesign: '000', Base_AppSystemList: '002', Base_UserInfo: '003'} as Record<string, string>)[model.metaName] ?? '001'}`}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeDesignFileUpload: async () => {throw new Error('unexpected file upload')},
  createLowcodeProjectGateways: () => ({scenarioViews: {readText: async () => catalogText}}),
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: {...service, readRelations: async () => [], readModelBatch: async (input: {metaNames: string[]}) => Promise.all(input.metaNames.map(metaName => service.readModel({...input, metaName})))}, get runtime() {return runtime}}},
}))
const originalStubs = {...config.global.stubs}
beforeEach(() => {
  http = new StructuredCatalogHttp({
    Base_CodeDesign: [{rowid: 'C1', AppID: 'TARGET', Name: '订单号', createuser: 'U-ROW'},
      {rowid: 'C2', AppID: 'OTHER', Name: '其他应用编码'}],
    Base_AppSystemList: [{rowid: 'TARGET', AppName: '目标应用'}, {rowid: 'OTHER', AppName: '其他应用'}],
    Base_UserInfo: [{ID: 'U-PK', ROWID: 'U-ROW', UserName: '张三'}],
    Base_StructureType: [{rowid: 'S1', Mrowid: '000000', Name: '基础'}],
  })
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP'}})
  service.readSpaceDefinition.mockResolvedValue({dataSpaceId: LowcodeDataCode.navigationScenarioId, name: '编码', raw: {}})
  service.readModel.mockImplementation(({metaName}: {metaName: string}) => Promise.resolve(models.find(m => m.metaName === metaName)))
  runtime = new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
})
afterEach(() => {config.global.stubs = originalStubs; vi.restoreAllMocks()})

async function chooseApplication(dataSet: DataSet, id = 'TARGET') {
  const apps = dataSet.getView('Base_AppSystemList')!
  await vi.waitFor(() => expect(apps.requestState).toBe(RequestState.Loaded))
  apps.setSelectedRows([apps.rows.find(row => row['rowid'] === id)!])
  await vi.waitFor(() => expect(dataSet.getView('Base_CodeDesign')!.rows[0]?.['AppID']).toBe(id))
}

async function openList(select = true) {
  const load = vi.spyOn(LowcodeDataCode, 'loadCatalog')
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const router = createRouter({history: createMemoryHistory(), routes: []})
  await createDynamicRouter({router, pageComponent: DataCodeList, componentMap: {'/code': DataCodeList},
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header', items: [
      {id: 'code', title: '编码', path: '/code', itemKind: 'system-page', blueprintScenarioId: LowcodeDataCode.navigationScenarioId},
    ]})}).registerRoutes()
  await router.push('/code'); await router.isReady()
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {attachTo: document.body,
    global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  await flushPromises()
  const ds = await load.mock.results[0]!.value as DataSet
  if (select) {await chooseApplication(ds); await flushPromises()}
  return {wrapper, router, ds}
}

describe('data-code list page', () => {
  it('loadCatalog returns scoped catalog rows', async () => {
    const dataSet = await LowcodeDataCode.loadCatalog(LowcodeDataCode.navigationScenarioId)
    dataSet.triggerAutoLoad()
    await chooseApplication(dataSet)
    const view = dataSet.getView(LowcodeDataCode.catalogMetaName, 'default')
    expect(view?.rows.length).toBe(1)
    expect(view?.rows[0]).toMatchObject({Name: '订单号', AppID: 'TARGET'})
    dataSet.destroy()
  })

  it('loads catalog and navigates to editor', async () => {
    const {wrapper, router} = await openList()
    expect(wrapper.text()).toContain('数据编码')
    expect(wrapper.findComponent(RendererTable).text()).toContain('订单号')
    const push = vi.spyOn(router, 'push')
    await wrapper.findComponent(RendererTable).get('.el-table__body .el-table__row').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === '方案设计')!.trigger('click')
    await flushPromises()
    expect(push).toHaveBeenCalledWith(expect.objectContaining({query: expect.objectContaining({codeDesignId: 'C1', applicationId: 'TARGET'})}))
    wrapper.unmount()
  })

  it('disables 方案设计 until a row is selected', async () => {
    const {wrapper} = await openList()
    const design = wrapper.findAll('button').find(b => b.text() === '方案设计')!
    expect(design.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('新增编码 navigates with create flag', async () => {
    const {wrapper, router} = await openList()
    const push = vi.spyOn(router, 'push')
    await wrapper.findAll('button').find(b => b.text() === '新增编码')!.trigger('click')
    await flushPromises()
    expect(push).toHaveBeenCalledWith(expect.objectContaining({query: expect.objectContaining({create: '1', applicationId: 'TARGET'})}))
    wrapper.unmount()
  })

  it('keeps the directory empty and creation disabled until an application is selected', async () => {
    const {wrapper, ds} = await openList(false)
    expect(ds.getView('Base_CodeDesign')!.rows).toEqual([])
    expect(wrapper.findAll('button').find(b => b.text() === '新增编码')!.attributes('disabled')).toBeDefined()
    await chooseApplication(ds)
    expect(ds.getView('Base_CodeDesign')!.rows.map(row => row['rowid'])).toEqual(['C1'])
    await chooseApplication(ds, 'OTHER')
    expect(ds.getView('Base_CodeDesign')!.rows.map(row => row['rowid'])).toEqual(['C2'])
    wrapper.unmount()
  })

  it('selects and clears the managed application through the bound standard dropdown', async () => {
    const {wrapper, ds} = await openList(false)
    await vi.waitFor(() => expect(ds.getView('Base_AppSystemList')!.rows.length).toBe(2))
    const select = wrapper.findComponent(FieldSelect).getComponent(ElSelect)
    expect(select.props('disabled')).toBe(false)
    select.vm.$emit('update:modelValue', 'TARGET')
    await vi.waitFor(() => expect(ds.getView('Base_CodeDesign')!.rows.map(row => row['rowid'])).toEqual(['C1']))
    select.vm.$emit('update:modelValue', '')
    await vi.waitFor(() => expect(ds.getView('Base_CodeDesign')!.rows).toEqual([]))
    expect(ds.getView('Base_AppSystemList')!.hasEditingChanges()).toBe(false)
    wrapper.unmount()
  })
})
