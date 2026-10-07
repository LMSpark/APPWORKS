/**
 * @module @spark-appworks/spark-ai:agent/conversation/session/default-session-store
 * 职责：定义或实现 Agent 会话存储、诊断和运行轨迹中的 default session store 能力。
 * 边界：只维护 session 层状态和观测数据，不生成业务输入契约，也不直接执行工具 runtime。
 * AI用途：追踪会话记录、诊断事件或 run trace 时，用本模块确认 session 数据如何保存和读取。
 */

import type { AiAgentAppendMessageOptions, AiAgentRuntimeContext } from '../../business/scope-types'
import {
  AiAgentSessionStore,
  type AiAgentAppendFunctionCallOptions,
  type AiAgentFunctionCallHistoryEntry,
  type AiAgentHistoryEntry,
  type AiAgentMessageHistoryEntry,
  type AiAgentMessageRole,
  type AiAgentMessageSource,
  type AiAgentSessionRecord,
} from './session-types'
import { isRecord } from '@spark-appworks/spark-utils'

/** 存储选项：允许注入自定义时间源（便于测试） */
export type DefaultAiAgentSessionStoreOptions = Readonly<{
  /** 时间戳生成函数；默认 Date.now，注入后用于测试中固定时间或加速时间流动 */
  now?: () => number
}>

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 内部可变会话类型
// ═══════════════════════════════════════════════════════════════

/** 内部可变会话（对外通过 cloneSession 暴露只读版本） */
type MutableSession = {
  readonly moduleId: string
  readonly moduleInstanceId: string
  readonly instanceId: string
  readonly runtimeInstanceId: string
  status: 'Started' | 'Stopped'
  startedAt: number
  updatedAt: number
  stoppedAt?: number
  reason?: string
  history: AiAgentHistoryEntry[]
}

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · DefaultAiAgentSessionStore class
// ═══════════════════════════════════════════════════════════════

/** Default Ai Agent Session Store 的语义模型。 */
export class DefaultAiAgentSessionStore extends AiAgentSessionStore {
  /** key → MutableSession */
  private readonly sessions = new Map<string, MutableSession>()

  /** 全局历史条目序号（递增） */
  private nextHistorySeq = 1

  /** 时间源（默认 Date.now，可注入用于测试） */
  private readonly now: () => number

    /** 创建 Default Ai Agent Session Store 实例。 */
public constructor(options: DefaultAiAgentSessionStoreOptions = {}) {
    super()
    this.now = options.now ?? Date.now
  }

  // ── 生命周期 ──────────────────────────────────────────────

  /** 启动会话：创建新记录或复用已有记录 */
  public startSession(context: AiAgentRuntimeContext): AiAgentSessionRecord {
    const key = sessionKey(context)
    const ts = this.now()
    const existing = this.sessions.get(key)
    // 复用已有 session：重置为 Started 状态
    if (existing !== undefined) {
      existing.status = 'Started'
      existing.updatedAt = ts
      delete existing.stoppedAt
      delete existing.reason
      return cloneSession(existing)
    }
    // 新建 session
    const session: MutableSession = {
      moduleId: context.moduleId,
      moduleInstanceId: context.moduleInstanceId,
      instanceId: context.instanceId,
      runtimeInstanceId: context.instanceId,
      status: 'Started',
      startedAt: ts,
      updatedAt: ts,
      history: [],
    }
    this.sessions.set(key, session)
    return cloneSession(session)
  }

  /** 停止会话 */
  public stopSession(context: AiAgentRuntimeContext, reason?: string): AiAgentSessionRecord | null {
    const session = this.sessions.get(sessionKey(context))
    if (session === undefined) return null
    const ts = this.now()
    session.status = 'Stopped'
    session.updatedAt = ts
    session.stoppedAt = ts
    if (reason !== undefined) session.reason = reason
    return cloneSession(session)
  }

  /** 获取会话记录 */
  public getSession(context: AiAgentRuntimeContext): AiAgentSessionRecord | null {
    const session = this.sessions.get(sessionKey(context))
    return session === undefined ? null : cloneSession(session)
  }

  /** 列出所有会话（按 startedAt 升序） */
  public listSessions(): readonly AiAgentSessionRecord[] {
    return [...this.sessions.values()]
      .sort((a, b) => a.startedAt - b.startedAt)
      .map((session) => cloneSession(session))
  }

  // ── 历史查询 ──────────────────────────────────────────────

  /** 获取会话历史（返回深拷贝） */
  public getSessionHistory(context: AiAgentRuntimeContext): readonly AiAgentHistoryEntry[] {
    const session = this.sessions.get(sessionKey(context))
    return session === undefined ? [] : session.history.map((entry) => cloneHistoryEntry(entry))
  }

  // ── 追加记录 ──────────────────────────────────────────────

  /** 追加消息条目 */
  public appendMessage(options: AiAgentAppendMessageOptions): AiAgentMessageHistoryEntry {
    const session = this.requireSession(options)
    const ts = this.now()
    const entry: AiAgentMessageHistoryEntry = {
      moduleId: options.moduleId,
      moduleInstanceId: options.moduleInstanceId,
      instanceId: options.instanceId,
      runtimeInstanceId: options.instanceId,
      id: this.nextHistoryId(options.instanceId),
      seq: this.nextHistorySeq - 1,
      timestamp: ts,
      kind: 'message',
      role: options.role,
      source: options.source ?? defaultSource(options.role),
      content: options.content,
      ...(options.metadata === undefined ? {} : { metadata: cloneMetadata(options.metadata) }),
    }
    session.history.push(entry)
    session.updatedAt = ts
    return cloneMessageEntry(entry)
  }

  /** 追加工具调用条目 */
  public appendFunctionCall(options: AiAgentAppendFunctionCallOptions): AiAgentFunctionCallHistoryEntry {
    const session = this.requireSession(options)
    const ts = this.now()
    // 状态推导：未指定时根据 error 是否存在判定 completed/failed
    const status = options.status ?? (options.error === undefined ? 'completed' : 'failed')
    const entry: AiAgentFunctionCallHistoryEntry = {
      moduleId: options.moduleId,
      moduleInstanceId: options.moduleInstanceId,
      instanceId: options.instanceId,
      runtimeInstanceId: options.runtimeInstanceId,
      id: this.nextHistoryId(options.instanceId),
      seq: this.nextHistorySeq - 1,
      timestamp: ts,
      kind: 'functionCall',
      toolName: options.toolName,
      args: cloneUnknown(options.args),
      status,
      ...(status === 'requested' ? {} : { completedAt: ts }),
      ...(options.result === undefined ? {} : { result: cloneUnknown(options.result) }),
      ...(options.error === undefined ? {} : { error: { ...options.error } }),
      ...(options.metadata === undefined ? {} : { metadata: cloneMetadata(options.metadata) }),
    }
    session.history.push(entry)
    session.updatedAt = ts
    return cloneFunctionCallEntry(entry)
  }

  // ── 内部辅助 ──────────────────────────────────────────────

  /** 获取 session，若不存在则抛异常 */
  private requireSession(context: AiAgentRuntimeContext): MutableSession {
    const session = this.sessions.get(sessionKey(context))
    if (session === undefined) {
      throw new Error(
        `[DefaultAiAgentSessionStore] session not found for ${context.moduleId}/${context.moduleInstanceId}; call startSession first.`,
      )
    }
    return session
  }

  /** 生成历史条目 ID："{instanceId}:history:{seq}" */
  private nextHistoryId(instanceId: string): string {
    const seq = this.nextHistorySeq
    this.nextHistorySeq += 1
    return `${instanceId}:history:${seq}`
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 内部辅助函数
// ═══════════════════════════════════════════════════════════════

/** 生成会话键：moduleId\0moduleInstanceId（null 字符分隔防止碰撞） */
function sessionKey(context: Pick<AiAgentRuntimeContext, 'moduleId' | 'moduleInstanceId'>): string {
  return `${context.moduleId} ${context.moduleInstanceId}`
}

/** 根据 role 推导默认 source */
function defaultSource(role: AiAgentMessageRole): AiAgentMessageSource {
  switch (role) {
    case 'user': return 'ui'
    case 'assistant': return 'llm'
    case 'system': return 'system'
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 深拷贝工具函数
// ═══════════════════════════════════════════════════════════════

/** 深拷贝会话（可变 → 只读） */
function cloneSession(session: MutableSession): AiAgentSessionRecord {
  return {
    moduleId: session.moduleId,
    moduleInstanceId: session.moduleInstanceId,
    instanceId: session.instanceId,
    runtimeInstanceId: session.runtimeInstanceId,
    status: session.status,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    ...(session.stoppedAt === undefined ? {} : { stoppedAt: session.stoppedAt }),
    ...(session.reason === undefined ? {} : { reason: session.reason }),
    history: session.history.map((entry) => cloneHistoryEntry(entry)),
  }
}

/** 深拷贝历史条目 */
function cloneHistoryEntry(entry: AiAgentHistoryEntry): AiAgentHistoryEntry {
  return entry.kind === 'message' ? cloneMessageEntry(entry) : cloneFunctionCallEntry(entry)
}

/** 深拷贝消息条目 */
function cloneMessageEntry(entry: AiAgentMessageHistoryEntry): AiAgentMessageHistoryEntry {
  return {
    moduleId: entry.moduleId,
    moduleInstanceId: entry.moduleInstanceId,
    instanceId: entry.instanceId,
    runtimeInstanceId: entry.runtimeInstanceId,
    id: entry.id,
    seq: entry.seq,
    timestamp: entry.timestamp,
    kind: 'message',
    role: entry.role,
    source: entry.source,
    content: entry.content,
    ...(entry.metadata === undefined ? {} : { metadata: cloneMetadata(entry.metadata) }),
  }
}

/** 深拷贝工具调用条目 */
function cloneFunctionCallEntry(entry: AiAgentFunctionCallHistoryEntry): AiAgentFunctionCallHistoryEntry {
  return {
    moduleId: entry.moduleId,
    moduleInstanceId: entry.moduleInstanceId,
    instanceId: entry.instanceId,
    runtimeInstanceId: entry.runtimeInstanceId,
    id: entry.id,
    seq: entry.seq,
    timestamp: entry.timestamp,
    kind: 'functionCall',
    toolName: entry.toolName,
    args: cloneUnknown(entry.args),
    status: entry.status,
    ...(entry.completedAt === undefined ? {} : { completedAt: entry.completedAt }),
    ...(entry.result === undefined ? {} : { result: cloneUnknown(entry.result) }),
    ...(entry.error === undefined ? {} : { error: { ...entry.error } }),
    ...(entry.metadata === undefined ? {} : { metadata: cloneMetadata(entry.metadata) }),
  }
}

/** 深拷贝 metadata（确保返回 Record 类型） */
function cloneMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const cloned = cloneUnknown(value)
  return isRecord(cloned) ? cloned : { ...value }
}

/**
 * 通用深拷贝：通过 JSON 序列化/反序列化实现。
 * 不可序列化的值（函数、Symbol、BigInt 等）保留原引用。
 * BigInt 会被转为字符串。
 */
function cloneUnknown(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== 'object') return value
  try {
    const text = JSON.stringify(value)
    return JSON.parse(text)
  } catch {
    return value
  }
}
