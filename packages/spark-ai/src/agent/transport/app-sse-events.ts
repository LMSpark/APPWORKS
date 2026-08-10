/**
 * @module @spark-appworks/spark-ai:agent/transport/app-sse-events
 * 职责：定义 Agent transport 层的 app sse events 协议，把 session/tool-loop 事件投影为应用可消费事件。
 * 边界：只描述传输事件和回调契约，不实现业务注册、不保存会话，也不渲染 UI。
 * AI用途：对齐 SSE、turn callback 或前端事件消费字段时，用本模块确认传输边界。
 */

import type { ApiEnvelopeContext, ApiEnvelopeEvent } from '@spark-appworks/spark-utils'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · SSE 事件名 — 所有合法的 APP SSE 事件名
// ═══════════════════════════════════════════════════════════════

/**
 * SSE 事件名联合类型。
 *
 * 预定义的事件名：
 *   page-config              — 页面配置变更
 *   data-batch-job           — 批量数据任务状态
 *   data-change              — 数据变更通知
 *   notification             — 通用通知
 *   llm-frame                — AI 推理帧事件（核心：delta/reasoning/result/error/done）
 *
 * `string & {}` 后缀允许业务方扩展自定义事件名，同时保留 IDE 自动补全。
 */
export type AiAgentAppSseEventName =
  | 'page-config'
  | 'data-batch-job'
  | 'data-change'
  | 'notification'
  | 'llm-frame'
  | (string & {})

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · SSE 事件结构
// ═══════════════════════════════════════════════════════════════

/**
 * APP SSE 事件结构。
 *
 * 字段说明：
 *   name            — 事件名（如 llm-frame）
 *   ok              — 事件是否成功（false 表示 error 事件）
 *   data            — 已解析的事件数据（泛型 T）
 *   rawData         — 原始 JSON 字符串
 *   rawPayload      — 原始解析荷载（未做类型转换）
 *   protocolVersion — 可选协议版本号
 *   context         — API 信封上下文（可选）
 *   event           — API 信封事件（可选）
 */
export type AiAgentAppSseEvent<T = unknown> = Readonly<{
  /** 事件名；标识事件类型，如 llm-frame、page-config 等。 */
  name: AiAgentAppSseEventName
  /** 事件是否成功；false 表示 error 事件，消费方需检查 data 中的错误信息。 */
  ok: boolean
  /** 已解析的事件数据；泛型 T 由消费方按事件名约定提供具体类型。 */
  data: T
  /** 原始 JSON 字符串；保留未解析的载荷，用于调试和日志回放。 */
  rawData: string
  /** 原始解析荷载；JSON.parse 后的原始值，类型转换前的中间态。 */
  rawPayload: unknown
  /** 协议版本号；用于向后兼容检测，缺失时按最新版处理。 */
  protocolVersion?: number
  /** API 信封上下文；携带 requestId、tenantId 等跨层追踪信息。 */
  context?: ApiEnvelopeContext
  /** API 信封事件；标识信封内部的事件类型，与 name 可能不同（如信封复用场景）。 */
  event?: ApiEnvelopeEvent
}>
