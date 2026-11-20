/**
 * @module @spark-appworks/spark-ai:agent/conversation/transport/transport-turn
 * 职责：定义 Agent transport 层的 transport turn 协议，把 session/tool-loop 事件投影为应用可消费事件。
 * 边界：只描述传输事件和回调契约，不实现业务注册、不保存会话，也不渲染 UI。
 * AI用途：对齐 SSE、turn callback 或前端事件消费字段时，用本模块确认传输边界。
 */

import { createAiAgentStreamKey, createAiAgentTurnKey } from '../../business/business-scope'
import type { AiAgentStreamTurnInput } from './transport-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 类型定义
// ═══════════════════════════════════════════════════════════════

/** Turn 标识结构：含 turnId（唯一 ID）、turnKey（业务键）、可选 streamKey（流式键） */
export type AiAgentTransportTurn = Readonly<{
  /** turn 唯一 ID（UUID），由 session 在创建 turn 时生成，跨 session 不重复。 */
  turnId: string
  /** 业务复合键，格式 kind::instanceId::turnId，用于 SSE 事件路由和前端 turn 聚合。 */
  turnKey: string
  /** 流式复合键，格式 turnKey::streamId，多流并发时区分同一 turn 内的不同输出流；单流场景为 undefined。 */
  streamKey?: string
}>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 工厂函数
// ═══════════════════════════════════════════════════════════════

/** 从 scope + turnMeta 构造 TransportTurn，可选传入 streamId 生成 streamKey */
export function createAiAgentTransportTurn(
  input: Pick<AiAgentStreamTurnInput, 'scope' | 'turn'>,
  streamId?: string,
): AiAgentTransportTurn {
  return {
    turnId: input.turn.turnId,
    turnKey: createAiAgentTurnKey(input.scope, input.turn.turnId),
    ...(streamId === undefined ? {} : {
      streamKey: createAiAgentStreamKey(input.scope, input.turn.turnId, streamId),
    }),
  }
}
