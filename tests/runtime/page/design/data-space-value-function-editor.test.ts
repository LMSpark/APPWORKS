import {afterEach, describe, expect, it} from 'vitest'
import {DOMWrapper, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {computed, defineComponent, h, ref} from 'vue'
import ElementPlus, {ElSelect, ElTabs} from 'element-plus'
import JsonTreeEditor from '../../../../packages/spark-component/src/components/editors/JsonTreeEditor.vue'
import {DataViewFilter, SparkData, getDataViewFilterFunctionDefinitions, type DataViewFilterFunctionContext} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {FieldValueFunction, FilterValueFunctionDialog, PAGE_RUNTIME, RendererForm, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'

const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = []
const tables = [{name: 'Orders', label: '订单', fields: [{name: 'Id', label: '编号'}]}]
afterEach(() => {wrappers.splice(0).forEach(wrapper => wrapper.unmount()); runtimes.splice(0).forEach(runtime => runtime.dispose())})

async function editor(value = '', options: DataViewFilterFunctionContext = {}, source = false) {
  registerAllRenderers()
  const dataSet = SparkData.fromJson({scenarioId: 'C', dataSetName: 'Definitions', tables: {
    Fields: {resourceType: 'static-data', columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'ValueFun', type: 'string'}],
      views: {default: {commitMode: 'staged', rows: [{id: 'first', ValueFun: value}, {id: 'second', ValueFun: value}]}}},
  }})
  const runtime = new PageRuntime({pageId: 'function-binding', scenarioIds: ['C'], loadScenario: async () => dataSet})
  await runtime.load(); runtimes.push(runtime)
  const view = dataSet.getView('Fields')!, context = ref(options), readonly = ref(false), sourceInput = ref(source)
  view.setCurrentRowById('first')
  const directory = computed(() => {
    const normalized = DataViewFilter.editorContext(context.value)
    return !sourceInput.value ? normalized : {...normalized, definitions: (normalized.definitions ?? []).map(item => ({...item,
      enabled: () => ['GetInputParam', 'GetConstValue'].includes(item.type)}))}
  })
  const host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'function-binding-test'})
    sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(RendererForm, {dataViewKey: 'C@Fields@default', autoColumns: false, showDataViewMeta: false},
      () => h(FieldValueFunction, {dataViewKey: 'C@Fields@default', dataMember: 'currentRow', field: 'ValueFun', label: '值函数',
        functionContext: directory.value, readonly: readonly.value}))
  }})
  const wrapper = mount(host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {JsonTreeEditor: true}}})
  wrappers.push(wrapper); await flushPromises()
  const open = async () => {await wrapper.get('[data-function-open]').trigger('click'); await flushPromises(); return wrapper.getComponent(FilterValueFunctionDialog)}
  const cancel = async () => {wrapper.getComponent(FilterValueFunctionDialog).vm.$emit('update:modelValue', false); await flushPromises()}
  const confirm = async () => {await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click'); await flushPromises()}
  const current = () => view.getEditingRow('first')?.['ValueFun']
  return {wrapper, view, context, readonly, sourceInput, open, cancel, confirm, current}
}

describe('data-space value functions through standard DataView binding', () => {
  it('retains legacy source text until an unambiguous declared parameter is explicitly selected', async () => {
    const original = ' {"Type":"SystemData","ParamName":"UserID","Extra":false} '
    const f = await editor(original, {inputParams: [{label: '业务用户', value: 'UserID'}], tables}, true)
    let dialog = await f.open()
    expect(getDataViewFilterFunctionDefinitions(dialog.props('context')).map(item => item.type)).toEqual(['GetInputParam', 'GetConstValue'])
    expect(dialog.props('value')).toMatchObject({Type: 'SystemData', ParamName: 'UserID'})
    await f.cancel(); expect(f.current()).toBe(original); expect(f.view.hasEditingChanges()).toBe(false)
    dialog = await f.open(); dialog.getComponent(ElTabs).vm.$emit('update:modelValue', 'GetInputParam'); await flushPromises()
    const parameter = dialog.getComponent(ElSelect)
    await f.confirm(); expect(f.view.hasEditingChanges()).toBe(false)
    parameter.vm.$emit('update:modelValue', 'not-declared'); await f.confirm(); expect(f.view.hasEditingChanges()).toBe(false)
    parameter.vm.$emit('update:modelValue', 'UserID'); await f.confirm()
    expect(f.current()).toBe('{"Type":"GetInputParam","ParamName":"UserID"}')
    expect(f.view.rows[0]?.['ValueFun']).toBe(original)
  })

  it.each(['identity', 'declarations', 'permission', 'purpose', 'session', 'value'] as const)('rejects a previous callback after %s changes', async change => {
    const original = '{"Type":"SystemData","ParamName":"UserID"}'
    const f = await editor(original, {inputParams: [{label: '用户', value: 'UserID'}]}, true)
    const dialog = await f.open(), stale = dialog.vm.$.vnode.props?.['onConfirm']
    if (typeof stale !== 'function') throw new Error('Missing confirm handler')
    if (change === 'identity') f.view.setCurrentRowById('second')
    if (change === 'declarations') f.context.value = {inputParams: []}
    if (change === 'permission') f.readonly.value = true
    if (change === 'purpose') f.sourceInput.value = false
    if (change === 'value') f.view.updateEditingValue('first', 'ValueFun', '{"Type":"GetConstValue","Value":false}')
    if (change === 'session') {await f.cancel(); await f.open()}
    await flushPromises()
    const before = f.current()
    await stale({Type: 'GetInputParam', ParamName: 'UserID'}); await flushPromises()
    expect(f.current()).toBe(before); expect(f.view.getEditingRow('second')?.['ValueFun']).toBe(original)
  })

  it('preserves unavailable source functions and rejects fabricated confirmations', async () => {
    const original = '{"Type":"SystemData","ParamName":"UserID"}', f = await editor(original, {}, true)
    const dialog = await f.open()
    expect(getDataViewFilterFunctionDefinitions(dialog.props('context')).map(item => item.type)).toEqual(['GetConstValue'])
    dialog.vm.$emit('confirm', {Type: 'SystemData', ParamName: 'UserID'}); await flushPromises()
    dialog.vm.$emit('confirm', {Type: 'GetInputParam', ParamName: 'UserID'}); await flushPromises()
    expect(f.current()).toBe(original); expect(f.view.hasEditingChanges()).toBe(false)
  })

  it.each([0, false, null, '', [], {enabled: false, count: 0, empty: null}, 'literal text'])('writes the explicitly entered typed constant %j', async value => {
    const f = await editor(), dialog = await f.open()
    dialog.getComponent(ElTabs).vm.$emit('update:modelValue', 'GetConstValue'); await flushPromises()
    dialog.getComponent(JsonTreeEditor).vm.$emit('update:documentValue', {value}); await f.confirm()
    expect(f.current()).toBe(JSON.stringify({Type: 'GetConstValue', Value: value}))
    expect(f.view.rows[0]?.['ValueFun']).toBe('')
  })

  it('rejects malformed JSON without confirming the previous value', async () => {
    const f = await editor(), dialog = await f.open()
    dialog.getComponent(ElTabs).vm.$emit('update:modelValue', 'GetConstValue'); await flushPromises()
    await f.confirm(); expect(f.view.hasEditingChanges()).toBe(false)
    const input = dialog.getComponent(JsonTreeEditor)
    input.vm.$emit('update:documentValue', {value: 0}); input.vm.$emit('update:documentValue', {wrong: false})
    await f.confirm(); expect(f.view.hasEditingChanges()).toBe(false)
    expect(new DOMWrapper(document.body).get('[role="alert"]').text()).toContain('value')
    input.vm.$emit('update:documentValue', {value: false}); await f.confirm()
    expect(f.current()).toBe('{"Type":"GetConstValue","Value":false}')
  })

  it.each([
    {Type: 'SystemData', ParamName: 'OrderId', Extra: {zero: 0, flag: false, empty: null}},
    {Type: 'GetRefData', RefTableName: 'Orders', RefFieldName: 'Id', FkFieldName: 'Id', Extra: false},
    {Type: 'GetConstValue', Value: false, Extra: {zero: 0, empty: null}},
  ])('preserves extensions for %j and cancels without writes', async value => {
    const original = JSON.stringify(value), f = await editor(original, {systemParams: [{label: '编号', value: 'OrderId'}], tables})
    await f.open(); await f.cancel(); expect(f.current()).toBe(original); expect(f.view.hasEditingChanges()).toBe(false)
    await f.open(); await f.confirm(); expect(f.current()).toBe(original)
  })

  it.each(['{broken json', '{"Type":"FutureFunction","Value":0,"Extension":null}'])('keeps %s until repair or explicit clear', async original => {
    const f = await editor(original)
    expect(f.wrapper.get('[data-function-diagnostic]').text()).toContain('原文已保留')
    await f.open(); await f.cancel(); expect(f.current()).toBe(original); expect(f.view.hasEditingChanges()).toBe(false)
    await f.wrapper.get('[data-function-clear]').trigger('click'); await flushPromises(); expect(f.current()).toBe('')
    f.view.discardEditingRows(); await flushPromises(); expect(f.current()).toBe(original)
    const dialog = await f.open(); dialog.getComponent(ElTabs).vm.$emit('update:modelValue', 'SystemData'); await flushPromises()
    dialog.getComponent(ElSelect).vm.$emit('update:modelValue', 'UserID'); await f.confirm()
    expect(f.current()).toBe('{"Type":"SystemData","ParamName":"UserID"}')
  })

  it('retains the disabled role branch without offering or executing it', async () => {
    const original = '{"Type":"GetUserMasterId","refType":"role","roleClassId":"legacy"}', f = await editor(original)
    const dialog = await f.open(), definition = dialog.props('context').definitions?.find(item => item.type === 'GetUserMasterId')
    expect(definition?.fields.map(field => field.key)).toEqual(['refType', 'depLevel', 'getChildDep'])
    expect(definition?.fields[0]?.options).toEqual([{label: '部门级别', value: 'dep'}])
    await f.confirm(); expect(new DOMWrapper(document.body).get('[role="alert"]').text()).toContain('已停用的角色分类分支')
    expect(f.current()).toBe(original); expect(f.view.hasEditingChanges()).toBe(false)
  })
})
