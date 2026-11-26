import { describe, expect, it, vi } from 'vitest'

import { HttpClientBase } from '../http/HttpClientBase'
import type { HttpResponse, RequestConfig, RequestError } from '../http/types'

class CapturingHttpClient extends HttpClientBase {
  public captured: RequestConfig | null = null
  public responseData: unknown = null
  public transportError: Error | null = null

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.captured = config
    if (this.transportError !== null) throw this.transportError
    return { data: this.responseData, status: 200, statusText: 'OK', headers: {} }
  }
}

describe('HttpClientBase request URL ownership', () => {
  it('does not rewrite an endpoint that repeats the configured baseURL', async () => {
    const client = new CapturingHttpClient({ baseURL: '/api' })

    await client.get('/api/users')

    expect(client.captured).toMatchObject({ baseURL: '/api', url: '/api/users' })
  })

  it('unwraps only the current v4 envelope contract', async () => {
    const client = new CapturingHttpClient()
    client.responseData = {
      protocolVersion: 4,
      ok: true,
      data: { id: 'current' },
      context: { requestId: 'request-current' },
    }

    await expect(client.get('/current')).resolves.toEqual({ id: 'current' })
  })

  it('does not reinterpret a root-requestId payload as a current envelope', async () => {
    const client = new CapturingHttpClient()
    client.responseData = {
      ok: true,
      data: { id: 'removed-shape' },
      requestId: 'request-removed',
    }

    await expect(client.get('/removed-shape')).resolves.toEqual(client.responseData)
  })

  it.each(['preparation', 'dispatch check', 'adapter'] as const)('records whether the request reached transport: %s', async failureAt => {
    const dispatched = failureAt === 'adapter'
    const client = new CapturingHttpClient()
    client.transportError = new Error('adapter failure')
    const prepared = { url: '/failure', meta: { fixture: true } }
    const onTransportAttempt = vi.fn<(started: boolean) => void>()
    const onResponseError = vi.fn((error: RequestError) => error)
    client.interceptors.request.use({
      onRequest: () => {
        if (failureAt === 'preparation') throw new Error('request refused')
        return prepared
      },
      beforeDispatch: () => {
        if (failureAt === 'dispatch check') throw new Error('scope changed before transport')
      },
    })
    client.interceptors.response.use({ onResponseError })

    await expect(client.get('/failure', undefined, { onTransportAttempt })).rejects.toThrow(
      failureAt === 'preparation' ? 'request refused' : dispatched ? 'adapter failure' : 'scope changed before transport',
    )
    expect(client.captured).toBe(dispatched ? prepared : null)
    expect(onTransportAttempt.mock.calls).toEqual(dispatched ? [[false], [true]] : [[false]])
    const failure = onResponseError.mock.calls[0]?.[0]
    expect(failure?.name).toBe('RequestError')
    expect(onResponseError).toHaveBeenCalledExactlyOnceWith(failure, dispatched ? prepared : undefined)
  })
})
