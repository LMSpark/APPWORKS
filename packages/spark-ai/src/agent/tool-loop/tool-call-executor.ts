/**
 * @module @spark-appworks/spark-ai:agent/tool-loop/tool-call-executor
 * 职责：支撑 Agent tool loop 的 tool call executor 能力，处理工具调用、结果映射、诊断事件或 payload 编解码。
 * 边界：只服务单次 turn 内的工具循环，不定义业务注册协议，也不直接管理 UI 或持久化页面状态。
 * AI用途：排查工具调用为什么继续、完成、失败或被映射成回调事件时，用本模块定位 loop 内部语义。
 */

import type { JsonParams } from '@spark-appworks/spark-json-document'
import { CLASS_MODEL_TOOL_NAMES } from '../../class-model'
import { toAiAgentRuntimeScope } from '../business/business-scope'
import type {
  AiAgentBeforeFunctionCallDirective,
  AiAgentBeforeFunctionCallOptions,
  AiAgentLifecycleDirective,
} from '../business/lifecycle-types'
import type { AiAgentRegistration } from '../business/registration-types'
import type { AiAgentScope } from '../business/scope-types'
import type { AiAgentChatRequest, AiAgentTurnMeta } from '../conversation/chat/chat-types'
import type {
  AiAgentFunctionCallResult,
  AiAgentSessionStore,
} from '../conversation/session/session-types'
import type {
  AiAgentTransportMessage,
  AiAgentTransportToolCall,
} from '../conversation/transport/transport-types'
import {
  emitToolResultEvent,
  eventModuleIdFromProtocolCall,
} from './diagnostic-events'
import { parseToolArgs, stringifyAiAgentPayload, ToolArgsParseError } from './payload-codec'
import {
  failureFromCallResult,
  toFunctionCallResult,
} from './result-mapper'
import { enrichFunctionCallResult } from './function-call-recovery-enricher'

/* ── 类型定义 ──────────────────────────────────────────────── */

/** 从 transport toolName 回查当前 runtime 可执行 toolName。 */
type AiAgentToolNameResolver = (toolName: string) => string | null

/** 工具调用执行的输入参数 */
type AiAgentToolCallExecutionInput<TInput extends JsonParams = JsonParams> = Readonly<{
  /** 当前工具的业务注册信息，含 runtime 执行器、生命周期钩子和恢复提示配置 */
  registration: AiAgentRegistration<TInput>
  /** Agent 运行时作用域，提供 moduleId / moduleInstanceId / instanceId 等定位信息 */
  scope: AiAgentScope
  /** 当前 turn 的元数据（turnId 等），用于诊断事件和工具调用记录关联 */
  turn: AiAgentTurnMeta
  /** 当前 tool loop 中的轮次序号，从 0 开始；用于工具调用记录和诊断定位 */
  round: number
  /** transport toolName → runtime toolName 的解析函数 */
  resolveToolName: AiAgentToolNameResolver
  /** LLM 返回的原始 transport tool_call */
  call: AiAgentTransportToolCall
  /** 当前 chat 请求，携带 beforeFunctionCall 钩子、onDelta / onToolCall 等回调 */
  request: AiAgentChatRequest
  /** 会话存储，用于追加工具调用历史记录（appendFunctionCall） */
  sessionStore: AiAgentSessionStore
}>

/** 工具调用执行的输出 */
type AiAgentToolCallExecutionOutput = Readonly<{
  /** 发回 LLM 的工具消息（role: 'tool'） */
  toolMessage: AiAgentTransportMessage
  /** 业务生命周期指令（continue / complete / abort） */
  directive: AiAgentLifecycleDirective
}>

type ParsedToolArgs = Readonly<{
  ok: true
  args: JsonParams
}> | Readonly<{
  ok: false
  args: JsonParams
  result: AiAgentFunctionCallResult<unknown>
}>

type CompleteToolCallExecutionInput<TInput extends JsonParams = JsonParams> = Readonly<{
  source: AiAgentToolCallExecutionInput<TInput>
  runtimeContext: ReturnType<typeof toAiAgentRuntimeScope>
  protocolToolName: string
  args: JsonParams
  callResult: AiAgentFunctionCallResult<unknown>
  started: number
  lifecycleDirective?: AiAgentLifecycleDirective
  skipAfterFunctionCall?: boolean
  metadata?: Record<string, unknown>
}>

/* ── 常量 ──────────────────────────────────────────────────── */

/** 默认 continue 指令（无业务方钩子时使用） */
const CONTINUE_DIRECTIVE: AiAgentLifecycleDirective = { status: 'continue' }
const ALLOW_FUNCTION_CALL_DIRECTIVE: AiAgentBeforeFunctionCallDirective = { status: 'allow' }

type ResolveBeforeFunctionCallDirectiveInput<TInput extends JsonParams = JsonParams> = Readonly<{
  request: AiAgentChatRequest
  registration: AiAgentRegistration<TInput>
  options: AiAgentBeforeFunctionCallOptions
}>

/* ── 工具调用执行器 ────────────────────────────────────────── */

/** Ai Agent Tool Call Executor 的语义模型。 */
export class AiAgentToolCallExecutor {
  /**
   * 执行单次工具调用。
   *
   * 返回 null 表示工具无法识别（resolveToolName 返回 null），
   * 此时错误信息已通过 onDelta 推送给前端，调用方应跳过该调用。
   */
  public async execute<TInput extends JsonParams>(
    input: AiAgentToolCallExecutionInput<TInput>,
  ): Promise<AiAgentToolCallExecutionOutput | null> {
    // 步骤 1-2：提取 toolName 并校验是否在当前 tools 集合中
    const toolName = input.call.function.name
    const protocolToolName = input.resolveToolName(toolName)
    if (protocolToolName === null) {
      input.request.onDelta?.(`未识别的工具调用：${toolName}`)
      return null
    }

    const started = Date.now()
    const runtimeContext = toAiAgentRuntimeScope(input.scope)
    const parsedArgs = readToolArgs(input.call.function.arguments)
    if (!parsedArgs.ok) {
      return this.completeExecution({
        source: input,
        runtimeContext,
        protocolToolName,
        args: parsedArgs.args,
        callResult: applyFailureRecoveryEnrichment({
          registration: input.registration,
          moduleInstanceId: runtimeContext.moduleInstanceId,
          protocolToolName,
          args: parsedArgs.args,
          callResult: parsedArgs.result,
        }),
        started,
      })
    }

    // 步骤 3：解析 JSON 参数字符串
    const args = parsedArgs.args

    // 步骤 4：执行前策略裁决（请求级 UI 桥接先裁决，注册级业务策略仍可兜底）
    const beforeDirective = await resolveBeforeFunctionCallDirective({
      request: input.request,
      registration: input.registration,
      options: {
        ...runtimeContext,
        toolName: protocolToolName,
        args,
      },
    })
    if (beforeDirective.status !== 'allow') {
      return this.completeExecution({
        source: input,
        runtimeContext,
        protocolToolName,
        args,
        callResult: applyFailureRecoveryEnrichment({
          registration: input.registration,
          moduleInstanceId: runtimeContext.moduleInstanceId,
          protocolToolName,
          args,
          callResult: beforeFunctionCallFailureResult(beforeDirective),
        }),
        started,
        skipAfterFunctionCall: true,
        metadata: beforeFunctionCallMetadata(beforeDirective),
        ...(beforeDirective.status === 'abort'
          ? { lifecycleDirective: beforeFunctionCallLifecycleDirective(beforeDirective) }
          : {}),
      })
    }

    // 步骤 5：委托 runtime 执行 query/navigation 或 business function tool
    const operationResult = await input.registration.runtime.executeTool(protocolToolName, args, {
      moduleId: runtimeContext.moduleId,
      moduleInstanceId: runtimeContext.moduleInstanceId,
      instanceId: runtimeContext.instanceId,
    })

    // 步骤 6：转换操作结果为 function call result 格式，并把失败反查到 guide/catalog 步骤
    const rawCallResult = toFunctionCallResult(operationResult)
    const callResult = rawCallResult.ok
      ? rawCallResult
      : applyFailureRecoveryEnrichment({
        registration: input.registration,
        moduleInstanceId: runtimeContext.moduleInstanceId,
        protocolToolName,
        args,
        callResult: rawCallResult,
      })
    const completeDirective = completeDirectiveFromToolResult(protocolToolName, callResult)

    return this.completeExecution({
      source: input,
      runtimeContext,
      protocolToolName,
      args,
      callResult,
      started,
      ...(completeDirective === null ? {} : {
        lifecycleDirective: completeDirective,
        skipAfterFunctionCall: true,
      }),
    })
  }

  private async completeExecution<TInput extends JsonParams>(
    input: CompleteToolCallExecutionInput<TInput>,
  ): Promise<AiAgentToolCallExecutionOutput> {
    const {
      source,
      runtimeContext,
      protocolToolName,
      args,
      callResult,
      started,
      lifecycleDirective,
      skipAfterFunctionCall,
      metadata,
    } = input

    // 步骤 7：写入 sessionStore 历史
    source.sessionStore.appendFunctionCall({
      moduleId: runtimeContext.moduleId,
      moduleInstanceId: runtimeContext.moduleInstanceId,
      instanceId: runtimeContext.instanceId,
      runtimeInstanceId: runtimeContext.instanceId,
      toolName: protocolToolName,
      args,
      status: callResult.ok ? 'completed' : 'failed',
      ...(callResult.ok ? { result: callResult.data } : { error: failureFromCallResult(callResult) }),
      ...(metadata === undefined ? {} : { metadata }),
    })

    // 步骤 8：调用业务方 afterFunctionCall 钩子（未提供则默认 continue）
    const directive = lifecycleDirective
      ?? (skipAfterFunctionCall === true
        ? CONTINUE_DIRECTIVE
        : await source.registration.afterFunctionCall?.({
          ...runtimeContext,
          toolName: protocolToolName,
          args,
          result: callResult,
        }) ?? CONTINUE_DIRECTIVE)

    const durationMs = Date.now() - started

    // 步骤 9a：通知业务方工具调用记录（用于前端展示/调试）
    source.request.onToolCall?.({
      toolName: protocolToolName,
      args,
      turnId: source.turn.turnId,
      round: source.round,
      callId: source.call.id,
      status: callResult.ok ? 'success' : 'error',
      result: callResult,
      durationMs,
    })

    // 步骤 9b：发送诊断 stream 事件
    emitToolResultEvent({
      request: source.request,
      scope: source.scope,
      turn: source.turn,
      eventModuleId: eventModuleIdFromProtocolCall(protocolToolName, args),
      data: callResult,
    })

    // 步骤 10：返回 toolMessage + 生命周期指令
    return {
      toolMessage: {
        role: 'tool',
        content: stringifyAiAgentPayload(callResult),
        tool_call_id: source.call.id,
      },
      directive,
    }
  }
}

async function resolveBeforeFunctionCallDirective<TInput extends JsonParams>(
  input: ResolveBeforeFunctionCallDirectiveInput<TInput>,
): Promise<AiAgentBeforeFunctionCallDirective> {
  const requestDirective = await input.request.beforeFunctionCall?.(input.options)
  if (requestDirective !== undefined && requestDirective.status !== 'allow') {
    return requestDirective
  }

  const registrationDirective = await input.registration.beforeFunctionCall?.(input.options)
  return registrationDirective ?? requestDirective ?? ALLOW_FUNCTION_CALL_DIRECTIVE
}

function beforeFunctionCallFailureResult(
  directive: AiAgentBeforeFunctionCallDirective,
): AiAgentFunctionCallResult<unknown> {
  const reason = directive.reason ?? defaultBeforeFunctionCallReason(directive)
  const fix = directive.fix ?? '请根据执行前审批或策略反馈调整请求后重试。'
  const code = directive.status === 'abort'
    ? 'AI_TOOL_ABORTED_BEFORE_EXECUTION'
    : 'AI_TOOL_REJECTED_BEFORE_EXECUTION'
  return {
    ok: false,
    code,
    msg: reason,
    fix,
    checks: [{
      level: 'error',
      code,
      message: reason,
      hint: fix,
    }],
  }
}

function beforeFunctionCallLifecycleDirective(
  directive: AiAgentBeforeFunctionCallDirective,
): AiAgentLifecycleDirective {
  return {
    status: 'abort',
    reason: directive.reason ?? defaultBeforeFunctionCallReason(directive),
    ...(directive.finalAssistantMessage === undefined ? {} : { finalAssistantMessage: directive.finalAssistantMessage }),
    ...(directive.releaseInstance === undefined ? {} : { releaseInstance: directive.releaseInstance }),
  }
}

function beforeFunctionCallMetadata(
  directive: AiAgentBeforeFunctionCallDirective,
): Record<string, unknown> {
  return {
    blockedBy: 'beforeFunctionCall',
    decision: directive.status,
  }
}

function defaultBeforeFunctionCallReason(directive: AiAgentBeforeFunctionCallDirective): string {
  return directive.status === 'abort'
    ? '工具调用在执行前被中止。'
    : '工具调用在执行前被拒绝。'
}

function readToolArgs(raw: string | undefined): ParsedToolArgs {
  try {
    return {
      ok: true,
      args: parseToolArgs(raw),
    }
  } catch (error) {
    if (!(error instanceof ToolArgsParseError)) throw error
    return {
      ok: false,
      args: {},
      result: toolArgsFailureResult(error),
    }
  }
}

function toolArgsFailureResult(error: ToolArgsParseError): AiAgentFunctionCallResult<unknown> {
  const fix = '请重新发起该工具调用，function.arguments 必须是 JSON object 字符串。'
  return {
    ok: false,
    code: error.code,
    msg: error.message,
    fix,
    checks: [
      {
        level: 'error',
        code: error.code,
        message: error.message,
        hint: fix,
      },
    ],
  }
}

type ApplyFailureRecoveryEnrichmentCommand<TInput extends JsonParams> = Readonly<{
  registration: AiAgentRegistration<TInput>
  moduleInstanceId: string
  protocolToolName: string
  args: JsonParams
  callResult: AiAgentFunctionCallResult<unknown>
}>

function applyFailureRecoveryEnrichment<TInput extends JsonParams>(
  command: ApplyFailureRecoveryEnrichmentCommand<TInput>,
): AiAgentFunctionCallResult<unknown> {
  if (command.callResult.ok) return command.callResult
  const moduleInstanceId = command.moduleInstanceId.trim()
  return enrichFunctionCallResult({
    protocolToolName: command.protocolToolName,
    args: command.args,
    callResult: command.callResult,
    ...(moduleInstanceId.length === 0 ? {} : { moduleInstanceId }),
  }, {
    ...(command.registration.enrichRecoveryHints === undefined
      ? {}
      : { enrichRecoveryHints: command.registration.enrichRecoveryHints }),
  })
}

function completeDirectiveFromToolResult(
  toolName: string,
  result: AiAgentFunctionCallResult<unknown>,
): AiAgentLifecycleDirective | null {
  if (toolName !== CLASS_MODEL_TOOL_NAMES.agentComplete || !result.ok) return null
  const data = result.data
  const summary = isRecord(data) && typeof data['summary'] === 'string'
    ? data['summary'].trim()
    : ''
  return {
    status: 'complete',
    reason: 'agent_complete',
    ...(summary.length === 0 ? {} : { finalAssistantMessage: summary }),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
