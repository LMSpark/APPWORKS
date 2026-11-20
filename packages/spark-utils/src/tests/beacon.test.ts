import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendBeacon } from '@spark-appworks/spark-utils'

describe('sendBeacon', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses navigator.sendBeacon when available', async () => {
    const nativeBeacon = vi.fn<(url: string, data: Blob) => boolean>(() => true)
    const fallbackFetch = vi.fn()
    vi.stubGlobal('navigator', { sendBeacon: nativeBeacon })
    vi.stubGlobal('fetch', fallbackFetch)

    expect(sendBeacon('/logs/batch', { logs: [] })).toBe(true)

    expect(nativeBeacon).toHaveBeenCalledTimes(1)
    expect(nativeBeacon.mock.calls[0]?.[0]).toBe('/logs/batch')
    const body = nativeBeacon.mock.calls[0]?.[1]
    expect(body).toBeInstanceOf(Blob)
    if (!(body instanceof Blob)) throw new Error('Expected beacon payload Blob')
    expect(await body.text()).toBe('{"logs":[]}')
    expect(fallbackFetch).not.toHaveBeenCalled()
  })

  it('falls back to keepalive fetch and resolves baseURL', () => {
    const nativeBeacon = vi.fn(() => false)
    const fallbackFetch = vi.fn(() => Promise.resolve(new Response()))
    vi.stubGlobal('navigator', { sendBeacon: nativeBeacon })
    vi.stubGlobal('fetch', fallbackFetch)

    expect(sendBeacon('/logs/batch', { logs: [] }, '/api/')).toBe(true)

    expect(fallbackFetch).toHaveBeenCalledWith('/api/logs/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"logs":[]}',
      keepalive: true,
    })
  })

  it('returns false when no browser sender exists', () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('fetch', undefined)

    expect(sendBeacon('/logs/batch', { logs: [] })).toBe(false)
  })
})
