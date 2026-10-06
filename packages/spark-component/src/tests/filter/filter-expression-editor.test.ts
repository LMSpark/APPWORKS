import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, DOMWrapper, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ElementPlus, { ElSelect } from 'element-plus'
import { DataViewFilter, SparkData } from '@spark-appworks/spark-data'
import { useSparkComponent, DATA_SOURCE } from '../../core'
import RendererFilter from '../../components/containers/zones/RendererFilter.vue'
import { PAGE_RUNTIME_SERVICES } from '../../runtime'
import { createPageRuntimeServices } from '../logger-test-helpers'
import FilterExpressionEditor from '../../components/containers/filter/expression/FilterExpressionEditor/FilterExpressionEditor.vue'
import FilterValueFunctionDialog from '../../components/containers/filter/value/FilterValueFunctionDialog/FilterValueFunctionDialog.vue'
import { FilterExpressionEditorDraft } from '../../components/containers/filter/expression/FilterExpressionEditor/FilterExpressionEditor.props'

const fields = [{ name: 'Name', type: 'text' }, { name: 'Amount', type: 'number' }] as const
const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })

function editor(modelValue?: ReturnType<DataViewFilter['toJSON']>) {
  const wrapper = mount(FilterExpressionEditor, {
    attachTo: document.body,
    props: { modelValue, columns: [{ name: 'Name', type: 'string' }, { name: 'Amount', type: 'number' }] },
    global: { plugins: [ElementPlus] },
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('full public filter editor', () => {
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
    await body.get('[data-action="json"]').trigger('click')
    await body.get('textarea[data-filter-json]').setValue('{"logic":"or","filters":[')
    await body.get('[data-action="apply"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(body.get('[role="alert"]').text()).toContain('JSON')
    expect(body.get('textarea[data-filter-json]').element).toHaveProperty('value', '{"logic":"or","filters":[')
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
    await body.get('[data-action="json"]').trigger('click')
    await body.get('textarea[data-filter-json]').setValue('{"field":"Amount","operator":"eq","value":0}')
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
    const wrapper = mount(host, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    wrappers.push(wrapper)
    const body = new DOMWrapper(document.body)
    await body.get('[data-action="open"]').trigger('click')
    await body.get('[data-action="json"]').trigger('click')
    await body.get('textarea[data-filter-json]').setValue('{"field":"Name","operator":"eq","value":""}')
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
    await body.get('[data-action="json"]').trigger('click')
    const rejected = '{"field":"Name","operator":"eq","value":"new predicate"}'
    await body.get('textarea[data-filter-json]').setValue(rejected)
    await body.get('[data-action="apply"]').trigger('click')
    await flushPromises()
    expect(body.get('textarea[data-filter-json]').element).toHaveProperty('value', rejected)
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
    const parameter = wrapper.findAllComponents(ElSelect)[1]
    if (!parameter) throw new Error('missing function parameter control')
    parameter.vm.$emit('update:modelValue', 'UserID')
    await wrapper.setProps({ context: { systemParams: [{ value: 'UserID', label: '回填用户' }] } })
    await body.get('[data-function-confirm]').trigger('click')
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toEqual({ Type: 'SystemData', ParamName: 'UserID', Extra: { flag: false, text: '' } })
  })
})
