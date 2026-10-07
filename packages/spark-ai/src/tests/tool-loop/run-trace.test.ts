import { describe, expect, it } from 'vitest'
import {
  createAiAgentRunTrace,
  type AiAgentFunctionCallResult,
  type AiAgentStreamEvent,
  type AiAgentToolCallRecord,
} from '../../agent'

type StreamEventOptions = Readonly<{
  type?: string
  data?: unknown
  scope?: AiAgentStreamEvent['scope']
}>

function makeStreamEvent(options: StreamEventOptions = {}): AiAgentStreamEvent {
  const defaults = {
    type: 'delta',
    data: 'hello',
    turnKey: 'kind::instance-1::turn-1',
    streamKey: 'kind::instance-1::turn-1::stream-1',
    scope: {
      businessRegistrationId: 'reg-1',
      businessInstanceId: 'instance-1',
      eventModuleId: 'module-1',
      turnId: 'turn-1',
    },
  }
  return { ...defaults, ...options }
}

function makeToolCallRecord(): AiAgentToolCallRecord {
  const result: AiAgentFunctionCallResult<unknown> = { ok: true, data: 'done' }
  return {
    toolName: 'model_script',
    args: { script: 'return this.readRule()' },
    turnId: 'turn-1',
    round: 1,
    callId: 'call-1',
    status: 'success',
    result,
    durationMs: 150,
  }
}

describe('AiAgentRunTrace', () => {
  it('records a compact headless stream projection without Vue', () => {
    const trace = createAiAgentRunTrace({ now: () => 100 })

    trace.appendUserMessage('生成一个请假页面')
    trace.appendEvent(makeStreamEvent({ type: 'reasoning' }))
    trace.appendReasoning('分析页面结构')
    trace.appendEvent(makeStreamEvent({ type: 'delta' }))
    trace.appendDelta('已生成')
    trace.appendEvent(makeStreamEvent({ type: 'message.completed' }))

    const snapshot = trace.snapshot()
    expect(snapshot.streamText).toBe('已生成')
    expect(snapshot.reasoningText).toBe('分析页面结构')
    expect(snapshot.isStreaming).toBe(false)
    expect(snapshot.entries.map((entry) => entry.kind)).toEqual([
      'user-message',
      'reasoning',
      'assistant-complete',
    ])
  })

  it('records tool call previews as compact diagnostics', () => {
    const trace = createAiAgentRunTrace({
      argsPreviewLimit: 12,
      resultPreviewLimit: 12,
    })

    trace.appendToolCall(makeToolCallRecord())

    const snapshot = trace.snapshot()
    expect(snapshot.toolCalls).toHaveLength(1)
    expect(snapshot.toolCalls[0]?.toolName).toBe('model_script')
    expect(snapshot.toolCalls[0]?.argsPreview.length).toBeGreaterThan(0)
    expect(snapshot.entries[0]?.kind).toBe('tool-call')
  })

  it('notifies subscribers with immutable snapshots', () => {
    const trace = createAiAgentRunTrace()
    const snapshots: number[] = []
    const unsubscribe = trace.subscribe((snapshot) => {
      snapshots.push(snapshot.entries.length)
    })

    trace.appendUserMessage('hello')
    trace.appendEvent(makeStreamEvent({ type: 'delta' }))
    trace.appendDelta('hi')
    unsubscribe()
    trace.appendDelta(' there')

    expect(snapshots).toEqual([1, 1, 2])
  })
})
