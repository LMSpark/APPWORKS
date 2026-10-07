/**
 * @module @spark-appworks/spark-ai:agent/conversation/session/session-diagnostics
 * 职责：定义或实现 Agent 会话存储、诊断和运行轨迹中的 session diagnostics 能力。
 * 边界：只维护 session 层状态和观测数据，不生成业务输入契约，也不直接执行工具 runtime。
 * AI用途：追踪会话记录、诊断事件或 run trace 时，用本模块确认 session 数据如何保存和读取。
 */

import type {
  AiAgentFunctionCallHistoryEntry,
  AiAgentHistoryEntry,
  AiAgentMessageHistoryEntry,
  AiAgentSessionRecord,
} from './session-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 公共 DTO
// ═══════════════════════════════════════════════════════════════

/** Ai Agent Session Summary 的语义模型。 */
export type AiAgentSessionSummary = Readonly<{
  /** 会话状态，如 'running' / 'stopped' / 'completed'；sessionRecord 为空时为 null。 */
  status: string | null
  /** 历史 entry 总数（消息 + 工具调用 + 未知条目）。 */
  historyCount: number
  /** 消息类 entry 数量（仅 kind='message'）。 */
  messageCount: number
  /** 工具调用 entry 数量（仅 kind='functionCall'）。 */
  toolCallCount: number
  /** 失败的工具调用数量（status='failed'），用于判断 Agent 工具能力是否闭环。 */
  failedToolCallCount: number
  /** 所有工具调用使用过的函数名去重列表，用于快速了解本会话涉及哪些能力。 */
  functionNames: readonly string[]
  /** 最后一条 assistant 消息的文本内容；无 assistant 消息时为空串。 */
  lastAssistantText: string
}>

/** Ai Agent Session Transcript Entry 的语义模型。 */
export type AiAgentSessionTranscriptEntry = Readonly<{
  /** 历史条目的序号，与 session history 中的 seq 对应；解析失败时为 null。 */
  seq: number | null
  /** 历史条目的唯一 ID；解析失败时为空串。 */
  id: string
  /** ISO 时间戳字符串；原始 timestamp 为非数字时为 null。 */
  timestamp: string | null
  /** 条目种类：message = 消息，functionCall = 工具调用，unknown = 无法识别。 */
  kind: 'message' | 'functionCall' | 'unknown'
  /** 方向标识，如 'USER => AGENT' / 'LLM => AGENT' / 'AGENT TOOL => LLM'。 */
  direction: string
  /** 消息角色（仅 kind='message' 时有值）：user / assistant / system / developer。 */
  role?: string
  /** 消息来源（仅 kind='message' 时可能有值）。 */
  source?: string
  /** 工具名称（仅 kind='functionCall' 时有值）。 */
  toolName?: string
  /** 工具调用状态（仅 kind='functionCall' 时可能有值），如 'completed' / 'failed'。 */
  status?: string
  /** 消息内容或未知条目的序列化文本，按 contentLimit 裁剪。 */
  content?: string
  /** 工具调用参数的序列化文本，按 contentLimit 裁剪。 */
  args?: string
  /** 工具调用结果的序列化文本（优先取 result，fallback 取 error），按 contentLimit 裁剪。 */
  result?: string
}>

/** Ai Agent Session Transcript Options 的调用配置。 */
export type AiAgentSessionTranscriptOptions = Readonly<{
  /** 单个字段最大字符数，超出部分截断并追加 truncation 标记；默认 12000。 */
  contentLimit?: number
}>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 公共诊断入口
// ═══════════════════════════════════════════════════════════════

// AI_AGENT_REFACTOR_SOURCE[session-diagnostics]: AI 会话摘要和转录来自 sessionStore；冒烟检查不能维护重复历史。
/**
 * 汇总会话历史的数量、失败工具调用和最后一条助手文本。
 * 用于判断 Agent 工具能力是否闭环，也是再次接入会话前的轻量状态视图。
 *
 * `sessionRecord` 为空时返回空摘要，便于冒烟检查在会话启动失败后仍能生成当前运行摘要。
 */
export function summarizeAiAgentSessionRecord(sessionRecord: AiAgentSessionRecord | null | undefined): AiAgentSessionSummary {
  const history = getAiAgentSessionHistory(sessionRecord)
  const messageEntries = history.filter(isMessageEntry)
  const functionCallEntries = history.filter(isFunctionCallEntry)
  const failedFunctionCalls = functionCallEntries.filter((entry) => entry.status === 'failed')
  const functionNames = functionCallEntries
    .map((entry) => entry.toolName.trim())
    .filter((toolName) => toolName.length > 0)
  return {
    status: sessionRecord?.status ?? null,
    historyCount: history.length,
    messageCount: messageEntries.length,
    toolCallCount: functionCallEntries.length,
    failedToolCallCount: failedFunctionCalls.length,
    functionNames,
    lastAssistantText: latestAiAgentAssistantText(sessionRecord),
  }
}

/**
 * 将 session history 转成固定方向标识的调试转录。
 *
 * 转录会裁剪长字段，但不会丢弃条目顺序；调用方可展示在调试面板或临时日志中。
 * 它是 sessionStore 历史的视图，不是新的历史存储。
 */
export function createAiAgentSessionTranscript(
  sessionRecord: AiAgentSessionRecord | null | undefined,
  options: AiAgentSessionTranscriptOptions = {},
): readonly AiAgentSessionTranscriptEntry[] {
  const limit = normalizePreviewLimit(options.contentLimit)
  return getAiAgentSessionHistory(sessionRecord).map((entry) => {
    const base = {
      seq: typeof entry.seq === 'number' ? entry.seq : null,
      id: typeof entry.id === 'string' ? entry.id : '',
      timestamp: typeof entry.timestamp === 'number' ? new Date(entry.timestamp).toISOString() : null,
    }
    if (isMessageEntry(entry)) {
      return {
        ...base,
        kind: 'message',
        direction: messageDirection(entry.role),
        role: entry.role,
        source: entry.source,
        content: previewAiAgentDiagnosticValue(entry.content, limit),
      }
    }
    if (isFunctionCallEntry(entry)) {
      return {
        ...base,
        kind: 'functionCall',
        direction: 'AGENT TOOL => LLM',
        toolName: entry.toolName,
        status: entry.status,
        args: previewAiAgentDiagnosticValue(entry.args, limit),
        result: previewAiAgentDiagnosticValue(entry.result ?? entry.error ?? null, limit),
      }
    }
    return {
      ...base,
      kind: 'unknown',
      direction: 'UNKNOWN',
      content: previewAiAgentDiagnosticValue(entry, limit),
    }
  })
}

/**
 * 安全序列化诊断值，并按字符数裁剪。
 *
 * 该函数只用于日志/诊断展示，不应作为协议 payload 编解码入口。
 */
export function previewAiAgentDiagnosticValue(value: unknown, contentLimit = 12_000): string {
  const text = typeof value === 'string' ? value : stringifyDiagnosticValue(value)
  if (text.length <= contentLimit) return text
  return `${text.slice(0, contentLimit)}\n...<truncated ${text.length - contentLimit} chars>`
}

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 内部读取辅助
// ═══════════════════════════════════════════════════════════════

function getAiAgentSessionHistory(sessionRecord: AiAgentSessionRecord | null | undefined): readonly AiAgentHistoryEntry[] {
  return sessionRecord?.history ?? []
}

function latestAiAgentAssistantText(sessionRecord: AiAgentSessionRecord | null | undefined): string {
  const history = getAiAgentSessionHistory(sessionRecord)
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index]
    if (entry === undefined) continue
    if (isAssistantMessageEntry(entry)) {
      const content = entry.content.trim()
      if (content.length > 0) return content
    }
  }
  return ''
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 内部类型守卫与格式化
// ═══════════════════════════════════════════════════════════════

function isMessageEntry(entry: AiAgentHistoryEntry): entry is AiAgentMessageHistoryEntry {
  return entry.kind === 'message'
}

function isAssistantMessageEntry(entry: AiAgentHistoryEntry): entry is AiAgentMessageHistoryEntry {
  return isMessageEntry(entry) && entry.role === 'assistant'
}

function isFunctionCallEntry(entry: AiAgentHistoryEntry): entry is AiAgentFunctionCallHistoryEntry {
  return entry.kind === 'functionCall'
}

function messageDirection(role: string): string {
  if (role === 'user') return 'USER => AGENT'
  if (role === 'assistant') return 'LLM => AGENT'
  return 'SYSTEM => AGENT'
}

function normalizePreviewLimit(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 12_000
}

function stringifyDiagnosticValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
