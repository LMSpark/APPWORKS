import { describe, expect, it } from 'vitest'

import {
  createAiAgentTransportTurn,
  createTurnEventCollector,
  type AiAgentAppSseEvent,
  type AiAgentAppSseEventSource,
  type AiAgentStreamEvent,
  type AiAgentStreamTurnInput,
} from '../../agent'

type TurnEventKind = 'delta' | 'reasoning' | 'result' | 'error' | 'done'

type TestEventHub = AiAgentAppSseEventSource & Readonly<{
  emit(event: AiAgentAppSseEvent): void
  listenerCount(): number
}>

const scope = {
  businessRegistrationId: 'demoRuntime',
  businessInstanceId: 'business-a',
  instanceId: 'business-a',
  runtimeInstanceId: 'business-a',
}

const turn = {
  turnId: 'turn-1',
  seq: 1,
  baseRevision: 0,
  queuedAt: '2026-05-20T00:00:00.000Z',
  startedAt: '2026-05-20T00:00:00.000Z',
  maxParallelTurns: 1,
}

const turnKey = 'demoRuntime::business-a::turn-1'
const streamKey = 'demoRuntime::business-a::turn-1::llm-stream'

function createTestEventHub(): TestEventHub {
  const listeners = new Map<string, Set<(event: AiAgentAppSseEvent) => void>>()
  return {
    on(name, listener) {
      let set = listeners.get(name)
      if (set === undefined) {
        set = new Set()
        listeners.set(name, set)
      }
      set.add(listener)
      return () => {
        set?.delete(listener)
        if (set?.size === 0) listeners.delete(name)
      }
    },
    emit(event) {
      const set = listeners.get(event.name)
      if (set === undefined) return
      for (const listener of set) listener(event)
    },
    listenerCount() {
      let count = 0
      for (const set of listeners.values()) count += set.size
      return count
    },
  }
}

function createTurnInput(callbacks: Partial<Pick<
  AiAgentStreamTurnInput,
  'onDelta' | 'onReasoning' | 'onUsage' | 'onStreamEvent' | 'signal'
>> = {}): AiAgentStreamTurnInput {
  return {
    sessionId: 'session-1',
    scope,
    turn,
    systemPrompt: 'system',
    tools: [],
    messages: [{ role: 'user', content: 'hello' }],
    ...callbacks,
  }
}

function createTurnAppEvent(
  kind: TurnEventKind,
  data: unknown,
  overrides: Partial<AiAgentAppSseEvent> = {},
): AiAgentAppSseEvent {
  const name = 'llm-frame'
  const frameType = kind === 'delta' || kind === 'reasoning'
    ? 'message.delta'
    : (kind === 'result' ? 'message.completed' : kind)
  const frameData = kind === 'delta'
    ? { part: 'content', delta: data }
    : (kind === 'reasoning' ? { part: 'reasoning', delta: data } : data)
  const payload = {
    sessionId: 'session-1',
    turnId: 'turn-1',
    frame: {
      type: frameType,
      data: frameData,
    },
  }
  return {
    name,
    ok: kind !== 'error',
    data: payload,
    rawData: JSON.stringify(payload),
    rawPayload: payload,
    protocolVersion: 4,
    context: {
      requestId: 'request-1',
      session: { sessionId: 'session-1' },
      turn: { turnId: 'turn-1', turnKey, seq: 1, baseRevision: 0 },
      stream: { streamId: 'llm-stream', streamKey },
      scope: {
        moduleId: 'demoRuntime',
        moduleInstanceId: 'business-a',
        instanceId: 'business-a',
      },
    },
    event: { transport: 'sse', name, terminal: kind === 'done' || kind === 'error' },
    ...overrides,
  }
}

describe('createTurnEventCollector', () => {
  it('aggregates APP SSE events into one turn result and relays callbacks', async () => {
    const hub = createTestEventHub()
    const deltas: string[] = []
    const reasoning: string[] = []
    const streamEvents: AiAgentStreamEvent[] = []
    const collector = createTurnEventCollector({
      input: createTurnInput({
        onDelta: (value) => deltas.push(value),
        onReasoning: (value) => reasoning.push(value),
        onStreamEvent: (event) => streamEvents.push(event),
      }),
      source: hub,
      timeoutMs: 1_000,
    })

    hub.emit(createTurnAppEvent('delta', 'he'))
    hub.emit(createTurnAppEvent('reasoning', 'thinking'))
    hub.emit(createTurnAppEvent('result', {
      text: 'hello',
      toolCalls: [{ id: 'call-1', type: 'function', function: { name: 'setReason', arguments: '{}' } }],
    }))

    await expect(collector.result).resolves.toEqual({
      text: 'hello',
      reasoning: 'thinking',
      toolCalls: [{
        id: 'call-1',
        type: 'function',
        function: { name: 'setReason', arguments: '{}' },
      }],
    })
    expect(deltas).toEqual(['he'])
    expect(reasoning).toEqual(['thinking'])
    expect(streamEvents.map((event) => event.type)).toEqual(['delta', 'reasoning', 'result'])
    expect(streamEvents[0]?.streamKey).toBe('')
    expect(hub.listenerCount()).toBe(0)
  })

  it('filters APP SSE events from other turns', async () => {
    const hub = createTestEventHub()
    const collector = createTurnEventCollector({
      input: createTurnInput(),
      source: hub,
      timeoutMs: 1_000,
    })

    hub.emit(createTurnAppEvent('result', { text: 'wrong' }, {
      data: {
        sessionId: 'other-session',
        turnId: 'turn-1',
        frame: { type: 'message.completed', data: { text: 'wrong' } },
      },
    }))
    hub.emit(createTurnAppEvent('result', { text: 'right' }))

    await expect(collector.result).resolves.toEqual({ text: 'right', toolCalls: [] })
    expect(hub.listenerCount()).toBe(0)
  })

  it('recovers tool_calls JSON emitted as assistant text', async () => {
    const hub = createTestEventHub()
    const collector = createTurnEventCollector({
      input: createTurnInput(),
      source: hub,
      timeoutMs: 1_000,
    })

    hub.emit(createTurnAppEvent('result', {
      text: JSON.stringify({
        tool_calls: [{
          id: 'call-1',
          type: 'function',
          function: {
            name: 'model_query',
            arguments: JSON.stringify({ kind: 'project', keyword: 'sampleKind' }),
          },
        }],
      }),
    }))

    await expect(collector.result).resolves.toEqual({
      text: '',
      toolCalls: [{
        id: 'call-1',
        type: 'function',
        function: {
          name: 'model_query',
          arguments: JSON.stringify({ kind: 'project', keyword: 'sampleKind' }),
        },
      }],
    })
  })

  it('recovers fenced pseudo tool_call text with args', async () => {
    const hub = createTestEventHub()
    const collector = createTurnEventCollector({
      input: createTurnInput(),
      source: hub,
      timeoutMs: 1_000,
    })

    hub.emit(createTurnAppEvent('result', {
      text: [
        '```json',
        JSON.stringify({
          tool_call: 'model_query',
          args: { kind: 'project', keyword: 'sampleKind' },
        }),
        '```',
      ].join('\n'),
    }))

    await expect(collector.result).resolves.toEqual({
      text: '',
      toolCalls: [{
        id: 'call_text_1',
        type: 'function',
        function: {
          name: 'model_query',
          arguments: JSON.stringify({ kind: 'project', keyword: 'sampleKind' }),
        },
      }],
    })
  })

  it('recovers multiple fenced tool_calls emitted as assistant text', async () => {
    const hub = createTestEventHub()
    const collector = createTurnEventCollector({
      input: createTurnInput(),
      source: hub,
      timeoutMs: 1_000,
    })

    hub.emit(createTurnAppEvent('result', {
      text: [
        'I will call tools.',
        '```json',
        JSON.stringify({
          tool_calls: [{
            id: 'call-1',
            type: 'function',
            function: {
              name: 'model_query',
              arguments: JSON.stringify({ kind: 'project', keyword: 'sampleKind' }),
            },
          }],
        }),
        '``````json',
        JSON.stringify({
          tool_calls: [{
            id: 'call-2',
            type: 'function',
            function: {
              name: 'model_script',
              arguments: JSON.stringify({ script: 'return { ok: true }' }),
            },
          }],
        }),
        '```',
      ].join('\n'),
    }))

    await expect(collector.result).resolves.toEqual({
      text: '',
      toolCalls: [
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'model_query',
            arguments: JSON.stringify({ kind: 'project', keyword: 'sampleKind' }),
          },
        },
        {
          id: 'call-2',
          type: 'function',
          function: {
            name: 'model_script',
            arguments: JSON.stringify({ script: 'return { ok: true }' }),
          },
        },
      ],
    })
  })

  it('recovers glm inline JSON tool_call blocks without closing tag', async () => {
    const hub = createTestEventHub()
    const collector = createTurnEventCollector({
      input: createTurnInput(),
      source: hub,
      timeoutMs: 1_000,
    })

    hub.emit(createTurnAppEvent('result', {
      text: '<tool_call>model_query({"kind":"project","keyword":"leave"})',
    }))

    await expect(collector.result).resolves.toEqual({
      text: '',
      toolCalls: [{
        id: 'call_inline_1',
        type: 'function',
        function: {
          name: 'model_query',
          arguments: JSON.stringify({
            kind: 'project',
            keyword: 'leave',
          }),
        },
      }],
    })
  })

  it('recovers bare ClassModel function-style tool calls emitted as assistant text', async () => {
    const hub = createTestEventHub()
    const collector = createTurnEventCollector({
      input: createTurnInput(),
      source: hub,
      timeoutMs: 1_000,
    })

    const call = 'model_action_guide({"kind":"project","actionName":"readProjectPlanningInput"})'
    hub.emit(createTurnAppEvent('result', {
      text: `${call}${call}`,
    }))

    await expect(collector.result).resolves.toEqual({
      text: '',
      toolCalls: [{
        id: 'call_bare_1',
        type: 'function',
        function: {
          name: 'model_action_guide',
          arguments: JSON.stringify({
            kind: 'project',
            actionName: 'readProjectPlanningInput',
          }),
        },
      }],
    })
  })

  it('recovers fenced tool_call object literals with stale args intact', async () => {
    const hub = createTestEventHub()
    const collector = createTurnEventCollector({
      input: createTurnInput(),
      source: hub,
      timeoutMs: 1_000,
    })

    hub.emit(createTurnAppEvent('result', {
      text: [
        '```tool_call',
        'model_query({',
        '  kind: "project",',
        '  member: "config-page"',
        '})',
        '```',
      ].join('\n'),
    }))

    await expect(collector.result).resolves.toEqual({
      text: '',
      toolCalls: [{
        id: 'call_bare_1',
        type: 'function',
        function: {
          name: 'model_query',
          arguments: JSON.stringify({
            kind: 'project',
            member: 'config-page',
          }),
        },
      }],
    })
  })

  it('recovers bare model_script pseudo calls without renaming arguments', async () => {
    const hub = createTestEventHub()
    const collector = createTurnEventCollector({
      input: createTurnInput(),
      source: hub,
      timeoutMs: 1_000,
    })

    hub.emit(createTurnAppEvent('result', {
      text: 'model_script({"script":"return await this.readProjectPlanningInput()"})',
    }))

    await expect(collector.result).resolves.toEqual({
      text: '',
      toolCalls: [{
        id: 'call_bare_1',
        type: 'function',
        function: {
          name: 'model_script',
          arguments: JSON.stringify({
            script: 'return await this.readProjectPlanningInput()',
          }),
        },
      }],
    })
  })

  it('keeps recovered arg_key blocks strict without old argument aliases', async () => {
    const hub = createTestEventHub()
    const collector = createTurnEventCollector({
      input: createTurnInput(),
      source: hub,
      timeoutMs: 1_000,
    })

    hub.emit(createTurnAppEvent('result', {
      text: [
        '<tool_call>model_query',
        '<arg_key>kind</arg_key><arg_value>demoModule</arg_value>',
        '</tool_call>',
      ].join(''),
    }))

    await expect(collector.result).resolves.toEqual({
      text: '',
      toolCalls: [{
        id: 'call_argtag_1',
        type: 'function',
        function: {
          name: 'model_query',
          arguments: JSON.stringify({ kind: 'demoModule' }),
        },
      }],
    })
  })

  it('recovers glm arg_key/arg_value tool_call blocks emitted as assistant text', async () => {
    const hub = createTestEventHub()
    const collector = createTurnEventCollector({
      input: createTurnInput(),
      source: hub,
      timeoutMs: 1_000,
    })

    hub.emit(createTurnAppEvent('result', {
      text: [
        '<tool_call>model_query',
        '<arg_key>kind</arg_key><arg_value>demoModule</arg_value>',
        '<arg_key>keyword</arg_key><arg_value>orders</arg_value>',
        '</tool_call>',
      ].join(''),
    }))

    await expect(collector.result).resolves.toEqual({
      text: '',
      toolCalls: [{
        id: 'call_argtag_1',
        type: 'function',
        function: {
          name: 'model_query',
          arguments: JSON.stringify({ kind: 'demoModule', keyword: 'orders' }),
        },
      }],
    })
  })

  it('recovers malformed arg_key fragments emitted without closing arg_key tags', async () => {
    const hub = createTestEventHub()
    const collector = createTurnEventCollector({
      input: createTurnInput(),
      source: hub,
      timeoutMs: 1_000,
    })

    hub.emit(createTurnAppEvent('result', {
      text: [
        '<tool_call>model_action_guide',
        '<arg_key>actionName":"openPageDesign","kind":"ProjectModel"}</arg_value>',
        '</tool_call>',
      ].join(''),
    }))

    await expect(collector.result).resolves.toEqual({
      text: '',
      toolCalls: [{
        id: 'call_argtag_1',
        type: 'function',
        function: {
          name: 'model_action_guide',
          arguments: JSON.stringify({
            actionName: 'openPageDesign',
            kind: 'ProjectModel',
          }),
        },
      }],
    })
  })

  it('does not map recovered model_script code arg to script', async () => {
    const hub = createTestEventHub()
    const collector = createTurnEventCollector({
      input: createTurnInput(),
      source: hub,
      timeoutMs: 1_000,
    })

    hub.emit(createTurnAppEvent('result', {
      text: [
        '<tool_call>model_script',
        '<arg_key>code</arg_key><arg_value>return await this.readPlanningProjection()</arg_value>',
        '</tool_call>',
      ].join(''),
    }))

    await expect(collector.result).resolves.toEqual({
      text: '',
      toolCalls: [{
        id: 'call_argtag_1',
        type: 'function',
        function: {
          name: 'model_script',
          arguments: JSON.stringify({
            code: 'return await this.readPlanningProjection()',
          }),
        },
      }],
    })
  })

  it('recovers DSML invoke blocks emitted as assistant text', async () => {
    const hub = createTestEventHub()
    const collector = createTurnEventCollector({
      input: createTurnInput(),
      source: hub,
      timeoutMs: 1_000,
    })

    hub.emit(createTurnAppEvent('result', {
      text: [
        '<｜DSML｜tool_calls>',
        '<｜DSML｜invoke name="model_script">',
        '<｜DSML｜parameter name="script" string="true">return { ok: true }</｜DSML｜parameter>',
        '</｜DSML｜invoke>',
        '</｜DSML｜tool_calls>',
      ].join('\n'),
    }))

    await expect(collector.result).resolves.toEqual({
      text: '',
      toolCalls: [{
        id: 'call_dsml_1',
        type: 'function',
        function: {
          name: 'model_script',
          arguments: JSON.stringify({
            script: 'return { ok: true }',
          }),
        },
      }],
    })
  })

  it('rejects APP SSE turn errors', async () => {
    const hub = createTestEventHub()
    const streamEvents: AiAgentStreamEvent[] = []
    const collector = createTurnEventCollector({
      input: createTurnInput({ onStreamEvent: (event) => streamEvents.push(event) }),
      source: hub,
      timeoutMs: 1_000,
    })

    hub.emit(createTurnAppEvent('error', {
      code: 'LLM_TOOL_CALL_FAILED',
      message: 'LLM tool-call request failed',
    }))

    await expect(collector.result).rejects.toThrow('LLM tool-call request failed (code=LLM_TOOL_CALL_FAILED)')
    expect(streamEvents).toHaveLength(1)
    expect(streamEvents[0]?.type).toBe('error')
    expect(hub.listenerCount()).toBe(0)
  })

  it('times out and cleans listeners when no matching turn event arrives', async () => {
    const hub = createTestEventHub()
    const collector = createTurnEventCollector({
      input: createTurnInput(),
      source: hub,
      timeoutMs: 1,
    })

    await expect(collector.result).rejects.toThrow('AI turn timed out waiting for APP SSE events: turnId=turn-1')
    expect(hub.listenerCount()).toBe(0)
  })

  it('builds stable turn payload identity for APP-owned HTTP commands', () => {
    const input = createTurnInput()

    expect(createAiAgentTransportTurn(input)).toEqual({
      turnId: 'turn-1',
      turnKey,
    })
    expect(createAiAgentTransportTurn(input, 'llm-stream')).toEqual({
      turnId: 'turn-1',
      turnKey,
      streamKey,
    })
  })

  it('discards malformed tool calls missing id instead of fabricating one', async () => {
    const hub = createTestEventHub()
    const collector = createTurnEventCollector({
      input: createTurnInput(),
      source: hub,
      timeoutMs: 1_000,
    })

    hub.emit(createTurnAppEvent('result', {
      text: 'ok',
      toolCalls: [
        // valid: has id
        { id: 'call-1', type: 'function', function: { name: 'getNode', arguments: '{}' } },
        // malformed: missing id → should be discarded
        { type: 'function', function: { name: 'setProps', arguments: '{}' } },
        // malformed: empty id string → should be discarded
        { id: '', type: 'function', function: { name: 'model_query', arguments: '{}' } },
        // valid
        { id: 'call-2', type: 'function', function: { name: 'model_class_guide', arguments: '{"kind":"x"}' } },
      ],
    }))

    await expect(collector.result).resolves.toEqual({
      text: 'ok',
      toolCalls: [
        { id: 'call-1', type: 'function', function: { name: 'getNode', arguments: '{}' } },
        { id: 'call-2', type: 'function', function: { name: 'model_class_guide', arguments: '{"kind":"x"}' } },
      ],
    })
    expect(hub.listenerCount()).toBe(0)
  })

  it('fails when no SSE frames arrive within idleTimeoutMs', async () => {
    const hub = createTestEventHub()
    const collector = createTurnEventCollector({
      input: createTurnInput(),
      source: hub,
      timeoutMs: 60_000,
      idleTimeoutMs: 40,
    })

    await expect(collector.result).rejects.toThrow(/idle timeout/)
    expect(hub.listenerCount()).toBe(0)
  })

  it('resets idle timer when SSE frames keep arriving', async () => {
    const hub = createTestEventHub()
    const collector = createTurnEventCollector({
      input: createTurnInput(),
      source: hub,
      timeoutMs: 60_000,
      idleTimeoutMs: 80,
    })

    hub.emit(createTurnAppEvent('delta', { delta: 'a' }))
    await new Promise(resolve => setTimeout(resolve, 50))
    hub.emit(createTurnAppEvent('delta', { delta: 'b' }))
    await new Promise(resolve => setTimeout(resolve, 50))
    hub.emit(createTurnAppEvent('result', { text: 'ok', toolCalls: [] }))

    await expect(collector.result).resolves.toEqual({ text: 'ok', toolCalls: [] })
    expect(hub.listenerCount()).toBe(0)
  })
})
