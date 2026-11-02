import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {config, flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import {Spark, FieldText, FieldJson, FieldCheckbox, FieldNumber, RendererButton, RendererToolbar, RendererForm} from '@spark-appworks/spark-component'
import LogicViewDesign from '@/views/features/data-platform/structured-config/logic-view/ui/logic-view-design-page.vue'
import {LowcodeLogicView} from '@/lowcode/resources/structured-config/logic-view/resource'
import {buildFormalModels} from '../catalog/structured-config-catalog.fixture'
import {LogicViewHttp} from './logic-view.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
vi.mock('@spark-appworks/spark-app', () => ({useSystemPageDirtySource: () => undefined}))
let http: LogicViewHttp, runtime: DataSpaceRuntimeApi
const models = buildFormalModels({
  Base_DataViewList: ['rowid', 'sysid', 'name', 'description', 'createuser'],
  Base_AppSystemList: ['rowid', 'AppDesc', 'AppName'],
  Base_UserInfo: ['ID', 'ROWID', 'UserName'],
})
const parameterBase = buildFormalModels({_Base_ParamList: ['parid', 'pid', 'parname', 'pardesc', 'testvalue']})[0]!
models.push({...parameterBase, primaryKey: 'parid', fields: parameterBase.fields.map(field => ({...field, primaryKey: field.name === 'parid'}))})
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}},
}))
const originalStubs = {...config.global.stubs}
const mounted: Array<ReturnType<typeof mount>> = []
async function openDesigner() {
  const router = createRouter({history: createMemoryHistory(), routes: [{path: '/design', component: LogicViewDesign,
    meta: {blueprintScenarioId: LowcodeLogicView.navigationScenarioId}}]})
  await router.push({path: '/design', query: {viewId: 'V1'}}); await router.isReady()
  const registry = Spark.createRegistry()
  for (const [type, component] of Object.entries({'r-text': FieldText, 'r-json': FieldJson, 'r-number': FieldNumber, 'r-checkbox': FieldCheckbox, 'r-button': RendererButton, 'r-toolbar': RendererToolbar, 'r-form': RendererForm})) registry.register({type, component})
  const wrapper = mount(RouterView, {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin({registry})]}})
  mounted.push(wrapper); await flushPromises()
  return {wrapper, router}
}
async function editTestValue(wrapper: ReturnType<typeof mount>, value: string) {
  const row = wrapper.find('.el-table__body-wrapper tbody tr')
  await row.trigger('click'); await flushPromises()
  await row.findAll('.field-table-cell')[2]!.trigger('dblclick'); await flushPromises()
  const input = wrapper.get('tbody input:not([type="checkbox"])')
  expect((input.element as HTMLInputElement).value).toBe('1')
  await input.setValue(value); await flushPromises(); await input.trigger('focusout'); await flushPromises()
}
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  http = new LogicViewHttp(); http.primaryKeys['_Base_ParamList'] = 'parid'
  http.records = {Base_DataViewList: [{rowid: 'V1', sysid: 'APP', name: 'View One', description: '正式描述'}],
    Base_AppSystemList: [{rowid: 'APP', AppDesc: '测试应用', AppName: 'App'}],
    _Base_ParamList: [{parid: 'P1', pid: 'V1', parname: 'first', pardesc: '原描述', testvalue: '1'},
      {parid: 'P2', pid: 'V2', parname: 'other', pardesc: '其它目标', testvalue: '2'}]}
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP'}})
  service.readSpaceDefinition.mockImplementation(({dataSpaceId}: {dataSpaceId: string}) => Promise.resolve({dataSpaceId, name: '逻辑视图', raw: {}}))
  service.readModel.mockImplementation(({metaName}: {metaName: string}) => Promise.resolve(models.find(m => m.metaName === metaName)))
  runtime = new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
  config.global.stubs = {...originalStubs, JsonTreeEditor: {
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue'],
  }}
  for (const name of ['el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete config.global.stubs[name]
})
afterEach(() => {mounted.splice(0).forEach(wrapper => wrapper.unmount()); config.global.stubs = originalStubs; vi.restoreAllMocks(); vi.unstubAllGlobals()})

describe('logic-view design page', () => {
  it('confirms a field edit in the original node without coercing its value function, numeric order or unknown members',async()=>{
    const field={Name:'id',AsName:'old',ValueFun:{Type:'GetConstValue',Value:0},Order:2,IsOutput:1,extra:{keep:false}}
    http.logicDesigns['V1']=[{Name:'root',Type:'数据库表',Fields:[field],ChildTables:[]}]
    const {wrapper}=await openDesigner()
    await wrapper.findAll('[role="tab"]').find(tab=>tab.text()==='视图数据设计')!.trigger('click');await flushPromises()
    await wrapper.get('[data-logic-node-outline] .el-table__body-wrapper tbody tr').trigger('click');await flushPromises()
    const editor=wrapper.get('[data-logic-node-editor] .json-array-rows')
    await editor.get('.el-table__body-wrapper tbody tr').trigger('click');await editor.get('[data-json-edit]').trigger('click');await flushPromises()
    await editor.get('.el-table__body-wrapper tbody td:nth-child(4) input').setValue('new alias');await flushPromises()
    await editor.get('[data-json-save-row]').trigger('click');await flushPromises()
    await wrapper.findAll('button').find(b=>b.text()==='保存设计')!.trigger('click');await flushPromises()
    expect(http.logicDesigns['V1']).toEqual([{Name:'root',Type:'数据库表',Fields:[{...field,AsName:'new alias'}],ChildTables:[]}])
    expect(http.saves).toHaveLength(0)
  })
  it('retains unconfirmed node text when navigation requests another target',async()=>{
    http.logicDesigns['V1']=[{Name:'root',Type:'数据库表',Description:'original',Fields:[],ChildTables:[]}]
    http.records['Base_DataViewList']!.push({rowid:'V2',sysid:'APP',name:'View Two',description:'other'})
    const {wrapper,router}=await openDesigner()
    await wrapper.findAll('[role="tab"]').find(tab=>tab.text()==='视图数据设计')!.trigger('click');await flushPromises()
    await wrapper.get('[data-logic-node-outline] .el-table__body-wrapper tbody tr').trigger('click');await flushPromises()
    const input=wrapper.get<HTMLInputElement>('[data-logic-node-editor] [data-json-member="Description"] input')
    input.element.value='unfinished';await input.trigger('input');await flushPromises()
    expect(wrapper.findAll('button').find(b=>b.text()==='保存设计')!.attributes('disabled')).toBeDefined()
    await router.push({path:'/design',query:{viewId:'V2'}});await flushPromises()
    expect(router.currentRoute.value.query['viewId']).toBe('V1')
    expect(input.element.value).toBe('unfinished')
    expect(http.posts.some(post=>post.url.includes('SaveView'))).toBe(false)
  })
  it('edits a selected child in the original design field and preserves unknown members and siblings',async()=>{
    http.logicDesigns['V1']=[{Name:'root',Type:'数据库表',extra:{keep:7},ChildTables:[{Name:'child',Type:'字典',Description:'old',Fields:[],unknown:9}]}]
    const {wrapper}=await openDesigner()
    await wrapper.findAll('[role="tab"]').find(tab=>tab.text()==='视图数据设计')!.trigger('click');await flushPromises()
    const rows=wrapper.findAll('[data-logic-node-outline] .el-table__body-wrapper tbody tr')
    expect(rows).toHaveLength(2)
    await rows[1]!.trigger('click');await flushPromises()
    const input=wrapper.get('[data-logic-node-editor] [data-json-member="Description"] input')
    expect(input.attributes('disabled')).toBeUndefined()
    await input.setValue('child edited');await flushPromises()
    await wrapper.findAll('button').find(b=>b.text()==='保存设计')!.trigger('click');await flushPromises()
    expect(http.logicDesigns['V1']).toEqual([{Name:'root',Type:'数据库表',extra:{keep:7},ChildTables:[{Name:'child',Type:'字典',Description:'child edited',Fields:[],unknown:9}]}])
    expect(http.saves).toHaveLength(0)
  })
  it('keeps formal parameters usable when the separate design file cannot be read', async () => {
    http.missingDesigns.add('V1')
    const {wrapper} = await openDesigner()
    expect(wrapper.findAll('input').some(input => input.element.value === 'View One')).toBe(true)
    await editTestValue(wrapper, 'Independent')
    expect(http.saves[0]).toMatchObject({table: '_Base_ParamList', changed: [{parid: 'P1', testvalue: 'Independent'}]})
    await wrapper.findAll('[role="tab"]').find(tab => tab.text() === '视图数据设计')!.trigger('click'); await flushPromises()
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.text()).toContain('数据不存在')
    expect(http.posts.some(post => post.url.includes('SaveView'))).toBe(false)
  })
  it('binds the formal base record and only its own parameter records', async () => {
    const {wrapper} = await openDesigner()
    expect(wrapper.findAll('input').some(input => input.element.value === 'View One')).toBe(true)
    expect(wrapper.findAll('input').some(input => input.element.value === '正式描述')).toBe(true)
    expect(wrapper.text()).toContain('first')
    expect(wrapper.text()).not.toContain('其它目标')
    expect(wrapper.findAll('[role="tab"]').map(tab => tab.text())).toContain('视图基本信息')
  })
  it('immediately saves a parameter cell without saving the edited design file', async () => {
    const {wrapper} = await openDesigner()
    await wrapper.findAll('[role="tab"]').find(tab => tab.text() === '视图数据设计')!.trigger('click'); await flushPromises()
    await wrapper.find('textarea').setValue('[{"Name":"Unsaved"}]'); await flushPromises()
    await wrapper.findAll('[role="tab"]').find(tab => tab.text() === '视图基本信息')!.trigger('click'); await flushPromises()
    await editTestValue(wrapper, 'Changed')
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]).toMatchObject({table: '_Base_ParamList', changed: [{parid: 'P1', testvalue: 'Changed'}]})
    expect(http.posts.some(post => post.url.includes('SaveView'))).toBe(false)
    expect(wrapper.find('textarea').element.value).toContain('Unsaved')
  })
  it('cancels a new blank parameter without a server mutation', async () => {
    const {wrapper} = await openDesigner()
    await wrapper.findAll('button').find(button => button.text() === '新增参数')!.trigger('click'); await flushPromises()
    expect(wrapper.findAll('.el-table__body-wrapper tbody tr')).toHaveLength(2)
    await wrapper.findAll('button').find(button => button.text() === '取消参数修改')!.trigger('click'); await flushPromises()
    expect(wrapper.findAll('.el-table__body-wrapper tbody tr')).toHaveLength(1)
    expect(http.saves).toHaveLength(0)
  })
  it('verifies an accepted but unconfirmed parameter save without sending a second write', async () => {
    const {wrapper} = await openDesigner(); http.failAfterWrite = true
    await editTestValue(wrapper, 'Accepted')
    expect(http.saves).toHaveLength(1)
    await wrapper.findAll('button').find(button => button.text() === '核验参数保存结果')!.trigger('click'); await flushPromises()
    expect(http.saves).toHaveLength(1)
    expect(http.records['_Base_ParamList']?.find(row => row['parid'] === 'P1')?.['testvalue']).toBe('Accepted')
    expect(wrapper.findAll('button').find(button => button.text() === '取消参数修改')!.attributes('disabled')).toBeUndefined()
  })
  it('confirms deletion using parid and leaves the other target unchanged', async () => {
    const {wrapper} = await openDesigner()
    await wrapper.find('.el-table__body-wrapper tbody tr').trigger('click'); await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '删除参数')!.trigger('click'); await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '确认删除')!.trigger('click'); await flushPromises()
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]).toMatchObject({table: '_Base_ParamList', deleted: [{parid: 'P1'}]})
    expect(http.records['_Base_ParamList']).toEqual([{parid: 'P2', pid: 'V2', parname: 'other', pardesc: '其它目标', testvalue: '2'}])
    expect(http.posts.some(post => post.url.includes('SaveView'))).toBe(false)
  })
  it('keeps a denied delete disabled using the formal query permission', async () => {
    http.denyDelete.add('_Base_ParamList')
    const {wrapper} = await openDesigner()
    await wrapper.find('.el-table__body-wrapper tbody tr').trigger('click'); await flushPromises()
    expect(wrapper.findAll('button').find(button => button.text() === '删除参数')!.attributes('disabled')).toBeDefined()
    expect(http.saves).toHaveLength(0)
  })
  it('verifies a deleted parameter after an interrupted receipt without deleting twice', async () => {
    const {wrapper} = await openDesigner(); http.failAfterWrite = true
    await wrapper.find('.el-table__body-wrapper tbody tr').trigger('click'); await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '删除参数')!.trigger('click'); await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '确认删除')!.trigger('click'); await flushPromises()
    expect(http.saves).toHaveLength(1)
    await wrapper.findAll('button').find(button => button.text() === '核验删除结果')!.trigger('click'); await flushPromises()
    expect(http.saves).toHaveLength(1)
    expect(wrapper.findAll('button').some(button => button.text() === '核验删除结果')).toBe(false)
  })
  it('does not carry a pending delete confirmation into a newly loaded target', async () => {
    http.records['Base_DataViewList']!.push({rowid: 'V2', sysid: 'APP', name: 'View Two', description: '第二目标'})
    const {wrapper, router} = await openDesigner()
    await wrapper.find('.el-table__body-wrapper tbody tr').trigger('click'); await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '删除参数')!.trigger('click'); await flushPromises()
    await router.push({path: '/design', query: {viewId: 'V2'}}); await flushPromises()
    expect(wrapper.findAll('input').some(input => input.element.value === 'View Two')).toBe(true)
    expect(wrapper.findAll('button').some(button => button.text() === '确认删除')).toBe(false)
    expect(http.saves).toHaveLength(0)
  })
  it('discards the local design through the page action and rereads without saving', async () => {
    const router = createRouter({history: createMemoryHistory(), routes: [{path: '/design', component: LogicViewDesign,
      meta: {blueprintScenarioId: LowcodeLogicView.navigationScenarioId}}]})
    await router.push({path: '/design', query: {viewId: 'V1'}}); await router.isReady()
    const wrapper = mount(LogicViewDesign, {global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
    await flushPromises()
    const original = wrapper.find('textarea').element.value
    await wrapper.find('textarea').setValue('[{"Name":"Unsaved"}]'); await flushPromises()
    await wrapper.findAll('button').find(button => button.text().includes('放弃修改'))!.trigger('click'); await flushPromises()
    expect(wrapper.find('textarea').element.value).toBe(original)
    expect(http.posts.filter(post => post.url.includes('ViewData/GetView'))).toHaveLength(2)
    expect(http.posts.some(post => post.url.includes('ViewData/SaveView'))).toBe(false)
    expect(wrapper.text()).not.toContain('DATA_VIEW_UNSAVED_CHANGES')
    wrapper.unmount()
  })
  it('loads ViewData and saves', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{
        path: '/design',
        component: LogicViewDesign,
        meta: {blueprintScenarioId: LowcodeLogicView.navigationScenarioId},
      }],
    })
    await router.push({path: '/design', query: {viewId: 'V1'}})
    await router.isReady()
    const wrapper = mount(LogicViewDesign, {global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
    await flushPromises()
    expect(http.posts.some(p => p.url.includes('ViewData/GetView'))).toBe(true)
    await wrapper.find('textarea').setValue('[{"Name":"Orders","Fields":[],"ChildTables":[]}]')
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === '保存设计')!.trigger('click')
    await flushPromises()
    expect(http.posts.some(p => p.url.includes('ViewData/SaveView'))).toBe(true)
    expect(http.logicDesigns['V1']).toEqual([{Name: 'Orders', Fields: [], ChildTables: []}])
    expect(wrapper.text()).not.toContain('DESIGN_SAVE_UNCONFIRMED')
    wrapper.unmount()
  })
})
