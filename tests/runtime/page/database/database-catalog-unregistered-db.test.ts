import {beforeEach, describe, expect, it, vi} from 'vitest'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {fetchUnregisteredDatabaseNames} from '@/lowcode/resources/database/database-catalog-unregistered-db'

class TestHttp extends HttpClientBase {
  requests: RequestConfig[] = []
  response: string[] = ['PhysA', 'PhysB']

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    return {data: this.response, status: 200, statusText: 'OK', headers: {}}
  }
}

let http: TestHttp
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
}))

beforeEach(() => {
  http = new TestHttp()
})

describe('fetchUnregisteredDatabaseNames', () => {
  it('calls Db API with encoded server id', async () => {
    const names = await fetchUnregisteredDatabaseNames('srv-1')
    expect(names).toEqual(['PhysA', 'PhysB'])
    expect(http.requests[0]?.url).toBe('/api/Db/getUnregisteredDb/srv-1')
  })

  it('rejects empty server id', async () => {
    await expect(fetchUnregisteredDatabaseNames('  ')).rejects.toThrow(/缺少服务器/)
  })
})
