import type { HttpClientBase } from '@spark-appworks/spark-utils'

import { LowcodeApiError } from '../core/lowcode-api-error.js'
import { LowcodeClient } from '../core/lowcode-client.js'
import type { LowcodeSessionStore } from '../platform/lowcode-session-store.js'

export type LowcodeRealtimeEvent = Readonly<{
  event: string
  data: unknown
}>

export type LowcodeSparkEnvelope<TData = unknown> = Readonly<{
  protocolVersion: number
  ok: boolean
  data?: TData
  error?: Readonly<{ code?: string; message?: string }>
  context?: Readonly<Record<string, unknown>>
  event?: Readonly<{ channel?: string; name?: string; terminal?: boolean }>
}>

export type LowcodeAgentTurnInput = Readonly<{
  agentId: string
  sessionId?: string
  message: string
}>

export type LowcodeAgentTurnAck = Readonly<{
  sessionId: string
  turnId: string
}>

export type LowcodeAgentToolResult = Readonly<{
  toolCallId: string
  toolName: string
  result: string
}>

export type LowcodeAgentToolAppendInput = Readonly<{
  sessionId: string
  turnId: string
  toolResults: readonly LowcodeAgentToolResult[]
}>

export type LowcodeAgentEvent = Readonly<{
  name: string
  sessionId: string
  turnId: string
  terminal: boolean
  sequence?: number
  data: unknown
  raw: LowcodeSparkEnvelope
}>

export type LowcodeSystemDownload = Readonly<{
  title: string
  filePath: string
  fileName: string
  appType: string
}>

export type LowcodeRealtimeSubscription = Readonly<{
  closed: Promise<void>
  close(): void
}>

export type LowcodeRealtimeConnectOptions = Readonly<{
  scope?: string
  onEvent(event: LowcodeRealtimeEvent): void
}>

export type LowcodeAiChatInput = Readonly<{
  taskId: string
  conversationId?: string
  query: string
}>

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

export class LowcodeRealtimeApi {
  private readonly client: LowcodeClient

  public constructor(
    private readonly http: HttpClientBase,
    private readonly session: LowcodeSessionStore,
    private readonly fetcher: LowcodeFetch | undefined,
  ) {
    this.client = new LowcodeClient(http)
  }

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
