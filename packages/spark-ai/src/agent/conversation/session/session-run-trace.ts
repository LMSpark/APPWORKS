/**
 * @module @spark-appworks/spark-ai:agent/conversation/session/session-run-trace
 * 职责：定义或实现 Agent 会话存储、诊断和运行轨迹中的 session run trace 能力。
 * 边界：只维护 session 层状态和观测数据，不生成业务输入契约，也不直接执行工具 runtime。
 * AI用途：追踪会话记录、诊断事件或 run trace 时，用本模块确认 session 数据如何保存和读取。
 */
/**
 * agent/session/session-run-trace.ts — headless AI run trace.
 *
 * This is a compact, UI-independent projection of one active AI run. It is
 * not the durable conversation source; the backend DB owns persisted history.
 */

import type { AiAgentStreamEvent, AiAgentToolCallRecord } from '../chat/chat-types'
import { previewAiAgentDiagnosticValue } from './session-diagnostics'

/** 工具调用轨迹条目：单次 function tool 调用的 headless 投影 */
export type AiAgentRunTraceToolCall = Readonly<{
  /** 工具名称（如 model_script / module_action） */
  toolName: string
  /** 调用参数的截断预览文本 */
  argsPreview: string
  /** 所属轮次 ID */
  turnId: string
  /** 工具循环轮次序号（从 1 开始） */
  round: number
  /** OpenAI function call ID，可能为 null（非 function calling 场景） */
  callId: string | null
  /** 调用结果状态：success=成功 / error=失败 */
  status: 'success' | 'error'
  /** 调用结果的截断摘要文本，可能为 null */
  resultSummary: string | null
  /** 调用耗时（毫秒） */
  durationMs: number
}>

/** 推理过程轨迹条目：模型 reasoning 输出的 headless 投影 */
export type AiAgentRunTraceReasoning = Readonly<{
  /** 推理文本内容 */
  text: string
  /** 所属轮次 ID */
  turnId: string
  /** UI 是否默认折叠；轮次结束后自动折叠 */
  collapsed: boolean
}>

/** Ai Agent Run Trace Entry 的语义模型。 */
export type AiAgentRunTraceEntry =
  | Readonly<{ kind: 'user-message'; content: string; timestamp: number }>
  | Readonly<{ kind: 'assistant-delta'; content: string; turnId: string }>
  | Readonly<{ kind: 'assistant-complete'; content: string; turnId: string }>
  | Readonly<{ kind: 'reasoning'; item: AiAgentRunTraceReasoning }>
  | Readonly<{ kind: 'tool-call'; item: AiAgentRunTraceToolCall }>
  | Readonly<{ kind: 'error'; message: string; timestamp: number }>
  | Readonly<{ kind: 'system-message'; content: string; timestamp: number }>

/** run trace 快照：headless 消费者订阅获得的完整只读投影 */
export type AiAgentRunTraceSnapshot = Readonly<{
  /** 当前正在流式输出的文本（尚未完成一个完整 assistant 消息） */
  streamText: string
  /** 当前正在流式输出的推理文本 */
  reasoningText: string
  /** 是否正在流式输出 assistant 文本 */
  isStreaming: boolean
  /** 是否正在流式输出推理文本 */
  isReasoning: boolean
  /** 有序的展示条目列表（含 user-message / assistant-delta / reasoning / tool-call / error / system-message） */
  entries: readonly AiAgentRunTraceEntry[]
  /** 已完成的所有工具调用记录列表 */
  toolCalls: readonly AiAgentRunTraceToolCall[]
}>

/** run trace 创建配置 */
export type AiAgentRunTraceOptions = Readonly<{
  /** 自定义时间戳函数，默认 Date.now；测试中可注入确定性时钟 */
  now?: () => number
  /** 工具调用参数预览截断长度，默认 200 字符 */
  argsPreviewLimit?: number
  /** 工具调用结果预览截断长度，默认 300 字符 */
  resultPreviewLimit?: number
}>

/** Ai Agent Run Trace Listener 的语义模型。 */
export type AiAgentRunTraceListener = (snapshot: AiAgentRunTraceSnapshot) => void

/** headless run trace 接口：UI 无关的活跃 run 状态投影，不持有持久化历史 */
export type AiAgentRunTrace = Readonly<{
  /** 获取当前只读快照 */
  snapshot(): AiAgentRunTraceSnapshot
  /** 订阅快照变化；返回取消订阅函数 */
  subscribe(listener: AiAgentRunTraceListener): () => void
  /** 追加用户消息条目 */
  appendUserMessage(content: string): void
  /** 追加模型文本增量（流式输出 token） */
  appendDelta(delta: string): void
  /** 追加推理文本增量（流式输出 reasoning token） */
  appendReasoning(text: string): void
  /** 从原始 SSE 事件派发内部状态变更（自动路由 delta/reasoning/result/error） */
  appendEvent(event: AiAgentStreamEvent): void
  /** 追加工具调用完成记录 */
  appendToolCall(record: AiAgentToolCallRecord): void
  /** 追加错误条目并清除流式状态 */
  appendError(message: string): void
  /** 标记为用户主动中断，追加系统消息并结束当前 turn */
  markAborted(message?: string): void
  /** 结束当前活跃 turn（如有），将 assistant-delta 转为 assistant-complete */
  finish(): void
  /** 重置全部状态到空快照 */
  reset(): void
}>

type MutableTraceState = {
  streamText: string
  reasoningText: string
  isStreaming: boolean
  isReasoning: boolean
  entries: AiAgentRunTraceEntry[]
  toolCalls: AiAgentRunTraceToolCall[]
  activeTurnId: string | null
}

const DEFAULT_ARGS_PREVIEW_LIMIT = 200
const DEFAULT_RESULT_PREVIEW_LIMIT = 300

export function createAiAgentRunTrace(options: AiAgentRunTraceOptions = {}): AiAgentRunTrace {
  return new DefaultAiAgentRunTrace(options)
}

class DefaultAiAgentRunTrace implements AiAgentRunTrace {
  private readonly state: MutableTraceState = createEmptyState()
  private readonly listeners = new Set<AiAgentRunTraceListener>()
  private readonly now: () => number
  private readonly argsPreviewLimit: number
  private readonly resultPreviewLimit: number

  public constructor(options: AiAgentRunTraceOptions) {
    this.now = options.now ?? Date.now
    this.argsPreviewLimit = options.argsPreviewLimit ?? DEFAULT_ARGS_PREVIEW_LIMIT
    this.resultPreviewLimit = options.resultPreviewLimit ?? DEFAULT_RESULT_PREVIEW_LIMIT
  }

  public snapshot(): AiAgentRunTraceSnapshot {
    return snapshotState(this.state)
  }

  public subscribe(listener: AiAgentRunTraceListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  public appendEvent(event: AiAgentStreamEvent): void {
    const turnId = event.scope.turnId
    if (turnId.length === 0) return

    const eventType = String(event.type)

    if (
      eventType === 'llm-request'
      || eventType === 'delta'
      || eventType.includes('message.delta')
    ) {
      this.state.activeTurnId = turnId
      this.state.isStreaming = true
      this.emit()
      return
    }

    if (eventType === 'reasoning') {
      this.state.activeTurnId = turnId
      this.state.isStreaming = true
      this.state.isReasoning = true
      this.emit()
      return
    }

    if (
      eventType === 'result'
      || eventType === 'done'
      || eventType.includes('message.completed')
    ) {
      this.finalizeCurrentTurn()
      return
    }

    if (eventType === 'error') {
      this.appendError(readErrorMessage(event.data))
      this.finalizeCurrentTurn()
    }
  }

  public appendDelta(delta: string): void {
    const turnId = this.state.activeTurnId
    if (turnId === null) {
      this.appendProtocolError('Received AI delta before any turn event.')
      return
    }
    this.appendAssistantDelta(turnId, delta)
  }

  public appendReasoning(text: string): void {
    const turnId = this.state.activeTurnId
    if (turnId === null) {
      this.appendProtocolError('Received AI reasoning before any turn event.')
      return
    }
    this.appendReasoningEntry(turnId, text)
  }

  public appendToolCall(record: AiAgentToolCallRecord): void {
    const item: AiAgentRunTraceToolCall = {
      toolName: record.toolName,
      argsPreview: previewAiAgentDiagnosticValue(record.args, this.argsPreviewLimit),
      turnId: record.turnId,
      round: record.round,
      callId: record.callId ?? null,
      status: record.status,
      resultSummary: previewAiAgentDiagnosticValue(record.result, this.resultPreviewLimit),
      durationMs: record.durationMs,
    }
    this.state.toolCalls = [...this.state.toolCalls, item]
    this.state.entries = [
      ...this.state.entries,
      { kind: 'tool-call', item },
    ]
    this.emit()
  }

  public appendUserMessage(content: string): void {
    this.state.entries = [
      ...this.state.entries,
      { kind: 'user-message', content, timestamp: this.now() },
    ]
    this.emit()
  }

  public appendError(message: string): void {
    this.state.entries = [
      ...this.state.entries,
      { kind: 'error', message, timestamp: this.now() },
    ]
    this.state.isStreaming = false
    this.state.isReasoning = false
    this.emit()
  }

  public markAborted(message?: string): void {
    this.state.entries = [
      ...this.state.entries,
      {
        kind: 'system-message',
        content: message ?? '本地已中断',
        timestamp: this.now(),
      },
    ]
    this.finish()
  }

  public finish(): void {
    if (this.state.activeTurnId !== null) {
      this.finalizeCurrentTurn()
      return
    }
    this.state.isStreaming = false
    this.state.isReasoning = false
    this.emit()
  }

  public reset(): void {
    replaceState(this.state, createEmptyState())
    this.emit()
  }

  private appendProtocolError(message: string): void {
    this.state.entries = [
      ...this.state.entries,
      { kind: 'error', message, timestamp: this.now() },
    ]
    this.emit()
  }

  private appendAssistantDelta(turnId: string, delta: string): void {
    this.state.streamText += delta
    this.state.isStreaming = true

    const index = findLastEntryIndex(
      this.state.entries,
      (entry) => entry.kind === 'assistant-delta' && entry.turnId === turnId,
    )
    if (index >= 0) {
      const existing = this.state.entries[index]
      if (existing?.kind === 'assistant-delta') {
        this.replaceEntryAt(index, {
          ...existing,
          content: existing.content + delta,
        })
        this.emit()
        return
      }
    }
    this.state.entries = [
      ...this.state.entries,
      { kind: 'assistant-delta', content: delta, turnId },
    ]
    this.emit()
  }

  private appendReasoningEntry(turnId: string, text: string): void {
    this.state.reasoningText += text
    this.state.isReasoning = true

    const index = findLastEntryIndex(
      this.state.entries,
      (entry) => entry.kind === 'reasoning' && entry.item.turnId === turnId,
    )
    if (index >= 0) {
      const existing = this.state.entries[index]
      if (existing?.kind === 'reasoning') {
        this.replaceEntryAt(index, {
          kind: 'reasoning',
          item: { text: existing.item.text + text, turnId, collapsed: false },
        })
        this.emit()
        return
      }
    }
    this.state.entries = [
      ...this.state.entries,
      { kind: 'reasoning', item: { text, turnId, collapsed: false } },
    ]
    this.emit()
  }

  private finalizeCurrentTurn(): void {
    const turnId = this.state.activeTurnId
    if (turnId === null) {
      this.state.isStreaming = false
      this.state.isReasoning = false
      this.emit()
      return
    }

    this.state.entries = this.state.entries.map((entry) => {
      if (entry.kind === 'assistant-delta' && entry.turnId === turnId) {
        return { kind: 'assistant-complete', content: entry.content, turnId }
      }
      if (entry.kind === 'reasoning' && entry.item.turnId === turnId) {
        return { kind: 'reasoning', item: { ...entry.item, collapsed: true } }
      }
      return entry
    })

    this.state.activeTurnId = null
    this.state.isStreaming = false
    this.state.isReasoning = false
    this.emit()
  }

  private replaceEntryAt(index: number, replacement: AiAgentRunTraceEntry): void {
    this.state.entries = this.state.entries.map((entry, i) =>
      i === index ? replacement : entry,
    )
  }

  private emit(): void {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}

function createEmptyState(): MutableTraceState {
  return {
    streamText: '',
    reasoningText: '',
    isStreaming: false,
    isReasoning: false,
    entries: [],
    toolCalls: [],
    activeTurnId: null,
  }
}

function replaceState(target: MutableTraceState, source: MutableTraceState): void {
  target.streamText = source.streamText
  target.reasoningText = source.reasoningText
  target.isStreaming = source.isStreaming
  target.isReasoning = source.isReasoning
  target.entries = source.entries
  target.toolCalls = source.toolCalls
  target.activeTurnId = source.activeTurnId
}

function snapshotState(state: MutableTraceState): AiAgentRunTraceSnapshot {
  return {
    streamText: state.streamText,
    reasoningText: state.reasoningText,
    isStreaming: state.isStreaming,
    isReasoning: state.isReasoning,
    entries: [...state.entries],
    toolCalls: [...state.toolCalls],
  }
}

function findLastEntryIndex(
  entries: readonly AiAgentRunTraceEntry[],
  predicate: (entry: AiAgentRunTraceEntry) => boolean,
): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry !== undefined && predicate(entry)) return index
  }
  return -1
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readErrorMessage(data: unknown): string {
  if (typeof data === 'string' && data.trim().length > 0) return data
  if (isPlainObject(data)) {
    const message = data['message']
    if (typeof message === 'string' && message.trim().length > 0) return message
  }
  return 'AI turn error'
}
