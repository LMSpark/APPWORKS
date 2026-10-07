import type { LowcodeRealtimeEvent } from '@spark-appworks/spark-lowcode-api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const realtime = vi.hoisted(() => ({
  connect: vi.fn(),
  onEvent: null as ((event: LowcodeRealtimeEvent) => void) | null,
  close: vi.fn(),
}))

vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {
    realtime: {
      connect: realtime.connect,
    },
  },
}))

describe('lowcode SSE bridge', () => {
  let stopSubscription: (() => void) | undefined

  beforeEach(() => {
    realtime.onEvent = null
    realtime.close.mockReset()
    realtime.connect.mockReset().mockImplementation((options: { onEvent(event: LowcodeRealtimeEvent): void }) => {
      realtime.onEvent = options.onEvent
      return { closed: new Promise<void>(() => undefined), close: realtime.close }
    })
  })

  afterEach(() => {
    stopSubscription?.()
    stopSubscription = undefined
    vi.resetModules()
  })

  it('waits for the authenticated lowcode connected event', async () => {
    const sse = await import('@/services/sse-events')
    stopSubscription = sse.onAnyServerEnvelopeEvent(() => undefined)
    const pending = sse.waitForAppSseConnection(1_000)

    expect(realtime.connect).toHaveBeenCalledWith(expect.objectContaining({ scope: 'spark-appworks' }))
    realtime.onEvent?.({ event: 'connected', data: { connectionUid: 'C1' } })

    await expect(pending).resolves.toBeUndefined()
  })

  it('unwraps SparkEnvelope messages carried by lowcode JsonSseMessage', async () => {
    const sse = await import('@/services/sse-events')
    const callback = vi.fn()
    stopSubscription = sse.onAnyServerEnvelopeEvent(callback)
    realtime.onEvent?.({ event: 'connected', data: { connectionUid: 'C1' } })

    realtime.onEvent?.({
      event: 'message',
      data: {
        messageType: 'AI',
        title: 'turn-1',
        content: JSON.stringify({
          protocolVersion: 4,
          ok: true,
          data: {
            text: '完成',
          },
          context: { requestId: 'server-event-1' },
          event: { channel: 'ai', name: 'llm-frame', terminal: false },
        }),
      },
    })

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      name: 'llm-frame',
      ok: true,
      data: { text: '完成' },
    }))
  })

  it('delivers current plain business messages without treating them as envelopes', async () => {
    const sse = await import('@/services/sse-events')
    const callback = vi.fn()
    stopSubscription = sse.onNotificationEvent(callback)

    realtime.onEvent?.({
      event: 'message',
      data: {
        messageType: 'BUSINESS',
        title: 'notification',
        content: JSON.stringify({
          title: '任务完成',
          message: '数据同步完成',
          timestamp: 1,
        }),
      },
    })

    expect(callback).toHaveBeenCalledWith({
      title: '任务完成',
      message: '数据同步完成',
      timestamp: 1,
    })
  })

  it('rejects non-v4 SparkEnvelope messages instead of unwrapping them', async () => {
    const sse = await import('@/services/sse-events')
    const callback = vi.fn()
    stopSubscription = sse.onAnyServerEnvelopeEvent(callback)

    realtime.onEvent?.({
      event: 'message',
      data: {
        messageType: 'AI',
        title: 'llm-frame',
        content: JSON.stringify({
          protocolVersion: 3,
          ok: true,
          data: { text: '旧协议' },
          event: { channel: 'ai', name: 'llm-frame', terminal: false },
        }),
      },
    })

    expect(callback).not.toHaveBeenCalled()
  })

  it('closes the lowcode stream when the last subscriber leaves', async () => {
    const sse = await import('@/services/sse-events')
    stopSubscription = sse.onAnyServerEnvelopeEvent(() => undefined)
    stopSubscription()
    stopSubscription = undefined

    expect(realtime.close).toHaveBeenCalledOnce()
  })
})
