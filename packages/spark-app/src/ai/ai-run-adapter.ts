/**
 * @module @spark-appworks/spark-app:ai/ai-run-adapter
 * 职责：提供唯一的 headless AI run adapter，同时产出 trace snapshot 与 AG-UI 事件投影。
 * 边界：负责应用层编排和可观察性投影，不直接调用 LLM、不渲染组件、不替换底层 transport。
 * AI用途：接入页面 AI 运行、审批、trace UI 或 AG-UI timeline 时，从本模块确认 app 层入口。
 */
/**
 * 本模块刻意保持 UI-free：没有 Vue import，没有组件引用，也不拥有浏览器 transport。
 * UI 通过 snapshot/subscribe 读取内置投影；外部 trace sink 只用于兼容已有宿主观测。
 */

import {
  createAiAgentRunTrace,
  sparkAgUi,
} from '@spark-appworks/spark-ai/agent'
import type * as SparkAgent from '@spark-appworks/spark-ai/agent'
import type { JsonParams } from '@spark-appworks/spark-json-document'

/** 外部 trace sink 接口：宿主方可实现此接口在 run 生命周期中接收观测数据 */
export type AiRunTraceSink = Readonly<{
  /** 追加用户消息 */
  appendUserMessage(content: string): void
  /** 从原始 SSE 事件派发内部状态变更 */
  appendEvent(event: SparkAgent.AiAgentStreamEvent): void
  /** 追加模型文本增量 */
  appendDelta(delta: string): void
  /** 追加推理文本增量 */
  appendReasoning(text: string): void
  /** 追加工具调用完成记录 */
  appendToolCall(record: SparkAgent.AiAgentToolCallRecord): void
  /** 追加错误条目 */
  appendError(message: string): void
  /** 标记为用户主动中断 */
  markAborted(message?: string): void
  /** 结束当前活跃 turn */
  finish(): void
  /** 重置全部状态 */
  reset(): void
}>

export const noopTraceSink: AiRunTraceSink = Object.freeze({
  appendUserMessage: () => undefined,
  appendEvent: () => undefined,
  appendDelta: () => undefined,
  appendReasoning: () => undefined,
  appendToolCall: () => undefined,
  appendError: () => undefined,
  markAborted: () => undefined,
  finish: () => undefined,
  reset: () => undefined,
})

/** Ai Run Error Formatter 的语义模型。 */
export type AiRunErrorFormatter = (error: unknown) => string
/** Ai Run Before Function Call 的语义模型。 */
export type AiRunBeforeFunctionCall = (
  options: SparkAgent.AiAgentBeforeFunctionCallOptions,
) => SparkAgent.AiAgentBeforeFunctionCallDirective | Promise<SparkAgent.AiAgentBeforeFunctionCallDirective>
/** Ai Run Abort Handler 的回调函数契约。 */
export type AiRunAbortHandler = (reason: string) => void
/** Ai Run Adapter Run Status 的语义模型。 */
export type AiRunAdapterRunStatus = 'completed' | 'aborted'

/** AI 运行宿主接口：封装 AiAgentHost.run() 调用，便于 adapter 在不依赖具体 Host 实现的情况下发起 run */
export type AiRunHost = Readonly<{
  /** 按 alias 运行已注册业务，委托给 AiAgentHost.run() */
  run<TInput extends JsonParams>(
    alias: string,
    input: TInput,
    chat?: SparkAgent.AiAgentTaskChatOptions,
  ): Promise<SparkAgent.AiAgentHostRunResult>
}>

/** adapter 全局配置 */
export type AiRunAdapterOptions = Readonly<{
  /** 自定义错误格式化函数，将 run 抛出的 error 转为展示文本；默认使用 error.message */
  formatError?: AiRunErrorFormatter
}>

/** 单次 AI run 的启动命令参数 */
export type AiRunAdapterCommand<TInput extends JsonParams = JsonParams> = Readonly<{
  /** 运行宿主，封装了 AiAgentHost.run() 调用 */
  host: AiRunHost
  /** 业务注册别名，对应 Host 中已注册的业务 */
  alias: string
  /** 业务输入参数，类型由 alias 推断 */
  input: TInput
  /** AG-UI run 输入元数据（threadId / runId / parentRunId），用于构造 AG-UI 事件 */
  runInput?: SparkAgent.RunAgentInput
  /** AG-UI 线程 ID；省略时自动生成 spark-thread:{alias} */
  threadId?: string
  /** AG-UI 运行 ID；省略时自动生成 spark-run:{sequence} */
  runId?: string
  /** 外部 trace sink，用于宿主观测 run 生命周期事件；省略时使用 noopTraceSink */
  trace?: AiRunTraceSink
  /** 本次请求级工具执行前置裁决 */
  beforeFunctionCall?: AiRunBeforeFunctionCall
  /** 用户中断回调：abort 触发后调用，参数为中断原因 */
  onAbort?: AiRunAbortHandler
  /** AG-UI 事件回调：每次产出 AG-UI 事件时调用，用于外部实时消费 */
  onEvent?: (event: SparkAgent.AGUIEvent) => void
  /** 用户消息文本，run 开始前追加到 trace；省略则不追加 */
  userMessage?: string
}>

/** AG-UI timeline 中给组件展示的单条事件摘要。 */
export type AiRunTimelineEvent = Readonly<{
  /** 事件序号，从 1 开始递增 */
  sequence: number
  /** AG-UI 事件类型标识 */
  type: string
  /** 事件时间戳（Unix 毫秒） */
  timestamp: number
  /** 事件 payload 的截断预览文本，超出 360 字符自动截断 */
  payloadPreview: string
}>

/** headless AI run adapter 暴露给 UI 的完整只读快照。 */
export type AiRunSnapshot = Readonly<{
  /** 内置 run trace 快照（含流式文本、条目列表、工具调用记录） */
  trace: SparkAgent.AiAgentRunTraceSnapshot
  /** 已产出的 AG-UI 事件列表，按时间顺序排列 */
  agUiEvents: readonly SparkAgent.AGUIEvent[]
  /** AG-UI 事件 timeline 摘要列表，用于 UI 渲染精简事件流 */
  timeline: readonly AiRunTimelineEvent[]
}>

/** AI run snapshot 变化监听器，订阅者应只读消费快照而不持有可变内部状态。 */
export type AiRunListener = (snapshot: AiRunSnapshot) => void

/** headless AI run adapter 状态接口：UI 通过此接口发起/中断 run、读取快照、订阅变化 */
export type AiRunAdapterState = Readonly<{
  /** 是否有活跃的 run 正在执行 */
  isRunning(): boolean
  /** 中断当前 run（仅在有活跃 run 时生效） */
  abort(reason?: string): void
  /** 获取当前只读快照 */
  snapshot(): AiRunSnapshot
  /** 订阅快照变化；返回取消订阅函数 */
  subscribe(listener: AiRunListener): () => void
  /** 发起一次 AI run；同一时刻只允许一个活跃 run，重复调用会抛错 */
  run<TInput extends JsonParams>(
    command: AiRunAdapterCommand<TInput>,
  ): Promise<AiRunAdapterRunStatus>
}>

type ActiveRun = {
  readonly runId: number
  readonly controller: AbortController
  readonly trace: AiRunTraceSink
  readonly onAbort?: AiRunAbortHandler
  aborted: boolean
}

type MutableAiRunProjectionState = {
  agUiEvents: SparkAgent.AGUIEvent[]
  timeline: AiRunTimelineEvent[]
  openTextMessageId: string | null
  openReasoningMessageId: string | null
  activeTurnId: string | null
}

type CreateEventEmitterCommand = Readonly<{
  projection: MutableAiRunProjectionState
  listeners: Set<AiRunListener>
  trace: SparkAgent.AiAgentRunTrace
  onEvent: ((event: SparkAgent.AGUIEvent) => void) | undefined
}>

const DEFAULT_PREVIEW_LIMIT = 360

export function formatAiRunError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createAiRunAdapter(
  options: AiRunAdapterOptions = {},
): AiRunAdapterState {
  const formatError = options.formatError ?? formatAiRunError
  const trace = createAiAgentRunTrace()
  const listeners = new Set<AiRunListener>()
  const projection = createEmptyProjectionState()
  let activeRun: ActiveRun | null = null
  let nextRunId = 0

  function isRunning(): boolean {
    return activeRun !== null
  }

  function abort(reason?: string): void {
    const current = activeRun
    if (current === null || current.aborted) return
    const abortReason = reason ?? '本地已中断'
    current.aborted = true
    current.controller.abort()
    current.trace.markAborted(abortReason)
    current.onAbort?.(abortReason)
  }

  function snapshot(): AiRunSnapshot {
    return {
      trace: trace.snapshot(),
      agUiEvents: [...projection.agUiEvents],
      timeline: [...projection.timeline],
    }
  }

  function subscribe(listener: AiRunListener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  async function run<TInput extends JsonParams>(
    command: AiRunAdapterCommand<TInput>,
  ): Promise<AiRunAdapterRunStatus> {
    if (activeRun !== null) {
      throw new Error('AI run is already in progress.')
    }

    resetProjectionState(projection)
    const controller = new AbortController()
    const runId = nextRunId + 1
    nextRunId = runId
    const runRef = resolveRunRef(command, runId)
    const emit = createEventEmitter({
      projection,
      listeners,
      trace,
      onEvent: command.onEvent,
    })
    emit(sparkAgUi.createSparkAgUiRunStartedEvent({
      ...runRef,
      timestamp: Date.now(),
      ...(command.runInput === undefined ? {} : { input: command.runInput }),
    }))
    const traceSink = createCompositeTraceSink({
      trace,
      projection,
      emit,
      notify: () => notifyListeners(listeners, trace, projection),
      ...(command.trace === undefined ? {} : { external: command.trace }),
    })
    const beforeFunctionCall = wrapBeforeFunctionCall(command.beforeFunctionCall, emit)

    const currentRun: ActiveRun = {
      runId,
      controller,
      trace: traceSink,
      ...(command.onAbort === undefined ? {} : { onAbort: command.onAbort }),
      aborted: false,
    }
    activeRun = currentRun

    traceSink.reset()
    if (command.userMessage !== undefined) {
      traceSink.appendUserMessage(command.userMessage)
    }

    try {
      await command.host.run(command.alias, command.input, {
        signal: controller.signal,
        onStreamEvent: (event) => traceSink.appendEvent(event),
        onDelta: (delta) => traceSink.appendDelta(delta),
        onReasoning: (reasoning) => traceSink.appendReasoning(reasoning),
        onToolCall: (record) => traceSink.appendToolCall(record),
        ...(beforeFunctionCall === undefined ? {} : { beforeFunctionCall }),
      })

      if (activeRun !== currentRun || currentRun.aborted) {
        traceSink.finish()
        return 'aborted'
      }
      traceSink.finish()
      emit(sparkAgUi.createSparkAgUiRunFinishedEvent({
        ...runRef,
        result: { status: 'completed' },
        timestamp: Date.now(),
      }))
      return 'completed'
    } catch (error) {
      if (currentRun.aborted) {
        traceSink.finish()
        return 'aborted'
      }
      if (activeRun === currentRun) {
        const message = formatError(error)
        traceSink.appendError(message)
        traceSink.finish()
        emit(sparkAgUi.createSparkAgUiRunErrorEvent({
          message,
          timestamp: Date.now(),
          rawEvent: error,
        }))
      }
      throw error
    } finally {
      if (activeRun === currentRun) {
        activeRun = null
      }
    }
  }

  return {
    isRunning,
    abort,
    snapshot,
    subscribe,
    run,
  }
}

function createCompositeTraceSink(input: Readonly<{
  trace: SparkAgent.AiAgentRunTrace
  external?: AiRunTraceSink
  projection: MutableAiRunProjectionState
  emit(event: SparkAgent.AGUIEvent): void
  notify(): void
}>): AiRunTraceSink {
  const external = input.external ?? noopTraceSink
  return {
    reset: () => {
      input.trace.reset()
      external.reset()
      input.notify()
    },
    appendUserMessage: (content) => {
      input.trace.appendUserMessage(content)
      external.appendUserMessage(content)
      input.notify()
    },
    appendEvent: (event) => {
      input.projection.activeTurnId = event.scope.turnId || input.projection.activeTurnId
      input.trace.appendEvent(event)
      external.appendEvent(event)
      input.emit(sparkAgUi.createSparkAgUiStreamCustomEvent(event, { timestamp: Date.now() }))
    },
    appendDelta: (delta) => {
      const messageId = ensureTextMessage(input.projection, input.emit)
      input.trace.appendDelta(delta)
      external.appendDelta(delta)
      input.emit(sparkAgUi.createSparkAgUiTextMessageContentEvent({
        messageId,
        delta,
        timestamp: Date.now(),
      }))
    },
    appendReasoning: (text) => {
      const messageId = ensureReasoningMessage(input.projection, input.emit)
      input.trace.appendReasoning(text)
      external.appendReasoning(text)
      input.emit(sparkAgUi.createSparkAgUiReasoningMessageContentEvent({
        messageId,
        delta: text,
        timestamp: Date.now(),
      }))
    },
    appendToolCall: (record) => {
      input.trace.appendToolCall(record)
      external.appendToolCall(record)
      for (const event of sparkAgUi.createSparkAgUiToolCallEvents(record, { timestamp: Date.now() })) {
        input.emit(event)
      }
    },
    appendError: (message) => {
      input.trace.appendError(message)
      external.appendError(message)
      input.notify()
    },
    markAborted: (message) => {
      input.trace.markAborted(message)
      external.markAborted(message)
      closeOpenMessages(input.projection, input.emit)
      input.notify()
    },
    finish: () => {
      input.trace.finish()
      external.finish()
      closeOpenMessages(input.projection, input.emit)
      input.notify()
    },
  }
}

function wrapBeforeFunctionCall(
  beforeFunctionCall: AiRunBeforeFunctionCall | undefined,
  emit: (event: SparkAgent.AGUIEvent) => void,
): AiRunBeforeFunctionCall | undefined {
  if (beforeFunctionCall === undefined) return undefined
  return async (options: SparkAgent.AiAgentBeforeFunctionCallOptions): Promise<SparkAgent.AiAgentBeforeFunctionCallDirective> => {
    emit(sparkAgUi.createSparkAgUiCustomEvent('spark.toolApproval.requested', toApprovalPayload(options), {
      timestamp: Date.now(),
      rawEvent: options,
    }))
    const directive = await beforeFunctionCall(options)
    emit(sparkAgUi.createSparkAgUiCustomEvent('spark.toolApproval.resolved', {
      ...toApprovalPayload(options),
      directive,
    }, {
      timestamp: Date.now(),
      rawEvent: directive,
    }))
    return directive
  }
}

function ensureTextMessage(
  projection: MutableAiRunProjectionState,
  emit: (event: SparkAgent.AGUIEvent) => void,
): string {
  if (projection.openTextMessageId !== null) return projection.openTextMessageId
  const messageId = sparkAgUi.toSparkAgUiAssistantMessageId(projection.activeTurnId ?? 'unknown')
  projection.openTextMessageId = messageId
  emit(sparkAgUi.createSparkAgUiTextMessageStartEvent({ messageId, timestamp: Date.now() }))
  return messageId
}

function ensureReasoningMessage(
  projection: MutableAiRunProjectionState,
  emit: (event: SparkAgent.AGUIEvent) => void,
): string {
  if (projection.openReasoningMessageId !== null) return projection.openReasoningMessageId
  const messageId = sparkAgUi.toSparkAgUiReasoningMessageId(projection.activeTurnId ?? 'unknown')
  projection.openReasoningMessageId = messageId
  emit(sparkAgUi.createSparkAgUiReasoningStartEvent({ messageId, timestamp: Date.now() }))
  emit(sparkAgUi.createSparkAgUiReasoningMessageStartEvent({ messageId, timestamp: Date.now() }))
  return messageId
}

function closeOpenMessages(
  projection: MutableAiRunProjectionState,
  emit: (event: SparkAgent.AGUIEvent) => void,
): void {
  if (projection.openTextMessageId !== null) {
    emit(sparkAgUi.createSparkAgUiTextMessageEndEvent({
      messageId: projection.openTextMessageId,
      timestamp: Date.now(),
    }))
    projection.openTextMessageId = null
  }
  if (projection.openReasoningMessageId !== null) {
    const messageId = projection.openReasoningMessageId
    emit(sparkAgUi.createSparkAgUiReasoningMessageEndEvent({ messageId, timestamp: Date.now() }))
    emit(sparkAgUi.createSparkAgUiReasoningEndEvent({ messageId, timestamp: Date.now() }))
    projection.openReasoningMessageId = null
  }
}

function createEventEmitter(command: CreateEventEmitterCommand): (event: SparkAgent.AGUIEvent) => void {
  const { projection, listeners, trace, onEvent } = command
  return (event) => {
    projection.agUiEvents = [...projection.agUiEvents, event]
    projection.timeline = [
      ...projection.timeline,
      toTimelineEvent(event, projection.timeline.length + 1),
    ]
    onEvent?.(event)
    notifyListeners(listeners, trace, projection)
  }
}

function notifyListeners(
  listeners: Set<AiRunListener>,
  trace: SparkAgent.AiAgentRunTrace,
  projection: MutableAiRunProjectionState,
): void {
  const snapshot: AiRunSnapshot = {
    trace: trace.snapshot(),
    agUiEvents: [...projection.agUiEvents],
    timeline: [...projection.timeline],
  }
  for (const listener of listeners) {
    listener(snapshot)
  }
}

function toTimelineEvent(event: SparkAgent.AGUIEvent, sequence: number): AiRunTimelineEvent {
  const timestamp = typeof event.timestamp === 'number' ? event.timestamp : Date.now()
  return {
    sequence,
    type: event.type,
    timestamp,
    payloadPreview: previewPayload(event),
  }
}

function previewPayload(value: unknown): string {
  let text: string
  try {
    text = JSON.stringify(value)
  } catch {
    text = String(value)
  }
  return text.length > DEFAULT_PREVIEW_LIMIT
    ? `${text.slice(0, DEFAULT_PREVIEW_LIMIT)}...`
    : text
}

function resolveRunRef(
  command: AiRunAdapterCommand,
  sequence: number,
): Readonly<{ threadId: string; runId: string; parentRunId?: string }> {
  const threadId = command.threadId
    ?? command.runInput?.threadId
    ?? `spark-thread:${command.alias}`
  const runId = command.runId
    ?? command.runInput?.runId
    ?? `spark-run:${sequence}`
  return {
    threadId,
    runId,
    ...(command.runInput?.parentRunId === undefined ? {} : { parentRunId: command.runInput.parentRunId }),
  }
}

function toApprovalPayload(options: SparkAgent.AiAgentBeforeFunctionCallOptions): Record<string, unknown> {
  return {
    moduleId: options.moduleId,
    moduleInstanceId: options.moduleInstanceId,
    instanceId: options.instanceId,
    toolName: options.toolName,
    args: options.args,
  }
}

function createEmptyProjectionState(): MutableAiRunProjectionState {
  return {
    agUiEvents: [],
    timeline: [],
    openTextMessageId: null,
    openReasoningMessageId: null,
    activeTurnId: null,
  }
}

function resetProjectionState(projection: MutableAiRunProjectionState): void {
  projection.agUiEvents = []
  projection.timeline = []
  projection.openTextMessageId = null
  projection.openReasoningMessageId = null
  projection.activeTurnId = null
}
