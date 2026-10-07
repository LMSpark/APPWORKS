/**
 * @module @spark-appworks/spark-ai:agent/conversation/ag-ui/ag-ui-mapper
 * 职责：把 SPARK agent transport/trace 事件投影为 AG-UI core 事件和工具定义。
 * 边界：纯 mapper，不持有运行状态、不调用 LLM、不依赖 app 或 component 层。
 * AI用途：接入 AG-UI、外部 agent UI 或调试事件流时，用本模块完成协议映射。
 */

import {
  EventType,
  type AGUIEvent,
  type CustomEvent,
  type ReasoningEndEvent,
  type ReasoningMessageContentEvent,
  type ReasoningMessageEndEvent,
  type ReasoningMessageStartEvent,
  type ReasoningStartEvent,
  type RunAgentInput,
  type RunErrorEvent,
  type RunFinishedEvent,
  type RunStartedEvent,
  type TextMessageContentEvent,
  type TextMessageEndEvent,
  type TextMessageStartEvent,
  type Tool,
  type ToolCallArgsEvent,
  type ToolCallEndEvent,
  type ToolCallResultEvent,
  type ToolCallStartEvent,
} from '@ag-ui/core'
import type {
  AiAgentStreamEvent,
  AiAgentToolCallRecord,
} from '../chat/chat-types'
import type { AiAgentTransportToolSpec } from '../transport/transport-types'
import type {
  SparkAgUiCustomEventName,
  SparkAgUiEventMetadata,
  SparkAgUiRunRef,
  SparkAgUiTextMessageRole,
} from './ag-ui-types'

/** 将 SPARK transport tool spec 映射为 AG-UI tool 定义，保留 name、description、parameters 和 strict 元数据。 */
export function toSparkAgUiTool(tool: AiAgentTransportToolSpec): Tool {
  return {
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
    metadata: {
      source: 'spark-ai',
      type: tool.type,
      ...(tool.function.strict === undefined ? {} : { strict: tool.function.strict }),
    },
  }
}

/** 批量将 SPARK transport tool specs 映射为 AG-UI tools。 */
export function toSparkAgUiTools(tools: readonly AiAgentTransportToolSpec[]): readonly Tool[] {
  return tools.map(toSparkAgUiTool)
}

/** 创建 AG-UI RUN_STARTED 事件，标记一次 SPARK agent run 已进入事件流。 */
export function createSparkAgUiRunStartedEvent(
  input: SparkAgUiRunRef & SparkAgUiEventMetadata & Readonly<{ input?: RunAgentInput }>,
): RunStartedEvent {
  return {
    type: EventType.RUN_STARTED,
    threadId: input.threadId,
    runId: input.runId,
    ...(input.parentRunId === undefined ? {} : { parentRunId: input.parentRunId }),
    ...(input.input === undefined ? {} : { input: input.input }),
    ...eventMetadataFields(input),
  }
}

/** 创建 AG-UI RUN_FINISHED 事件，标记一次 SPARK agent run 已成功结束并可携带结果。 */
export function createSparkAgUiRunFinishedEvent(
  input: SparkAgUiRunRef & SparkAgUiEventMetadata & Readonly<{ result?: unknown }>,
): RunFinishedEvent {
  return {
    type: EventType.RUN_FINISHED,
    threadId: input.threadId,
    runId: input.runId,
    ...(input.result === undefined ? {} : { result: input.result }),
    outcome: { type: 'success' },
    ...eventMetadataFields(input),
  }
}

/** 创建 AG-UI RUN_ERROR 事件，承载 SPARK agent run 的错误消息和可选错误码。 */
export function createSparkAgUiRunErrorEvent(
  input: SparkAgUiEventMetadata & Readonly<{ message: string; code?: string }>,
): RunErrorEvent {
  return {
    type: EventType.RUN_ERROR,
    message: input.message,
    ...(input.code === undefined ? {} : { code: input.code }),
    ...eventMetadataFields(input),
  }
}

/** 创建 AG-UI TEXT_MESSAGE_START 事件，开始一条 assistant/user/system/developer 文本消息。 */
export function createSparkAgUiTextMessageStartEvent(
  input: SparkAgUiEventMetadata & Readonly<{
    messageId: string
    role?: SparkAgUiTextMessageRole
    name?: string
  }>,
): TextMessageStartEvent {
  return {
    type: EventType.TEXT_MESSAGE_START,
    messageId: input.messageId,
    role: input.role ?? 'assistant',
    ...(input.name === undefined ? {} : { name: input.name }),
    ...eventMetadataFields(input),
  }
}

/** 创建 AG-UI TEXT_MESSAGE_CONTENT 事件，写入指定 messageId 的文本增量。 */
export function createSparkAgUiTextMessageContentEvent(
  input: SparkAgUiEventMetadata & Readonly<{ messageId: string; delta: string }>,
): TextMessageContentEvent {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: input.messageId,
    delta: input.delta,
    ...eventMetadataFields(input),
  }
}

/** 创建 AG-UI TEXT_MESSAGE_END 事件，结束指定 messageId 的文本消息。 */
export function createSparkAgUiTextMessageEndEvent(
  input: SparkAgUiEventMetadata & Readonly<{ messageId: string }>,
): TextMessageEndEvent {
  return {
    type: EventType.TEXT_MESSAGE_END,
    messageId: input.messageId,
    ...eventMetadataFields(input),
  }
}

/** 创建 AG-UI REASONING_START 事件，标记推理流开始。 */
export function createSparkAgUiReasoningStartEvent(
  input: SparkAgUiEventMetadata & Readonly<{ messageId: string }>,
): ReasoningStartEvent {
  return {
    type: EventType.REASONING_START,
    messageId: input.messageId,
    ...eventMetadataFields(input),
  }
}

/** 创建 AG-UI REASONING_MESSAGE_START 事件，开始一条推理消息。 */
export function createSparkAgUiReasoningMessageStartEvent(
  input: SparkAgUiEventMetadata & Readonly<{ messageId: string }>,
): ReasoningMessageStartEvent {
  return {
    type: EventType.REASONING_MESSAGE_START,
    messageId: input.messageId,
    role: 'reasoning',
    ...eventMetadataFields(input),
  }
}

/** 创建 AG-UI REASONING_MESSAGE_CONTENT 事件，写入推理消息增量。 */
export function createSparkAgUiReasoningMessageContentEvent(
  input: SparkAgUiEventMetadata & Readonly<{ messageId: string; delta: string }>,
): ReasoningMessageContentEvent {
  return {
    type: EventType.REASONING_MESSAGE_CONTENT,
    messageId: input.messageId,
    delta: input.delta,
    ...eventMetadataFields(input),
  }
}

/** 创建 AG-UI REASONING_MESSAGE_END 事件，结束指定推理消息。 */
export function createSparkAgUiReasoningMessageEndEvent(
  input: SparkAgUiEventMetadata & Readonly<{ messageId: string }>,
): ReasoningMessageEndEvent {
  return {
    type: EventType.REASONING_MESSAGE_END,
    messageId: input.messageId,
    ...eventMetadataFields(input),
  }
}

/** 创建 AG-UI REASONING_END 事件，标记推理流结束。 */
export function createSparkAgUiReasoningEndEvent(
  input: SparkAgUiEventMetadata & Readonly<{ messageId: string }>,
): ReasoningEndEvent {
  return {
    type: EventType.REASONING_END,
    messageId: input.messageId,
    ...eventMetadataFields(input),
  }
}

/** 将一次 SPARK tool call record 展开为 AG-UI tool start/args/end/result 事件序列。 */
export function createSparkAgUiToolCallEvents(
  record: AiAgentToolCallRecord,
  metadata: SparkAgUiEventMetadata = {},
): readonly AGUIEvent[] {
  const toolCallId = readToolCallId(record)
  const args = stringifySparkAgUiPayload(record.args)
  const result = stringifySparkAgUiPayload(record.result)
  const eventMetadata = eventMetadataFields({
    ...(metadata.timestamp === undefined ? {} : { timestamp: metadata.timestamp }),
    rawEvent: metadata.rawEvent ?? record,
  })
  const startEvent: ToolCallStartEvent = {
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName: record.toolName,
    parentMessageId: toSparkAgUiAssistantMessageId(record.turnId),
    ...eventMetadata,
  }
  const argsEvent: ToolCallArgsEvent = {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId,
    delta: args,
    ...eventMetadata,
  }
  const endEvent: ToolCallEndEvent = {
    type: EventType.TOOL_CALL_END,
    toolCallId,
    ...eventMetadata,
  }
  const resultEvent: ToolCallResultEvent = {
    type: EventType.TOOL_CALL_RESULT,
    messageId: `spark-tool-result:${toolCallId}`,
    toolCallId,
    content: result,
    role: 'tool',
    ...eventMetadata,
  }
  return [startEvent, argsEvent, endEvent, resultEvent]
}

/** 创建 AG-UI CUSTOM 事件，用于承载 SPARK 首版 approval 和 stream 扩展事件。 */
export function createSparkAgUiCustomEvent(
  name: SparkAgUiCustomEventName,
  value: unknown,
  metadata: SparkAgUiEventMetadata = {},
): CustomEvent {
  return {
    type: EventType.CUSTOM,
    name,
    value,
    ...eventMetadataFields(metadata),
  }
}

/** 将 SPARK 原始 stream event 包装为 AG-UI CUSTOM 事件，保留 turn/stream/scope 定位字段。 */
export function createSparkAgUiStreamCustomEvent(
  event: AiAgentStreamEvent,
  metadata: SparkAgUiEventMetadata = {},
): CustomEvent {
  const eventMetadata: SparkAgUiEventMetadata = {
    ...(metadata.timestamp === undefined ? {} : { timestamp: metadata.timestamp }),
    rawEvent: metadata.rawEvent ?? event,
  }
  return createSparkAgUiCustomEvent('spark.stream.event', {
    type: event.type,
    data: event.data,
    turnKey: event.turnKey,
    streamKey: event.streamKey,
    scope: event.scope,
  }, eventMetadata)
}

/** 生成 SPARK assistant 文本消息在 AG-UI 事件流中的稳定 messageId。 */
export function toSparkAgUiAssistantMessageId(turnId: string): string {
  return `spark-assistant:${turnId}`
}

/** 生成 SPARK reasoning 消息在 AG-UI 事件流中的稳定 messageId。 */
export function toSparkAgUiReasoningMessageId(turnId: string): string {
  return `spark-reasoning:${turnId}`
}

/** 将 SPARK 事件 payload 序列化为 AG-UI content/delta 可传输字符串。 */
export function stringifySparkAgUiPayload(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function readToolCallId(record: AiAgentToolCallRecord): string {
  if (record.callId !== undefined && record.callId.trim().length > 0) return record.callId
  return `spark-tool:${record.turnId}:${record.round}:${record.toolName}`
}

function eventMetadataFields(metadata: SparkAgUiEventMetadata): SparkAgUiEventMetadata {
  return {
    ...(metadata.timestamp === undefined ? {} : { timestamp: metadata.timestamp }),
    ...(metadata.rawEvent === undefined ? {} : { rawEvent: metadata.rawEvent }),
  }
}

export const sparkAgUi = Object.freeze({
  createSparkAgUiCustomEvent,
  createSparkAgUiReasoningEndEvent,
  createSparkAgUiReasoningMessageContentEvent,
  createSparkAgUiReasoningMessageEndEvent,
  createSparkAgUiReasoningMessageStartEvent,
  createSparkAgUiReasoningStartEvent,
  createSparkAgUiRunErrorEvent,
  createSparkAgUiRunFinishedEvent,
  createSparkAgUiRunStartedEvent,
  createSparkAgUiStreamCustomEvent,
  createSparkAgUiTextMessageContentEvent,
  createSparkAgUiTextMessageEndEvent,
  createSparkAgUiTextMessageStartEvent,
  createSparkAgUiToolCallEvents,
  stringifySparkAgUiPayload,
  toSparkAgUiAssistantMessageId,
  toSparkAgUiReasoningMessageId,
  toSparkAgUiTool,
  toSparkAgUiTools,
})

export type SparkAgUiAdapter = typeof sparkAgUi
