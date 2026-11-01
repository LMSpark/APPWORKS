import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import ElementPlus, {ElPagination} from 'element-plus'
import {PageRuntime, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {RequestState} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import SequenceSelectorDialog from '@/views/features/data-platform/structured-config/data-code/ui/sequence-selector-dialog.vue'
import {codeModels, codeService, designText, DESIGN} from './data-code.fixture'

const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = [], original = {...config.global.stubs}
afterEach(() => {wrappers.splice(0).forEach(w => w.unmount()); runtimes.splice(0).forEach(r => r.dispose()); config.global.stubs = original})
async function fixture(denyDelete = false) {
  const service = codeService()
  if (denyDelete) service.http.denyDelete.add('Base_CodingSequence')
  service.http.records['Base_CodeNodeDesign']![0] = {rowid: 'N1', CodeDesignID: 'C1', NodeNo: 1, NodeType: 4,
    ParameterName: '原参数', CodeNodeDesignJson: '{"keep":false}'}
  service.http.records['Dict_CodeNodeType']!.push({rowid: 'D4', val: '4', txt: '顺序号串', ordIdx: '4'})
  service.http.records['Base_CodingSequence'] = [{rowid: 'S1', Name: '订单序号', Incre: '01', StartNo: '1', EndNo: '4', Format: '0001-9999'}]
  const ds = new LowcodeDataSpaceAssembler(service.runtime, service.http).assemble({config: new ScenarioViewConfig(DESIGN, designText),
    space: {dataSpaceId: DESIGN, name: '编码'}, models: codeModels(), relations: []}).dataSet
  const runtime = new PageRuntime({pageId: 'sequence-rule', scenarioIds: [DESIGN], scenarioInputs: {[DESIGN]: {applicationId: 'A', codeDesignId: 'C1'}},
    loadScenario: async () => ds})
  await runtime.load(); runtimes.push(runtime); ds.triggerAutoLoad()
  const nodes = ds.getView('Base_CodeNodeDesign')!, sequences = ds.getView('Base_CodingSequence')!, main = ds.getView('Base_CodeDesign')!
  await vi.waitFor(() => expect(nodes.requestState).toBe(RequestState.Loaded))
  main.updateEditingValue('C1', 'Name', '主设计尚未保存')
  expect(service.http.reads.some(read => read.table === 'Base_CodingSequence')).toBe(false)
  registerAllRenderers()
  const stubs = {...original}; for (const name of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column']) delete stubs[name]
  config.global.stubs = stubs
  const wrapper = mount(defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'sequence-rule-host'}); sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(SequenceSelectorDialog, {dataViewKey: `${DESIGN}@Base_CodeNodeDesign@default`, nodeId: 'N1'})
  }}), {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()]}})
  wrappers.push(wrapper); await flushPromises()
  const dialog = wrapper.getComponent(SequenceSelectorDialog)
  const click = async (label: string) => {
    const button = wrapper.findAll('button').find(item => item.text() === label)
    expect(button, `missing ${label}`).toBeDefined()
    await button!.trigger('click'); await flushPromises()
  }
  return {wrapper, dialog, nodes, main, sequences, ds, service, click}
}

describe('sequence directory and node selection', () => {
  it('rejects a stale node selection and retains its untouched rules', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.sequences.requestState).toBe(RequestState.Loaded))
    f.sequences.setCurrentRowById('S1'); f.nodes.setCurrentRow(null); await flushPromises()
    await f.click('确定')
    expect(f.wrapper.text()).toContain('编码段目标已改变')
    expect(f.nodes.hasEditingChanges()).toBe(false)
    expect(f.service.http.saves).toEqual([])
    expect(f.dialog.emitted('close')).toBeUndefined()
  })

  it('consumes the original query delete denial for the selected directory row', async () => {
    const f = await fixture(true)
    await vi.waitFor(() => expect(f.sequences.requestState).toBe(RequestState.Loaded))
    f.sequences.setCurrentRowById('S1'); await flushPromises()
    const button = f.wrapper.findAll('button').find(item => item.text() === '删除')!
    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click'); await flushPromises()
    expect(f.sequences.dirtyTracking.pendingDeleteIds.size).toBe(0)
    expect(f.service.http.saves).toEqual([])
  })
  it('queries the formal directory lazily and writes the selected saved row only to the bound node', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.wrapper.findAll('tbody tr')).toHaveLength(1))
    expect(f.wrapper.text()).toContain('起始值-最大值')
    await f.wrapper.get('tbody tr').trigger('click'); await flushPromises()
    await f.click('确定')
    expect(f.nodes.getEditingRow('N1')?.['ParameterName']).toBe('订单序号(开始段:1,结束段:4)')
    expect(JSON.parse(String(f.nodes.getEditingRow('N1')?.['CodeNodeDesignJson']))).toEqual({keep: false, Incre: '01', StartNo: '1', EndNo: '4', Format: '0001-9999'})
    expect(f.main.getEditingRow('C1')?.['Name']).toBe('主设计尚未保存')
    expect(f.service.http.saves).toEqual([])
    expect(f.dialog.emitted('close')).toHaveLength(1)
  })

  it('saves directory edits through the bound fields without submitting main or node edits', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.wrapper.findAll('tbody tr')).toHaveLength(1))
    await f.wrapper.get('tbody tr').trigger('click'); await flushPromises()
    await f.wrapper.findAll('tbody .field-table-value')[0]!.trigger('dblclick'); await flushPromises()
    const name = f.wrapper.findAll('tbody input[type="text"]')[0]!
    expect(name.attributes('disabled')).toBeUndefined()
    await name.setValue('更新序号'); await name.trigger('change'); await flushPromises()
    expect(f.wrapper.text()).not.toContain('目标已改变')
    expect(f.sequences.getEditingRow('S1')?.['Name']).toBe('更新序号')
    await f.click('保存')
    expect(f.service.http.records['Base_CodingSequence']![0]!['Name']).toBe('更新序号')
    expect(f.service.http.saves.map(save => save.table)).toEqual(['Base_CodingSequence'])
    expect(f.main.hasEditingChanges('C1')).toBe(true)
    expect(f.nodes.hasEditingChanges()).toBe(false)
    expect(f.sequences.hasEditingChanges()).toBe(false)
  })

  it('keeps dirty rules open until explicitly discarded and does not change the target node', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.sequences.requestState).toBe(RequestState.Loaded))
    f.sequences.updateEditingValue('S1', 'Name', '放弃此修改'); await flushPromises()
    await f.click('关闭')
    expect(f.dialog.emitted('close')).toBeUndefined()
    await expect(f.sequences.setPage(2)).rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
    expect(f.sequences.page).toBe(1)
    await f.click('放弃修改并关闭')
    expect(f.sequences.getEditingPatch('S1')).toBeUndefined()
    expect(f.nodes.hasEditingChanges()).toBe(false)
    expect(f.main.hasEditingChanges('C1')).toBe(true)
    expect(f.service.http.saves).toEqual([])
    expect(f.dialog.emitted('close')).toHaveLength(1)
  })

  it('validates a new rule, confirms its save, then removes it through the same directory view', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.sequences.requestState).toBe(RequestState.Loaded))
    await f.click('新增')
    expect(f.sequences.dirtyTracking.pendingCreateIds.size).toBe(1)
    await f.click('保存')
    expect(f.wrapper.text()).toContain('名称不能为空')
    expect(f.service.http.saves).toEqual([])
    const id = [...f.sequences.dirtyTracking.pendingCreateIds][0]!
    for (const [field, value] of Object.entries({Name: '新规则', Incre: '1', StartNo: '2', EndNo: '5', Format: '001-999'})) f.sequences.updateEditingValue(id, field, value)
    await flushPromises(); await f.click('保存')
    expect(f.service.http.records['Base_CodingSequence']!.some(row => row['Name'] === '新规则')).toBe(true)
    f.sequences.setCurrentRowById(id); await flushPromises(); await f.click('删除'); await f.click('保存')
    expect(f.service.http.records['Base_CodingSequence']!.some(row => row['Name'] === '新规则')).toBe(false)
    expect(f.service.http.saves.map(save => save.table)).toEqual(['Base_CodingSequence', 'Base_CodingSequence'])
  })

  it('recovers an unknown directory save by readback without replaying the write', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.sequences.requestState).toBe(RequestState.Loaded))
    f.sequences.updateEditingValue('S1', 'Name', '已落库待核验'); await flushPromises()
    f.service.http.failAfterWrite = true
    await f.click('保存')
    expect(f.sequences.hasUnconfirmedSave).toBe(true)
    expect(f.wrapper.getComponent(ElPagination).props('disabled')).toBe(true)
    expect(f.service.http.saves).toHaveLength(1)
    const discard = f.wrapper.findAll('button').find(button => button.text() === '放弃修改并关闭')!
    expect(discard.attributes('disabled')).toBeDefined()
    await f.click('核验保存结果')
    expect(f.sequences.hasUnconfirmedSave).toBe(false)
    expect(f.sequences.hasEditingChanges()).toBe(false)
    expect(f.wrapper.getComponent(ElPagination).props('disabled')).toBe(false)
    expect(f.service.http.saves).toHaveLength(1)
    expect(f.dialog.emitted('close')).toBeUndefined()
  })
})
