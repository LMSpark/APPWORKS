import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {config, flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import {Spark, registerAllRenderers, RendererTable} from '@spark-appworks/spark-component'
import {defineComponent, h} from 'vue'
import DataCodeList from '@/views/features/data-platform/structured-config/data-code/ui/data-code-list-page.vue'
import {LowcodeDataCode} from '@/lowcode/resources/structured-config/data-code/resource'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'
import {buildFormalModels, StructuredCatalogHttp} from './structured-config-catalog.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: StructuredCatalogHttp, runtime: DataSpaceRuntimeApi
const models = buildFormalModels({
  _Base_CodeDesign: ['rowid', 'AppId', 'CodeName', 'functiondesc', 'createuser', 'crttime'],
  Base_UserInfo: ['ID', 'ROWID', 'UserName'],
  Base_StructureType: ['rowid', 'Mrowid', 'Name'],
})
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}},
}))
const originalStubs = {...config.global.stubs}
beforeEach(() => {
  http = new StructuredCatalogHttp({
    _Base_CodeDesign: [{rowid: 'C1', AppId: 'APP', CodeName: '订单号', createuser: 'U-ROW'}],
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

async function openList() {
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
  return {wrapper, router}
}

describe('data-code list page', () => {
  it('loadCatalog returns scoped catalog rows', async () => {
    const dataSet = await LowcodeDataCode.loadCatalog(LowcodeDataCode.navigationScenarioId)
    const view = dataSet.getView(LowcodeDataCode.catalogMetaName, 'default')
    expect(view?.rows.length).toBe(1)
    expect(view?.rows[0]).toMatchObject({CodeName: '订单号'})
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
    expect(push).toHaveBeenCalledWith(expect.objectContaining({query: expect.objectContaining({codeDesignId: 'C1'})}))
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
    expect(push).toHaveBeenCalledWith(expect.objectContaining({query: expect.objectContaining({create: '1'})}))
    wrapper.unmount()
  })
})
