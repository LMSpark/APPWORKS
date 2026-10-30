import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {config, flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import {Spark, registerAllRenderers, RendererTable} from '@spark-appworks/spark-component'
import {defineComponent, h} from 'vue'
import WorkflowDefinition from '@/views/features/data-platform/structured-config/workflow-definition/ui/workflow-definition-page.vue'
import {LowcodeWorkflowDefinition} from '@/lowcode/resources/structured-config/workflow-definition/resource'
import {createDynamicRouter} from '../../../../../packages/spark-app/src/router/dynamic'
import {buildFormalModels, StructuredCatalogHttp} from '../catalog/structured-config-catalog.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: StructuredCatalogHttp, runtime: DataSpaceRuntimeApi
const models = buildFormalModels({
  _Base_DataWorkFlow: ['rowid', 'AppId', 'FlowName', 'functiondesc', 'createuser', 'crttime'],
  Base_UserInfo: ['ID', 'ROWID', 'UserName'],
})
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}},
}))
const originalStubs = {...config.global.stubs}
beforeEach(() => {
  http = new StructuredCatalogHttp({
    _Base_DataWorkFlow: [{rowid: 'W1', AppId: 'APP', FlowName: '入库流程', functiondesc: '入库', createuser: 'U-ROW'}],
    Base_UserInfo: [{ID: 'U-PK', ROWID: 'U-ROW', UserName: '张三'}],
  })
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP'}})
  service.readSpaceDefinition.mockResolvedValue({dataSpaceId: LowcodeWorkflowDefinition.navigationScenarioId, name: '工作流', raw: {}})
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
  await createDynamicRouter({router, pageComponent: WorkflowDefinition, componentMap: {'/wf': WorkflowDefinition},
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header', items: [
      {id: 'wf', title: '工作流', path: '/wf', itemKind: 'system-page', blueprintScenarioId: LowcodeWorkflowDefinition.navigationScenarioId},
    ]})}).registerRoutes()
  await router.push('/wf'); await router.isReady()
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {attachTo: document.body,
    global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  await flushPromises()
  return {wrapper, router}
}

describe('workflow-definition page', () => {
  it('lists workflows and opens design', async () => {
    const {wrapper, router} = await openList()
    expect(wrapper.text()).toContain('数据工作流')
    expect(wrapper.findComponent(RendererTable).text()).toContain('入库流程')
    const push = vi.spyOn(router, 'push')
    await wrapper.findComponent(RendererTable).get('.el-table__body .el-table__row').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === '打开设计')!.trigger('click')
    await flushPromises()
    expect(push).toHaveBeenCalledWith(expect.objectContaining({query: expect.objectContaining({workflowId: 'W1'})}))
    wrapper.unmount()
  })

  it('disables 打开设计 without selection', async () => {
    const {wrapper} = await openList()
    const btn = wrapper.findAll('button').find(b => b.text() === '打开设计')!
    expect(btn.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
