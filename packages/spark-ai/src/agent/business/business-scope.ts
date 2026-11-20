/**
 * @module @spark-appworks/spark-ai:agent/business/business-scope
 * 职责：从业务注册 ID、实例 ID、turnId 和 streamId 构造 AiAgentScope、sessionId、turnKey 与 runtime scope。
 * 边界：只做业务坐标校验和投影，不访问注册表、不持久化会话，也不读取页面或项目状态。
 * AI用途：需要追踪一次业务对话的 session、turn、stream 如何命名和隔离时，从这里确认作用域 SSOT。
 */

import {
  AiAgentRuntimeContext,
  AiAgentScope,
  AiAgentTarget,
} from './scope-types'
import type { AiAgentChatRequest } from '../conversation/chat/chat-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 输入校验
// ═══════════════════════════════════════════════════════════════

/** 校验必填文本字段：必须是非空字符串，去除首尾空白后不能为空 */
function normalizeRequiredText(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`[AiAgentTarget] ${fieldName} must be a non-empty string.`)
  }
  const trimmed = value.trim()
  if (trimmed === '') {
    throw new Error(`[AiAgentTarget] ${fieldName} must not be empty.`)
  }
  return trimmed
}

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 作用域工厂
// ═══════════════════════════════════════════════════════════════

/** 规范化业务定位：校验 kind 和顶层 instanceId 均非空 */
export function normalizeAiAgentTarget(target: AiAgentTarget): AiAgentTarget {
  return new AiAgentTarget(
    normalizeRequiredText(target.businessRegistrationId, 'businessRegistrationId'),
    normalizeRequiredText(target.businessInstanceId, 'businessInstanceId'),
  )
}

/** 生成会话 ID：格式为 "kind:instanceId" */
export function createAiAgentSessionId(businessRegistrationId: string, businessInstanceId: string): string {
  return createAiAgentSessionIdFromTarget(new AiAgentTarget(businessRegistrationId, businessInstanceId))
}

/** 从业务坐标生成会话 ID；内部 SSOT 入口，避免多处拼接字符串。 */
export function createAiAgentSessionIdFromTarget(target: AiAgentTarget): string {
  const normalized = normalizeAiAgentTarget(target)
  return `${normalized.businessRegistrationId}:${normalized.businessInstanceId}`
}

/** 构造业务作用域（含输入校验） */
export function createAiAgentScope(businessRegistrationId: string, businessInstanceId: string): AiAgentScope {
  return createAiAgentScopeFromTarget(new AiAgentTarget(businessRegistrationId, businessInstanceId))
}

/** 从业务坐标构造 Scope；Scope 只承载投影字段，不再作为坐标 SSOT。 */
export function createAiAgentScopeFromTarget(target: AiAgentTarget): AiAgentScope {
  const normalized = normalizeAiAgentTarget(target)
  return new AiAgentScope(
    normalized.businessRegistrationId,
    normalized.businessInstanceId,
    normalized.businessInstanceId,
    normalized.businessInstanceId,
  )
}

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 键名生成
// ═══════════════════════════════════════════════════════════════

/**
 * 生成对话 turn 隔离键。
 * 格式：encodeURIComponent(kind)::encodeURIComponent(instanceId)::encodeURIComponent(turnId)
 * 使用 :: 双冒号分隔以避免与 URI 编码后的字符冲突。
 */
export function createAiAgentTurnKey(scope: AiAgentScope, turnId: string): string {
  return [
    scope.businessRegistrationId,
    scope.businessInstanceId,
    turnId,
  ].map(encodeURIComponent).join('::')
}

/** 生成 turn 内 stream 键：turnKey::encodeURIComponent(streamId) */
export function createAiAgentStreamKey(scope: AiAgentScope, turnId: string, streamId: string): string {
  return [
    createAiAgentTurnKey(scope, turnId),
    encodeURIComponent(normalizeRequiredText(streamId, 'streamId')),
  ].join('::')
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 类型投影
// ═══════════════════════════════════════════════════════════════

/** Scope → RuntimeContext 投影：摘取 moduleId / 顶层 moduleInstanceId / 顶层 instanceId */
export function toAiAgentRuntimeScope(scope: AiAgentScope): AiAgentRuntimeContext {
  return new AiAgentRuntimeContext(
    scope.businessRegistrationId,
    scope.businessInstanceId,
    scope.instanceId,
  )
}

// ═══════════════════════════════════════════════════════════════
// 第 5 节 · 用户输入提取
// ═══════════════════════════════════════════════════════════════

/**
 * 从请求历史中提取最新一条用户消息。
 * 从 historyMsgs 末尾向前遍历，找到第一个 role === 'user' 的消息。
 * 若无用户消息则返回空字符串。
 *
 * SSOT：本函数是 latestUserInput 的唯一定义点，
 * business-session 和 tool-loop-runner 都从此处导入。
 */
export function latestUserInput(request: AiAgentChatRequest): string {
  for (let index = request.historyMsgs.length - 1; index >= 0; index -= 1) {
    const item = request.historyMsgs[index]
    if (item?.role === 'user') return item.content.trim()
  }
  return ''
}
