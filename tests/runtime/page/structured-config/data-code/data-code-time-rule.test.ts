import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import ElementPlus, {ElSelect} from 'element-plus'
import {PageRuntime, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {RequestState, type DataView} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, Spark, FieldText, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import TimeStringDialog from '@/views/features/data-platform/structured-config/data-code/ui/time-string-dialog.vue'
import ParentCodeDialog from '@/views/features/data-platform/structured-config/data-code/ui/parent-code-dialog.vue'
import {codeModels, codeService, designText, DESIGN} from './data-code.fixture'

const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = [], original = {...config.global.stubs}
afterEach(() => {wrappers.splice(0).forEach(w => w.unmount()); runtimes.splice(0).forEach(r => r.dispose()); config.global.stubs = original})
async function fixture(kind: 'time' | 'parent' = 'time', beforeOpen?: (view: DataView) => void) {
  const service = codeService()
  service.http.records['Base_CodeNodeDesign']![0] = {rowid: 'N1', CodeDesignID: 'C1', NodeNo: 1, NodeType: 3,
    ParameterName: 'yyyyMMDD', CodeNodeDesignJson: '{"DateFormat":"yyyyMMDD","RefBusTableField":"","keep":false}'}
  service.http.records['Dict_CodeNodeType']!.push({rowid: 'D3', val: '3', txt: '时间字符串', ordIdx: '3'})
  service.http.records['Base_TblField'] = [{rowid: 'F1', tblid: 'T1', enname: 'created_at', cnname: '创建日期'},
    {rowid: 'F2', tblid: 'T2', enname: 'other', cnname: '其他表字段'}]
  if (kind === 'parent') {
    service.http.records['Base_CodeNodeDesign']![0] = {rowid: 'N1', CodeDesignID: 'C1', NodeNo: 1, NodeType: 5,
      ParameterName: '父级段', CodeNodeDesignJson: '{"RefCodeId":"","parentCodeBizField":"","keep":false}'}
    service.http.records['Dict_CodeNodeType']!.push({rowid: 'D5', val: '5', txt: '父编码串', ordIdx: '5'})
    service.http.records['Base_CodeDesign']!.push({rowid: 'P1', AppID: 'A', Name: '本应用父编码'}, {rowid: 'P2', AppID: 'B', Name: '其他应用父编码'})
  }
  const ds = new LowcodeDataSpaceAssembler(service.runtime, service.http).assemble({config: new ScenarioViewConfig(DESIGN, designText),
    space: {dataSpaceId: DESIGN, name: '编码'}, models: codeModels(), relations: []}).dataSet
  const runtime = new PageRuntime({pageId: 'time-rule', scenarioIds: [DESIGN], scenarioInputs: {[DESIGN]: {applicationId: 'A', codeDesignId: 'C1'}},
    loadScenario: async () => ds})
  await runtime.load(); runtimes.push(runtime); ds.triggerAutoLoad()
  const nodes = ds.getView('Base_CodeNodeDesign')!
  await vi.waitFor(() => expect(nodes.requestState).toBe(RequestState.Loaded))
  beforeOpen?.(nodes)
  registerAllRenderers()
  const stubs = {...original}; for (const name of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column']) delete stubs[name]
  config.global.stubs = stubs
  const wrapper = mount(defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'time-rule-host'}); sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(kind === 'time' ? TimeStringDialog : ParentCodeDialog, {dataViewKey: `${DESIGN}@Base_CodeNodeDesign@default`, nodeId: 'N1', busTableRowid: 'T1'})
  }}), {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()]}})
  wrappers.push(wrapper); await flushPromises(); const dialog = wrapper.getComponent(kind === 'time' ? TimeStringDialog : ParentCodeDialog)
  return {wrapper, dialog, nodes, ds, service}
}

describe('time-string rule dialog', () => {
  it('keeps incomplete parent rules open and sends no persistence request', async () => {
    const f = await fixture('parent')
    await vi.waitFor(() => expect(f.wrapper.findAllComponents(ElSelect)).toHaveLength(2))
    await f.wrapper.findAll('button').find(button => button.text() === '保存')!.trigger('click'); await flushPromises()
    expect(f.wrapper.text()).toContain('请选择当前应用下的父编码串')
    expect(f.dialog.emitted('close')).toBeUndefined()
    expect(f.service.http.saves).toEqual([])
  })

  it('rejects malformed rule JSON before opening an editable form', async () => {
    const f = await fixture('time', view => view.updateEditingValue('N1', 'CodeNodeDesignJson', '{broken'))
    expect(f.wrapper.text()).toContain('编码节点规则JSON无效')
    expect(f.wrapper.find('input[aria-label="日期格式"]').exists()).toBe(false)
    expect(f.nodes.getEditingRow('N1')?.['CodeNodeDesignJson']).toBe('{broken')
    expect(f.service.http.saves).toEqual([])
  })
  it('binds JSON members and business-field options, then confirms locally without sending a save', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.wrapper.findComponent(ElSelect).exists()).toBe(true))
    expect(f.ds.getView('Base_TblField')!.rows.map(row => row['enname'])).toEqual(['created_at'])
    const format = f.wrapper.get('input[aria-label="日期格式"]')
    await format.setValue('yyyyMMdd'); await format.trigger('change'); await flushPromises()
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', 'created_at'); await flushPromises()
    await f.wrapper.findAll('button').find(button => button.text() === '保存')!.trigger('click'); await flushPromises()
    expect(JSON.parse(String(f.nodes.getEditingRow('N1')?.['CodeNodeDesignJson']))).toEqual({DateFormat: 'yyyyMMdd', RefBusTableField: 'created_at', keep: false})
    expect(f.nodes.getEditingRow('N1')?.['ParameterName']).toBe('yyyyMMdd')
    expect(f.service.http.saves).toEqual([])
    expect(f.dialog.emitted('close')).toHaveLength(1)
  })

  it('restores the opening checkpoint and ignores input from the cancelled editor', async () => {
    const f = await fixture('time', view => {view.updateEditingValue('N1', 'ParameterName', '打开前参数'); view.updateEditingValue('N1', 'NodeNo', 42)})
    await vi.waitFor(() => expect(f.wrapper.find('input[aria-label="日期格式"]').exists()).toBe(true))
    const format = f.wrapper.get('input[aria-label="日期格式"]')
    await format.setValue('yyyy'); await format.trigger('change'); await flushPromises()
    await f.wrapper.findAll('button').find(button => button.text() === '取消')!.trigger('click'); await flushPromises()
    expect(f.nodes.getEditingRow('N1')?.['ParameterName']).toBe('打开前参数')
    expect(f.nodes.getEditingRow('N1')?.['NodeNo']).toBe(42)
    expect(f.nodes.getEditingPatch('N1')).not.toHaveProperty('CodeNodeDesignJson')
    expect(f.dialog.emitted('close')).toHaveLength(1)
    expect(f.service.http.saves).toEqual([])
  })

  it('queries parent options within the managed application, excludes self and confirms both node fields', async () => {
    const f = await fixture('parent')
    await vi.waitFor(() => expect(f.wrapper.findAllComponents(ElSelect)).toHaveLength(2))
    expect(f.ds.getView('Base_CodeDesign', 'parents')!.rows.map(row => row['rowid'])).toEqual(['P1'])
    const name = f.wrapper.findAllComponents(FieldText).find(field => field.props('field') === 'ParameterName')!
    await name.get('input').setValue('订单前缀'); await name.get('input').trigger('change'); await flushPromises()
    const controls = f.wrapper.findAllComponents(ElSelect)
    controls[0]!.vm.$emit('update:modelValue', 'P1'); await flushPromises()
    controls[1]!.vm.$emit('update:modelValue', 'created_at'); await flushPromises()
    await f.wrapper.findAll('button').find(button => button.text() === '保存')!.trigger('click'); await flushPromises()
    expect(JSON.parse(String(f.nodes.getEditingRow('N1')?.['CodeNodeDesignJson']))).toEqual({RefCodeId: 'P1', parentCodeBizField: 'created_at', keep: false})
    expect(f.nodes.getEditingRow('N1')?.['ParameterName']).toBe('订单前缀')
    expect(f.service.http.saves).toEqual([])
    expect(f.dialog.emitted('close')).toHaveLength(1)
  })
})
