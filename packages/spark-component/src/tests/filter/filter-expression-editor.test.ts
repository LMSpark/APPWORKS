import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, DOMWrapper, flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import ElementPlus, { ElOption, ElSelect, ElInput, ElInputNumber, ElDatePicker, ElRadioGroup, ElTabs } from 'element-plus'
import { DataViewFilter, SparkData } from '@spark-appworks/spark-data'
import { useSparkComponent, DATA_SOURCE } from '../../core'
import RendererFilter from '../../components/containers/zones/RendererFilter.vue'
import { PAGE_RUNTIME_SERVICES } from '../../runtime'
import { createPageRuntimeServices } from '../logger/logger-test-helpers'
import FilterExpressionEditor from '../../components/containers/filter/expression/FilterExpressionEditor/FilterExpressionEditor.vue'
import SparkJsonEditor from '../../components/editors/SparkJsonEditor.vue'
import FilterExpressionGroup from '../../components/containers/filter/expression/FilterExpressionGroup/FilterExpressionGroup.vue'
import FilterValueFunctionDialog from '../../components/containers/filter/value/FilterValueFunctionDialog/FilterValueFunctionDialog.vue'
import { FilterExpressionEditorDraft } from '../../components/containers/filter/expression/FilterExpressionEditor/FilterExpressionEditor.props'
import type {JSONEditorPropsOptional} from 'vanilla-jsoneditor'
import VXETable, {VxeTable} from 'vxe-table'
import JsonTreeEditor from '../../components/editors/JsonTreeEditor.vue'

const fields = [{ name: 'Name', type: 'text' }, { name: 'Amount', type: 'number' }] as const
const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })

it('protects function JSON wrappers while confirming a native scalar value through the real tree', async () => {
  const wrapper = mount(FilterValueFunctionDialog, {attachTo: document.body, props: {
    modelValue: true, context: {definitions: [{type: 'GetConstValue', label: '常量', fields: [{key: 'Value', label: '常量值', control: 'json', required: true}]}]}, value: {Type: 'GetConstValue', Value: {old: 1}, Extra: {keep: true}},
  }, global: {plugins: [ElementPlus, VXETable], stubs: {JsonTreeEditor: false}}})
  wrappers.push(wrapper); await flushPromises()
  const tree = wrapper.getComponent(JsonTreeEditor), table = tree.getComponent(VxeTable)
  const actions = () => tree.findAll('button').filter(button => ['加子项', '加同级', '删除'].includes(button.text())).map(button => button.text())
  expect(actions()).toEqual([])
  table.vm.$emit('current-row-change', {newValue: table.props('data')?.find(row => row.path.length === 1)}); await flushPromises()
  expect(actions()).toEqual(['加子项'])
  tree.findAllComponents(ElSelect).find(control => control.props('modelValue') === 'object')!.vm.$emit('update:modelValue', 'boolean'); await flushPromises()
  await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click'); await flushPromises()
  expect(wrapper.emitted('confirm')).toEqual([[{Type: 'GetConstValue', Value: false, Extra: {keep: true}}]])
})

it.each(['omitted', undefined, true, false] as const)('applies filter input according to autoQuery=%s and releases only its own query property', async automatic => {
  const ds = SparkData.fromJson({dataSetName: 'filter-timing', tables: {Orders: {
    columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'Name', type: 'string'}],
    api: {list: {url: '/orders', method: 'GET'}}, views: {default: {queryConfig: {outputType: 'Table'}}},
  }}})
  const view = ds.getView('Orders')!
  const list = vi.spyOn(view.crud, 'list').mockResolvedValue({success: true, data: [{id: 'one', Name: 'A'}], total: 1})
  const mode = ref(automatic)
  const host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'filter-timing-test'})
    sparkProvide(DATA_SOURCE, view)
    sparkProvide(PAGE_RUNTIME_SERVICES, createPageRuntimeServices({info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn()}))
    return () => h(RendererFilter, {...mode.value === 'omitted' ? {} : {autoQuery: mode.value}, children: [{type: 'r-text', props: {field: 'Name'}}]})
  }})
  const wrapper = mount(host, {global: {plugins: [ElementPlus], stubs: {JsonTreeEditor: true}}}); wrappers.push(wrapper)
  try {
    const filter = wrapper.getComponent(RendererFilter)
    filter.vm.filterModel['Name'] = 'A'
    await flushPromises()
    if (automatic === false) {
      expect(list).not.toHaveBeenCalled()
      expect(view.filterExpression).toBeUndefined()
      await filter.findAll('button').find(button => button.text() === '查询')!.trigger('click'); await flushPromises()
    }
    expect(list).toHaveBeenCalledOnce()
    expect(view.filterExpression).toEqual({field: 'Name', operator: 'contains', value: 'A'})
    mode.value = false; await flushPromises()
    filter.vm.filterModel['Name'] = 'B'; await flushPromises()
    expect(list).toHaveBeenCalledOnce()
    mode.value = true; await flushPromises()
    expect(list).toHaveBeenCalledTimes(2)
    expect(view.filterExpression).toMatchObject({value: 'B'})
    view.queryConfig = {...view.queryConfig, maxRows: 20}
    wrapper.unmount()
    expect(view.queryConfig).toEqual({outputType: 'Table', maxRows: 20})
  } finally {wrapper.unmount(); ds.destroy()}
})

function editor(modelValue?: ReturnType<DataViewFilter['toJSON']>) {
  const wrapper = mount(FilterExpressionEditor, {
    attachTo: document.body,
    props: { modelValue, columns: [{ name: 'Name', type: 'string' }, { name: 'Amount', type: 'number' }] },
    global: { plugins: [ElementPlus], stubs: {SparkJsonEditor: true, JsonTreeEditor: true} },
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('lazy filter field catalogues', () => {
  const value = {Type: 'GetRefData', RefTableName: 'Orders', RefFieldName: 'name', FkFieldName: 'id'}
  function pendingFields() {
    let resolve!: (fields: {name: string}[]) => void
    const load = vi.fn(() => new Promise<{name: string}[]>(accept => {resolve = accept}))
    return {load, resolve: (fields: {name: string}[]) => resolve(fields)}
  }

  it('retains every model choice, loads selected fields and rejects late results from the previous model', async () => {
    const orders = pendingFields(), customers = pendingFields(), untouched = pendingFields()
    const wrapper = mount(FilterValueFunctionDialog, {attachTo: document.body, props: {modelValue: true, value,
      context: {tables: [{name: 'Orders', loadFields: orders.load}, {name: 'Customers', loadFields: customers.load}, {name: 'Untouched', loadFields: untouched.load}]}},
      global: {plugins: [ElementPlus]}}); wrappers.push(wrapper); await flushPromises()
    const selects = () => wrapper.findAllComponents(ElSelect)
    expect(orders.load).toHaveBeenCalledOnce()
    expect(selects()[0]!.findAllComponents(ElOption).map(item => item.props('value'))).toEqual(['Orders', 'Customers', 'Untouched'])
    await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    selects()[0]!.vm.$emit('update:modelValue', 'Customers'); await flushPromises()
    expect(customers.load).toHaveBeenCalledOnce(); expect(untouched.load).not.toHaveBeenCalled()
    customers.resolve([{name: 'id'}, {name: 'name'}]); await flushPromises()
    orders.resolve([{name: 'wrong'}]); await flushPromises()
    expect(selects()[1]!.findAllComponents(ElOption).map(item => item.props('value'))).toEqual(['id', 'name'])
    await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click')
    expect(wrapper.emitted('confirm')).toEqual([[{...value, RefTableName: 'Customers'}]])
  })

  it('preserves the function draft on directory failure and retries explicitly', async () => {
    const loadFields = vi.fn().mockRejectedValueOnce(new Error('目录读取失败')).mockResolvedValueOnce([{name: 'id'}, {name: 'name'}])
    const wrapper = mount(FilterValueFunctionDialog, {attachTo: document.body, props: {modelValue: true, value,
      context: {tables: [{name: 'Orders', loadFields}]}}, global: {plugins: [ElementPlus]}})
    wrappers.push(wrapper); await flushPromises()
    const body = new DOMWrapper(document.body)
    expect(body.text()).toContain('目录读取失败')
    expect(wrapper.findAllComponents(ElSelect)[1]!.props('modelValue')).toBe('name')
    await body.get('[data-function-retry]').trigger('click'); await flushPromises()
    await body.get('[data-function-confirm]').trigger('click')
    expect(wrapper.emitted('confirm')).toEqual([[value]])
  })

  it.each(['close', 'context', 'unmount'] as const)('does not accept old function fields after %s', async change => {
    const fields = pendingFields()
    const wrapper = mount(FilterValueFunctionDialog, {attachTo: document.body, props: {modelValue: true, value,
      context: {tables: [{name: 'Orders', loadFields: fields.load}]}}, global: {plugins: [ElementPlus]}})
    wrappers.push(wrapper); await flushPromises()
    expect(fields.load).toHaveBeenCalledOnce()
    const button = wrapper.findAllComponents({name: 'GlobalElButtonStub'}).find(item => item.text() === '保存')!
    const save = button.vm.$.vnode.props?.['onClick']
    if (change === 'close') await wrapper.setProps({modelValue: false})
    if (change === 'context') await wrapper.setProps({context: {tables: [{name: 'Orders', fields: []}]}})
    if (change === 'unmount') wrapper.unmount()
    fields.resolve([{name: 'id'}, {name: 'name'}]); await flushPromises()
    if (typeof save === 'function') save()
    if (change === 'context') {
      expect(wrapper.findAllComponents(ElSelect)[1]!.findAllComponents(ElOption)).toEqual([])
      await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click')
    }
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it.each(['tree', 'json'] as const)('validates %s with only referenced fields before emitting the original tree', async mode => {
    const tree = {field: 'Name', operator: 'eq' as const, value}
    const wrapper = editor(tree), fields = pendingFields(), unused = vi.fn()
    await wrapper.setProps({functionContext: {tables: [{name: 'Orders', loadFields: fields.load}, {name: 'Unused', loadFields: unused}]}})
    await wrapper.get('[data-action="open"]').trigger('click'); await flushPromises()
    const body = new DOMWrapper(document.body)
    if (mode === 'json') {await body.get('[data-action="json"]').trigger('click'); await flushPromises()}
    const loadsBefore = fields.load.mock.calls.length
    if (mode === 'json' && loadsBefore) {fields.resolve([{name: 'id'}, {name: 'name'}]); await flushPromises()}
    await body.get('[data-action="apply"]').trigger('click'); await flushPromises()
    expect(fields.load).toHaveBeenCalled()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    fields.resolve([{name: 'id'}, {name: 'name'}]); await flushPromises()
    expect(unused).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:modelValue')).toEqual([[tree]])
  })

  it.each(['cancel', 'context', 'draft', 'draft-reverted', 'unmount'] as const)('rejects delayed filter application after %s', async change => {
    const tree = {field: 'Name', operator: 'eq' as const, value}
    const wrapper = editor(tree), fields = pendingFields()
    await wrapper.setProps({functionContext: {tables: [{name: 'Orders', loadFields: fields.load}]}})
    await wrapper.get('[data-action="open"]').trigger('click'); await flushPromises()
    const body = new DOMWrapper(document.body)
    await body.get('[data-action="apply"]').trigger('click'); await flushPromises()
    expect(fields.load).toHaveBeenCalledOnce()
    if (change === 'cancel') await body.get('[data-action="cancel"]').trigger('click')
    if (change === 'context') await wrapper.setProps({functionContext: {tables: []}})
    if (change === 'draft') wrapper.getComponent(FilterExpressionGroup).props('group').children.splice(0)
    if (change === 'draft-reverted') {
      const group = wrapper.getComponent(FilterExpressionGroup).props('group')
      const previous = group.children.splice(0)
      group.children.push(...previous)
    }
    if (change === 'unmount') wrapper.unmount()
    fields.resolve([{name: 'id'}, {name: 'name'}]); await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('retains a raw filter and retries after a directory error without emitting a partial value', async () => {
    const tree = {field: 'Name', operator: 'eq' as const, value}
    const loadFields = vi.fn().mockRejectedValueOnce(new Error('model unavailable')).mockResolvedValueOnce([{name: 'id'}, {name: 'name'}])
    const wrapper = editor(tree)
    await wrapper.setProps({functionContext: {tables: [{name: 'Orders', loadFields}]}})
    await wrapper.get('[data-action="open"]').trigger('click'); await flushPromises()
    const body = new DOMWrapper(document.body)
    await body.get('[data-action="apply"]').trigger('click'); await flushPromises()
    expect(body.text()).toContain('model unavailable')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.props('modelValue')).toEqual(tree)
    await body.get('[data-action="apply"]').trigger('click'); await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([[tree]])
  })
})

describe('full public filter editor', () => {
  it('offers formal query fields without framework or local computed columns', async () => {
    const ds = SparkData.fromJson({dataSetName: 'filter-field-catalog', tables: {Orders: {
      columns: [{name: 'id', type: 'string', isPrimaryKey: true},
        {name: 'title', type: 'string', label: '订单标题'},
        {name: 'localTitle', type: 'string', computeExpression: 'title + id'}], views: {default: {}},
    }}})
    const wrapper = editor({field: 'title', operator: 'eq', value: 'A'})
    try {
      const columns = ds.getView('Orders')!.columns
      expect(columns.some(column => column.name === '_pk' && column.isComputed)).toBe(true)
      await wrapper.setProps({columns})
      await wrapper.get('[data-action="open"]').trigger('click'); await flushPromises()
      const field = wrapper.findAllComponents(ElSelect).find(item => item.props('ariaLabel') === '过滤字段')!
      expect(field.findAllComponents(ElOption).map(option => option.props('value'))).toEqual(['id', 'title'])
      await new DOMWrapper(document.body).get('[data-action="apply"]').trigger('click')
      expect(wrapper.emitted('update:modelValue')).toEqual([[{field: 'title', operator: 'eq', value: 'A'}]])
    } finally {wrapper.unmount(); ds.destroy()}
  })

  it.each(['_pk', 'localTitle'])('preserves invalid stored %s for correction and rejects tree or JSON application', async field => {
    const original = {field, operator: 'eq' as const, value: 'A'}
    const wrapper = editor(original)
    await wrapper.setProps({columns: [{name: 'Name', type: 'string'},
      {name: '_pk', type: 'string', isComputed: true},
      {name: 'localTitle', type: 'string', computeExpression: 'Name'}]})
    await wrapper.get('[data-action="open"]').trigger('click'); await flushPromises()
    const body = new DOMWrapper(document.body)
    await body.get('[data-action="apply"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(body.get('[role="alert"]').text()).toContain(field)
    expect(wrapper.props('modelValue')).toEqual(original)
    expect(new FilterExpressionEditorDraft().checkInput(JSON.stringify(original), {
      fields: FilterExpressionEditorDraft.fields(wrapper.props('columns')),
    }).ok).toBe(false)
    await body.get('[data-action="cancel"]').trigger('click')
    expect(wrapper.props('modelValue')).toEqual(original)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('configures the reference standalone window without changing the filter draft', async () => {
    const wrapper = editor(), body = new DOMWrapper(document.body)
    await wrapper.setProps({placeholder: '请设置订单范围', title: '订单范围', clearable: false, dialogWidth: 640, autoFullscreenBelow: 0})
    expect(wrapper.get('[data-action="open"]').text()).toBe('请设置订单范围')
    expect(wrapper.get('[data-action="open"]').attributes('aria-label')).toBe('请设置订单范围')
    await wrapper.setProps({modelValue: {field: 'Name', operator: 'eq', value: 'A'}})
    expect(wrapper.find('[data-action="clear-summary"]').exists()).toBe(false)
    await wrapper.get('[data-action="open"]').trigger('click'); await flushPromises()
    const dialog = body.get('[role="dialog"][aria-label="订单范围"]')
    expect(dialog.get('.el-dialog').attributes('style')).toContain('--el-dialog-width: 640px')
    expect(dialog.get('.el-dialog').classes()).not.toContain('is-fullscreen')
    expect(dialog.find('[data-action="clear"]').exists()).toBe(false)
    await wrapper.findAllComponents(ElInput).find(input => input.props('ariaLabel') === '文本常量')!.setValue('B')
    await wrapper.setProps({title: '修改范围', dialogWidth: '75%', autoFullscreenBelow: 10000}); await flushPromises()
    expect(body.get('[role="dialog"][aria-label="修改范围"]').get('.el-dialog').classes()).toContain('is-fullscreen')
    await body.get('[data-action="apply"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[{field: 'Name', operator: 'eq', value: 'B'}]])
    expect(wrapper.props('modelValue')).toEqual({field: 'Name', operator: 'eq', value: 'A'})
  })

  it('uses defaults for undefined presentation options and preserves explicit empty text and false', async () => {
    const wrapper = editor(), body = new DOMWrapper(document.body)
    await wrapper.setProps({placeholder: '', title: '', clearable: false, dialogWidth: '70%', autoFullscreenBelow: 0})
    expect(wrapper.get('[data-action="open"]').text()).toBe('')
    await wrapper.setProps({placeholder: undefined, title: undefined, clearable: undefined, dialogWidth: undefined, autoFullscreenBelow: undefined})
    expect(wrapper.get('[data-action="open"]').text()).toBe('空')
    await wrapper.setProps({modelValue: {field: 'Name', operator: 'eq', value: 'A'}})
    expect(wrapper.find('[data-action="clear-summary"]').exists()).toBe(true)
    await wrapper.get('[data-action="open"]').trigger('click'); await flushPromises()
    const dialog = body.get('[role="dialog"][aria-label="过滤设置"]')
    expect(dialog.get('.el-dialog').attributes('style')).toContain('--el-dialog-width: 980px')
    expect(dialog.find('[data-action="clear"]').exists()).toBe(true)
    await dialog.get('[data-action="cancel"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('uses independent fullscreen state for the reference filter and function windows without losing drafts', async () => {
    const wrapper = editor({field: 'Name', operator: 'eq', value: 'A'}), body = new DOMWrapper(document.body)
    await wrapper.get('[data-action="open"]').trigger('click'); await flushPromises()
    let dialog = body.get('[role="dialog"][aria-label="过滤设置"]')
    await wrapper.findAllComponents(ElInput).find(input => input.props('ariaLabel') === '文本常量')!.setValue('B')
    await dialog.get('[aria-label="全屏"]').trigger('click'); await flushPromises()
    expect(dialog.get('.el-dialog').classes()).toContain('is-fullscreen')
    await dialog.get('[aria-label="使用服务端值函数"]').trigger('click'); await flushPromises()
    const fnDialog = body.get('[role="dialog"][aria-label="值函数设置"]')
    expect(fnDialog.get('.el-dialog').classes()).not.toContain('is-fullscreen')
    await fnDialog.get('[aria-label="全屏"]').trigger('click'); await flushPromises()
    expect(fnDialog.get('.el-dialog').classes()).toContain('is-fullscreen')
    await fnDialog.findAll('button').find(button => button.text() === '取消')!.trigger('click')
    await dialog.get('[data-action="apply"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({field: 'Name', operator: 'eq', value: 'B'})
    await wrapper.setProps({modelValue: {field: 'Name', operator: 'eq', value: 'B'}}); await flushPromises()
    await wrapper.get('[data-action="open"]').trigger('click'); await flushPromises()
    dialog = body.get('[role="dialog"][aria-label="过滤设置"]')
    expect(dialog.get('.el-dialog').classes()).not.toContain('is-fullscreen')
  })

  it('allows readonly inspection but blocks direct and stale mutations', async () => {
    const original = {field: 'Name', operator: 'eq' as const, value: 'A'}
    const wrapper = editor(original), body = new DOMWrapper(document.body)
    await wrapper.get('[data-action="open"]').trigger('click'); await flushPromises()
    await body.get('[aria-label="使用服务端值函数"]').trigger('click'); await flushPromises()
    const stale = wrapper.getComponent(FilterValueFunctionDialog)
    await wrapper.setProps({readonly: true}); await flushPromises()
    stale.vm.$emit('confirm', {Type: 'GetConstValue', Value: 'stale'}); await flushPromises()
    await wrapper.get('[data-action="open"]').trigger('click'); await flushPromises()
    expect(wrapper.get('[data-action="open"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-action="clear-summary"]').exists()).toBe(false)
    expect(body.find('[data-action="apply"]').exists()).toBe(false)
    expect(body.find('[data-action="clear"]').exists()).toBe(false)
    expect(body.get('[aria-label="使用服务端值函数"]').attributes('disabled')).toBeDefined()
    await body.get('[data-action="json"]').trigger('click'); await body.get('[data-action="json-text"]').trigger('click')
    const json = wrapper.getComponent(SparkJsonEditor)
    expect(json.props('readOnly')).toBe(true)
    json.vm.$emit('update:modelValue', '{"field":"Name","operator":"eq","value":"forbidden"}')
    await body.get('[data-action="cancel"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.props('modelValue')).toEqual(original)
  })
  it('opens the reference standalone editor from a grouped expression summary and cancels without changing the value', async () => {
    const tree = {logic: 'or' as const, filters: [{field: 'Name', operator: 'eq' as const, value: 'A'},
      {logic: 'and' as const, filters: [{field: 'Amount', operator: 'gte' as const, value: 0}, {field: 'Name', operator: 'eq' as const, value: ''}]}]}
    const wrapper = editor(tree), body = new DOMWrapper(document.body)
    expect(wrapper.get('[data-action="open"]').text()).toBe('Name 等于 "A" 或者 （Amount 大于等于 0 并且 Name 等于 ""）')
    await wrapper.get('[data-action="open"]').trigger('click')
    expect(body.get('[role="dialog"]').attributes('aria-label')).toBe('过滤设置')
    expect(wrapper.findAllComponents(FilterExpressionGroup)).toHaveLength(2)
    await wrapper.findAllComponents(ElInput).find(input => input.props('ariaLabel') === '文本常量')!.setValue('changed')
    await body.get('[data-action="cancel"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.get('[data-action="open"]').text()).toContain('"A"')
  })

  it('uses the reference empty summary and explicit clear without opening a second editor', async () => {
    const wrapper = editor()
    expect(wrapper.get('[data-action="open"]').text()).toBe('空')
    expect(wrapper.find('[data-action="clear-summary"]').exists()).toBe(false)
    await wrapper.setProps({modelValue: {field: 'Name', operator: 'eq', value: 'kept'}})
    await wrapper.get('[data-action="clear-summary"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[undefined]])
  })

  it('restores reference field labels, Chinese operators and typed inputs without requiring JSON', async () => {
    const wrapper = mount(FilterExpressionEditor, {props: {display: 'inline', columns: [
      {name: 'Name', label: '名称', type: 'string'}, {name: 'Amount', label: '金额', type: 'number'},
      {name: 'Enabled', type: 'boolean'}, {name: 'At', type: 'datetime'},
    ], modelValue: {logic: 'and', filters: [
      {field: 'Name', operator: 'eq', value: 'A'}, {field: 'Amount', operator: 'gte', value: 0},
      {field: 'Enabled', operator: 'eq', value: false}, {field: 'At', operator: 'eq', value: '2026-10-12 12:00:00'},
    ]}}, global: {plugins: [ElementPlus], stubs: {SparkJsonEditor: true, JsonTreeEditor: true}}}); wrappers.push(wrapper)
    await flushPromises()
    expect(wrapper.findComponent(SparkJsonEditor).exists()).toBe(false)
    expect(wrapper.getComponent(ElRadioGroup).props('modelValue')).toBe('and')
    const labels = wrapper.findAllComponents(ElSelect).filter(s => s.props('ariaLabel') === '过滤字段')
    expect(labels[0]!.text()).toContain('名称')
    expect(wrapper.text()).toContain('大于等于')
    wrapper.getComponent(ElInput).vm.$emit('update:modelValue', 'B')
    wrapper.getComponent(ElInputNumber).vm.$emit('update:modelValue', 2)
    expect(wrapper.getComponent(ElDatePicker).props('type')).toBe('datetime')
    const flag = wrapper.findAllComponents(ElSelect).find(s => s.props('ariaLabel') === '布尔常量')!
    expect(flag.props('modelValue')).toBe(false)
    await wrapper.get('[data-action="apply"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({logic: 'and', filters: [
      {field: 'Name', operator: 'eq', value: 'B'}, {field: 'Amount', operator: 'gte', value: 2},
      {field: 'Enabled', operator: 'eq', value: false}, {field: 'At', operator: 'eq', value: '2026-10-12 12:00:00'},
    ]})
  })

  it('edits reference list values and value functions while preserving native types and cancel semantics', async () => {
    const wrapper = editor({field: 'Amount', operator: 'in', value: [0, 2]})
    await wrapper.get('[data-action="open"]').trigger('click')
    const values = wrapper.findAllComponents(ElSelect).find(s => s.props('ariaLabel') === '列表常量')!
    expect(values.props('multiple')).toBe(true)
    values.vm.$emit('update:modelValue', [0, '3']); await flushPromises()
    await new DOMWrapper(document.body).get('[data-action="apply"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({field: 'Amount', operator: 'in', value: [0, 3]})
    await wrapper.setProps({modelValue: {field: 'Name', operator: 'eq', value: {Type: 'SystemData', ParamName: 'UserID', Extra: false}}})
    await wrapper.get('[data-action="open"]').trigger('click')
    expect(wrapper.findComponent(SparkJsonEditor).exists()).toBe(false)
    const group = wrapper.getComponent(FilterExpressionGroup)
    expect(group.text()).toContain('更换函数')
    await group.findAll('button').find(b => b.text() === '更换函数')!.trigger('click')
    expect(wrapper.getComponent(FilterValueFunctionDialog).getComponent(ElTabs).props('modelValue')).toBe('SystemData')
    await new DOMWrapper(document.body).get('[data-action="cancel"]').trigger('click')
    expect(wrapper.props('modelValue')).toEqual({field: 'Name', operator: 'eq', value: {Type: 'SystemData', ParamName: 'UserID', Extra: false}})
  })
  it('edits condition JSON with the existing topic while preserving invalid and native values', async () => {
    const wrapper = editor({field: 'Amount', operator: 'eq', value: 0})
    await wrapper.get('[data-action="open"]').trigger('click')
    await new DOMWrapper(document.body).get('[aria-label="切换条件值 JSON"]').trigger('click')
    const json = wrapper.getComponent(SparkJsonEditor)
    expect(json.props('modelValue')).toBe('0')
    expect(json.props('mode')).toBe('text')
    json.vm.$emit('update:modelValue', '{invalid'); await flushPromises()
    await new DOMWrapper(document.body).get('[data-action="apply"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(json.props('modelValue')).toBe('{invalid')
    expect(new DOMWrapper(document.body).get('[role="alert"]').text()).toContain('条件值不是有效 JSON')
    json.vm.$emit('update:modelValue', '0'); await flushPromises()
    expect(new DOMWrapper(document.body).get('[role="alert"]').text()).toContain('条件值不是有效 JSON')
    for (const value of [0, false, null, '', []]) {
      json.vm.$emit('update:modelValue', JSON.stringify(value)); await flushPromises()
      await new DOMWrapper(document.body).get('[data-action="apply"]').trigger('click')
      expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({field: 'Amount', operator: 'eq', value})
    }
  })

  it('keeps field changes lossless and applies reference group limits at the actual controls', async () => {
    const draft = new FilterExpressionEditorDraft({field: 'Name', operator: 'contains', value: 'kept'})
    const wrapper = mount(FilterExpressionGroup, {props: {group: draft.root, draft, fields, depth: 0, maxDepth: 0, maxRules: 1},
      global: {plugins: [ElementPlus], stubs: {SparkJsonEditor: true, JsonTreeEditor: true}}}); wrappers.push(wrapper)
    wrapper.findAllComponents(ElSelect).find(s => s.props('ariaLabel') === '过滤字段')!.vm.$emit('update:modelValue', 'Amount')
    await flushPromises()
    expect(wrapper.getComponent(SparkJsonEditor).props('modelValue')).toBe('"kept"')
    expect(draft.root.children[0]).toMatchObject({field: 'Amount', operator: 'contains', valueText: '"kept"'})
    expect(draft.check({fields}).ok).toBe(false)
    for (const label of ['添加条件', '添加分组']) expect(wrapper.findAll('button').find(b => b.text() === label)!.attributes('disabled')).toBeDefined()
  })

  it.each(['disabled', 'removed', 'mode', 'group', 'unmount'] as const)('rejects a captured condition JSON update after %s', async change => {
    const draft = new FilterExpressionEditorDraft({field: 'Name', operator: 'eq', value: 'original'})
    const node = draft.root.children[0]!
    if (node.kind !== 'condition') throw new Error('missing condition')
    const wrapper = mount(FilterExpressionGroup, {props: {group: draft.root, draft, fields, depth: 0, maxDepth: 3, maxRules: 50},
      global: {plugins: [ElementPlus], stubs: {SparkJsonEditor: true, JsonTreeEditor: true}}})
    wrappers.push(wrapper)
    await wrapper.get('[aria-label="切换条件值 JSON"]').trigger('click')
    const json = wrapper.getComponent(SparkJsonEditor), late = json.vm.$.vnode.props?.['onUpdate:modelValue']
    expect(typeof late).toBe('function')
    if (change === 'disabled') {await wrapper.setProps({disabled: true}); await wrapper.setProps({disabled: false})}
    if (change === 'removed') {draft.root.children.splice(0, 1); await flushPromises()}
    if (change === 'mode') {
      await wrapper.get('[aria-label="切换条件值 JSON"]').trigger('click')
      await wrapper.get('[aria-label="切换条件值 JSON"]').trigger('click')
    }
    if (change === 'group') {
      const replacement = new FilterExpressionEditorDraft({field: 'Name', operator: 'eq', value: 'replacement'})
      await wrapper.setProps({group: replacement.root, draft: replacement})
    }
    if (change === 'unmount') wrapper.unmount()
    if (typeof late === 'function') late('"stale"')
    expect(node.valueText).toBe('"original"')
    expect(wrapper.emitted('change')).toBeUndefined()
  })
  it('flushes the existing JSON topic pending text on blur before applying the filter', async () => {
    let settings: JSONEditorPropsOptional | undefined
    let pending = ''
    const validate = vi.fn(() => {
      if (!pending) return undefined
      const next = pending; pending = ''
      settings?.onChange?.({text: next}, {text: ''}, {contentErrors: undefined, patchResult: undefined})
      return undefined
    })
    vi.doMock('vanilla-jsoneditor', () => ({Mode: {text: 'text', tree: 'tree', table: 'table'},
      createJSONEditor: ({props}: {props: JSONEditorPropsOptional}) => {
        settings = props
        return {validate, updateProps: (props: JSONEditorPropsOptional) => {settings = props}, destroy: async () => {}}
      },
    }))
    vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
    const wrapper = mount(FilterExpressionEditor, {props: {display: 'inline', columns: [{name: 'Name', type: 'string'}]},
      global: {plugins: [ElementPlus], stubs: {JsonTreeEditor: true}}})
    try {
      await wrapper.get('[data-action="json"]').trigger('click'); await wrapper.get('[data-action="json-text"]').trigger('click'); await vi.dynamicImportSettled(); await flushPromises()
      expect(settings).toBeDefined()
      pending = '{invalid'
      await wrapper.getComponent(SparkJsonEditor).trigger('focusout')
      await wrapper.get('[data-action="apply"]').trigger('click')
      expect(wrapper.get('[role="alert"]').text()).toContain('过滤表达式不是有效 JSON')
      const tree = {field: 'Name', operator: 'eq', value: 'latest'}
      pending = JSON.stringify(tree)
      await wrapper.getComponent(SparkJsonEditor).trigger('focusout')
      // 失焦发生在鼠标按下与click之间；校验提示此时消失会移动“应用”按钮，丢失这次点击。
      expect(wrapper.get('[role="alert"]').text()).toContain('过滤表达式不是有效 JSON')
      await wrapper.get('[data-action="apply"]').trigger('click')
      expect(validate).toHaveBeenCalled()
      expect(wrapper.emitted('update:modelValue')).toEqual([[tree]])
    } finally {wrapper.unmount(); vi.doUnmock('vanilla-jsoneditor'); vi.unstubAllGlobals()}
  })
  it('keeps an invalid child and blocks the entire tree', () => {
    const draft = new FilterExpressionEditorDraft({ logic: 'or', filters: [{ field: 'Name', operator: 'eq', value: 'x' }] })
    draft.addCondition(draft.root)
    expect(draft.root.children).toHaveLength(2)
    expect(draft.check({ fields }).ok).toBe(false)
    expect(draft.root.children).toHaveLength(2)
  })

  it('preserves applied empty groups but rejects newly added incomplete groups', () => {
    const draft = new FilterExpressionEditorDraft({ logic: 'or', filters: [] })
    expect(draft.check({ fields })).toMatchObject({ ok: true, tree: { logic: 'or', filters: [] } })
    draft.addGroup(draft.root)
    expect(draft.check({ fields }).ok).toBe(false)
  })

  it('does not rewrite an operator or literal when changing the field', () => {
    const draft = new FilterExpressionEditorDraft({ field: 'Name', operator: 'contains', value: '' })
    const condition = draft.root.children[0]
    if (!condition || condition.kind !== 'condition') throw new Error('missing condition')
    condition.field = 'Amount'
    expect(draft.check({ fields }).ok).toBe(false)
    expect(condition.operator).toBe('contains')
    expect(condition.valueText).toBe('""')
  })

  it('round trips nested groups, explicit empty values, and opaque function extensions', () => {
    const tree = DataViewFilter.group({ logic: 'or', filters: [
      { field: 'Amount', operator: 'in', value: [] },
      { logic: 'and', filters: [
        { field: 'Name', operator: 'eq', value: null },
        { field: 'Name', operator: 'eq', value: { Type: 'SystemData', ParamName: 'UserID', Extra: { zero: 0, flag: false, text: '' } } },
      ] },
    ] }).toJSON()
    const draft = new FilterExpressionEditorDraft(tree)
    expect(draft.check({ fields, valueFunctions: {} })).toMatchObject({ ok: true, tree })
    expect(draft.check({ fields, maxDepth: 0 }).ok).toBe(false)
    expect(draft.check({ fields, maxRules: 2 }).ok).toBe(false)
  })

  it('preserves untouched extension functions but requires a definition to modify them', () => {
    const tree = DataViewFilter.condition({ field: 'Name', operator: 'eq', value: { Type: 'BackendExtension', Extra: { empty: '', flag: false } } }).toJSON()
    const draft = new FilterExpressionEditorDraft(tree)
    expect(draft.check({ fields, valueFunctions: {} })).toMatchObject({ ok: true, tree })
    const node = draft.root.children[0]
    if (!node || node.kind !== 'condition') throw new Error('missing condition')
    node.valueText = '{"Type":"BackendExtension","Extra":{"empty":"changed","flag":false}}'
    expect(draft.check({ fields, valueFunctions: {} }).ok).toBe(false)
  })

  it('retains malformed JSON without emitting clear or a partial value', async () => {
    const wrapper = editor({ field: 'Name', operator: 'eq', value: 'kept' })
    const body = new DOMWrapper(document.body)
    await wrapper.get('[data-action="open"]').trigger('click')
    await body.get('[data-action="json"]').trigger('click'); await body.get('[data-action="json-text"]').trigger('click')
    const json = wrapper.getComponent(SparkJsonEditor)
    json.vm.$emit('update:modelValue', '{"logic":"or","filters":['); await flushPromises()
    await body.get('[data-action="apply"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(body.get('[role="alert"]').text()).toContain('JSON')
    expect(json.props('modelValue')).toBe('{"logic":"or","filters":[')
  })

  it('cancels without changing the applied predicate and clears only explicitly', async () => {
    const wrapper = editor({ field: 'Name', operator: 'eq', value: null })
    const body = new DOMWrapper(document.body)
    await wrapper.get('[data-action="open"]').trigger('click')
    await body.get('[data-action="cancel"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.get('[data-action="open"]').trigger('click')
    await body.get('[data-action="clear"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[undefined]])
  })

  it('validates the whole raw public tree before emitting an immutable snapshot', async () => {
    const wrapper = editor()
    const body = new DOMWrapper(document.body)
    await wrapper.get('[data-action="open"]').trigger('click')
    await body.get('[data-action="json"]').trigger('click'); await body.get('[data-action="json-text"]').trigger('click')
    wrapper.getComponent(SparkJsonEditor).vm.$emit('update:modelValue', '{"field":"Amount","operator":"eq","value":0}'); await flushPromises()
    await body.get('[data-action="apply"]').trigger('click')
    const emitted: unknown = wrapper.emitted('update:modelValue')?.[0]?.[0]
    expect(emitted).toEqual({ field: 'Amount', operator: 'eq', value: 0 })
    expect(Object.isFrozen(emitted)).toBe(true)
  })

  it('wires RendererFilter to the actual DataView and shows dirty replacement rejection', async () => {
    const view = SparkData.createDataSet({ dataSetName: 'FilterUiFixture', tables: {
      Orders: { tableName: 'Orders', resourceType: 'static-data', columns: [
        { name: 'id', type: 'number', isPrimaryKey: true }, { name: 'Name', type: 'string' },
      ], views: { default: { rows: [{ id: 1, Name: '' }, { id: 2, Name: 'kept' }] } } },
    } }).getView('Orders')
    if (!view) throw new Error('missing fixture view')
    const host = defineComponent({ setup() {
      const { sparkProvide } = useSparkComponent({ type: 'filter-test-host' })
      sparkProvide(DATA_SOURCE, view)
      sparkProvide(PAGE_RUNTIME_SERVICES, createPageRuntimeServices({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }))
      return () => h(RendererFilter, {})
    } })
    const wrapper = mount(host, { attachTo: document.body, global: { plugins: [ElementPlus], stubs: {SparkJsonEditor: true, JsonTreeEditor: true} } })
    wrappers.push(wrapper)
    const body = new DOMWrapper(document.body)
    await body.get('[data-action="open"]').trigger('click')
    await body.get('[data-action="json"]').trigger('click'); await body.get('[data-action="json-text"]').trigger('click')
    wrapper.getComponent(SparkJsonEditor).vm.$emit('update:modelValue', '{"field":"Name","operator":"eq","value":""}'); await flushPromises()
    await body.get('[data-action="apply"]').trigger('click')
    await flushPromises()
    expect(view.rows.map(row => row['id'])).toEqual([1])
    expect(view.filterExpression).toEqual({ field: 'Name', operator: 'eq', value: '' })
    view.updateEditingValue(1, 'Name', 'unsaved')
    await body.get('[data-action="open"]').trigger('click')
    await body.get('[data-action="clear"]').trigger('click')
    await flushPromises()
    expect(body.get('[data-filter-error]').text()).toContain('DATA_VIEW_UNSAVED_CHANGES')
    expect(view.filterExpression).toEqual({ field: 'Name', operator: 'eq', value: '' })
    expect(view.getEditingRow(1)?.['Name']).toBe('unsaved')
    await body.get('[data-action="json"]').trigger('click'); await body.get('[data-action="json-text"]').trigger('click')
    const rejected = '{"field":"Name","operator":"eq","value":"new predicate"}'
    wrapper.getComponent(SparkJsonEditor).vm.$emit('update:modelValue', rejected); await flushPromises()
    await body.get('[data-action="apply"]').trigger('click')
    await flushPromises()
    expect(wrapper.getComponent(SparkJsonEditor).props('modelValue')).toBe(rejected)
    expect(view.filterExpression).toEqual({ field: 'Name', operator: 'eq', value: '' })
  })

  it('uses the function catalogue, rejects missing parameters and preserves option updates and extensions', async () => {
    const wrapper = mount(FilterValueFunctionDialog, { attachTo: document.body, props: {
      modelValue: true, context: {}, value: { Type: 'SystemData', Extra: { flag: false, text: '' } },
    }, global: { plugins: [ElementPlus] } })
    wrappers.push(wrapper)
    await flushPromises()
    const body = new DOMWrapper(document.body)
    await body.get('[data-function-confirm]').trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(body.get('[role="alert"]').text()).toContain('系统参数')
    const parameter = wrapper.findAllComponents(ElSelect)[0]
    if (!parameter) throw new Error('missing function parameter control')
    parameter.vm.$emit('update:modelValue', 'UserID')
    await wrapper.setProps({ context: { systemParams: [{ value: 'UserID', label: '回填用户' }] } })
    await body.get('[data-function-confirm]').trigger('click')
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toEqual({ Type: 'SystemData', ParamName: 'UserID', Extra: { flag: false, text: '' } })
  })

  it.each(['type', 'reopen', 'context', 'value', 'unmount'] as const)('rejects captured function controls after %s without losing the current draft', async change => {
    const value = {Type: 'SystemData', ParamName: 'UserName', Extra: {flag: false}}
    const context = {inputParams: [{label: '客户', value: 'customer'}]}
    const wrapper = mount(FilterValueFunctionDialog, {attachTo: document.body, props: {modelValue: true, value, context},
      global: {plugins: [ElementPlus], stubs: {}}}); wrappers.push(wrapper)
    await flushPromises()
    const late = wrapper.getComponent(ElSelect).vm.$.vnode.props?.['onUpdate:modelValue']
    const lateConfirm = wrapper.findAllComponents({name: 'GlobalElButtonStub'}).find(button => button.text() === '保存')!.vm.$.vnode.props?.['onClick']
    expect(typeof late).toBe('function'); expect(typeof lateConfirm).toBe('function')
    if (change === 'type') {
      wrapper.getComponent(ElTabs).vm.$emit('update:modelValue', 'GetInputParam'); await flushPromises()
      wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', 'customer'); await flushPromises()
    }
    if (change === 'reopen') {
      await wrapper.findAllComponents({name: 'GlobalElButtonStub'}).find(button => button.text() === '取消')!.trigger('click')
      // Closing must reject an already queued save before the controlled prop catches up.
      if (typeof lateConfirm === 'function') lateConfirm()
      expect(wrapper.emitted('confirm')).toBeUndefined()
      await wrapper.setProps({modelValue: false}); await wrapper.setProps({modelValue: true})
    }
    if (change === 'context') await wrapper.setProps({context: {...context, systemParams: [{label: '姓名', value: 'UserName'}]}})
    if (change === 'value') await wrapper.setProps({value: {...value, ParamName: 'CurDate', Extra: {flag: true}}})
    if (change === 'unmount') wrapper.unmount()
    if (typeof late === 'function') late('UserID')
    if (typeof lateConfirm === 'function') lateConfirm()
    await flushPromises()
    expect(wrapper.emitted('confirm')).toBeUndefined()
    if (change !== 'unmount') {
      const expected = change === 'type' ? {Type: 'GetInputParam', ParamName: 'customer'}
        : change === 'value' ? {...value, ParamName: 'CurDate', Extra: {flag: true}} : value
      expect(wrapper.getComponent(ElSelect).props('modelValue')).toBe(expected.ParamName)
      await wrapper.findAllComponents({name: 'GlobalElButtonStub'}).find(button => button.text() === '保存')!.trigger('click')
      expect(wrapper.emitted('confirm')).toEqual([[expected]])
    }
  })

  it('updates both reference-field catalogues by the selected model, preserves invalid values for correction and ignores old choices', async () => {
    const context = {tables: [
      {name: 'Customers', label: '客户', fields: [{name: 'id', label: '客户编码'}, {name: 'name', label: '客户名称'}]},
      {name: 'Orders', label: '订单', fields: [{name: 'id', label: '订单编码'}, {name: 'amount', label: '金额'}]},
    ]}
    const value = {Type: 'GetRefData', RefTableName: 'Customers', RefFieldName: 'name', FkFieldName: 'id', Extra: {flag: false}}
    const wrapper = mount(FilterValueFunctionDialog, {attachTo: document.body, props: {modelValue: true, value, context},
      global: {plugins: [ElementPlus], stubs: {}}}); wrappers.push(wrapper); await flushPromises()
    const selects = () => wrapper.findAllComponents(ElSelect)
    const oldChoice = selects()[1]!.vm.$.vnode.props?.['onUpdate:modelValue']
    selects()[0]!.vm.$emit('update:modelValue', 'Orders'); await flushPromises()
    expect(selects()[1]!.props('modelValue')).toBe('name')
    for (const select of selects().slice(1)) expect(select.findAllComponents(ElOption).map(option => option.props('value'))).toEqual(['id', 'amount'])
    await wrapper.findAllComponents({name: 'GlobalElButtonStub'}).find(button => button.text() === '保存')!.trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(new DOMWrapper(document.body).get('[role="alert"]').text()).toContain('引用字段不在当前可用选项中')
    selects()[1]!.vm.$emit('update:modelValue', 'amount'); await flushPromises()
    // id is valid in both models, so option-membership validation alone cannot reject the old event.
    if (typeof oldChoice === 'function') oldChoice('id')
    await flushPromises()
    expect(selects()[1]!.props('modelValue')).toBe('amount')
    await wrapper.findAllComponents({name: 'GlobalElButtonStub'}).find(button => button.text() === '保存')!.trigger('click')
    expect(wrapper.emitted('confirm')).toEqual([[{...value, RefTableName: 'Orders', RefFieldName: 'amount'}]])
    expect(value.RefTableName).toBe('Customers'); expect(value.RefFieldName).toBe('name')
  })
})
