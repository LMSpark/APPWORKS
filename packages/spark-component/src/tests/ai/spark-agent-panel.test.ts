import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('../../ai/components/diagnostics/AiSessionTracePanel/AiSessionTracePanel.vue', () => ({
  default: {
    name: 'AiSessionTracePanel',
    props: ['entries', 'isStreaming', 'isReasoning', 'diagnostics', 'height', 'emptyText'],
    template: '<div data-testid="trace-panel"><span v-if="entries.length === 0" data-testid="trace-empty" /></div>',
  },
}))

import SparkAgentPanel from '../../ai/components/SparkAgentPanel/SparkAgentPanel.vue'
import type {
  SessionDiagnosticsData,
  SparkAgentTimelineEvent,
  StreamDisplayEntry,
} from '../../ai/types'

function createEmptyDiagnostics(): SessionDiagnosticsData {
  return {
    summary: {
      status: null,
      historyCount: 0,
      messageCount: 0,
      toolCallCount: 0,
      failedToolCallCount: 0,
      functionNames: [],
      lastAssistantText: '',
    },
    transcript: [],
    issues: [],
  }
}

function createEntry(): StreamDisplayEntry {
  return { kind: 'user-message', content: 'hello', timestamp: 1 }
}

function createTimelineEvent(): SparkAgentTimelineEvent {
  return {
    sequence: 1,
    type: 'RUN_STARTED',
    timestamp: 1,
    payloadPreview: '{"type":"RUN_STARTED"}',
  }
}

function createElementPlusStubs() {
  return {
    'el-empty': {
      template: '<div data-testid="el-empty">{{ description }}</div>',
      props: ['description'],
    },
    'el-scrollbar': {
      template: '<div data-testid="el-scrollbar"><slot /></div>',
    },
  }
}

describe('SparkAgentPanel', () => {
  it('delegates trace rendering to AiSessionTracePanel', () => {
    const entries = [createEntry()]
    const wrapper = mount(SparkAgentPanel, {
      props: {
        entries,
        isStreaming: true,
        isReasoning: false,
        diagnostics: createEmptyDiagnostics(),
        emptyText: 'empty trace',
      },
      global: { stubs: createElementPlusStubs() },
    })

    const tracePanel = wrapper.findComponent({ name: 'AiSessionTracePanel' })
    expect(tracePanel.exists()).toBe(true)
    expect(tracePanel.props('entries')).toEqual(entries)
    expect(tracePanel.props('isStreaming')).toBe(true)
    expect(tracePanel.props('emptyText')).toBe('empty trace')
    expect(wrapper.text()).not.toContain('RUN_STARTED')
  })

  it('shows delegated empty state when no trace entries and timeline is hidden', () => {
    const wrapper = mount(SparkAgentPanel, {
      props: {
        entries: [],
        isStreaming: false,
        isReasoning: false,
        diagnostics: createEmptyDiagnostics(),
      },
      global: { stubs: createElementPlusStubs() },
    })

    expect(wrapper.find('[data-testid="trace-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="el-empty"]').exists()).toBe(false)
  })

  it('renders optional AG-UI timeline projection', () => {
    const wrapper = mount(SparkAgentPanel, {
      props: {
        entries: [createEntry()],
        isStreaming: false,
        isReasoning: false,
        diagnostics: createEmptyDiagnostics(),
        showTimeline: true,
        timelineEvents: [createTimelineEvent()],
      },
      global: { stubs: createElementPlusStubs() },
    })

    expect(wrapper.text()).toContain('事件流')
    expect(wrapper.text()).toContain('RUN_STARTED')
    expect(wrapper.text()).toContain('{"type":"RUN_STARTED"}')
  })

  it('shows timeline empty state when timeline is enabled without events', () => {
    const wrapper = mount(SparkAgentPanel, {
      props: {
        entries: [],
        isStreaming: false,
        isReasoning: false,
        diagnostics: createEmptyDiagnostics(),
        showTimeline: true,
        timelineEvents: [],
        timelineEmptyText: '没有 AG-UI 事件',
      },
      global: { stubs: createElementPlusStubs() },
    })

    expect(wrapper.find('[data-testid="el-empty"]').text()).toContain('没有 AG-UI 事件')
  })
})
