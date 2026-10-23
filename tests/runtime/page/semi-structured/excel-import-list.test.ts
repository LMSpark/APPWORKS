import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {config, flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import {Spark, registerAllRenderers, RendererTable} from '@spark-appworks/spark-component'
import {defineComponent, h} from 'vue'
import ExcelList from '@/views/features/data-platform/semi-structured/excel-import/ui/excel-import-list-page.vue'
import {LowcodeExcelImport} from '@/lowcode/resources/excel-import/lowcode-excel-import'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'
import {buildFormalModels} from '../structured-config/structured-config-catalog.fixture'
import {SemiStructuredHttp} from './semi-structured-http.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: SemiStructuredHttp, runtime: DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}},
}))
const originalStubs = {...config.global.stubs}
beforeEach(() => {
  http = new SemiStructuredHttp({
    _Base_ImportConfig: [{rowid: 'E1', AppId: 'APP', ConfigName: '订单导入', createuser: 'U-ROW'}],
    Base_UserInfo: [{ID: 'U-PK', ROWID: 'U-ROW', UserName: '张三'}],
  })
  const models = buildFormalModels({
    _Base_ImportConfig: ['rowid', 'AppId', 'ConfigName', 'functiondesc', 'createuser', 'crttime'],
    Base_UserInfo: ['ID', 'ROWID', 'UserName'],
  })
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP'}})
  service.readSpaceDefinition.mockResolvedValue({dataSpaceId: LowcodeExcelImport.navigationScenarioId, name: 'excel', raw: {}})
  service.readModel.mockImplementation(({metaName}: {metaName: string}) => Promise.resolve(models.find(m => m.metaName === metaName)))
  runtime = new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {config.global.stubs = originalStubs; vi.restoreAllMocks()})

describe('excel-import list', () => {
  it('opens editor route', async () => {
    const router = createRouter({history: createMemoryHistory(), routes: []})
    await createDynamicRouter({router, pageComponent: ExcelList, componentMap: {'/excel': ExcelList},
      loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header', items: [
        {id: 'excel', title: 'Excel', path: '/excel', itemKind: 'system-page', blueprintScenarioId: LowcodeExcelImport.navigationScenarioId},
      ]})}).registerRoutes()
    await router.push('/excel'); await router.isReady()
    const push = vi.spyOn(router, 'push')
    const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {attachTo: document.body,
      global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
    await flushPromises()
    expect(wrapper.findComponent(RendererTable).text()).toContain('订单导入')
    await wrapper.findComponent(RendererTable).get('.el-table__body .el-table__row').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === '打开设计')!.trigger('click')
    await flushPromises()
    expect(push).toHaveBeenCalledWith(expect.objectContaining({query: {importConfigId: 'E1'}}))
    wrapper.unmount()
  })
})
