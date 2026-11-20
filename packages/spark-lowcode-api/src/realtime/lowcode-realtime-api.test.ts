import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { describe, expect, it } from 'vitest'

import { LowcodeApi } from '../lowcode-api.js'

class RealtimeFixtureHttpClient extends HttpClientBase {
  public requests: RequestConfig[] = []

  protected override async executeRequest(_config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(_config)
    return { data: { Code: 200, Result: null }, status: 200, statusText: 'OK', headers: {} }
  }
}

class AgentFixtureHttpClient extends HttpClientBase {
  public requests: RequestConfig[] = []

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    if (config.url === '/api/ai/turns') {
      return {
        data: {
          Code: 200,
          Result: {
            protocolVersion: 4,
            ok: true,
            data: { sessionId: 'S1', turnId: 'T1' },
            event: { channel: 'http', name: 'response', terminal: true },
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
      }
    }
    return {
      data: {
        protocolVersion: 4,
        ok: true,
        event: { channel: 'http', name: 'response', terminal: true },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
}

class MessageFixtureHttpClient extends HttpClientBase {
  public requests: RequestConfig[] = []

  public constructor(private readonly result: unknown, private readonly code = 200) {
    super()
  }

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    return { data: { Code: this.code, Message: 'fail', Result: this.result }, status: 200, statusText: 'OK', headers: {} }
  }
}

function saveSession(api: LowcodeApi): void {
  api.session.save({
    accessToken: 'access',
    refreshToken: 'refresh',
    accessExpiresAt: 1,
    refreshExpiresAt: 2,
    identity: {
      userId: 'U1', account: 'admin', displayName: 'Admin', enterpriseId: 'E1',
      enterpriseShortName: 'ENT', role: 'USER', raw: {},
    },
    enterprise: { id: 'E1', name: 'Enterprise', code: '企业', shortName: 'ENT', shortCode: '企', raw: {} },
  })
}

describe('LowcodeRealtimeApi notifications', () => {
  it('decodes backend JsonSseMessage by messageType regardless of title', () => {
    const api = new LowcodeApi({ http: new RealtimeFixtureHttpClient() })
    const frame = (messageType: string) => ({
      event: 'message',
      data: {
        rowId: 'M1', entShortName: 'ENT', receiverType: 'USER', receiverId: 'U1',
        title: '文档生成开始', content: '正在生成，请稍后...', messageType,
        sendMethods: 'SSE', createTime: '2026-10-17T10:00:00',
      },
    })

    expect(api.realtime.decodeNotification(frame('TIP'))).toEqual({
      messageType: 'TIP',
      title: '文档生成开始',
      content: '正在生成，请稍后...',
      createdAt: Date.parse('2026-10-17T10:00:00'),
      messageId: 'M1',
    })
    for (const type of ['SYSTEM_NOTIFICATION', 'SYSTEM_ERROR', 'USER_MESSAGE']) {
      expect(api.realtime.decodeNotification(frame(type))?.messageType).toBe(type)
    }
    for (const type of ['AI', 'SYSTEM_DOWNLOAD', 'SYSTEM_KICKOUT', 'ACKNOWLEDGMENT']) {
      expect(api.realtime.decodeNotification(frame(type))).toBeNull()
    }
    expect(api.realtime.decodeNotification({ event: 'connected', data: { connectionUid: 'C1' } })).toBeNull()
  })

  it('fetches offline messages for the session user only', async () => {
    const http = new MessageFixtureHttpClient([
      { entShortName: 'ENT', userId: 'U1', messageList: [
        { messageLogId: 'L1', rowid: 'M1', title: '你好', content: '在吗', messageType: 'USER_MESSAGE', createTime: '2026-10-17T09:00:00' },
        { messageLogId: 'L2', rowId: 'M2', title: '下载', content: '{}', messageType: 'SYSTEM_DOWNLOAD' },
      ] },
    ])
    const api = new LowcodeApi({ http })
    saveSession(api)

    await expect(api.realtime.fetchOfflineMessages()).resolves.toEqual([
      { messageType: 'USER_MESSAGE', title: '你好', content: '在吗', createdAt: Date.parse('2026-10-17T09:00:00'), messageId: 'M1', messageLogId: 'L1' },
    ])
    expect(http.requests[0]).toMatchObject({
      url: '/api/message/offlineMessages',
      method: 'POST',
      data: [{ entShortName: 'ENT', userId: 'U1' }],
    })
  })

  it('returns no offline messages when the backend omits the list', async () => {
    const api = new LowcodeApi({ http: new MessageFixtureHttpClient([{ entShortName: 'ENT', userId: 'U1', messageList: null }]) })
    saveSession(api)
    await expect(api.realtime.fetchOfflineMessages()).resolves.toEqual([])
  })

  it('fails fast on malformed offline responses and missing sessions', async () => {
    const malformed = new LowcodeApi({ http: new MessageFixtureHttpClient({ not: 'array' }) })
    saveSession(malformed)
    await expect(malformed.realtime.fetchOfflineMessages()).rejects.toThrow('不是数组')
    const anonymous = new LowcodeApi({ http: new MessageFixtureHttpClient([]) })
    await expect(anonymous.realtime.fetchOfflineMessages()).rejects.toThrow('没有 lowcode 会话')
  })

  it('confirms by message log ids with the session enterprise', async () => {
    const http = new MessageFixtureHttpClient('确认成功，确认消息数量: 2')
    const api = new LowcodeApi({ http })
    saveSession(api)

    await expect(api.realtime.confirmMessages([' L1 ', 'L2', ''])).resolves.toBe('确认成功，确认消息数量: 2')
    expect(http.requests[0]).toMatchObject({
      url: '/api/message/confirmMessages',
      method: 'POST',
      params: { entShortName: 'ENT' },
      data: ['L1', 'L2'],
    })
    await expect(api.realtime.confirmMessages([' '])).rejects.toThrow('至少一个')
  })

  it('surfaces backend business errors from confirmMessages', async () => {
    const api = new LowcodeApi({ http: new MessageFixtureHttpClient(null, 500) })
    saveSession(api)
    await expect(api.realtime.confirmMessages(['L1'])).rejects.toThrow('fail')
  })
})

describe('LowcodeRealtimeApi', () => {
  it('opens authenticated SSE and parses named JSON events', async () => {
    const chunks = new TextEncoder().encode('event: connected\ndata: {"connectionUid":"C1"}\n\ndata: {"messageType":"AI"}\n\n')
    let request: Readonly<{ input: RequestInfo | URL; init?: RequestInit }> | null = null
    const api = new LowcodeApi({
      http: new RealtimeFixtureHttpClient(),
      fetch: async (input, init) => {
        request = { input, ...(init === undefined ? {} : { init }) }
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(chunks)
            controller.close()
          },
        }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
      },
    })
    api.session.save({
      accessToken: 'access',
      refreshToken: 'refresh',
      accessExpiresAt: 1,
      refreshExpiresAt: 2,
      identity: {
        userId: 'U1', account: 'admin', displayName: 'Admin', enterpriseId: 'E1',
        enterpriseShortName: 'ENT', role: 'USER', raw: {},
      },
      enterprise: { id: 'E1', name: 'Enterprise', code: '企业', shortName: 'ENT', shortCode: '企', raw: {} },
    })
    const events: unknown[] = []

    const subscription = api.realtime.connect({ scope: 'app 1', onEvent: (event) => events.push(event) })
    await subscription.closed

    expect(request).toMatchObject({
      input: '/api/sse/connect?scope=app%201',
      init: { headers: { Accept: 'text/event-stream', Authorization: 'Bearer access' } },
    })
    expect(events).toEqual([
      { event: 'connected', data: { connectionUid: 'C1' } },
      { event: 'message', data: { messageType: 'AI' } },
    ])
  })

  it('starts Agent turns and appends tool results with source endpoint contracts', async () => {
    const http = new AgentFixtureHttpClient()
    const api = new LowcodeApi({ http })

    await expect(api.realtime.startAgentTurn({ agentId: 'A1', message: 'hello' })).resolves.toEqual({
      sessionId: 'S1',
      turnId: 'T1',
    })
    await api.realtime.appendAgentToolResults({
      sessionId: 'S1',
      turnId: 'T1',
      toolResults: [{ toolCallId: 'C1', toolName: 'read_page', result: '{"ok":true}' }],
    })

    expect(http.requests).toEqual([
      expect.objectContaining({
        url: '/api/ai/turns',
        method: 'POST',
        data: { agentId: 'A1', sessionId: '', message: 'hello' },
      }),
      expect.objectContaining({
        url: '/api/ai/sessions/S1/turn/append',
        method: 'POST',
        data: {
          turnId: 'T1',
          toolResults: [{ toolCallId: 'C1', toolName: 'read_page', result: '{"ok":true}' }],
        },
      }),
    ])
  })

  it('decodes nested JsonSseMessage Agent envelopes', () => {
    const api = new LowcodeApi({ http: new RealtimeFixtureHttpClient() })

    expect(api.realtime.decodeAgentEvent({
      event: 'message',
      data: {
        messageType: 'AI',
        content: JSON.stringify({
          protocolVersion: 4,
          ok: true,
          data: { content: 'delta' },
          context: { session: { sessionId: 'S1' }, turn: { turnId: 'T1', seq: 2 } },
          event: { channel: 'sse', name: 'llm-frame', terminal: false },
        }),
      },
    })).toMatchObject({
      name: 'llm-frame',
      sessionId: 'S1',
      turnId: 'T1',
      sequence: 2,
      terminal: false,
      data: { content: 'delta' },
    })
  })

  it('normalizes SYSTEM_DOWNLOAD receipts without leaking the raw SSE message shape', () => {
    const api = new LowcodeApi({ http: new RealtimeFixtureHttpClient() })

    expect(api.realtime.decodeSystemDownload({
      event: 'message',
      data: {
        title: '文档上传完成',
        messageType: 'SYSTEM_DOWNLOAD',
        content: JSON.stringify({ filePath: '/docs/a.docx', fileName: '需求说明书.docx', appType: 'all' }),
      },
    })).toEqual({
      title: '文档上传完成',
      filePath: '/docs/a.docx',
      fileName: '需求说明书.docx',
      appType: 'all',
    })
  })
})
