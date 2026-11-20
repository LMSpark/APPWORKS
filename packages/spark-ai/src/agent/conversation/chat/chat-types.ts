/**
 * @module @spark-appworks/spark-ai:agent/conversation/chat/chat-types
 * 职责：定义 Agent 聊天请求、消息、响应和流式事件之间共享的 DTO。
 * 边界：只维护跨 UI、transport、session 的消息协议，不发送网络请求，也不解释工具调用结果。
 * AI用途：对齐聊天消息结构、历史记录和响应 payload 时，用本模块确认字段含义。
 */

import type {
  AiAgentBeforeFunctionCallDirective,
  AiAgentBeforeFunctionCallOptions,
} from '../../business/lifecycle-types'
import type { AiAgentFunctionCallResult } from '../session/session-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 聊天消息与请求
// ═══════════════════════════════════════════════════════════════

/** 单条聊天消息（对齐 OpenAI message 格式），判别联合：role='tool' 必须有 tool_call_id */
export type AiAgentChatMessage = Readonly<{
  role: 'user' | 'assistant' | 'system'
  content: string
}> | Readonly<{
  role: 'tool'
  content: string
  tool_call_id: string
}>

/**
 * 聊天请求。
 *
 * 必填：
 *   historyMsgs — 历史消息列表（包含当前用户输入）
 *
 * 可选回调（流式传输）：
 *   onReasoning — 推理过程增量回调
 *   onDelta     — 文本增量回调
 *   onUsage     — token 用量回调
 *   onStreamEvent — 原始 AI turn 事件回调
 *   onToolCall  — 工具调用记录回调
 *   beforeFunctionCall — 本次请求级工具执行前置裁决
 *
 * 可选控制：
 *   turn        — 轮次元数据（未提供时自动生成）
 *   systemPrompt — 额外的系统提示词
 *   signal      — AbortSignal（取消请求）
 */
export type AiAgentChatRequest = Readonly<{
  /** 历史消息列表（含当前用户输入），按时间顺序排列 */
  historyMsgs: readonly AiAgentChatMessage[]
  /** 轮次元数据；未提供时由 tool-loop 自动生成 */
  turn?: AiAgentTurnMeta
  /** 额外的系统提示词，追加到业务默认 systemPrompt 之后 */
  systemPrompt?: string
  /** 中断信号，触发后取消正在进行的 LLM 请求 */
  signal?: AbortSignal
  /** 推理过程增量回调：模型输出 reasoning token 时逐段调用 */
  onReasoning?: (reasoning: string) => void
  /** 文本增量回调：模型输出正文 token 时逐段调用 */
  onDelta?: (delta: string) => void
  /** token 用量回调：每次模型返回 usage 时调用，参数为原始 usage 对象 */
  onUsage?: (usageRaw: Record<string, unknown>) => void
  /** 原始 AI turn 事件回调：所有 SSE 事件经此透传，用于调试或自定义处理 */
  onStreamEvent?: (event: AiAgentStreamEvent) => void
  /** 工具调用记录回调：每次 function tool 完成后调用 */
  onToolCall?: (record: AiAgentToolCallRecord) => void
  /** 本次请求级工具执行前置裁决：返回 deny 则跳过执行，返回 allow 则继续 */
  beforeFunctionCall?: (
    options: AiAgentBeforeFunctionCallOptions,
  ) => AiAgentBeforeFunctionCallDirective | Promise<AiAgentBeforeFunctionCallDirective>
}>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · turn stream 事件
// ═══════════════════════════════════════════════════════════════

/**
 * AI turn 事件（一次模型 turn 在 APP 公共 SSE 中的事件单元）。
 * type      — 事件类型（delta / reasoning / usage / result / error / tool-result 等）
 * data      — 事件数据（字符串）
 * turnKey   — turn 隔离键（kind + 顶层 instanceId + turnId）
 * streamKey — turn 内流键（turnKey + streamId）
 * scope     — 事件作用域（含 kind / 顶层 instanceId / eventModuleId / turnId）
 */
export type AiAgentStreamEvent = Readonly<{
  /** 事件类型标识（delta / reasoning / usage / result / error / tool-result 等） */
  type: string
  /** 事件数据，类型随 type 变化：delta 时为 string，其余通常为 object */
  data: unknown
  /** turn 隔离键：kind + 顶层 instanceId + turnId，用于 SSE 多路复用 */
  turnKey: string
  /** turn 内流键：turnKey + streamId，区分同一 turn 中的多个并行流 */
  streamKey: string
  /** 事件作用域：含业务注册 ID、实例 ID、事件模块 ID 和轮次 ID */
  scope: {
    readonly businessRegistrationId: string
    readonly businessInstanceId: string
    readonly eventModuleId: string
    readonly turnId: string
  }
}>

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 工具调用记录
// ═══════════════════════════════════════════════════════════════

/**
 * 工具调用记录（用于前端展示和调试）。
 * 每次 OpenAI function tool 调用完成后，tool-loop-runner 通过 onToolCall 回调
 * 将本记录传给业务方。
 */
export type AiAgentToolCallRecord = Readonly<{
  /** 工具名称（如 model_script / module_action） */
  toolName: string
  /** 工具调用参数（原始值，未截断） */
  args: unknown
  /** 所属轮次 ID */
  turnId: string
  /** 工具循环轮次序号（从 1 开始） */
  round: number
  /** OpenAI function call ID，可能为空（非 function calling 场景） */
  callId?: string
  /** 调用结果状态：success=成功 / error=失败 */
  status: 'success' | 'error'
  /** 调用结果（原始值，类型由具体工具决定） */
  result: AiAgentFunctionCallResult<unknown>
  /** 调用耗时（毫秒），从发起调用到收到结果 */
  durationMs: number
}>

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 轮次元数据
// ═══════════════════════════════════════════════════════════════

/**
 * 轮次元数据。
 * turnId          — 轮次 ID（UUID）
 * seq             — 序号
 * baseRevision    — 基础版本号（历史消息数 - 1）
 * queuedAt        — 排队时间（ISO 字符串）
 * startedAt       — 开始时间（ISO 字符串）
 * maxParallelTurns — 最大并行轮次（当前固定为 1）
 */
export type AiAgentTurnMeta = Readonly<{
  /** 轮次 ID（UUID），全局唯一标识一次模型 turn */
  turnId: string
  /** 轮次序号，从 1 开始递增 */
  seq: number
  /** 基础版本号 = 历史消息数 - 1，用于增量同步定位 */
  baseRevision: number
  /** 排队时间（ISO 8601 字符串） */
  queuedAt: string
  /** 开始执行时间（ISO 8601 字符串） */
  startedAt: string
  /** 最大并行轮次数，当前固定为 1（串行执行） */
  maxParallelTurns: number
}>
