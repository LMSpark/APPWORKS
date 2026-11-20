import { describe, expect, it } from 'vitest'

import {
  createAiAgentSessionTranscript,
  summarizeAiAgentSessionRecord,
  type AiAgentSessionRecord,
} from '../../agent'

// ── Fixture ─────────────────────────────────────────────────

function sessionRecord(): AiAgentSessionRecord {
  return {
    moduleId: 'ticket',
    moduleInstanceId: 'ticket-a',
    instanceId: 'ticket-a',
    runtimeInstanceId: 'ticket-a',
    status: 'Started',
    startedAt: 1000,
    updatedAt: 3000,
    history: [
      {
        kind: 'message',
        moduleId: 'ticket',
        moduleInstanceId: 'ticket-a',
        instanceId: 'ticket-a',
        runtimeInstanceId: 'ticket-a',
        id: 'm1',
        seq: 1,
        timestamp: 1000,
        role: 'user',
        source: 'ui',
        content: '处理工单',
      },
      {
        kind: 'functionCall',
        moduleId: 'ticket',
        moduleInstanceId: 'ticket-a',
        instanceId: 'ticket-a',
        runtimeInstanceId: 'ticket-a',
        id: 'f1',
        seq: 2,
        timestamp: 2000,
        toolName: 'model_script',
        args: { script: 'return this.summarize()' },
        status: 'failed',
        error: { ok: false, code: 'BAD', msg: 'bad args', fix: 'fix args' },
      },
      {
        kind: 'message',
        moduleId: 'ticket',
        moduleInstanceId: 'ticket-a',
        instanceId: 'ticket-a',
        runtimeInstanceId: 'ticket-a',
        id: 'm2',
        seq: 3,
        timestamp: 3000,
        role: 'assistant',
        source: 'llm',
        content: '已完成',
      },
    ],
  }
}

// ── Assertions ──────────────────────────────────────────────

describe('session diagnostics', () => {
  it('summarizes session history without business assumptions', () => {
    expect(summarizeAiAgentSessionRecord(sessionRecord())).toMatchObject({
      status: 'Started',
      historyCount: 3,
      messageCount: 2,
      toolCallCount: 1,
      failedToolCallCount: 1,
      functionNames: ['model_script'],
      lastAssistantText: '已完成',
    })
  })

  it('creates a bounded transcript', () => {
    const transcript = createAiAgentSessionTranscript(sessionRecord(), { contentLimit: 3 })

    expect(transcript).toHaveLength(3)
    expect(transcript[0]).toMatchObject({ direction: 'USER => AGENT', content: expect.stringContaining('...<truncated') })
    expect(transcript[1]).toMatchObject({ direction: 'AGENT TOOL => LLM', toolName: 'model_script' })
    expect(transcript[2]).toMatchObject({ direction: 'LLM => AGENT', content: '已完成' })
  })
})
