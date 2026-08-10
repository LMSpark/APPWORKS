import { describe, expect, it, vi } from 'vitest'
import type {
  AiAgentBeforeFunctionCallOptions,
  AiAgentHostRunResult,
  AiAgentStreamEvent,
  AiAgentTaskChatOptions,
  AiAgentToolRuntime,
  AiAgentToolCallRecord,
  AiAgentTurnCallbacks,
} from '@spark-appworks/spark-ai/agent'
import {
  AiAgentRegistration,
  AiAgentRuntimeContext,
  AiAgentScope,
  AiAgentSession,
  AiAgentTarget,
  AiAgentTask,
  AiAgentToolResult,
  DefaultAiAgentSessionStore,
} from '@spark-appworks/spark-ai/agent'
import type { JsonParams } from '@spark-appworks/spark-json-document'
import {
  createAiRunAdapter,
  formatAiRunError,
  noopTraceSink,
} from '../../ai/ai-run-adapter'
import type { AiRunBeforeFunctionCall, AiRunHost, AiRunTraceSink } from '../../ai/ai-run-adapter'

function createTraceSink() {
  return {
    appendUserMessage: vi.fn(),
    appendEvent: vi.fn(),
    appendDelta: vi.fn(),
    appendReasoning: vi.fn(),
    appendToolCall: vi.fn(),
    appendError: vi.fn(),
    markAborted: vi.fn(),
    finish: vi.fn(),
    reset: vi.fn(),
  } satisfies AiRunTraceSink
}

function createRunResult(instanceId = 'session-1'): AiAgentHostRunResult {
  const moduleId = 'module-1'
  const store = new DefaultAiAgentSessionStore({ now: () => 1 })
  const context = new AiAgentRuntimeContext(moduleId, instanceId, instanceId)
  const runtime: AiAgentToolRuntime = {
    getTools: () => [],
    executeTool: async () => AiAgentToolResult.ok(null),
    projectKnowledge: () => ({ promptSnapshot: '' }),
    inspect: () => ({
      status: 'ok',
      rootKinds: [],
      moduleCount: 0,
      findings: [],
    }),
  }
  store.startSession(context)
  const registration = new AiAgentRegistration({
    moduleId,
    name: '测试模块',
    description: '测试模块',
    runtime,
    sessionStore: store,
  })
  const registry = {
    get: (requestedModuleId: string) =>
      requestedModuleId === moduleId ? registration : undefined,
  }
  const turnCallbacks: AiAgentTurnCallbacks = {
    executeTurn: async () => ({ text: '', toolCalls: [] }),
    appendMessages: async () => undefined,
  }
  const scope = new AiAgentScope(moduleId, instanceId, instanceId, instanceId)
  const task = new AiAgentTask(moduleId, { prompt: 'test' }, scope, {
    userMessage: 'test',
    systemPrompt: 'test',
  })
  const session = new AiAgentSession(
    { registry, turnCallbacks },
    new AiAgentTarget(moduleId, instanceId),
  )
  return { task, session }
}

function createStreamEvent(type = 'delta'): AiAgentStreamEvent {
  return {
    type,
    data: 'payload',
    turnKey: 'business-1:instance-1:turn-1',
    streamKey: 'business-1:instance-1:turn-1:stream-1',
    scope: {
      businessRegistrationId: 'business-1',
      businessInstanceId: 'instance-1',
      eventModuleId: 'module-1',
      turnId: 'turn-1',
    },
  }
}

function createToolCallRecord(): AiAgentToolCallRecord {
  return {
    toolName: 'inspectPage',
    args: { pageId: 'home' },
    turnId: 'turn-1',
    round: 1,
    callId: 'call-1',
    status: 'success',
    result: { ok: true, summary: 'ok' },
    durationMs: 7,
  }
}

function createBeforeOptions(): AiAgentBeforeFunctionCallOptions {
  return {
    moduleId: 'pageDesign',
    moduleInstanceId: 'page-1',
    instanceId: 'page-1',
    toolName: 'model_script',
    args: { script: 'return 1' },
  }
}

type Deferred<T> = Readonly<{
  promise: Promise<T>
  resolve(value: T | PromiseLike<T>): void
  reject(reason?: unknown): void
}>

function createDeferred<T>(): Deferred<T> {
  let resolve: ((value: T | PromiseLike<T>) => void) | undefined
  let reject: ((reason?: unknown) => void) | undefined
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  if (resolve === undefined || reject === undefined) {
    throw new Error('Failed to create deferred promise.')
  }
  return { promise, resolve, reject }
}

describe('createAiRunAdapter', () => {
  it('runs headlessly without a trace sink', async () => {
    const input = { prompt: 'build page' } satisfies JsonParams
    const result = createRunResult()
    const run = vi.fn(async (
      _alias: string,
      _input: JsonParams,
      _chat?: AiAgentTaskChatOptions,
    ) => result)
    const host: AiRunHost = { run }
    const adapter = createAiRunAdapter()

    await expect(adapter.run({
      host,
      alias: 'page-design',
      input,
    })).resolves.toBe('completed')

    expect(run).toHaveBeenCalledWith(
      'page-design',
      input,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        onDelta: expect.any(Function),
        onReasoning: expect.any(Function),
        onStreamEvent: expect.any(Function),
        onToolCall: expect.any(Function),
      }),
    )
    expect(adapter.isRunning()).toBe(false)
    expect(adapter.snapshot().agUiEvents.map((event) => event.type)).toEqual([
      'RUN_STARTED',
      'RUN_FINISHED',
    ])
  })

  it('forwards host stream callbacks into trace and AG-UI projections', async () => {
    const event = createStreamEvent('llm-request')
    const toolCall = createToolCallRecord()
    const eventTypes: string[] = []
    const trace = createTraceSink()
    const result = createRunResult()
    const run = vi.fn(async (
      _alias: string,
      _input: JsonParams,
      chat?: AiAgentTaskChatOptions,
    ) => {
      chat?.onStreamEvent?.(event)
      chat?.onDelta?.('hello')
      chat?.onReasoning?.('thinking')
      chat?.onToolCall?.(toolCall)
      return result
    })
    const host: AiRunHost = { run }
    const adapter = createAiRunAdapter()

    await expect(adapter.run({
      host,
      alias: 'page-design',
      input: { prompt: 'trace me' },
      trace,
      userMessage: 'trace me',
      onEvent: (agUiEvent) => eventTypes.push(agUiEvent.type),
    })).resolves.toBe('completed')

    expect(trace.reset).toHaveBeenCalledTimes(1)
    expect(trace.appendUserMessage).toHaveBeenCalledWith('trace me')
    expect(trace.appendEvent).toHaveBeenCalledWith(event)
    expect(trace.appendDelta).toHaveBeenCalledWith('hello')
    expect(trace.appendReasoning).toHaveBeenCalledWith('thinking')
    expect(trace.appendToolCall).toHaveBeenCalledWith(toolCall)
    expect(trace.finish).toHaveBeenCalledTimes(1)
    expect(adapter.snapshot().trace.entries.map((entry) => entry.kind)).toEqual([
      'user-message',
      'assistant-complete',
      'reasoning',
      'tool-call',
    ])
    expect(eventTypes).toContain('CUSTOM')
    expect(eventTypes).toContain('TEXT_MESSAGE_START')
    expect(eventTypes).toContain('TEXT_MESSAGE_CONTENT')
    expect(eventTypes).toContain('TEXT_MESSAGE_END')
    expect(eventTypes).toContain('REASONING_MESSAGE_CONTENT')
    expect(eventTypes).toContain('TOOL_CALL_RESULT')
    expect(eventTypes.at(-1)).toBe('RUN_FINISHED')
    expect(adapter.snapshot().timeline.length).toBe(adapter.snapshot().agUiEvents.length)
  })

  it('wraps beforeFunctionCall as AG-UI approval custom events', async () => {
    const beforeFunctionCall = vi.fn<AiRunBeforeFunctionCall>(() => ({ status: 'allow' }))
    const result = createRunResult()
    const run = vi.fn(async (
      _alias: string,
      _input: JsonParams,
      chat?: AiAgentTaskChatOptions,
    ) => {
      await chat?.beforeFunctionCall?.(createBeforeOptions())
      return result
    })
    const host: AiRunHost = { run }
    const adapter = createAiRunAdapter()

    await expect(adapter.run({
      host,
      alias: 'page-design',
      input: { prompt: 'approve me' },
      beforeFunctionCall,
    })).resolves.toBe('completed')

    expect(run).toHaveBeenCalledWith(
      'page-design',
      { prompt: 'approve me' },
      expect.objectContaining({ beforeFunctionCall: expect.any(Function) }),
    )
    expect(beforeFunctionCall).toHaveBeenCalledWith(createBeforeOptions())
    const approvalEvents = adapter.snapshot().agUiEvents.filter((event) =>
      event.type === 'CUSTOM' && (
        event.name === 'spark.toolApproval.requested'
        || event.name === 'spark.toolApproval.resolved'
      ),
    )
    expect(approvalEvents.map((event) => event.name)).toEqual([
      'spark.toolApproval.requested',
      'spark.toolApproval.resolved',
    ])
  })

  it('appends formatted errors and rethrows non-abort failures', async () => {
    const trace = createTraceSink()
    const run = vi.fn(async () => {
      throw new Error('host failed')
    })
    const host: AiRunHost = { run }
    const adapter = createAiRunAdapter({
      formatError: (error) => `formatted: ${formatAiRunError(error)}`,
    })

    await expect(adapter.run({
      host,
      alias: 'page-design',
      input: { prompt: 'fail' },
      trace,
    })).rejects.toThrow('host failed')

    expect(trace.appendError).toHaveBeenCalledWith('formatted: host failed')
    expect(trace.finish).toHaveBeenCalledTimes(1)
    expect(adapter.isRunning()).toBe(false)
    expect(adapter.snapshot().agUiEvents.at(-1)).toMatchObject({
      type: 'RUN_ERROR',
      message: 'formatted: host failed',
    })
  })

  it('aborts an active run without reporting a host error', async () => {
    const pending = createDeferred<AiAgentHostRunResult>()
    const trace = createTraceSink()
    const onAbort = vi.fn()
    let signal: AbortSignal | undefined
    const run = vi.fn((
      _alias: string,
      _input: JsonParams,
      chat?: AiAgentTaskChatOptions,
    ) => {
      signal = chat?.signal
      return pending.promise
    })
    const host: AiRunHost = { run }
    const adapter = createAiRunAdapter()

    const promise = adapter.run({
      host,
      alias: 'page-design',
      input: { prompt: 'abort' },
      trace,
      onAbort,
    })
    expect(adapter.isRunning()).toBe(true)

    adapter.abort('user stopped')
    expect(signal?.aborted).toBe(true)
    expect(onAbort).toHaveBeenCalledWith('user stopped')
    pending.reject(new Error('transport aborted'))

    await expect(promise).resolves.toBe('aborted')
    expect(trace.markAborted).toHaveBeenCalledWith('user stopped')
    expect(trace.appendError).not.toHaveBeenCalled()
    expect(trace.finish).toHaveBeenCalledTimes(1)
    expect(adapter.isRunning()).toBe(false)
    expect(adapter.snapshot().agUiEvents.some((event) => event.type === 'RUN_ERROR')).toBe(false)
    expect(adapter.snapshot().trace.entries.at(-1)).toMatchObject({
      kind: 'system-message',
      content: 'user stopped',
    })
  })

  it('ignores a host result that resolves after abort', async () => {
    const pending = createDeferred<AiAgentHostRunResult>()
    const trace = createTraceSink()
    const result = createRunResult('late-session')
    const run = vi.fn((
      _alias: string,
      _input: JsonParams,
      _chat?: AiAgentTaskChatOptions,
    ) => pending.promise)
    const host: AiRunHost = { run }
    const adapter = createAiRunAdapter()

    const promise = adapter.run({
      host,
      alias: 'page-design',
      input: { prompt: 'late' },
      trace,
    })
    adapter.abort()
    pending.resolve(result)

    await expect(promise).resolves.toBe('aborted')
    expect(trace.markAborted).toHaveBeenCalledWith('本地已中断')
    expect(adapter.isRunning()).toBe(false)
  })

  it('rejects concurrent runs until the active run finishes', async () => {
    const pending = createDeferred<AiAgentHostRunResult>()
    const result = createRunResult()
    const run = vi.fn((
      _alias: string,
      _input: JsonParams,
      _chat?: AiAgentTaskChatOptions,
    ) => pending.promise)
    const host: AiRunHost = { run }
    const adapter = createAiRunAdapter()

    const first = adapter.run({
      host,
      alias: 'page-design',
      input: { prompt: 'first' },
    })

    await expect(adapter.run({
      host,
      alias: 'page-design',
      input: { prompt: 'second' },
    })).rejects.toThrow('AI run is already in progress.')

    pending.resolve(result)
    await expect(first).resolves.toBe('completed')
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('noopTraceSink', () => {
  it('accepts every trace callback without side effects', () => {
    const event = createStreamEvent()
    const toolCall = createToolCallRecord()

    expect(() => {
      noopTraceSink.reset()
      noopTraceSink.appendUserMessage('hello')
      noopTraceSink.appendEvent(event)
      noopTraceSink.appendDelta('delta')
      noopTraceSink.appendReasoning('reasoning')
      noopTraceSink.appendToolCall(toolCall)
      noopTraceSink.appendError('error')
      noopTraceSink.markAborted()
      noopTraceSink.finish()
    }).not.toThrow()
  })
})
