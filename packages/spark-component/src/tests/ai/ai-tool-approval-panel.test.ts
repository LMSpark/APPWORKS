import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AiToolApprovalPanel from '../../ai/components/approval/AiToolApprovalPanel/AiToolApprovalPanel.vue'
import type { ToolApprovalDisplayItem } from '../../ai/types'

function makeApprovalRequest(id: string): ToolApprovalDisplayItem {
  return {
    id,
    toolName: 'testTool',
    argsPreview: '{}',
    moduleId: 'test-module',
  }
}

describe('AiToolApprovalPanel', () => {
  it('shows empty state when pending is empty', () => {
    const wrapper = mount(AiToolApprovalPanel, {
      props: { pending: [] },
      global: {
        stubs: {
          ElEmpty: { template: '<div data-testid="empty">No pending</div>', props: ['description', 'imageSize'] },
          AiToolApprovalCard: { template: '<div data-testid="card" />', props: ['request'] },
        },
      },
    })

    expect(wrapper.find('[data-testid="empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="card"]').exists()).toBe(false)
  })

  it('renders approval cards for each pending request', () => {
    const pending: readonly ToolApprovalDisplayItem[] = [
      makeApprovalRequest('req-1'),
      makeApprovalRequest('req-2'),
    ]

    const wrapper = mount(AiToolApprovalPanel, {
      props: { pending },
      global: {
        stubs: {
          ElEmpty: { template: '<div data-testid="empty" />', props: ['description', 'imageSize'] },
          AiToolApprovalCard: { template: '<div data-testid="card" />', props: ['request'] },
        },
      },
    })

    expect(wrapper.findAll('[data-testid="card"]').length).toBe(2)
  })

  it('uses custom empty text', () => {
    const wrapper = mount(AiToolApprovalPanel, {
      props: { pending: [], emptyText: '暂无待审批工具' },
      global: {
        stubs: {
          ElEmpty: { template: '<div>{{ description }}</div>', props: ['description', 'imageSize'] },
          AiToolApprovalCard: { template: '<div />', props: ['request'] },
        },
      },
    })

    expect(wrapper.text()).toContain('暂无待审批工具')
  })
})
