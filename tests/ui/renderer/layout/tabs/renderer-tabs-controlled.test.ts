import {expect, it, vi} from 'vitest'
import {flushPromises, mount} from '@vue/test-utils'
import {h} from 'vue'
import ElementPlus, {ElTabs, ElTabPane} from 'element-plus'
import {RendererTabs, RendererTabPane} from '@spark-appworks/spark-component'

it.each([true, false])('keeps controlled=%s tab identity consistent with the accepted parent value', async controlled => {
  const wrapper = mount(RendererTabs, {props: controlled ? {modelValue: 'a'} : {}, slots: {default: () => [
    h(RendererTabPane, {index: 0, name: 'a', label: 'Alpha'}, () => 'A body'),
    h(RendererTabPane, {index: 1, name: 'b', label: 'Beta'}, () => 'B body'),
  ]}, global: {plugins: [ElementPlus], stubs: {'el-tabs': ElTabs, 'el-tab-pane': ElTabPane}}})
  try {
    await flushPromises()
    await wrapper.get('#tab-b').trigger('click'); await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['b'])
    expect(wrapper.get(controlled ? '#tab-a' : '#tab-b').attributes('aria-selected')).toBe('true')
    if (controlled) {
      await wrapper.setProps({modelValue: 'b'}); await flushPromises()
      expect(wrapper.get('#tab-b').attributes('aria-selected')).toBe('true')
    }
  } finally {wrapper.unmount()}
})

it('emits one accepted controlled update per real tab click', async () => {
  const accept = vi.fn<(value: string | number) => void>()
  const wrapper = mount(RendererTabs, {props: {modelValue: 'a', 'onUpdate:modelValue': accept}, slots: {default: () => [
    h(RendererTabPane, {index: 0, name: 'a', label: 'Alpha'}), h(RendererTabPane, {index: 1, name: 'b', label: 'Beta'}),
  ]}, global: {plugins: [ElementPlus], stubs: {'el-tabs': ElTabs, 'el-tab-pane': ElTabPane}}})
  accept.mockImplementation(value => {void wrapper.setProps({modelValue: value})})
  try {
    await flushPromises(); await wrapper.get('#tab-b').trigger('click'); await flushPromises()
    expect(wrapper.get('#tab-b').attributes('aria-selected')).toBe('true')
    expect(accept).toHaveBeenCalledTimes(1)
  } finally {wrapper.unmount()}
})
