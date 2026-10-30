import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {config, flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import {Spark, registerAllRenderers, RendererTable} from '@spark-appworks/spark-component'
import {defineComponent, h} from 'vue'
import JsonDataPage from '@/views/features/data-platform/semi-structured/json-data/ui/json-data-page.vue'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'
import {buildFormalModels, StructuredCatalogHttp} from '../structured-config/catalog/structured-config-catalog.fixture'
import {SemiStructuredHttp} from './semi-structured-http.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: SemiStructuredHttp, runtime: DataSpaceRuntimeApi
const navigationScenarioId = 'FFDEF2AED3E19A38C0FCDDC748CF939B'
const models = buildFormalModels({
  Base_JsonData: ['rowid', 'name', 'updater', 'path', 'createuser'],
  Base_UserInfo: ['ID', 'ROWID', 'UserName'],
})
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}},
}))
const originalStubs = {...config.global.stubs}
beforeEach(() => {
  http = new SemiStructuredHttp({
    Base_JsonData: [{rowid: 'J1', name: '样例JSON', updater: 'U-ROW', path: '/sample.json', createuser: 'U-ROW'}],
    Base_UserInfo: [{ID: 'U-PK', ROWID: 'U-ROW', UserName: '张三'}],
  })
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP'}})
  service.readSpaceDefinition.mockResolvedValue({dataSpaceId: navigationScenarioId, name: 'json', raw: {}})
  service.readModel.mockImplementation(({metaName}: {metaName: string}) => Promise.resolve(models.find(m => m.metaName === metaName)))
  runtime = new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
  registerAllRenderers()
  config.global.stubs = {...originalStubs, JsonTreeEditor: {
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue'],
  }}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete config.global.stubs[key]
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {config.global.stubs = originalStubs; vi.restoreAllMocks()})

async function openPage() {
  const router = createRouter({history: createMemoryHistory(), routes: []})
  await createDynamicRouter({router, pageComponent: JsonDataPage, componentMap: {'/json': JsonDataPage},
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header', items: [
      {id: 'json', title: 'JSON', path: '/json', itemKind: 'system-page', blueprintScenarioId: navigationScenarioId},
    ]})}).registerRoutes()
  await router.push('/json'); await router.isReady()
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {attachTo: document.body,
    global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  await flushPromises()
  return wrapper
}

describe('json-data page', () => {
  it('loads catalog and fetches json content on row select', async () => {
    const wrapper = await openPage()
    expect(wrapper.text()).toContain('JSON 数据')
    expect(wrapper.findComponent(RendererTable).text()).toContain('样例JSON')
    await wrapper.findComponent(RendererTable).get('.el-table__body .el-table__row').trigger('click')
    await flushPromises()
    expect(http.posts.some(p => p.url.includes('GetJson'))).toBe(true)
    await wrapper.find('textarea').setValue('{"items":[]}')
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text().includes('保存内容'))!.trigger('click')
    await flushPromises()
    expect(http.posts.some(p => p.url.includes('SaveJsonData'))).toBe(true)
    wrapper.unmount()
  })
})
