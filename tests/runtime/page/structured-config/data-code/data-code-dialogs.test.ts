import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import {Spark, RendererTable, registerAllRenderers} from '@spark-appworks/spark-component'
import TimeStringDialog from '@/views/features/data-platform/structured-config/data-code/ui/time-string-dialog.vue'
import SequenceSelectorDialog from '@/views/features/data-platform/structured-config/data-code/ui/sequence-selector-dialog.vue'
import DataCodeEditor from '@/views/features/data-platform/structured-config/data-code/ui/data-code-editor-page.vue'
import {LowcodeDataCode} from '@/lowcode/resources/structured-config/data-code/resource'
import {codeService, designText} from './data-code.fixture'
const state = vi.hoisted(() => ({current: undefined as unknown as ReturnType<typeof codeService>}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return state.current.http},
  lowcodeApi: {readRequestScope: () => state.current.readRequestScope(), dataSpace: {
    get design() {return state.current}, get runtime() {return state.current.runtime},
  }},
  createLowcodeProjectGateways: () => ({scenarioViews: {readText: async () => designText}}),
  lowcodeDesignFileUpload: async () => {throw new Error('unexpected upload')},
}))
beforeEach(() => {state.current = codeService(); registerAllRenderers()})
afterEach(() => vi.restoreAllMocks())

async function mountEditor() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{
      path: '/editor',
      component: DataCodeEditor,
      meta: {blueprintScenarioId: LowcodeDataCode.navigationScenarioId},
    }],
  })
  await router.push({path: '/editor', query: {codeDesignId: 'C1', applicationId: 'A'}})
  await router.isReady()
  const wrapper = mount(DataCodeEditor, {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  await flushPromises()
  return wrapper
}

const dialogButtons = ['初始化数据', '编码类编辑', '编码类选择'] as const

describe('data-code editor dialogs', () => {
  it('opens sequence selection from its node even when no business table is selected', async () => {
    state.current.http.records['Base_CodeDesign']![0]!['BusTableRowid'] = ''
    state.current.http.records['Base_CodeNodeDesign']![0] = {rowid: 'N1', CodeDesignID: 'C1', NodeNo: 1, NodeType: 4, ParameterName: '', CodeNodeDesignJson: '{}'}
    state.current.http.records['Dict_CodeNodeType']!.push({rowid: 'D4', val: '4', txt: '顺序号串', ordIdx: '4'})
    const wrapper = await mountEditor()
    await vi.waitFor(() => expect(wrapper.findComponent(RendererTable).exists()).toBe(true))
    const action = wrapper.getComponent(RendererTable).props('actions')!.children![0]!
    if (typeof action !== 'object') throw new Error('expected standard row action')
    const choose = action.props!['onClick'] as (row: unknown) => void
    choose(state.current.http.records['Base_CodeNodeDesign']![0]); await flushPromises()
    expect(wrapper.getComponent(SequenceSelectorDialog).props('nodeId')).toBe('N1')
    expect(state.current.http.reads.some(read => read.table === 'Base_CodingSequence')).toBe(true)
    expect(state.current.http.saves).toEqual([])
    wrapper.unmount()
  })
  it('opens a time rule for the selected node and blocks host discard until the local dialog closes', async () => {
    state.current.http.records['Base_CodeNodeDesign']![0] = {rowid: 'N1', CodeDesignID: 'C1', NodeNo: 1, NodeType: 3,
      ParameterName: 'yyyyMMDD', CodeNodeDesignJson: '{"DateFormat":"yyyyMMDD","RefBusTableField":""}'}
    state.current.http.records['Dict_CodeNodeType']!.push({rowid: 'D3', val: '3', txt: '时间字符串', ordIdx: '3'})
    const wrapper = await mountEditor()
    await vi.waitFor(() => expect(wrapper.findComponent(RendererTable).exists()).toBe(true))
    const actions = wrapper.getComponent(RendererTable).props('actions')!
    const action = actions.children![0]!
    if (typeof action !== 'object') throw new Error('expected standard row action')
    const choose = action.props!['onClick'] as (row: unknown) => void
    choose(state.current.http.records['Base_CodeNodeDesign']![0]); await flushPromises()
    const dialog = wrapper.getComponent(TimeStringDialog)
    expect(dialog.props('nodeId')).toBe('N1')
    expect(dialog.props('busTableRowid')).toBe('T1')
    expect((wrapper.vm as unknown as {discardChanges: () => boolean}).discardChanges()).toBe(false)
    expect(state.current.http.saves).toEqual([])
    dialog.vm.$emit('close'); await flushPromises()
    expect(wrapper.findComponent(TimeStringDialog).exists()).toBe(false)
    wrapper.unmount()
  })
  it.each(dialogButtons)('opens dialog via %s button', async (label) => {
    const wrapper = await mountEditor()
    await vi.waitFor(() => expect(wrapper.findAll('button').some(b => b.text().includes(label))).toBe(true))
    await wrapper.findAll('button').find(b => b.text().includes(label))!.trigger('click')
    await flushPromises()
    expect(document.body.textContent?.length).toBeGreaterThan(10)
    wrapper.unmount()
  })
})
