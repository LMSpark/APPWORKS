/**
 * @module app:services/ai-turn-bridge
 * 职责：把 spark-ai 的本地工具循环语义映射到 lowcode-jdk17 Agent turn 与 SSE 合同。
 * 边界：Agent、会话和模型配置由 lowcode 后端持有；前端只执行已注册的前端工具并回传结果。
 */

import {
  createAiAgentHost,
  type AiAgentAppSseEvent,
  type AiAgentStreamTurnInput,
  type AiAgentStreamTurnResult,
  type AiAgentTransportToolCall,
  type AiAgentTurnCallbacks,
} from '@spark-appworks/spark-ai/agent'
import { isRecord } from '@spark-appworks/spark-utils'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'
import { onAnyServerEnvelopeEvent, waitForAppSseConnection } from '@/services/sse-events'

const AI_TURN_EVENT_TIMEOUT_MS = 300_000
const AI_TURN_IDLE_TIMEOUT_MS = 90_000
const TOOL_CALL_SETTLE_MS = 40
const MAX_UNBOUND_EVENTS = 100
const MAX_AI_TURN_DIAGNOSTICS = 300

type AiTurnBridgeDiagnostic = Readonly<{
  at: number
  type: string
  sessionId?: string
  turnId?: string
  message?: string
  details?: Record<string, unknown>
}>

type AiTurnTimeouts = Readonly<{
  timeoutMs: number
  idleTimeoutMs: number
}>

type LowcodeTurnIdentity = Readonly<{
  sessionId: string
  turnId: string
}>

type LowcodeTurnOutcome = Readonly<{
  result: AiAgentStreamTurnResult
  sessionId: string
  pendingTurnId?: string
  toolNames: ReadonlyMap<string, string>
}>

type LowcodeTurnCollector = Readonly<{
  result: Promise<LowcodeTurnOutcome>
  bind(identity: LowcodeTurnIdentity): void
  close(): void
}>

type LowcodeToolBinding = Readonly<{
  input: AiAgentStreamTurnInput
  sessionId: string
  pendingTurnId: string
  toolNames: ReadonlyMap<string, string>
}>

type PendingContinuation = Readonly<{
  collector: LowcodeTurnCollector
}>

export type AiAgentTurnBridgeOptions = Readonly<{
  timeoutMs?: number
  idleTimeoutMs?: number
}>

const aiTurnDiagnostics: AiTurnBridgeDiagnostic[] = []

export function createAiAgentTurnCallbacks(options: AiAgentTurnBridgeOptions = {}): AiAgentTurnCallbacks {
  const timeouts = readTimeouts(options)
  const toolBindings = new Map<string, LowcodeToolBinding>()
  const continuations = new Map<string, PendingContinuation>()

  return {
    prepareSession: (input) => {
      recordAiTurnDiagnostic({
        type: 'prepare-session-lowcode-owned',
        sessionId: input.sessionId,
        details: {
          agentId: input.scope.businessRegistrationId,
          toolCount: input.tools.length,
        },
      })
      return Promise.resolve()
    },
    executeTurn: async (input) => {
      const continuation = continuations.get(input.sessionId)
      if (continuation !== undefined) {
        continuations.delete(input.sessionId)
        recordAiTurnDiagnostic({
          type: 'turn-continue-wait',
          sessionId: input.sessionId,
          turnId: input.turn.turnId,
        })
        const outcome = await continuation.collector.result
        retainToolBinding(toolBindings, input, outcome)
        return outcome.result
      }

      const agentId = input.scope.businessRegistrationId.trim()
      const message = readCurrentUserMessage(input)
      if (agentId === '') throw new Error('lowcode Agent 缺少业务注册 ID，无法解析后端 agentId')
      if (message === undefined) throw new Error('lowcode Agent turn 缺少当前用户消息')

      const collector = createLowcodeTurnCollector(input, timeouts)
      try {
        await waitForAppSseConnection()
        recordAiTurnDiagnostic({
          type: 'turn-start-request',
          sessionId: input.sessionId,
          turnId: input.turn.turnId,
          details: { agentId },
        })
        // lowcode /api/ai/turns 每次创建一段新的持久会话；不复用 spark-ai
        // 的本地业务 sessionId，避免覆盖或重复创建已有后端会话。
        const ack = await lowcodeApi.realtime.startAgentTurn({ agentId, message })
        collector.bind(ack)
        const outcome = await collector.result
        retainToolBinding(toolBindings, input, outcome)
        recordAiTurnDiagnostic({
          type: 'turn-complete',
          sessionId: ack.sessionId,
          turnId: ack.turnId,
          details: { toolCallCount: outcome.result.toolCalls.length },
        })
        return outcome.result
      } catch (error) {
        collector.close()
        recordAiTurnDiagnostic({
          type: 'turn-error',
          sessionId: input.sessionId,
          turnId: input.turn.turnId,
          message: errorMessage(error),
        })
        throw error
      }
    },
    appendMessages: async (input) => {
      const bindingKey = toToolBindingKey(input.sessionId, input.turn.turnId)
      const binding = toolBindings.get(bindingKey)
      if (binding === undefined) {
        throw new Error(`lowcode Agent 工具回传缺少真实 turn 绑定：${input.turn.turnId}`)
      }
      toolBindings.delete(bindingKey)
      const toolResults = input.messages
        .filter(message => message.role === 'tool')
        .map((message) => {
          const toolCallId = message.tool_call_id?.trim() ?? ''
          const toolName = binding.toolNames.get(toolCallId)
          if (toolCallId === '' || toolName === undefined) {
            throw new Error(`lowcode Agent 工具结果无法匹配真实工具调用：${toolCallId || '(empty)'}`)
          }
          return { toolCallId, toolName, result: message.content }
        })
      if (toolResults.length === 0) {
        throw new Error('lowcode Agent append 只接受真实前端工具结果')
      }

      const collector = createLowcodeTurnCollector(binding.input, timeouts)
      collector.bind({ sessionId: binding.sessionId, turnId: binding.pendingTurnId })
      continuations.set(input.sessionId, { collector })
      try {
        recordAiTurnDiagnostic({
          type: 'tool-results-append',
          sessionId: binding.sessionId,
          turnId: binding.pendingTurnId,
          details: { toolResultCount: toolResults.length },
        })
        await lowcodeApi.realtime.appendAgentToolResults({
          sessionId: binding.sessionId,
          turnId: binding.pendingTurnId,
          toolResults,
        })
      } catch (error) {
        continuations.delete(input.sessionId)
        collector.close()
        throw error
      }
    },
  }
}

export function readAiTurnBridgeDiagnostics(): readonly AiTurnBridgeDiagnostic[] {
  return aiTurnDiagnostics.map(item => ({ ...item }))
}

export function clearAiTurnBridgeDiagnostics(): void {
  aiTurnDiagnostics.length = 0
}

function createLowcodeTurnCollector(
  input: AiAgentStreamTurnInput,
  timeouts: AiTurnTimeouts,
): LowcodeTurnCollector {
  let identity: LowcodeTurnIdentity | null = null
  let settled = false
  let text = ''
  const toolCalls: AiAgentTransportToolCall[] = []
  let pendingTurnId: string | undefined
  const unboundEvents: AiAgentAppSseEvent[] = []
  let resolveResult: ((outcome: LowcodeTurnOutcome) => void) | null = null
  let rejectResult: ((error: unknown) => void) | null = null
  let absoluteTimer: ReturnType<typeof setTimeout> | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let toolSettleTimer: ReturnType<typeof setTimeout> | null = null

  const clearTimers = (): void => {
    if (absoluteTimer !== null) clearTimeout(absoluteTimer)
    if (idleTimer !== null) clearTimeout(idleTimer)
    if (toolSettleTimer !== null) clearTimeout(toolSettleTimer)
    absoluteTimer = null
    idleTimer = null
    toolSettleTimer = null
  }
  const stop = onAnyServerEnvelopeEvent((event) => {
    if (settled) return
    if (identity === null) {
      unboundEvents.push(event)
      if (unboundEvents.length > MAX_UNBOUND_EVENTS) unboundEvents.shift()
      return
    }
    handleEvent(event)
  })
  const cleanup = (): void => {
    stop()
    clearTimers()
    input.signal?.removeEventListener('abort', handleAbort)
  }
  const fail = (error: unknown): void => {
    if (settled) return
    settled = true
    cleanup()
    rejectResult?.(error)
  }
  const complete = (): void => {
    if (settled || identity === null) return
    settled = true
    cleanup()
    const toolNames = new Map(toolCalls.map(call => [call.id, call.function.name]))
    resolveResult?.({
      result: {
        text: toolCalls.length > 0 ? '' : text,
        toolCalls,
        assistantMessagePersisted: true,
      },
      sessionId: identity.sessionId,
      ...(pendingTurnId === undefined ? {} : { pendingTurnId }),
      toolNames,
    })
  }
  const resetIdleTimer = (): void => {
    if (idleTimer !== null) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      fail(new Error(`lowcode Agent turn 空闲超时：${identity?.turnId ?? input.turn.turnId}`))
    }, timeouts.idleTimeoutMs)
  }
  const scheduleToolCompletion = (): void => {
    if (toolSettleTimer !== null) clearTimeout(toolSettleTimer)
    toolSettleTimer = setTimeout(complete, TOOL_CALL_SETTLE_MS)
  }
  const handleEvent = (event: AiAgentAppSseEvent): void => {
    const bound = identity
    if (bound === null) return
    const context = readEventContext(event)
    if (context?.sessionId !== bound.sessionId) return
    const isRootTurn = context.turnId === bound.turnId
    const isChildTurn = context.turnId.startsWith(`${bound.turnId}_`)
    if (!isRootTurn && !isChildTurn) return
    resetIdleTimer()
    if (!event.ok) {
      emitStreamEvent(input, 'error', event.data)
      fail(new Error(readLowcodeEventError(event.data)))
      return
    }
    if (event.name === 'tool_call') {
      const call = readLowcodeToolCall(event.data)
      if (call === null) {
        fail(new Error('lowcode tool_call 事件缺少有效工具调用'))
        return
      }
      if (!toolCalls.some(item => item.id === call.id)) toolCalls.push(call)
      pendingTurnId ??= context.turnId
      emitStreamEvent(input, 'result', event.data)
      scheduleToolCompletion()
      return
    }
    if (event.name !== 'llm-frame' || !isRootTurn) return
    const delta = readLowcodeDelta(event.data)
    if (delta !== '') {
      text += delta
      input.onDelta?.(delta)
      emitStreamEvent(input, 'delta', event.data)
    }
    if (event.event?.terminal === true) {
      emitStreamEvent(input, 'done', event.data)
      complete()
    }
  }
  const handleAbort = (): void => fail(new Error('lowcode Agent turn 已取消'))
  const result = new Promise<LowcodeTurnOutcome>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
    absoluteTimer = setTimeout(() => {
      fail(new Error(`lowcode Agent turn 总超时：${identity?.turnId ?? input.turn.turnId}`))
    }, timeouts.timeoutMs)
    resetIdleTimer()
    input.signal?.addEventListener('abort', handleAbort, { once: true })
  })
  result.catch(() => undefined)

  return {
    result,
    bind(nextIdentity) {
      if (identity !== null) throw new Error('lowcode Agent collector 已绑定真实 turn')
      identity = nextIdentity
      for (const event of unboundEvents.splice(0)) handleEvent(event)
    },
    close() {
      fail(new Error('lowcode Agent collector 已关闭'))
    },
  }
}

function retainToolBinding(
  bindings: Map<string, LowcodeToolBinding>,
  input: AiAgentStreamTurnInput,
  outcome: LowcodeTurnOutcome,
): void {
  if (outcome.result.toolCalls.length === 0) return
  if (outcome.pendingTurnId === undefined) {
    throw new Error('lowcode Agent 工具调用缺少后端 pending turnId')
  }
  bindings.set(toToolBindingKey(input.sessionId, input.turn.turnId), {
    input,
    sessionId: outcome.sessionId,
    pendingTurnId: outcome.pendingTurnId,
    toolNames: outcome.toolNames,
  })
}

function readTimeouts(options: AiAgentTurnBridgeOptions): AiTurnTimeouts {
  return {
    timeoutMs: readPositiveTimeout(options.timeoutMs, AI_TURN_EVENT_TIMEOUT_MS, 'timeoutMs'),
    idleTimeoutMs: readPositiveTimeout(options.idleTimeoutMs, AI_TURN_IDLE_TIMEOUT_MS, 'idleTimeoutMs'),
  }
}

function readPositiveTimeout(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`createAiAgentTurnCallbacks.${name} 必须是正数`)
  }
  return Math.floor(value)
}

function readCurrentUserMessage(input: AiAgentStreamTurnInput): string | undefined {
  for (let index = input.messages.length - 1; index >= 0; index -= 1) {
    const message = input.messages[index]
    if (message?.role !== 'user') continue
    const content = message.content.trim()
    if (content !== '') return content
  }
  return undefined
}

function readEventContext(event: AiAgentAppSseEvent): LowcodeTurnIdentity | null {
  if (!isRecord(event.context)) return null
  const session = event.context['session']
  const turn = event.context['turn']
  if (!isRecord(session) || !isRecord(turn)) return null
  const sessionId = readText(session['sessionId'])
  const turnId = readText(turn['turnId'])
  return sessionId === undefined || turnId === undefined ? null : { sessionId, turnId }
}

function readLowcodeDelta(data: unknown): string {
  return isRecord(data) && typeof data['content'] === 'string' ? data['content'] : ''
}

function readLowcodeToolCall(data: unknown): AiAgentTransportToolCall | null {
  if (!isRecord(data)) return null
  const toolCallId = readText(data['toolCallId'])
  const toolName = readText(data['toolName'])
  const toolCallJson = readText(data['toolCallJson'])
  if (toolCallId === undefined || toolName === undefined || toolCallJson === undefined) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(toolCallJson)
  } catch {
    return null
  }
  const fn = isRecord(parsed) && isRecord(parsed['function']) ? parsed['function'] : null
  const rawArguments = fn?.['arguments']
  return {
    id: toolCallId,
    type: 'function',
    function: {
      name: toolName,
      arguments: typeof rawArguments === 'string' ? rawArguments : JSON.stringify(rawArguments ?? {}),
    },
  }
}

function readLowcodeEventError(data: unknown): string {
  if (!isRecord(data)) return 'lowcode Agent turn 失败'
  const message = readText(data['message']) ?? 'lowcode Agent turn 失败'
  const code = readText(data['code'])
  return code === undefined ? message : `${message}（${code}）`
}

function emitStreamEvent(input: AiAgentStreamTurnInput, type: 'delta' | 'result' | 'error' | 'done', data: unknown): void {
  input.onStreamEvent?.({
    type,
    data,
    turnKey: '',
    streamKey: '',
    scope: {
      businessRegistrationId: input.scope.businessRegistrationId,
      businessInstanceId: input.scope.businessInstanceId,
      eventModuleId: 'llm',
      turnId: input.turn.turnId,
    },
  })
  recordAiTurnDiagnostic({
    type: 'turn-frame',
    sessionId: input.sessionId,
    turnId: input.turn.turnId,
    details: { frameType: type },
  })
}

function toToolBindingKey(sessionId: string, turnId: string): string {
  return `${sessionId}\u0000${turnId}`
}

function readText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized === '' ? undefined : normalized
}

type RecordAiTurnDiagnosticCommand = Readonly<{
  type: string
  sessionId?: string
  turnId?: string
  message?: string
  details?: Record<string, unknown>
}>

function recordAiTurnDiagnostic(command: RecordAiTurnDiagnosticCommand): void {
  aiTurnDiagnostics.push({
    at: Date.now(),
    type: command.type,
    ...(command.sessionId === undefined ? {} : { sessionId: command.sessionId }),
    ...(command.turnId === undefined ? {} : { turnId: command.turnId }),
    ...(command.message === undefined ? {} : { message: command.message }),
    ...(command.details === undefined ? {} : { details: command.details }),
  })
  while (aiTurnDiagnostics.length > MAX_AI_TURN_DIAGNOSTICS) aiTurnDiagnostics.shift()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 生产 Agent Host：工具与页面能力仍由前端注册，模型与会话由 lowcode 持久化。 */
export const appAiAgent = createAiAgentHost({
  turnCallbacks: createAiAgentTurnCallbacks(),
  maxToolRounds: 16,
})
