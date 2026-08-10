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
