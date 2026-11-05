import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import {defineComponent, h} from 'vue'
import ElementPlus from 'element-plus'
import {RendererTree, FieldJson, FieldCheckbox, FieldText, FieldNumber, FieldSelect, RendererTable, RendererButton, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {ElSelect, ElCheckbox} from 'element-plus'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import SparkJsonEditor from '../../../../../packages/spark-component/src/components/editors/SparkJsonEditor.vue'
import ExcelEditor from '@/views/features/data-platform/semi-structured/excel-import/ui/excel-import-editor-page.vue'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {EXCEL, topicModels, topicTexts} from '../../structured-config/catalog/formal-topic.fixture'
import {EXCEL_DESIGN, excelDesignModels, designText,EXCEL_DICTIONARY,excelDictionaryReferenceModels} from './excel-import-design.fixture'
import {DataSet} from '@spark-appworks/spark-data'
import {sourceModels, sourceRecords, SOURCE_SCENE} from '../../structured-config/data-code/source-picker/fixture'
import sourceText from '../../../../../config/pages/shared/business-table-selector/pagedata.json?raw'
import dictionaryText from '../../../../../config/pages/data-platform/data-dictionary/pagedata.json?raw'
const state = vi.hoisted(() => ({http: undefined as unknown as ApiBackend, runtime: undefined as unknown as DataSpaceRuntimeApi, dirtySources: [] as Array<{isDirty: boolean}>}))
vi.mock('@spark-appworks/spark-app', () => ({useSystemPageDirtySource: (source: {isDirty: boolean}) => state.dirtySources.push(source)}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return state.http}, lowcodeDesignFileUpload: async () => {throw new Error('unexpected upload')},
  createLowcodeProjectGateways: () => ({scenarioViews: {readText: async (id: string) => id === EXCEL_DESIGN ? designText : id === SOURCE_SCENE ? sourceText : id===EXCEL_DICTIONARY?dictionaryText:topicTexts[id] ?? null}}),
  lowcodeApi: {readRequestScope: () => ({token: 'scope', headers: {'X-AppId': 'D99A1DCE9894698799101EFD70F8FC76'}}), dataSpace: {
    get runtime() {return state.runtime}, design: {
      readSpaceDefinition: async ({dataSpaceId}: {dataSpaceId: string}) => ({dataSpaceId, name: 'Excel'}),
      readModelBatch: async ({dataSpaceId, metaNames}: {dataSpaceId: string; metaNames: string[]}) => (dataSpaceId === EXCEL_DESIGN ? excelDesignModels() : dataSpaceId === SOURCE_SCENE ? await sourceModels() : dataSpaceId===EXCEL_DICTIONARY?excelDictionaryReferenceModels():topicModels(dataSpaceId)).filter(model => metaNames.includes(model.metaName)),
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
    Base_Import_solution: [{rowid: 'E1', solutionName: '订单导入', dataSetId: 'S1', transform_enabled:0, status:'UNCHANGED'}, {rowid: 'E2', solutionName: '其他方案'}],
    Base_DataSet: [], Base_UserInfo: [],
    _Base_DictType:[{rowid:'D1',TypeName:'状态',functiondesc:'业务状态',txt:'状态名',val:'状态码',secondValue:'扩展一',thirdValue:'',fourthvalue:'',fiveValue:''}],
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
  const choose = async (tableCount=2) => {
    await vi.waitFor(() => expect(wrapper.findComponent(RendererTree).exists()).toBe(true))
    await wrapper.get('.el-tree-node__content').trigger('click'); await flushPromises()
    await vi.waitFor(() => expect(wrapper.findAllComponents(RendererTable)).toHaveLength(tableCount))
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
  it('preserves an unknown layout version byte-for-byte during an unrelated edit and independent reopen', async () => {
    const original = '{"version":73,"enabled":false,"future":{"zero":0,"active":false}}'
    state.http.records['Base_ImportData_Config']![0]!['sheet_layout_json'] = original
    const f = await open(); await f.choose()
    const sheet = f.wrapper.findAllComponents(FieldText).find(field => field.props('field') === 'sheetName')!
    await sheet.get('input').setValue('保留版式'); await flushPromises(); await f.click('保存配置')
    expect(state.http.records['Base_ImportData_Config']![0]!['sheet_layout_json']).toBe(original)
    const reopened = await open(); await reopened.choose()
    const layout = reopened.wrapper.findAllComponents(FieldJson).find(field => field.props('field') === 'sheet_layout_json')!
    expect(layout.getComponent(SparkJsonEditor).props('modelValue')).toBe(original)
    expect(state.http.saves.map(save => save.table)).toEqual(['Base_ImportData_Config'])
  })

  it('locks node navigation while invalid layout JSON remains unaccepted and releases it through the original cancel', async () => {
    const f = await open(); await f.choose()
    const layout = f.wrapper.findAllComponents(FieldJson).find(field => field.props('field') === 'sheet_layout_json')!
    layout.getComponent(SparkJsonEditor).vm.$emit('update:modelValue', '{'); await flushPromises()
    expect(f.wrapper.get('aside').element.hasAttribute('inert')).toBe(true)
    expect(f.wrapper.findAllComponents(RendererButton).find(button => button.props('label') === '保存配置')?.props('disabled')).toBe(true)
    await f.click('取消配置修改')
    expect(f.wrapper.get('aside').element.hasAttribute('inert')).toBe(false)
    expect(state.http.saves).toEqual([])
  })

  it('rejects a single returned scheme whose real primary key differs from the requested target', async () => {
    let injected = false
    state.http.interceptors.request.use({onRequest: request => {
      const body = request.data as {Table?: Array<{Name?: string}>} | undefined
      if (request.url === '/api/DataOperation/GetData' && body?.Table?.[0]?.Name === 'Base_Import_solution') {
        const text = JSON.stringify(body)
        if (text.includes('"E1"')) {request.data = JSON.parse(text.replaceAll('"E1"', '"E2"')); injected = true}
      }
      return request
    }})
    const f = await open()
    await vi.waitFor(() => expect(injected).toBe(true))
    await vi.waitFor(() => expect(f.wrapper.text()).toContain('方案身份与调用参数不一致'))
    expect(f.wrapper.findAllComponents(FieldCheckbox).some(field => field.props('field') === 'transform_enabled')).toBe(false)
    expect(state.http.saves).toEqual([])
    expect(state.dirtySources[0]?.isDirty).toBe(false)
  })

  it('saves and reopens only the scheme switch while retaining independent node drafts and original status', async () => {
    const f = await open(); await f.choose()
    const checkbox = () => f.wrapper.findAllComponents(FieldCheckbox).find(field => field.props('field') === 'transform_enabled')!
    expect(checkbox()).toBeDefined()
    checkbox().getComponent(ElCheckbox).vm.$emit('update:modelValue', true); await flushPromises()
    expect(state.dirtySources[0]?.isDirty).toBe(true)
    expect(state.http.saves).toEqual([])
    await f.click('取消增强规则开关修改')
    expect(checkbox().getComponent(ElCheckbox).props('modelValue')).toBe(false)
    expect(state.dirtySources[0]?.isDirty).toBe(false)
    const sheet = f.wrapper.findAllComponents(FieldText).find(field => field.props('field') === 'sheetName')!
    await sheet.get('input').setValue('节点草稿'); await flushPromises()
    checkbox().getComponent(ElCheckbox).vm.$emit('update:modelValue', true); await flushPromises()
    await f.click('保存增强规则开关')
    expect(f.wrapper.findAll('[role="alert"]').map(item=>item.text())).toEqual([])
    expect(state.http.saves.map(save => save.table)).toEqual(['Base_Import_solution'])
    expect(state.http.records['Base_Import_solution']![0]).toMatchObject({rowid:'E1', transform_enabled:1, status:'UNCHANGED'})
    expect(state.http.records['Base_ImportData_Config']![0]!['sheetName']).toBe('订单')
    expect(sheet.get('input').element.value).toBe('节点草稿')
    expect(state.dirtySources[0]?.isDirty).toBe(true)
    await f.click('取消配置修改'); expect(state.dirtySources[0]?.isDirty).toBe(false)
    const reopened = await open()
    const actual = reopened.wrapper.findAllComponents(FieldCheckbox).find(field => field.props('field') === 'transform_enabled')!
    await vi.waitFor(() => expect(actual.getComponent(ElCheckbox).props('modelValue')).toBe(true))
    expect(state.http.saves).toHaveLength(1)
  })

  it('keeps unsaved scheme switch changes inside the original page navigation guard', async () => {
    const f = await open(); await f.choose()
    const checkbox = f.wrapper.findAllComponents(FieldCheckbox).find(field => field.props('field') === 'transform_enabled')!
    expect(checkbox).toBeDefined()
    checkbox.getComponent(ElCheckbox).vm.$emit('update:modelValue', true); await flushPromises()
    await f.router.push('/other'); expect(f.router.currentRoute.value.path).toBe('/editor')
    await f.click('取消增强规则开关修改')
    await f.router.push('/other'); expect(f.router.currentRoute.value.path).toBe('/other')
    expect(state.http.saves).toEqual([])
  })

  it('does not carry a cancelled browsing choice into another empty mapping in the same runtime',async()=>{
    state.http.records['Base_ImportData_Field']!.push({rowid:'NEW_MAPPING',configid:'C1',name:'other',title:'另一个字段',index:'B',type:0})
    const f=await open();await f.choose();const mappings=f.wrapper.findAllComponents(RendererTable).find(table=>table.props('dataViewKey')?.includes('@Base_ImportData_Field@'))!
    await mappings.findAll('tbody tr')[0]!.trigger('click');await flushPromises();await f.click('设置引用')
    const application=()=>f.wrapper.findAllComponents(FieldSelect).find(field=>field.props('label')==='来源应用')!
    await vi.waitFor(()=>expect(application()).toBeDefined());application().getComponent(ElSelect).vm.$emit('update:modelValue','A1');await flushPromises()
    for(const model of ['Base_AppAndSource_Relation','_Base_TblList']){
      const table=()=>f.wrapper.findAllComponents(RendererTable).find(table=>table.props('dataViewKey')===`${SOURCE_SCENE}@${model}@default`)!
      await vi.waitFor(()=>expect(table().findAll('tbody tr').length).toBeGreaterThan(0));await table().get('tbody tr').trigger('click');await flushPromises()
    }
    for(const [view,value] of [['textFields','F2'],['valueFields','F1']]){const field=f.wrapper.findAllComponents(FieldSelect).find(field=>field.props('optionDataViewKey')===`${SOURCE_SCENE}@Base_TblField@${view}`)!;field.getComponent(ElSelect).vm.$emit('update:modelValue',value);await flushPromises()}
    const cancel=async()=>{await f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='取消引用选择')!.get('button').trigger('click');await flushPromises()}
    await cancel();await mappings.findAll('tbody tr')[1]!.trigger('click');await flushPromises();await f.click('设置引用')
    await vi.waitFor(()=>expect(application()).toBeDefined());expect(application().getComponent(ElSelect).props('modelValue')).toBe('')
    await f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='确认引用')!.get('button').trigger('click');await flushPromises()
    expect(state.http.saves).toEqual([]);expect(state.http.records['Base_ImportData_Field']![1]!['refDataid']).toBeUndefined()
    await cancel();expect(state.dirtySources[0]?.isDirty).toBe(false)
  })
  it('cancels an in-flight saved reference restore without applying a late selection or keeping the editor dirty',async()=>{
    Object.assign(state.http.records['Base_ImportData_Field']![0]!,{isDict:0,refDataid:'T1',refTable:'数据库一@table_one',filterField:'',filterValue:'',textField:'name',valueField:'id'})
    const f=await open();await f.choose();const before=structuredClone(state.http.records['Base_ImportData_Field'])
    let started=false,release=()=>{};const barrier=new Promise<void>(resolve=>{release=resolve})
    const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)
    state.http.interceptors.request.use({onRequest:async request=>{const body:unknown=request.data;if(record(body)&&Array.isArray(body['Table'])&&record(body['Table'][0])&&body['Table'][0]['Name']==='Base_AppAndSource_Relation'){started=true;await barrier}return request}})
    const mappings=f.wrapper.findAllComponents(RendererTable).find(table=>table.props('dataViewKey')?.includes('@Base_ImportData_Field@'))!
    await mappings.get('tbody tr').trigger('click');await flushPromises();await f.click('设置引用')
    await vi.waitFor(()=>expect(started).toBe(true))
    await f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='取消引用选择')!.get('button').trigger('click');await flushPromises()
    expect(state.dirtySources[0]?.isDirty).toBe(false);release();await flushPromises()
    expect(f.wrapper.findAllComponents(RendererButton).some(button=>button.props('label')==='确认引用')).toBe(false)
    expect(state.http.saves).toEqual([]);expect(state.http.records['Base_ImportData_Field']).toEqual(before)
  })
  it.each(['Table','View','Dict'] as const)('reopens saved %s fields without choosing a browsing application or changing the persisted group',async kind=>{
    state.http.records['_Base_ViewList']=[{rowid:'V1',dbid:'D1',vewname:'view_one',vewdesc:'当前视图标题'}]
    state.http.records['Base_TblField']!.push({rowid:'VF1',tblid:'V1',enname:'id',cnname:'当前视图编码'},{rowid:'VF2',tblid:'V1',enname:'name',cnname:'当前视图名称'})
    state.http.records['Base_AppAndSource_Relation']!.push({rowid:'OTHER_APP',sysid:'A2',conid:'D1',conName:'数据库一'})
    Object.assign(state.http.records['Base_ImportData_Field']![0]!,kind==='Dict'?{isDict:1,refDataid:'D1',refTable:'_Base_DictData',filterField:'typeid',filterValue:'D1',textField:'txt',valueField:'val',refTableDesc:'历史字典标题'}:{isDict:0,refDataid:kind==='View'?'V1':'T1',refTable:kind==='View'?'数据库一@view_one':'数据库一@table_one',filterField:'',filterValue:'',textField:'name',valueField:'id',refTableDesc:'历史物理标题'})
    const before=structuredClone(state.http.records['Base_ImportData_Field']),f=await open();await f.choose()
    const mappings=f.wrapper.findAllComponents(RendererTable).find(table=>table.props('dataViewKey')?.includes('@Base_ImportData_Field@'))!
    await mappings.get('tbody tr').trigger('click');await flushPromises();await f.click('设置引用')
    const confirm=()=>f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='确认引用')!
    await vi.waitFor(()=>expect(confirm().props('disabled')).toBe(false))
    expect([...document.querySelectorAll('[role="alert"]')].map(alert=>alert.textContent)).toEqual([])
    expect(f.wrapper.findAllComponents(FieldSelect).some(field=>field.props('label')==='来源应用')).toBe(false)
    const text=f.wrapper.findAllComponents(FieldSelect).find(field=>field.props('label')==='文本字段')!,value=f.wrapper.findAllComponents(FieldSelect).find(field=>field.props('label')==='值字段')!
    expect(text.getComponent(ElSelect).props('modelValue')).toBe(kind==='Dict'?'txt':kind==='View'?'VF2':'F2')
    expect(value.getComponent(ElSelect).props('modelValue')).toBe(kind==='Dict'?'val':kind==='View'?'VF1':'F1')
    if(kind==='Dict'){
      const definition=f.wrapper.findAllComponents(RendererTable).find(table=>table.props('dataViewKey')===`${EXCEL_DICTIONARY}@_Base_DictType@excelStoredReference`)!
      await definition.get('tbody tr').trigger('click');await flushPromises()
      expect(text.getComponent(ElSelect).props('modelValue')).toBe('txt');expect(value.getComponent(ElSelect).props('modelValue')).toBe('val')
    }
    await confirm().get('button').trigger('click');await flushPromises()
    expect(state.dirtySources[0]?.isDirty).toBe(false)
    await f.click('保存字段');expect(state.http.saves).toEqual([])
    expect(state.http.records['Base_ImportData_Field']).toEqual(before)
  })
  it('preserves an unresolved saved reference and enters an unfiltered browsing range only when requested',async()=>{
    Object.assign(state.http.records['Base_ImportData_Field']![0]!,{isDict:0,refDataid:'DELETED',refTable:'数据库一@table_one',filterField:'',filterValue:'',textField:'name',valueField:'id',refTableDesc:'历史标题'})
    const before=structuredClone(state.http.records['Base_ImportData_Field']),f=await open();await f.choose()
    const mappings=f.wrapper.findAllComponents(RendererTable).find(table=>table.props('dataViewKey')?.includes('@Base_ImportData_Field@'))!
    await mappings.get('tbody tr').trigger('click');await flushPromises();await f.click('设置引用')
    await vi.waitFor(()=>expect(document.body.textContent).toContain('当前引用未能定位'))
    expect(f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='确认引用')?.props('disabled')).toBe(true)
    const browse=f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='浏览其他来源')!
    await browse.get('button').trigger('click');await flushPromises()
    const application=()=>f.wrapper.findAllComponents(FieldSelect).find(field=>field.props('label')==='来源应用')!
    await vi.waitFor(()=>expect(application()).toBeDefined());application().getComponent(ElSelect).vm.$emit('update:modelValue','A1');await flushPromises()
    const databases=()=>f.wrapper.findAllComponents(RendererTable).find(table=>table.props('dataViewKey')===`${SOURCE_SCENE}@Base_AppAndSource_Relation@default`)!
    await vi.waitFor(()=>expect(databases().findAll('tbody tr').length).toBe(1));await databases().get('tbody tr').trigger('click');await flushPromises()
    const tables=()=>f.wrapper.findAllComponents(RendererTable).find(table=>table.props('dataViewKey')===`${SOURCE_SCENE}@_Base_TblList@default`)!
    await vi.waitFor(()=>expect(tables().findAll('tbody tr').length).toBe(2))
    await f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='取消引用选择')!.get('button').trigger('click');await flushPromises()
    expect(state.dirtySources[0]?.isDirty).toBe(false);expect(state.http.saves).toEqual([]);expect(state.http.records['Base_ImportData_Field']).toEqual(before)
  })
  it('closes an unconfirmed reference selector through the original host discard contract',async()=>{
    const f=await open();await f.choose()
    const mappings=f.wrapper.findAllComponents(RendererTable).find(table=>table.props('dataViewKey')?.includes('@Base_ImportData_Field@'))!
    await mappings.get('tbody tr').trigger('click');await flushPromises();await f.click('设置引用')
    expect(state.dirtySources[0]?.isDirty).toBe(true)
    expect(f.wrapper.getComponent(ExcelEditor).vm.discardChanges()).toBe(true);await flushPromises()
    expect(state.dirtySources[0]?.isDirty).toBe(false)
    expect(f.wrapper.findAllComponents(RendererButton).some(button=>button.props('label')==='确认引用')).toBe(false)
    expect(state.http.saves).toEqual([])
  })
  it('selects registered physical view fields through its independent bound views',async()=>{
    state.http.records['_Base_ViewList']=[{rowid:'V1',dbid:'D1',vewname:'view_one',vewdesc:'视图一'}]
    state.http.records['Base_TblField']!.push({rowid:'VF1',tblid:'V1',enname:'id',cnname:'视图编码'},{rowid:'VF2',tblid:'V1',enname:'name',cnname:'视图标题'})
    const f=await open();await f.choose()
    const mappings=f.wrapper.findAllComponents(RendererTable).find(table=>table.props('dataViewKey')?.includes('@Base_ImportData_Field@'))!
    await mappings.get('tbody tr').trigger('click');await flushPromises();await f.click('设置引用')
    const click=async(label:string)=>{await f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')===label)!.get('button').trigger('click');await flushPromises()}
    await vi.waitFor(()=>expect(f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='视图')?.props('disabled')).toBe(false));await click('视图')
    f.wrapper.findAllComponents(FieldSelect).find(field=>field.props('optionDataViewKey')===`${SOURCE_SCENE}@Base_AppSystemList@default`)!.getComponent(ElSelect).vm.$emit('update:modelValue','A1');await flushPromises()
    for(const model of ['Base_AppAndSource_Relation','_Base_ViewList']){
      const table=()=>f.wrapper.findAllComponents(RendererTable).find(table=>table.props('dataViewKey')===`${SOURCE_SCENE}@${model}@default`)!
      await vi.waitFor(()=>expect(table().findAll('tbody tr').length).toBeGreaterThan(0));await table().get('tbody tr').trigger('click');await flushPromises()
    }
    for(const [view,value] of [['viewTextFields','VF2'],['viewValueFields','VF1']]){
      const field=f.wrapper.findAllComponents(FieldSelect).find(field=>field.props('optionDataViewKey')===`${SOURCE_SCENE}@Base_TblField@${view}`)!
      await vi.waitFor(()=>expect(field.getComponent(ElSelect).props('disabled')).toBe(false));field.getComponent(ElSelect).vm.$emit('update:modelValue',value);await flushPromises()
    }
    await click('确认引用');expect([...document.querySelectorAll('[role="alert"]')].map(alert=>alert.textContent)).toEqual([]);await f.click('保存字段')
    expect(state.http.records['Base_ImportData_Field']![0]!).toMatchObject({refDataid:'V1',refTable:'数据库一@view_one',refTableDesc:'视图一',textField:'name',valueField:'id'})
  })
  it('opens a bound table reference selector, cancels without drafts, then saves only the selected mapping',async()=>{
    const f=await open();await f.choose()
    const mappings=f.wrapper.findAllComponents(RendererTable).find(table=>table.props('dataViewKey')?.includes('@Base_ImportData_Field@'))!
    await mappings.get('tbody tr').trigger('click');await flushPromises()
    await f.click('设置引用');await vi.waitFor(()=>expect(document.body.textContent).toContain('选择引用表／视图／字典字段'))
    const click=async(label:string)=>{await f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')===label)!.get('button').trigger('click');await flushPromises()}
    await click('取消引用选择');expect(state.dirtySources[0]?.isDirty).toBe(false);expect(state.http.saves).toEqual([])
    await f.click('设置引用')
    const application=()=>f.wrapper.findAllComponents(FieldSelect).find(field=>field.props('optionDataViewKey')===`${SOURCE_SCENE}@Base_AppSystemList@default`)!
    await vi.waitFor(()=>expect(application()).toBeDefined());application().getComponent(ElSelect).vm.$emit('update:modelValue','A1');await flushPromises()
    for(const model of ['Base_AppAndSource_Relation','_Base_TblList']){
      const table=()=>f.wrapper.findAllComponents(RendererTable).find(table=>table.props('dataViewKey')===`${SOURCE_SCENE}@${model}@default`)!
      await vi.waitFor(()=>expect(table().findAll('tbody tr').length).toBeGreaterThan(0));await table().get('tbody tr').trigger('click');await flushPromises()
    }
    for(const [view,value] of [['textFields','F2'],['valueFields','F1']]){
      const field=f.wrapper.findAllComponents(FieldSelect).find(field=>field.props('optionDataViewKey')===`${SOURCE_SCENE}@Base_TblField@${view}`)!
      await vi.waitFor(()=>expect(field.getComponent(ElSelect).props('disabled')).toBe(false));field.getComponent(ElSelect).vm.$emit('update:modelValue',value);await flushPromises()
    }
    await click('确认引用');expect(state.http.saves).toEqual([])
    await f.click('保存字段')
    expect(state.http.saves.map(save=>save.table)).toEqual(['Base_ImportData_Field'])
    expect(state.http.records['Base_ImportData_Field']![0]!).toMatchObject({refDataid:'T1',refTable:'数据库一@table_one',textField:'name',valueField:'id',isDict:0,filterField:'',filterValue:''})
    await f.click('清空引用');await f.click('取消字段修改')
    expect(state.http.records['Base_ImportData_Field']![0]!['refDataid']).toBe('T1')
  })
  it('loads dictionary definitions on demand and binds separate text and value option views without reading entries',async()=>{
    const f=await open();await f.choose()
    expect(state.http.reads.some(read=>read.table==='_Base_DictType')).toBe(false)
    const mappings=f.wrapper.findAllComponents(RendererTable).find(table=>table.props('dataViewKey')?.includes('@Base_ImportData_Field@'))!
    await mappings.get('tbody tr').trigger('click');await flushPromises();await f.click('设置引用')
    const click=async(label:string)=>{await f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')===label)!.get('button').trigger('click');await flushPromises()}
    await vi.waitFor(()=>expect(f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='字典')?.props('disabled')).toBe(false));await click('字典')
    const definitions=()=>f.wrapper.findAllComponents(RendererTable).find(table=>table.props('dataViewKey')===`${EXCEL_DICTIONARY}@_Base_DictType@excelReferences`)!
    await vi.waitFor(()=>expect(definitions()?.findAll('tbody tr').length).toBe(1));await definitions().get('tbody tr').trigger('click');await flushPromises()
    for(const [label,value] of [['文本字段','txt'],['值字段','val']]){
      const field=f.wrapper.findAllComponents(FieldSelect).find(field=>field.props('label')===label)!
      expect(field.props('dataMember')).toBe('value');expect(field.props('optionDataViewKey')).toContain('optionCatalog_')
      field.getComponent(ElSelect).vm.$emit('update:modelValue',value);await flushPromises()
    }
    await vi.waitFor(()=>expect(f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='确认引用')?.props('disabled')).toBe(false))
    await click('确认引用');expect([...document.querySelectorAll('[role="alert"]')].map(alert=>alert.textContent)).toEqual([]);await f.click('保存字段')
    expect(state.http.records['Base_ImportData_Field']![0]!).toMatchObject({isDict:1,refDataid:'D1',refTable:'_Base_DictData',filterField:'typeid',filterValue:'D1',textField:'txt',valueField:'val'})
    expect(state.http.reads.some(read=>read.table==='_Base_DictData')).toBe(false)
    expect(state.http.saves.map(save=>save.table)).toEqual(['Base_ImportData_Field'])
  })
  it('hides classical mappings for enabled layout, preserves their records and restores them on cancel', async () => {
    const f=await open();await f.choose()
    const originalFields=structuredClone(state.http.records['Base_ImportData_Field'])
    const layout=f.wrapper.findAllComponents(FieldJson).find(field=>field.props('field')==='sheet_layout_json')!
    layout.getComponent(SparkJsonEditor).vm.$emit('update:modelValue','{"enabled":true,"version":1,"regions":[]}');await flushPromises()
    expect(f.wrapper.findAllComponents(RendererTable).some(table=>table.props('dataViewKey')?.includes('@Base_ImportData_Field@'))).toBe(false)
    expect(f.wrapper.text()).toContain('已启用相对版式')
    expect(f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='选择目标数据')?.props('disabled')).toBe(true)
    expect(state.http.records['Base_ImportData_Field']).toEqual(originalFields)
    expect(state.http.saves).toEqual([])
    await f.click('取消配置修改')
    expect(f.wrapper.findAllComponents(RendererTable).some(table=>table.props('dataViewKey')?.includes('@Base_ImportData_Field@'))).toBe(true)
  })
  it('rejects hiding unsaved classical mapping edits without dropping the original draft', async()=>{
    const f=await open();await f.choose()
    const table=f.wrapper.findAllComponents(RendererTable).find(item=>item.props('dataViewKey')?.includes('@Base_ImportData_Field@'))!
    await table.get('tbody tr').trigger('click');await flushPromises()
    const title=table.findAllComponents(FieldText).find(field=>field.props('field')==='title'&&field.find('input').exists())!
    await title.get('input').setValue('尚未保存标题');await flushPromises()
    const layout=f.wrapper.findAllComponents(FieldJson).find(field=>field.props('field')==='sheet_layout_json')!
    layout.getComponent(SparkJsonEditor).vm.$emit('update:modelValue','{"enabled":true,"version":1,"regions":[]}');await flushPromises()
    expect(f.wrapper.text()).toContain('请先保存或取消字段修改')
    expect(title.get('input').element.value).toBe('尚未保存标题')
    await f.click('保存配置')
    expect(state.http.saves).toEqual([])
    expect(state.http.records['Base_ImportData_Config']![0]!['sheet_layout_json']).toBe('{"keep":false}')
    await f.click('保存字段')
    expect(state.http.saves.map(save=>save.table)).toEqual(['Base_ImportData_Field'])
    expect(state.http.records['Base_ImportData_Field']![0]!['title']).toBe('尚未保存标题')
  })
  it('reopens the saved layout mode without deleting or resubmitting classical mapping rows',async()=>{
    const f=await open();await f.choose()
    const mappings=structuredClone(state.http.records['Base_ImportData_Field'])
    const layout=f.wrapper.findAllComponents(FieldJson).find(field=>field.props('field')==='sheet_layout_json')!
    layout.getComponent(SparkJsonEditor).vm.$emit('update:modelValue','{"enabled":true,"version":1,"regions":[]}');await flushPromises()
    await f.click('保存配置')
    expect(state.http.saves.map(save=>save.table)).toEqual(['Base_ImportData_Config'])
    expect(state.http.records['Base_ImportData_Field']).toEqual(mappings)
    f.wrapper.unmount()
    const reopened=await open();await reopened.choose(1)
    expect(reopened.wrapper.text()).toContain('已启用相对版式')
    expect(reopened.wrapper.findAllComponents(RendererTable).some(table=>table.props('dataViewKey')?.includes('@Base_ImportData_Field@'))).toBe(false)
    expect(state.http.records['Base_ImportData_Field']).toEqual(mappings)
  })
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
  it('binds direct-parent and own mapping selectors and persists names with their matching descriptions', async () => {
    state.http.records['Base_ImportData_Config']!.push({rowid: 'CHILD', schemeid: 'E1', pid: 'C1', sheetName: '子表'})
    state.http.records['Base_ImportData_Field']!.push({rowid: 'CF', configid: 'CHILD', name: 'code', title: '子编码'})
    const f = await open(); await f.choose()
    await f.wrapper.get('.el-tree-node__expand-icon').trigger('click'); await flushPromises()
    const child = f.wrapper.findAll('.el-tree-node__content').find(row => row.text().includes('子表'))!
    await child.trigger('click'); await flushPromises()
    const parent = f.wrapper.findAllComponents(FieldSelect).find(field => field.props('field') === 'parentField')
    const foreign = f.wrapper.findAllComponents(FieldSelect).find(field => field.props('field') === 'foreignKeyField')
    expect(parent, 'parent selector bound to original node').toBeDefined(); expect(foreign).toBeDefined()
    parent!.getComponent(ElSelect).vm.$emit('update:modelValue', 'code'); await flushPromises()
    foreign!.getComponent(ElSelect).vm.$emit('update:modelValue', 'code'); await flushPromises()
    expect(f.wrapper.findAll('[role="alert"]').map(item=>item.text())).toEqual([])
    await f.click('保存配置')
    expect(state.http.records['Base_ImportData_Config']!.find(row => row['rowid'] === 'CHILD')).toMatchObject({parentField: 'code', parentFieldDesc: '编码', foreignKeyField: 'code', foreignKeyFieldDesc: '子编码'})
    expect(state.http.saves.map(save => save.table)).toEqual(['Base_ImportData_Config'])
  })
  it('exposes only source-generated mappings with readonly field identity and type', async () => {
    const f=await open();await f.choose()
    expect(f.wrapper.findAll('button').some(button=>button.text()==='新增字段')).toBe(false)
    const table=f.wrapper.findAllComponents(RendererTable).find(item=>item.props('dataViewKey')?.includes('@Base_ImportData_Field@'))!
    await table.get('tbody tr').trigger('click');await flushPromises()
    for(const field of table.findAllComponents(FieldText).filter(item=>item.props('field')==='name')) {
      if(field.find('input').exists()){const input=field.get('input').element;expect(input.readOnly||input.disabled).toBe(true)}
    }
    expect(table.findAllComponents(FieldNumber).find(field=>field.props('field')==='type')?.props('readonly')).toBe(true)
  })
  it('refuses to stage removal of a mapping referenced by a saved child association', async () => {
    state.http.records['Base_ImportData_Config']!.push({rowid:'CHILD',schemeid:'E1',pid:'C1',sheetName:'子表',parentField:'code',parentFieldDesc:'编码'})
    const f=await open();await f.choose()
    const table=f.wrapper.findAllComponents(RendererTable).find(item=>item.props('dataViewKey')?.includes('@Base_ImportData_Field@'))!
    await table.get('tbody tr').trigger('click');await flushPromises();await f.click('删除字段')
    expect(f.wrapper.text()).toContain('引用')
    expect(table.findAll('tbody tr')).toHaveLength(1);expect(state.http.saves).toEqual([])
  })
  it('refuses an association save when its selected formal mapping has since been deleted',async()=>{
    const f=await open();await f.choose()
    const foreign=f.wrapper.findAllComponents(FieldSelect).find(field=>field.props('field')==='foreignKeyField')!
    foreign.getComponent(ElSelect).vm.$emit('update:modelValue','code');await flushPromises()
    state.http.records['Base_ImportData_Field']=[]
    await f.click('保存配置')
    expect(state.http.saves).toEqual([]);expect(f.wrapper.text()).toContain('关联')
    expect(state.http.records['Base_ImportData_Config']![0]!['foreignKeyField']).toBeUndefined()
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
    await selectTarget(f);await f.click('保存目标及字段')
    const fields=state.http.records['Base_ImportData_Field']!.filter(item=>item['configid']===created['rowid'])
    expect(fields.map(field=>field['name'])).toEqual(['id','name'])
    expect(state.http.records['Base_ImportData_Field']!.find(item=>item['rowid']==='F1')?.['configid']).toBe('C1')
  })
})
