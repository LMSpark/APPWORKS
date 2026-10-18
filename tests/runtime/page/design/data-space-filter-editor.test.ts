import {afterEach, describe, expect, it} from 'vitest'
import {mount, DOMWrapper, flushPromises} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import ElementPlus from 'element-plus'
import {DataSet, type DataViewFilterFunctionContext} from '@spark-appworks/spark-data'
import {DATA_SOURCE, FilterExpressionEditor, RendererFilterExpression, useSparkComponent} from '@spark-appworks/spark-component'

const nestedWire = JSON.stringify({Type: 'or', Filters: [
  {Type: 'cond', Field: 'Name', Operator: 'equal', Value: null, ValueFun: {Type: 'GetConstValue', Value: 'A'}},
  {Type: 'and', Filters: [{Type: 'cond', Field: 'Owner', Operator: 'equal', Value: null, ValueFun: {Type: 'GetConstValue', Value: 'B'}}]},
]})
const wrappers: ReturnType<typeof mount>[] = []
const dataSets: DataSet[] = []
afterEach(() => {wrappers.splice(0).forEach(wrapper => wrapper.unmount()); dataSets.splice(0).forEach(ds => ds.destroy())})

function editor(value: unknown = undefined) {
  const ds = DataSet.fromJson({dataSetName: 'FilterDefinition', tables: {Definition: {tableName: 'Definition', resourceType: 'static-data',
    columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'predicate', type: 'json'}],
    views: {default: {commitMode: 'staged', autoCurrentFirst: false, rows: [{id: 'a', predicate: value}, {id: 'b', predicate: value}]}}}}})
  dataSets.push(ds)
  const view = ds.getView('Definition')!
  view.setCurrentRowById('a')
  const disabled = ref(false), columns = ref([{name: 'Name', type: 'string'}, {name: 'Owner', type: 'string'}])
  const context = ref<DataViewFilterFunctionContext>({})
  const wrapper = mount(defineComponent({setup() {
    useSparkComponent({type: 'filter-definition-contract'}).sparkProvide(DATA_SOURCE, view)
    return () => h(RendererFilterExpression, {field: 'predicate', format: 'spark-json', disabled: disabled.value,
      columns: columns.value, functionContext: context.value})
  }}), {attachTo: document.body, global: {plugins: [ElementPlus], stubs: {SparkJsonEditor: true}}})
  wrappers.push(wrapper)
  return {wrapper, view, disabled, columns, context, value: () => view.getEditingRow('a')?.['predicate']}
}

describe('data-space filtering through the standard bound component', () => {
  it.each([undefined, null, '', '  '])('preserves an unconfigured raw value %j when reading and cancelling', async value => {
    const f = editor(value)
    await f.wrapper.get('[data-action="open"]').trigger('click')
    await new DOMWrapper(document.body).get('[data-action="cancel"]').trigger('click')
    expect(f.value()).toBe(value)
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it('cancels, edits a nested filter and explicitly clears the original DataView field', async () => {
    const f = editor(nestedWire), body = new DOMWrapper(document.body)
    await f.wrapper.get('[data-action="open"]').trigger('click')
    await body.get('[data-action="cancel"]').trigger('click')
    expect(f.value()).toBe(nestedWire)
    expect(f.view.hasEditingChanges()).toBe(false)
    await f.wrapper.get('[data-action="open"]').trigger('click')
    await new DOMWrapper(document.body).get('input[aria-label="文本常量"]').setValue('C'); await flushPromises()
    await body.get('[data-action="apply"]').trigger('click')
    const expected = JSON.parse(nestedWire)
    expected.Filters[0].ValueFun.Value = 'C'
    expect(JSON.parse(String(f.value()))).toEqual(expected)
    expect(f.view.rows[0]?.['predicate']).toBe(nestedWire)
    await flushPromises()
    await f.wrapper.get('[data-action="open"]').trigger('click')
    await body.get('[data-action="clear"]').trigger('click')
    expect(f.value()).toBe('')
    expect(f.view.getEditingRow('b')?.['predicate']).toBe(nestedWire)
  })

  it.each(['{broken', '{"Type":"cond","Field":"Name","Operator":"unknown"}', 5])('retains damaged storage %j without an editor', value => {
    const f = editor(value)
    expect(f.wrapper.get('[role="alert"]').text()).not.toBe('')
    expect(f.wrapper.findComponent(FilterExpressionEditor).exists()).toBe(false)
    expect(f.value()).toBe(value)
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it.each(['columns', 'context', 'disabled', 'row', 'value'] as const)('rejects a captured handler after %s changes', async change => {
    const f = editor(nestedWire)
    const child = f.wrapper.findComponent(FilterExpressionEditor)
    const handler: unknown = child.vm.$.vnode.props?.['onUpdate:modelValue']
    if (typeof handler !== 'function') throw new Error('bound update handler missing')
    if (change === 'columns') f.columns.value = [{name: 'Name', type: 'string'}]
    if (change === 'context') f.context.value = {systemParams: [{label: 'User', value: 'UserID'}]}
    if (change === 'disabled') f.disabled.value = true
    if (change === 'row') f.view.setCurrentRowById('b')
    if (change === 'value') f.view.updateEditingValue('a', 'predicate', '')
    await flushPromises()
    f.disabled.value = false
    await flushPromises()
    handler({field: 'Name', operator: 'eq', value: 'stale'})
    expect(f.value()).toBe(change === 'value' ? '' : nestedWire)
    expect(f.view.getEditingRow('b')?.['predicate']).toBe(nestedWire)
  })

  it('preserves a stored role function but refuses applying its retired branch', async () => {
    const raw = JSON.stringify({Type: 'cond', Field: 'Owner', Operator: 'equal', Value: null,
      ValueFun: {Type: 'GetUserMasterId', refType: 'role', roleClassId: 'legacy'}})
    const f = editor(raw), body = new DOMWrapper(document.body)
    await f.wrapper.get('[data-action="open"]').trigger('click')
    await body.get('[data-action="apply"]').trigger('click')
    expect(body.get('[role="alert"]').text()).toContain('已停用的角色分类分支')
    expect(f.value()).toBe(raw)
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it('merges system choices and round trips an additional SystemData parameter', async () => {
    const raw = JSON.stringify({Type: 'cond', Field: 'Owner', Operator: 'equal', Value: null,
      ValueFun: {Type: 'SystemData', ParamName: 'OrderId'}})
    const f = editor(raw)
    f.context.value = {systemParams: [{label: '单据编号', value: 'OrderId'}]}
    await flushPromises()
    const context = f.wrapper.findComponent(FilterExpressionEditor).props('functionContext')!
    const parameter = context.definitions!.find(item => item.type === 'SystemData')!.fields.find(field => field.key === 'ParamName')!
    const options = typeof parameter.options === 'function' ? parameter.options({Type: 'SystemData'}, context) : parameter.options ?? []
    expect(options.map(option => option.value)).toEqual(expect.arrayContaining(['UserID', 'OrderId']))
    await f.wrapper.get('[data-action="open"]').trigger('click')
    await new DOMWrapper(document.body).get('[data-action="apply"]').trigger('click')
    expect(f.value()).toBe(raw)
  })
})
