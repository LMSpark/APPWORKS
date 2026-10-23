import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import {Spark} from '@spark-appworks/spark-component'
import ExcelEditor from '@/views/features/data-platform/semi-structured/excel-import/ui/excel-import-editor-page.vue'
import {LowcodeExcelImport} from '@/lowcode/resources/excel-import/lowcode-excel-import'
import {buildFormalModels} from '../structured-config/structured-config-catalog.fixture'
import {SemiStructuredHttp} from './semi-structured-http.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: SemiStructuredHttp, runtime: DataSpaceRuntimeApi
const models = buildFormalModels({
  _Base_ImportConfig: ['rowid', 'AppId', 'ConfigName', 'functiondesc', 'createuser', 'crttime'],
  Base_UserInfo: ['ID', 'ROWID', 'UserName'],
})
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}},
}))
beforeEach(() => {
  http = new SemiStructuredHttp({
    _Base_ImportConfig: [{rowid: 'E1', AppId: 'APP', ConfigName: '订单导入', createuser: 'U-ROW'}],
    Base_UserInfo: [{ID: 'U-PK', ROWID: 'U-ROW', UserName: '张三'}],
  })
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP'}})
  service.readSpaceDefinition.mockResolvedValue({dataSpaceId: LowcodeExcelImport.navigationScenarioId, name: 'excel', raw: {}})
  service.readModel.mockImplementation(({metaName}: {metaName: string}) => Promise.resolve(models.find(m => m.metaName === metaName)))
  runtime = new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
})
afterEach(() => {vi.restoreAllMocks()})

describe('excel-import editor page', () => {
  it('reads and writes design via DataSet saveChanges', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{
        path: '/editor',
        component: ExcelEditor,
        meta: {blueprintScenarioId: LowcodeExcelImport.navigationScenarioId},
      }],
    })
    await router.push({path: '/editor', query: {importConfigId: 'E1'}})
    await router.isReady()
    const wrapper = mount(ExcelEditor, {global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
    await flushPromises()
    expect(http.posts.some(p => p.url.includes('ExcelImport/ReadDesign'))).toBe(true)
    await wrapper.find('textarea.excel-import-pane').setValue('[{"sheet":"S2"}]')
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text().includes('保存'))!.trigger('click')
    await flushPromises()
    expect(http.posts.some(p => p.url.includes('ExcelImport/WriteDesign'))).toBe(true)
    wrapper.unmount()
  })
})
