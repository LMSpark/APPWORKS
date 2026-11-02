import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import {defineComponent, h} from 'vue'
import ElementPlus, {ElSelect, ElInputNumber} from 'element-plus'
import {Spark, registerAllRenderers, RendererForm, FieldText, RendererTable, RendererButton} from '@spark-appworks/spark-component'
import {RequestState, type DataRow} from '@spark-appworks/spark-data'
import {LowcodeDataCode} from '@/lowcode/resources/structured-config/data-code/resource'
import {createSourceDataSet, sourceRecords} from './source-picker/fixture'
import SequenceSelectorDialog from '@/views/features/data-platform/structured-config/data-code/ui/sequence-selector-dialog.vue'
import DataCodeEditor from '@/views/features/data-platform/structured-config/data-code/ui/data-code-editor-page.vue'
import {codeService, designText} from './data-code.fixture'

const state = vi.hoisted(() => ({current: undefined as unknown as ReturnType<typeof codeService>}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return state.current.http},
  lowcodeApi: {readRequestScope: () => state.current.readRequestScope(), dataSpace: {
    get design() {return state.current}, get runtime() {return state.current.runtime},
  }},
  createLowcodeProjectGateways: () => ({scenarioViews: {readText: async (id: string) => id === '868E62F90DB8118C74CDC9F6BCA61157' ? designText : null}}),
  lowcodeDesignFileUpload: async () => {throw new Error('unexpected file upload')},
}))
const wrappers: VueWrapper[] = []
const originalStubs = {...config.global.stubs}
beforeEach(() => {
  state.current = codeService(); registerAllRenderers()
  const stubs = {...originalStubs}
  for (const name of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column']) delete stubs[name]
  config.global.stubs = stubs
})
afterEach(() => {wrappers.splice(0).forEach(w => w.unmount()); config.global.stubs = originalStubs; vi.restoreAllMocks()})
async function open(query: Record<string, string> = {codeDesignId: 'C1', applicationId: 'A'}, hostTarget?: {applicationId?: string; codeDesignId?: string; create?: boolean}) {
  const router = createRouter({history: createMemoryHistory(), routes: [{path: '/editor', component: DataCodeEditor,
    props: hostTarget ?? false, meta: {blueprintScenarioId: 'A133D679691178F192D7E9DA06829506'}}, {path: '/other', component: {template: '<p>其他页</p>'}}]})
  await router.push({path: '/editor', query}); await router.isReady()
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {attachTo: document.body,
    global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  wrappers.push(wrapper); await flushPromises()
  return {wrapper, router}
}

describe('code editor formal main and node views', () => {
  it.each([false,true])('checks saved initialization preconditions before mounting its dialog (new=%s)',async create=>{
    const {wrapper}=create?await open({}, {applicationId:'A',codeDesignId:'NEW',create:true}):await open()
    await vi.waitFor(()=>expect(wrapper.findAllComponents(RendererButton).some(button=>button.props('label')==='初始化数据…'&&button.get('button').attributes('disabled')===undefined)).toBe(true))
    await wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='初始化数据…')!.get('button').trigger('click');await flushPromises()
    expect(wrapper.text()).toContain(create?'请先保存':'必须包含顺序号串')
    expect(state.current.http.reads.map(read=>read.table)).not.toContain('Base_CodeSerialPerform')
  })
  it('saves the new main definition and reopens it with the native segment action enabled', async () => {
    const loaded=vi.spyOn(LowcodeDataCode,'loadEditor'),{wrapper}=await open({}, {applicationId:'A',codeDesignId:'NEW',create:true})
    await vi.waitFor(()=>expect(wrapper.findAllComponents(RendererButton).some(button=>button.props('label')==='新增分段')).toBe(true))
    const ds=await loaded.mock.results[0]!.value,main=ds.getView('Base_CodeDesign')!
    expect(wrapper.text()).toContain('先保存主定义，再进入设计维护分段')
    expect(wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='新增分段')!.get('button').attributes('disabled')).toBeDefined()
    main.updateEditingValue('NEW','Name','新编码')
    main.updateEditingValue('NEW','BusTableRowid','T1')
    main.updateEditingValue('NEW','BusTableName','订单')
    await wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='保存设计')!.get('button').trigger('click');await flushPromises()
    await vi.waitFor(()=>expect(state.current.http.records['Base_CodeDesign']).toContainEqual(expect.objectContaining({rowid:'NEW',Name:'新编码'})))
    expect(main.hasUnconfirmedSave).toBe(false);expect(main.dirtyTracking.pendingCreateIds.size).toBe(0)
    expect(state.current.http.saves.map(save=>save.table)).toEqual(['Base_CodeDesign'])
    wrapper.unmount()
    const reopened=(await open({applicationId:'A',codeDesignId:'NEW'})).wrapper
    await vi.waitFor(()=>expect(reopened.findAllComponents(RendererButton).some(button=>button.props('label')==='新增分段')).toBe(true))
    expect(reopened.text()).not.toContain('先保存主定义，再进入设计维护分段')
    expect(reopened.findAllComponents(RendererButton).find(button=>button.props('label')==='新增分段')!.get('button').attributes('disabled')).toBeUndefined()
    expect(state.current.http.records['Base_CodeNodeDesign']).toHaveLength(2)
  })
  it('adds a native segment to a stored definition, edits its type and literal, and saves through the original views', async () => {
    const loaded = vi.spyOn(LowcodeDataCode, 'loadEditor'), {wrapper} = await open()
    await vi.waitFor(() => expect(wrapper.findAllComponents(RendererButton).some(button => button.props('label') === '新增分段')).toBe(true))
    await wrapper.findAllComponents(RendererButton).find(button => button.props('label') === '新增分段')!.get('button').trigger('click'); await flushPromises()
    const ds = await loaded.mock.results[0]!.value, nodes = ds.getView('Base_CodeNodeDesign')!
    expect(nodes.dirtyTracking.pendingCreateIds.size).toBe(1)
    const id = [...nodes.dirtyTracking.pendingCreateIds][0]!
    expect(nodes.currentRow).toMatchObject({CodeDesignID: 'C1', NodeNo: 2, NodeType: ''})
    const type = wrapper.findAllComponents(ElSelect).find(select => select.props('modelValue') === '')!
    expect(type).toBeDefined(); expect(type.props('disabled')).toBe(false)
    expect(ds.getView('Dict_CodeNodeType')!.rows[0]).toMatchObject({val: '2', nodeTypeValue: 2})
    type.vm.$emit('update:modelValue', 2); await flushPromises()
    const parameter = wrapper.findAllComponents(FieldText).find(field => field.props('field') === 'ParameterName' && field.find('input').exists() && (field.get('input').element as HTMLInputElement).value === '')!
    expect(parameter.get('input').attributes('disabled')).toBeUndefined()
    await parameter.get('input').setValue('X2'); await parameter.get('input').trigger('change'); await flushPromises()
    expect(nodes.getEditingRow(id)).toMatchObject({NodeType: 2, ParameterName: 'X2'})
    const numberInput = wrapper.findAllComponents(ElInputNumber).find(input => input.props('modelValue') === 2)!
    expect(numberInput.props('disabled')).toBe(false)
    numberInput.vm.$emit('update:modelValue', 3); await flushPromises()
    expect(nodes.getEditingRow(id)?.['NodeNo']).toBe(3)
    await wrapper.findAllComponents(RendererButton).find(button => button.props('label') === '保存设计')!.get('button').trigger('click'); await flushPromises()
    await vi.waitFor(() => expect(state.current.http.records['Base_CodeNodeDesign']).toContainEqual(expect.objectContaining({CodeDesignID: 'C1', ParameterName: 'X2', CodeNodeDesignJson: '{"ConstString":"X2"}'})))
    expect(state.current.http.records['Base_CodeDesign']![0]?.['CodeDescription']).toBe('固定字符串(A)+固定字符串(X2)')
    expect(state.current.http.records['Base_CodeNodeDesign']![1]?.['CodeDesignID']).toBe('C2')
  })
  it('cancels only a newly staged segment and preserves existing main edits', async () => {
    const loaded = vi.spyOn(LowcodeDataCode, 'loadEditor'), {wrapper} = await open()
    await vi.waitFor(() => expect(wrapper.findAllComponents(RendererButton).some(button => button.props('label') === '新增分段')).toBe(true))
    const ds = await loaded.mock.results[0]!.value, main = ds.getView('Base_CodeDesign')!, nodes = ds.getView('Base_CodeNodeDesign')!
    main.updateEditingValue('C1', 'Name', '此前草稿')
    const click = async (label: string) => {await wrapper.findAllComponents(RendererButton).find(button => button.props('label') === label)!.get('button').trigger('click'); await flushPromises()}
    await click('新增分段'); expect(nodes.dirtyTracking.pendingCreateIds.size).toBe(1)
    await click('删除分段')
    expect(nodes.dirtyTracking.pendingCreateIds.size).toBe(0)
    expect(nodes.rows.map((row: DataRow) => row['rowid'])).toEqual(['N1'])
    expect(main.getEditingRow('C1')?.['Name']).toBe('此前草稿')
    expect(state.current.http.saves).toEqual([])
  })
  it('requires confirmation before staging a persisted segment deletion and restores it on design cancel', async () => {
    const loaded = vi.spyOn(LowcodeDataCode, 'loadEditor'), {wrapper} = await open()
    await vi.waitFor(() => expect(wrapper.findAllComponents(RendererButton).some(button => button.props('label') === '删除分段')).toBe(true))
    const ds = await loaded.mock.results[0]!.value, nodes = ds.getView('Base_CodeNodeDesign')!
    nodes.setCurrentRowById('N1'); nodes.setSelectedRows([nodes.currentRow!]); await flushPromises()
    const click = async (label: string) => {await wrapper.findAllComponents(RendererButton).find(button => button.props('label') === label)!.get('button').trigger('click'); await flushPromises()}
    await click('删除分段'); expect(nodes.dirtyTracking.pendingDeleteIds.size).toBe(0)
    await click('取消删除分段'); expect(nodes.rows).toHaveLength(1)
    await click('删除分段'); await click('确定删除分段')
    expect(nodes.dirtyTracking.pendingDeleteIds.has('N1')).toBe(true)
    expect(state.current.http.saves).toEqual([])
    await click('取消修改'); expect(nodes.rows[0]?.['rowid']).toBe('N1')
    expect(nodes.dirtyTracking.pendingDeleteIds.size).toBe(0)
  })
  it('clears the old rule atomically on type change and restores it on cancel', async () => {
    state.current.http.records['Dict_CodeNodeType']!.push({rowid: 'D4', val: '4', txt: '顺序号串', ordIdx: '4'})
    const loaded = vi.spyOn(LowcodeDataCode, 'loadEditor'), {wrapper} = await open()
    await vi.waitFor(() => expect(wrapper.findAllComponents(RendererButton).some(button => button.props('label') === '新增分段')).toBe(true))
    const ds = await loaded.mock.results[0]!.value, nodes = ds.getView('Base_CodeNodeDesign')!
    nodes.setCurrentRowById('N1'); await flushPromises()
    const type = wrapper.findAllComponents(ElSelect).find(select => select.props('modelValue') === 2 && select.props('disabled') === false)!
    expect(type).toBeDefined(); type.vm.$emit('update:modelValue', 4); await flushPromises()
    expect(nodes.getEditingRow('N1')).toMatchObject({NodeType: 4, ParameterName: '', CodeNodeDesignJson: ''})
    await wrapper.findAllComponents(RendererButton).find(button => button.props('label') === '选择')!.get('button').trigger('click'); await flushPromises()
    expect(wrapper.findComponent(SequenceSelectorDialog).exists()).toBe(true)
    expect(wrapper.findComponent(SequenceSelectorDialog).text()).not.toContain('不是顺序号串')
    await wrapper.findComponent(SequenceSelectorDialog).findAllComponents(RendererButton).find(button => button.props('label') === '关闭')!.get('button').trigger('click'); await flushPromises()
    await wrapper.findAllComponents(RendererButton).find(button => button.props('label') === '取消修改')!.get('button').trigger('click'); await flushPromises()
    expect(nodes.hasEditingChanges()).toBe(false)
    expect(nodes.currentRow).toMatchObject({NodeType: 2, ParameterName: 'A', CodeNodeDesignJson: '{"ConstString":"A"}'})
    expect(state.current.http.saves).toEqual([])
  })
  it('selects a business table through the same deferred source space, changes only its three mappings and cancels through the original main view', async () => {
    Object.assign(state.current.http.records, sourceRecords())
    const source = await createSourceDataSet(state.current.http), loadSource = vi.spyOn(LowcodeDataCode, 'loadReferenceSources').mockResolvedValue(source)
    const loadMain = vi.spyOn(LowcodeDataCode, 'loadEditor'), {wrapper} = await open()
    await vi.waitFor(() => expect(wrapper.findAllComponents(FieldText).some(field => field.props('field') === 'Name')).toBe(true))
    expect(loadSource).not.toHaveBeenCalled()
    const dataSet = await loadMain.mock.results[0]!.value, main = dataSet.getView('Base_CodeDesign')!
    main.updateEditingValue('C1', 'Name', '此前名称草稿')
    const click = async (label: string) => {const button = wrapper.findAllComponents(RendererButton).find(item => item.props('label') === label); expect(button, label).toBeDefined(); await button!.get('button').trigger('click'); await flushPromises()}
    await click('设置业务表及其字段')
    await vi.waitFor(() => expect(source.getView('Base_AppSystemList')!.requestState).toBe(RequestState.Loaded))
    await click('取消选择业务表')
    expect(main.getEditingRow('C1')).toMatchObject({Name: '此前名称草稿', BusTableRowid: 'T1', BusTableName: '订单'})
    await click('设置业务表及其字段'); expect(loadSource).toHaveBeenCalledTimes(1)
    const view = (model: string, id = 'default') => source.getView(model, id)!
    const choose = (model: string, key: string, id = 'default') => {const selected = view(model, id); selected.setCurrentRowById(key); selected.setSelectedRows([selected.currentRow!])}
    await vi.waitFor(() => expect(view('Base_AppSystemList').requestState).toBe(RequestState.Loaded)); choose('Base_AppSystemList', 'A1')
    await vi.waitFor(() => expect(view('Base_AppAndSource_Relation').rows).toHaveLength(1)); choose('Base_AppAndSource_Relation', 'R1')
    await vi.waitFor(() => expect(view('_Base_TblList').rows).toHaveLength(2)); choose('_Base_TblList', 'T3')
    await vi.waitFor(() => expect(view('Base_TblField', 'textFields').rows).toHaveLength(1))
    choose('Base_TblField', 'F3', 'textFields'); choose('Base_TblField', 'F3', 'valueFields'); await flushPromises(); await click('确定业务表')
    expect(main.getEditingRow('C1')).toMatchObject({Name: '此前名称草稿', BusTableRowid: 'T3', BusTableName: 'table_three', KeyFields: 'code'})
    expect(main.currentRow?.['Name']).toBe('订单编码')
    expect(dataSet.getView('Base_CodeNodeDesign')!.hasEditingChanges()).toBe(false)
    expect(state.current.http.saves).toEqual([])
    await click('取消修改')
    expect(main.hasEditingChanges()).toBe(false)
    expect(main.currentRow).toMatchObject({BusTableRowid: 'T1', BusTableName: '订单'})
    expect(state.current.http.saves).toEqual([])
  })
  it('rejects a business-table confirmation after the original query target changes', async () => {
    Object.assign(state.current.http.records, sourceRecords())
    const source = await createSourceDataSet(state.current.http)
    vi.spyOn(LowcodeDataCode, 'loadReferenceSources').mockResolvedValue(source)
    const loaded = vi.spyOn(LowcodeDataCode, 'loadEditor'), {wrapper} = await open()
    await vi.waitFor(() => expect(wrapper.findAllComponents(RendererButton).some(button => button.props('label') === '设置业务表及其字段')).toBe(true))
    await wrapper.findAllComponents(RendererButton).find(button => button.props('label') === '设置业务表及其字段')!.get('button').trigger('click')
    await vi.waitFor(() => expect(source.getView('Base_AppSystemList')!.requestState).toBe(RequestState.Loaded))
    const dataSet = await loaded.mock.results[0]!.value, main = dataSet.getView('Base_CodeDesign')!
    main.queryContext = {...main.queryContext, applicationId: 'OTHER'}
    await wrapper.findAllComponents(RendererButton).find(button => button.props('label') === '确定业务表')!.get('button').trigger('click'); await flushPromises()
    expect(document.body.textContent).toContain('业务表编辑目标已改变')
    expect(main.hasEditingChanges()).toBe(false)
    expect(state.current.http.saves).toEqual([])
  })
  it('rejects create mode for an already existing identity without overwriting it', async () => {
    const {wrapper} = await open({}, {applicationId: 'A', codeDesignId: 'C1', create: true})
    await vi.waitFor(() => expect(wrapper.text()).toContain('新增编码身份已存在'))
    expect(state.current.http.saves).toEqual([])
    expect(state.current.http.records['Base_CodeDesign']![0]?.['Name']).toBe('订单编码')
  })
  it('uses the formal create denial instead of inventing writable new-record permissions', async () => {
    state.current.http.denyAdd.add('Base_CodeDesign')
    const {wrapper} = await open({}, {applicationId: 'A', codeDesignId: 'NEW', create: true})
    await vi.waitFor(() => expect(wrapper.text()).toContain('不允许新增'))
    expect(state.current.http.saves).toEqual([])
    expect(state.current.http.records['Base_CodeDesign']).toHaveLength(2)
  })
  it('rejects a missing managed application before querying design records', async () => {
    const {wrapper} = await open({codeDesignId: 'C1'})
    expect(wrapper.text()).toContain('applicationId')
    expect(state.current.http.reads).toEqual([])
  })

  it('does not complete a partial host target with an unrelated route target', async () => {
    const {wrapper} = await open({applicationId: 'B', codeDesignId: 'C2'}, {applicationId: 'A'})
    expect(wrapper.text()).toContain('codeDesignId')
    expect(state.current.http.reads).toEqual([])
  })

  it('binds the real main definition, edits its name and persists through DataSet', async () => {
    const {wrapper} = await open()
    await vi.waitFor(() => expect(wrapper.findComponent(RendererForm).exists()).toBe(true))
    const name = wrapper.findAllComponents(FieldText).find(field => field.props('field') === 'Name')!
    await vi.waitFor(() => expect((name.get('input').element as HTMLInputElement).value).toBe('订单编码'))
    await name.get('input').setValue('新订单编码'); await name.get('input').trigger('change'); await flushPromises()
    expect(state.current.http.records['Base_CodeDesign']![0]!['Name']).toBe('订单编码')
    await wrapper.findAll('button').find(b => b.text() === '保存设计')!.trigger('click')
    await vi.waitFor(() => expect(state.current.http.records['Base_CodeDesign']![0]!['Name']).toBe('新订单编码'))
    expect(state.current.http.saves.map(save => save.table)).toEqual(['Base_CodeDesign'])
  })

  it('keeps both main and nodes empty for a design owned by another application', async () => {
    const {wrapper} = await open({codeDesignId: 'C1', applicationId: 'B'})
    await vi.waitFor(() => expect(wrapper.text()).toContain('当前应用下未找到'))
    expect(wrapper.text()).not.toContain('订单编码')
    expect(state.current.http.saves).toEqual([])
  })

  it('compiles an edited fixed segment into its original rule field and the main description', async () => {
    state.current.http.records['Base_CodeNodeDesign']![0]!['CodeNodeDesignJson'] = '{"ConstString":"A","retained":"original"}'
    const {wrapper} = await open()
    await vi.waitFor(() => expect(wrapper.findAllComponents(FieldText).some(f => f.props('field') === 'ParameterName' && f.find('input').exists())).toBe(true))
    const node = wrapper.findAllComponents(FieldText).find(f => f.props('field') === 'ParameterName' && f.find('input').exists())!
    await node.get('input').setValue('INV'); await node.get('input').trigger('change'); await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === '保存设计')!.trigger('click')
    await vi.waitFor(() => expect(state.current.http.records['Base_CodeNodeDesign']![0]!['ParameterName']).toBe('INV'))
    expect(JSON.parse(String(state.current.http.records['Base_CodeNodeDesign']![0]!['CodeNodeDesignJson']))).toEqual({ConstString: 'INV', retained: 'original'})
    expect(state.current.http.records['Base_CodeDesign']![0]!['CodeDescription']).toBe('固定字符串(INV)')
    expect(state.current.http.records['Base_CodeNodeDesign']![1]!['ParameterName']).toBe('B')
  })

  it('keeps invalid stored rule JSON visible as an error without issuing a save', async () => {
    state.current.http.records['Base_CodeNodeDesign']![0]!['CodeNodeDesignJson'] = '{invalid'
    const {wrapper} = await open()
    await vi.waitFor(() => expect(wrapper.findAllComponents(FieldText).some(f => f.props('field') === 'ParameterName' && f.find('input').exists())).toBe(true))
    const node = wrapper.findAllComponents(FieldText).find(f => f.props('field') === 'ParameterName' && f.find('input').exists())!
    await node.get('input').setValue('INV'); await node.get('input').trigger('change'); await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === '保存设计')!.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('JSON无效'))
    expect(state.current.http.saves).toEqual([])
    expect(state.current.http.records['Base_CodeNodeDesign']![0]!['CodeNodeDesignJson']).toBe('{invalid')
  })

  it('keeps dirty edits on the same target and allows navigation only after explicit cancellation', async () => {
    const {wrapper, router} = await open()
    await vi.waitFor(() => expect(wrapper.findAllComponents(FieldText).some(f => f.props('field') === 'Name')).toBe(true))
    const name = wrapper.findAllComponents(FieldText).find(f => f.props('field') === 'Name')!
    await name.get('input').setValue('未保存'); await name.get('input').trigger('change'); await flushPromises()
    await router.push({path: '/editor', query: {applicationId: 'B', codeDesignId: 'C2'}})
    expect(router.currentRoute.value.query['applicationId']).toBe('A')
    await router.push('/other')
    expect(router.currentRoute.value.path).toBe('/editor')
    await wrapper.findAll('button').find(b => b.text() === '取消修改')!.trigger('click'); await flushPromises()
    expect((name.get('input').element as HTMLInputElement).value).toBe('订单编码')
    expect(state.current.http.saves).toEqual([])
    await router.push('/other')
    expect(router.currentRoute.value.path).toBe('/other')
  })

  it('does not replace a new target with a late model-load result from the previous target', async () => {
    const original = state.current.readModelBatch
    let release!: () => void
    vi.spyOn(state.current, 'readModelBatch').mockImplementationOnce(async input => {
      await new Promise<void>(resolve => {release = resolve})
      return original(input)
    })
    const {wrapper, router} = await open()
    await router.push({path: '/editor', query: {applicationId: 'B', codeDesignId: 'C2'}})
    await vi.waitFor(() => expect(wrapper.findAllComponents(FieldText).some(f => f.props('field') === 'Name' && f.find('input').exists())).toBe(true))
    release(); await flushPromises()
    const name = wrapper.findAllComponents(FieldText).find(f => f.props('field') === 'Name')!
    expect((name.get('input').element as HTMLInputElement).value).toBe('其他应用编码')
    expect(wrapper.text()).not.toContain('固定字符串(A)')
    expect(state.current.http.saves).toEqual([])
  })

  it('does not replay a write when the save receipt is lost', async () => {
    const {wrapper} = await open()
    await vi.waitFor(() => expect(wrapper.findAllComponents(FieldText).some(f => f.props('field') === 'Name' && f.find('input').exists())).toBe(true))
    const name = wrapper.findAllComponents(FieldText).find(f => f.props('field') === 'Name')!
    await name.get('input').setValue('回执丢失后的名称'); await name.get('input').trigger('change'); await flushPromises()
    state.current.http.failAfterWrite = true
    await wrapper.findAll('button').find(b => b.text() === '保存设计')!.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
    expect(state.current.http.saves).toHaveLength(1)
    expect(state.current.http.records['Base_CodeDesign']![0]!['Name']).toBe('回执丢失后的名称')
    await wrapper.findAll('button').find(b => b.text() === '核验保存结果')!.trigger('click'); await flushPromises()
    expect(state.current.http.saves).toHaveLength(1)
  })
})
