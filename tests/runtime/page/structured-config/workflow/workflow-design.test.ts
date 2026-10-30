import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import {Spark} from '@spark-appworks/spark-component'
import WorkflowDesign from '@/views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-design-page.vue'
import {LowcodeWorkflowDefinition} from '@/lowcode/resources/structured-config/workflow-definition/resource'
import {buildFormalModels, StructuredCatalogHttp} from '../catalog/structured-config-catalog.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: StructuredCatalogHttp, runtime: DataSpaceRuntimeApi
const models = buildFormalModels({
  _Base_DataWorkFlow: ['rowid', 'AppId', 'FlowName', 'createuser', 'crttime'],
  Base_UserInfo: ['ID', 'ROWID', 'UserName'],
})
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}},
}))
beforeEach(() => {
  http = new StructuredCatalogHttp({})
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP'}})
  service.readSpaceDefinition.mockResolvedValue({dataSpaceId: LowcodeWorkflowDefinition.navigationScenarioId, name: '工作流', raw: {}})
  service.readModel.mockImplementation(({metaName}: {metaName: string}) => Promise.resolve(models.find(m => m.metaName === metaName)))
  runtime = new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
})
afterEach(() => {vi.restoreAllMocks()})

describe('workflow design page', () => {
  it('reads and writes design JSON', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{
        path: '/design',
        component: WorkflowDesign,
        meta: {blueprintScenarioId: LowcodeWorkflowDefinition.navigationScenarioId},
      }],
    })
    await router.push({path: '/design', query: {workflowId: 'W1'}})
    await router.isReady()
    const wrapper = mount(WorkflowDesign, {global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
    await flushPromises()
    expect(http.posts.some(p => p.url.includes('DataWorkFlowDesign/read'))).toBe(true)
    const nodePanel = wrapper.findComponent({name: 'WorkflowDesignNodePanel'})
    if (nodePanel.exists()) await nodePanel.vm.$emit('update:modelValue', [{id: 'n1'}])
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text().includes('保存'))!.trigger('click')
    await flushPromises()
    expect(http.posts.some(p => p.url.includes('DataWorkFlowDesign/write'))).toBe(true)
    wrapper.unmount()
  })
})
