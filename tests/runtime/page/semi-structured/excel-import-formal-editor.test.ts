import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import {defineComponent, h} from 'vue'
import ElementPlus from 'element-plus'
import {RendererTree, FieldJson, FieldText, RendererTable, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import SparkJsonEditor from '../../../../packages/spark-component/src/components/editors/SparkJsonEditor.vue'
import ExcelEditor from '@/views/features/data-platform/semi-structured/excel-import/ui/excel-import-editor-page.vue'
import {ApiBackend} from '../api-provider/api-provider.fixture'
import {EXCEL, topicModels, topicTexts} from '../structured-config/catalog/formal-topic.fixture'
import {EXCEL_DESIGN, excelDesignModels, designText} from './excel-import-design.fixture'
const state = vi.hoisted(() => ({http: undefined as unknown as ApiBackend, runtime: undefined as unknown as DataSpaceRuntimeApi, dirtySources: [] as Array<{isDirty: boolean}>}))
vi.mock('@spark-appworks/spark-app', () => ({useSystemPageDirtySource: (source: {isDirty: boolean}) => state.dirtySources.push(source)}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return state.http}, lowcodeDesignFileUpload: async () => {throw new Error('unexpected upload')},
  createLowcodeProjectGateways: () => ({scenarioViews: {readText: async (id: string) => id === EXCEL_DESIGN ? designText : topicTexts[id] ?? null}}),
  lowcodeApi: {readRequestScope: () => ({token: 'scope', headers: {'X-AppId': 'D99A1DCE9894698799101EFD70F8FC76'}}), dataSpace: {
    get runtime() {return state.runtime}, design: {
      readSpaceDefinition: async ({dataSpaceId}: {dataSpaceId: string}) => ({dataSpaceId, name: 'Excel'}),
      readModelBatch: async ({dataSpaceId, metaNames}: {dataSpaceId: string; metaNames: string[]}) => (dataSpaceId === EXCEL_DESIGN ? excelDesignModels() : topicModels(dataSpaceId)).filter(model => metaNames.includes(model.metaName)),
      readRelations: async () => [],
    },
  }},
}))
const wrappers: VueWrapper[] = [], original = {...config.global.stubs}
beforeEach(() => {
  state.dirtySources = []
  state.http = new ApiBackend(); state.http.primaryKeys['Base_Import_Transform_Rule'] = 'id'
  state.http.records = {
    Base_Import_solution: [{rowid: 'E1', solutionName: '订单导入', dataSetId: 'S1'}, {rowid: 'E2', solutionName: '其他方案'}],
    Base_DataSet: [], Base_UserInfo: [],
    Base_ImportData_Config: [{rowid: 'C1', schemeid: 'E1', pid: 'E1', sheetName: '订单', sheet: 0, titleIndex: 1, dataIndex: 2, sheet_layout_json: '{"keep":false}'}],
    Base_ImportData_Field: [{rowid: 'F1', configid: 'C1', name: 'code', title: '编码', index: '01', type: 1}],
    Base_Import_Transform_Rule: [{id: 'R1', scheme_id: 'E1', config_id: 'C1', rule_name: '去空格', config_json: '{"keep":true}'}],
    ImportExportMethods: [{rowid: 'M1', val: 'tree', txt: '树形导入', ordIdx: 1}],
  }
  state.runtime = new DataSpaceRuntimeApi({http: state.http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'D99A1DCE9894698799101EFD70F8FC76'}})})
  registerAllRenderers()
  const stubs = {...original}; for (const key of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column', 'el-tree']) delete stubs[key]
  config.global.stubs = stubs
})
afterEach(() => {wrappers.splice(0).forEach(wrapper => wrapper.unmount()); config.global.stubs = original})
async function open(importConfigId = 'E1') {
  const router = createRouter({history: createMemoryHistory(), routes: [{path: '/editor', component: ExcelEditor, meta: {blueprintScenarioId: EXCEL}}, {path: '/other', component: {template: '<div>other</div>'}}]})
  await router.push({path: '/editor', query: {importConfigId}}); await router.isReady()
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]}}); wrappers.push(wrapper)
  await flushPromises()
  const click = async (label: string) => {const button = wrapper.findAll('button').find(button => button.text() === label); expect(button, label).toBeDefined(); await button!.trigger('click'); await flushPromises()}
  const choose = async () => {
    await vi.waitFor(() => expect(wrapper.findComponent(RendererTree).exists()).toBe(true))
    await wrapper.get('.el-tree-node__content').trigger('click'); await flushPromises()
    await vi.waitFor(() => expect(wrapper.findAllComponents(RendererTable)).toHaveLength(2))
  }
  return {wrapper, router, click, choose}
}
describe('formal Excel design editor', () => {
  it('verifies the catalog target before querying design nodes, then consumes the selected node children', async () => {
    const f = await open(); await f.choose()
    expect(state.http.reads[0]?.table).toBe('Base_Import_solution')
    expect(f.wrapper.getComponent(RendererTree).props('dataViewKey')).toBe(`${EXCEL_DESIGN}@Base_ImportData_Config@default`)
    expect(f.wrapper.findAll('input').map(input => (input.element as HTMLInputElement).value)).toContain('编码')
    expect(f.wrapper.findAll('input').map(input => (input.element as HTMLInputElement).value)).toContain('去空格')
    expect(state.http.reads.some(read => read.table === 'Base_ImportData_Field')).toBe(true)
    expect(state.http.saves).toEqual([])
  })
  it('saves layout changes through the node view without submitting field or transform edits', async () => {
    const f = await open(); await f.choose()
    const layout = f.wrapper.findAllComponents(FieldJson).find(field => field.props('field') === 'sheet_layout_json')!
    layout.getComponent(SparkJsonEditor).vm.$emit('update:modelValue', '{"keep":false,"layout":1}'); await flushPromises()
    expect(state.dirtySources[0]?.isDirty).toBe(true)
    await f.click('保存配置')
    expect(state.http.saves.map(save => save.table)).toEqual(['Base_ImportData_Config'])
    expect(state.http.records['Base_ImportData_Config']![0]!['sheet_layout_json']).toBe('{"keep":false,"layout":1}')
    expect(state.dirtySources[0]?.isDirty).toBe(false)
  })
  it('saves standard field edits separately and does not overwrite the original layout', async () => {
    const f = await open(); await f.choose()
    const fieldTable = f.wrapper.findAllComponents(RendererTable).find(table => table.props('dataViewKey')?.includes('@Base_ImportData_Field@'))!
    await fieldTable.get('tbody tr').trigger('click'); await flushPromises()
    const title = fieldTable.findAllComponents(FieldText).filter(field => field.props('field') === 'title').find(field => field.find('input').exists())!
    await title.get('input').setValue('订单编码'); await flushPromises(); await f.click('保存字段')
    expect(state.http.saves.map(save => save.table)).toEqual(['Base_ImportData_Field'])
    expect(state.http.records['Base_ImportData_Field']![0]!['title']).toBe('订单编码')
    expect(state.http.records['Base_ImportData_Config']![0]!['sheet_layout_json']).toBe('{"keep":false}')
  })
  it('does not load design data for a missing formal scheme target', async () => {
    const f = await open('MISSING')
    await vi.waitFor(() => expect(f.wrapper.text()).toContain('当前方案不存在'))
    expect(state.http.reads.map(read => read.table)).toEqual(['Base_Import_solution'])
    expect(f.wrapper.findComponent(RendererTree).exists()).toBe(false)
  })
  it('can discard a new root without requiring unqueried child views to have a save baseline', async () => {
    const f = await open()
    await vi.waitFor(() => expect(f.wrapper.findComponent(RendererTree).exists()).toBe(true))
    await f.click('新增根配置')
    await vi.waitFor(() => expect(f.wrapper.getComponent(ExcelEditor).vm.busy).toBe(false))
    expect(() => f.wrapper.getComponent(ExcelEditor).vm.discardChanges()).not.toThrow()
    expect(state.dirtySources[0]?.isDirty).toBe(false)
    expect(state.http.saves).toEqual([])
  })
  it('saves a new root before creating fields and binds the field to that new root rather than the previous selection', async () => {
    const f = await open(); await f.choose(); await f.click('新增根配置')
    const sheet = f.wrapper.findAllComponents(FieldText).find(field => field.props('field') === 'sheetName')!
    await sheet.get('input').setValue('新增Sheet'); await flushPromises(); await f.click('保存配置')
    const created = state.http.records['Base_ImportData_Config']!.find(row => row['sheetName'] === '新增Sheet')!
    expect(created).toBeDefined()
    await f.click('新增字段')
    const table = f.wrapper.findAllComponents(RendererTable).find(item => item.props('dataViewKey')?.includes('@Base_ImportData_Field@'))!
    const row = table.findAll('tbody tr').at(-1)!
    await row.findAll('input[type="text"]')[0]!.setValue('new_code'); await flushPromises()
    await f.click('保存字段')
    const field = state.http.records['Base_ImportData_Field']!.find(item => item['name'] === 'new_code')!
    expect(field?.['configid']).toBe(created['rowid'])
  })
})
