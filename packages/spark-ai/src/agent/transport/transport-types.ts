/**
 * @module @spark-appworks/spark-ai:agent/transport/transport-types
 * 职责：定义 Agent transport 层的 transport types 协议，把 session/tool-loop 事件投影为应用可消费事件。
 * 边界：只描述传输事件和回调契约，不实现业务注册、不保存会话，也不渲染 UI。
 * AI用途：对齐 SSE、turn callback 或前端事件消费字段时，用本模块确认传输边界。
 */

import type { AiAgentScope } from '../business/scope-types'
import type { AiAgentStreamEvent, AiAgentTurnMeta } from '../chat/chat-types'
import type { JsonSchemaObject } from '@spark-appworks/spark-json-document'
import type {
  AiAgentAppSseEvent,
  AiAgentAppSseEventName,
} from './app-sse-events'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 工具规约与消息格式
// ═══════════════════════════════════════════════════════════════

/** 传输层工具规约（对齐 OpenAI function tool spec） */
export type AiAgentTransportToolSpec = Readonly<{
  /** 工具类型，当前固定为 'function'（对齐 OpenAI） */
  type: 'function'
  /** 函数定义：名称、描述、参数 JSON Schema、可选 strict 模式 */
  function: {
    readonly name: string
    readonly description: string
    readonly parameters: JsonSchemaObject
    /** OpenAI strict function calling：要求模型参数严格匹配 JSON Schema。 */
    readonly strict?: boolean
  }
}>

/** 传输层消息（对齐 OpenAI message 格式，支持 tool_calls） */
export type AiAgentTransportMessage = Readonly<{
  /** system 对齐 OpenAI，但 SPARK 当前轮次 system prompt 走 AiAgentStreamTurnInput.systemPrompt */
  role: 'user' | 'assistant' | 'system' | 'tool'
  /** 消息文本内容 */
  content: string
  /** role='tool' 时的工具调用 ID，与 AiAgentTransportToolCall.id 对应 */
  tool_call_id?: string
  /** role='assistant' 时的工具调用列表（一次 assistant 消息可发起多个并行 tool call） */
  tool_calls?: readonly AiAgentTransportToolCall[]
}>

/** 传输层工具调用（对齐 OpenAI function tool call） */
export type AiAgentTransportToolCall = Readonly<{
  /** 工具调用 ID，用于关联 tool 角色消息的 tool_call_id */
  id: string
  /** 调用类型，当前固定为 'function' */
  type: 'function'
  /** 函数调用详情：名称和 JSON 字符串形式的参数 */
  function: {
    readonly name: string
    readonly arguments: string
  }
}>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · AI turn 命令与事件
// ═══════════════════════════════════════════════════════════════

/** AI turn 启动输入（模型事件通过 APP 公共 SSE 返回） */
export type AiAgentStreamTurnInput = Readonly<{
  /** 会话 ID，标识后端持久化的对话上下文 */
  sessionId: string
  /** 本次 turn 的业务作用域（含 kind / instanceId / eventModuleId） */
  scope: AiAgentScope
  /** 轮次元数据 */
  turn: AiAgentTurnMeta
  /** 系统提示词，追加到消息列表之前 */
  systemPrompt: string
  /** 本次 turn 可调用的工具列表 */
  tools: readonly AiAgentTransportToolSpec[]
  /** 历史消息列表（含当前用户输入） */
  messages: readonly AiAgentTransportMessage[]
  /** 中断信号，触发后取消正在进行的 LLM 请求 */
  signal?: AbortSignal
  /** 原始 AI turn 事件回调 */
  onStreamEvent?: (event: AiAgentStreamEvent) => void
  /** 文本增量回调 */
  onDelta?: (delta: string) => void
  /** 推理过程增量回调 */
  onReasoning?: (reasoning: string) => void
  /** token 用量回调 */
  onUsage?: (usage: Record<string, unknown>) => void
}>

/** 后端 V4 会话准备输入；用于在 executeTurn 前显式确保 session 存在且 scope 正确。 */
export type AiAgentPrepareSessionInput = Readonly<{
  /** 会话 ID */
  sessionId: string
  /** 业务作用域 */
  scope: AiAgentScope
  /** 系统提示词 */
  systemPrompt: string
  /** 工具列表 */
  tools: readonly AiAgentTransportToolSpec[]
  /** 中断信号 */
  signal?: AbortSignal
}>

/** AI turn 汇总结果 */
export type AiAgentStreamTurnResult = Readonly<{
  /** 模型输出的完整文本内容 */
  text: string
  /** 模型推理过程文本（如有） */
  reasoning?: string
  /** 模型发起的工具调用列表 */
  toolCalls: readonly AiAgentTransportToolCall[]
  /** true 表示 transport 已把本轮 assistant 消息写入后端历史；工具循环只需追加 tool 结果。 */
  assistantMessagePersisted?: boolean
}>

/** 追加消息请求输入：将工具调用结果同步到后端会话 */
export type AiAgentAppendMessagesInput = Readonly<{
  /** 会话 ID */
  sessionId: string
  /** 业务作用域 */
  scope: AiAgentScope
  /** 轮次元数据 */
  turn: AiAgentTurnMeta
  /** 待追加的消息列表（通常为 tool 角色的工具调用结果） */
  messages: readonly AiAgentTransportMessage[]
}>

/** APP SSE 事件源接口：按事件名订阅 APP 层推送的 SSE 事件 */
export type AiAgentAppSseEventSource = Readonly<{
  /** 订阅指定事件名；返回取消订阅函数 */
  on(name: AiAgentAppSseEventName, listener: (event: AiAgentAppSseEvent) => void): () => void
}>

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · APP 层 I/O 回调
// ═══════════════════════════════════════════════════════════════

/** APP 层实现的三个 I/O 操作；spark-ai 只调用，不实现网络请求。 */
export type AiAgentTurnCallbacks = Readonly<{
  /** 可选：在 turn 前显式准备后端 session。 */
  prepareSession?: (input: AiAgentPrepareSessionInput) => Promise<void>
  /** 启动一次模型 turn，聚合 APP SSE 事件后返回结果。 */
  executeTurn: (input: AiAgentStreamTurnInput) => Promise<AiAgentStreamTurnResult>
  /** 将工具调用结果同步到后端会话。 */
  appendMessages: (input: AiAgentAppendMessagesInput) => Promise<void>
}>
