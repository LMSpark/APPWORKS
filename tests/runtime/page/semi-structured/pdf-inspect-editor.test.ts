import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import {Spark} from '@spark-appworks/spark-component'
import PdfEditor from '@/views/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-editor-page.vue'
import {LowcodePdfInspect} from '@/lowcode/resources/pdf-inspect/lowcode-pdf-inspect'
import {buildFormalModels} from '../structured-config/structured-config-catalog.fixture'
import {SemiStructuredHttp} from './semi-structured-http.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: SemiStructuredHttp, runtime: DataSpaceRuntimeApi
const models = buildFormalModels({
  _Base_PdfInspectRule: ['rowid', 'AppId', 'RuleName', 'createuser', 'crttime'],
  Base_UserInfo: ['ID', 'ROWID', 'UserName'],
})
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}},
}))
beforeEach(() => {
  http = new SemiStructuredHttp({
    _Base_PdfInspectRule: [{rowid: 'P1', AppId: 'APP', RuleName: '发票规则', createuser: 'U-ROW'}],
    Base_UserInfo: [{ID: 'U-PK', ROWID: 'U-ROW', UserName: '张三'}],
  })
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP'}})
  service.readSpaceDefinition.mockResolvedValue({dataSpaceId: LowcodePdfInspect.navigationScenarioId, name: 'pdf', raw: {}})
  service.readModel.mockImplementation(({metaName}: {metaName: string}) => Promise.resolve(models.find(m => m.metaName === metaName)))
  runtime = new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
})
afterEach(() => {vi.restoreAllMocks()})

describe('pdf-inspect editor page', () => {
  it('reads and writes rule JSON via staged DataView', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{
        path: '/editor',
        component: PdfEditor,
        meta: {blueprintScenarioId: LowcodePdfInspect.navigationScenarioId},
      }],
    })
    await router.push({path: '/editor', query: {ruleId: 'P1'}})
    await router.isReady()
    const wrapper = mount(PdfEditor, {global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
    await flushPromises()
    expect(http.posts.some(p => p.url.includes('PdfInspect/ReadRule'))).toBe(true)
    await wrapper.find('textarea.pdf-inspect-rule-form').setValue('{"pattern":"invoice"}')
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text().includes('保存'))!.trigger('click')
    await flushPromises()
    expect(http.posts.some(p => p.url.includes('PdfInspect/WriteRule'))).toBe(true)
    wrapper.unmount()
  })
})
