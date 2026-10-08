import { afterEach, describe, expect, it } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElInput, ElSelect } from 'element-plus'
import type { DataViewFilterFunctionContext } from '@spark-appworks/spark-data'
import { FilterValueFunctionDialog } from '@spark-appworks/spark-component'
import DataSpaceValueFunctionEditor from '@/views/app/control/data-platform/data-space/design/expression/DataSpaceValueFunctionEditor.vue'

const wrappers: ReturnType<typeof mount>[] = []
const tables: NonNullable<DataViewFilterFunctionContext['tables']> = [{
  name: 'Orders', label: '订单', fields: [{ name: 'Id', label: '编号' }],
}]

afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })

function editor(modelValue?: string | null, functionContext?: DataViewFilterFunctionContext) {
  const wrapper = mount(DataSpaceValueFunctionEditor, {
    attachTo: document.body,
    props: {
      contextKey: 'design:SPACE-1:MODEL-1:FIELD-1',
      ...(modelValue !== undefined ? { modelValue } : {}),
      ...(functionContext !== undefined ? { functionContext } : {}),
    },
    global: { plugins: [ElementPlus] },
  })
  wrappers.push(wrapper)
  return wrapper
}

function clickButtonText(body: DOMWrapper<Element>, text: string): Promise<void> {
  const button = body.findAll('button').find(item => item.text().includes(text))
  if (!button) throw new Error(`missing button: ${text}`)
  return button.trigger('click')
}

function invokeStaleListener(listener: unknown, value: unknown): void {
  if (typeof listener !== 'function') throw new Error('FilterValueFunctionDialog vnode listener is missing')
  listener(value)
}

describe('DataSpaceValueFunctionEditor', () => {
  it.each([
    ['0', 0],
    ['false', false],
    ['null', null],
    ['""', ''],
    ['[]', []],
    ['{"enabled":false,"count":0,"empty":null}', { enabled: false, count: 0, empty: null }],
    ['"literal text"', 'literal text'],
  ] as const)('creates a typed constant from explicit JSON %s', async (source, expected) => {
    const wrapper = editor()
    await wrapper.get('[data-action="edit"]').trigger('click')
    const dialog = wrapper.findComponent(FilterValueFunctionDialog)
    const typeSelect = dialog.findComponent(ElSelect)
    typeSelect.vm.$emit('update:modelValue', 'GetConstValue')
    await flushPromises()
    const valueInput = wrapper.findComponent(FilterValueFunctionDialog).findComponent(ElInput)
    valueInput.vm.$emit('update:modelValue', source)
    await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click')
    expect(wrapper.emitted('change')?.[0]?.[0]).toEqual({
      contextKey: 'design:SPACE-1:MODEL-1:FIELD-1',
      value: JSON.stringify({ Type: 'GetConstValue', Value: expected }),
    })
  })

  it('blocks missing or invalid JSON and never confirms the previous typed value', async () => {
    const wrapper = editor()
    const body = new DOMWrapper(document.body)
    await wrapper.get('[data-action="edit"]').trigger('click')
    const typeSelect = wrapper.findComponent(FilterValueFunctionDialog).findComponent(ElSelect)
    typeSelect.vm.$emit('update:modelValue', 'GetConstValue')
    await flushPromises()
    await body.get('[data-function-confirm]').trigger('click')
    expect(wrapper.emitted('change')).toBeUndefined()

    let valueInput = wrapper.findComponent(FilterValueFunctionDialog).findComponent(ElInput)
    valueInput.vm.$emit('update:modelValue', '0')
    valueInput.vm.$emit('update:modelValue', 'not JSON')
    await body.get('[data-function-confirm]').trigger('click')
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(body.get('[role="alert"]').text()).toContain('请输入有效 JSON')
    expect(wrapper.findComponent(FilterValueFunctionDialog).findComponent(ElInput).props('modelValue')).toBe('not JSON')

    valueInput = wrapper.findComponent(FilterValueFunctionDialog).findComponent(ElInput)
    valueInput.vm.$emit('update:modelValue', 'false')
    await body.get('[data-function-confirm]').trigger('click')
    expect(wrapper.emitted('change')?.[0]?.[0]).toEqual({
      contextKey: 'design:SPACE-1:MODEL-1:FIELD-1',
      value: JSON.stringify({ Type: 'GetConstValue', Value: false }),
    })
  })

  it('uses the shared dialog for SystemData and table-field functions without emitting on cancel', async () => {
    const systemData = { Type: 'SystemData', ParamName: 'OrderId', Extra: { zero: 0, flag: false, empty: null } }
    const wrapper = editor(JSON.stringify(systemData), {
      systemParams: [{ label: '单据编号', value: 'OrderId' }], tables,
    })
    const body = new DOMWrapper(document.body)
    await wrapper.get('[data-action="edit"]').trigger('click')
    const dialog = wrapper.findComponent(FilterValueFunctionDialog)
    expect(dialog.exists()).toBe(true)
    const context = dialog.props('context')
    const systemDefinition = context.definitions?.find(item => item.type === 'SystemData')
    const parameterField = systemDefinition?.fields.find(field => field.key === 'ParamName')
    const optionSource = parameterField?.options
    const options = typeof optionSource === 'function' ? optionSource({ Type: 'SystemData' }, context) : optionSource ?? []
    expect(options.map(option => option.value)).toContain('UserID')
    expect(options.map(option => option.value)).toContain('OrderId')
    await clickButtonText(body, '取消')
    expect(wrapper.emitted('change')).toBeUndefined()

    await wrapper.get('[data-action="edit"]').trigger('click')
    const parameter = wrapper.findComponent(FilterValueFunctionDialog).findAllComponents(ElSelect)[1]
    if (!parameter) throw new Error('missing SystemData parameter control')
    parameter.vm.$emit('update:modelValue', 'OrderId')
    await body.get('[data-function-confirm]').trigger('click')
    expect(wrapper.emitted('change')?.[0]?.[0]).toEqual({
      contextKey: 'design:SPACE-1:MODEL-1:FIELD-1', value: JSON.stringify(systemData),
    })
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    wrapper.unmount()

    const tableValue = { Type: 'GetRefData', RefTableName: 'Orders', RefFieldName: 'Id', FkFieldName: 'Id', Extra: false }
    const tableEditor = editor(JSON.stringify(tableValue), { tables })
    await tableEditor.get('[data-action="edit"]').trigger('click')
    const tableDialog = tableEditor.findComponent(FilterValueFunctionDialog)
    expect(tableDialog.props('context').tables).toEqual(tables)
    await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click')
    expect(tableEditor.emitted('change')?.[0]?.[0]).toEqual({
      contextKey: 'design:SPACE-1:MODEL-1:FIELD-1', value: JSON.stringify(tableValue),
    })
  })

  it('preserves constants and allows explicit clearing while damaged source stays unchanged', async () => {
    const constant = { Type: 'GetConstValue', Value: false, Extra: { zero: 0, empty: null } }
    const wrapper = editor(JSON.stringify(constant))
    await wrapper.get('[data-action="edit"]').trigger('click')
    await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click')
    expect(wrapper.emitted('change')?.[0]?.[0]).toEqual({
      contextKey: 'design:SPACE-1:MODEL-1:FIELD-1', value: JSON.stringify(constant),
    })
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    wrapper.unmount()

    const damaged = '{broken json'
    const damagedEditor = editor(damaged)
    expect(damagedEditor.get('[role="alert"]').text()).toContain('原文已保留')
    await damagedEditor.get('[data-action="edit"]').trigger('click')
    await clickButtonText(new DOMWrapper(document.body), '取消')
    expect(damagedEditor.props('modelValue')).toBe(damaged)
    expect(damagedEditor.emitted('change')).toBeUndefined()
    await damagedEditor.get('[data-action="clear"]').trigger('click')
    expect(damagedEditor.emitted('change')?.[0]?.[0]).toEqual({
      contextKey: 'design:SPACE-1:MODEL-1:FIELD-1', value: '',
    })
    await damagedEditor.get('[data-action="edit"]').trigger('click')
    const typeSelect = damagedEditor.findComponent(FilterValueFunctionDialog).findAllComponents(ElSelect)[0]
    if (!typeSelect) throw new Error('missing function type control for damaged-value repair')
    typeSelect.vm.$emit('update:modelValue', 'SystemData')
    await flushPromises()
    const parameter = damagedEditor.findComponent(FilterValueFunctionDialog).findAllComponents(ElSelect)[1]
    if (!parameter) throw new Error('missing SystemData parameter control for damaged-value repair')
    parameter.vm.$emit('update:modelValue', 'UserID')
    await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click')
    expect(damagedEditor.emitted('change')?.[1]?.[0]).toEqual({
      contextKey: 'design:SPACE-1:MODEL-1:FIELD-1', value: JSON.stringify({ Type: 'SystemData', ParamName: 'UserID' }),
    })
  })

  it('keeps unknown types intact until a valid replacement is explicitly selected', async () => {
    const unknown = JSON.stringify({ Type: 'FutureFunction', Value: 0, Extension: null })
    const wrapper = editor(unknown)
    expect(wrapper.get('[role="alert"]').text()).toContain('原文已保留')
    await wrapper.get('[data-action="edit"]').trigger('click')
    const dialog = wrapper.findComponent(FilterValueFunctionDialog)
    const types = dialog.findAllComponents(ElSelect)[0]
    if (!types) throw new Error('missing function type control')
    types.vm.$emit('update:modelValue', 'SystemData')
    await flushPromises()
    const parameter = wrapper.findComponent(FilterValueFunctionDialog).findAllComponents(ElSelect)[1]
    if (!parameter) throw new Error('missing SystemData parameter control')
    parameter.vm.$emit('update:modelValue', 'UserID')
    await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click')
    expect(wrapper.emitted('change')?.[0]?.[0]).toEqual({
      contextKey: 'design:SPACE-1:MODEL-1:FIELD-1', value: JSON.stringify({ Type: 'SystemData', ParamName: 'UserID' }),
    })
  })

  it('rejects dialog callbacks captured before value, context, identity, or disabled state changes', async () => {
    const value = JSON.stringify({ Type: 'SystemData', ParamName: 'UserID' })
    const wrapper = editor(value, { systemParams: [{ label: '用户', value: 'UserID' }] })
    await wrapper.get('[data-action="edit"]').trigger('click')

    let dialog = wrapper.findComponent(FilterValueFunctionDialog)
    let listener: unknown = dialog.vm.$.vnode.props?.['onConfirm']
    await wrapper.setProps({ modelValue: JSON.stringify({ Type: 'SystemData', ParamName: 'UserName' }) })
    invokeStaleListener(listener, { Type: 'SystemData', ParamName: 'UserID' })
    expect(wrapper.emitted('change')).toBeUndefined()

    dialog = wrapper.findComponent(FilterValueFunctionDialog)
    listener = dialog.vm.$.vnode.props?.['onConfirm']
    await wrapper.setProps({ functionContext: { systemParams: [{ label: '姓名', value: 'UserName' }] } })
    invokeStaleListener(listener, { Type: 'SystemData', ParamName: 'UserID' })
    expect(wrapper.emitted('change')).toBeUndefined()

    dialog = wrapper.findComponent(FilterValueFunctionDialog)
    listener = dialog.vm.$.vnode.props?.['onConfirm']
    await wrapper.setProps({ contextKey: 'design:SPACE-1:MODEL-2:FIELD-1' })
    invokeStaleListener(listener, { Type: 'SystemData', ParamName: 'UserID' })
    expect(wrapper.emitted('change')).toBeUndefined()

    dialog = wrapper.findComponent(FilterValueFunctionDialog)
    listener = dialog.vm.$.vnode.props?.['onConfirm']
    await wrapper.setProps({ disabled: true })
    await wrapper.setProps({ disabled: false })
    invokeStaleListener(listener, { Type: 'SystemData', ParamName: 'UserID' })
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('offers no role-category branch and blocks applying a stored role value', async () => {
    const roleValue = JSON.stringify({ Type: 'GetUserMasterId', refType: 'role', roleClassId: 'legacy' })
    const wrapper = editor(roleValue)
    await wrapper.get('[data-action="edit"]').trigger('click')
    const dialog = wrapper.findComponent(FilterValueFunctionDialog)
    const definition = dialog.props('context').definitions?.find(item => item.type === 'GetUserMasterId')
    expect(definition?.fields.map(field => field.key)).toEqual(['refType', 'depLevel', 'getChildDep'])
    expect(definition?.fields[0]?.options).toEqual([{ label: '部门级别', value: 'dep' }])
    expect(wrapper.text()).not.toContain('角色分类')
    await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click')
    expect(new DOMWrapper(document.body).get('[role="alert"]').text()).toContain('已停用的角色分类分支')
    expect(wrapper.props('modelValue')).toBe(roleValue)
    expect(wrapper.emitted('change')).toBeUndefined()
  })
})
