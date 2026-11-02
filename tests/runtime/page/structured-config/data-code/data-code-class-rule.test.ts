import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import ElementPlus from 'element-plus'
import {PageRuntime, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {RequestState} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import CodeClassSelectorDialog from '@/views/features/data-platform/structured-config/data-code/ui/code-class-selector-dialog.vue'
import {codeModels, codeService, designText, DESIGN} from './data-code.fixture'

const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = [], original = {...config.global.stubs}
afterEach(() => {wrappers.splice(0).forEach(w => w.unmount()); runtimes.splice(0).forEach(r => r.dispose()); config.global.stubs = original})
async function fixture() {
  const service = codeService()
  service.http.records['Base_CodeNodeDesign']![0] = {rowid: 'N1', CodeDesignID: 'C1', NodeNo: 1, NodeType: 1,
    ParameterName: '原分类', CodeNodeDesignJson: '{"keep":false}'}
  service.http.records['Dict_CodeNodeType']!.push({rowid: 'D1', val: '1', txt: '分类字符串', ordIdx: '1'})
  service.http.records['Base_CodeClassTable'] = [{rowid: 'K1', Name: '订单分类', TableRowid: 'T2', TableName: '分类表',
    TextFieldName: 'code', ValueFieldName: 'id', BusFilterField: 'class_id'}]
  const ds = new LowcodeDataSpaceAssembler(service.runtime, service.http).assemble({config: new ScenarioViewConfig(DESIGN, designText),
    space: {dataSpaceId: DESIGN, name: '编码'}, models: codeModels(), relations: []}).dataSet
  const runtime = new PageRuntime({pageId: 'class-rule', scenarioIds: [DESIGN], scenarioInputs: {[DESIGN]: {applicationId: 'A', codeDesignId: 'C1'}}, loadScenario: async () => ds})
  await runtime.load(); runtimes.push(runtime); ds.triggerAutoLoad()
  const nodes = ds.getView('Base_CodeNodeDesign')!, catalog = ds.getView('Base_CodeClassTable')!, main = ds.getView('Base_CodeDesign')!
  await vi.waitFor(() => expect(nodes.requestState).toBe(RequestState.Loaded))
  main.updateEditingValue('C1', 'Name', '未保存主设计')
  expect(service.http.reads.some(read => read.table === 'Base_CodeClassTable')).toBe(false)
  registerAllRenderers()
  const stubs = {...original}; for (const name of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column']) delete stubs[name]
  config.global.stubs = stubs
  const wrapper = mount(defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'class-rule-host'}); sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(CodeClassSelectorDialog, {dataViewKey: `${DESIGN}@Base_CodeNodeDesign@default`, nodeId: 'N1'})
  }}), {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()]}})
  wrappers.push(wrapper); await flushPromises()
  const dialog = wrapper.getComponent(CodeClassSelectorDialog)
  const click = async (label: string) => {
    const button = wrapper.findAll('button').find(item => item.text() === label)
    expect(button, `missing ${label}`).toBeDefined()
    await button!.trigger('click'); await flushPromises()
  }
  return {wrapper, dialog, nodes, main, catalog, service, click}
}

describe('classification selection through original views', () => {
  it('queries lazily, maps formal reference fields and preserves unknown node rule members without saving', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.wrapper.findAll('tbody tr')).toHaveLength(1))
    await f.wrapper.get('tbody tr').trigger('click'); await flushPromises(); await f.click('确定')
    expect(f.nodes.getEditingRow('N1')?.['ParameterName']).toBe('订单分类')
    expect(JSON.parse(String(f.nodes.getEditingRow('N1')?.['CodeNodeDesignJson']))).toEqual({keep: false, BusFilterField: 'class_id', RefTableId: 'T2',
      RefTableName: '分类表', RefTableValueField: 'code', RefTableFilterField: 'id'})
    expect(f.main.getEditingRow('C1')?.['Name']).toBe('未保存主设计')
    expect(f.service.http.saves).toEqual([])
    expect(f.dialog.emitted('close')).toHaveLength(1)
    f.nodes.discardPendingChanges()
    expect(f.nodes.rows[0]?.['CodeNodeDesignJson']).toBe('{"keep":false}')
  })
  it('cancels without changing node or unrelated pending main edits', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.setCurrentRowById('K1'); await flushPromises(); await f.click('取消')
    expect(f.nodes.hasEditingChanges()).toBe(false)
    expect(f.main.hasEditingChanges()).toBe(true)
    expect(f.service.http.saves).toEqual([])
    expect(f.dialog.emitted('close')).toHaveLength(1)
  })
  it('rejects a stale node target without applying the selected rule', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.setCurrentRowById('K1'); f.nodes.setCurrentRow(null); await flushPromises(); await f.click('确定')
    expect(f.wrapper.text()).toContain('编码段目标已改变')
    expect(f.nodes.hasEditingChanges()).toBe(false)
    expect(f.dialog.emitted('close')).toBeUndefined()
  })
  it('does not select a directory row with uncommitted edits', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.setCurrentRowById('K1'); f.catalog.updateEditingValue('K1', 'Name', '未保存目录'); await flushPromises(); await f.click('确定')
    expect(f.nodes.hasEditingChanges()).toBe(false)
    expect(f.dialog.emitted('close')).toBeUndefined()
    expect(f.service.http.saves).toEqual([])
  })
  it('retains invalid existing JSON rather than overwriting it with the selected rule', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.setCurrentRowById('K1'); f.nodes.updateEditingValue('N1', 'CodeNodeDesignJson', '{invalid'); await flushPromises()
    await f.click('确定')
    expect(f.wrapper.text()).toContain('JSON无效')
    expect(f.nodes.getEditingRow('N1')?.['CodeNodeDesignJson']).toBe('{invalid')
    expect(f.nodes.getEditingRow('N1')?.['ParameterName']).toBe('原分类')
    expect(f.service.http.saves).toEqual([])
  })
  it('restores both original field patches if applying the second mapped field fails', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.setCurrentRowById('K1')
    const originalWrite = f.nodes.updateEditingValue.bind(f.nodes)
    vi.spyOn(f.nodes, 'updateEditingValue').mockImplementation((id, field, value) => {
      if (field === 'ParameterName') throw new Error('写回中断')
      return originalWrite(id, field, value)
    })
    await flushPromises(); await f.click('确定')
    expect(f.wrapper.text()).toContain('写回中断')
    expect(f.nodes.hasEditingChanges()).toBe(false)
    expect(f.dialog.emitted('close')).toBeUndefined()
    expect(f.service.http.saves).toEqual([])
  })
})
