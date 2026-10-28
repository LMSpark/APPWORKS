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
  it('does not infer default or tenant metadata when the application row omits those fields', async () => {
    const http = new ApplicationFixtureHttpClient({
      Code: 200,
      Result: {Items: [{rowid: 'APP-2', AppName: 'beta', AppDesc: 'Beta'}]},
    })

    const [application] = await new LowcodeApi({http}).platform.listApplications()

    expect(application).toMatchObject({id: 'APP-2', code: 'beta', name: 'Beta', description: 'Beta'})
    expect(application).not.toHaveProperty('isDefault')
    expect(application).not.toHaveProperty('enterpriseId')
    expect(application).not.toHaveProperty('enterpriseShortName')
  })

  it('preserves existing lowercase metadata aliases when canonical fields are empty or null', async () => {
    const http = new ApplicationFixtureHttpClient({
      Code: 200,
      Result: {Items: [{rowid: 'APP-3', AppName: '', appName: 'beta', AppDesc: null, appDesc: 'Beta'}]},
    })

    const [application] = await new LowcodeApi({http}).platform.listApplications()

    expect(application).toMatchObject({id: 'APP-3', code: 'beta', name: 'Beta', description: 'Beta'})
  })

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

})
