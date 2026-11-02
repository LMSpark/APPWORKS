import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import {defineComponent, h} from 'vue'
import ElementPlus from 'element-plus'
import {Spark, registerAllRenderers, RendererForm, FieldText} from '@spark-appworks/spark-component'
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
