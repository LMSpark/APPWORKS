import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import catalogText from '../../../../../config/pages/structured-config/data-code-catalog/pagedata.json?raw'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {config, flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus, {ElSelect} from 'element-plus'
import {Spark, registerAllRenderers, RendererForm, RendererTable, RendererDialog, FieldSelect, FieldText} from '@spark-appworks/spark-component'
import {RequestState, type DataSet} from '@spark-appworks/spark-data'
import {defineComponent, h} from 'vue'
import DataCodeList from '@/views/features/data-platform/structured-config/data-code/ui/data-code-list-page.vue'
import {LowcodeDataCode} from '@/lowcode/resources/structured-config/data-code/resource'
import {createDynamicRouter} from '../../../../../packages/spark-app/src/router/dynamic'
import {buildFormalModels} from '../catalog/structured-config-catalog.fixture'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {codeModels, designText, DESIGN} from './data-code.fixture'
import DataCodeEditor from '@/views/features/data-platform/structured-config/data-code/ui/data-code-editor-page.vue'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: ApiBackend, runtime: DataSpaceRuntimeApi
const models = buildFormalModels({
  Base_CodeDesign: ['rowid', 'AppID', 'Name', 'CodeDescription', 'CodeExample', 'createuser', 'createtime'],
  Base_AppSystemList: ['rowid', 'AppName'],
  Base_UserInfo: ['ID', 'rowid', 'UserName'],
  Base_StructureType: ['rowid', 'Mrowid', 'Name'],
}).map(model => ({...model, id: `${LowcodeDataCode.navigationScenarioId}p${({Base_CodeDesign: '000', Base_AppSystemList: '002', Base_UserInfo: '003'} as Record<string, string>)[model.metaName] ?? '001'}`}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeDesignFileUpload: async () => {throw new Error('unexpected file upload')},
  createLowcodeProjectGateways: () => ({scenarioViews: {readText: async (id: string) => id === DESIGN ? designText : catalogText}}),
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: {...service, readRelations: async () => [], readModelBatch: async (input: {metaNames: string[]}) => Promise.all(input.metaNames.map(metaName => service.readModel({...input, metaName})))}, get runtime() {return runtime}}},
}))
const originalStubs = {...config.global.stubs}
beforeEach(() => {
  http = new ApiBackend()
  http.records = {
    Base_CodeDesign: [{rowid: 'C1', AppID: 'TARGET', Name: '订单号', BusTableRowid: 'T1', BusTableName: '订单', createuser: 'U-ROW'},
      {rowid: 'C2', AppID: 'OTHER', Name: '其他应用编码'}],
    Base_AppSystemList: [{rowid: 'TARGET', AppName: '目标应用'}, {rowid: 'OTHER', AppName: '其他应用'}],
    Base_UserInfo: [{ID: 'U-PK', rowid: 'U-ROW', UserName: '张三'}],
    Base_CodeNodeDesign: [{rowid: 'N1', CodeDesignID: 'C1', NodeNo: 1, NodeType: 2, ParameterName: 'INV', CodeNodeDesignJson: '{"ConstString":"INV"}'}],
    Dict_CodeNodeType: [{rowid: 'D2', val: '2', txt: '固定字符串', ordIdx: '2'}],
  }
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP'}})
  service.readSpaceDefinition.mockImplementation(({dataSpaceId}: {dataSpaceId: string}) => Promise.resolve({dataSpaceId, name: '编码'}))
  service.readModel.mockImplementation(({metaName, dataSpaceId}: {metaName: string; dataSpaceId: string}) =>
    Promise.resolve((dataSpaceId === DESIGN ? codeModels() : models).find(m => m.metaName === metaName)))
  runtime = new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
})
afterEach(() => {config.global.stubs = originalStubs; vi.restoreAllMocks()})

async function chooseApplication(dataSet: DataSet, id = 'TARGET') {
  const apps = dataSet.getView('Base_AppSystemList')!
  await vi.waitFor(() => expect(apps.requestState).toBe(RequestState.Loaded))
  apps.setSelectedRows([apps.rows.find(row => row['rowid'] === id)!])
  await vi.waitFor(() => expect(dataSet.getView('Base_CodeDesign')!.rows[0]?.['AppID']).toBe(id))
}

async function openList(select = true) {
  const load = vi.spyOn(LowcodeDataCode, 'loadCatalog')
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const router = createRouter({history: createMemoryHistory(), routes: []})
  await createDynamicRouter({router, pageComponent: DataCodeList, componentMap: {'/code': DataCodeList},
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header', items: [
      {id: 'code', title: '编码', path: '/code', itemKind: 'system-page', blueprintScenarioId: LowcodeDataCode.navigationScenarioId},
    ]})}).registerRoutes()
  await router.push('/code'); await router.isReady()
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {attachTo: document.body,
    global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  await flushPromises()
  const ds = await load.mock.results[0]!.value as DataSet
  if (select) {await chooseApplication(ds); await flushPromises()}
  return {wrapper, router, ds}
}

describe('data-code list page', () => {
  it('hosts the code catalog runtime through the shared native session', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/views/features/data-platform/structured-config/data-code/ui/data-code-list-page.vue'), 'utf8')
    expect(source).toContain('new NativePageRuntimeSession')
    expect(source).toContain('session.isCurrent(current)')
    expect(source).not.toContain('new PageRuntime')
  })
  it('gives the application selector a usable form column instead of the default 24-slot grid', async () => {
    const {wrapper} = await openList(false)
    await vi.waitFor(() => expect(wrapper.findComponent(RendererForm).exists()).toBe(true))
    expect(wrapper.getComponent(RendererForm).props('gridColumns')).toBe(3)
    wrapper.unmount()
  })
  it('loadCatalog returns scoped catalog rows', async () => {
    const dataSet = await LowcodeDataCode.loadCatalog(LowcodeDataCode.navigationScenarioId)
    dataSet.triggerAutoLoad()
    await chooseApplication(dataSet)
    const view = dataSet.getView(LowcodeDataCode.catalogMetaName, 'default')
    expect(view?.rows.length).toBe(1)
    expect(view?.rows[0]).toMatchObject({Name: '订单号', AppID: 'TARGET'})
    dataSet.destroy()
  })

  it('opens the editor in the catalog dialog with the selected managed target', async () => {
    const {wrapper, router} = await openList()
    expect(wrapper.text()).toContain('数据编码')
    expect(wrapper.findComponent(RendererTable).text()).toContain('订单号')
    await wrapper.findComponent(RendererTable).get('.el-table__body .el-table__row').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === '方案设计')!.trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.findComponent(DataCodeEditor).exists()).toBe(true))
    expect(router.currentRoute.value.path).toBe('/code')
    expect(wrapper.getComponent(DataCodeEditor).props()).toMatchObject({codeDesignId: 'C1', applicationId: 'TARGET'})
    wrapper.unmount()
  })

  it('disables 方案设计 until a row is selected', async () => {
    const {wrapper} = await openList()
    const design = wrapper.findAll('button').find(b => b.text() === '方案设计')!
    expect(design.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('opens a new design target in the same catalog dialog', async () => {
    const loaded = vi.spyOn(LowcodeDataCode, 'loadEditor')
    const {wrapper, router} = await openList()
    await wrapper.findAll('button').find(b => b.text() === '新增编码')!.trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.findComponent(DataCodeEditor).exists()).toBe(true))
    expect(router.currentRoute.value.path).toBe('/code')
    expect(wrapper.getComponent(DataCodeEditor).props('applicationId')).toBe('TARGET')
    expect(wrapper.getComponent(DataCodeEditor).props('codeDesignId')).toMatch(/^[A-F0-9]{32}$/)
    expect(wrapper.getComponent(DataCodeEditor).props('create')).toBe(true)
    const editor = wrapper.getComponent(DataCodeEditor)
    await vi.waitFor(() => expect(editor.findAllComponents(FieldText).some(field => field.props('field') === 'Name' && field.find('input').exists())).toBe(true))
    const design = await loaded.mock.results[0]!.value as DataSet, main = design.getView('Base_CodeDesign')!
    expect(main.dirtyTracking.pendingCreateIds.has(String(editor.props('codeDesignId')))).toBe(true)
    expect(main.currentRow).toMatchObject({AppID: 'TARGET', Name: '', BusTableRowid: ''})
    const name = editor.findAllComponents(FieldText).find(field => field.props('field') === 'Name')!
    await name.get('input').setValue('本地新增名称'); await name.get('input').trigger('change'); await flushPromises()
    expect(main.getEditingRow(String(editor.props('codeDesignId')))?.['Name']).toBe('本地新增名称')
    expect(http.saves).toEqual([])
    await vi.waitFor(() => expect(wrapper.findAll('button').find(button => button.text() === '放弃修改并关闭')!.attributes('disabled')).toBeUndefined())
    await wrapper.findAll('button').find(button => button.text() === '放弃修改并关闭')!.trigger('click')
    await vi.waitFor(() => expect(wrapper.findComponent(DataCodeEditor).exists()).toBe(false))
    expect(http.records['Base_CodeDesign']).toHaveLength(2)
    expect(http.saves).toEqual([])
    wrapper.unmount()
  })

  it('keeps a dirty dialog open until explicit discard and then closes without saving', async () => {
    const {wrapper} = await openList()
    await wrapper.findComponent(RendererTable).get('.el-table__body .el-table__row').trigger('click')
    await wrapper.findAll('button').find(b => b.text() === '方案设计')!.trigger('click'); await flushPromises()
    await vi.waitFor(() => expect(wrapper.findComponent(DataCodeEditor).findAllComponents(FieldText).some(f => f.props('field') === 'Name' && f.find('input').exists())).toBe(true))
    const name = wrapper.getComponent(DataCodeEditor).findAllComponents(FieldText).find(f => f.props('field') === 'Name')!
    await name.get('input').setValue('本地修改'); await name.get('input').trigger('change'); await flushPromises()
    const dialog = wrapper.getComponent(RendererDialog)
    expect(dialog.props('closeDisabled')).toBe(true)
    dialog.vm.$emit('update:modelValue', false); await flushPromises()
    expect(wrapper.findComponent(DataCodeEditor).exists()).toBe(true)
    await wrapper.findAll('button').find(b => b.text() === '放弃修改并关闭')!.trigger('click')
    await vi.waitFor(() => expect(wrapper.findComponent(DataCodeEditor).exists()).toBe(false))
    expect(http.saves).toEqual([])
    expect(http.records['Base_CodeDesign']![0]!['Name']).toBe('订单号')
    wrapper.unmount()
  })

  it('closes a successfully saved design and rereads the current catalog', async () => {
    const {wrapper} = await openList()
    await wrapper.findComponent(RendererTable).get('.el-table__body .el-table__row').trigger('click')
    await wrapper.findAll('button').find(b => b.text() === '方案设计')!.trigger('click'); await flushPromises()
    await vi.waitFor(() => expect(wrapper.findComponent(DataCodeEditor).findAllComponents(FieldText).some(f => f.props('field') === 'Name' && f.find('input').exists())).toBe(true))
    const editor = wrapper.getComponent(DataCodeEditor), name = editor.findAllComponents(FieldText).find(f => f.props('field') === 'Name')!
    await name.get('input').setValue('目录回读名称'); await name.get('input').trigger('change'); await flushPromises()
    await editor.findAll('button').find(b => b.text() === '保存设计')!.trigger('click')
    await vi.waitFor(() => expect(wrapper.findComponent(DataCodeEditor).exists()).toBe(false))
    await vi.waitFor(() => expect(wrapper.getComponent(RendererTable).text()).toContain('目录回读名称'))
    expect(http.saves).toHaveLength(1)
    wrapper.unmount()
  })

  it('locks close and discard during saving and keeps the captured target when the directory selection changes', async () => {
    const {wrapper, ds} = await openList()
    await wrapper.findComponent(RendererTable).get('.el-table__body .el-table__row').trigger('click')
    await wrapper.findAll('button').find(b => b.text() === '方案设计')!.trigger('click'); await flushPromises()
    await vi.waitFor(() => expect(wrapper.findComponent(DataCodeEditor).findAllComponents(FieldText).some(f => f.props('field') === 'Name' && f.find('input').exists())).toBe(true))
    const editor = wrapper.getComponent(DataCodeEditor), name = editor.findAllComponents(FieldText).find(f => f.props('field') === 'Name')!
    await name.get('input').setValue('只保存原目标'); await name.get('input').trigger('change'); await flushPromises()
    let release!: () => void
    http.beforeSave = () => new Promise<void>(resolve => {release = resolve})
    await editor.findAll('button').find(b => b.text() === '保存设计')!.trigger('click'); await flushPromises()
    expect(wrapper.getComponent(RendererDialog).props('closeDisabled')).toBe(true)
    expect(wrapper.findAll('button').find(b => b.text() === '放弃修改并关闭')!.attributes('disabled')).toBeDefined()
    wrapper.getComponent(RendererDialog).vm.$emit('update:modelValue', false); await flushPromises()
    expect(wrapper.findComponent(DataCodeEditor).exists()).toBe(true)
    await chooseApplication(ds, 'OTHER')
    expect(editor.props()).toMatchObject({applicationId: 'TARGET', codeDesignId: 'C1'})
    release()
    await vi.waitFor(() => expect(wrapper.findComponent(DataCodeEditor).exists()).toBe(false))
    expect(http.records['Base_CodeDesign']![0]!['Name']).toBe('只保存原目标')
    expect(http.records['Base_CodeDesign']![1]!['Name']).toBe('其他应用编码')
    expect(ds.getView('Base_CodeDesign')!.rows[0]!['AppID']).toBe('OTHER')
    wrapper.unmount()
  })

  it('keeps an unknown save open until formal readback confirms it without replaying the write', async () => {
    const {wrapper} = await openList()
    await wrapper.findComponent(RendererTable).get('.el-table__body .el-table__row').trigger('click')
    await wrapper.findAll('button').find(b => b.text() === '方案设计')!.trigger('click'); await flushPromises()
    await vi.waitFor(() => expect(wrapper.findComponent(DataCodeEditor).findAllComponents(FieldText).some(f => f.props('field') === 'Name' && f.find('input').exists())).toBe(true))
    const editor = wrapper.getComponent(DataCodeEditor), name = editor.findAllComponents(FieldText).find(f => f.props('field') === 'Name')!
    await name.get('input').setValue('待核实名称'); await name.get('input').trigger('change'); await flushPromises()
    http.failAfterWrite = true
    await editor.findAll('button').find(b => b.text() === '保存设计')!.trigger('click')
    await vi.waitFor(() => expect(editor.find('[role="alert"]').exists()).toBe(true))
    expect(wrapper.getComponent(RendererDialog).props('closeDisabled')).toBe(true)
    expect(wrapper.findAll('button').find(b => b.text() === '放弃修改并关闭')!.attributes('disabled')).toBeDefined()
    await wrapper.findAll('button').find(b => b.text() === '放弃修改并关闭')!.trigger('click'); await flushPromises()
    expect(wrapper.findComponent(DataCodeEditor).exists()).toBe(true)
    expect(http.saves).toHaveLength(1)
    await editor.findAll('button').find(b => b.text() === '核验保存结果')!.trigger('click')
    await vi.waitFor(() => expect(editor.find('[role="alert"]').exists() ? editor.find('[role="alert"]').text() : '').toBe(''))
    await vi.waitFor(() => expect(wrapper.findComponent(DataCodeEditor).exists()).toBe(false))
    expect(http.saves).toHaveLength(1)
    expect(wrapper.getComponent(RendererTable).text()).toContain('待核实名称')
    wrapper.unmount()
  })

  it('keeps the directory empty and creation disabled until an application is selected', async () => {
    const {wrapper, ds} = await openList(false)
    expect(ds.getView('Base_CodeDesign')!.rows).toEqual([])
    expect(wrapper.findAll('button').find(b => b.text() === '新增编码')!.attributes('disabled')).toBeDefined()
    await chooseApplication(ds)
    expect(ds.getView('Base_CodeDesign')!.rows.map(row => row['rowid'])).toEqual(['C1'])
    await chooseApplication(ds, 'OTHER')
    expect(ds.getView('Base_CodeDesign')!.rows.map(row => row['rowid'])).toEqual(['C2'])
    wrapper.unmount()
  })

  it('selects and clears the managed application through the bound standard dropdown', async () => {
    const {wrapper, ds} = await openList(false)
    await vi.waitFor(() => expect(ds.getView('Base_AppSystemList')!.rows.length).toBe(2))
    const select = wrapper.findComponent(FieldSelect).getComponent(ElSelect)
    expect(select.props('disabled')).toBe(false)
    select.vm.$emit('update:modelValue', 'TARGET')
    await vi.waitFor(() => expect(ds.getView('Base_CodeDesign')!.rows.map(row => row['rowid'])).toEqual(['C1']))
    select.vm.$emit('update:modelValue', '')
    await vi.waitFor(() => expect(ds.getView('Base_CodeDesign')!.rows).toEqual([]))
    expect(ds.getView('Base_AppSystemList')!.hasEditingChanges()).toBe(false)
    wrapper.unmount()
  })
})
