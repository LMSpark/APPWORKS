/**
 * lowcode 实时通道与 AI 门面：SSE 连接、AI chat/turn 与事件解码。
 * SSE 依赖构造时注入的 fetch 与会话 Bearer；Agent 响应须为 SparkEnvelope v4。
 */
import type { HttpClientBase } from '@spark-appworks/spark-utils'

import { LowcodeApiError } from '../core/lowcode-api-error.js'
import { LowcodeClient } from '../core/lowcode-client.js'
import type { LowcodeSessionStore } from '../platform/lowcode-session-store.js'

/** SSE 原始事件；data 经 JSON 解析失败时保留字符串。 */
export type LowcodeRealtimeEvent = Readonly<{
  event: string
  data: unknown
}>

/** SparkEnvelope v4 协议壳；ok=false 或 protocolVersion≠4 时解码 fail-fast。 */
export type LowcodeSparkEnvelope<TData = unknown> = Readonly<{
  protocolVersion: number
  ok: boolean
  data?: TData
  error?: Readonly<{ code?: string; message?: string }>
  context?: Readonly<Record<string, unknown>>
  event?: Readonly<{ channel?: string; name?: string; terminal?: boolean }>
}>

/** Agent turn 启动输入；sessionId 可空表示由服务端分配新会话。 */
export type LowcodeAgentTurnInput = Readonly<{
  agentId: string
  sessionId?: string
  message: string
}>

/** Agent turn 启动回执；后续 SSE 与 append 须使用同一 sessionId/turnId。 */
export type LowcodeAgentTurnAck = Readonly<{
  sessionId: string
  turnId: string
}>

/** 单条 Agent 工具执行结果；toolCallId/toolName 提交前 trim 并校验非空。 */
export type LowcodeAgentToolResult = Readonly<{
  toolCallId: string
  toolName: string
  result: string
}>

/** Agent 工具结果追加输入；走 /api/ai/sessions/{sessionId}/turn/append，toolResults 不可空。 */
export type LowcodeAgentToolAppendInput = Readonly<{
  sessionId: string
  turnId: string
  toolResults: readonly LowcodeAgentToolResult[]
}>

/** 从 AI SSE 解码的结构化 Agent 事件；非 AI messageType 时 decodeAgentEvent 返回 null。 */
export type LowcodeAgentEvent = Readonly<{
  name: string
  sessionId: string
  turnId: string
  terminal: boolean
  sequence?: number
  data: unknown
  raw: LowcodeSparkEnvelope
}>

/** SYSTEM_DOWNLOAD SSE 解码结果；filePath/fileName/appType 缺失时抛错。 */
export type LowcodeSystemDownload = Readonly<{
  title: string
  filePath: string
  fileName: string
  appType: string
}>

/** SSE 订阅句柄；close 触发 AbortController，closed 在流结束或中断后 resolve。 */
export type LowcodeRealtimeSubscription = Readonly<{
  closed: Promise<void>
  close(): void
}>

/** SSE 连接选项；scope 可选，映射 /api/sse/connect?scope= 查询参数。 */
export type LowcodeRealtimeConnectOptions = Readonly<{
  scope?: string
  onEvent(event: LowcodeRealtimeEvent): void
}>

/** AI chat 输入；POST /api/ai/chat，taskId 与 query 均须非空。 */
export type LowcodeAiChatInput = Readonly<{
  taskId: string
  conversationId?: string
  query: string
}>

/** 浏览器 fetch 注入类型；SSE 连接必须使用支持 ReadableStream 的 fetch 实现。 */
export type LowcodeFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

type LowcodeRealtimeStreamInput = Readonly<{
  fetcher: LowcodeFetch
  url: string
  accessToken: string
  signal: AbortSignal
  onEvent(event: LowcodeRealtimeEvent): void
}>

function decodeEventData(value: string): unknown {
  const normalized = value.trim()
  if (!normalized) return ''
  try {
    return JSON.parse(normalized)
  } catch {
    return normalized
  }
}

function dispatchFrame(frame: string, onEvent: (event: LowcodeRealtimeEvent) => void): void {
  let event = 'message'
  const data: string[] = []
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim() || 'message'
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  if (data.length > 0) onEvent({ event, data: decodeEventData(data.join('\n')) })
}

/** lowcode SSE 与 AI HTTP 门面；构造时须注入 session 与可选 fetch，否则 connect 不可用。 */
export class LowcodeRealtimeApi {
  private readonly client: LowcodeClient

  public constructor(
    private readonly http: HttpClientBase,
    private readonly session: LowcodeSessionStore,
    private readonly fetcher: LowcodeFetch | undefined,
  ) {
    this.client = new LowcodeClient(http)
  }

  /** 发起 AI chat；POST /api/ai/chat，fire-and-forget，不等待 SSE 回执。 */
  public async chat(input: LowcodeAiChatInput): Promise<void> {
    const taskId = input.taskId.trim()
    const query = input.query.trim()
    if (!taskId || !query) throw new LowcodeApiError(0, 'AI chat 的 taskId 和 query 不能为空')
    await this.client.requestResult({
      path: '/api/ai/chat',
      method: 'POST',
      data: {
        taskId,
        conversationId: input.conversationId?.trim() ?? '',
        query,
      },
    })
  }

  /** 启动 Agent turn；POST /api/ai/turns，响应须含 sessionId 与 turnId。 */
  public async startAgentTurn(input: LowcodeAgentTurnInput): Promise<LowcodeAgentTurnAck> {
    const agentId = input.agentId.trim()
    const message = input.message.trim()
    if (!agentId || !message) throw new LowcodeApiError(0, 'Agent turn 的 agentId 和 message 不能为空')
    const result = await this.client.requestResult({
      path: '/api/ai/turns',
      method: 'POST',
      data: {
        agentId,
        sessionId: input.sessionId?.trim() ?? '',
        message,
      },
    })
    const envelope = readSparkEnvelope(result)
    const data = readRecord(envelope.data)
    const sessionId = readText(data?.['sessionId'])
    const turnId = readText(data?.['turnId'])
    if (sessionId === undefined || turnId === undefined) {
      throw new LowcodeApiError(0, 'lowcode Agent turn 响应缺少 sessionId 或 turnId')
    }
    return { sessionId, turnId }
  }

  /** 追加 Agent 工具结果；POST /api/ai/sessions/{sessionId}/turn/append，响应须为 ok 的 SparkEnvelope v4。 */
  public async appendAgentToolResults(input: LowcodeAgentToolAppendInput): Promise<void> {
    const sessionId = input.sessionId.trim()
    const turnId = input.turnId.trim()
    if (!sessionId || !turnId || input.toolResults.length === 0) {
      throw new LowcodeApiError(0, 'Agent 工具结果缺少 sessionId、turnId 或 toolResults')
    }
    const response = await this.http.request<unknown>({
      url: `/api/ai/sessions/${encodeURIComponent(sessionId)}/turn/append`,
      method: 'POST',
      data: {
        turnId,
        toolResults: input.toolResults.map(normalizeToolResult),
      },
    })
    readSparkEnvelope(response)
  }

  /** 解码 AI SSE 事件；messageType≠AI 或 content 非 JSON 时返回 null 或抛错。 */
  public decodeAgentEvent(event: LowcodeRealtimeEvent): LowcodeAgentEvent | null {
    const message = readRecord(event.data)
    if (message === null || readText(message['messageType']) !== 'AI') return null
    const content = readText(message['content'])
    if (content === undefined) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      throw new LowcodeApiError(0, 'lowcode AI SSE content 不是有效 JSON')
    }
    const envelope = readSparkEnvelope(parsed)
    const context = readRecord(envelope.context)
    const session = readRecord(context?.['session'])
    const turn = readRecord(context?.['turn'])
    const sessionId = readText(session?.['sessionId'])
    const turnId = readText(turn?.['turnId'])
    const name = readText(envelope.event?.['name'])
    if (sessionId === undefined || turnId === undefined || name === undefined) {
      throw new LowcodeApiError(0, 'lowcode AI SSE envelope 缺少事件上下文')
    }
    const sequence = typeof turn?.['seq'] === 'number' ? turn['seq'] : undefined
    return {
      name,
      sessionId,
      turnId,
      terminal: envelope.event?.['terminal'] === true,
      ...(sequence === undefined ? {} : { sequence }),
      data: envelope.data,
      raw: envelope,
    }
  }

  /** 解码 SYSTEM_DOWNLOAD SSE 事件；非匹配 messageType 时返回 null。 */
  public decodeSystemDownload(event: LowcodeRealtimeEvent): LowcodeSystemDownload | null {
    const message = readRecord(event.data)
    if (message === null || readText(message['messageType']) !== 'SYSTEM_DOWNLOAD') return null
    const content = readText(message['content'])
    if (content === undefined) throw new LowcodeApiError(0, 'SYSTEM_DOWNLOAD 缺少 content')
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      throw new LowcodeApiError(0, 'SYSTEM_DOWNLOAD content 不是有效 JSON')
    }
    const download = readRecord(parsed)
    const filePath = readText(download?.['filePath'])
    const fileName = readText(download?.['fileName'])
    const appType = readText(download?.['appType'])
    if (filePath === undefined || fileName === undefined || appType === undefined) {
      throw new LowcodeApiError(0, 'SYSTEM_DOWNLOAD 缺少 filePath、fileName 或 appType')
    }
    return {
      title: readText(message['title']) ?? '文档下载',
      filePath,
      fileName,
      appType,
    }
  }

  /** 建立 SSE 长连接；GET /api/sse/connect，无 fetch 或无会话时 fail-fast。 */
  public connect(options: LowcodeRealtimeConnectOptions): LowcodeRealtimeSubscription {
    const fetcher = this.fetcher
    if (fetcher === undefined) throw new LowcodeApiError(0, '当前环境没有可用的 fetch，无法建立 lowcode SSE')
    const session = this.session.get()
    if (session === null) throw new LowcodeApiError(401, '没有 lowcode 会话，无法建立 SSE')
    const abort = new AbortController()
    const scope = options.scope?.trim()
    const url = scope ? `/api/sse/connect?scope=${encodeURIComponent(scope)}` : '/api/sse/connect'
    const closed = this.readStream({
      fetcher,
      url,
      accessToken: session.accessToken,
      signal: abort.signal,
      onEvent: options.onEvent,
    })
    return { closed, close: () => abort.abort() }
  }

  private async readStream(input: LowcodeRealtimeStreamInput): Promise<void> {
    const { fetcher, url, accessToken, signal, onEvent } = input
    const response = await fetcher(url, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${accessToken}`,
      },
      signal,
    })
    if (!response.ok) throw new LowcodeApiError(response.status, `lowcode SSE 连接失败：${response.status}`)
    if (response.body === null) throw new LowcodeApiError(0, 'lowcode SSE 响应没有可读流')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let done = false
    while (!done) {
      const chunk = await reader.read()
      done = chunk.done
      if (done) continue
      buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        dispatchFrame(buffer.slice(0, boundary), onEvent)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) dispatchFrame(buffer, onEvent)
  }
}

function normalizeToolResult(result: LowcodeAgentToolResult): LowcodeAgentToolResult {
  const toolCallId = result.toolCallId.trim()
  const toolName = result.toolName.trim()
  if (!toolCallId || !toolName) throw new LowcodeApiError(0, 'Agent 工具结果缺少 toolCallId 或 toolName')
  return { toolCallId, toolName, result: result.result }
}

function readSparkEnvelope(value: unknown): LowcodeSparkEnvelope {
  const record = readRecord(value)
  if (record === null) {
    throw new LowcodeApiError(0, 'lowcode 响应不是 SparkEnvelope v4')
  }
  if (record['protocolVersion'] !== 4 || typeof record['ok'] !== 'boolean') {
    throw new LowcodeApiError(0, 'lowcode 响应不是 SparkEnvelope v4')
  }
  if (record['ok'] !== true) {
    const error = readRecord(record['error'])
    throw new LowcodeApiError(0, readText(error?.['message']) ?? 'lowcode Agent 请求失败')
  }
  const event = readRecord(record['event'])
  const context = readRecord(record['context'])
  const channel = readText(event?.['channel'])
  const name = readText(event?.['name'])
  const terminal = event?.['terminal']
  return {
    protocolVersion: 4,
    ok: true,
    ...(record['data'] === undefined ? {} : { data: record['data'] }),
    ...(context === null ? {} : { context }),
    ...(event === null ? {} : {
      event: {
        ...(channel === undefined ? {} : { channel }),
        ...(name === undefined ? {} : { name }),
        ...(typeof terminal !== 'boolean' ? {} : { terminal }),
      },
    }),
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length === 0 ? undefined : normalized
}
