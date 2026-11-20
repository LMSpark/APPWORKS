import { describe, expect, it } from 'vitest'

import { HttpClientBase } from '../http/HttpClientBase'
import type { HttpResponse, RequestConfig } from '../http/types'

class CapturingHttpClient extends HttpClientBase {
  public captured: RequestConfig | null = null
  public responseData: unknown = null

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.captured = config
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
})
