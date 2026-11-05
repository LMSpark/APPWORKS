import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import {defineComponent, h} from 'vue'
import ElementPlus from 'element-plus'
import {RendererTree, FieldJson, FieldText, FieldSelect, RendererTable, RendererButton, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {ElSelect} from 'element-plus'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import SparkJsonEditor from '../../../../packages/spark-component/src/components/editors/SparkJsonEditor.vue'
import ExcelEditor from '@/views/features/data-platform/semi-structured/excel-import/ui/excel-import-editor-page.vue'
import {ApiBackend} from '../api-provider/api-provider.fixture'
import {EXCEL, topicModels, topicTexts} from '../structured-config/catalog/formal-topic.fixture'
import {EXCEL_DESIGN, excelDesignModels, designText} from './excel-import-design.fixture'
import {DataSet} from '@spark-appworks/spark-data'
import {sourceModels, sourceRecords, SOURCE_SCENE} from '../structured-config/data-code/source-picker/fixture'
import sourceText from '../../../../config/pages/shared/business-table-selector/pagedata.json?raw'
const state = vi.hoisted(() => ({http: undefined as unknown as ApiBackend, runtime: undefined as unknown as DataSpaceRuntimeApi, dirtySources: [] as Array<{isDirty: boolean}>}))
vi.mock('@spark-appworks/spark-app', () => ({useSystemPageDirtySource: (source: {isDirty: boolean}) => state.dirtySources.push(source)}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return state.http}, lowcodeDesignFileUpload: async () => {throw new Error('unexpected upload')},
  createLowcodeProjectGateways: () => ({scenarioViews: {readText: async (id: string) => id === EXCEL_DESIGN ? designText : id === SOURCE_SCENE ? sourceText : topicTexts[id] ?? null}}),
  lowcodeApi: {readRequestScope: () => ({token: 'scope', headers: {'X-AppId': 'D99A1DCE9894698799101EFD70F8FC76'}}), dataSpace: {
    get runtime() {return state.runtime}, design: {
      readSpaceDefinition: async ({dataSpaceId}: {dataSpaceId: string}) => ({dataSpaceId, name: 'Excel'}),
      readModelBatch: async ({dataSpaceId, metaNames}: {dataSpaceId: string; metaNames: string[]}) => (dataSpaceId === EXCEL_DESIGN ? excelDesignModels() : dataSpaceId === SOURCE_SCENE ? await sourceModels() : topicModels(dataSpaceId)).filter(model => metaNames.includes(model.metaName)),
      readRelations: async () => [],
    },
  }},
}))
const wrappers: VueWrapper[] = [], original = {...config.global.stubs}
beforeEach(() => {
  state.dirtySources = []
  state.http = new ApiBackend(); state.http.primaryKeys['Base_Import_Transform_Rule'] = 'id'
  state.http.records = {
    ...sourceRecords(),
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
async function selectTarget(f: Awaited<ReturnType<typeof open>>) {
  await f.click('选择目标数据')
  await vi.waitFor(() => expect(document.body.textContent).toContain('字段替换预览'))
  f.wrapper.findAllComponents(FieldSelect).find(field => field.props('dataMember') === 'value')!.getComponent(ElSelect).vm.$emit('update:modelValue', 'A1'); await flushPromises()
  const table = (model: string) => f.wrapper.findAllComponents(RendererTable).find(item => item.props('dataViewKey')?.includes(`@${model}@`))!
  for (const model of ['Base_AppAndSource_Relation', '_Base_TblList']) {
    await vi.waitFor(() => expect(table(model).findAll('tbody tr').length).toBeGreaterThan(0))
    await table(model).get('tbody tr').trigger('click'); await flushPromises()
  }
  await vi.waitFor(() => expect(table('Base_TblField').text()).toContain('编号'))
  const confirm = f.wrapper.findAllComponents(RendererButton).find(button => button.props('label') === '确认并暂存目标及字段')!
  await vi.waitFor(() => expect((confirm.get('button').element as HTMLButtonElement).disabled).toBe(false))
  await confirm.get('button').trigger('click'); await flushPromises()
  await vi.waitFor(() => expect(f.wrapper.text()).toContain('目标及字段替换共同保存'))
}
describe('formal Excel design editor', () => {
  it('previews a leaf deletion and cancels without changing configuration, fields, or rules', async () => {
    const f = await open(); await f.choose(); await f.click('删除配置')
    await vi.waitFor(() => expect(document.body.textContent).toContain('同时删除 1 个字段和 1 条转换规则'))
    const cancel = f.wrapper.findAllComponents(RendererButton).find(button => button.props('label') === '取消删除配置')!
    await cancel.get('button').trigger('click'); await flushPromises()
    expect(state.http.saves).toEqual([])
    expect(state.http.records['Base_ImportData_Config']).toHaveLength(1)
    expect(state.http.records['Base_ImportData_Field']).toHaveLength(1)
    expect(state.http.records['Base_Import_Transform_Rule']).toHaveLength(1)
  })
  it('cancels a target replacement as one operation while retaining an earlier worksheet-name draft', async () => {
    state.http.records['Base_Import_Transform_Rule'] = []
    const f = await open(); await f.choose()
    await f.wrapper.findAllComponents(FieldText).find(field => field.props('field') === 'sheetName')!.get('input').setValue('此前工作表草稿'); await flushPromises()
    await selectTarget(f); await f.click('取消字段修改'); await f.click('保存配置')
    expect(state.http.saves.map(save => save.table)).toEqual(['Base_ImportData_Config'])
    expect(state.http.records['Base_ImportData_Config']![0]).toMatchObject({sheetName: '此前工作表草稿'})
    expect(state.http.records['Base_ImportData_Config']![0]!['table']).toBeUndefined()
    expect(state.http.records['Base_ImportData_Field']!.map(row => row['rowid'])).toEqual(['F1'])
  })
  it('jointly saves a confirmed target and its mapped fields then reopens through a fresh page runtime', async () => {
    state.http.records['Base_Import_Transform_Rule'] = []
    const f = await open(); await f.choose(); await selectTarget(f); await f.click('保存目标及字段')
    expect(state.http.saves.map(save => save.table).sort()).toEqual(['Base_ImportData_Config', 'Base_ImportData_Field'])
    expect(state.http.records['Base_ImportData_Config']![0]).toMatchObject({table: '数据库一@table_one', relatedappid: 'A1'})
    expect(state.http.records['Base_ImportData_Field']!.map(row => row['name'])).toEqual(['id', 'name'])
    f.wrapper.unmount(); const reopened = await open(); await reopened.choose()
    const names = reopened.wrapper.findAll('input').map(input => (input.element as HTMLInputElement).value)
    expect(names).toContain('编号'); expect(names).toContain('名称')
  })
  it('rejects an empty worksheet name when saving a joint source change from the fields action', async () => {
    state.http.records['Base_Import_Transform_Rule'] = []
    const f = await open(); await f.choose()
    await f.wrapper.findAllComponents(FieldText).find(field => field.props('field') === 'sheetName')!.get('input').setValue('   '); await flushPromises()
    await selectTarget(f); await f.click('保存目标及字段')
    expect(state.http.saves).toEqual([])
    expect(f.wrapper.text()).toContain('请输入工作表名称')
    expect(state.http.records['Base_ImportData_Config']![0]!['table']).toBeUndefined()
  })
  it.each(['换源', '删除'] as const)('can explicitly adopt a formal result after an invalid %s receipt and leave the page', async operation => {
    state.http.records['Base_Import_Transform_Rule'] = []
    const nativeSave = DataSet.prototype.saveChanges
    const receipt = vi.spyOn(DataSet.prototype, 'saveChanges').mockImplementation(async function(this: DataSet, options) {
      const result = await nativeSave.call(this, options)
      return {...result, data: {...result.data!, viewResults: result.data!.viewResults.slice(1)}}
    })
    try {
      const f = await open(); await f.choose()
      if (operation === '换源') {await selectTarget(f); await f.click('保存目标及字段')}
      else {
        await f.click('删除配置')
        const confirm = f.wrapper.findAllComponents(RendererButton).find(button => button.props('label') === '确认删除配置')!
        await confirm.get('button').trigger('click'); await flushPromises()
      }
      const writes = state.http.saves.length
      const adopt = f.wrapper.findAllComponents(RendererButton).find(button => button.props('label') === `读取并采用当前正式结果，结束原${operation}`)!
      expect(adopt).toBeDefined()
      await adopt.get('button').trigger('click'); await flushPromises()
      expect(f.wrapper.text()).toContain(`未确认原${operation}成功`)
      expect(state.http.saves).toHaveLength(writes)
      expect(state.dirtySources[0]?.isDirty).toBe(false)
      await f.router.push('/other'); expect(f.router.currentRoute.value.path).toBe('/other')
    } finally {receipt.mockRestore()}
  })
  it('previews a target through bound source views and cancels selection without changing the original configuration', async () => {
    const f = await open(); await f.choose(); await f.click('选择目标数据')
    await vi.waitFor(() => expect(document.body.textContent).toContain('字段替换预览'))
    const app = f.wrapper.findAllComponents(FieldSelect).find(field => field.props('dataMember') === 'value')!
    app.getComponent(ElSelect).vm.$emit('update:modelValue', 'A1'); await flushPromises()
    const sourceTable = (model: string) => f.wrapper.findAllComponents(RendererTable).find(table => table.props('dataViewKey')?.includes(`@${model}@`))!
    await vi.waitFor(() => expect(sourceTable('Base_AppAndSource_Relation').findAll('tbody tr').length).toBeGreaterThan(0))
    await sourceTable('Base_AppAndSource_Relation').get('tbody tr').trigger('click'); await flushPromises()
    await vi.waitFor(() => expect(sourceTable('_Base_TblList').findAll('tbody tr').length).toBeGreaterThan(0))
    await sourceTable('_Base_TblList').get('tbody tr').trigger('click'); await flushPromises()
    await vi.waitFor(() => expect(sourceTable('Base_TblField').text()).toContain('编号'))
    const cancel = [...document.body.querySelectorAll('button')].find(button => button.textContent?.trim() === '取消目标选择')!
    expect(cancel).toBeDefined(); cancel.click(); await flushPromises()
    expect(state.http.saves).toEqual([])
    expect(state.http.records['Base_ImportData_Field']!.map(row => row['rowid'])).toEqual(['F1'])
    expect(state.http.records['Base_ImportData_Config']![0]!['table']).toBeUndefined()
  })
  it('stages child and sibling configurations in the original tree and cancels without writes', async () => {
    const f = await open(); await f.choose()
    await f.click('新增子级配置')
    const sheet = () => f.wrapper.findAllComponents(FieldText).find(field => field.props('field') === 'sheetName')!
    await sheet().get('input').setValue('子配置一'); await flushPromises()
    await f.click('新增同级配置')
    await sheet().get('input').setValue('子配置二'); await flushPromises()
    expect(f.wrapper.findAll('.el-tree-node__content')).toHaveLength(3)
    expect(state.http.saves).toEqual([])
    await f.click('取消配置修改')
    expect(f.wrapper.findAll('.el-tree-node__content')).toHaveLength(1)
    expect(state.http.saves).toEqual([])
  })

  it('persists a child configuration under its captured parent using the scheme query scope', async () => {
    const f = await open(); await f.choose(); await f.click('新增子级配置')
    const sheet = f.wrapper.findAllComponents(FieldText).find(field => field.props('field') === 'sheetName')!
    await sheet.get('input').setValue('子Sheet'); await flushPromises(); await f.click('保存配置')
    expect(state.http.records['Base_ImportData_Config']!.find(row => row['sheetName'] === '子Sheet')).toMatchObject({schemeid: 'E1', pid: 'C1'})
    expect(state.http.saves.map(save => save.table)).toEqual(['Base_ImportData_Config'])
  })

  it('retains the selected root parent for a saved sibling rather than nesting it', async () => {
    const f = await open(); await f.choose(); await f.click('新增同级配置')
    const sheet = f.wrapper.findAllComponents(FieldText).find(field => field.props('field') === 'sheetName')!
    await sheet.get('input').setValue('同级Sheet'); await flushPromises(); await f.click('保存配置')
    expect(state.http.records['Base_ImportData_Config']!.find(row => row['sheetName'] === '同级Sheet')).toMatchObject({schemeid: 'E1', pid: 'E1'})
    expect(state.http.saves.map(save => save.table)).toEqual(['Base_ImportData_Config'])
  })
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
