import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import {RendererTable, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import Workflow from '@/views/features/data-platform/structured-config/workflow-definition/ui/workflow-definition-page.vue'
import Excel from '@/views/features/data-platform/semi-structured/excel-import/ui/excel-import-list-page.vue'
import Pdf from '@/views/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-list-page.vue'
import {WORKFLOW, EXCEL, PDF, topicModels, topicTexts} from './formal-topic.fixture'
vi.mock('@/views/features/data-platform/semi-structured/excel-import/ui/excel-import-editor-page.vue', () => ({default: {name:'ExcelEditorStub',props:['schemeRowid'],template:'<div data-excel-editor>{{schemeRowid}}</div>'}}))
vi.mock('@spark-appworks/spark-app', () => ({useSystemPageDirtySource: () => {}}))
const state = vi.hoisted(() => ({http: undefined as unknown as ApiBackend, runtime: undefined as unknown as DataSpaceRuntimeApi}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return state.http}, lowcodeDesignFileUpload: async () => {throw new Error('unexpected upload')},
  createLowcodeProjectGateways: () => ({scenarioViews: {readText: async (id: string) => topicTexts[id] ?? null}}),
  lowcodeApi: {readRequestScope: () => ({token: 'scope', headers: {'X-AppId': 'D99A1DCE9894698799101EFD70F8FC76'}}), dataSpace: {
    get runtime() {return state.runtime}, design: {
      readSpaceDefinition: async ({dataSpaceId}: {dataSpaceId: string}) => ({dataSpaceId, name: 'formal topic'}),
      readModelBatch: async ({dataSpaceId, metaNames}: {dataSpaceId: string; metaNames: string[]}) => topicModels(dataSpaceId).filter(model => metaNames.includes(model.metaName)),
      readRelations: async () => [],
    },
  }},
}))
const original = {...config.global.stubs}, wrappers: VueWrapper[] = []
beforeEach(() => {
  state.http = new ApiBackend(); state.http.primaryKeys['Base_FileInspectConfig'] = 'id'
  state.http.records = {
    Base_WorkflowDefinition: [{rowid: 'W1', name: '入库流程', workflow_key: 'INBOUND', description: '正式流程', status: '1'}],
    workflowStatus: [{rowid: 'STATUS1', val: '1', txt: '已启用', ordIdx: 1}],
    Base_Import_solution: [{rowid: 'E1', coding: 'EXCEL1', solutionName: '订单导入', description: '正式方案', dataSetId: 'S1', createuser: 'U1'}],
    Base_DataSet: [{rowid: 'S1', Name: '订单空间'}], Base_UserInfo: [{ID: 'USER1', ROWID: 'U1', UserName: '张三'}],
    Base_FileInspectConfig: [{id: 'P1', name: '发票规则', description: '正式PDF规则', enabled: 1}],
  }
  state.runtime = new DataSpaceRuntimeApi({http: state.http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'D99A1DCE9894698799101EFD70F8FC76'}})})
  registerAllRenderers()
  const stubs = {...original}; for (const key of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column']) delete stubs[key]
  config.global.stubs = stubs
})
afterEach(() => {wrappers.splice(0).forEach(wrapper => wrapper.unmount()); config.global.stubs = original})
describe('formal topic catalog pages', () => {
  it.each([
    [Workflow, WORKFLOW, '入库流程', 'workflowId', 'W1', 'Base_WorkflowDefinition'],
    [Excel, EXCEL, '订单导入', 'importConfigId', 'E1', 'Base_Import_solution'],
    [Pdf, PDF, '发票规则', 'ruleId', 'P1', 'Base_FileInspectConfig'],
  ] as const)('renders formal records and passes the original identity downstream for %s', async (page, scenarioId, title, parameter, identity, metaName) => {
    const router = createRouter({history: createMemoryHistory(), routes: [{path: '/catalog', component: page, meta: {blueprintScenarioId: scenarioId}}]})
    await router.push('/catalog'); await router.isReady()
    const push = vi.spyOn(router, 'push')
    const wrapper = mount(page, {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]}}); wrappers.push(wrapper)
    await vi.waitFor(() => expect(wrapper.text()).toContain(title))
    if (scenarioId === EXCEL) await vi.waitFor(() => expect(wrapper.text()).toContain('订单空间'))
    if (scenarioId === WORKFLOW) await vi.waitFor(() => expect(wrapper.text()).toContain('已启用'))
    const open = () => wrapper.findAll('button').find(button => button.text() === '打开设计')!
    expect(open().attributes('disabled')).toBeDefined()
    await wrapper.getComponent(RendererTable).get('tbody tr').trigger('click'); await flushPromises()
    await open().trigger('click'); await flushPromises()
    if (scenarioId === EXCEL) {
      expect(push).not.toHaveBeenCalled()
      expect(wrapper.getComponent({name:'ExcelEditorStub'}).props('schemeRowid')).toBe(identity)
      expect(router.currentRoute.value.path).toBe('/catalog')
    } else expect(push).toHaveBeenCalledWith(expect.objectContaining({query: {[parameter]: identity}}))
    expect(state.http.reads.some(read => read.table === metaName)).toBe(true)
    if (scenarioId !== EXCEL) expect(state.http.reads.some(read => read.table === 'Base_UserInfo')).toBe(false)
    expect(state.http.saves).toEqual([])
  })
})
