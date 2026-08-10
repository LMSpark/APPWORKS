/**
 * @module @spark-appworks/spark-ai:agent/tool-loop/result-mapper
 * 职责：支撑 Agent tool loop 的 result mapper 能力，处理工具调用、结果映射、诊断事件或 payload 编解码。
 * 边界：只服务单次 turn 内的工具循环，不定义业务注册协议，也不直接管理 UI 或持久化页面状态。
 * AI用途：排查工具调用为什么继续、完成、失败或被映射成回调事件时，用本模块定位 loop 内部语义。
 */

import type { JsonValue } from '@spark-appworks/spark-json-document'
import type { AiAgentToolCheck, AiAgentToolResult } from '../tool-runtime'
import type {
  AiAgentFunctionCallCheck,
  AiAgentFunctionCallFailure,
  AiAgentFunctionCallResult,
} from '../session/session-types'

/* -------------------------------------------------------------------------------
 * 一、主转换函数
 * ----------------------------------------------------------------------------- */

/**
 * 将 AiAgentToolResult 投影为 AiAgentFunctionCallResult。
 *
 * 成功路径：从 checks 提取 info/warn 级 check 作为人类可读的 summary。
 * 失败路径：提取第一个 error 级 check 的 code/message/hint 填入 code/msg/fix，
 * 同时保留完整 checks，确保参数校验等工具失败细节会作为 tool result 回传给 LLM。
 */
export function toFunctionCallResult(
  result: AiAgentToolResult<JsonValue>,
): AiAgentFunctionCallResult<unknown> {
  if (result.ok) {
    const summary = firstInfoOrWarnSummary(result.checks)
    return {
      ok: true,
      ...(result.data === undefined ? {} : { data: result.data }),
      ...(summary === undefined ? {} : { summary }),
    }
  }
  // 失败路径：提取 error 级 check
  const failure = pickFirstErrorCheck(result.checks)
  if (failure === undefined) {
    // 防御性回退：协议层返回失败但未携带 error check
    return {
      ok: false,
      code: 'PROTOCOL_FAILURE',
      msg: '协议层返回失败但未携带 error 级 check',
      fix: '请检查 AiAgentToolResult.checks 是否正确填充',
      ...(result.checks === undefined ? {} : { checks: toFunctionCallChecks(result.checks) }),
    }
  }
  return {
    ok: false,
    code: failure.code,
    msg: failure.message,
    fix: failure.hint ?? '请根据 message 调整调用方式或参数',
    ...(result.checks === undefined ? {} : { checks: toFunctionCallChecks(result.checks) }),
  }
}

/* -------------------------------------------------------------------------------
 * 二、失败结果提取
 * ----------------------------------------------------------------------------- */

/**
 * 从已经确认 ok=false 的 AiAgentFunctionCallResult 中提取失败载荷。
 * 若传入成功结果则抛异常（调用方逻辑错误）。
 */
export function failureFromCallResult(result: AiAgentFunctionCallResult<unknown>): AiAgentFunctionCallFailure {
  if (result.ok) throw new Error('[AiAgentToolLoopRunner] failureFromCallResult called with success result')
  return {
    ok: false,
    code: result.code,
    msg: result.msg,
    fix: result.fix,
    ...(result.checks === undefined ? {} : { checks: result.checks }),
  }
}

/* -------------------------------------------------------------------------------
 * 三、内部：checks 查询
 * ----------------------------------------------------------------------------- */

/** 从 checks 中提取第一条 info 或 warn 级别的消息作为成功摘要 */
function firstInfoOrWarnSummary(checks: readonly AiAgentToolCheck[] | undefined): string | undefined {
  return checks?.find((check) => check.level === 'info' || check.level === 'warn')?.message
}

/** 从 checks 中提取第一条 error 级别 */
function pickFirstErrorCheck(checks: readonly AiAgentToolCheck[] | undefined): AiAgentToolCheck | undefined {
  return checks?.find((check) => check.level === 'error')
}

function toFunctionCallChecks(checks: readonly AiAgentToolCheck[]): readonly AiAgentFunctionCallCheck[] {
  return checks.map((check) => ({
    level: check.level,
    code: check.code,
    message: check.message,
    ...(check.hint === undefined ? {} : { hint: check.hint }),
  }))
}
