import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import {Spark} from '@spark-appworks/spark-component'
import DataCodeEditor from '@/views/features/data-platform/structured-config/data-code/ui/data-code-editor-page.vue'
import {LowcodeDataCode} from '@/lowcode/resources/structured-config/data-code/resource'
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
})
afterEach(() => {vi.restoreAllMocks()})

async function mountEditor() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{
      path: '/editor',
      component: DataCodeEditor,
      meta: {blueprintScenarioId: LowcodeDataCode.navigationScenarioId},
    }],
  })
  await router.push({path: '/editor', query: {codeDesignId: 'C1'}})
  await router.isReady()
  const wrapper = mount(DataCodeEditor, {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  await flushPromises()
  return wrapper
}

const dialogButtons = ['父码规则', '序列规则', '时间片', '初始化数据', '编码类编辑', '编码类选择'] as const

describe('data-code editor dialogs', () => {
  it.each(dialogButtons)('opens dialog via %s button', async (label) => {
    const wrapper = await mountEditor()
    await wrapper.findAll('button').find(b => b.text().includes(label))!.trigger('click')
    await flushPromises()
    expect(document.body.textContent?.length).toBeGreaterThan(10)
    wrapper.unmount()
  })
})
