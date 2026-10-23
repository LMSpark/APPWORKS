import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import {Spark} from '@spark-appworks/spark-component'
import DataCodeEditor from '@/views/features/data-platform/structured-config/data-code/ui/data-code-editor-page.vue'
import {LowcodeDataCode} from '@/lowcode/resources/data-code/lowcode-data-code'
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

async function editorRouter(query: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{
      path: '/editor',
      component: DataCodeEditor,
      meta: {blueprintScenarioId: LowcodeDataCode.navigationScenarioId},
    }],
  })
  await router.push({path: '/editor', query})
  await router.isReady()
  return router
}

describe('data-code editor page', () => {
  it('shows error when codeDesignId missing', async () => {
    const router = await editorRouter()
    const wrapper = mount(DataCodeEditor, {global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
    await flushPromises()
    expect(wrapper.text()).toMatch(/缺少 codeDesignId/)
    wrapper.unmount()
  })

  it('loads detail and saves via POST', async () => {
    const router = await editorRouter({codeDesignId: 'C1'})
    const wrapper = mount(DataCodeEditor, {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
    await flushPromises()
    expect(http.posts.some(p => p.url.includes('GetCodeDesignDetail'))).toBe(true)
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('测试编码')
    await wrapper.find('input').setValue('新编码名')
    await wrapper.findAll('button').find(b => b.text().includes('保存'))!.trigger('click')
    await flushPromises()
    expect(http.posts.some(p => p.url.includes('SaveCodeDesign'))).toBe(true)
    wrapper.unmount()
  })

  it('opens class selector dialog', async () => {
    const router = await editorRouter({codeDesignId: 'C1'})
    const wrapper = mount(DataCodeEditor, {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text().includes('编码类选择'))!.trigger('click')
    await flushPromises()
    expect(document.body.textContent).toMatch(/编码类|类选择/)
    wrapper.unmount()
  })
})
