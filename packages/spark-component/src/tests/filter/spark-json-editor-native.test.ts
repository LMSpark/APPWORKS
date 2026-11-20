import {afterEach, expect, it, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {EditorView} from '@codemirror/view'
import SparkJsonEditor from '../../components/editors/SparkJsonEditor.vue'

afterEach(() => {vi.unstubAllGlobals()})

it.each([0, 600])('retains pending native text through disable (%i ms) and enable before delivering the original buffer', async (disabledMs) => {
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const original = {field: 'Name', operator: 'eq' as const, value: 'original'}
  const edited = {...original, value: 'pending through readonly'}
  const wrapper = mount(SparkJsonEditor, {attachTo: document.body, props: {modelValue: JSON.stringify(original), mode:'tree'}, global: {plugins: [ElementPlus]}})
  try {
    await vi.dynamicImportSettled(); await flushPromises()
    const text = wrapper.findAll('button').find(button => button.text().trim().toLowerCase() === 'text')
    await text?.trigger('click'); await flushPromises()
    const native = EditorView.findFromDOM(wrapper.get<HTMLElement>('.cm-editor').element)
    if (!native) throw new Error('missing native text editor')
    native.dispatch({changes: {from: 0, to: native.state.doc.length, insert: JSON.stringify(edited)}})
    await wrapper.get('.cm-content').trigger('input')
    await wrapper.setProps({readOnly: true})
    if (disabledMs) await new Promise(resolve => setTimeout(resolve, disabledMs))
    await wrapper.setProps({readOnly: false})
    await flushPromises()
    expect(wrapper.get('.cm-content').text()).toContain('pending through readonly')
    expect(JSON.parse(String(wrapper.emitted('update:modelValue')?.at(-1)?.[0]))).toEqual(edited)
  } finally {wrapper.unmount()}
})

it('retains invalid and repaired text through native mode switches', async () => {
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const original = {field: 'Name', operator: 'eq' as const, value: 'kept'}
  const wrapper = mount(SparkJsonEditor, {attachTo: document.body, props: {modelValue: JSON.stringify(original), mode:'tree'},
    global: {plugins: [ElementPlus]}})
  try {
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
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['{invalid'])
    expect(native.state.doc.toString()).toBe('{invalid')
    const repaired = {...original, value: 'kept after repair'}
    native.dispatch({changes: {from: 0, to: native.state.doc.length, insert: JSON.stringify(repaired)}})
    await wrapper.get('.spark-json-editor').trigger('focusout'); await flushPromises()
    const tree = wrapper.findAll('button').find(button => button.text().trim().toLowerCase() === 'tree')
    expect(tree).toBeDefined()
    await tree?.trigger('click'); await flushPromises()
    expect(wrapper.find('.cm-editor').exists()).toBe(false)
    expect(wrapper.text()).toContain('kept after repair')
    expect(JSON.parse(String(wrapper.emitted('update:modelValue')?.at(-1)?.[0]))).toEqual(repaired)
  } finally {wrapper.unmount()}
})
