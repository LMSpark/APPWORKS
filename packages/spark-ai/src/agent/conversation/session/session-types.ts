/**
 * @module @spark-appworks/spark-ai:agent/conversation/session/session-types
 * 职责：定义或实现 Agent 会话存储、诊断和运行轨迹中的 session types 能力。
 * 边界：只维护 session 层状态和观测数据，不生成业务输入契约，也不直接执行工具 runtime。
 * AI用途：追踪会话记录、诊断事件或 run trace 时，用本模块确认 session 数据如何保存和读取。
 */

import type { AiAgentAppendMessageOptions, AiAgentRuntimeContext } from '../../business/scope-types'
import type { AiAgentTransportToolSpec } from '../transport/transport-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 工具调用结果
// ═══════════════════════════════════════════════════════════════

/** 工具调用结果中的结构化检查项（error / warn / info）。 */
export type AiAgentFunctionCallCheck = Readonly<{
  /** 检查严重级别：error 表示失败，warn/info 仅提示。 */
  level: 'error' | 'warn' | 'info'
  /** 机器可读检查码，供 LLM 与诊断系统定位问题。 */
  code: string
  /** 人可读检查说明，写入 tool result 或 session 历史。 */
  message: string
  /** 可选修复提示，引导 LLM 修正参数或补执行工具。 */
  hint?: string
}>

/**
 * 工具调用失败结果。
 *
 * 字段：
 *   ok     — 固定 false
 *   code   — 机器可读失败码
 *   msg    — 失败说明（回灌给 LLM）
 *   fix    — 修正建议（回灌给 LLM）
 *   checks — 可选附加检查项
 */
export type AiAgentFunctionCallFailure = Readonly<{
  /** 固定 false，标识工具调用失败分支。 */
  ok: false
  /** 机器可读失败码，对齐 AiAgentToolResult 错误 check 的 code。 */
  code: string
  /** 失败说明，作为 tool role message 的 content 回灌给 LLM。 */
  msg: string
  /** 修正建议，写入 tool result 的 fix 字段引导 LLM 重试。 */
  fix: string
  /** 可选附加检查项，与主失败 check 一并回传给 LLM。 */
  checks?: readonly AiAgentFunctionCallCheck[]
}>

/**
 * 工具调用结果（联合类型）。
 * ok:true  → 成功，携带 data（可选）和 summary（可选）
 * ok:false → 失败，携带 code / msg / fix / checks（对齐工具结果的错误 check，完整回传给 LLM）
 */
export type AiAgentFunctionCallResult<TData> = Readonly<{
  ok: true
  data?: TData
  summary?: string
}> | AiAgentFunctionCallFailure

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 会话状态与条目基础类型
// ═══════════════════════════════════════════════════════════════

/** Ai Agent Session Status 的语义模型。 */
export type AiAgentSessionStatus = 'Started' | 'Stopped'
/** Ai Agent Message Role 的语义模型。 */
export type AiAgentMessageRole = 'system' | 'user' | 'assistant'
/** Ai Agent Message Source 的语义模型。 */
export type AiAgentMessageSource = 'system' | 'ui' | 'llm'
/** Ai Agent Function Call History Status 的语义模型。 */
export type AiAgentFunctionCallHistoryStatus = 'requested' | 'completed' | 'failed'

/** 历史条目公共字段：会话定位、序号与时间戳。 */
export type AiAgentHistoryEntryBase = Readonly<{
  /** 业务模块 ID，标识该历史条目所属的业务类型。 */
  moduleId: string
  /** 业务模块实例 ID，标识同一 moduleId 下的具体业务实例。 */
  moduleInstanceId: string
  /** 会话实例 ID，startSession 时分配，贯穿单次 Agent 会话生命周期。 */
  instanceId: string
  /** 运行时实例 ID，标识产生该条目的 tool-loop / chat turn 上下文。 */
  runtimeInstanceId: string
  /** 历史条目唯一 ID，用于去重与增量同步。 */
  id: string
  /** 会话内单调递增序号，保证历史条目时序可重建。 */
  seq: number
  /** 条目创建时间戳（毫秒），用于排序与诊断。 */
  timestamp: number
}>

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 历史条目
// ═══════════════════════════════════════════════════════════════

/** 消息历史条目（用户消息 / 助手回复 / 系统消息） */
export type AiAgentMessageHistoryEntry = AiAgentHistoryEntryBase & Readonly<{
  /** 固定 'message'，作为历史条目联合类型的判别字段。 */
  kind: 'message'
  /** OpenAI 对齐的消息角色：system / user / assistant。 */
  role: AiAgentMessageRole
  /** 消息来源：system 内核注入、ui 用户界面、llm 模型输出。 */
  source: AiAgentMessageSource
  /** 消息正文内容。 */
  content: string
  /** 可选扩展元数据，供 UI 或诊断附加信息。 */
  metadata?: Record<string, unknown>
}>

/** 工具调用历史条目（OpenAI function call 记录） */
export type AiAgentFunctionCallHistoryEntry = AiAgentHistoryEntryBase & Readonly<{
  /** 固定 'functionCall'，作为历史条目联合类型的判别字段。 */
  kind: 'functionCall'
  /** 被调用的工具名称，来自 LLM tool_calls 中的 function.name。 */
  toolName: string
  /** 工具调用参数，JSON 解析后的原始值。 */
  args: unknown
  /** 工具调用状态：requested 已发起、completed 已成功、failed 已失败。 */
  status: AiAgentFunctionCallHistoryStatus
  /** 工具调用完成时间戳（毫秒）；status 为 completed/failed 时写入。 */
  completedAt?: number
  /** 工具调用成功返回值；status 为 completed 时写入。 */
  result?: unknown
  /** 工具调用失败详情；status 为 failed 时写入，对齐 AiAgentFunctionCallFailure。 */
  error?: AiAgentFunctionCallFailure
  /** 可选扩展元数据，供 UI 或诊断附加信息。 */
  metadata?: Record<string, unknown>
}>

/** 历史条目联合类型 */
export type AiAgentHistoryEntry = AiAgentMessageHistoryEntry | AiAgentFunctionCallHistoryEntry

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 会话记录
// ═══════════════════════════════════════════════════════════════

/** 会话记录：包含生命周期状态和历史条目，是 Agent 诊断与再次接入会话的根数据 */
export type AiAgentSessionRecord = Readonly<{
  /** 业务模块 ID，标识该会话所属的业务类型。 */
  moduleId: string
  /** 业务模块实例 ID，标识同一 moduleId 下的具体业务实例。 */
  moduleInstanceId: string
  /** 会话实例 ID，startSession 时分配，作为会话主键。 */
  instanceId: string
  /** 最近一次写入历史的运行时实例 ID，用于 turn 级追踪。 */
  runtimeInstanceId: string
  /** 会话生命周期状态：Started 运行中、Stopped 已停止。 */
  status: AiAgentSessionStatus
  /** 会话启动时间戳（毫秒）。 */
  startedAt: number
  /** 会话最后更新时间戳（毫秒），每次 append 或 stop 时刷新。 */
  updatedAt: number
  /** 会话停止时间戳（毫秒）；status 为 Stopped 时写入。 */
  stoppedAt?: number
  /** 停止原因说明，stopSession 时可选传入。 */
  reason?: string
  /** 按 seq 排序的完整历史条目列表（消息 + 工具调用）。 */
  history: readonly AiAgentHistoryEntry[]
}>

/** 会话启动结果：返回给业务方的初始状态 */
export type AiAgentStartSessionResult = Readonly<{
  /** 固定 'Started'，表示会话已成功创建。 */
  status: 'Started'
  /** 新分配的会话实例 ID，后续 chat / append 均以此定位会话。 */
  instanceId: string
  /** 业务模块 ID，与 registration.moduleId 一致。 */
  moduleId: string
  /** 业务模块实例 ID，标识具体业务实例。 */
  moduleInstanceId: string
  /** 完整会话记录，含初始空 history 与 Started 状态。 */
  session: AiAgentSessionRecord
  /** 当前 registration 暴露给 LLM 的工具规格列表。 */
  tools: readonly AiAgentTransportToolSpec[]
}>

// ═══════════════════════════════════════════════════════════════
// 第 5 节 · 工具调用追加选项
// ═══════════════════════════════════════════════════════════════

/** 向 sessionStore 追加工具调用记录的参数 */
export type AiAgentAppendFunctionCallOptions = AiAgentRuntimeContext & Readonly<{
  /** 产生该工具调用的运行时实例 ID，用于 turn 级历史隔离。 */
  runtimeInstanceId: string
  /** 被调用的工具名称。 */
  toolName: string
  /** 工具调用参数。 */
  args: unknown
  /** 工具调用状态；省略时由 store 实现决定默认（通常为 requested）。 */
  status?: AiAgentFunctionCallHistoryStatus
  /** 工具调用成功返回值；status 为 completed 时写入。 */
  result?: unknown
  /** 工具调用失败详情；status 为 failed 时写入。 */
  error?: AiAgentFunctionCallFailure
  /** 可选扩展元数据，供 UI 或诊断附加信息。 */
  metadata?: Record<string, unknown>
}>

// ═══════════════════════════════════════════════════════════════
// 第 6 节 · 会话存储抽象（契约）
// ═══════════════════════════════════════════════════════════════

/**
 * 会话存储抽象类。
 *
 * 定义了 Host 层所需的全部持久化操作。业务方可继承此类实现自定义存储
 * （如 localStorage、IndexedDB、服务端持久化），也可直接使用默认的
 * DefaultAiAgentSessionStore（纯内存实现）。
 *
 * 历史会话只属于 spark-ai：它支撑 Agent 能力诊断、失败回看和后续再次接入
 * 同一业务会话；业务包和 smoke 只能读取它，不应复制或维护第二份历史。
 *
 * 方法分类：
 *   生命周期 — startSession / stopSession / getSession / listSessions
 *   历史查询 — getSessionHistory
 *   追加记录 — appendMessage / appendFunctionCall
 */
export abstract class AiAgentSessionStore {
  /** 启动会话：创建新的会话记录 */
  public abstract startSession(context: AiAgentRuntimeContext): AiAgentSessionRecord
  /** 停止会话：标记为 Stopped，记录原因 */
  public abstract stopSession(context: AiAgentRuntimeContext, reason?: string): AiAgentSessionRecord | null
  /** 获取会话记录 */
  public abstract getSession(context: AiAgentRuntimeContext): AiAgentSessionRecord | null
  /** 列出所有会话 */
  public abstract listSessions(): readonly AiAgentSessionRecord[]
  /** 获取会话历史（所有条目） */
  public abstract getSessionHistory(context: AiAgentRuntimeContext): readonly AiAgentHistoryEntry[]
  /** 追加消息条目 */
  public abstract appendMessage(options: AiAgentAppendMessageOptions): AiAgentMessageHistoryEntry
  /** 追加工具调用条目 */
  public abstract appendFunctionCall(options: AiAgentAppendFunctionCallOptions): AiAgentFunctionCallHistoryEntry
}
