import {afterEach, expect, it, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {EditorView} from '@codemirror/view'
import FilterExpressionEditor from '../../components/containers/filter/expression/FilterExpressionEditor/FilterExpressionEditor.vue'

afterEach(() => {vi.unstubAllGlobals()})

it.each([0, 600])('retains pending native text through disable (%i ms) and enable before explicit apply', async (disabledMs) => {
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const original = {field: 'Name', operator: 'eq' as const, value: 'original'}
  const edited = {...original, value: 'pending through readonly'}
  const wrapper = mount(FilterExpressionEditor, {attachTo: document.body, props: {display: 'inline', modelValue: original, columns: [{name: 'Name', type: 'string'}]}, global: {plugins: [ElementPlus]}})
  try {
    await wrapper.get('[data-action="json"]').trigger('click')
    await vi.dynamicImportSettled(); await flushPromises()
    const text = wrapper.findAll('button').find(button => button.text().trim().toLowerCase() === 'text')
    await text?.trigger('click'); await flushPromises()
    const native = EditorView.findFromDOM(wrapper.get<HTMLElement>('.cm-editor').element)
    if (!native) throw new Error('missing native text editor')
    native.dispatch({changes: {from: 0, to: native.state.doc.length, insert: JSON.stringify(edited)}})
    await wrapper.get('.cm-content').trigger('input')
    await wrapper.setProps({disabled: true})
    if (disabledMs) await new Promise(resolve => setTimeout(resolve, disabledMs))
    await wrapper.setProps({disabled: false})
    await flushPromises()
    expect(wrapper.get('.cm-content').text()).toContain('pending through readonly')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.get('[data-action="apply"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[edited]])
  } finally {wrapper.unmount()}
})

it('mounts the existing JSON editor and switches its native modes without applying the filter', async () => {
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const original = {field: 'Name', operator: 'eq' as const, value: 'kept'}
  const wrapper = mount(FilterExpressionEditor, {attachTo: document.body, props: {display: 'inline', modelValue: original, columns: [{name: 'Name', type: 'string'}]},
    global: {plugins: [ElementPlus]}})
  try {
    await wrapper.get('[data-action="json"]').trigger('click')
    await vi.dynamicImportSettled(); await flushPromises()
    expect(wrapper.find('.spark-json-editor__fallback').exists()).toBe(false)
    const text = wrapper.findAll('button').find(button => button.text().trim().toLowerCase() === 'text')
    expect(text, wrapper.text()).toBeDefined()
    await text?.trigger('click'); await flushPromises()
    expect(wrapper.find('.cm-editor').exists()).toBe(true)
    const native = EditorView.findFromDOM(wrapper.get<HTMLElement>('.cm-editor').element)
    if (!native) throw new Error('missing native text editor')
    native.dispatch({changes: {from: 0, to: native.state.doc.length, insert: '{invalid'}})
    await wrapper.get('.spark-json-editor').trigger('focusout'); await flushPromises()
    await wrapper.get('[data-action="apply"]').trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toContain('过滤表达式不是有效 JSON')
    expect(native.state.doc.toString()).toBe('{invalid')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    const repaired = {...original, value: 'kept after repair'}
    native.dispatch({changes: {from: 0, to: native.state.doc.length, insert: JSON.stringify(repaired)}})
    await wrapper.get('.spark-json-editor').trigger('focusout'); await flushPromises()
    const tree = wrapper.findAll('button').find(button => button.text().trim().toLowerCase() === 'tree')
    expect(tree).toBeDefined()
    await tree?.trigger('click'); await flushPromises()
    expect(wrapper.find('.cm-editor').exists()).toBe(false)
    expect(wrapper.text()).toContain('kept after repair')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.get('[data-action="apply"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[repaired]])
  } finally {wrapper.unmount()}
})
