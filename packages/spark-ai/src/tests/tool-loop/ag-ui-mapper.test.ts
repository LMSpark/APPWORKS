import { describe, expect, it } from 'vitest'
import type { AiAgentToolCallRecord, AiAgentStreamEvent } from '../../agent'
import {
  sparkAgUi,
} from '../../agent'
import type { AiAgentTransportToolSpec } from '../../agent/conversation/transport/transport-types'

function createTool(): AiAgentTransportToolSpec {
  return {
    type: 'function',
    function: {
      name: 'inspectPage',
      description: 'Inspect a page.',
      parameters: {
        type: 'object',
        properties: {
          pageId: { type: 'string' },
        },
        required: ['pageId'],
        additionalProperties: false,
      },
      strict: true,
    },
  }
}

function createToolCallRecord(): AiAgentToolCallRecord {
  return {
    toolName: 'inspectPage',
    args: { pageId: 'home' },
    turnId: 'turn-1',
    round: 2,
    callId: 'call-1',
    status: 'success',
    result: { ok: true, summary: 'done' },
    durationMs: 12,
  }
}

function createStreamEvent(): AiAgentStreamEvent {
  return {
    type: 'delta',
    data: { delta: 'hello' },
    turnKey: 'business:instance:turn-1',
    streamKey: 'business:instance:turn-1:llm',
    scope: {
      businessRegistrationId: 'business',
      businessInstanceId: 'instance',
      eventModuleId: 'llm',
      turnId: 'turn-1',
    },
  }
}

describe('spark AG-UI mapper', () => {
  it('maps transport tools into AG-UI tools without losing schema fields', () => {
    const mapped = sparkAgUi.toSparkAgUiTool(createTool())

    expect(mapped.name).toBe('inspectPage')
    expect(mapped.description).toBe('Inspect a page.')
    expect(mapped.parameters).toEqual(createTool().function.parameters)
    expect(mapped.metadata).toEqual({
      source: 'spark-ai',
      type: 'function',
      strict: true,
    })
  })

  it('creates stable run and text events', () => {
    expect(sparkAgUi.createSparkAgUiRunStartedEvent({
      threadId: 'thread-1',
      runId: 'run-1',
      timestamp: 1,
    })).toMatchObject({
      type: 'RUN_STARTED',
      threadId: 'thread-1',
      runId: 'run-1',
      timestamp: 1,
    })

    expect(sparkAgUi.createSparkAgUiTextMessageStartEvent({ messageId: 'message-1' })).toMatchObject({
      type: 'TEXT_MESSAGE_START',
      messageId: 'message-1',
      role: 'assistant',
    })
    expect(sparkAgUi.createSparkAgUiTextMessageContentEvent({
      messageId: 'message-1',
      delta: 'hello',
    })).toMatchObject({
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: 'message-1',
      delta: 'hello',
    })
    expect(sparkAgUi.createSparkAgUiTextMessageEndEvent({ messageId: 'message-1' })).toMatchObject({
      type: 'TEXT_MESSAGE_END',
      messageId: 'message-1',
    })
  })

  it('creates tool lifecycle events from a completed tool call record', () => {
    const events = sparkAgUi.createSparkAgUiToolCallEvents(createToolCallRecord(), { timestamp: 2 })

    expect(events.map((event) => event.type)).toEqual([
      'TOOL_CALL_START',
      'TOOL_CALL_ARGS',
      'TOOL_CALL_END',
      'TOOL_CALL_RESULT',
    ])
    expect(events[0]).toMatchObject({
      toolCallId: 'call-1',
      toolCallName: 'inspectPage',
      parentMessageId: 'spark-assistant:turn-1',
      timestamp: 2,
    })
    expect(events[1]).toMatchObject({
      toolCallId: 'call-1',
      delta: '{"pageId":"home"}',
    })
    expect(events[3]).toMatchObject({
      messageId: 'spark-tool-result:call-1',
      toolCallId: 'call-1',
      role: 'tool',
      content: '{"ok":true,"summary":"done"}',
    })
  })

  it('creates custom stream, error, and finished events', () => {
    expect(sparkAgUi.createSparkAgUiStreamCustomEvent(createStreamEvent())).toMatchObject({
      type: 'CUSTOM',
      name: 'spark.stream.event',
      value: {
        type: 'delta',
        data: { delta: 'hello' },
        scope: expect.objectContaining({ turnId: 'turn-1' }),
      },
    })
    expect(sparkAgUi.createSparkAgUiCustomEvent('spark.toolApproval.requested', { id: 'approval-1' })).toMatchObject({
      type: 'CUSTOM',
      name: 'spark.toolApproval.requested',
      value: { id: 'approval-1' },
    })
    expect(sparkAgUi.createSparkAgUiRunErrorEvent({ message: 'failed', code: 'X' })).toMatchObject({
      type: 'RUN_ERROR',
      message: 'failed',
      code: 'X',
    })
    expect(sparkAgUi.createSparkAgUiRunFinishedEvent({
      threadId: 'thread-1',
      runId: 'run-1',
    })).toMatchObject({
      type: 'RUN_FINISHED',
      threadId: 'thread-1',
      runId: 'run-1',
      outcome: { type: 'success' },
    })
  })
})
