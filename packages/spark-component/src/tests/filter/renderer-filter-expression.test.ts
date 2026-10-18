import {afterEach, describe, expect, it, vi} from 'vitest'
import {DOMWrapper, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import ElementPlus, {ElSelect} from 'element-plus'
import {DataViewFilter, DataViewFilterCodec, getDataViewFilterFunctionDefinitions, SparkData} from '@spark-appworks/spark-data'
import {DATA_SOURCE, useSparkComponent} from '../../core'
import {PAGE_RUNTIME_SERVICES} from '../../runtime'
import {createPageRuntimeServices} from '../logger/logger-test-helpers'
import RendererFilterExpression from '../../components/containers/filter/expression/RendererFilterExpression/RendererFilterExpression.vue'
import type {RFilterExpressionProps} from '../../components/containers/filter/expression/RendererFilterExpression/RendererFilterExpression.props'
import FilterExpressionEditor from '../../components/containers/filter/expression/FilterExpressionEditor/FilterExpressionEditor.vue'
import FilterValueFunctionDialog from '../../components/containers/filter/value/FilterValueFunctionDialog/FilterValueFunctionDialog.vue'
import SparkJsonEditor from '../../components/editors/SparkJsonEditor.vue'

const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))

function fixture(format: 'tree' | 'spark-json' = 'tree', value: unknown = undefined, display: 'dialog' | 'inline' = 'dialog') {
  const ds = SparkData.createDataSet({dataSetName: 'Definitions', tables: {Definitions: {tableName: 'Definitions', resourceType: 'static-data',
    columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'predicate', type: 'json'}],
    views: {default: {rows: [{id: 'a', predicate: value}, {id: 'b', predicate: undefined}]}}}}})
  const view = ds.getView('Definitions')!
  view.commitMode = 'staged'
  view.setCurrentRowById('a')
  const disabled = ref(false)
  const editing = ref(false)
  const presentation = ref<Partial<RFilterExpressionProps>>({})
  const columns = ref<RFilterExpressionProps['columns']>([{name: 'Name', type: 'string'}])
  const functionContext = ref<RFilterExpressionProps['functionContext']>({systemParams: [{label: '单据编号', value: 'OrderId'}]})
  const host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'filter-definition-test'})
    sparkProvide(DATA_SOURCE, view)
    sparkProvide(PAGE_RUNTIME_SERVICES, createPageRuntimeServices({info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn()}))
    return () => h(RendererFilterExpression, {...presentation.value, field: 'predicate', format, display, disabled: disabled.value,
      onEditingChange: (value: boolean) => {editing.value = value},
      functionContext: functionContext.value, columns: columns.value})
  }})
  const wrapper = mount(host, {attachTo: document.body, global: {plugins: [ElementPlus], stubs: {SparkJsonEditor: true, JsonTreeEditor: true}}})
  wrappers.push(wrapper)
  return {ds, view, wrapper, disabled, editing, presentation, columns, functionContext}
}

describe('standard filter definition binding', () => {
  it.each([
    ['tree', 'dialog'], ['spark-json', 'dialog'], ['tree', 'inline'], ['spark-json', 'inline'],
  ] as const)('keeps the independent %s/%s draft when field and function candidates update', async (format, display) => {
    const tree = {field: 'Name', operator: 'eq' as const, value: 'original'}
    const original = format === 'tree' ? tree : DataViewFilterCodec.serializeStored(DataViewFilter.condition(tree))
    const f = fixture(format, original, display)
    const body = new DOMWrapper(document.body)
    if (display === 'dialog') await f.wrapper.get('[data-action="open"]').trigger('click')
    await body.get('input[aria-label="文本常量"]').setValue('draft')
    const editor = f.wrapper.getComponent(FilterExpressionEditor), instance = editor.vm.$.uid
    const oldApply = editor.vm.$.vnode.props?.['onUpdate:modelValue']
    expect(typeof oldApply).toBe('function')
    f.columns.value = [{name: 'Name', label: '异步字段名称', type: 'string'}, {name: 'Amount', type: 'number'}]
    f.functionContext.value = {inputParams: [{value: 'customer', label: '客户'}]}
    await flushPromises()
    expect(f.wrapper.getComponent(FilterExpressionEditor).vm.$.uid).toBe(instance)
    expect(body.get<HTMLInputElement>('input[aria-label="文本常量"]').element.value).toBe('draft')
    expect(f.editing.value).toBe(true)
    if (typeof oldApply === 'function') oldApply({...tree, value: 'stale'})
    expect(f.view.hasEditingChanges()).toBe(false)
    await body.get('[data-action="cancel"]').trigger('click'); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    expect(f.editing.value).toBe(false)
    if (display === 'dialog') await f.wrapper.get('[data-action="open"]').trigger('click')
    await body.get('input[aria-label="文本常量"]').setValue('applied')
    f.columns.value = [{name: 'Name', label: '最新字段名称', type: 'string'}]
    await flushPromises()
    await body.get('[data-action="apply"]').trigger('click'); await flushPromises()
    const stored = f.view.getEditingRow('a')?.['predicate']
    expect(format === 'tree' ? stored : DataViewFilterCodec.parseStored(String(stored))?.toJSON()).toEqual({...tree, value: 'applied'})
    expect(f.view.rows[0]?.['predicate']).toEqual(original)
    expect(f.view.hasEditingChanges('b')).toBe(false)
  })

  it.each(['replace', 'mutate'] as const)('preserves the nested function draft across %s candidate changes and validates current choices', async change => {
    const tree = {field: 'Name', operator: 'eq' as const, value: {Type: 'GetInputParam', ParamName: 'customer', Extra: false}}
    const f = fixture('tree', tree), body = new DOMWrapper(document.body)
    f.functionContext.value = {inputParams: [{value: 'customer', label: '客户'}, {value: 'changed', label: '新客户'}]}
    await flushPromises()
    await f.wrapper.get('[data-action="open"]').trigger('click')
    await body.findAll('button').find(button => button.text() === '更换函数')!.trigger('click'); await flushPromises()
    const fn = f.wrapper.getComponent(FilterValueFunctionDialog), instance = fn.vm.$.uid
    fn.getComponent(ElSelect).vm.$emit('update:modelValue', 'changed'); await flushPromises()
    const oldApply = f.wrapper.getComponent(FilterExpressionEditor).vm.$.vnode.props?.['onUpdate:modelValue']
    expect(typeof oldApply).toBe('function')
    if (change === 'replace') f.functionContext.value = {inputParams: [{value: 'customer', label: '客户'}]}
    else if (f.functionContext.value) f.functionContext.value.inputParams = [{value: 'customer', label: '客户'}]
    await flushPromises()
    expect(f.wrapper.getComponent(FilterValueFunctionDialog).vm.$.uid).toBe(instance)
    expect(f.wrapper.getComponent(FilterValueFunctionDialog).props('modelValue')).toBe(true)
    expect(f.wrapper.getComponent(FilterValueFunctionDialog).getComponent(ElSelect).props('modelValue')).toBe('changed')
    if (typeof oldApply === 'function') oldApply({...tree, value: 'stale'})
    await body.get('[data-function-confirm]').trigger('click'); await flushPromises()
    expect(body.get('[role="alert"]').text()).toContain('不在当前可用选项')
    expect(f.view.hasEditingChanges()).toBe(false)
    f.functionContext.value = {inputParams: []}; await flushPromises()
    expect(f.wrapper.getComponent(FilterValueFunctionDialog).props('modelValue')).toBe(true)
    expect(body.get('[data-function-confirm]').attributes('disabled')).toBeDefined()
    f.functionContext.value = {inputParams: [{value: 'changed', label: '恢复客户'}]}
    await flushPromises()
    expect(f.wrapper.getComponent(FilterValueFunctionDialog).getComponent(ElSelect).props('modelValue')).toBe('changed')
    await body.get('[data-function-confirm]').trigger('click'); await flushPromises()
    await body.get('[data-action="apply"]').trigger('click'); await flushPromises()
    expect(f.view.getEditingRow('a')?.['predicate']).toEqual({...tree, value: {...tree.value, ParamName: 'changed'}})
    expect(f.view.rows[0]?.['predicate']).toEqual(tree)
    expect(f.view.hasEditingChanges('b')).toBe(false)
  })

  it('retains removed field and invalid JSON drafts until explicit repair or cancellation', async () => {
    const original = {field: 'Name', operator: 'eq' as const, value: 'original'}
    const f = fixture('tree', original), body = new DOMWrapper(document.body)
    await f.wrapper.get('[data-action="open"]').trigger('click')
    await body.get('input[aria-label="文本常量"]').setValue('draft')
    f.columns.value = [{name: 'Amount', type: 'number'}]; await flushPromises()
    await body.get('[data-action="apply"]').trigger('click')
    expect(body.get('[role="alert"]').text()).toContain('Name')
    expect(body.get<HTMLInputElement>('input[aria-label="文本常量"]').element.value).toBe('draft')
    expect(f.view.hasEditingChanges()).toBe(false)
    f.columns.value = [{name: 'Name', type: 'string'}]; await flushPromises()
    await body.get('[data-action="json"]').trigger('click'); await body.get('[data-action="json-text"]').trigger('click')
    const invalid = '{incomplete'
    f.wrapper.getComponent(SparkJsonEditor).vm.$emit('update:modelValue', invalid); await flushPromises()
    f.functionContext.value = {inputParams: [{value: 'customer', label: '客户'}]}; await flushPromises()
    expect(f.wrapper.getComponent(SparkJsonEditor).props('modelValue')).toBe(invalid)
    await body.get('[data-action="apply"]').trigger('click')
    expect(f.view.hasEditingChanges()).toBe(false)
    await body.get('[data-action="cancel"]').trigger('click'); await flushPromises()
    expect(f.view.getEditingRow('a')?.['predicate']).toEqual(original)
    expect(f.editing.value).toBe(false)
  })

  it('keeps the reference clear action enabled when presentation options are omitted', async () => {
    const f = fixture('tree', {field: 'Name', operator: 'eq', value: 'A'})
    expect(f.wrapper.find('[data-action="clear-summary"]').exists()).toBe(true)
    await f.wrapper.get('[data-action="clear-summary"]').trigger('click'); await flushPromises()
    expect(f.view.getEditingRow('a')?.['predicate']).toBeUndefined()
    expect(f.view.rows[0]?.['predicate']).toEqual({field: 'Name', operator: 'eq', value: 'A'})
  })

  it.each(['tree', 'spark-json'] as const)('applies reference window configuration while retaining %s DataView binding and cancellation', async format => {
    const f = fixture(format), body = new DOMWrapper(document.body)
    f.presentation.value = {placeholder: '请选择业务条件', title: '业务条件', clearable: false, dialogWidth: 720, autoFullscreenBelow: 0}
    await flushPromises()
    expect(f.wrapper.get('[data-action="open"]').text()).toBe('请选择业务条件')
    await f.wrapper.get('[data-action="open"]').trigger('click'); await flushPromises()
    const dialog = body.get('[role="dialog"][aria-label="业务条件"]')
    expect(dialog.get('.el-dialog').attributes('style')).toContain('--el-dialog-width: 720px')
    expect(dialog.get('.el-dialog').classes()).not.toContain('is-fullscreen')
    expect(dialog.find('[data-action="clear"]').exists()).toBe(false)
    await dialog.get('[data-action="cancel"]').trigger('click'); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    await f.wrapper.get('[data-action="open"]').trigger('click'); await flushPromises()
    await body.get('[data-action="json"]').trigger('click'); await body.get('[data-action="json-text"]').trigger('click')
    const tree = {field: 'Name', operator: 'eq' as const, value: 'B'}
    f.wrapper.getComponent(SparkJsonEditor).vm.$emit('update:modelValue', JSON.stringify(tree)); await flushPromises()
    await body.get('[data-action="apply"]').trigger('click'); await flushPromises()
    const stored = f.view.getEditingRow('a')?.['predicate']
    expect(format === 'tree' ? stored : DataViewFilterCodec.parseStored(String(stored))?.toJSON()).toEqual(tree)
    expect(f.view.rows[0]?.['predicate']).toBeUndefined()
    expect(f.view.hasEditingChanges('b')).toBe(false)
    expect(f.wrapper.find('[data-action="clear-summary"]').exists()).toBe(false)
    f.presentation.value = {placeholder: undefined, title: undefined, clearable: undefined, dialogWidth: undefined, autoFullscreenBelow: undefined}
    await flushPromises()
    expect(f.wrapper.find('[data-action="clear-summary"]').exists()).toBe(true)
    await f.wrapper.get('[data-action="clear-summary"]').trigger('click'); await flushPromises()
    expect(f.view.getEditingRow('a')?.['predicate']).toBe(format === 'tree' ? undefined : '')
    expect(f.view.rows[0]?.['predicate']).toBeUndefined()
  })

  it('exposes inline editing and releases unapplied drafts after cancellation, row switch and loss of access', async () => {
    const f = fixture('spark-json', '{"Type":"cond","Field":"Name","Operator":"equal","ValueFun":{"Type":"GetConstValue","Value":"A"}}', 'inline')
    expect(f.wrapper.find('[data-action="open"]').exists()).toBe(false)
    await f.wrapper.get('input[aria-label="文本常量"]').setValue('B'); await flushPromises()
    expect(f.editing.value).toBe(true)
    expect(f.view.hasEditingChanges()).toBe(false)
    await f.wrapper.get('[data-action="cancel"]').trigger('click')
    expect(f.editing.value).toBe(false)
    await f.wrapper.get('input[aria-label="文本常量"]').setValue('C'); await flushPromises()
    await f.wrapper.get('[data-action="apply"]').trigger('click'); await flushPromises()
    expect(f.editing.value).toBe(false)
    expect(DataViewFilterCodec.parseStored(String(f.view.getEditingRow('a')?.['predicate']))?.toJSON()).toEqual({field: 'Name', operator: 'eq', value: 'C'})
    await f.wrapper.get('input[aria-label="文本常量"]').setValue('stale'); await flushPromises()
    const old = f.wrapper.getComponent(FilterExpressionEditor)
    f.view.setCurrentRowById('b'); await flushPromises()
    expect(f.editing.value).toBe(false)
    old.vm.$emit('update:modelValue', {field: 'Name', operator: 'eq', value: 'stale'})
    expect(f.view.hasEditingChanges('b')).toBe(false)
    f.view.setCurrentRowById('a'); await flushPromises()
    await f.wrapper.get('input[aria-label="文本常量"]').setValue('denied'); await flushPromises()
    f.disabled.value = true; await flushPromises()
    expect(f.editing.value).toBe(false)
    expect(f.wrapper.get('[data-action="apply"]').attributes('disabled')).toBeDefined()
    expect(DataViewFilterCodec.parseStored(String(f.view.getEditingRow('a')?.['predicate']))?.toJSON()).toEqual({field: 'Name', operator: 'eq', value: 'C'})
  })

  it('retains built-in system choices and the department-only function catalog at the standard entry', () => {
    const f = fixture()
    const context = f.wrapper.findComponent(FilterExpressionEditor).props('functionContext') ?? {}
    const definitions = getDataViewFilterFunctionDefinitions(context)
    const system = definitions.find(item => item.type === 'SystemData')!.fields.find(field => field.key === 'ParamName')!
    const options = typeof system.options === 'function' ? system.options({Type: 'SystemData'}, context) : system.options ?? []
    expect(options.map(option => option.value)).toEqual(expect.arrayContaining(['UserID', 'OrderId']))
    const host = definitions.find(item => item.type === 'GetUserMasterId')!
    expect(host.fields.some(field => field.key === 'roleClassId')).toBe(false)
    expect(host.fields.find(field => field.key === 'refType')?.options).toEqual([{label: '部门级别', value: 'dep'}])
  })

  it.each(['tree', 'spark-json'] as const)('writes %s through the original DataView editing domain', async format => {
    const f = fixture(format)
    const body = new DOMWrapper(document.body)
    await f.wrapper.get('[data-action="open"]').trigger('click')
    await body.get('[data-action="json"]').trigger('click'); await body.get('[data-action="json-text"]').trigger('click')
    const tree = {field: 'Name', operator: 'eq', value: {Type: 'SystemData', ParamName: 'UserID'}}
    f.wrapper.getComponent(SparkJsonEditor).vm.$emit('update:modelValue', JSON.stringify(tree)); await flushPromises()
    await body.get('[data-action="apply"]').trigger('click')
    await flushPromises()
    const stored = f.view.getEditingRow('a')?.['predicate']
    expect(format === 'tree' ? stored : DataViewFilterCodec.parseStored(typeof stored === 'string' ? stored : '')?.toJSON()).toEqual(tree)
    expect(f.view.rows[0]?.['predicate']).toBeUndefined()
    expect(f.view.filterExpression).toBeUndefined()
    expect(f.view.hasEditingChanges('b')).toBe(false)
  })

  it('cancels, retains invalid input and rejects a late apply after switching rows', async () => {
    const f = fixture('tree', {field: 'Name', operator: 'eq', value: false})
    const body = new DOMWrapper(document.body)
    await f.wrapper.get('[data-action="open"]').trigger('click')
    await body.get('[data-action="cancel"]').trigger('click')
    expect(f.view.hasEditingChanges()).toBe(false)
    const oldEditor = f.wrapper.findComponent(FilterExpressionEditor)
    f.view.setCurrentRowById('b')
    await flushPromises()
    oldEditor.vm.$emit('update:modelValue', {field: 'Name', operator: 'eq', value: 'stale'})
    expect(f.view.hasEditingChanges()).toBe(false)
    f.disabled.value = true
    await flushPromises()
    expect(f.wrapper.get('[data-action="open"]').attributes('disabled')).toBeDefined()
  })

  it('does not turn a corrupt stored definition into an empty editable filter', () => {
    const f = fixture('spark-json', '{broken')
    expect(f.wrapper.get('[role="alert"]').text()).toContain('JSON')
    expect(f.wrapper.find('[data-action="open"]').exists()).toBe(false)
    expect(f.view.getEditingRow('a')?.['predicate']).toBe('{broken')
    expect(f.view.hasEditingChanges()).toBe(false)
  })
})
