import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {config, flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import {Spark} from '@spark-appworks/spark-component'
import LogicViewDesign from '@/views/features/data-platform/structured-config/logic-view/ui/logic-view-design-page.vue'
import {LowcodeLogicView} from '@/lowcode/resources/logic-view/lowcode-logic-view'
import {buildFormalModels, StructuredCatalogHttp} from './structured-config-catalog.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: StructuredCatalogHttp, runtime: DataSpaceRuntimeApi
const models = buildFormalModels({
  Base_DataViewList: ['rowid', 'AppId', 'name', 'createuser'],
  Base_UserInfo: ['ID', 'ROWID', 'UserName'],
})
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}},
}))
const originalStubs = {...config.global.stubs}
beforeEach(() => {
  http = new StructuredCatalogHttp({})
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP'}})
  service.readSpaceDefinition.mockResolvedValue({dataSpaceId: LowcodeLogicView.navigationScenarioId, name: '逻辑视图', raw: {}})
  service.readModel.mockImplementation(({metaName}: {metaName: string}) => Promise.resolve(models.find(m => m.metaName === metaName)))
  runtime = new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
  config.global.stubs = {...originalStubs, JsonTreeEditor: {
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue'],
  }}
})
afterEach(() => {config.global.stubs = originalStubs; vi.restoreAllMocks()})

describe('logic-view design page', () => {
  it('loads ViewData and saves', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{
        path: '/design',
        component: LogicViewDesign,
        meta: {blueprintScenarioId: LowcodeLogicView.navigationScenarioId},
      }],
    })
    await router.push({path: '/design', query: {viewId: 'V1'}})
    await router.isReady()
    const wrapper = mount(LogicViewDesign, {global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
    await flushPromises()
    expect(http.posts.some(p => p.url.includes('ViewData/GetView'))).toBe(true)
    await wrapper.find('textarea').setValue('{"nodes":[]}')
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text().includes('保存'))!.trigger('click')
    await flushPromises()
    expect(http.posts.some(p => p.url.includes('ViewData/SaveView'))).toBe(true)
    wrapper.unmount()
  })
})
