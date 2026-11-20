/**
 * @module @spark-appworks/spark-ai:agent/tool-loop/payload-codec
 * 职责：支撑 Agent tool loop 的 payload codec 能力，处理工具调用、结果映射、诊断事件或 payload 编解码。
 * 边界：只服务单次 turn 内的工具循环，不定义业务注册协议，也不直接管理 UI 或持久化页面状态。
 * AI用途：排查工具调用为什么继续、完成、失败或被映射成回调事件时，用本模块定位 loop 内部语义。
 */

import type { JsonObject, JsonParams, JsonValue } from '@spark-appworks/spark-json-document'
import { coerceStrictJsonValue } from '@spark-appworks/spark-json-document'
import { latestUserInput } from '../business/business-scope'
import type { AiAgentChatRequest } from '../conversation/chat/chat-types'
import type { AiAgentTransportMessage } from '../conversation/transport/transport-types'

/* -------------------------------------------------------------------------------
 * 一、工具参数解析
 * -------------------------------------------------------------------------------
 * LLM 返回的工具调用参数是 JSON 字符串（function.arguments），
 * 本函数将其解析为 Record<string, JsonValue> 以便后续校验和执行。
 *
 * 参数约束：
 *   · 空字符串 / undefined → 返回 {}（非异常，部分工具无参数）
 *   · JSON 解析失败       → 抛 ToolArgsParseError，调用方回灌工具失败
 *   · JSON 根节点非对象   → 抛 ToolArgsParseError，工具参数必须是 object
 * ----------------------------------------------------------------------------- */

/** Tool Args Parse Error 的错误信息。 */
export class ToolArgsParseError extends Error {
    /** 创建 Tool Args Parse Error 实例。 */
public constructor(
    public readonly code: 'TOOL_ARGS_INVALID_JSON' | 'TOOL_ARGS_NOT_OBJECT',
    message: string,
    public readonly raw: string,
  ) {
    super(message)
    this.name = 'ToolArgsParseError'
  }
}

export function parseToolArgs(raw: string | undefined): JsonParams {
  if (raw === undefined || raw.trim() === '') return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new ToolArgsParseError(
      'TOOL_ARGS_INVALID_JSON',
      `工具调用参数不是有效 JSON: ${errorMessage(error)}`,
      raw,
    )
  }

  const coerced = coerceStrictJsonValue(parsed)
  if (!isJsonObject(coerced)) {
    throw new ToolArgsParseError(
      'TOOL_ARGS_NOT_OBJECT',
      '工具调用参数必须是 JSON object 根节点',
      raw,
    )
  }
  return coerced
}

/* -------------------------------------------------------------------------------
 * 二、当前轮次消息提取
 * -------------------------------------------------------------------------------
 * 从请求中提取最新一条用户输入，包装为传输层消息数组。
 * 用于 Tool Loop 每轮开始时构建发送给 LLM 的消息列表。
 *
 * 返回空数组的场景：用户输入为空字符串（如纯系统触发）
 * ----------------------------------------------------------------------------- */

export function toCurrentTurnMessages(request: AiAgentChatRequest): AiAgentTransportMessage[] {
  const latestUser = latestUserInput(request)
  return latestUser === ''
    ? []
    : [{ role: 'user', content: latestUser }]
}

/* -------------------------------------------------------------------------------
 * 三、安全 JSON 序列化
 * -------------------------------------------------------------------------------
 * 将任意 JS 值序列化为 JSON 字符串，处理标准 JSON.stringify 无法处理的边界情况：
 *
 *   · BigInt    → 转为十进制字符串（JSON 不支持 bigint 原生类型）
 *   · 循环引用  → 替换为 "[Circular]"（防止栈溢出）
 *
 * 使用 WeakSet 跟踪已访问对象，确保同一对象多次出现时只标记一次。
 * ----------------------------------------------------------------------------- */

export function stringifyAiAgentPayload(data: unknown): string {
  const seen = new WeakSet<object>()
  const text = JSON.stringify(data, (_key, item: unknown) => {
    // BigInt 无法被 JSON 原生序列化 → 转字符串
    if (typeof item === 'bigint') return item.toString()
    // 循环引用检测 → 标记后跳过
    if (typeof item === 'object' && item !== null) {
      if (seen.has(item)) return '[Circular]'
      seen.add(item)
    }
    return item
  })
  return text
}

/* -------------------------------------------------------------------------------
 * 四、内部辅助：值规整
 * -------------------------------------------------------------------------------
 * 将 JSON.parse 产出的 unknown 值确认为 JsonValue 记录。
 * ----------------------------------------------------------------------------- */

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
