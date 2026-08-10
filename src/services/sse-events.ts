/**
 * @module app:services/sse-events
 * 职责：提供应用运行时 service 层的 sse events 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
/**
 * APP 公共 SSE 事件总线。
 *
 * 本文件只维护 lowcode `/api/sse/connect` 的单例连接、v4 envelope 解包和按事件名分发。
 * 页面配置、数据任务、通知和 lowcode Agent turn 等业务动作在各自订阅方处理。
 */

import { Logger, isRecord, type ApiEnvelopeContext, type ApiEnvelopeEvent } from '@spark-appworks/spark-utils'
import { readNonEmptyStringProperty } from '@spark-appworks/spark-utils/internal'
import type {
  AiAgentAppSseEvent,
  AiAgentAppSseEventName,
  AiAgentAppSseEventSource,
} from '@spark-appworks/spark-ai/agent'
import type { LowcodeRealtimeEvent, LowcodeRealtimeSubscription } from '@spark-appworks/spark-lowcode-api'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'

const logger = Logger('SSE')

// Event names ---------------------------------------------------------------

const ServerEventType = Object.freeze({
  PAGE_CONFIG: 'page-config',
  DATA_BATCH_JOB: 'data-batch-job',
  DATA_CHANGE: 'data-change',
  NOTIFICATION: 'notification',
})

// Payload contracts ---------------------------------------------------------

/** File Change Event 的事件载荷。 */
export type FileChangeEvent = {
    /** page Id 标识。 */
pageId: string
    /** 文件路径或文件对象。 */
file: string
    /** 事件时间戳。 */
timestamp: number
}

/** Data Batch Job Event 的事件载荷。 */
export type DataBatchJobEvent = {
    /** tenant Id 标识。 */
tenantId: string
    /** project Id 标识。 */
projectId: string
    /** job Id 标识。 */
jobId: string
    /** 当前状态。 */
status: string
    /** completed 字段。 */
completed: number
    /** 总记录数。 */
total: number
    /** 事件时间戳。 */
timestamp: number
    /** 操作结果。 */
result?: unknown
    /** 错误对象或错误信息。 */
error?: string
}

/** Data Change Event 的事件载荷。 */
export type DataChangeEvent = {
    /** tenant Id 标识。 */
tenantId: string
    /** project Id 标识。 */
projectId: string
    /** 数据表名。 */
tableName: string
    /** operation 字段。 */
operation: string
    /** 事件时间戳。 */
timestamp: number
    /** job Id 标识。 */
jobId?: string
}

/** Server Notification Event 的事件载荷。 */
export type ServerNotificationEvent = {
    /** 显示标题。 */
title: string
    /** 用户可读消息。 */
message: string
    /** 事件时间戳。 */
timestamp: number
    /** notification Id 标识。 */
notificationId?: string
    /** level 字段。 */
level?: string
    /** category 字段。 */
category?: string
    /** 来源对象。 */
source?: string
    /** action Url 地址。 */
actionUrl?: string
}

type EventNormalizer<T> = (data: unknown) => T | null

// Shared connection state ---------------------------------------------------

const eventSubscribers = new Map<string, Set<(data: unknown) => void>>()
const envelopeEventSubscribers = new Map<string, Set<(event: AiAgentAppSseEvent) => void>>()
const allEnvelopeEventSubscribers = new Set<(event: AiAgentAppSseEvent) => void>()
const legacyProtocolWarnings = new Set<string>()

let sharedSubscription: LowcodeRealtimeSubscription | null = null
let sharedReadyPromise: Promise<void> | null = null
let resolveSharedReady: (() => void) | null = null
let rejectSharedReady: ((error: Error) => void) | null = null

/** 畸形事件计数保留在模块内，方便诊断日志定位协议接入质量。 */
let malformedEventCount = 0

// Public subscription API ---------------------------------------------------

export function onServerEvent(
  eventType: string,
  callback: (data: unknown) => void,
): () => void {
  let subscribers = eventSubscribers.get(eventType)
  if (subscribers === undefined) {
    subscribers = new Set()
    eventSubscribers.set(eventType, subscribers)
  }
  subscribers.add(callback)

  ensureConnection()

  return () => {
    subscribers.delete(callback)
    if (subscribers.size === 0) {
      eventSubscribers.delete(eventType)
    }
    if (totalSubscribers() === 0) {
      teardownConnection()
    }
  }
}

export function onServerEnvelopeEvent(
  eventType: AiAgentAppSseEventName,
  callback: (event: AiAgentAppSseEvent) => void,
): () => void {
  const eventKey = String(eventType)
  let subscribers = envelopeEventSubscribers.get(eventKey)
  if (subscribers === undefined) {
    subscribers = new Set()
    envelopeEventSubscribers.set(eventKey, subscribers)
  }
  subscribers.add(callback)

  ensureConnection()

  return () => {
    subscribers.delete(callback)
    if (subscribers.size === 0) {
      envelopeEventSubscribers.delete(eventKey)
    }
    if (totalSubscribers() === 0) {
      teardownConnection()
    }
  }
}

export function createAppSseEventSource(): AiAgentAppSseEventSource {
  return {
    on: onServerEnvelopeEvent,
  }
}

/**
 * 订阅所有 lowcode SparkEnvelope 事件。
 *
 * Agent 错误信封不一定携带 event.name，因此 AI turn 适配器必须先按
 * context.session/context.turn 识别归属，再解释具体事件语义。
 */
export function onAnyServerEnvelopeEvent(
  callback: (event: AiAgentAppSseEvent) => void,
): () => void {
  allEnvelopeEventSubscribers.add(callback)
  ensureConnection()
  return () => {
    allEnvelopeEventSubscribers.delete(callback)
    if (totalSubscribers() === 0) teardownConnection()
  }
}

const DEFAULT_APP_SSE_READY_TIMEOUT_MS = 15_000

/**
 * 等待 lowcode SSE 返回 connected 事件。
 */
export function waitForAppSseConnection(timeoutMs = DEFAULT_APP_SSE_READY_TIMEOUT_MS): Promise<void> {
  ensureConnection()
  const ready = sharedReadyPromise
  if (ready === null) return Promise.reject(new Error('lowcode SSE connection was not initialized.'))
  return Promise.race([
    ready,
    new Promise<void>((_, reject) => {
      window.setTimeout(() => reject(new Error(`Timed out waiting for lowcode SSE connection (${timeoutMs}ms).`)), timeoutMs)
    }),
  ])
}

export function onPageConfigChange(
  callback: (event: FileChangeEvent) => void,
): () => void {
  return onTypedServerEvent({
    eventType: ServerEventType.PAGE_CONFIG,
    normalize: normalizeFileChangeEvent,
    label: '页面配置',
    callback,
  })
}

export function onDataBatchJob(
  callback: (event: DataBatchJobEvent) => void,
): () => void {
  return onTypedServerEvent({
    eventType: ServerEventType.DATA_BATCH_JOB,
    normalize: normalizeDataBatchJobEvent,
    label: '数据任务',
    callback,
  })
}

export function onDataChange(
  callback: (event: DataChangeEvent) => void,
): () => void {
  return onTypedServerEvent({
    eventType: ServerEventType.DATA_CHANGE,
    normalize: normalizeDataChangeEvent,
    label: '数据变更',
    callback,
  })
}

export function onNotificationEvent(
  callback: (event: ServerNotificationEvent) => void,
): () => void {
  return onTypedServerEvent({
    eventType: ServerEventType.NOTIFICATION,
    normalize: normalizeNotificationEvent,
    label: '通知',
    callback,
  })
}

// Connection lifecycle ------------------------------------------------------

function ensureConnection(): void {
  if (sharedSubscription !== null) return
  sharedReadyPromise = new Promise<void>((resolve, reject) => {
    resolveSharedReady = resolve
    rejectSharedReady = reject
  })
  try {
    sharedSubscription = lowcodeApi.realtime.connect({
      scope: 'spark-appworks',
      onEvent: dispatchLowcodeRealtimeEvent,
    })
    void sharedSubscription.closed.catch((error: unknown) => {
      rejectSharedReady?.(error instanceof Error ? error : new Error(String(error)))
      teardownConnection()
      logger.warn('lowcode SSE 连接已关闭', { error: errorMessage(error) })
    })
  } catch (error) {
    rejectSharedReady?.(error instanceof Error ? error : new Error(String(error)))
    teardownConnection()
    throw error
  }
}

function dispatchLowcodeRealtimeEvent(event: LowcodeRealtimeEvent): void {
  if (event.event === 'connected') {
    resolveSharedReady?.()
    resolveSharedReady = null
    rejectSharedReady = null
    return
  }
  try {
    const message = isRecord(event.data) ? event.data : null
    const content = message !== null && typeof message['content'] === 'string'
      ? parseEventContent(message['content'])
      : event.data
    const envelopeName = readEnvelopeName(content)
    const eventType = envelopeName
      ?? (message !== null && typeof message['title'] === 'string' && message['title'].trim() !== ''
        ? message['title']
        : event.event)
    dispatchPayload(eventType, content)
  } catch (error) {
    malformedEventCount += 1
    logger.warn('丢弃畸形 lowcode SSE 事件', {
      eventType: event.event,
      totalMalformed: malformedEventCount,
      error: errorMessage(error),
    })
  }
}

function parseEventContent(content: string): unknown {
  const normalized = content.trim()
  if (normalized === '') return ''
  try {
    return JSON.parse(normalized)
  } catch {
    return content
  }
}

function readEnvelopeName(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload['event'])) return null
  return typeof payload['event']['name'] === 'string' && payload['event']['name'].trim() !== ''
    ? payload['event']['name']
    : null
}

function dispatchPayload(eventType: string, parsed: unknown): void {
  const rawData = typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
  const envelopeEvent = normalizeServerEnvelopeEvent(eventType, rawData, parsed)
  dispatchEnvelopeEvent(eventType, envelopeEvent)

  if (!eventSubscribers.has(eventType)) return
  const data = unwrapServerEventPayload(eventType, parsed)
  const subscribers = eventSubscribers.get(eventType)
  if (subscribers === undefined) return

  for (const callback of subscribers) {
    callback(data)
  }
}

function teardownConnection(): void {
  sharedSubscription?.close()
  sharedSubscription = null
  sharedReadyPromise = null
  resolveSharedReady = null
  rejectSharedReady = null
}

function totalSubscribers(): number {
  let count = allEnvelopeEventSubscribers.size
  for (const subscribers of eventSubscribers.values()) {
    count += subscribers.size
  }
  for (const subscribers of envelopeEventSubscribers.values()) {
    count += subscribers.size
  }
  return count
}

// Envelope compatibility ----------------------------------------------------

function unwrapServerEventPayload(eventType: string, payload: unknown): unknown {
  if (!isRecord(payload)) {
    warnLegacyProtocolOnce(eventType, 'plain')
    return payload
  }

  if (!isEnvelopeLike(payload)) {
    warnLegacyProtocolOnce(eventType, 'plain')
    return payload
  }

  const protocolVersion = payload['protocolVersion']
  if (protocolVersion !== 4) {
    warnLegacyProtocolOnce(eventType, typeof protocolVersion === 'number' ? `v${protocolVersion}` : 'legacy')
  }

  validateEnvelopeEventName(eventType, payload)

  if (payload['ok'] === true) {
    return payload['data']
  }

  throw new Error(readEnvelopeErrorMessage(payload))
}

function dispatchEnvelopeEvent(eventType: string, event: AiAgentAppSseEvent): void {
  for (const callback of allEnvelopeEventSubscribers) callback(event)
  const subscribers = envelopeEventSubscribers.get(eventType)
  if (subscribers === undefined) return

  for (const callback of subscribers) {
    callback(event)
  }
}

function normalizeServerEnvelopeEvent(
  eventType: string,
  rawData: string,
  payload: unknown,
): AiAgentAppSseEvent {
  if (!isRecord(payload) || !isEnvelopeLike(payload)) {
    return {
      name: eventType,
      ok: true,
      data: payload,
      rawData,
      rawPayload: payload,
    }
  }

  validateEnvelopeEventName(eventType, payload)
  const protocolVersion = payload['protocolVersion']
  const ok = payload['ok'] === true
  const context: ApiEnvelopeContext | undefined = isRecord(payload['context']) ? payload['context'] : undefined
  const envelopeEvent: ApiEnvelopeEvent | undefined = isRecord(payload['event']) ? payload['event'] : undefined
  return {
    name: eventType,
    ok,
    data: ok ? payload['data'] : (payload['error'] ?? payload),
    rawData,
    rawPayload: payload,
    ...(typeof protocolVersion === 'number' ? { protocolVersion } : {}),
    ...(context !== undefined ? { context } : {}),
    ...(envelopeEvent !== undefined ? { event: envelopeEvent } : {}),
  }
}

function isEnvelopeLike(payload: Record<string, unknown>): boolean {
  const ok = payload['ok']
  const hasData = Object.prototype.hasOwnProperty.call(payload, 'data')
  const hasError = Object.prototype.hasOwnProperty.call(payload, 'error')
  return (
    typeof ok === 'boolean'
    && (ok ? hasData : hasError)
  )
}

function validateEnvelopeEventName(eventType: string, payload: Record<string, unknown>): void {
  const event = payload['event']
  if (!isRecord(event)) return

  const transport = event['transport']
  if (transport !== undefined && transport !== 'sse') {
    throw new Error(`SSE envelope transport mismatch: ${String(transport)}`)
  }

  const envelopeName = event['name']
  if (envelopeName !== undefined && envelopeName !== eventType) {
    throw new Error(`SSE event name mismatch: frame=${eventType}, envelope=${String(envelopeName)}`)
  }
}

function readEnvelopeErrorMessage(payload: Record<string, unknown>): string {
  const error = isRecord(payload['error']) ? payload['error'] : null
  return typeof error?.['message'] === 'string' && error['message'].trim() !== ''
    ? error['message']
    : 'SSE server event failed'
}

function warnLegacyProtocolOnce(eventType: string, protocol: string): void {
  const key = `${eventType}:${protocol}`
  if (legacyProtocolWarnings.has(key)) return
  legacyProtocolWarnings.add(key)
  logger.warn('收到旧版 SSE 事件载荷，已走兼容解包路径', { eventType, protocol })
}

// Typed event normalization -------------------------------------------------

type TypedServerEventSubscription<T> = Readonly<{
  eventType: string
  normalize: EventNormalizer<T>
  label: string
  callback: (event: T) => void
}>

function onTypedServerEvent<T>(subscription: TypedServerEventSubscription<T>): () => void {
  const { eventType, normalize, label, callback } = subscription
  return onServerEvent(eventType, (data) => {
    const event = normalize(data)
    if (event === null) {
      reportMalformedTypedEvent(label)
      return
    }
    callback(event)
  })
}

function reportMalformedTypedEvent(label: string): void {
  malformedEventCount += 1
  logger.warn(`丢弃畸形${label}事件`, {
    totalMalformed: malformedEventCount,
  })
}

function normalizeFileChangeEvent(data: unknown): FileChangeEvent | null {
  if (!isRecord(data)) return null

  const pageId = data['pageId']
  const file = data['file']
  if (typeof pageId !== 'string' || typeof file !== 'string') return null

  return {
    pageId,
    file,
    timestamp: normalizeTimestamp(data['timestamp']),
  }
}

function normalizeDataBatchJobEvent(data: unknown): DataBatchJobEvent | null {
  if (!isRecord(data)) return null

  const tenantId = data['tenantId']
  const projectId = data['projectId']
  const jobId = data['jobId']
  const status = data['status']
  if (
    typeof tenantId !== 'string'
    || typeof projectId !== 'string'
    || typeof jobId !== 'string'
    || typeof status !== 'string'
  ) {
    return null
  }

  const event: DataBatchJobEvent = {
    tenantId,
    projectId,
    jobId,
    status,
    completed: normalizeNumber(data['completed']),
    total: normalizeNumber(data['total']),
    timestamp: normalizeTimestamp(data['timestamp']),
  }
  if ('result' in data) event.result = data['result']
  if (typeof data['error'] === 'string') event.error = data['error']
  return event
}

function normalizeDataChangeEvent(data: unknown): DataChangeEvent | null {
  if (!isRecord(data)) return null

  const tenantId = data['tenantId']
  const projectId = data['projectId']
  const tableName = data['tableName']
  const operation = data['operation']
  if (
    typeof tenantId !== 'string'
    || typeof projectId !== 'string'
    || typeof tableName !== 'string'
    || typeof operation !== 'string'
  ) {
    return null
  }

  const event: DataChangeEvent = {
    tenantId,
    projectId,
    tableName,
    operation,
    timestamp: normalizeTimestamp(data['timestamp']),
  }
  if (typeof data['jobId'] === 'string') event.jobId = data['jobId']
  return event
}

function normalizeNotificationEvent(data: unknown): ServerNotificationEvent | null {
  if (!isRecord(data)) return null

  const message = readRequiredString(data, 'message')
  if (message === null) return null

  const event: ServerNotificationEvent = {
    title: readNonEmptyStringProperty(data, 'title') ?? '通知',
    message,
    timestamp: normalizeTimestamp(data['timestamp']),
  }
  const notificationId = readNonEmptyStringProperty(data, 'notificationId') ?? readNonEmptyStringProperty(data, 'id')
  const level = readNonEmptyStringProperty(data, 'level')
  const category = readNonEmptyStringProperty(data, 'category')
  const source = readNonEmptyStringProperty(data, 'source')
  const actionUrl = readNonEmptyStringProperty(data, 'actionUrl') ?? readNonEmptyStringProperty(data, 'url')

  if (notificationId !== undefined) event.notificationId = notificationId
  if (level !== undefined) event.level = level
  if (category !== undefined) event.category = category
  if (source !== undefined) event.source = source
  if (actionUrl !== undefined) event.actionUrl = actionUrl
  return event
}

// Scalar readers ------------------------------------------------------------


function normalizeTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return Date.now()
}

function normalizeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function readRequiredString(data: Record<string, unknown>, key: string): string | null {
  return readNonEmptyStringProperty(data, key) ?? null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
