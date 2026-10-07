import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AiToolApprovalCard from '../../ai/components/approval/AiToolApprovalCard/AiToolApprovalCard.vue'
import type { ToolApprovalDisplayItem } from '../../ai/types'

function makeApprovalRequest(overrides: Partial<ToolApprovalDisplayItem> = {}): ToolApprovalDisplayItem {
  return {
    id: 'req-1',
    toolName: 'createRecord',
    argsPreview: '{"table":"Orders","values":{"name":"Test"}}',
    moduleId: 'orders-module',
    ...overrides,
  }
}

const defaultStubs = {
  ElCard: { template: '<div><slot /></div>' },
  ElTag: { template: '<span><slot /></span>', props: ['type', 'size'] },
  ElIcon: { template: '<i />' },
  ElTooltip: { template: '<div><slot /></div>' },
  ElButton: {
    template: '<button @click="$emit(\'click\')"><slot /></button>',
    props: ['size', 'type'],
    emits: ['click'],
  },
  ElInput: {
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'placeholder', 'size'],
    emits: ['update:modelValue'],
  },
}

function findButtonByText(wrapper: ReturnType<typeof mount>, text: string) {
  const buttons = wrapper.findAll('button')
  return buttons.find((b) => b.text() === text)
}

describe('AiToolApprovalCard', () => {
  it('renders tool name and module id', () => {
    const wrapper = mount(AiToolApprovalCard, {
      props: {
        request: makeApprovalRequest({ toolName: 'deleteRecord', moduleId: 'crm' }),
      },
      global: { stubs: defaultStubs },
    })

    expect(wrapper.text()).toContain('deleteRecord')
    expect(wrapper.text()).toContain('crm')
    expect(wrapper.text()).toContain('待审批')
  })

  it('renders args preview', () => {
    const wrapper = mount(AiToolApprovalCard, {
      props: {
        request: makeApprovalRequest({ argsPreview: '{"key":"value"}' }),
      },
      global: { stubs: defaultStubs },
    })

    expect(wrapper.text()).toContain('{"key":"value"}')
  })

  it('emits allow with request id', async () => {
    const wrapper = mount(AiToolApprovalCard, {
      props: { request: makeApprovalRequest({ id: 'req-allow' }) },
      global: { stubs: defaultStubs },
    })

    const allowBtn = findButtonByText(wrapper, '允许')
    await allowBtn!.trigger('click')

    expect(wrapper.emitted('allow')).toEqual([['req-allow']])
  })

  it('emits abort with request id and reason', async () => {
    const wrapper = mount(AiToolApprovalCard, {
      props: { request: makeApprovalRequest({ id: 'req-abort' }) },
      global: { stubs: defaultStubs },
    })

    const abortBtn = findButtonByText(wrapper, '中止')
    await abortBtn!.trigger('click')

    expect(wrapper.emitted('abort')).toEqual([['req-abort', '用户中止']])
  })

  it('shows reject reason input when reject is clicked', async () => {
    const wrapper = mount(AiToolApprovalCard, {
      props: { request: makeApprovalRequest() },
      global: { stubs: defaultStubs },
    })

    const rejectBtn = findButtonByText(wrapper, '拒绝')
    await rejectBtn!.trigger('click')

    expect(wrapper.text()).toContain('确认拒绝')
    expect(wrapper.text()).toContain('取消')
  })

  it('emits reject with id and reason on confirm', async () => {
    const wrapper = mount(AiToolApprovalCard, {
      props: { request: makeApprovalRequest({ id: 'req-confirm' }) },
      global: { stubs: defaultStubs },
    })

    // 进入拒绝输入态
    const rejectBtn = findButtonByText(wrapper, '拒绝')
    await rejectBtn!.trigger('click')

    // 设置拒绝原因
    const input = wrapper.find('input')
    await input.setValue('不需要此操作')

    // 点击确认拒绝
    const confirmBtn = findButtonByText(wrapper, '确认拒绝')
    await confirmBtn!.trigger('click')

    expect(wrapper.emitted('reject')).toEqual([['req-confirm', '不需要此操作']])
  })
})
