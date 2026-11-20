/**
 * @module @spark-appworks/spark-ai:agent/native-runtime/native-script-sandbox
 * 职责：提供 ClassModel 原生脚本执行沙箱，把脚本 this/ctx、错误投影和 JSON 返回值规整为统一结果。
 * 边界：这是受控执行上下文而非强安全隔离，不负责业务注册、工具 schema 生成或持久化。
 * AI用途：排查脚本动作执行、上下文注入和错误返回格式时，用本模块确认 sandbox 语义。
 */
/**
 * agent/native-runtime · ClassModel 脚本执行沙箱。
 *
 * LLM 脚本中的 this 就是调用方提供的模块上下文；ctx 是同一对象的别名。
 * 这里的沙箱是统一执行上下文，不是高安全隔离；function calling 与脚本都可以进入它。
 * 当前文件负责脚本入口，只做错误投影和 JSON 返回值规整。
 */

import { toErrorMessage } from '@spark-appworks/spark-utils'
import { coerceJsonValue, type JsonValue } from '@spark-appworks/spark-json-document'
import { AiAgentToolCheck, AiAgentToolResult } from '../tool-runtime'

const SCRIPT_RECOVERY_HINT = '按 tool result RECOVERY_HINT 修正；契约见 model_action_guide / model_class_guide（ClassModel 知识索引）。'

/** Ai Native Script Sandbox Context 的运行上下文。 */
export type AiNativeScriptSandboxContext = Readonly<Record<string, unknown>>

const GENERATED_STACK_LINE_FOR_SCRIPT_LINE_1 = 6

export async function executeModuleScript(
  script: string,
  context: AiNativeScriptSandboxContext,
): Promise<AiAgentToolResult<JsonValue>> {
  try {
    const result = await runScript(script, context)
    const data = coerceJsonValue(result)
    if (data === undefined) {
      return AiAgentToolResult.failCode(
        'SCRIPT_RESULT_NOT_JSON',
        '脚本返回值不能序列化为 JSON。',
        '请返回字符串、数字、布尔、null、数组或普通对象。',
      )
    }
    return AiAgentToolResult.ok(data)
  } catch (error) {
    const location = findScriptErrorLocation(error)
    const originalFailure = readOriginalToolFailure(error)
    if (originalFailure !== undefined) {
      const locationHint = location === undefined
        ? '脚本链式调用返回业务失败；先按原始错误码修正参数或业务状态。'
        : `脚本第 ${String(location.line)} 行的链式调用返回业务失败；先按原始错误码修正参数或业务状态。`
      return AiAgentToolResult.fail([
        ...(originalFailure.checks ?? [
          AiAgentToolCheck.error('SCRIPT_ACTION_FAILED', toErrorMessage(error), locationHint),
        ]),
        AiAgentToolCheck.error(
          'SCRIPT_EXECUTION_FAILED',
          location === undefined
            ? `脚本链式调用失败: ${toErrorMessage(error)}`
            : `脚本第 ${String(location.line)} 行链式调用失败: ${toErrorMessage(error)}`,
          locationHint,
        ),
      ], {
        ...(originalFailure.state ?? {}),
        ...(location === undefined ? {} : { scriptLine: location.line }),
      })
    }
    const locationText = location === undefined ? '' : `，脚本第 ${String(location.line)} 行`
    const errorMessage = toErrorMessage(error)
    return AiAgentToolResult.failCode(
      'SCRIPT_EXECUTION_FAILED',
      `脚本执行失败${locationText}: ${errorMessage}`,
      location === undefined
        ? `检查脚本语法与 ClassModel 契约后重试。${SCRIPT_RECOVERY_HINT}`
        : `检查脚本第 ${String(location.line)} 行附近语法与 ClassModel 契约后重试。${SCRIPT_RECOVERY_HINT}`,
    )
  }
}

function readOriginalToolFailure(error: unknown): AiAgentToolResult<unknown> | undefined {
  if (!isIndexableObject(error)) return undefined
  const result = error['result']
  if (!(result instanceof AiAgentToolResult)) return undefined
  return result.ok ? undefined : result
}

async function runScript(script: string, context: AiNativeScriptSandboxContext): Promise<unknown> {
  const contextWithSelf: Record<string, unknown> = { ...context }
  contextWithSelf['ctx'] = contextWithSelf
  const source = [
    'return (async function () {',
    '  try {',
    '    with (this) {',
    script,
    '    }',
    '  } catch (__error) {',
    '    throw __error',
    '  }',
    '}).call(__ctx)',
  ].join('\n')
  const executeUnknown: unknown = new Function('__ctx', source)
  if (!isNativeScriptExecutor(executeUnknown)) {
    throw new Error('native script compile failed')
  }
  return Promise.resolve(executeUnknown(contextWithSelf))
}

function isNativeScriptExecutor(
  value: unknown,
): value is (ctx: Record<string, unknown>) => unknown {
  return typeof value === 'function'
}

function findScriptErrorLocation(error: unknown): Readonly<{ line: number, column?: number }> | undefined {
  if (!(error instanceof Error) || error.stack === undefined) return undefined
  const match = /<anonymous>:(\d+):(\d+)/.exec(error.stack)
  if (match === null) return undefined
  const generatedLine = Number(match[1])
  const generatedColumn = Number(match[2])
  if (!Number.isInteger(generatedLine)) return undefined
  const line = generatedLine - GENERATED_STACK_LINE_FOR_SCRIPT_LINE_1 + 1
  if (line < 1) return undefined
  return {
    line,
    ...(Number.isInteger(generatedColumn) ? { column: generatedColumn } : {}),
  }
}

function isIndexableObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object'
}

