/**
 * @module @spark-appworks/spark-ai:agent/tool-loop/tool-loop-runner
 * 职责：支撑 Agent tool loop 的 tool loop runner 能力，处理工具调用、结果映射、诊断事件或 payload 编解码。
 * 边界：只服务单次 turn 内的工具循环，不定义业务注册协议，也不直接管理 UI 或持久化页面状态。
 * AI用途：排查工具调用为什么继续、完成、失败或被映射成回调事件时，用本模块定位 loop 内部语义。
 */

import type { JsonParams } from '@spark-appworks/spark-json-document'
import { CLASS_MODEL_TOOL_NAMES } from '../../class-model'
import { createAiAgentSessionId, toAiAgentRuntimeScope } from '../business/business-scope'
import type { AiAgentLifecycleDirective } from '../business/lifecycle-types'
import type { AiAgentRegistration } from '../business/registration-types'
import type { AiAgentScope, AiAgentRuntimeContext } from '../business/scope-types'
import type { AiAgentToolLoopNudgeReason } from '../business/registration-types'
import type { AiAgentChatRequest, AiAgentTurnMeta } from '../chat/chat-types'
import type { AiAgentHistoryEntry, AiAgentSessionStore } from '../session/session-types'
import type { AiAgentToolSpec } from '../tool-runtime'
import type {
  AiAgentTurnCallbacks,
  AiAgentTransportMessage,
  AiAgentTransportToolCall,
  AiAgentTransportToolSpec,
} from '../transport/transport-types'
import { emitAiAgentDiagnosticEvent } from './diagnostic-events'
import { toCurrentTurnMessages } from './payload-codec'
import { AiAgentToolCallExecutor } from './tool-call-executor'
import {
  containsPseudoToolCallText,
  recoverAssistantTextToolCalls,
} from './turn-event-collector'

function toAiAgentTransportTools(
  tools: readonly AiAgentToolSpec[],
): readonly AiAgentTransportToolSpec[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
      ...(tool.function.strict === undefined ? {} : { strict: tool.function.strict }),
    },
  }))
}

const TOOL_PRODUCTION_LINE_PROMPT = [
  '工具生产线模式：只要下一步需要查询、校验、写入、修复或完成任务，就必须发起真实 OpenAI tool_call。',
  '工具回合的 assistant.content 必须为空；不要输出计划、解释、JSON、代码块或“我将调用工具”。',
  '每轮最多调用一个 tool_call，等待 tool 结果后再决定下一步。',
  '任务完成时调用 agent_complete({ summary })；agent_complete 会执行领域模型完成方法，若 tool result 失败，按其中 fix/checks 补查或补执行后再次调用 agent_complete。',
  '不要用自然语言正文收尾。',
].join('\n')

const PSEUDO_TOOL_CALL_NUDGE = [
  '上一次回复把工具调用写进了 assistant 正文（如 <tool_call> 标签），runtime 无法执行。',
  '请改用 OpenAI tool_calls 通道重新发起；model_script 的参数名必须是 script，不是 code。',
  '若上一步失败，先读 tool result 里的 RECOVERY_HINT / fix，再 model_query/model_action_guide 后重试。',
].join('\n')

const MAX_PSEUDO_TOOL_CALL_NUDGES = 2

const GENERIC_PLAN_WITHOUT_TOOL_NUDGE = [
  '上一次 assistant 正文只是计划/说明，没有真实 OpenAI tool_calls，runtime 未执行任何工具。',
  '下一回合必须直接发起 tool_call，禁止再输出计划文字。',
].join('\n')

const MAX_PLAN_WITHOUT_TOOL_NUDGES = 3

const CATALOG_DISCOVERY_TOOL_NAMES = new Set<string>([
  CLASS_MODEL_TOOL_NAMES.query,
  CLASS_MODEL_TOOL_NAMES.modelGuide,
  CLASS_MODEL_TOOL_NAMES.attributeGuide,
  CLASS_MODEL_TOOL_NAMES.actionGuide,
])

const DEFAULT_EXECUTION_TOOL_NAMES = new Set<string>([
  CLASS_MODEL_TOOL_NAMES.script,
])

const MAX_EXECUTION_PHASE_NUDGES = 3
const MAX_CLASS_MODEL_SCRIPT_RETRY_NUDGES = 3

/* ── 输入/输出类型 ──────────────────────────────────────────── */

/** 工具循环的输入参数 */
type AiAgentToolLoopInput<TInput extends JsonParams = JsonParams> = Readonly<{
  /** 业务注册信息：包含系统提示词、工具列表、生命周期回调等 Agent 运行时所需的全部业务契约。 */
  registration: AiAgentRegistration<TInput>
  /** 业务作用域：标识当前 businessRegistrationId + businessInstanceId，用于会话寻址和诊断。 */
  scope: AiAgentScope
  /** 本次聊天请求：包含用户消息、AbortSignal、流式回调（onDelta / onReasoning / onUsage）等。 */
  request: AiAgentChatRequest
  /** 当前轮次元数据：turnId / seq，用于后端消息关联和诊断事件标注。 */
  turn: AiAgentTurnMeta
  /** 清除 session 选中缓存（业务切换时由 session 层传入） */
  clearSelected: () => void
}>

/* ── 工具循环执行器 ────────────────────────────────────────── */

/** Ai Agent Tool Loop Runner 的语义模型。 */
export class AiAgentToolLoopRunner {
  private readonly toolCallExecutor = new AiAgentToolCallExecutor()

    /** 创建 Ai Agent Tool Loop Runner 实例。 */
public constructor(
    private readonly callbacks: AiAgentTurnCallbacks,
    private readonly maxToolRounds: number | undefined,
  ) {}

  /**
   * 执行工具循环主流程。
   *
   * 每轮（round）：
   *   1. 读取 ClassModel 固定协议工具规约
   *   2. 发送 LLM 诊断事件（llm-request）
   *   3. 调用 turnCallbacks.executeTurn 获取 AI 响应
   *   4. 将 AI 文本回复写入 sessionStore
   *   5. 若无工具调用 → 自然结束
   *   6. 依次执行每个工具调用，收集 toolMessage 和 lifecycleDirective
   *   7. 若 lifecycleDirective ≠ 'continue' → 进入生命周期终止流程
   *   8. 否则把本轮消息 append 到 V4 后端会话，下一轮用空 messages 续写 session 历史
   */
  // AI_AGENT_TRACE[host-tool-loop]: LLM round、tool call 和工具结果回填在这里完成通用 Agent 闭环。
  // AI_AGENT_REFACTOR_SOURCE[tool-result-feedback]: ok:false 参数校验回灌属于内核闭环；业务工具只返回结构化结果。
  public async runToolLoop<TInput extends JsonParams>(input: AiAgentToolLoopInput<TInput>): Promise<void> {
    const { registration, scope, request, turn, clearSelected } = input
    const runtimeContext = toAiAgentRuntimeScope(scope)
    const sessionId = createAiAgentSessionId(scope.businessRegistrationId, scope.businessInstanceId)
    const maxRounds = this.maxToolRounds
    const sessionStore = requireSessionStore(registration)

    // 拼接系统提示词：业务自定义 + 请求编排 + ClassModel 知识快照
    const systemPrompt = [
      registration.systemPrompt?.(runtimeContext),
      request.systemPrompt,
      TOOL_PRODUCTION_LINE_PROMPT,
      registration.runtime.projectKnowledge().promptSnapshot,
    ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join('\n\n')

    const initialTools = registration.runtime.getTools()
    const initialTransportTools = toAiAgentTransportTools(initialTools)
    const initialToolNames = new Set(initialTools.map((tool) => tool.function.name))
    await this.callbacks.prepareSession?.({
      sessionId,
      scope,
      systemPrompt,
      tools: initialTransportTools,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    })

    // 首轮消息：仅包含最新用户输入
    let pendingMessages = toCurrentTurnMessages(request)
    let pseudoToolCallNudgeCount = 0
    let planWithoutToolNudgeCount = 0
    let executionPhaseNudgeCount = 0
    let classModelScriptRetryNudgeCount = 0

    for (let round = 0; maxRounds === undefined || round < maxRounds; round += 1) {
      // AbortSignal 检查：外部取消信号触发时立即退出
      if (request.signal?.aborted) return

      const currentRound = round + 1
      const llmTurn = toLlmRoundTurn(turn, currentRound)
      const tools = round === 0 ? initialTransportTools : toAiAgentTransportTools(registration.runtime.getTools())
      const toolNames = round === 0 ? initialToolNames : new Set(tools.map((tool) => tool.function.name))

      // 发送 LLM 请求诊断事件（前端可据此展示"AI 正在思考"）
      emitAiAgentDiagnosticEvent({
        request,
        scope,
        turn: llmTurn,
        type: 'llm-request',
        data: {
          kind: 'streamTurn',
          round: currentRound,
          sessionId,
          turnId: llmTurn.turnId,
          systemPrompt,
          tools,
          messages: pendingMessages,
        },
      })

      // 调用 AI 后端流式接口
      const result = await this.callbacks.executeTurn({
        sessionId,
        scope,
        turn: llmTurn,
        systemPrompt,
        tools,
        messages: pendingMessages,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        ...(request.onDelta === undefined ? {} : { onDelta: request.onDelta }),
        ...(request.onReasoning === undefined ? {} : { onReasoning: request.onReasoning }),
        ...(request.onUsage === undefined ? {} : { onUsage: request.onUsage }),
        ...(request.onStreamEvent === undefined ? {} : { onStreamEvent: request.onStreamEvent }),
      })

      let controlledToolCalls = selectControlledRoundToolCalls({
        toolCalls: result.toolCalls,
        assistantMessagePersisted: result.assistantMessagePersisted === true,
      })

      if (controlledToolCalls.length === 0 && result.text.trim().length > 0) {
        const recovered = recoverAssistantTextToolCalls(result.text)
        if (recovered.length > 0) {
          controlledToolCalls = selectControlledRoundToolCalls({
            toolCalls: recovered,
            assistantMessagePersisted: false,
          })
        }
      }

      // 工具生产线回合不持久化解释性正文，避免把无效 token 带入下一轮。
      if (controlledToolCalls.length === 0 && result.text.trim().length > 0) {
        if (containsPseudoToolCallText(result.text) && pseudoToolCallNudgeCount < MAX_PSEUDO_TOOL_CALL_NUDGES) {
          pseudoToolCallNudgeCount += 1
          pendingMessages = [{ role: 'user', content: PSEUDO_TOOL_CALL_NUDGE }]
          continue
        }
        const planWithoutToolNudge = resolvePlanWithoutToolNudge(registration, runtimeContext)
        if (planWithoutToolNudge !== undefined
          && mentionsPendingToolExecution(result.text, registration.planWithoutToolMarkers)
          && planWithoutToolNudgeCount < MAX_PLAN_WITHOUT_TOOL_NUDGES) {
          planWithoutToolNudgeCount += 1
          pendingMessages = [{ role: 'user', content: planWithoutToolNudge }]
          continue
        }
        sessionStore.appendMessage({
          ...runtimeContext,
          role: 'assistant',
          content: result.text,
          source: 'llm',
        })
      }

      // 无工具调用 → 对话自然结束
      if (controlledToolCalls.length === 0) return

      // 逐个执行工具调用
      const toolMessages: AiAgentTransportMessage[] = []
      const executedToolCalls: AiAgentTransportToolCall[] = []
      let lifecycleDirective: AiAgentLifecycleDirective | null = null

      for (const call of controlledToolCalls) {
        const output = await this.toolCallExecutor.execute({
          registration,
          scope,
          turn,
          round: currentRound,
          resolveToolName: (toolName) => toolNames.has(toolName) ? toolName : null,
          call,
          request,
          sessionStore,
        })
        // 未识别的工具调用 → 跳过（错误信息已通过 onDelta 通知前端）
        if (output === null) continue
        executedToolCalls.push(call)
        toolMessages.push(output.toolMessage)
        // 业务生命周期指示非 continue → 终止当前 turn
        if (output.directive.status !== 'continue') {
          lifecycleDirective = output.directive
          break
        }
      }

      // 构造本轮的 assistant 消息（含 tool_calls 数组）
      const assistantMessage: AiAgentTransportMessage = {
        role: 'assistant',
        content: '',
        tool_calls: executedToolCalls,
      }
      const messagesToAppend: AiAgentTransportMessage[] = result.assistantMessagePersisted === true
        ? [...toolMessages]
        : [assistantMessage, ...toolMessages]

      await this.appendMessagesToTransport({
        scope,
        request,
        turn: llmTurn,
        sessionId,
        messages: messagesToAppend,
      })

      // 生命周期终止：发送最终消息、停止会话、释放资源
      if (lifecycleDirective !== null) {
        await this.completeLifecycleDirective({
          registration,
          lifecycleDirective,
          runtimeContext,
          scope,
          request,
          turn,
          sessionId,
          messagesToAppend: [],
          sessionStore,
          clearSelected,
        })
        return
      }

      // V4 后端已通过 appendMessages 持久化本轮 assistant(tool_calls)+tool 结果；
      // 下一轮只需让后端基于 session.conversation 继续，避免重复发送同一批消息。
      const executionPhaseNudge = resolveToolLoopNudge(registration, runtimeContext, 'execution_phase')
      if (
        executionPhaseNudge !== undefined
        && executionPhaseNudgeCount < MAX_EXECUTION_PHASE_NUDGES
        && shouldNudgeExecutionPhase({
          sessionStore,
          context: runtimeContext,
          executedToolCalls,
          ...(registration.executionToolNames === undefined
            ? {}
            : { executionToolNames: registration.executionToolNames }),
        })
      ) {
        executionPhaseNudgeCount += 1
        pendingMessages = [{ role: 'user', content: executionPhaseNudge }]
        continue
      }

      const classModelScriptRetryNudge = resolveToolLoopNudge(registration, runtimeContext, 'model_script_retry')
      if (
        classModelScriptRetryNudge !== undefined
        && classModelScriptRetryNudgeCount < MAX_CLASS_MODEL_SCRIPT_RETRY_NUDGES
        && shouldNudgeModuleScriptRetry(sessionStore, runtimeContext)
      ) {
        classModelScriptRetryNudgeCount += 1
        pendingMessages = [{ role: 'user', content: classModelScriptRetryNudge }]
        continue
      }

      pendingMessages = []
    }

    // 达到 maxToolRounds 上限：通知前端并退出
    request.onDelta?.('工具调用轮次已达上限，请检查当前业务状态后继续。')
  }

  /* ── 生命周期终止流程 ───────────────────────────────────── */

  /**
   * 完成生命周期指令。
   *
   * 执行顺序：
   *   1. 若有 finalAssistantMessage → 写入 sessionStore + 追加到消息列表
   *   2. 发送 llm-append 诊断事件
   *   3. 调用 turnCallbacks.appendMessages 同步消息到服务端
   *   4. sessionStore.stopSession 标记会话结束
   *   5. 调用业务方 onEndBusinessInstance 回调
   *   6. 若 releaseInstance=true → 调用 releaseModuleInstance 释放外部资源
   *   7. clearSelected 清除 session 缓存
   */
  private async completeLifecycleDirective<TInput extends JsonParams>(
    input: CompleteLifecycleDirectiveInput<TInput>,
  ): Promise<void> {
    const {
      registration,
      lifecycleDirective,
      runtimeContext,
      scope,
      request,
      turn,
      sessionId,
      messagesToAppend,
      sessionStore,
      clearSelected,
    } = input

    // 追加最终助手消息（业务方可自定义告别语）
    if (lifecycleDirective.finalAssistantMessage !== undefined && lifecycleDirective.finalAssistantMessage.trim().length > 0) {
      request.onDelta?.(lifecycleDirective.finalAssistantMessage)
      sessionStore.appendMessage({
        ...runtimeContext,
        role: 'assistant',
        content: lifecycleDirective.finalAssistantMessage,
        source: 'system',
        metadata: {
          lifecycleStatus: lifecycleDirective.status,
          ...(lifecycleDirective.reason === undefined ? {} : { reason: lifecycleDirective.reason }),
        },
      })
      messagesToAppend.push({
        role: 'assistant',
        content: lifecycleDirective.finalAssistantMessage,
      })
    }

    // 发送诊断事件 + 同步消息到服务端；若没有最终消息则只做本地生命周期收尾。
    await this.appendMessagesToTransport({
      scope,
      request,
      turn,
      sessionId,
      messages: messagesToAppend,
    })

    // 停止会话 + 业务生命周期回调
    sessionStore.stopSession(runtimeContext, lifecycleDirective.reason ?? lifecycleDirective.status)
    await registration.onEndBusinessInstance?.(runtimeContext, lifecycleDirective)

    // 释放模块实例（如关闭 WebSocket、清理临时文件）
    if (lifecycleDirective.releaseInstance === true) {
      registration.releaseModuleInstance?.(runtimeContext.moduleInstanceId)
    }

    // 清除 session 层缓存
    clearSelected()
  }

  private async appendMessagesToTransport(input: AppendMessagesToTransportInput): Promise<void> {
    if (input.messages.length === 0) return
    emitAiAgentDiagnosticEvent({
      request: input.request,
      scope: input.scope,
      turn: input.turn,
      type: 'llm-append',
      data: {
        kind: 'appendMessages',
        sessionId: input.sessionId,
        turnId: input.turn.turnId,
        messages: input.messages,
      },
    })
    await this.callbacks.appendMessages({
      sessionId: input.sessionId,
      scope: input.scope,
      turn: input.turn,
      messages: input.messages,
    })
  }
}

function selectControlledRoundToolCalls(input: Readonly<{
  toolCalls: readonly AiAgentTransportToolCall[]
  assistantMessagePersisted: boolean
}>): readonly AiAgentTransportToolCall[] {
  if (input.toolCalls.length <= 1) return input.toolCalls
  if (input.assistantMessagePersisted) {
    // 外部传输层已经持久化 assistant.tool_calls 时，必须回填全部 tool 结果以保持后端会话合法。
    return input.toolCalls
  }
  const [first] = input.toolCalls
  return first === undefined ? [] : [first]
}

/* ── 内部辅助类型 ──────────────────────────────────────────── */

/** completeLifecycleDirective 方法的输入参数 */
type CompleteLifecycleDirectiveInput<TInput extends JsonParams = JsonParams> = Readonly<{
  registration: AiAgentRegistration<TInput>
  lifecycleDirective: AiAgentLifecycleDirective
  runtimeContext: ReturnType<typeof toAiAgentRuntimeScope>
  scope: AiAgentScope
  request: AiAgentChatRequest
  turn: AiAgentTurnMeta
  sessionId: string
  messagesToAppend: AiAgentTransportMessage[]
  sessionStore: AiAgentSessionStore
  clearSelected: () => void
}>

type AppendMessagesToTransportInput = Readonly<{
  scope: AiAgentScope
  request: AiAgentChatRequest
  turn: AiAgentTurnMeta
  sessionId: string
  messages: readonly AiAgentTransportMessage[]
}>

/** 获取 sessionStore，若未配置则抛异常 */
function requireSessionStore<TInput extends JsonParams>(
  registration: AiAgentRegistration<TInput>,
): AiAgentSessionStore {
  return registration.sessionStore
}

function toLlmRoundTurn(turn: AiAgentTurnMeta, round: number): AiAgentTurnMeta {
  if (round <= 1) return turn
  return {
    ...turn,
    turnId: `${turn.turnId}-llm-round-${round}`,
    seq: turn.seq + round - 1,
  }
}

export function resolvePlanWithoutToolNudge<TInput extends JsonParams>(
  registration: AiAgentRegistration<TInput>,
  runtimeContext: AiAgentRuntimeContext,
): string | undefined {
  const businessNudge = registration.toolLoopNudge?.({
    reason: 'plan_without_tool',
    moduleInstanceId: runtimeContext.moduleInstanceId,
    runtimeContext,
  })
  if (businessNudge === undefined || businessNudge.trim().length === 0) {
    return undefined
  }
  return [GENERIC_PLAN_WITHOUT_TOOL_NUDGE, businessNudge.trim()].join('\n')
}

export function resolveToolLoopNudge<TInput extends JsonParams>(
  registration: AiAgentRegistration<TInput>,
  runtimeContext: AiAgentRuntimeContext,
  reason: Extract<AiAgentToolLoopNudgeReason, 'execution_phase' | 'model_script_retry'>,
): string | undefined {
  const nudge = registration.toolLoopNudge?.({
    reason,
    moduleInstanceId: runtimeContext.moduleInstanceId,
    runtimeContext,
  })
  if (nudge === undefined || nudge.trim().length === 0) {
    return undefined
  }
  return nudge.trim()
}

function mentionsPendingToolExecution(
  text: string,
  extraMarkers: readonly string[] | undefined,
): boolean {
  const normalized = text.trim().toLowerCase()
  if (normalized.length === 0) return false
  const markers = [
    CLASS_MODEL_TOOL_NAMES.script,
    '接下来我将',
    '我将使用',
    '我将调用',
    '下一步将',
    'next i will',
    'i will use model_script',
    'i will call',
    ...(extraMarkers ?? []),
  ]
  return markers.some(marker => normalized.includes(marker.toLowerCase()))
}

function resolveExecutionToolNames(
  executionToolNames: ReadonlySet<string> | undefined,
): ReadonlySet<string> {
  return executionToolNames ?? DEFAULT_EXECUTION_TOOL_NAMES
}

type ShouldNudgeExecutionPhaseCommand = Readonly<{
  sessionStore: AiAgentSessionStore
  context: AiAgentRuntimeContext
  executedToolCalls: readonly AiAgentTransportToolCall[]
  executionToolNames?: ReadonlySet<string>
}>

function shouldNudgeExecutionPhase(command: ShouldNudgeExecutionPhaseCommand): boolean {
  const { sessionStore, context, executedToolCalls, executionToolNames } = command
  if (executedToolCalls.length === 0) return false

  const executionNames = resolveExecutionToolNames(executionToolNames)
  const history = sessionStore.getSessionHistory(context)
  let functionGuideSucceeded = false
  let executionStarted = false

  for (const entry of history) {
    if (!isCompletedFunctionCall(entry)) continue
    if (entry.toolName === CLASS_MODEL_TOOL_NAMES.actionGuide) functionGuideSucceeded = true
    if (executionNames.has(entry.toolName)) executionStarted = true
  }

  if (!functionGuideSucceeded || executionStarted) return false

  const roundToolNames = executedToolCalls.map(call => call.function.name)
  const roundIsCatalogOnly = roundToolNames.every(name => CATALOG_DISCOVERY_TOOL_NAMES.has(name))
  if (!roundIsCatalogOnly) return false

  return roundToolNames.includes(CLASS_MODEL_TOOL_NAMES.actionGuide) || functionGuideSucceeded
}

function shouldNudgeModuleScriptRetry(
  sessionStore: AiAgentSessionStore,
  context: AiAgentRuntimeContext,
): boolean {
  const history = sessionStore.getSessionHistory(context)
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index]
    if (entry?.kind !== 'functionCall') continue
    return entry.toolName === CLASS_MODEL_TOOL_NAMES.script && entry.status === 'failed'
  }
  return false
}

function isCompletedFunctionCall(entry: AiAgentHistoryEntry): entry is AiAgentHistoryEntry & {
  kind: 'functionCall'
  status: 'completed'
  toolName: string
} {
  return entry.kind === 'functionCall'
    && entry.status === 'completed'
    && typeof entry.toolName === 'string'
}
