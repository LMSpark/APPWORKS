/**
 * @module @spark-appworks/spark-ai:agent/tool-loop/diagnostic-events
 * 职责：支撑 Agent tool loop 的 diagnostic events 能力，处理工具调用、结果映射、诊断事件或 payload 编解码。
 * 边界：只服务单次 turn 内的工具循环，不定义业务注册协议，也不直接管理 UI 或持久化页面状态。
 * AI用途：排查工具调用为什么继续、完成、失败或被映射成回调事件时，用本模块定位 loop 内部语义。
 */

import { createAiAgentStreamKey, createAiAgentTurnKey } from '../business/business-scope'
import { CLASS_MODEL_TOOL_NAMES } from '../../class-model'
import type { AiAgentScope } from '../business/scope-types'
import type { AiAgentChatRequest, AiAgentStreamEvent, AiAgentTurnMeta } from '../conversation/chat/chat-types'
import { stringifyAiAgentPayload } from './payload-codec'

/** Ai Agent Diagnostic Event Input 的输入数据。 */
type AiAgentDiagnosticEventInput = Readonly<{
  /** 当前 chat 请求，含 onStreamEvent 回调。 */
  request: AiAgentChatRequest
  /** 业务作用域，用于构造 turnKey 与 streamKey。 */
  scope: AiAgentScope
  /** 当前 turn 元信息（turnId 等）。 */
  turn: AiAgentTurnMeta
  /** 诊断事件类型：LLM 请求前或流式追加。 */
  type: 'llm-request' | 'llm-append'
  /** 待序列化为 JSON 的 LLM 诊断载荷。 */
  data: unknown
}>

/** Tool Result Event Input 的输入数据。 */
type ToolResultEventInput = Readonly<{
  /** 当前 chat 请求，含 onStreamEvent 回调。 */
  request: AiAgentChatRequest
  /** 业务作用域，用于构造 turnKey 与 streamKey。 */
  scope: AiAgentScope
  /** 当前 turn 元信息（turnId 等）。 */
  turn: AiAgentTurnMeta
  /** 事件归属的能力模块 ID，前端据此路由 UI。 */
  eventModuleId: string
  /** 待序列化为 JSON 的工具结果载荷。 */
  data: unknown
}>

type ScopedStreamEventInput = Readonly<{
  scope: AiAgentScope
  turnId: string
  eventModuleId: string
  type: AiAgentStreamEvent['type']
  data: string
}>

/* -------------------------------------------------------------------------------
 * 一、LLM 诊断事件
 * -------------------------------------------------------------------------------
 * 在 LLM 请求发送前（llm-request）或流式响应追加时（llm-append）推送事件。
 * 前端可据此渲染"AI 正在思考"的实时状态。
 * ----------------------------------------------------------------------------- */

export function emitAiAgentDiagnosticEvent(input: AiAgentDiagnosticEventInput): void {
  const { request, scope, turn, type, data } = input
  // 将任意数据序列化为 JSON 字符串后包装为 turn stream 事件。
  request.onStreamEvent?.(createScopedStreamEvent({
    scope,
    turnId: turn.turnId,
    eventModuleId: 'llm',
    type,
    data: stringifyAiAgentPayload(data),
  }))
}

/* -------------------------------------------------------------------------------
 * 二、工具结果事件
 * -------------------------------------------------------------------------------
 * 工具调用完成后推送结果事件。eventModuleId 标识事件所属的能力模块，
 * 前端据此将结果路由到对应模块的 UI 展示区。
 * ----------------------------------------------------------------------------- */

export function emitToolResultEvent(input: ToolResultEventInput): void {
  const { request, scope, turn, eventModuleId, data } = input
  request.onStreamEvent?.(createScopedStreamEvent({
    scope,
    turnId: turn.turnId,
    eventModuleId,
    type: 'tool-result',
    data: stringifyAiAgentPayload(data),
  }))
}

/* -------------------------------------------------------------------------------
 * 三、协议调用 → 事件模块 ID 映射
 * -------------------------------------------------------------------------------
 * 根据 LLM 发起的工具调用名称和参数，推断该调用归属于哪个能力模块（kind）。
 *
 * 规则：
 *   · model_class_guide / model_attribute_guide / model_action_guide / model_query → 优先取 args.kind
 *   · 回退         → 使用 toolName 本身
 *
 * 典型示例：
 *   model_class_guide({ kind: "Table" })                                      → "Table"
 *   model_attribute_guide({ kind: "Table", attributeName: "title" })          → "Table"
 *   model_action_guide({ kind: "Table", actionName: "listRows" })             → "Table"
 * ----------------------------------------------------------------------------- */

export function eventModuleIdFromProtocolCall(
  toolName: string,
  args: Readonly<Record<string, unknown>>,
): string {
  if ((toolName === CLASS_MODEL_TOOL_NAMES.modelGuide
    || toolName === CLASS_MODEL_TOOL_NAMES.attributeGuide
    || toolName === CLASS_MODEL_TOOL_NAMES.actionGuide
    || toolName === CLASS_MODEL_TOOL_NAMES.query)
    && typeof args['kind'] === 'string'
    && args['kind'].trim().length > 0) {
    return args['kind']
  }

  return toolName
}

/* -------------------------------------------------------------------------------
 * 四、内部辅助函数
 * ----------------------------------------------------------------------------- */

/**
 * 构造带作用域信息的 turn stream 事件。
 *
 * 每个事件携带两个关键字段：
 *   · turnKey   — 前端用于定位同一对话 turn
 *   · streamKey — 前端用于路由到 turn 内的细粒度流
 *   · scope     — 事件归属元数据（业务 ID、模块 ID、轮次 ID），便于前端分组展示
 */
function createScopedStreamEvent(input: ScopedStreamEventInput): AiAgentStreamEvent {
  const { scope, turnId, eventModuleId, type, data } = input
  return {
    type,
    data,
    turnKey: createAiAgentTurnKey(scope, turnId),
    streamKey: createAiAgentStreamKey(scope, turnId, eventModuleId),
    scope: {
      businessRegistrationId: scope.businessRegistrationId,
      businessInstanceId: scope.businessInstanceId,
      eventModuleId,
      turnId,
    },
  }
}
