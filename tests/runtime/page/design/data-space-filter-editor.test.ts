import { afterEach, describe, expect, it } from 'vitest'
import { mount, DOMWrapper, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { FilterExpressionEditor } from '@spark-appworks/spark-component'
import DataSpaceFilterEditor from '@/views/app/control/data-platform/data-space/design/expression/DataSpaceFilterEditor.vue'

const columns = [{ name: 'Name', type: 'string' }, { name: 'Owner', type: 'string' }] as const
const nestedWire = JSON.stringify({ Type: 'or', Filters: [
  { Type: 'cond', Field: 'Name', Operator: 'equal', Value: null, ValueFun: { Type: 'GetConstValue', Value: 'A' } },
  { Type: 'and', Filters: [{ Type: 'cond', Field: 'Owner', Operator: 'equal', Value: null,
    ValueFun: { Type: 'GetConstValue', Value: 'B' } }] },
] })
const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })

function editor(modelValue?: string | null, contextKey = 'design:SPACE-1:MODEL-1') {
  const wrapper = mount(DataSpaceFilterEditor, {
    attachTo: document.body,
    props: { contextKey, ...(modelValue !== undefined ? { modelValue } : {}), columns },
    global: { plugins: [ElementPlus] },
  })
  wrappers.push(wrapper)
  return wrapper
}

function invokeStaleUpdate(listener: unknown, value: unknown): void {
  if (typeof listener !== 'function') throw new Error('FilterExpressionEditor vnode update listener is missing')
  listener(value)
}

describe('DataSpaceFilterEditor', () => {
  it('reports codec validation for the current raw value and context without changing the value', async () => {
    const damaged = '{"Type":"cond","Field":"Name","Operator":"unknown"}'
    const wrapper = editor(damaged)
    const initialMessage = wrapper.get('[role="alert"]').text().replace('过滤配置无法解析：', '')

    expect(wrapper.emitted('validation')).toEqual([[{
      contextKey: 'design:SPACE-1:MODEL-1', value: damaged, valid: false, message: initialMessage,
    }]])
    expect(wrapper.props('modelValue')).toBe(damaged)

    await wrapper.setProps({ modelValue: nestedWire })
    expect(wrapper.emitted('validation')?.[1]?.[0]).toEqual({
      contextKey: 'design:SPACE-1:MODEL-1', value: nestedWire, valid: true, message: '',
    })
    expect(wrapper.props('modelValue')).toBe(nestedWire)

    await wrapper.setProps({ contextKey: 'design:SPACE-1:MODEL-2' })
    expect(wrapper.emitted('validation')?.[2]?.[0]).toEqual({
      contextKey: 'design:SPACE-1:MODEL-2', value: nestedWire, valid: true, message: '',
    })
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it.each([
    { label: 'undefined', value: undefined },
    { label: 'null', value: null },
    { label: 'empty string', value: '' },
  ])('reports an initially valid $label value without normalizing it', ({ value }) => {
    const wrapper = editor(value)
    expect(wrapper.emitted('validation')?.[0]?.[0]).toEqual({
      contextKey: 'design:SPACE-1:MODEL-1', value, valid: true, message: '',
    })
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('opens and cancels without emitting, then applies nested filter and explicit clear', async () => {
    const wrapper = editor(nestedWire)
    const body = new DOMWrapper(document.body)
    expect(wrapper.findComponent(FilterExpressionEditor).exists()).toBe(true)
    await wrapper.get('[data-action="open"]').trigger('click')
    await body.get('[data-action="cancel"]').trigger('click')
    expect(wrapper.emitted('change')).toBeUndefined()

    await wrapper.get('[data-action="open"]').trigger('click')
    const firstValue = body.get('input[aria-label="条件值 JSON"]')
    await firstValue.setValue('"C"')
    await body.get('[data-action="apply"]').trigger('click')
    const editedWire = JSON.stringify({ Type: 'or', Filters: [
      { Type: 'cond', Field: 'Name', Operator: 'equal', Value: null, ValueFun: { Type: 'GetConstValue', Value: 'C' } },
      { Type: 'and', Filters: [{ Type: 'cond', Field: 'Owner', Operator: 'equal', Value: null,
        ValueFun: { Type: 'GetConstValue', Value: 'B' } }] },
    ] })
    expect(wrapper.emitted('change')?.[0]?.[0]).toEqual({ contextKey: 'design:SPACE-1:MODEL-1', value: editedWire })

    await wrapper.get('[data-action="open"]').trigger('click')
    await body.get('[data-action="clear"]').trigger('click')
    expect(wrapper.emitted('change')?.[1]).toEqual([{ contextKey: 'design:SPACE-1:MODEL-1', value: '' }])
  })

  it('preserves a damaged wire value and does not expose editing controls', async () => {
    const damaged = '{"Type":"cond","Field":"Name","Operator":"unknown"}'
    const wrapper = editor(damaged)
    expect(wrapper.get('[role="alert"]').text()).toContain('过滤配置无法解析')
    expect(wrapper.findComponent(FilterExpressionEditor).exists()).toBe(false)
    expect(wrapper.emitted('change')).toBeUndefined()
    await wrapper.setProps({ modelValue: null })
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('rebuilds a stale open draft when parent value or disabled state changes', async () => {
    const wrapper = editor()
    const body = new DOMWrapper(document.body)
    await wrapper.get('[data-action="open"]').trigger('click')
    await body.get('[data-action="json"]').trigger('click')
    await body.get('textarea[data-filter-json]').setValue('{"field":"Name","operator":"eq","value":"stale"}')
    await wrapper.setProps({ modelValue: nestedWire })
    await flushPromises()
    expect(body.find('[data-action="apply"]').exists()).toBe(false)
    expect(wrapper.emitted('change')).toBeUndefined()

    const staleChild = wrapper.findComponent(FilterExpressionEditor)
    const staleColumnsHandler: unknown = staleChild.vm.$.vnode.props?.['onUpdate:modelValue']
    await wrapper.setProps({ columns: [{ name: 'Name', type: 'string' }] })
    await flushPromises()
    invokeStaleUpdate(staleColumnsHandler, { field: 'Name', operator: 'eq', value: 'old columns' })
    expect(wrapper.emitted('change')).toBeUndefined()

    const staleContextChild = wrapper.findComponent(FilterExpressionEditor)
    const staleContextHandler: unknown = staleContextChild.vm.$.vnode.props?.['onUpdate:modelValue']
    await wrapper.setProps({ functionContext: { systemParams: [{ label: '用户', value: 'UserID' }] } })
    await flushPromises()
    invokeStaleUpdate(staleContextHandler, { field: 'Name', operator: 'eq', value: 'old context' })
    expect(wrapper.emitted('change')).toBeUndefined()

    const sameValueChild = wrapper.findComponent(FilterExpressionEditor)
    const sameValueHandler: unknown = sameValueChild.vm.$.vnode.props?.['onUpdate:modelValue']
    await wrapper.setProps({ contextKey: 'design:SPACE-1:MODEL-2' })
    await flushPromises()
    invokeStaleUpdate(sameValueHandler, { field: 'Name', operator: 'eq', value: 'old target' })
    expect(wrapper.emitted('change')).toBeUndefined()

    await wrapper.get('[data-action="open"]').trigger('click')
    const staleDisabledChild = wrapper.findComponent(FilterExpressionEditor)
    const staleDisabledHandler: unknown = staleDisabledChild.vm.$.vnode.props?.['onUpdate:modelValue']
    await wrapper.setProps({ disabled: true })
    await flushPromises()
    expect(wrapper.get('[data-action="open"]').attributes('disabled')).toBeDefined()
    expect(body.find('[data-action="apply"]').exists()).toBe(false)
    await wrapper.setProps({ disabled: false })
    await flushPromises()
    invokeStaleUpdate(staleDisabledHandler, { field: 'Name', operator: 'eq', value: 'old disabled session' })
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('keeps ordinary function definitions and exposes only the department branch for user host', async () => {
    const legacyRole = JSON.stringify({ Type: 'cond', Field: 'Owner', Operator: 'equal', Value: null,
      ValueFun: { Type: 'GetUserMasterId', refType: 'role', roleClassId: 'old-category' } })
    const wrapper = editor(legacyRole)
    const context = wrapper.findComponent(FilterExpressionEditor).props('functionContext')
    const definitions = context?.definitions ?? []
    expect(definitions.some(item => item.type === 'SystemData')).toBe(true)
    const userHost = definitions.find(item => item.type === 'GetUserMasterId')
    expect(userHost?.fields.map(field => field.key)).toEqual(['refType', 'depLevel', 'getChildDep'])
    expect(userHost?.fields[0]?.options).toEqual([{ label: '部门级别', value: 'dep' }])
    expect(wrapper.text()).not.toContain('角色分类')

    const body = new DOMWrapper(document.body)
    await wrapper.get('[data-action="open"]').trigger('click')
    await body.get('[data-action="apply"]').trigger('click')
    expect(body.get('[role="alert"]').text()).toContain('已停用的角色分类分支')
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('merges built-in system parameters with supplied data-space parameters and round trips SystemData', async () => {
    const systemFilter = JSON.stringify({ Type: 'cond', Field: 'Owner', Operator: 'equal', Value: null,
      ValueFun: { Type: 'SystemData', ParamName: 'OrderId' } })
    const wrapper = editor(systemFilter)
    await wrapper.setProps({ functionContext: { systemParams: [{ label: '单据编号', value: 'OrderId' }] } })
    const editorComponent = wrapper.findComponent(FilterExpressionEditor)
    const context = editorComponent.props('functionContext')
    const definition = context?.definitions?.find(item => item.type === 'SystemData')
    const parameter = definition?.fields.find(field => field.key === 'ParamName')
    const optionSource = parameter?.options
    const options = typeof optionSource === 'function'
      ? optionSource({ Type: 'SystemData' }, context ?? {})
      : optionSource ?? []
    expect(options.map(option => option.value)).toContain('UserID')
    expect(options.map(option => option.value)).toContain('OrderId')

    const body = new DOMWrapper(document.body)
    await wrapper.get('[data-action="open"]').trigger('click')
    await body.get('[data-action="apply"]').trigger('click')
    expect(wrapper.emitted('change')?.[0]?.[0]).toEqual({
      contextKey: 'design:SPACE-1:MODEL-1', value: systemFilter,
    })
  })
})
