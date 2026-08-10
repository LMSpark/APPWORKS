/**
 * @module @spark-appworks/spark-ai:agent/business/lifecycle-types
 * 职责：定义工具调用前后生命周期回调的输入、输出和 continue/complete/abort 流转契约。
 * 边界：只描述 lifecycle 协议，不执行策略、不调用工具，也不保存 session 状态。
 * AI用途：实现或审查业务级工具调用拦截、完成判定和中止逻辑时，用本模块确认回调语义。
 */

import type { JsonParams } from '@spark-appworks/spark-json-document'
import type { AiAgentFunctionCallResult } from '../session/session-types'
import type { AiAgentRuntimeContext } from './scope-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 工具调用前置裁决 — 执行 runtime 前的策略入口
// ═══════════════════════════════════════════════════════════════

/**
 * 工具调用前置裁决三态：
 *   'allow'  — 允许本次工具调用继续执行
 *   'reject' — 拒绝本次工具调用，回灌失败 tool result，当前 turn 可继续
 *   'abort'  — 中止当前 turn，并进入会话停止流程
 */
export type AiAgentBeforeFunctionCallStatus = 'allow' | 'reject' | 'abort'

/**
 * 工具调用前置裁决指令。
 *
 * 字段：
 *   status                — 必填，allow / reject / abort 之一
 *   reason                — 可选，拒绝或中止原因
 *   fix                   — 可选，给 LLM 的修正建议，仅 reject/abort 失败结果使用
 *   finalAssistantMessage — 可选，abort 时发送给用户的最终消息
 *   releaseInstance       — 可选，abort 时是否释放模块实例资源
 */
export type AiAgentBeforeFunctionCallDirective = Readonly<{
  /** 裁决结果：allow 允许执行，reject 回灌失败 tool result 后继续 turn，abort 中止 turn 并进入停止流程。 */
  status: AiAgentBeforeFunctionCallStatus
  /** 拒绝或中止的原因，写入 tool result 的 msg 字段供 LLM 阅读。 */
  reason?: string
  /** 给 LLM 的修正建议；reject/abort 时写入 tool result 的 fix 字段，引导 LLM 修正行为。 */
  fix?: string
  /** abort 时发送给用户的最终助手消息，替代 LLM 当前轮次的输出。 */
  finalAssistantMessage?: string
  /** abort 时是否同时释放模块实例资源（触发 onEndBusinessInstance + releaseModuleInstance）。 */
  releaseInstance?: boolean
}>

/**
 * beforeFunctionCall 回调的入参。
 *
 * 继承 AiAgentRuntimeContext（moduleId / moduleInstanceId / instanceId），
 * 追加本次工具调用的工具名与已解析参数。该钩子只负责策略裁决，不执行工具。
 */
export type AiAgentBeforeFunctionCallOptions = AiAgentRuntimeContext & Readonly<{
  /** 即将被调用的工具名称，来自 LLM tool_calls 中的 function.name。 */
  toolName: string
  /** 工具调用参数，已通过 JSON Schema 校验的键值对。 */
  args: JsonParams
}>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 生命周期状态 — 工具循环的三种终止条件
// ═══════════════════════════════════════════════════════════════

/**
 * 生命周期状态三态：
 *   'continue' — 继续下一轮工具调用（默认）
 *   'complete' — 业务目标已达成，正常结束当前 turn
 *   'abort'    — 业务异常或用户取消，中止当前 turn
 */
export type AiAgentLifecycleStatus = 'continue' | 'complete' | 'abort'

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 生命周期指令 — 状态 + 可选的辅助信息
// ═══════════════════════════════════════════════════════════════

/**
 * 生命周期指令：业务方在 afterFunctionCall 中返回，决定工具循环的后续行为。
 *
 * 字段：
 *   status               — 必填，三态之一
 *   reason               — 可选，结束原因（complete/abort 时建议提供）
 *   finalAssistantMessage — 可选，结束时发送给用户的最终消息
 *   releaseInstance      — 可选，是否在结束时释放模块实例资源
 */
export type AiAgentLifecycleDirective = Readonly<{
  /** 生命周期状态：continue 继续工具循环，complete 正常结束 turn，abort 异常中止 turn。 */
  status: AiAgentLifecycleStatus
  /** 结束原因；complete/abort 时建议提供，写入诊断日志。 */
  reason?: string
  /** 结束时发送给用户的最终助手消息，替代 LLM 当前轮次的输出。 */
  finalAssistantMessage?: string
  /** 结束时是否释放模块实例资源（触发 onEndBusinessInstance + releaseModuleInstance）。 */
  releaseInstance?: boolean
}>

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 工具调用后回调入参
// ═══════════════════════════════════════════════════════════════

/**
 * afterFunctionCall 回调的入参。
 *
 * 继承 AiAgentRuntimeContext（moduleId / moduleInstanceId / instanceId），
 * 追加本次工具调用的具体信息：
 *   toolName — 被调用的工具名称
 *   args     — 调用参数（已通过 JSON Schema 校验）
 *   result   — 调用结果（ok: true 带 data，ok: false 带 code/msg/fix）
 */
export type AiAgentAfterFunctionCallOptions = AiAgentRuntimeContext & Readonly<{
  /** 已执行完毕的工具名称，来自 LLM tool_calls 中的 function.name。 */
  toolName: string
  /** 工具调用参数，已通过 JSON Schema 校验的键值对。 */
  args: JsonParams
  /** 工具执行结果；ok 时带 data，失败时带 code/msg/fix 供业务方判断后续策略。 */
  result: AiAgentFunctionCallResult<unknown>
}>
