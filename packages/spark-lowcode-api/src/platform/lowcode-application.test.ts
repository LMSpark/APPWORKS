import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { describe, expect, it } from 'vitest'

import { LowcodeApi } from '../lowcode-api.js'

class ApplicationFixtureHttpClient extends HttpClientBase {
  public readonly requests: RequestConfig[] = []
  private readonly fixtures: unknown[]

  public constructor(...fixtures: unknown[]) {
    super()
    this.fixtures = fixtures
  }

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    return {
      data: this.fixtures.shift(),
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
}

describe('lowcode applications', () => {
  it('queries the existing application catalog with its established FormKey', async () => {
    const http = new ApplicationFixtureHttpClient({
      Code: 200,
      Result: {
        data: {
          Items: [{
            rowid: 'APP-1',
            AppName: 'payroll',
            AppDesc: '薪资系统',
            EntId: 'ENT-1',
            EntShortName: 'Lingma',
            IsSys: 1,
          }],
        },
        allowAdd: false,
      },
    })

    const applications = await new LowcodeApi({ http }).platform.listApplications()

    expect(http.requests[0]).toMatchObject({
      url: '/api/DataOperation/GetData',
      method: 'POST',
      headers: { 'x-FormKey': '7AB874097A1E8711A42FD845939A6E05' },
    })
    expect(applications).toEqual([{
      id: 'APP-1',
      code: 'payroll',
      name: '薪资系统',
      description: '薪资系统',
      enterpriseId: 'ENT-1',
      enterpriseShortName: 'Lingma',
      isDefault: true,
    }])
  })

  it('resolves the unique persisted navigation root instead of inventing an identity', async () => {
    const http = new ApplicationFixtureHttpClient({
      Code: 200,
      Result: { Items: [{ rowid: 'ROOT-1', SysId: 'APP-1', prowId: '000000' }] },
    })

    const rootId = await new LowcodeApi({ http }).platform.resolveNavigationRootId('APP-1')

    expect(rootId).toBe('ROOT-1')
    expect(http.requests[0]?.data).toMatchObject({
      Table: [expect.objectContaining({ Name: 'Base_NavigationInfo' })],
    })
  })
})
